require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

let users = {};
let onlineUsers = 0;

// Коли користувач пише /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, "👋 Введіть свій нік для сайту:");

    bot.once("message", (response) => {
        if (response.text.startsWith("/")) return;

        const nickname = response.text;
        const userId = response.from.id;
        const avatar = `https://t.me/i/userpic/320/${response.from.username}.jpg`;

        users[userId] = {
            id: userId,
            nickname: nickname,
            username: response.from.username,
            avatar: avatar,
            online: true,
            gamesPlayed: 0,
            balance: 100
        };

        onlineUsers++;
        bot.sendMessage(chatId, "✅ Ви зареєстровані на сайті!");
    });
});

// API для сайту
app.get("/api/users", (req, res) => {
    res.json({
        totalUsers: Object.keys(users).length,
        online: onlineUsers,
        users: users
    });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
