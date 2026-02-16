const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
// Базовый URL нашего VPS-домена
const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://probio-hacking.store';

module.exports = async (req, res) => {
  try {
    const bot = new TelegramBot(token);
    const url = `${webhookBaseUrl}/api/webhook`;
    
    await bot.setWebHook(url);
    
    const webhookInfo = await bot.getWebHookInfo();
    
    res.status(200).json({
      success: true,
      message: 'Webhook установлен',
      url,
      webhookInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
