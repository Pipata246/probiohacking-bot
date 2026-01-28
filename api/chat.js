const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

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

    const { message } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid message' });
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

    const response = await fetch(DEEPSEEK_API_URL, {
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

    const footer = `\n\nЧтобы ответ был точнее: открой «Диагностика» и загрузи анализы в «Мои анализы».`;

    return res.status(200).json({
      success: true,
      response: (content || '').trim() + footer
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error'
    });
  }
};
