/**
 * Vision (Yandex Cloud OCR) для анализа медицинских фото и PDF
 * Использует Yandex Cloud Vision OCR API для распознавания текста с изображений
 */

const YANDEX_OCR_API_KEY = process.env.YANDEX_OCR_API_KEY || process.env.YANDEX_VISION_API_KEY;
const YANDEX_IAM_TOKEN = process.env.YANDEX_IAM_TOKEN;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID;
const YANDEX_OCR_URL = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';

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
 * Скачивание файла по URL через Node.js https/http
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

/**
 * Разбиение многостраничного PDF на одностраничные (Yandex Vision — лимит 1 страница)
 */
async function splitPdfToSinglePages(pdfBuffer) {
  const { PDFDocument } = require('pdf-lib');
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const pageCount = sourcePdf.getPageCount();
  if (pageCount <= 1) return [pdfBuffer];

  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(sourcePdf, [i]);
    newPdf.addPage(copiedPage);
    const pdfBytes = await newPdf.save();
    pages.push(Buffer.from(pdfBytes));
  }
  return pages;
}

/**
 * Отправка одного файла в Yandex Vision OCR
 */
async function callYandexVisionOCR(base64Content, mimeType, authKey) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': YANDEX_IAM_TOKEN ? `Bearer ${YANDEX_IAM_TOKEN}` : `Api-Key ${YANDEX_OCR_API_KEY}`
  };
  if (YANDEX_FOLDER_ID) {
    headers['x-folder-id'] = YANDEX_FOLDER_ID;
  }

  const requestBody = {
    mimeType,
    languageCodes: ['ru', 'en'],
    content: base64Content
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(YANDEX_OCR_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Yandex Vision API error: ${response.status} - ${responseText.substring(0, 200)}`);
  }

  const data = JSON.parse(responseText);
  const ann = data?.result?.textAnnotation || data?.textAnnotation;
  let extractedText = '';
  if (ann) {
    extractedText = ann.fullText || ann.markdown || '';
    if (!extractedText && ann.blocks) {
      const lines = ann.blocks.flatMap(b => (b.lines || []).map(l => l.text || '')).filter(Boolean);
      extractedText = lines.join('\n');
    }
    if (!extractedText && ann.entities) {
      extractedText = ann.entities.map(e => e.text || '').join('\n');
    }
  }
  return extractedText.trim();
}

/**
 * Анализ изображения или PDF через Yandex Cloud Vision OCR
 */
async function analyzePhotoWithVision(photoUrl, analysisGroup, isPdf = false) {
  const authKey = YANDEX_OCR_API_KEY || YANDEX_IAM_TOKEN;
  if (!authKey) {
    throw new Error('YANDEX_OCR_API_KEY (или YANDEX_IAM_TOKEN) не настроен');
  }

  try {
    const resolvedUrl = await getDownloadUrlForVision(photoUrl);
    const fileExtension = String(resolvedUrl).split('.').pop().split('?')[0].toLowerCase();
    const isPdfFile = isPdf || fileExtension === 'pdf';

    console.log(`🎯 Vision (Yandex): Анализ ${analysisGroup}, тип: ${isPdfFile ? 'PDF' : 'IMAGE'}, URL: ${String(resolvedUrl).substring(0, 100)}...`);

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

    const mimeType = isPdfFile ? 'application/pdf' : (fileExtension === 'png' ? 'image/png' : 'image/jpeg');
    let texts = [];

    if (isPdfFile) {
      // Многостраничный PDF: разбиваем на страницы и обрабатываем каждую
      const pdfPages = await splitPdfToSinglePages(fileBuffer);
      if (pdfPages.length > 1) {
        console.log(`📄 PDF: ${pdfPages.length} страниц — обрабатываем по одной`);
      }
      for (let i = 0; i < pdfPages.length; i++) {
        const base64Content = pdfPages[i].toString('base64');
        const text = await callYandexVisionOCR(base64Content, 'application/pdf', authKey);
        if (text) {
          if (pdfPages.length > 1) {
            texts.push(`--- Страница ${i + 1} ---\n${text}`);
          } else {
            texts.push(text);
          }
        }
      }
    } else {
      const base64Content = fileBuffer.toString('base64');
      const text = await callYandexVisionOCR(base64Content, mimeType, authKey);
      if (text) texts.push(text);
    }

    const description = texts.join('\n\n').trim();
    if (!description) {
      throw new Error('Yandex Vision не распознал текст на изображении');
    }

    const formattedDescription = `[Группа: ${analysisGroup}] Распознанный текст с анализа:\n${description}`;

    console.log(`✅ Vision (Yandex): Анализ завершен (${formattedDescription.length} символов)`);
    return formattedDescription;
  } catch (err) {
    console.error('❌ Yandex Vision Error:', err.message);
    throw err;
  }
}

async function getAnalysisDescription(photoUrl, analysisGroup, existingDescription = null, isPdf = false) {
  if (existingDescription && String(existingDescription).trim() !== '') return existingDescription;
  console.log('🔄 Generating description via Yandex Vision...');
  return await analyzePhotoWithVision(photoUrl, analysisGroup, isPdf);
}

module.exports = {
  analyzePhotoWithVision,
  getAnalysisDescription
};
