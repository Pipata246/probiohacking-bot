// API для работы с данными пользователя
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const botToken = process.env.TELEGRAM_BOT_TOKEN;

const supabase = createClient(supabaseUrl, supabaseKey);

// Функция проверки данных Telegram WebApp
function verifyTelegramWebAppData(initData) {
  if (!initData || !botToken) return null;
  
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    if (hmac === hash) {
      const userStr = urlParams.get('user');
      if (userStr) {
        return JSON.parse(userStr);
      }
    }
  } catch (err) {
    console.error('Error verifying Telegram data:', err);
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Верификация пользователя через Telegram WebApp Data
    const telegramWebAppData = req.headers['x-telegram-webapp-data'];
    const telegramUser = verifyTelegramWebAppData(telegramWebAppData);
    
    if (!telegramUser || !telegramUser.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: Invalid Telegram data' 
      });
    }

    const telegramId = telegramUser.id;

    // GET - получить данные пользователя
    if (req.method === 'GET') {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return res.status(200).json({
        success: true,
        user: user || null
      });
    }

    // PUT - обновить данные пользователя
    if (req.method === 'PUT') {
      const updates = req.body;
      
      // Белый список полей, которые можно обновлять
      const allowedFields = ['onboarding_completed'];
      
      // Фильтруем только разрешённые поля
      const filteredUpdates = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No valid fields to update' 
        });
      }

      const { data, error } = await supabase
        .from('users')
        .update(filteredUpdates)
        .eq('telegram_id', telegramId)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        user: data
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('Error in user API:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error'
    });
  }
};
