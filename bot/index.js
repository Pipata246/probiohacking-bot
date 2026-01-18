require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const miniAppUrl = process.env.MINI_APP_URL;
const webhookUrl = process.env.WEBHOOK_URL;
const port = process.env.PORT || 3000;

if (!token) {
  console.error('❌ BOT_TOKEN не найден в .env файле');
  process.exit(1);
}

// Создаем бота БЕЗ polling
const bot = new TelegramBot(token);

// Создаем Express сервер
const app = express();
app.use(express.json());

// Webhook endpoint
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🤖 PROBIOHACKING Bot is running');
});

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const welcomeMessage = `🤖 PROBIOHACKING — ваш цифровой наставник по здоровью

Откройте Mini App для персональной диагностики и рекомендаций`;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '🚀 Открыть Mini App',
          web_app: { url: miniAppUrl }
        }
      ]
    ]
  };

  bot.sendMessage(chatId, welcomeMessage, {
    reply_markup: keyboard
  });
});

// Запуск сервера
app.listen(port, async () => {
  console.log(`🚀 Сервер запущен на порту ${port}`);
  
  // Устанавливаем webhook
  if (webhookUrl) {
    try {
      await bot.setWebHook(`${webhookUrl}/bot${token}`);
      console.log('✅ Webhook установлен:', `${webhookUrl}/bot${token}`);
    } catch (error) {
      console.error('❌ Ошибка установки webhook:', error.message);
    }
  } else {
    console.log('⚠️ WEBHOOK_URL не установлен. Бот работает без webhook.');
  }
});
