// Initialize Socket.IO
const socket = io();

// Global variables
let currentUser = null;
let onlineUsers = 0;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    checkUserSession();
    loadLeaderboard();
    loadShop();
    setupSocketListeners();
    setupChatInput();
});

// Navigation
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            switchPage(page);
            
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function switchPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    const targetPage = document.getElementById(pageName);
    if (targetPage) {
        targetPage.classList.add('active');
        
        // Reload data when switching to certain pages
        if (pageName === 'leaderboard') loadLeaderboard();
        if (pageName === 'shop') loadShop();
    }
}

// User Connection
function checkUserSession() {
    const savedUserId = localStorage.getItem('telegram_id');
    if (savedUserId) {
        connectUser(savedUserId);
    }
}

async function connectUser(telegramId) {
    if (!telegramId) {
        telegramId = document.getElementById('telegramIdInput').value.trim();
    }
    
    if (!telegramId) {
        showNotification('Будь ласка, введіть Telegram ID', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/user/${telegramId}`);
        
        if (!response.ok) {
            throw new Error('Користувача не знайдено');
        }

        const user = await response.json();
        currentUser = user;
        
        // Save to localStorage
        localStorage.setItem('telegram_id', telegramId);
        
        // Update UI
        updateUserUI(user);
        
        // Connect to socket
        socket.emit('userOnline', {
            telegramId: user.telegram_id,
            username: user.username
        });
        
        showNotification(`Вітаємо, ${user.username}!`, 'success');
    } catch (error) {
        showNotification(error.message || 'Помилка підключення. Спочатку зв\'яжіться з ботом @Clanner_bot', 'error');
    }
}

function updateUserUI(user) {
    // Hide connect section
    document.getElementById('telegramConnect').style.display = 'none';
    
    // Show stats
    document.getElementById('statsGrid').style.display = 'grid';
    
    // Update stats
    document.getElementById('userLevel').textContent = user.level;
    document.getElementById('userCoins').textContent = user.coins;
    document.getElementById('userGems').textContent = user.gems;
    
    const winRate = user.wins + user.losses > 0 
        ? ((user.wins / (user.wins + user.losses)) * 100).toFixed(1) 
        : 0;
    document.getElementById('userWinRate').textContent = `${winRate}%`;
    
    // Update header
    const userInfo = document.getElementById('userInfo');
    userInfo.innerHTML = `
        <div class="user-profile">
            ${user.avatar ? `<img src="${user.avatar}" alt="${user.username}" class="user-avatar">` : ''}
            <div class="user-details">
                <div class="user-name">${user.username}</div>
                <div class="user-stats">
                    <span>⭐ ${user.level}</span>
                    <span>🪙 ${user.coins}</span>
                    <span>💎 ${user.gems}</span>
                </div>
            </div>
        </div>
    `;
}

// Leaderboard
async function loadLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    leaderboardList.innerHTML = '<div class="loading">Завантаження...</div>';

    try {
        const response = await fetch('/api/leaderboard');
        const users = await response.json();

        if (users.length === 0) {
            leaderboardList.innerHTML = '<div class="loading">Немає даних</div>';
            return;
        }

        leaderboardList.innerHTML = users.map((user, index) => {
            const rank = index + 1;
            let rankClass = '';
            if (rank === 1) rankClass = 'gold';
            else if (rank === 2) rankClass = 'silver';
            else if (rank === 3) rankClass = 'bronze';

            const winRate = user.wins + user.losses > 0 
                ? ((user.wins / (user.wins + user.losses)) * 100).toFixed(1) 
                : 0;

            return `
                <div class="leaderboard-item">
                    <div class="rank ${rankClass}">#${rank}</div>
                    <div class="player-info">
                        <div class="player-name">${user.username}</div>
                        <div class="player-stats">
                            <span>⭐ Lvl ${user.level}</span>
                            <span>📈 ${user.xp} XP</span>
                            <span>✅ ${user.wins}W</span>
                            <span>❌ ${user.losses}L</span>
                            <span>📊 ${winRate}%</span>
                        </div>
                    </div>
                    <div class="player-coins">🪙 ${user.coins}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        leaderboardList.innerHTML = '<div class="loading">Помилка завантаження</div>';
    }
}

// Shop
async function loadShop() {
    const shopGrid = document.getElementById('shopGrid');
    shopGrid.innerHTML = '<div class="loading">Завантаження...</div>';

    try {
        const response = await fetch('/api/shop');
        const items = await response.json();

        if (items.length === 0) {
            shopGrid.innerHTML = '<div class="loading">Магазин порожній</div>';
            return;
        }

        shopGrid.innerHTML = items.map(item => {
            const currency = item.currency === 'coins' ? '🪙' : '💎';
            const canAfford = currentUser && (
                (item.currency === 'coins' && currentUser.coins >= item.price) ||
                (item.currency === 'gems' && currentUser.gems >= item.price)
            );

            return `
                <div class="shop-item glass-panel">
                    <div class="item-icon">${item.image}</div>
                    <h3>${item.name}</h3>
                    <p>${item.description}</p>
                    <div class="item-price">${item.price} ${currency}</div>
                    <button 
                        class="btn-buy" 
                        onclick="purchaseItem(${item.id}, ${item.price}, '${item.currency}')"
                        ${!currentUser || !canAfford ? 'disabled' : ''}
                    >
                        ${!currentUser ? 'Увійдіть' : canAfford ? 'Купити' : 'Недостатньо коштів'}
                    </button>
                </div>
            `;
        }).join('');
    } catch (error) {
        shopGrid.innerHTML = '<div class="loading">Помилка завантаження</div>';
    }
}

async function purchaseItem(itemId, price, currency) {
    if (!currentUser) {
        showNotification('Спочатку увійдіть в акаунт', 'error');
        return;
    }

    const userCurrency = currency === 'coins' ? currentUser.coins : currentUser.gems;
    if (userCurrency < price) {
        showNotification('Недостатньо коштів', 'error');
        return;
    }

    try {
        const response = await fetch('/api/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegramId: currentUser.telegram_id,
                itemId: itemId
            })
        });

        if (!response.ok) {
            throw new Error('Помилка покупки');
        }

        const result = await response.json();
        
        // Update user balance
        if (currency === 'coins') {
            currentUser.coins = result.newBalance;
            document.getElementById('userCoins').textContent = result.newBalance;
        } else {
            currentUser.gems = result.newBalance;
            document.getElementById('userGems').textContent = result.newBalance;
        }

        showNotification('Предмет успішно куплено!', 'success');
        loadShop(); // Reload shop
    } catch (error) {
        showNotification(error.message || 'Помилка покупки', 'error');
    }
}

// Games
function startGame(gameType) {
    if (!currentUser) {
        showNotification('Спочатку увійдіть в акаунт', 'error');
        return;
    }

    const modal = document.getElementById('gameModal');
    const gameArea = document.getElementById('gameArea');
    
    modal.classList.add('active');
    
    switch (gameType) {
        case 'rps':
            initRockPaperScissors(gameArea);
            break;
        case 'number':
            initNumberGuess(gameArea);
            break;
        case 'memory':
            initMemoryGame(gameArea);
            break;
        case 'slots':
            initSlots(gameArea);
            break;
    }
}

function closeGame() {
    const modal = document.getElementById('gameModal');
    modal.classList.remove('active');
}

// Rock Paper Scissors Game
function initRockPaperScissors(container) {
    container.innerHTML = `
        <div style="text-align: center;">
            <h2 style="font-family: 'Orbitron', sans-serif; margin-bottom: 30px;">✊✋✌️ Камінь-Ножиці-Папір</h2>
            <div id="rpsResult" style="min-height: 100px; margin-bottom: 30px; font-size: 24px;"></div>
            <div style="display: flex; gap: 20px; justify-content: center;">
                <button class="btn-primary" onclick="playRPS('rock')" style="font-size: 48px; padding: 20px;">✊</button>
                <button class="btn-primary" onclick="playRPS('paper')" style="font-size: 48px; padding: 20px;">✋</button>
                <button class="btn-primary" onclick="playRPS('scissors')" style="font-size: 48px; padding: 20px;">✌️</button>
            </div>
        </div>
    `;
}

function playRPS(choice) {
    const choices = ['rock', 'paper', 'scissors'];
    const emojis = { rock: '✊', paper: '✋', scissors: '✌️' };
    const botChoice = choices[Math.floor(Math.random() * 3)];
    
    let result, won;
    if (choice === botChoice) {
        result = 'Нічия!';
        won = false;
    } else if (
        (choice === 'rock' && botChoice === 'scissors') ||
        (choice === 'paper' && botChoice === 'rock') ||
        (choice === 'scissors' && botChoice === 'paper')
    ) {
        result = 'Ви виграли! 🎉';
        won = true;
    } else {
        result = 'Ви програли 😔';
        won = false;
    }
    
    document.getElementById('rpsResult').innerHTML = `
        <div>Ви: ${emojis[choice]}</div>
        <div>Бот: ${emojis[botChoice]}</div>
        <div style="margin-top: 20px; font-weight: 700;">${result}</div>
    `;
    
    submitGameResult(won, won ? 10 : 0, won ? 5 : 0);
}

// Number Guess Game
function initNumberGuess(container) {
    const targetNumber = Math.floor(Math.random() * 10) + 1;
    let attempts = 0;
    
    container.innerHTML = `
        <div style="text-align: center;">
            <h2 style="font-family: 'Orbitron', sans-serif; margin-bottom: 30px;">🎲 Вгадай число</h2>
            <p style="margin-bottom: 30px; font-size: 18px;">Вгадайте число від 1 до 10</p>
            <div id="numberResult" style="min-height: 60px; margin-bottom: 20px;"></div>
            <input type="number" id="guessInput" min="1" max="10" class="glass-input" style="width: 200px; text-align: center; font-size: 24px; margin-bottom: 20px;" placeholder="?">
            <br>
            <button class="btn-primary" onclick="checkGuess(${targetNumber})">Перевірити</button>
        </div>
    `;
}

function checkGuess(target) {
    const guess = parseInt(document.getElementById('guessInput').value);
    const resultDiv = document.getElementById('numberResult');
    
    if (isNaN(guess) || guess < 1 || guess > 10) {
        resultDiv.innerHTML = '<div style="color: #ff6b6b;">Введіть число від 1 до 10</div>';
        return;
    }
    
    if (guess === target) {
        resultDiv.innerHTML = '<div style="color: #51cf66; font-size: 24px; font-weight: 700;">🎉 Вітаємо! Ви вгадали!</div>';
        submitGameResult(true, 20, 10);
        setTimeout(closeGame, 2000);
    } else {
        const hint = guess < target ? 'більше' : 'менше';
        resultDiv.innerHTML = `<div style="color: #ffd43b;">Спробуйте ${hint}</div>`;
    }
}

// Memory Game
function initMemoryGame(container) {
    const emojis = ['🎮', '🎯', '🎲', '🎰', '🎪', '🎨', '🎭', '🎬'];
    const cards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    let flipped = [];
    let matched = [];
    
    container.innerHTML = `
        <div style="text-align: center;">
            <h2 style="font-family: 'Orbitron', sans-serif; margin-bottom: 30px;">🧠 Гра пам'яті</h2>
            <div id="memoryGrid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; max-width: 400px; margin: 0 auto;"></div>
        </div>
    `;
    
    const grid = document.getElementById('memoryGrid');
    cards.forEach((emoji, index) => {
        const card = document.createElement('div');
        card.className = 'memory-card';
        card.style.cssText = 'width: 80px; height: 80px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 32px; cursor: pointer; transition: all 0.3s;';
        card.dataset.index = index;
        card.dataset.emoji = emoji;
        card.textContent = '❓';
        
        card.addEventListener('click', () => {
            if (flipped.length < 2 && !card.classList.contains('flipped')) {
                card.textContent = emoji;
                card.classList.add('flipped');
                card.style.background = 'rgba(255, 255, 255, 0.2)';
                flipped.push(card);
                
                if (flipped.length === 2) {
                    setTimeout(() => {
                        if (flipped[0].dataset.emoji === flipped[1].dataset.emoji) {
                            matched.push(...flipped);
                            if (matched.length === cards.length) {
                                setTimeout(() => {
                                    showNotification('Ви виграли! 🎉', 'success');
                                    submitGameResult(true, 30, 15);
                                    closeGame();
                                }, 500);
                            }
                        } else {
                            flipped.forEach(c => {
                                c.textContent = '❓';
                                c.style.background = 'rgba(255, 255, 255, 0.1)';
                                c.classList.remove('flipped');
                            });
                        }
                        flipped = [];
                    }, 1000);
                }
            }
        });
        
        grid.appendChild(card);
    });
}

// Slots Game
function initSlots(container) {
    const symbols = ['🍒', '🍋', '⭐', '💎', '7️⃣'];
    
    container.innerHTML = `
        <div style="text-align: center;">
            <h2 style="font-family: 'Orbitron', sans-serif; margin-bottom: 30px;">🎰 Слоти</h2>
            <div id="slotsDisplay" style="display: flex; gap: 20px; justify-content: center; margin-bottom: 30px; font-size: 64px;">
                <div>🎰</div>
                <div>🎰</div>
                <div>🎰</div>
            </div>
            <div id="slotsResult" style="min-height: 60px; margin-bottom: 20px; font-size: 20px;"></div>
            <button class="btn-primary" onclick="spinSlots()">Крутити (10 🪙)</button>
        </div>
    `;
}

function spinSlots() {
    if (currentUser.coins < 10) {
        showNotification('Недостатньо монет', 'error');
        return;
    }
    
    const symbols = ['🍒', '🍋', '⭐', '💎', '7️⃣'];
    const display = document.querySelectorAll('#slotsDisplay > div');
    const result = [];
    
    // Animation
    let spinCount = 0;
    const spinInterval = setInterval(() => {
        display.forEach(slot => {
            slot.textContent = symbols[Math.floor(Math.random() * symbols.length)];
        });
        
        spinCount++;
        if (spinCount >= 20) {
            clearInterval(spinInterval);
            
            // Final result
            display.forEach(slot => {
                const symbol = symbols[Math.floor(Math.random() * symbols.length)];
                slot.textContent = symbol;
                result.push(symbol);
            });
            
            // Check win
            const won = result[0] === result[1] && result[1] === result[2];
            const resultDiv = document.getElementById('slotsResult');
            
            if (won) {
                const winAmount = result[0] === '7️⃣' ? 1000 : 100;
                resultDiv.innerHTML = `<div style="color: #51cf66; font-weight: 700;">🎉 ДЖЕКПОТ! +${winAmount} 🪙</div>`;
                submitGameResult(true, winAmount - 10, 20);
            } else {
                resultDiv.innerHTML = '<div style="color: #ff6b6b;">Спробуйте ще раз</div>';
                submitGameResult(false, -10, 0);
            }
        }
    }, 100);
}

// Submit Game Result
async function submitGameResult(won, coinsEarned, xpEarned) {
    if (!currentUser) return;
    
    try {
        const response = await fetch('/api/game/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegramId: currentUser.telegram_id,
                won,
                coinsEarned,
                xpEarned
            })
        });

        if (response.ok) {
            const result = await response.json();
            
            currentUser.coins = result.newCoins;
            currentUser.xp = result.newXp;
            currentUser.level = result.newLevel;
            
            if (won) currentUser.wins++;
            else currentUser.losses++;
            
            updateUserUI(currentUser);
            
            if (result.leveledUp) {
                showNotification(`🎉 Вітаємо! Ви досягли рівня ${result.newLevel}!`, 'success');
            }
        }
    } catch (error) {
        console.error('Error submitting game result:', error);
    }
}

// Chat
function setupChatInput() {
    const messageInput = document.getElementById('messageInput');
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

function sendMessage() {
    if (!currentUser) {
        showNotification('Спочатку увійдіть в акаунт', 'error');
        return;
    }

    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (!message) return;

    socket.emit('chatMessage', { message });
    messageInput.value = '';
}

// Socket Listeners
function setupSocketListeners() {
    socket.on('chatMessage', (data) => {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        
        const time = new Date(data.timestamp).toLocaleTimeString('uk-UA', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageDiv.innerHTML = `
            <div class="message-author">${data.username}</div>
            <div class="message-text">${escapeHtml(data.message)}</div>
            <div class="message-time">${time}</div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    socket.on('onlineUsers', (data) => {
        if (data.action === 'join') {
            onlineUsers++;
            addSystemMessage(`${data.username} приєднався до чату`);
        } else if (data.action === 'leave') {
            onlineUsers--;
            addSystemMessage(`${data.username} покинув чат`);
        }
        
        document.getElementById('onlineCount').textContent = `${onlineUsers} онлайн`;
    });

    socket.on('userJoined', (data) => {
        if (currentUser && data.telegramId !== currentUser.telegram_id) {
            showNotification(`${data.username} приєднався до платформи`, 'info');
        }
    });
}

function addSystemMessage(text) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? 'rgba(81, 207, 102, 0.9)' : 
                      type === 'error' ? 'rgba(255, 107, 107, 0.9)' : 
                      'rgba(255, 255, 255, 0.9)'};
        color: ${type === 'info' ? '#000' : '#fff'};
        border-radius: 12px;
        border: 1px solid ${type === 'success' ? 'rgba(81, 207, 102, 1)' : 
                           type === 'error' ? 'rgba(255, 107, 107, 1)' : 
                           'rgba(255, 255, 255, 1)'};
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        z-index: 10000;
        font-family: 'Rajdhani', sans-serif;
        font-size: 16px;
        font-weight: 600;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Make functions global
window.connectUser = connectUser;
window.startGame = startGame;
window.closeGame = closeGame;
window.playRPS = playRPS;
window.checkGuess = checkGuess;
window.spinSlots = spinSlots;
window.sendMessage = sendMessage;
window.purchaseItem = purchaseItem;
