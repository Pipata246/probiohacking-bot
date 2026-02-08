/**
 * Vision (qwen) API Client for analyzing medical analysis photos
 * Replaces previous Kimi client
 */

const VISION_API_KEY = process.env.VISION_API_KEY || process.env.KIMI_API_KEY;
const VISION_API_URL = 'https://api.openrouter.ai/v1/chat/completions';

// System prompt for vision model
const VISION_SYSTEM_PROMPT = `Ты не врач. Твоя задача - тщательно анализировать медицинские анализы и документы.
Анализируй загруженные файлы (группу анализов) очень подробно, основываясь на медицинских знаниях, но ТОЛЬКО как ИИ-помощник, а не как врач.

ВАЖНО:
- Не ставь диагнозы
- Не рецепты и не лечение
- Только описание ТОГО, что видишь на анализах
- Укажи нормальные/ненормальные значения если видишь
- Опиши тренды и паттерны если анализов несколько

ФОРМАТ ответа:
- Максимум подробности
- Структурированный текст
- Перечисляй показатели и их значения
- Указывай референсные диапазоны если видишь`;

async function analyzePhotoWithVision(photoUrl, analysisGroup, isPdf = false) {
  if (!VISION_API_KEY) {
    throw new Error('VISION_API_KEY is not configured');
  }

  try {
    const fileExtension = String(photoUrl).split('.').pop().toLowerCase();
    const isPdfFile = isPdf || fileExtension === 'pdf';

    console.log(`🎯 Vision (qwen): Анализ ${analysisGroup} файл: ${String(photoUrl).substring(0,120)}...`);

    let fileBuffer;
    try {
      const fileResponse = await fetch(photoUrl, { timeout: 10000 });
      if (!fileResponse.ok) throw new Error(`Failed to fetch file: ${fileResponse.status}`);
      fileBuffer = await fileResponse.arrayBuffer();
    } catch (fetchErr) {
      console.warn('⚠️ fetch failed, trying https fallback:', fetchErr.message);
      fileBuffer = await (async () => {
        const https = require('https');
        const url = require('url');
        return new Promise((resolve, reject) => {
          try {
            const parsedUrl = new url.URL(photoUrl);
            const options = {
              hostname: parsedUrl.hostname,
              path: parsedUrl.pathname + parsedUrl.search,
              timeout: 10000
            };
            const req = https.get(options, (res) => {
              if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Failed to fetch file (https): ${res.statusCode}`));
              }
              const chunks = [];
              res.on('data', c => chunks.push(c));
              res.on('end', () => resolve(Buffer.concat(chunks)));
            });
            req.on('timeout', () => {
              req.abort();
              reject(new Error('https.get timeout'));
            });
            req.on('error', e => reject(e));
          } catch (e) { reject(e); }
        });
      })();
    }

    const base64File = Buffer.from(fileBuffer).toString('base64');

    const userContent = [];
    if (isPdfFile) {
      userContent.push({ type: 'text', text: `Проанализируй этот медицинский PDF документ/анализ. Группа анализа: "${analysisGroup}".` });
      userContent.push({ type: 'document', document: base64File });
    } else {
      userContent.push({ type: 'text', text: `Проанализируй этот медицинский анализ. Группа анализа: "${analysisGroup}".` });
      userContent.push({ type: 'image', image: base64File });
    }

    const requestBody = {
      model: 'qwen/qwen-vl-plus',
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7,
      max_tokens: 2500
    };

    const response = await fetch(VISION_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VISION_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Vision API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('Invalid Vision API response structure');
    }

    const description = data.choices[0].message.content.trim();
    console.log(`✅ Vision (qwen): Анализ завершен (${description.length} chars)`);
    return description;
  } catch (err) {
    console.error('❌ Vision API Error:', err.message);
    throw err;
  }
}

async function getAnalysisDescription(photoUrl, analysisGroup, existingDescription = null, isPdf = false) {
  if (existingDescription && existingDescription.trim() !== '') return existingDescription;
  console.log('🔄 Generating description via Vision (qwen)...');
  return await analyzePhotoWithVision(photoUrl, analysisGroup, isPdf);
}

module.exports = {
  analyzePhotoWithVision,
  getAnalysisDescription
};
