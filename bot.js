require('dotenv').config();
const { Bot } = require('grammy');

const bot = new Bot(process.env.BOT_TOKEN);

// Comando /start
bot.command("start", ctx => {
  ctx.reply("Cardápio:", {
    reply_markup: {
      inline_keyboard: [[
        { text: "Abrir", web_app: { url: process.env.WEBAPP_URL } }
      ]]
    }
  });
});

// Função para setar o webhook
async function setWebhookIfNotSet() {
  if (!process.env.WEBAPP_HOST) return;

  const webhookUrl = process.env.WEBAPP_HOST.replace(/\/$/, "") + "/bot";

  try {
    await bot.api.setWebhook(webhookUrl);
    console.log("Webhook set:", webhookUrl);
  } catch (e) {
    console.log("Erro ao setar webhook:", e.message);
  }
}

module.exports = { bot, setWebhookIfNotSet };
