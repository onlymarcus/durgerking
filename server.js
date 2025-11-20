/******************************************************
 * SERVER.JS — Versão otimizada, segura e compatível
 * ----------------------------------------------------
 * Inclui:
 * - Helmet + Rate Limit + CORS
 * - AdminAuth via Authorization: Bearer TOKEN
 * - Validação de produtos no servidor
 * - Recalculo total no backend (anti-fraude)
 * - Transações seguras
 * - Notificação ao admin
 * - Webhook do Telegram funcionando
 * - Public/ para servir o WebApp
 ******************************************************/

require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const cors = require('cors');

const { pool } = require('./db');   
const { bot, setWebhookIfNotSet } = require('./bot');
const { webhookCallback } = require("grammy");

const app = express();
const PORT = process.env.PORT || 3000;

/* =====================================
   SECURITY MIDDLEWARES
===================================== */
app.use(helmet());
app.use(cors({ origin: process.env.WEBAPP_URL, credentials: true }));

app.use(rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 500,                 // suficiente para WebApp
  message: { error: "too_many_requests" }
}));

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

/* =====================================
   STATIC FILES (WEBAPP)
===================================== */
app.use(express.static(path.join(__dirname, 'public')));

/* =====================================
   TEST DB
===================================== */
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 + 1 AS sum");
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.json({ error: e.message });
  }
});

/* =====================================
   ADMIN AUTH (NOVO)
===================================== */
function adminAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = auth.substring(7);
  if (token !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

/* =====================================
   BOT WEBHOOK
===================================== */
app.use("/bot", webhookCallback(bot, "express"));

/* =====================================
   API — LISTAGEM DE CATEGORIAS
===================================== */
app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM categories WHERE active = TRUE ORDER BY position ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

/* =====================================
   API — LISTAGEM DE PRODUTOS
===================================== */
app.get('/api/products', async (req, res) => {
  const establishment = req.query.establishment_id || 1;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM products WHERE active = TRUE AND establishment_id = ? ORDER BY id DESC",
      [establishment]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

/* =====================================
   API — CRIAR PEDIDO (VALIDAÇÃO TOTAL)
===================================== */
app.post('/api/order', async (req, res) => {
  const { establishment_id = 1, items, telegram_user, customer } = req.body;

  if (!items || !items.length)
    return res.status(400).json({ error: 'empty_order' });

  // IDs
  const productIds = items.map(i => Number(i.product_id)).filter(Boolean);
  if (!productIds.length)
    return res.status(400).json({ error: 'invalid_items' });

  const conn = await pool.getConnection();
  try {
    /* 1) Busca os produtos no banco */
    const [dbProducts] = await conn.query(
      `SELECT id, name, price_cents, active 
       FROM products 
       WHERE id IN (?) AND establishment_id = ?`,
      [productIds, establishment_id]
    );

    const byId = Object.fromEntries(dbProducts.map(p => [p.id, p]));

    /* 2) Recalcula o total no servidor */
    let serverTotal = 0;
    for (const it of items) {
      const pid = Number(it.product_id);
      const dbp = byId[pid];

      if (!dbp || !dbp.active) {
        return res.status(400).json({ 
          error: 'product_unavailable', 
          product_id: pid 
        });
      }

      const qty = Number(it.qty) || 1;
      serverTotal += dbp.price_cents * qty;
    }

    /* 3) Transação */
    await conn.beginTransaction();

    const [orderRes] = await conn.query(
      `INSERT INTO orders (
        establishment_id, telegram_user_id, customer_name, 
        customer_phone, customer_address, total_cents
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        establishment_id,
        telegram_user?.id || null,
        customer?.name || null,
        customer?.phone || null,
        customer?.address || null,
        serverTotal
      ]
    );

    const orderId = orderRes.insertId;

    const insertItems = items.map(it => {
      const pid = Number(it.product_id);
      const dbp = byId[pid];
      const qty = Number(it.qty) || 1;
      return conn.query(
        `INSERT INTO order_items (order_id, product_id, name, qty, price_cents)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, pid, dbp.name, qty, dbp.price_cents]
      );
    });

    await Promise.all(insertItems);
    await conn.commit();

    /* 4) Notificar o administrador */
    if (process.env.ADMIN_CHAT_ID) {
      const itemsText = items.map(i => {
        const pid = Number(i.product_id);
        const p = byId[pid];
        const qty = Number(i.qty) || 1;
        return `• ${qty}x ${p.name} — R$ ${((p.price_cents * qty) / 100).toFixed(2)}`;
      }).join("\n");

      await bot.api.sendMessage(
        process.env.ADMIN_CHAT_ID,
        `🍔 *NOVO PEDIDO #${orderId}*\n\n` +
        `👤 *Cliente:* ${customer?.name || "Não informado"}\n` +
        `📞 *Telefone:* ${customer?.phone || "Não informado"}\n` +
        `📍 *Endereço:* ${customer?.address || "Retirada"}\n\n` +
        `🛒 *Itens:*\n${itemsText}\n\n` +
        `💰 *Total:* R$ ${(serverTotal / 100).toFixed(2)}`,
        { parse_mode: "Markdown" }
      );
    }

    res.json({ ok: true, order_id: orderId });

  } catch (err) {
    console.error("order error", err);
    try { await conn.rollback(); } catch(e){}
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});

/* =====================================
   ADMIN — CRUD CATEGORIAS
===================================== */
app.post('/admin/categories', adminAuth, async (req, res) => {
  const { establishment_id, name, position } = req.body;

  try {
    const [r] = await pool.query(
      `INSERT INTO categories (establishment_id, name, position)
       VALUES (?,?,?)`,
      [establishment_id, name, position || 0]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/admin/categories/:id/delete', adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM categories WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error' });
  }
});

/* =====================================
   ADMIN — CRUD PRODUTOS
===================================== */
app.post('/admin/products', adminAuth, async (req, res) => {
  const { establishment_id, category_id, name, description, price_cents, image_url } = req.body;

  try {
    const [r] = await pool.query(
      `INSERT INTO products 
       (establishment_id, category_id, name, description, price_cents, image_url)
       VALUES (?,?,?,?,?,?)`,
      [establishment_id, category_id, name, description, price_cents, image_url]
    );

    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/admin/products/:id/delete', adminAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'db_error' });
  }
});

/* =====================================
   ADMIN — ATUALIZAR STATUS DO PEDIDO
===================================== */
app.post('/admin/order/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body;

  try {
    await pool.query(
      "UPDATE orders SET status=?, updated_at=NOW() WHERE id=?",
      [status, req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'db_error' });
  }
});

/* =====================================
   START SERVER
===================================== */
app.listen(PORT, async () => {
  console.log(`API rodando na porta ${PORT}`);
  await setWebhookIfNotSet();
});
