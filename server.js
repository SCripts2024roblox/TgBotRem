require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const { WebSocketServer } = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const bot = new TelegramBot(process.env.BOT_TOKEN);
const url = process.env.RENDER_EXTERNAL_URL;

// ===== Webhook =====
bot.setWebHook(`${url}/bot${process.env.BOT_TOKEN}`);

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ===== Дані =====
let users = {};
let waiting = {};
let onlineWeb = 0;

// ===== Реєстрація =====
bot.onText(/\/start/, (msg) => {
    waiting[msg.from.id] = true;
    bot.sendMessage(msg.chat.id, "👋 Введіть свій нік для сайту:");
});

bot.on("message", (msg) => {
    if (!waiting[msg.from.id]) return;
    if (!msg.text || msg.text.startsWith("/")) return;

    if (users[msg.from.id]) {
        bot.sendMessage(msg.chat.id, "⚠️ Ви вже зареєстровані.");
        waiting[msg.from.id] = false;
        return;
    }

    users[msg.from.id] = {
        tgId: msg.from.id,
        nickname: msg.text,
        username: msg.from.username,
        balance: 100
    };

    waiting[msg.from.id] = false;
    bot.sendMessage(msg.chat.id, "✅ Реєстрація завершена!");
});

// ===== API =====
app.get("/api/stats", (req, res) => {
    res.json({
        total: Object.keys(users).length,
        online: onlineWeb
    });
});

// ===== WebSocket Online =====
const server = app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
    onlineWeb++;
    broadcast();

    ws.on("close", () => {
        onlineWeb--;
        broadcast();
    });
});

function broadcast() {
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify({ online: onlineWeb }));
        }
    });
}
