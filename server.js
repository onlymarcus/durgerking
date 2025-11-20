require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { pool } = require('./db');   // <<--- CONECTA NO MYSQL
const { bot, setWebhookIfNotSet } = require('./bot');
const { webhookCallback } = require("grammy");

const app = express();
const PORT = process.env.PORT || 3000;

/* =====================================
   teste db
===================================== */
app.get('/test-db', async (req, res) => {
  try {
    const { pool } = require('./db');
    const [rows] = await pool.query("SELECT 1 + 1 AS sum");
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.json({ error: e.message });
  }
});

/* =====================================
   MIDDLEWARES
===================================== */
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Se quiser servir arquivos estáticos no VPS:
app.use(express.static(path.join(__dirname, 'public')));

// Bot webhook
app.use("/bot", webhookCallback(bot, "express"));

/* =====================================
   MIDDLEWARE ADMIN (simples)
===================================== */
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

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
   API — CRIAR PEDIDO
===================================== */
app.post('/api/order', async (req, res) => {
  const { establishment_id, items, telegram_user, customer } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'empty_order' });
  }

  const total = items.reduce((sum, i) => sum + i.price_cents * i.qty, 0);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRes] = await conn.query(
      `INSERT INTO orders (
        establishment_id, telegram_user_id, customer_name, customer_phone, total_cents
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        establishment_id,
        telegram_user?.id || null,
        customer?.name || null,
        customer?.phone || null,
        total
      ]
    );

    const orderId = orderRes.insertId;

    for (const item of items) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, name, qty, price_cents)
         VALUES (?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.name,
          item.qty,
          item.price_cents
        ]
      );
    }

    await conn.commit();

    // Notificar dono
    if (process.env.ADMIN_CHAT_ID) {
      const itemsText = items
        .map(i => `• ${i.qty}x ${i.name} — R$ ${(i.price_cents * i.qty / 100).toFixed(2)}`)
        .join("\n");

      await bot.api.sendMessage(
        process.env.ADMIN_CHAT_ID,
        `🍔 *NOVO PEDIDO #${orderId}*\n\n` +
        `👤 *Cliente:* ${customer?.name || "Não informado"}\n` +
        `📞 *Telefone:* ${customer?.phone || "Não informado"}\n` +
        `📍 *Endereço:* ${customer?.address || "Retirada no local"}\n\n` +
        `🛒 *Itens:*\n${itemsText}\n\n` +
        `💰 *Total:* R$ ${(total/100).toFixed(2)}`,
        { parse_mode: "Markdown" }
      );
    }


    res.json({ ok: true, order_id: orderId });

  } catch (err) {
    console.error(err);
    await conn.rollback();
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});


/* =====================================
   ADMIN — CRUD DE CATEGORIAS
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
   ADMIN — CRUD DE PRODUTOS
===================================== */
app.post('/admin/products', adminAuth, async (req, res) => {
  const { establishment_id, category_id, name, description, price_cents, image_url } = req.body;

  try {
    const [r] = await pool.query(
      `INSERT INTO products (establishment_id, category_id, name, description, price_cents, image_url)
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
   ADMIN — ATUALIZAR STATUS DE PEDIDO
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
