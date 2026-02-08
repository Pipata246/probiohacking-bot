/**
 * Kimi Vision API Client for analyzing medical analysis photos
 * Используется для получения описания медицинских анализов из фото
 */

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

// System prompt для Kimi - не врач, а помощник для анализа
const KIMI_SYSTEM_PROMPT = `Ты не врач. Твоя задача - тщательно анализировать медицинские анализы и документы.
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

/**
 * Функция для анализа фото или PDF анализа через Kimi Vision API
 * @param {string} photoUrl - URL фото или PDF анализа
 * @param {string} analysisGroup - Группа анализа (Анализ крови, Гормоны, и т.д.)
 * @param {boolean} isPdf - Флаг, является ли файл PDF (опционально, определяется по расширению)
 * @returns {Promise<string>} - Описание анализа
 */
async function analyzePhotoWithKimi(photoUrl, analysisGroup, isPdf = false) {
  if (!KIMI_API_KEY) {
    throw new Error('KIMI_API_KEY is not configured');
  }

  try {
    // Определяем, является ли файл PDF по URL если не указано явно
    const fileExtension = photoUrl.split('.').pop().toLowerCase();
    const isPdfFile = isPdf || fileExtension === 'pdf';
    
    console.log(`🎯 Kimi Vision: Начинаем анализ ${analysisGroup} с файлом: ${photoUrl.substring(0, 80)}...`);
    console.log(`📄 File type: ${isPdfFile ? 'PDF' : 'IMAGE'}`);
    console.log(`🔑 API Key present: ${KIMI_API_KEY ? 'yes' : 'no'} (length: ${KIMI_API_KEY?.length || 0})`);

    // Скачиваем файл и конвертируем в base64
    const fileResponse = await fetch(photoUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
    }
    
    const fileBuffer = await fileResponse.arrayBuffer();
    const base64File = Buffer.from(fileBuffer).toString('base64');

    // Подготовляем контент в зависимости от типа файла
    const userContent = [];
    
    if (isPdfFile) {
      // Для PDF используем document type
      userContent.push({
        type: 'text',
        text: `Проанализируй этот медицинский PDF документ/анализ. Группа анализа: "${analysisGroup}". Дай максимально подробное описание всего содержимого документа.`
      });
      userContent.push({
        type: 'document',
        document: base64File
      });
    } else {
      // Для изображений используем image type
      userContent.push({
        type: 'text',
        text: `Проанализируй этот медицинский анализ. Группа анализа: "${analysisGroup}". Дай максимально подробное описание того, что видишь на этом анализе.`
      });
      userContent.push({
        type: 'image',
        image: base64File
      });
    }

    const requestBody = {
      model: 'moonshot-v1',
      messages: [
        {
          role: 'system',
          content: KIMI_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: userContent
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };

    console.log(`📤 Отправляем запрос на Kimi API...`);
    console.log(`📋 Request model: ${requestBody.model}`);
    console.log(`📋 Content type: ${isPdfFile ? 'document' : 'image'}`);

    const response = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIMI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📊 Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Raw error response:`, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { raw: errorText };
      }
      
      console.error(`❌ Parsed error:`, errorData);
      throw new Error(`Kimi API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('Invalid Kimi API response structure');
    }

    const description = data.choices[0].message.content.trim();

    console.log(`✅ Kimi Vision: Анализ завершен на ${description.length} символов`);
    return description;

  } catch (error) {
    console.error('❌ Kimi API Error:', error.message);
    throw error;
  }
}

/**
 * Функция для получения описания анализа - проверка кэша или новый анализ
 * @param {string} photoUrl - URL фото или PDF анализа
 * @param {string} analysisGroup - Группа анализа
 * @param {string} existingDescription - Существующее описание (кэш)
 * @param {boolean} isPdf - Флаг, является ли файл PDF
 * @returns {Promise<string>} - Описание анализа
 */
async function getAnalysisDescription(photoUrl, analysisGroup, existingDescription = null, isPdf = false) {
  // Если описание уже есть в БД - возвращаем его
  if (existingDescription && existingDescription.trim() !== '') {
    console.log('📦 Используем кэшированное описание из БД');
    return existingDescription;
  }

  // Если описания нет - генерируем с Kimi Vision
  console.log('🔄 Генерируем описание с помощью Kimi Vision...');
  return await analyzePhotoWithKimi(photoUrl, analysisGroup, isPdf);
}

module.exports = {
  analyzePhotoWithKimi,
  getAnalysisDescription
};
