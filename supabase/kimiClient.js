/**
 * Kimi API Client for analyzing medical analysis photos
 * Используется для получения описания медицинских анализов из фото
 */

const KIMI_API_KEY = process.env.KIMI_API_KEY;
const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

// System prompt for Kimi - не врач, а помощник для анализа
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
 * Функция для анализа фото анализа через Kimi
 * @param {string} photoUrl - URL фото анализа
 * @param {string} analysisGroup - Группа анализа (Анализ крови, Гормоны, и т.д.)
 * @returns {Promise<string>} - Описание анализа
 */
async function analyzePhotoWithKimi(photoUrl, analysisGroup) {
  if (!KIMI_API_KEY) {
    throw new Error('KIMI_API_KEY is not configured');
  }

  try {
    console.log(`🎯 Kimi: Начинаем анализ ${analysisGroup} с фото: ${photoUrl.substring(0, 80)}...`);

    const requestBody = {
      model: 'moonshot-v1-128k',
      messages: [
        {
          role: 'system',
          content: KIMI_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Проанализируй этот медицинский анализ. Группа анализа: "${analysisGroup}". Дай максимально подробное описание того, что видишь на этом анализе.`
            },
            {
              type: 'image_url',
              image_url: {
                url: photoUrl
              }
            }
          ]
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };

    const response = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIMI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Kimi API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid Kimi API response structure');
    }

    const description = data.choices[0].message.content.trim();

    console.log(`✅ Kimi: Анализ завершен на ${description.length} символов`);
    return description;

  } catch (error) {
    console.error('❌ Kimi API Error:', error.message);
    throw error;
  }
}

/**
 * Функция для получения описания анализа - параллельная обработка с других API если нужно
 */
async function getAnalysisDescription(photoUrl, analysisGroup, existingDescription = null) {
  // Если описание уже есть в БД - возвращаем его
  if (existingDescription && existingDescription.trim() !== '') {
    console.log('📦 Используем кэшированное описание из БД');
    return existingDescription;
  }

  // Если описания нет - генерируем с Kimi
  console.log('🔄 Генерируем описание с помощью Kimi...');
  return await analyzePhotoWithKimi(photoUrl, analysisGroup);
}

module.exports = {
  analyzePhotoWithKimi,
  getAnalysisDescription
};
