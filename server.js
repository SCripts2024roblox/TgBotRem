require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.log("❌ BOT_TOKEN missing");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN);
let chats = {};
let visits = 0;
let botInfo = null;

async function init() {
  botInfo = await bot.getMe();

  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;
    await bot.setWebHook(url);
    console.log("✅ Webhook set:", url);
  }
}
init();

app.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (!chats[chatId]) {
    chats[chatId] = {
      id: chatId,
      title: msg.chat.username || msg.chat.title || msg.chat.first_name,
      messages: []
    };
  }

  chats[chatId].messages.push({
    from: "user",
    text: msg.text || "[media]",
    date: new Date()
  });
});

app.get("/api/data", (req, res) => {
  visits++;
  res.json({
    visits,
    bot: botInfo,
    chats
  });
});

app.post("/api/send", async (req, res) => {
  const { chatId, text } = req.body;

  await bot.sendMessage(chatId, text);

  chats[chatId].messages.push({
    from: "bot",
    text,
    date: new Date()
  });

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("🚀 Server running");
});
