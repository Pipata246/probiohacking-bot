// API для инициализации пользователя при запуске Mini App
const { initUserFromWebApp } = require('../supabase/userMiddleware.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { telegramUser } = req.body || {};

    if (!telegramUser || !telegramUser.id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Telegram user data is required' 
      });
    }

    // Initialize user
    const userInfo = await initUserFromWebApp(req);

    if (!userInfo) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to initialize user' 
      });
    }

    console.log(`User initialized from Mini App: ${userInfo.telegramId} (${userInfo.firstName})`);

    return res.status(200).json({
      success: true,
      user: {
        id: userInfo.id,
        telegramId: userInfo.telegramId,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        username: userInfo.username,
        languageCode: userInfo.languageCode
      }
    });

  } catch (error) {
    console.error('Error in init-user API:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error'
    });
  }
};
