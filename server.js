/******************************************************
 * SERVER.JS — Versão SAAS (Com Friendly ID)
 * ----------------------------------------------------
 * Agora calcula o pedido #1, #2 para cada loja separadamente
 ******************************************************/

require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Bot } = require('grammy'); 

const { pool } = require('./db');   

const app = express();
const PORT = process.env.PORT || 3000;

/* =====================================
   SECURITY MIDDLEWARES
===================================== */
app.use(helmet());
app.use(cors({ origin: "*", credentials: true }));

app.use(rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 1000,
  message: { error: "too_many_requests" }
}));

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

/* =====================================
   STATIC FILES
===================================== */
app.use(express.static(path.join(__dirname, 'public')));

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
   API — CRIAR PEDIDO (SAAS + FRIENDLY ID)
===================================== */
app.post('/api/order', async (req, res) => {
  const { establishment_id, items, telegram_user, customer } = req.body;
  const lojaId = establishment_id || 1;

  if (!items || !items.length) return res.status(400).json({ error: 'empty_order' });

  const productIds = items.map(i => Number(i.product_id)).filter(Boolean);
  if (!productIds.length) return res.status(400).json({ error: 'invalid_items' });

  const conn = await pool.getConnection();
  try {
    /* 1) Busca CONFIG da Loja */
    const [storeConfig] = await conn.query(
        "SELECT bot_token, owner_telegram_id, name FROM establishments WHERE id = ?", 
        [lojaId]
    );

    if (storeConfig.length === 0) {
        return res.status(404).json({ error: 'store_not_found' });
    }
    const store = storeConfig[0];

    /* 2) Valida Produtos */
    const [dbProducts] = await conn.query(
      `SELECT id, name, price_cents, active 
       FROM products 
       WHERE id IN (?) AND establishment_id = ?`,
      [productIds, lojaId]
    );

    const byId = Object.fromEntries(dbProducts.map(p => [p.id, p]));

    let serverTotal = 0;
    for (const it of items) {
      const pid = Number(it.product_id);
      const dbp = byId[pid];

      if (!dbp || !dbp.active) {
        return res.status(400).json({ error: 'product_unavailable', product_id: pid });
      }
      const qty = Number(it.qty) || 1;
      serverTotal += dbp.price_cents * qty;
    }

    /* 2.5) CALCULA O ID AMIGÁVEL DA LOJA */
    // Busca o maior friendly_id DESTA loja e soma 1. Se não tiver nenhum, começa do 1.
    const [maxIdResult] = await conn.query(
        "SELECT MAX(friendly_id) as maxId FROM orders WHERE establishment_id = ?",
        [lojaId]
    );
    const currentMax = maxIdResult[0].maxId || 0;
    const nextFriendlyId = currentMax + 1;


    /* 3) Salva no Banco */
    await conn.beginTransaction();

    const [orderRes] = await conn.query(
      `INSERT INTO orders (
        establishment_id, telegram_user_id, customer_name, 
        customer_phone, customer_address, total_cents, 
        friendly_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        lojaId,
        telegram_user?.id || null,
        customer?.name || null,
        customer?.phone || null,
        customer?.address || null,
        serverTotal,
        nextFriendlyId // <--- Salvamos o ID sequencial aqui
      ]
    );

    const globalOrderId = orderRes.insertId; // ID Global (ex: 27)

    const insertItems = items.map(it => {
      const pid = Number(it.product_id);
      const dbp = byId[pid];
      const qty = Number(it.qty) || 1;
      return conn.query(
        `INSERT INTO order_items (order_id, product_id, name, qty, price_cents)
         VALUES (?, ?, ?, ?, ?)`,
        [globalOrderId, pid, dbp.name, qty, dbp.price_cents]
      );
    });

    await Promise.all(insertItems);
    await conn.commit();

    /* 4) NOTIFICAÇÃO SAAS */
    if (store.bot_token && store.owner_telegram_id) {
        try {
            const tempBot = new Bot(store.bot_token);

            const itemsText = items.map(i => {
                const pid = Number(i.product_id);
                const p = byId[pid];
                const qty = Number(i.qty) || 1;
                return `• ${qty}x ${p.name}`;
            }).join("\n");

            // MUDANÇA AQUI: Usamos nextFriendlyId no título
            const msg = `🔔 *NOVO PEDIDO #${nextFriendlyId}*\n` +
                        `🏠 *Loja:* ${store.name}\n\n` +
                        `👤 *Cliente:* ${customer?.name || "Anônimo"}\n` +
                        `📞 *Tel:* ${customer?.phone || "-"}\n` +
                        `📍 *End:* ${customer?.address || "Retirada"}\n` +
                        `📝 *Obs:* ${customer?.note || "-"}\n\n` +
                        `🛒 *Itens:*\n${itemsText}\n\n` +
                        `💰 *Total:* R$ ${(serverTotal / 100).toFixed(2)}`;

            await tempBot.api.sendMessage(store.owner_telegram_id, msg, { parse_mode: "Markdown" });
            console.log(`Pedido Global #${globalOrderId} (Loja #${nextFriendlyId}) notificado.`);
        } catch (botError) {
            console.error(`Erro Telegram loja ${lojaId}:`, botError.message);
        }
    }

    // Retornamos os dois IDs caso o front precise
    res.json({ ok: true, order_id: nextFriendlyId, global_id: globalOrderId });

  } catch (err) {
    console.error("order error", err);
    try { await conn.rollback(); } catch(e){}
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});

/* =====================================
   START SERVER
===================================== */
app.listen(PORT, async () => {
  console.log(`API SAAS rodando na porta ${PORT}`);
});