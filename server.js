require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const bot = new TelegramBot(process.env.BOT_TOKEN);

// ===== Дані =====
let users = {};
let waitingForNickname = {};
let onlineUsers = 0;

// ===== Webhook Setup =====
const url = process.env.RENDER_EXTERNAL_URL;

bot.setWebHook(`${url}/bot${process.env.BOT_TOKEN}`);

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ===== Реєстрація =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    waitingForNickname[userId] = true;

    bot.sendMessage(chatId, "👋 Введіть свій нік для сайту:");
});

bot.on("message", (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (!waitingForNickname[userId]) return;
    if (!msg.text || msg.text.startsWith("/")) return;

    users[userId] = {
        id: userId,
        nickname: msg.text,
        username: msg.from.username,
        avatar: msg.from.username
            ? `https://t.me/i/userpic/320/${msg.from.username}.jpg`
            : null,
        online: true,
        gamesPlayed: 0,
        balance: 100
    };

    waitingForNickname[userId] = false;
    onlineUsers++;

    bot.sendMessage(chatId, "✅ Ви успішно зареєстровані на сайті!");
});

// ===== API =====
app.get("/api/users", (req, res) => {
    res.json({
        totalUsers: Object.keys(users).length,
        online: onlineUsers,
        users: users
    });
});

// ===== Static =====
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
