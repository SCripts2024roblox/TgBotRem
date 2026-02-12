require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

let users = {};
let waitingForNickname = {};
let onlineUsers = 0;

// /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    waitingForNickname[userId] = true;

    bot.sendMessage(chatId, "👋 Введіть свій нік для сайту:");
});

// Ловимо всі повідомлення
bot.on("message", (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;

    if (!waitingForNickname[userId]) return;
    if (msg.text.startsWith("/")) return;

    const nickname = msg.text;

    users[userId] = {
        id: userId,
        nickname: nickname,
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

    bot.sendMessage(chatId, "✅ Ви успішно зареєстровані!");
});
