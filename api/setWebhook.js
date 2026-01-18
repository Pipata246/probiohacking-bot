const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const webhookUrl = process.env.WEBHOOK_URL || 'https://probiohacking-bot.vercel.app';

module.exports = async (req, res) => {
  try {
    const bot = new TelegramBot(token);
    const url = `${webhookUrl}/api/webhook`;
    
    await bot.setWebHook(url);
    
    const webhookInfo = await bot.getWebHookInfo();
    
    res.status(200).json({
      success: true,
      message: 'Webhook установлен',
      url: url,
      webhookInfo: webhookInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
