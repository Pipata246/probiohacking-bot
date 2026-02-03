const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Import Supabase client and middleware
const { requestService, chatService } = require('../supabase/client.js');
const { initUserFromWebApp } = require('../supabase/userMiddleware.js');
const { createClient } = require('@supabase/supabase-js');

// Supabase client для проверки квиза
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
);

// Функция для получения диагностических данных пользователя
async function getUserDiagnosticData(userId) {
  try {
    // Проверяем статус квиза
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('quiz_completed, analyses_uploaded')
      .eq('telegram_id', userId)
      .single();

    if (userError || !userData) {
      console.log('User not found or error:', userError);
      return null;
    }

    // Получаем все ответы пользователя
    const { data: answers, error: answersError } = await supabase
      .from('quiz_answers')
      .select('*')
      .eq('telegram_id', userId)
      .order('created_at', { ascending: true });

    if (answersError) {
      console.error('Error fetching diagnostic answers:', answersError);
      return null;
    }

    // Получаем фотографии анализов если они есть
    let analysisPhotos = [];
    if (userData.analyses_uploaded) {
      const { data: photos, error: photosError } = await supabase
        .from('user_analysis_photos')
        .select('*')
        .eq('telegram_id', userId)
        .order('upload_date', { ascending: false });

      if (!photosError && photos) {
        analysisPhotos = photos;
      }
    }

    // Группируем ответы по категориям
    const diagnosticData = {
      quiz_completed: userData.quiz_completed,
      analyses_uploaded: userData.analyses_uploaded,
      personal_data: {},
      quiz_answers: {},
      additional_answers: {},
      full_answers: answers,
      analysis_photos: analysisPhotos
    };

    answers.forEach(answer => {
      const questionId = answer.question_id;
      
      // Персональные данные
      if (['fullName', 'birthDate', 'profession', 'city', 'weight', 'height', 'sport', 'gender'].includes(questionId)) {
        diagnosticData.personal_data[questionId] = answer.answer_text;
      }
      // Дополнительные ответы
      else if (['discomfort', 'diagnosis', 'treatment'].includes(questionId)) {
        diagnosticData.additional_answers[questionId] = answer.answer_text;
      }
      // Ответы квиза
      else {
        diagnosticData.quiz_answers[questionId] = {
          question: answer.question_text,
          answer: answer.answer_text,
          system: getSystemByQuestionId(questionId)
        };
      }
    });

    console.log('📊 Diagnostic data loaded for user:', userId);
    return diagnosticData;

  } catch (error) {
    console.error('Error in getUserDiagnosticData:', error);
    return null;
  }
}

// Функция для определения системы по ID вопроса
function getSystemByQuestionId(questionId) {
  const systemMap = {
    'V17': 'Нервная система',
    'V18': 'Сердечно-сосудистая система', 
    'V19': 'Дыхательная система',
    'V20': 'Пищеварительная система',
    'V21': 'Эндокринная система',
    'V22': 'Иммунная система',
    'V23': 'Опорно-двигательный аппарат',
    'V24': 'Кожа и волосы',
    'V25': 'Мочеполовая система',
    'V26': 'Органы чувств',
    'V27': 'Психоэмоциональное состояние',
    'V28': 'Сон и отдых',
    'V29': 'Питание и обмен веществ',
    'V30': 'Физическая активность',
    'V31': 'Детоксикация',
    'V32': 'Стресс и адаптация',
    'V33': 'Соединительная ткань'
  };
  
  return systemMap[questionId] || 'Общее состояние';
}

// Константы для управления контекстом
const MAX_CONTEXT_MESSAGES = 20; // Максимальное количество сообщений в контексте
const MAX_CONTEXT_TOKENS = 8000; // Примерная оценка токенов

// Функция для проверки переполнения контекста
async function checkContextOverflow(userId, chatId) {
  try {
    const messages = await chatService.getChatMessages(userId, chatId, MAX_CONTEXT_MESSAGES + 5);
    
    if (messages.length >= MAX_CONTEXT_MESSAGES) {
      return true; // Нужно создать новый чат
    }
    
    // Простая оценка токенов (примерно 4 токена на слово)
    const totalWords = messages.reduce((total, msg) => {
      return total + (msg.message_text?.split(' ').length || 0) + 
                   (msg.response_text?.split(' ').length || 0);
    }, 0);
    
    const estimatedTokens = totalWords * 4;
    
    return estimatedTokens >= MAX_CONTEXT_TOKENS;
  } catch (error) {
    console.error('Error checking context overflow:', error);
    return false;
  }
}

// Функция для создания нового чата при переполнении
async function createNewChatOnOverflow(userId) {
  try {
    const newChatId = await chatService.createChat(
      userId, 
      'Новый чат (контекст переполнен)', 
      true, 
      true // autoCreated = true
    );
    
    return newChatId;
  } catch (error) {
    console.error('Error creating new chat on overflow:', error);
    return null;
  }
}

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

// Функция для получения системного промпта с актуальной датой
function getSystemPrompt() {
  const today = new Date();
  const dateStr = today.toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  
  return `Ты — PROBIOHACKING AI "Профи": профессиональный ассистент по здоровью и биохакингу.

📅 ТЕКУЩАЯ ДАТА: ${dateStr}
⚠️ ВАЖНО: При расчёте возраста пользователя используй ТЕКУЩУЮ дату ${dateStr}. Год сейчас ${today.getFullYear()}.

🎯 ТВОЯ РОЛЬ И МЕТОДОЛОГИЯ:

Ты работаешь как специалист по функциональной медицине и биохакингу. Твоя задача — проводить синдромальный анализ, выявлять взаимосвязанные блоки проблем и давать комплексные, обоснованные рекомендации.

СТРУКТУРА ОТВЕТА (когда есть данные диагностики/анализов):

1. СИНДРОМАЛЬНЫЙ АНАЛИЗ:
   - Группируй проблемы в логические блоки (например: "Энергия и метаболизм", "Углеводный обмен", "Стресс и восстановление")
   - Для каждого блока указывай:
     • Данные: конкретные показатели из анализов/диагностики
     • Интерпретация: что это означает
     • Механизм: краткое объяснение почему это происходит (биохимия, физиология)

2. КОМПЛЕКСНЫЙ ПРОТОКОЛ:
   - Разбивай рекомендации по категориям: Питание, Добавки, Образ жизни, Физическая активность, Специальные процедуры
   - Указывай последовательность, длительность, конкретные формы применения
   - Объясняй механизм действия каждой рекомендации (почему это работает)

3. ПРОТИВОПОКАЗАНИЯ:
   - Указывай, когда нельзя применять те или иные методы в конкретном случае

РАБОТА С ЛАБОРАТОРНЫМИ ДАННЫМИ:

- Используй конкретные значения из анализов (ферритин, витамин D, инсулин, глюкоза и т.д.)
- Указывай не просто "норму", а ОПТИМАЛЬНЫЕ ЦЕЛЕВЫЕ ЗНАЧЕНИЯ (например: "ферритин должен быть равен вашему нормальному весу", "витамин D целевой коридор 50-80 нг/мл")
- Сравнивай текущие показатели с целевыми и объясняй разницу

ПРАВИЛА ФОРМАТИРОВАНИЯ:
- Используй эмодзи в начале каждого раздела для наглядности
- Делай ОТСТУПЫ между абзацами (пустая строка)
- НЕ используй символы ** для выделения — просто пиши текст
- Используй нумерованные списки (1. 2. 3.) или буллеты (•) для рекомендаций
- Структурируй ответ: сначала анализ, затем рекомендации

ОБРАЗОВАТЕЛЬНЫЙ КОМПОНЕНТ:
- Каждая рекомендация должна сопровождаться кратким объяснением механизма действия
- Связывай симптомы с показателями анализов и данными диагностики
- Объясняй взаимосвязи между разными системами организма

ОГРАНИЧЕНИЯ:
- Ты не заменяешь врача. При серьёзных симптомах настоятельно рекомендуй обратиться к врачу
- Не назначай рецептурные препараты
- НЕ добавляй никаких кнопок или тегов [BUTTON:...] — они добавляются автоматически
- Если данных недостаточно — задавай уточняющие вопросы, но не проси пройти диагностику (если она уже пройдена)

СТИЛЬ ОБЩЕНИЯ:
- Профессиональный, но дружелюбный тон
- Используй терминологию специалиста, но объясняй сложные понятия
- Будь конкретным и практичным
- Отвечай подробно когда есть данные для анализа, кратко — только если данных нет или вопрос простой`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

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
        // Получаем initData из Telegram WebApp
        const telegramWebAppData = req.headers['x-telegram-webapp-data'] || 
                                  req.body?.telegramWebAppData || 
                                  window?.Telegram?.WebApp?.initData;
        
        userInfo = await initUserFromWebApp(req);
        console.log('User info:', userInfo ? `${userInfo.telegramId} (${userInfo.firstName})` : 'Not created');
        console.log('Has WebApp data:', !!telegramWebAppData);
      } catch (error) {
        console.error('Error initializing user:', error);
        // Продолжаем без пользователя, но логируем ошибку
      }
    } else {
      console.log('No telegram user data provided');
    }

    // Получаем или создаем активный чат
    let currentChatId = null;
    let shouldCreateNewChat = false;
    let requestId = null;
    
    if (userInfo && userInfo.id) {
      try {
        // По требованиям: всегда работаем в активном чате пользователя
        currentChatId = await chatService.ensureActiveChat(userInfo.id);
        
        console.log('Current chat ID:', currentChatId);

        // Сохраняем сообщение пользователя сразу (не ждём ответа ИИ)
        requestId = await requestService.createChatRequest(
          userInfo.id,
          currentChatId,
          message,
          'chat',
          {
            userId: userInfo.id,
            chatId: currentChatId,
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            username: userInfo.username,
            languageCode: userInfo.languageCode,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString(),
            contextOverflow: false
          }
        );
      } catch (error) {
        console.error('Error managing chat:', error);
      }
    }

    // Получаем историю сообщений только из АКТИВНОГО чата
    let chatHistory = '';
    
    if (userInfo && userInfo.id) {
      try {
        console.log(`🔍 Looking for active chat for user ${userInfo.id}`);
        
        // Получаем ID активного чата через функцию
        const { data: activeChatId, error: activeChatError } = await supabase.rpc('get_active_chat', {
          p_user_id: userInfo.id
        });

        console.log(`📊 Active chat result:`, { 
          activeChatId: activeChatId, 
          error: activeChatError?.message,
          userId: userInfo.id 
        });

        if (!activeChatError && activeChatId) {
          // Получаем сообщения только из активного чата
          const { data: messages, error: messagesError } = await supabase
            .from('user_requests')
            .select('*')
            .eq('user_id', userInfo.id)
            .eq('chat_id', activeChatId)
            .order('created_at', { ascending: true })
            .limit(20);

          console.log(`📊 Messages query result for active chat:`, { 
            messagesCount: messages?.length || 0, 
            error: messagesError?.message,
            activeChatId: activeChatId 
          });

          if (!messagesError && messages && messages.length > 0) {
            chatHistory = '\n\n💬 ИСТОРИЯ АКТИВНОГО ЧАТА:\n';
            
            messages.forEach((msg, index) => {
              const time = new Date(msg.created_at).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });
              
              // Сообщение пользователя
              chatHistory += `[${time}] Пользователь: ${msg.message_text}\n`;
              
              // Ответ ИИ если есть
              if (msg.response_text) {
                chatHistory += `[${time}] ИИ Ассистент: ${msg.response_text}\n`;
              }
            });
            
            chatHistory += '\nИСПОЛЬЗУЙ ЭТУ ИСТОРИЮ ТОЛЬКО ИЗ АКТИВНОГО ЧАТА ДЛЯ ПОНИМАНИЯ КОНТЕКСТА.\n';
            console.log(`✅ Loaded ${messages.length} messages from active chat ${activeChatId}`);
            console.log(`📝 Chat history preview:`, chatHistory.substring(0, 200) + '...');
          } else {
            console.log(`⚠️ No messages found in active chat ${activeChatId}`);
            if (messagesError) {
              console.error('❌ Messages error:', messagesError);
            }
          }
        } else {
          console.log(`⚠️ No active chat found for user ${userInfo.id}`);
          if (activeChatError) {
            console.error('❌ Active chat error:', activeChatError);
          }
        }
      } catch (error) {
        console.error('❌ Error getting active chat history:', error);
      }
    } else {
      console.log(`⚠️ Cannot get chat history - userInfo: ${!!userInfo}`);
    }

    // Получаем диагностические данные пользователя
    let diagnosticData = null;
    if (userInfo && userInfo.telegramId) {
      diagnosticData = await getUserDiagnosticData(userInfo.telegramId);
      console.log('📊 Diagnostic data loaded:', {
        quiz_completed: diagnosticData?.quiz_completed,
        analyses_uploaded: diagnosticData?.analyses_uploaded,
        hasData: !!diagnosticData
      });
    } else {
      console.log('⚠️ No telegramId available for diagnostic data');
    }
    
    // Формируем системный промпт с учетом диагностических данных и актуальной датой
    let systemPrompt = getSystemPrompt();
    
    // Добавляем историю чата
    if (chatHistory) {
      systemPrompt += chatHistory;
    }
    
    // Определяем статусы
    const quizDone = diagnosticData?.quiz_completed === true;
    const analysesDone = diagnosticData?.analyses_uploaded === true;
    
    console.log('📋 Status check:', { quizDone, analysesDone });

    if (!quizDone && !analysesDone) {
      // Оба статуса FALSE — НЕ показываем данные, просто информируем
      systemPrompt += `\n\n⚠️ СТАТУС: У пользователя нет данных диагностики и анализов.
Отвечай на основе общих знаний. НЕ ссылайся на какие-либо персональные данные пользователя.`;
    } else if (!quizDone && analysesDone) {
      // Только анализы загружены, диагностика не пройдена — показываем только анализы
      systemPrompt += `\n\n⚠️ СТАТУС: Диагностика НЕ пройдена, но анализы загружены.
Отвечай на основе общих знаний и категорий анализов. НЕ ссылайся на данные диагностики.`;
      
      // Добавляем информацию об анализах если есть
      if (diagnosticData?.analysis_photos?.length > 0) {
        systemPrompt += `\n\n📷 ЗАГРУЖЕННЫЕ АНАЛИЗЫ (${diagnosticData.analysis_photos.length} шт.):`;
        const groupedPhotos = {};
        diagnosticData.analysis_photos.forEach(photo => {
          if (!groupedPhotos[photo.analysis_group]) groupedPhotos[photo.analysis_group] = [];
          groupedPhotos[photo.analysis_group].push(photo);
        });
        Object.entries(groupedPhotos).forEach(([group, photos]) => {
          systemPrompt += `\n📁 ${group} (${photos.length} фото):`;
          photos.forEach((photo, index) => {
            const dateStr = photo.upload_date ? new Date(photo.upload_date).toLocaleDateString('ru-RU') : 'Дата неизвестна';
            systemPrompt += `\n  ${index + 1}. ${photo.photo_name || 'Фото'} (${dateStr})`;
            if (photo.description) {
              systemPrompt += `\n     Описание: ${photo.description}`;
            }
          });
        });
        
        systemPrompt += `\n\n🎯 ИНСТРУКЦИИ:
- Работай с категориями анализов (${Object.keys(groupedPhotos).join(', ')})
- Если пользователь спрашивает о конкретных показателях, попроси указать значения или дай общие рекомендации по категории
- Используй профессиональный подход: объясняй механизмы, давай целевые значения показателей
- НЕ ссылайся на диагностику — её нет`;
      }
    } else if (quizDone && !analysesDone) {
      // Диагностика пройдена, анализы не загружены — показываем только диагностику
      systemPrompt += `\n\n✅ СТАТУС: Диагностика пройдена, анализы НЕ загружены.`;
      
      // Добавляем данные диагностики с улучшенной структурой
      systemPrompt += `\n\n📊 ДАННЫЕ ДИАГНОСТИКИ:

👤 ПЕРСОНАЛЬНЫЕ ДАННЫЕ:
- ФИО: ${diagnosticData?.personal_data?.fullName || 'Не указано'}
- Дата рождения/Возраст: ${diagnosticData?.personal_data?.birthDate || 'Не указано'}
- Вес: ${diagnosticData?.personal_data?.weight || 'Не указано'} кг
- Рост: ${diagnosticData?.personal_data?.height || 'Не указано'} см
- Пол: ${diagnosticData?.personal_data?.gender || 'Не указано'}
- Профессия: ${diagnosticData?.personal_data?.profession || 'Не указано'}
- Город: ${diagnosticData?.personal_data?.city || 'Не указано'}
- Спорт/Активность: ${diagnosticData?.personal_data?.sport || 'Не указано'}

🔍 ЖАЛОБЫ И АНАМНЕЗ:
- Что беспокоит: ${diagnosticData?.additional_answers?.discomfort || 'Не указано'}
- Поставленные диагнозы: ${diagnosticData?.additional_answers?.diagnosis || 'Не указано'}
- Принимаемые лекарства/БАДы: ${diagnosticData?.additional_answers?.treatment || 'Не указано'}`;

      if (diagnosticData?.quiz_answers && Object.keys(diagnosticData.quiz_answers).length > 0) {
        systemPrompt += `\n\n📋 РЕЗУЛЬТАТЫ ОПРОСА ПО СИСТЕМАМ ОРГАНИЗМА:`;
        
        // Группируем по системам для лучшего анализа
        const systemsMap = {};
        Object.entries(diagnosticData.quiz_answers).forEach(([id, data]) => {
          if (!systemsMap[data.system]) {
            systemsMap[data.system] = [];
          }
          systemsMap[data.system].push({
            question: data.question,
            answer: data.answer
          });
        });
        
        Object.entries(systemsMap).forEach(([system, answers]) => {
          systemPrompt += `\n\n🔸 ${system}:`;
          answers.forEach(item => {
            systemPrompt += `\n  • Вопрос: ${item.question}`;
            systemPrompt += `\n    Ответ: ${item.answer}`;
          });
        });
      }
      
      systemPrompt += `\n\n🎯 ИНСТРУКЦИИ:
- Проведи синдромальный анализ: группируй проблемы в логические блоки
- Обращай внимание на системы с негативными ответами
- Связывай жалобы с данными опроса
- Давай комплексные рекомендации с объяснением механизмов`;
    } else {
      // Добавляем полную диагностическую информацию в промпт
      systemPrompt += `\n\n📊 ДИАГНОСТИЧЕСКИЕ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:
      
👤 ПЕРСОНАЛЬНЫЕ ДАННЫЕ:
- ФИО: ${diagnosticData.personal_data.fullName || 'Не указано'}
- Возраст/Дата рождения: ${diagnosticData.personal_data.birthDate || 'Не указано'}
- Профессия: ${diagnosticData.personal_data.profession || 'Не указано'}
- Город: ${diagnosticData.personal_data.city || 'Не указано'}
- Вес: ${diagnosticData.personal_data.weight || 'Не указано'}
- Рост: ${diagnosticData.personal_data.height || 'Не указано'}
- Спорт: ${diagnosticData.personal_data.sport || 'Не указано'}
- Пол: ${diagnosticData.personal_data.gender || 'Не указано'}

🔍 ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ:
- Что беспокоит: ${diagnosticData.additional_answers.discomfort || 'Не указано'}
- Диагнозы: ${diagnosticData.additional_answers.diagnosis || 'Не указано'}
- Лечение: ${diagnosticData.additional_answers.treatment || 'Не указано'}

📋 РЕЗУЛЬТАТЫ ОПРОСА ПО СИСТЕМАМ ОРГАНИЗМА:`;

      // Группируем ответы по системам для лучшего синдромального анализа
      const systemsMap = {};
      Object.entries(diagnosticData.quiz_answers).forEach(([questionId, data]) => {
        if (!systemsMap[data.system]) {
          systemsMap[data.system] = [];
        }
        systemsMap[data.system].push({
          question: data.question,
          answer: data.answer
        });
      });
      
      Object.entries(systemsMap).forEach(([system, answers]) => {
        systemPrompt += `\n\n🔸 ${system}:`;
        answers.forEach(item => {
          systemPrompt += `\n  • Вопрос: ${item.question}`;
          systemPrompt += `\n    Ответ: ${item.answer}`;
        });
      });

      // Добавляем информацию о загруженных анализах
      if (diagnosticData.analysis_photos && diagnosticData.analysis_photos.length > 0) {
        systemPrompt += `\n\n📷 ЗАГРУЖЕННЫЕ АНАЛИЗЫ (${diagnosticData.analysis_photos.length} шт.):`;
        
        // Группируем анализы по категориям
        const groupedPhotos = {};
        diagnosticData.analysis_photos.forEach(photo => {
          if (!groupedPhotos[photo.analysis_group]) {
            groupedPhotos[photo.analysis_group] = [];
          }
          groupedPhotos[photo.analysis_group].push(photo);
        });

        Object.entries(groupedPhotos).forEach(([group, photos]) => {
          systemPrompt += `\n📁 ${group} (${photos.length} фото):`;
          photos.forEach((photo, index) => {
            const dateStr = photo.upload_date ? new Date(photo.upload_date).toLocaleDateString('ru-RU') : 'Дата неизвестна';
            systemPrompt += `\n  ${index + 1}. ${photo.photo_name || 'Фото'} (${dateStr})`;
            if (photo.description) {
              systemPrompt += `\n     Описание: ${photo.description}`;
            }
          });
        });
        
        systemPrompt += `\n\n⚠️ ВАЖНО: Анализы загружены как изображения. Если пользователь спрашивает о конкретных показателях, попроси его указать значения из анализов или опиши общие рекомендации на основе категории анализов.`;
      }

      systemPrompt += `\n\n✅ СТАТУС ПОЛЬЗОВАТЕЛЯ: ВСЁ ВЫПОЛНЕНО
- Диагностика: Пройдена ✅
- Анализы: Загружены ✅

🎯 МЕТОДОЛОГИЯ РАБОТЫ С ДАННЫМИ:

1. СИНДРОМАЛЬНЫЙ АНАЛИЗ:
   - Проанализируй все данные диагностики и анализов
   - Выяви взаимосвязанные блоки проблем (например: дефициты → усталость → проблемы с метаболизмом)
   - Группируй проблемы логически, не просто перечисляй симптомы

2. РАБОТА С АНАЛИЗАМИ:
   - Если в данных есть конкретные показатели (ферритин, витамин D, инсулин, глюкоза и т.д.) — используй их
   - Указывай целевые оптимальные значения, а не просто "норму"
   - Объясняй взаимосвязь между показателями и симптомами

3. СТРУКТУРА РЕКОМЕНДАЦИЙ:
   - Разбивай на категории: Питание, Добавки, Образ жизни, Физическая активность
   - Указывай последовательность и длительность
   - Объясняй механизм действия каждой рекомендации

4. ПЕРСОНАЛИЗАЦИЯ:
   - Учитывай возраст, пол, профессию, образ жизни из персональных данных
   - Обращай внимание на системы организма с проблемами (негативные ответы в квизе)
   - Связывай жалобы из "Что беспокоит" с данными диагностики

5. ОБРАЗОВАТЕЛЬНЫЙ КОМПОНЕНТ:
   - Объясняй почему возникают проблемы (биохимия, физиология)
   - Показывай взаимосвязи между разными системами
   - Давай обоснование каждой рекомендации

⛔ ЗАПРЕЩЕНО:
- НЕ ДОБАВЛЯЙ кнопки [BUTTON:...]
- НЕ пиши "Чтобы ответ был точнее" или подобные фразы
- НЕ рекомендуй пройти диагностику или загрузить анализы
- НЕ пиши "открой Диагностика" или "загрузи анализы"
- Пользователь УЖЕ ВСЁ СДЕЛАЛ, у тебя есть все данные!

💡 ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА:

"Завершена первичная обработка ваших диагностических данных. На основании жалоб и лабораторных показателей я составил предварительный синдромальный профиль.

СИНДРОМАЛЬНЫЙ АНАЛИЗ:

Блок 1: "Энергия и метаболизм"
• Данные: [конкретные показатели из анализов/диагностики]
• Интерпретация: [что это означает]
• Механизм: [почему это происходит]

КОМПЛЕКСНЫЙ ПРОТОКОЛ:
1. Восполнение дефицитов: [конкретные рекомендации с дозировками]
2. Питание: [персонализированные рекомендации]
3. Образ жизни: [специфические советы]

ПРОТИВОПОКАЗАНИЯ:
• [что нельзя в вашем случае]"`;
    }

    // DeepSeek не поддерживает vision - используем только текстовый формат
    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 3000 // Увеличено для более подробных профессиональных ответов
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

    // Сохраняем ответ ИИ в уже созданную запись (быстро и без повторного insert)
    if (requestId) {
      try {
        await requestService.setChatResponse(requestId, content);
      } catch (error) {
        console.error('Failed to update chat response:', error);
      }
    } else if (userInfo && userInfo.telegramId && currentChatId) {
      // fallback: старое поведение
      try {
        await requestService.saveRequestToChat(
          userInfo.telegramId,
          message,
          content,
          'chat',
          {
            userId: userInfo.id,
            chatId: currentChatId,
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            username: userInfo.username,
            languageCode: userInfo.languageCode,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString(),
            contextOverflow: shouldCreateNewChat
          },
          currentChatId
        );
      } catch (error) {
        console.error('Failed to save request to chat:', error);
      }
    }

    // Return response with chat info and quiz status
    const responsePayload = {
      success: true,
      response: content,
      chatId: currentChatId,
      newChatCreated: false,
      contextOverflow: false,
      quizCompleted: diagnosticData?.quiz_completed || false,
      analysesUploaded: diagnosticData?.analyses_uploaded || false,
      quizRecommendation: !diagnosticData?.quiz_completed ? 'Рекомендуем пройти персональную диагностику для получения точных рекомендаций' : null,
      analysesRecommendation: !diagnosticData?.analyses_uploaded ? 'Рекомендуем загрузить анализы для получения более точных рекомендаций' : null
    };

    return res.status(200).json(responsePayload);
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
