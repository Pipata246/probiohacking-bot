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

// Функция для получения диагностических данных пользователя (оптимизированная)
async function getUserDiagnosticData(userId) {
  try {
    // Параллельно получаем данные пользователя и ответы для ускорения
    const [userResult, answersResult] = await Promise.all([
      supabase
        .from('users')
        .select('quiz_completed, analyses_uploaded')
        .eq('telegram_id', userId)
        .single(),
      supabase
        .from('quiz_answers')
        .select('question_id, answer_text, question_text')
        .eq('telegram_id', userId)
        .order('created_at', { ascending: true })
    ]);

    const { data: userData, error: userError } = userResult;
    const { data: answers, error: answersError } = answersResult;

    if (userError || !userData) {
      console.log('User not found or error:', userError);
      return null;
    }

    if (answersError) {
      console.error('Error fetching diagnostic answers:', answersError);
      return null;
    }

    // Получаем фотографии анализов только если они есть (асинхронно, не блокируем)
    let analysisPhotos = [];
    if (userData.analyses_uploaded) {
      const { data: photos } = await supabase
        .from('user_analysis_photos')
        .select('analysis_group')
        .eq('telegram_id', userId)
        .limit(20); // Ограничиваем для скорости

      if (photos) {
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
  
  return `Ты — PROBIOHACKING AI "Профи": специалист по функциональной медицине. 📅 ${dateStr}. МЕТОД: Синдромальный анализ → блоки проблем → рекомендации с механизмами. ФОРМАТ: Эмодзи, списки, отступы. Без ** и [BUTTON:...]. ОГРАНИЧЕНИЯ: Не заменяешь врача. Не рецептурные препараты.`;
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
    let subscriptionActive = false;
    let freeRequestsCount = 0;
    
    if (telegramUser && telegramUser.id) {
      try {
        // Получаем initData из Telegram WebApp
        const telegramWebAppData = req.headers['x-telegram-webapp-data'] || 
                                  req.body?.telegramWebAppData || 
                                  window?.Telegram?.WebApp?.initData;
        
        userInfo = await initUserFromWebApp(req);
        console.log('User info:', userInfo ? `${userInfo.telegramId} (${userInfo.firstName})` : 'Not created');
        console.log('Has WebApp data:', !!telegramWebAppData);
        
        // Проверяем статус подписки
        if (userInfo && userInfo.id) {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('subscription_active, free_requests_count')
            .eq('id', userInfo.id)
            .single();
          
          if (!userError && userData) {
            subscriptionActive = userData.subscription_active === true;
            freeRequestsCount = userData.free_requests_count ?? 0;
            console.log('Subscription status:', { subscriptionActive, freeRequestsCount });
            
            // Проверяем лимит для бесплатных пользователей
            if (!subscriptionActive && freeRequestsCount >= 3) {
              return res.status(200).json({
                success: true,
                response: 'Вы использовали все бесплатные запросы. Для продолжения работы оформите подписку в боте.',
                subscriptionRequired: true,
                freeRequestsCount: freeRequestsCount,
                chatId: null,
                newChatCreated: false,
                contextOverflow: false,
                quizCompleted: false,
                analysesUploaded: false
              });
            }
          }
        }
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

    // Параллельно получаем историю чата и диагностические данные для ускорения
    let chatHistory = '';
    let diagnosticData = null;
    
    const [chatHistoryResult, diagnosticDataResult] = await Promise.all([
      // Получаем историю чата
      (async () => {
        if (!userInfo || !userInfo.id) return null;
        try {
          const { data: activeChatId } = await supabase.rpc('get_active_chat', {
            p_user_id: userInfo.id
          });
          if (!activeChatId) return null;
          
          const { data: messages } = await supabase
            .from('user_requests')
            .select('message_text, response_text')
            .eq('user_id', userInfo.id)
            .eq('chat_id', activeChatId)
            .order('created_at', { ascending: false })
            .limit(3); // Уменьшено до 3 для скорости
          
          if (messages && messages.length > 0) {
            let history = '\n💬 История:\n';
            messages.reverse().forEach((msg) => {
              if (msg.message_text) history += `П: ${msg.message_text.substring(0, 60)}...\n`;
              if (msg.response_text) history += `ИИ: ${msg.response_text.substring(0, 80)}...\n`;
            });
            return history;
          }
        } catch (error) {
          console.error('Error loading chat history:', error);
        }
        return null;
      })(),
      // Получаем диагностические данные
      (async () => {
        if (!userInfo || !userInfo.telegramId) return null;
        return await getUserDiagnosticData(userInfo.telegramId);
      })()
    ]);
    
    chatHistory = chatHistoryResult || '';
    diagnosticData = diagnosticDataResult || null;
    
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
      // Компактное сообщение
      systemPrompt += `\n⚠️ Нет данных диагностики и анализов. Отвечай на основе общих знаний.`;
    } else if (!quizDone && analysesDone) {
      // Компактный формат
      systemPrompt += `\n⚠️ Статус: Анализы загружены, диагностики нет. Работай с категориями анализов.`;
      
      // Компактная информация об анализах
      if (diagnosticData?.analysis_photos?.length > 0) {
        const groupedPhotos = {};
        diagnosticData.analysis_photos.forEach(photo => {
          if (!groupedPhotos[photo.analysis_group]) groupedPhotos[photo.analysis_group] = 0;
          groupedPhotos[photo.analysis_group]++;
        });
        systemPrompt += `\n📷 Анализы: ${Object.entries(groupedPhotos).map(([g, c]) => `${g}(${c})`).join(', ')}. При показателях — попроси значения.`;
      }
    } else if (quizDone && !analysesDone) {
      // Компактный формат для ускорения
      const p = diagnosticData?.personal_data || {};
      systemPrompt += `\n\n📊 Данные: ${p.fullName || 'не указано'}, ${p.birthDate || 'возраст не указан'}, ${p.gender || 'пол не указан'}, ${p.weight || '?'}кг/${p.height || '?'}см, ${p.profession || 'профессия не указана'}, спорт: ${p.sport || 'не указан'}. Жалобы: ${diagnosticData?.additional_answers?.discomfort || 'не указано'}. Диагнозы: ${diagnosticData?.additional_answers?.diagnosis || 'не указано'}. Лечение: ${diagnosticData?.additional_answers?.treatment || 'не указано'}.`;

      if (diagnosticData?.quiz_answers && Object.keys(diagnosticData.quiz_answers).length > 0) {
        // Компактная группировка по системам
        const systemsMap = {};
        Object.entries(diagnosticData.quiz_answers).forEach(([id, data]) => {
          if (!systemsMap[data.system]) systemsMap[data.system] = [];
          systemsMap[data.system].push(data.answer);
        });
        
        Object.entries(systemsMap).forEach(([system, answers]) => {
          systemPrompt += `\n${system}: ${answers.join('; ')}`;
        });
      }
      
      systemPrompt += `\n🎯 Группируй в блоки, связывай жалобы с опросом, рекомендации с механизмами.`;
    } else {
      // Компактный формат данных для ускорения обработки
      const personal = diagnosticData.personal_data;
      systemPrompt += `\n\n📊 Данные: ${personal.fullName || 'не указано'}, ${personal.birthDate || 'возраст не указан'}, ${personal.gender || 'пол не указан'}, ${personal.weight || '?'}кг/${personal.height || '?'}см, ${personal.profession || 'профессия не указана'}, спорт: ${personal.sport || 'не указан'}. Жалобы: ${diagnosticData.additional_answers.discomfort || 'не указано'}. Диагнозы: ${diagnosticData.additional_answers.diagnosis || 'не указано'}. Лечение: ${diagnosticData.additional_answers.treatment || 'не указано'}.`;

      // Компактная группировка по системам
      const systemsMap = {};
      Object.entries(diagnosticData.quiz_answers).forEach(([questionId, data]) => {
        if (!systemsMap[data.system]) systemsMap[data.system] = [];
        systemsMap[data.system].push(data.answer);
      });
      
      Object.entries(systemsMap).forEach(([system, answers]) => {
        systemPrompt += `\n${system}: ${answers.join('; ')}`;
      });

      // Компактная информация об анализах
      if (diagnosticData.analysis_photos && diagnosticData.analysis_photos.length > 0) {
        const groupedPhotos = {};
        diagnosticData.analysis_photos.forEach(photo => {
          if (!groupedPhotos[photo.analysis_group]) groupedPhotos[photo.analysis_group] = 0;
          groupedPhotos[photo.analysis_group]++;
        });
        systemPrompt += `\n📷 Анализы: ${Object.entries(groupedPhotos).map(([g, c]) => `${g}(${c})`).join(', ')}. При запросе показателей — попроси значения.`;
      }

      systemPrompt += `\n✅ Группируй в блоки, используй целевые значения, рекомендации по категориям с механизмами. Запрещено: [BUTTON:...], просить диагностику.`;
    }
    
    // Оптимизация промпта: сокращаем для ускорения (убираем лишние пробелы и переносы)
    systemPrompt = systemPrompt.replace(/\n{3,}/g, '\n\n').trim();

    // DeepSeek не поддерживает vision - используем только текстовый формат
    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.9, // Увеличено для более быстрой генерации
      max_tokens: 1000, // Уменьшено для ускорения
      top_p: 0.98 // Увеличено для ускорения генерации
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

    // Увеличиваем счетчик запросов для бесплатных пользователей
    if (userInfo && userInfo.id && !subscriptionActive) {
      try {
        const newCount = freeRequestsCount + 1;
        await supabase
          .from('users')
          .update({ free_requests_count: newCount })
          .eq('id', userInfo.id);
        console.log(`Updated free requests count: ${freeRequestsCount} -> ${newCount}`);
      } catch (error) {
        console.error('Failed to update free requests count:', error);
      }
    }
    
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

    // Формируем ответ с учетом подписки
    // Для бесплатных пользователей не показываем рекомендации по диагностике и анализам
    let quizRecommendation = null;
    let analysesRecommendation = null;
    
    if (subscriptionActive) {
      // Только для пользователей с подпиской показываем рекомендации
      quizRecommendation = !diagnosticData?.quiz_completed ? 'Рекомендуем пройти персональную диагностику для получения точных рекомендаций' : null;
      analysesRecommendation = !diagnosticData?.analyses_uploaded ? 'Рекомендуем загрузить анализы для получения более точных рекомендаций' : null;
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
      quizRecommendation: quizRecommendation,
      analysesRecommendation: analysesRecommendation,
      subscriptionActive: subscriptionActive,
      freeRequestsCount: !subscriptionActive ? (freeRequestsCount + 1) : null,
      remainingFreeRequests: !subscriptionActive ? Math.max(0, 3 - (freeRequestsCount + 1)) : null
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
