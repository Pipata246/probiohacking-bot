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

const SYSTEM_PROMPT = `Ты — PROBIOHACKING AI: персональный ассистент по здоровью и биохакингу.

ПРАВИЛА ФОРМАТИРОВАНИЯ (ВАЖНО!):
- Используй эмодзи в начале каждого раздела для наглядности
- Делай ОТСТУПЫ между абзацами (пустая строка)
- НЕ используй символы ** для выделения — просто пиши текст
- Используй нумерованные списки (1. 2. 3.) или буллеты (•) для рекомендаций
- Пиши структурировано: краткий вывод, затем рекомендации списком

Правила:
- Ты не заменяешь врача. При серьёзных симптомах рекомендуй обратиться к врачу
- Давай практичные рекомендации: образ жизни, сон, питание, тренировки, управление стрессом
- Если данных недостаточно — задавай уточняющие вопросы
- По умолчанию отвечай кратко (6–10 строк). Подробный разбор только по запросу
- Не назначай рецептурные препараты

КНОПКИ ДЕЙСТВИЙ:
- Если нужно направить на диагностику, в КОНЦЕ сообщения добавь: [BUTTON:DIAGNOSTIC:Пройти диагностику]
- Если нужно направить на загрузку анализов, в КОНЦЕ сообщения добавь: [BUTTON:ANALYSIS:Загрузить анализы]
- Кнопки добавляй ТОЛЬКО если они уместны и пользователь ещё не выполнил это действие`;

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
    
    // Формируем системный промпт с учетом диагностических данных
    let systemPrompt = SYSTEM_PROMPT;
    
    // Добавляем историю чата
    if (chatHistory) {
      systemPrompt += chatHistory;
    }
    
    if (!diagnosticData) {
      // Если не удалось получить данные, добавляем базовую рекомендацию
      systemPrompt += `\n\n⚠️ СТАТУС ПОЛЬЗОВАТЕЛЯ:
- Диагностика: НЕ ПРОЙДЕНА
- Анализы: НЕ ЗАГРУЖЕНЫ

В конце ответа добавь рекомендацию пройти диагностику и загрузить анализы.
Обязательно добавь кнопки:
[BUTTON:DIAGNOSTIC:Пройти диагностику]
[BUTTON:ANALYSIS:Загрузить анализы]`;
    } else if (!diagnosticData.quiz_completed && !diagnosticData.analyses_uploaded) {
      // Добавляем рекомендацию пройти квиз и загрузить анализы
      systemPrompt += `\n\n⚠️ СТАТУС ПОЛЬЗОВАТЕЛЯ:
- Диагностика: НЕ ПРОЙДЕНА
- Анализы: НЕ ЗАГРУЖЕНЫ

Для персонализированных рекомендаций мягко предложи пройти диагностику и загрузить анализы.
В конце сообщения ОБЯЗАТЕЛЬНО добавь кнопки:
[BUTTON:DIAGNOSTIC:Пройти диагностику]
[BUTTON:ANALYSIS:Загрузить анализы]`;
    } else if (!diagnosticData.quiz_completed) {
      // Добавляем рекомендацию пройти квиз
      systemPrompt += `\n\n⚠️ СТАТУС ПОЛЬЗОВАТЕЛЯ:
- Диагностика: НЕ ПРОЙДЕНА
- Анализы: Загружены ✅

Для более точных рекомендаций предложи пройти диагностику.
В конце сообщения ОБЯЗАТЕЛЬНО добавь кнопку:
[BUTTON:DIAGNOSTIC:Пройти диагностику]`;
    } else if (!diagnosticData.analyses_uploaded) {
      // Добавляем рекомендацию загрузить анализы
      systemPrompt += `\n\n⚠️ СТАТУС ПОЛЬЗОВАТЕЛЯ:
- Диагностика: Пройдена ✅
- Анализы: НЕ ЗАГРУЖЕНЫ

Для более точных рекомендаций предложи загрузить анализы.
В конце сообщения ОБЯЗАТЕЛЬНО добавь кнопку:
[BUTTON:ANALYSIS:Загрузить анализы]`;
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

      // Добавляем ответы по системам организма
      Object.entries(diagnosticData.quiz_answers).forEach(([questionId, data]) => {
        systemPrompt += `\n- ${data.system}: ${data.question} → Ответ: "${data.answer}"`;
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
            systemPrompt += `\n  ${index + 1}. ${photo.photo_name || 'Фото'} (${photo.upload_date ? new Date(photo.upload_date).toLocaleDateString() : 'Дата неизвестна'})`;
          });
        });
      }

      systemPrompt += `\n\n✅ СТАТУС ПОЛЬЗОВАТЕЛЯ: ВСЁ ВЫПОЛНЕНО
- Диагностика: Пройдена ✅
- Анализы: Загружены ✅

🎯 ИНСТРУКЦИИ ДЛЯ ИИ:
1. Учитывай все диагностические данные при формировании рекомендаций
2. Обращай внимание на системы, где есть проблемы (негативные ответы)
3. Давай персонализированные советы основываясь на конкретных ответах
4. Учитывай возраст, пол, профессию и образ жизни
5. Ссылайся на диагностические данные когда это уместно
6. Если есть загруженные анализы, учитывай их при рекомендациях

⛔ ЗАПРЕЩЕНО:
- НЕ ДОБАВЛЯЙ кнопки [BUTTON:...]
- НЕ пиши "Чтобы ответ был точнее" или подобные фразы
- НЕ рекомендуй пройти диагностику или загрузить анализы
- НЕ пиши "открой Диагностика" или "загрузи анализы"
- Пользователь УЖЕ ВСЁ СДЕЛАЛ, у тебя есть все данные!`;
    }

    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
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
