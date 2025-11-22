/******************************************************
 * SERVER.JS — Versão FINAL (SAAS + Friendly ID + Admin)
 * ----------------------------------------------------
 * Inclui:
 * 1. Múltiplas lojas (SAAS)
 * 2. IDs amigáveis por loja (#1, #2...)
 * 3. API do Painel Admin (Listar e Atualizar)
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
app.use(helmet({
  contentSecurityPolicy: false,
}));
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
        nextFriendlyId 
      ]
    );

    const globalOrderId = orderRes.insertId; 

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

    /* 4) NOTIFICA O DONO */
    if (store.bot_token && store.owner_telegram_id) {
        try {
            const tempBot = new Bot(store.bot_token);
            const itemsText = items.map(i => {
                const pid = Number(i.product_id);
                const p = byId[pid];
                const qty = Number(i.qty) || 1;
                return `• ${qty}x ${p.name}`;
            }).join("\n");

            const msg = `🔔 *NOVO PEDIDO #${nextFriendlyId}*\n` +
                        `🏠 *Loja:* ${store.name}\n\n` +
                        `👤 *Cliente:* ${customer?.name || "Anônimo"}\n` +
                        `📞 *Tel:* ${customer?.phone || "-"}\n` +
                        `📍 *End:* ${customer?.address || "Retirada"}\n` +
                        `📝 *Obs:* ${customer?.note || "-"}\n\n` +
                        `🛒 *Itens:*\n${itemsText}\n\n` +
                        `💰 *Total:* R$ ${(serverTotal / 100).toFixed(2)}`;

            await tempBot.api.sendMessage(store.owner_telegram_id, msg, { parse_mode: "Markdown" });
        } catch (botError) {
            console.error(`Erro Telegram loja ${lojaId}:`, botError.message);
        }
    }

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
   ADMIN API — LISTAR PEDIDOS DA LOJA
   (Usado pelo Painel admin.html)
===================================== */
app.get('/api/admin/orders/:establishment_id', async (req, res) => {
    const { establishment_id } = req.params;
  
    try {
      const [orders] = await pool.query(
        `SELECT id, friendly_id, customer_name, customer_phone, customer_address, 
                total_cents, status, tracking_url, created_at 
         FROM orders 
         WHERE establishment_id = ? 
         ORDER BY id DESC LIMIT 50`,
        [establishment_id]
      );
  
      // Busca itens
      const ordersWithItems = await Promise.all(orders.map(async (order) => {
          const [items] = await pool.query(
              "SELECT name, qty FROM order_items WHERE order_id = ?",
              [order.id]
          );
          return { ...order, items };
      }));
  
      res.json(ordersWithItems);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server_error' });
    }
});

/* =====================================
   ADMIN API — ATUALIZAR STATUS + RASTREIO
   (Usado pelo Painel admin.html)
===================================== */
app.post('/api/admin/update-order', async (req, res) => {
    const { order_id, status, tracking_url } = req.body;
  
    if (!order_id || !status) return res.status(400).json({ error: 'missing_data' });
  
    const conn = await pool.getConnection();
    try {
      // 1. Busca dados do pedido e da loja
      const [orders] = await conn.query(
          `SELECT o.*, e.bot_token 
           FROM orders o
           JOIN establishments e ON o.establishment_id = e.id
           WHERE o.id = ?`, 
          [order_id]
      );
  
      if (orders.length === 0) return res.status(404).json({ error: 'order_not_found' });
      const order = orders[0];
  
      // 2. Atualiza no Banco
      await conn.query(
          "UPDATE orders SET status = ?, tracking_url = ? WHERE id = ?",
          [status, tracking_url || null, order_id]
      );
  
      // 3. NOTIFICA O CLIENTE
      if (order.telegram_user_id && order.bot_token) {
          try {
              const tempBot = new Bot(order.bot_token);
              let msg = "";
              // Usamos friendly_id para o cliente não estranhar o número
              const numPedido = order.friendly_id || order.id;
  
              if (status === 'preparing') {
                  msg = `👨‍🍳 *Pedido #${numPedido} em preparação!* \nSua comida já está sendo feita.`;
              } 
              else if (status === 'delivering') {
                  msg = `🛵 *Pedido #${numPedido} SAIU PARA ENTREGA!*`;
                  if (tracking_url) {
                      msg += `\n\n📍 *Rastreie aqui:* ${tracking_url}`;
                  }
              }
              else if (status === 'canceled') {
                  msg = `❌ *Pedido #${numPedido} foi cancelado* pelo estabelecimento.`;
              }
  
              if (msg) {
                  await tempBot.api.sendMessage(order.telegram_user_id, msg, { parse_mode: "Markdown" });
              }
          } catch (e) {
              console.error("Erro ao notificar cliente:", e.message);
          }
      }
  
      res.json({ ok: true });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server_error' });
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