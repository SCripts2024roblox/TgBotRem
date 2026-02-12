require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const WebSocket = require("ws");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  console.log("❌ BOT_TOKEN not found in .env");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

let visits = 0;
let chats = {};
let botInfo = null;

bot.getMe().then(info => {
  botInfo = info;
  console.log("Bot connected:", info.username);
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
    text: msg.text || "[non-text message]",
    date: new Date()
  });

  broadcast();
});

app.get("/api/info", (req, res) => {
  visits++;
  res.json({
    visits,
    bot: botInfo,
    chats
  });
});

app.post("/api/send", async (req, res) => {
  try {
    const { chatId, text } = req.body;

    await bot.sendMessage(chatId, text);

    chats[chatId].messages.push({
      from: "bot",
      text,
      date: new Date()
    });

    broadcast();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

function broadcast() {
  const data = JSON.stringify({ chats });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
      }
