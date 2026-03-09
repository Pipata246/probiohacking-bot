/**
 * Стриминг описания программы в чат: сначала создаём программу в БД (health_programs, diary_entries),
 * затем стримим текст описания от DeepSeek по SSE. Клиент показывает "Составляю программу" до первого чанка, затем печатает текст.
 */
const https = require('https');
const { generateProgramForUser } = require('../lib/programGenerator.js');
const programDescription = require('./program-description.js');
const loadDiagnosticAndProgram = programDescription.loadDiagnosticAndProgram;
const buildDescriptionPrompt = programDescription.buildDescriptionPrompt;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

function sendSSE(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const telegramData = req.headers['x-telegram-webapp-data'];
    if (!telegramData) {
      return res.status(401).json({ success: false, error: 'No Telegram data' });
    }

    const params = {};
    telegramData.split('&').forEach((param) => {
      const [key, value] = param.split('=');
      if (key && value) {
        try {
          params[key] = decodeURIComponent(value.replace(/\+/g, ' '));
        } catch (e) {
          params[key] = value;
        }
      }
    });

    const user = JSON.parse(params.user || '{}');
    const telegramId = user.id;
    if (!telegramId) {
      return res.status(401).json({ success: false, error: 'Invalid user' });
    }

    // 1) Создаём и сохраняем программу в БД (health_programs, diary_entries)
    try {
      await generateProgramForUser(telegramId);
    } catch (e) {
      console.error('program-description-stream: generateProgramForUser error:', e);
      return res.status(500).json({ success: false, error: (e && e.message) ? e.message : 'Не удалось составить программу в БД' });
    }

    const data = await loadDiagnosticAndProgram(telegramId);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Нет данных диагностики.' });
    }

    const prompt = buildDescriptionPrompt(data);

    // 2) SSE-заголовки и стриминг ответа DeepSeek
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Ты — экспертный ИИ-ассистент "Профи", фитотерапевт. Отвечай только текстом для отображения в чате: без JSON, без маркеров ===.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.75,
      max_tokens: 3500,
      stream: true
    };

    const apiUrl = new URL(DEEPSEEK_API_URL);
    const apiReq = https.request({
      hostname: apiUrl.hostname,
      path: apiUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    }, (apiRes) => {
      if (apiRes.statusCode !== 200) {
        sendSSE(res, { error: 'Ошибка AI: ' + apiRes.statusCode });
        res.end();
        return;
      }

      let buffer = '';
      apiRes.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed?.choices?.[0]?.delta?.content || '';
              if (delta) sendSSE(res, { chunk: delta });
            } catch (e) {}
          }
        }
      });

      apiRes.on('end', () => {
        if (buffer.startsWith('data: ')) {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed?.choices?.[0]?.delta?.content || '';
              if (delta) sendSSE(res, { chunk: delta });
            } catch (e) {}
          }
        }
        sendSSE(res, { done: true });
        res.end();
      });

      apiRes.on('error', (err) => {
        console.error('program-description-stream DeepSeek error:', err);
        sendSSE(res, { error: err.message || 'Ошибка потока' });
        res.end();
      });
    });

    apiReq.on('error', (err) => {
      console.error('program-description-stream request error:', err);
      if (!res.headersSent) {
        return res.status(500).json({ success: false, error: err.message });
      }
      sendSSE(res, { error: err.message });
      res.end();
    });

    apiReq.write(JSON.stringify(payload));
    apiReq.end();
  } catch (e) {
    console.error('program-description-stream error:', e);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: (e && e.message) ? e.message : 'Ошибка сервера' });
    }
    sendSSE(res, { error: (e && e.message) ? e.message : 'Ошибка сервера' });
    res.end();
  }
};
