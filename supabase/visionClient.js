/**
 * Vision (Qwen VL Plus) via OpenRouter for analyzing medical analysis photos and PDFs
 * OpenRouter format: image_url for images, file for PDFs
 */

const VISION_API_KEY = process.env.VISION_API_KEY || process.env.OPENROUTER_API_KEY || process.env.KIMI_API_KEY;
const VISION_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

const FETCH_TIMEOUT_MS = 30000;
const BUCKET_NAME = 'analysis-photos';

/**
 * Для URL Supabase Storage возвращаем подписанный URL (работает и с приватным бакетом)
 */
async function getDownloadUrlForVision(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return photoUrl;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return photoUrl;
  const base = supabaseUrl.replace(/\/$/, '');
  const prefix = `${base}/storage/v1/object/public/${BUCKET_NAME}/`;
  if (!photoUrl.startsWith(prefix)) return photoUrl;
  try {
    const { createClient } = require('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceKey, { persistSession: false });
    const path = photoUrl.slice(prefix.length).split('?')[0];
    if (!path) return photoUrl;
    const { data, error } = await admin.storage.from(BUCKET_NAME).createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      console.warn('Vision: signed URL failed, using original:', error?.message);
      return photoUrl;
    }
    return data.signedUrl;
  } catch (e) {
    console.warn('Vision getDownloadUrlForVision:', e.message);
    return photoUrl;
  }
}

/**
 * Скачивание файла по URL через Node.js https/http (надёжно в serverless)
 */
async function downloadFileToBuffer(url) {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const mod = isHttps ? require('https') : require('http');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)'
      }
    };

    const req = mod.get(options, (res) => {
      const redirect = res.statusCode >= 300 && res.statusCode < 400 && res.headers.location;
      if (redirect) {
        return downloadFileToBuffer(redirect).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.on('error', reject);
  });
}

async function analyzePhotoWithVision(photoUrl, analysisGroup, isPdf = false) {
  if (!VISION_API_KEY) {
    throw new Error('VISION_API_KEY is not configured');
  }

  try {
    const resolvedUrl = await getDownloadUrlForVision(photoUrl);
    const fileExtension = String(resolvedUrl).split('.').pop().split('?')[0].toLowerCase();
    const isPdfFile = isPdf || fileExtension === 'pdf';

    console.log(`🎯 Vision (qwen): Анализ ${analysisGroup}, тип: ${isPdfFile ? 'PDF' : 'IMAGE'}, URL: ${String(resolvedUrl).substring(0, 100)}...`);

    let fileBuffer;
    try {
      fileBuffer = await downloadFileToBuffer(resolvedUrl);
    } catch (fetchErr) {
      console.error('❌ Ошибка загрузки файла:', fetchErr.message);
      throw new Error(`Не удалось загрузить файл: ${fetchErr.message}`);
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Файл пустой или не загрузился');
    }

    const base64File = fileBuffer.toString('base64');

    // OpenRouter: images — image_url с data URL; PDF — file с file_data
    const userContent = [];
    const promptText = `Проанализируй этот медицинский ${isPdfFile ? 'PDF документ/анализ' : 'анализ (изображение)'}. Группа анализа: "${analysisGroup}".`;

    userContent.push({ type: 'text', text: promptText });

    if (isPdfFile) {
      userContent.push({
        type: 'file',
        file: {
          filename: 'document.pdf',
          file_data: `data:application/pdf;base64,${base64File}`
        }
      });
    } else {
      const mime = fileExtension === 'png' ? 'image/png' : 'image/jpeg';
      userContent.push({
        type: 'image_url',
        imageUrl: {
          url: `data:${mime};base64,${base64File}`
        }
      });
    }

    const requestBody = {
      model: 'qwen/qwen-vl-plus',
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      temperature: 0.3,
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

    const responseText = await response.text();
    if (!response.ok) {
      console.error('Vision API error response:', responseText);
      throw new Error(`Vision API error: ${response.status} - ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Invalid JSON from Vision API');
    }

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid Vision API response structure: ' + responseText.substring(0, 300));
    }

    const content = data.choices[0].message.content;
    const description = (content && typeof content === 'string' ? content : '').trim();
    if (!description) {
      throw new Error('Пустой ответ от Vision API');
    }

    console.log(`✅ Vision (qwen): Анализ завершен (${description.length} символов)`);
    return description;
  } catch (err) {
    console.error('❌ Vision API Error:', err.message);
    throw err;
  }
}

async function getAnalysisDescription(photoUrl, analysisGroup, existingDescription = null, isPdf = false) {
  if (existingDescription && String(existingDescription).trim() !== '') return existingDescription;
  console.log('🔄 Generating description via Vision (qwen)...');
  return await analyzePhotoWithVision(photoUrl, analysisGroup, isPdf);
}

module.exports = {
  analyzePhotoWithVision,
  getAnalysisDescription
};
