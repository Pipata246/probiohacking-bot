const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Import Supabase client and middleware
const { requestService, initUserFromWebApp } = require('../supabase/client.js');
const { initUserFromWebApp: initUser } = require('../supabase/userMiddleware.js');

async function doRequest(url, options) {
  if (typeof fetch === 'function') {
    return fetch(url, options);
  }

  const https = require('https');

  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: options.method || 'GET',
          headers: options.headers || {}
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: {
                get: (k) => {
                  const key = String(k || '').toLowerCase();
                  return res.headers[key];
                }
              },
              json: async () => JSON.parse(data),
              text: async () => data
            });
          });
        }
      );

      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

const SYSTEM_PROMPT = `Ты — PROBIOHACKING AI: персональный ассистент по здоровью и биохакингу.

Правила:
- Ты не заменяешь врача. При серьёзных симптомах и любых неотложных состояниях рекомендуй обратиться к врачу/в скорую.
- Давай практичные рекомендации: образ жизни, сон, питание, тренировки, управление стрессом, нутрицевтики (с осторожностью), лабораторная диагностика.
- Если данных недостаточно — задавай уточняющие вопросы.
- Пиши структурировано: краткий вывод, затем шаги/рекомендации списком.
- По умолчанию отвечай кратко (6–10 коротких строк). Подробный разбор давай только если пользователь прямо попросил «подробно», «детально», «распиши план», «дай протокол», «объясни механизмы».
- Не назначай рецептурные препараты.

Контекст приложения:
- Пользователь может пройти диагностику во вкладке «Диагностика».
- Пользователь может загрузить анализы во вкладке «Мои анализы».
- В каждом ответе мягко напоминай, что для точности полезно пройти диагностику и загрузить анализы.`;

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

    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'DEEPSEEK_API_KEY is not set'
      });
    }

    const { message, telegramUser } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid message' });
    }

    // Initialize user first
    let userInfo = null;
    if (telegramUser && telegramUser.id) {
      try {
        userInfo = await initUser(req);
        console.log('User info:', userInfo ? `${userInfo.telegramId} (${userInfo.firstName})` : 'Not created');
      } catch (error) {
        console.error('Error initializing user:', error);
        // Продолжаем без пользователя, но логируем ошибку
      }
    } else {
      console.log('No telegram user data provided');
    }

    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 420
    };

    const response = await doRequest(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(500).json({
        success: false,
        error: `DeepSeek API error: ${response.status}`,
        details: errText
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';

    // Save request and response to Supabase (async, don't wait)
    if (userInfo && userInfo.telegramId) {
      requestService.saveRequest(
        userInfo.telegramId,
        message,
        content,
        'chat',
        {
          userId: userInfo.id,
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          username: userInfo.username,
          languageCode: userInfo.languageCode,
          userAgent: req.headers['user-agent'],
          timestamp: new Date().toISOString()
        }
      ).catch(error => {
        console.error('Failed to save request to Supabase:', error);
      });
    } else {
      console.log('No user info available, skipping request save');
    }

    return res.status(200).json({
      success: true,
      response: (content || '').trim()
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
