require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./clanner.db', (err) => {
  if (err) console.error(err.message);
  console.log('Connected to SQLite database.');
});

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    avatar TEXT,
    coins INTEGER DEFAULT 100,
    gems INTEGER DEFAULT 10,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS shop_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    currency TEXT DEFAULT 'coins',
    type TEXT,
    image TEXT,
    available INTEGER DEFAULT 1
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER,
    item_id INTEGER,
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id),
    FOREIGN KEY (item_id) REFERENCES shop_items (id)
  )
`);

// Insert default shop items
db.run(`
  INSERT OR IGNORE INTO shop_items (id, name, description, price, currency, type, image) VALUES
    (1, 'Золотий аватар', 'Рамка золотого кольору для аватара', 500, 'coins', 'avatar_frame', '🟡'),
    (2, 'Діамантовий аватар', 'Рамка діамантового кольору', 50, 'gems', 'avatar_frame', '💎'),
    (3, 'Подвійні монети', '2x монет за 24 години', 300, 'coins', 'boost', '⚡'),
    (4, 'VIP статус', 'VIP статус на тиждень', 100, 'gems', 'status', '👑'),
    (5, 'Захист від програшу', 'Захист на одну гру', 200, 'coins', 'protection', '🛡️')
`);

// Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Bot commands
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  const telegramId = msg.from.id;
  
  // Get user photos
  let avatar = null;
  try {
    const photos = await bot.getUserProfilePhotos(telegramId, { limit: 1 });
    if (photos.total_count > 0) {
      const fileId = photos.photos[0][0].file_id;
      const file = await bot.getFile(fileId);
      avatar = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    }
  } catch (error) {
    console.error('Error getting profile photo:', error);
  }

  // Register or update user
  db.run(
    `INSERT INTO users (telegram_id, username, avatar) 
     VALUES (?, ?, ?) 
     ON CONFLICT(telegram_id) 
     DO UPDATE SET username = ?, avatar = ?, last_active = CURRENT_TIMESTAMP`,
    [telegramId, username, avatar, username, avatar],
    (err) => {
      if (err) console.error(err);
    }
  );

  bot.sendMessage(
    chatId,
    `🎮 Вітаємо в Clanner!\n\n` +
    `Ваш профіль створено!\n` +
    `👤 Нікнейм: ${username}\n\n` +
    `Відвідайте наш сайт для доступу до:\n` +
    `🎯 Міні-ігор\n` +
    `🛒 Магазину\n` +
    `📊 Статистики\n` +
    `💬 Онлайн чату\n\n` +
    `Команди:\n` +
    `/profile - Переглянути профіль\n` +
    `/balance - Показати баланс\n` +
    `/shop - Відкрити магазин`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 Відкрити сайт', url: 'YOUR_RENDER_URL_HERE' }]
        ]
      }
    }
  );

  // Notify all connected clients
  io.emit('userJoined', { username, telegramId, avatar });
});

bot.onText(/\/profile/, (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  db.get(
    'SELECT * FROM users WHERE telegram_id = ?',
    [telegramId],
    (err, user) => {
      if (err || !user) {
        bot.sendMessage(chatId, 'Спочатку використайте /start');
        return;
      }

      const winRate = user.wins + user.losses > 0 
        ? ((user.wins / (user.wins + user.losses)) * 100).toFixed(1) 
        : 0;

      bot.sendMessage(
        chatId,
        `👤 Ваш профіль\n\n` +
        `🏷️ Нікнейм: ${user.username}\n` +
        `⭐ Рівень: ${user.level}\n` +
        `📈 Досвід: ${user.xp} XP\n` +
        `🪙 Монети: ${user.coins}\n` +
        `💎 Коштовності: ${user.gems}\n\n` +
        `🎮 Статистика:\n` +
        `✅ Перемоги: ${user.wins}\n` +
        `❌ Програші: ${user.losses}\n` +
        `📊 Win Rate: ${winRate}%`
      );
    }
  );
});

bot.onText(/\/balance/, (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  db.get(
    'SELECT coins, gems FROM users WHERE telegram_id = ?',
    [telegramId],
    (err, user) => {
      if (err || !user) {
        bot.sendMessage(chatId, 'Спочатку використайте /start');
        return;
      }

      bot.sendMessage(
        chatId,
        `💰 Ваш баланс\n\n🪙 Монети: ${user.coins}\n💎 Коштовності: ${user.gems}`
      );
    }
  );
});

bot.onText(/\/shop/, (msg) => {
  const chatId = msg.chat.id;

  db.all('SELECT * FROM shop_items WHERE available = 1', [], (err, items) => {
    if (err || !items || items.length === 0) {
      bot.sendMessage(chatId, 'Магазин тимчасово недоступний');
      return;
    }

    let message = '🛒 Магазин\n\n';
    items.forEach((item) => {
      const currency = item.currency === 'coins' ? '🪙' : '💎';
      message += `${item.image} ${item.name}\n${item.description}\nЦіна: ${item.price} ${currency}\n\n`;
    });

    bot.sendMessage(chatId, message);
  });
});

// API Endpoints
app.get('/api/user/:telegramId', (req, res) => {
  const { telegramId } = req.params;
  
  db.get(
    'SELECT * FROM users WHERE telegram_id = ?',
    [telegramId],
    (err, user) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    }
  );
});

app.get('/api/leaderboard', (req, res) => {
  db.all(
    'SELECT username, level, xp, wins, losses, coins FROM users ORDER BY level DESC, xp DESC LIMIT 10',
    [],
    (err, users) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(users);
    }
  );
});

app.get('/api/shop', (req, res) => {
  db.all(
    'SELECT * FROM shop_items WHERE available = 1',
    [],
    (err, items) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(items);
    }
  );
});

app.post('/api/purchase', (req, res) => {
  const { telegramId, itemId } = req.body;

  db.get('SELECT * FROM shop_items WHERE id = ?', [itemId], (err, item) => {
    if (err || !item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, user) => {
      if (err || !user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const currency = item.currency === 'coins' ? user.coins : user.gems;
      if (currency < item.price) {
        res.status(400).json({ error: 'Insufficient funds' });
        return;
      }

      const newBalance = currency - item.price;
      const updateField = item.currency === 'coins' ? 'coins' : 'gems';

      db.run(
        `UPDATE users SET ${updateField} = ? WHERE telegram_id = ?`,
        [newBalance, telegramId],
        (err) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }

          db.run(
            'INSERT INTO user_inventory (telegram_id, item_id) VALUES (?, ?)',
            [telegramId, itemId],
            (err) => {
              if (err) {
                res.status(500).json({ error: err.message });
                return;
              }

              res.json({ success: true, newBalance });
            }
          );
        }
      );
    });
  });
});

app.post('/api/game/result', (req, res) => {
  const { telegramId, won, coinsEarned, xpEarned } = req.body;

  db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, user) => {
    if (err || !user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const newCoins = user.coins + (coinsEarned || 0);
    const newXp = user.xp + (xpEarned || 0);
    const newLevel = Math.floor(newXp / 100) + 1;
    const newWins = won ? user.wins + 1 : user.wins;
    const newLosses = won ? user.losses : user.losses + 1;

    db.run(
      `UPDATE users SET coins = ?, xp = ?, level = ?, wins = ?, losses = ? WHERE telegram_id = ?`,
      [newCoins, newXp, newLevel, newWins, newLosses, telegramId],
      (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        res.json({ 
          success: true, 
          newCoins, 
          newXp, 
          newLevel,
          leveledUp: newLevel > user.level
        });
      }
    );
  });
});

// Socket.IO for real-time features
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('userOnline', (data) => {
    socket.telegramId = data.telegramId;
    socket.username = data.username;
    
    db.run(
      'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE telegram_id = ?',
      [data.telegramId]
    );

    io.emit('onlineUsers', { action: 'join', username: data.username });
  });

  socket.on('chatMessage', (data) => {
    io.emit('chatMessage', {
      username: socket.username,
      message: data.message,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      io.emit('onlineUsers', { action: 'leave', username: socket.username });
    }
    console.log('User disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🤖 Telegram Bot: @${process.env.TELEGRAM_BOT_USERNAME}`);
});
