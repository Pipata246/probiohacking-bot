const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const miniAppUrl = 'https://probiohacking-bot.vercel.app';

const bot = new TelegramBot(token);

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const { message } = req.body;

      if (message && message.text === '/start') {
        const chatId = message.chat.id;

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

        await bot.sendMessage(chatId, welcomeMessage, {
          reply_markup: keyboard
        });
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Error:', error);
      res.status(200).json({ ok: true });
    }
  } else {
    res.status(200).send('Bot is running');
  }
};
