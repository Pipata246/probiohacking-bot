const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Import Supabase client and middleware
const { requestService, chatService } = require('../supabase/client.js');
const { initUserFromWebApp } = require('../supabase/userMiddleware.js');
const { analyzePhotoWithVision } = require('../supabase/visionClient.js');
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
    let analysisDescriptions = {}; // Кэш описаний анализов
    
    if (userData.analyses_uploaded) {
      const { data: photos } = await supabase
        .from('user_analysis_photos')
        .select('id, analysis_group, photo_url, description') // Добавляем description
        .eq('telegram_id', userId)
        .limit(20); // Ограничиваем для скорости

      if (photos) {
        analysisPhotos = photos;
        // Собираем описания в кэш
        photos.forEach(photo => {
          if (photo.description && photo.description.trim() !== '') {
            analysisDescriptions[photo.id] = photo.description;
          }
        });
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
      analysis_photos: analysisPhotos,
      analysis_descriptions: analysisDescriptions, // Добавляем описания анализов
      current_program: null,
      today_diary: []
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

    // Загружаем текущую сохранённую программу здоровья (если есть)
    try {
      const { data: program } = await supabase
        .from('health_programs')
        .select('supplements, nutrition, stress, sleep, goals, request, created_at')
        .eq('telegram_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (program) {
        let goalsArray = [];
        if (program.goals) {
          goalsArray = String(program.goals)
            .split(/\r?\n/)
            .map((g) => g.trim())
            .filter(Boolean);
        }

        diagnosticData.current_program = {
          supplements: program.supplements || '',
          nutrition: program.nutrition || '',
          stress: program.stress || '',
          sleep: program.sleep || '',
          goals: goalsArray,
          request: program.request || null,
          created_at: program.created_at || null
        };
      }
    } catch (e) {
      console.warn('Failed to load current health_program for diagnosticData:', e.message);
    }

    // Загружаем дневник только за один день (сегодня) чтобы не перегружать контекст
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);

      const { data: diary } = await supabase
        .from('diary_entries')
        .select('entry_date, entry_time, title, notes, request')
        .eq('telegram_id', userId)
        .eq('entry_date', todayStr)
        .order('entry_time', { ascending: true });

      if (Array.isArray(diary) && diary.length > 0) {
        diagnosticData.today_diary = diary;
      }
    } catch (e) {
      console.warn('Failed to load today diary for diagnosticData:', e.message);
    }

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

/**
 * Функция для обработки анализов - параллельная генерация описаний через Vision если нужно
 */
async function processAnalysisPhotosWithVision(analysisPhotos, diagnosticData) {
  try {
    if (!analysisPhotos || analysisPhotos.length === 0) {
      console.log('📊 Анализов нет');
      return diagnosticData;
    }

    // Определяем какие анализы нуждаются в описании
    const photosNeedingAnalysis = analysisPhotos.filter(photo => 
      !photo.description || photo.description.trim() === ''
    );

    if (photosNeedingAnalysis.length === 0) {
      console.log(`✅ Все ${analysisPhotos.length} анализов имеют описание (кэш)`);
      return diagnosticData;
    }

    console.log(`🔄 Запускаем Vision (Yandex) для ${photosNeedingAnalysis.length} анализов/PDF параллельно...`);

    // Запускаем Vision параллельно для всех анализов без описания
    const visionPromises = photosNeedingAnalysis.map(async (photo) => {
      try {
        // Определяем, является ли файл PDF
        const isPdf = photo.file_type === 'pdf' || photo.photo_url.toLowerCase().endsWith('.pdf');
        
        const description = await analyzePhotoWithVision(photo.photo_url, photo.analysis_group, isPdf);
        
        // Сохраняем описание в БД (параллельно, не блокируем основной поток)
        supabase
          .from('user_analysis_photos')
          .update({ description })
          .eq('id', photo.id)
          .catch(err => console.error(`❌ Ошибка сохранения описания для ${photo.id}:`, err));

        return { id: photo.id, description };
      } catch (error) {
        console.error(`⚠️  Ошибка Vision для анализа ${photo.analysis_group}:`, error.message);
        return {
          id: photo.id,
          description: `[Ошибка: ${error.message}]`
        };
      }
    });

    // Ждем всех Vision запросов
    const visionResults = await Promise.all(visionPromises);

    // Обновляем кэш описаний в diagnostic data
    visionResults.forEach(result => {
      diagnosticData.analysis_descriptions[result.id] = result.description;
    });

    console.log(`✅ Vision (Yandex) завершил анализ ${visionResults.length} файлов`);
    return diagnosticData;

  } catch (error) {
    console.error('❌ Ошибка в processAnalysisPhotosWithVision:', error);
    return diagnosticData;
  }
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
  
  return `Ты — PROBIOHACKING AI "Профи": специалист по функциональной медицине. 📅 ${dateStr}. МЕТОД: Синдромальный анализ → блоки проблем → рекомендации с механизмами. ФОРМАТ: Эмодзи, списки, отступы. Без ** и [BUTTON:...]. ОГРАНИЧЕНИЯ: Не заменяешь врача. Не рецептурные препараты. Всегда помни, что персональная программа и дневник действий составляются на ближайший месяц (30 дней).`;
}

// Вспомогательная функция: извлечь структурированную программу (health + diary) из ответа ИИ
function extractProgramFromContent(text) {
  const result = {
    healthProgram: null,
    diaryEntries: [],
    cleanedText: text || ''
  };

  if (!text || typeof text !== 'string') return result;

  const START = '=== STRUCTURED_PROGRAM_JSON_START ===';
  const END = '=== STRUCTURED_PROGRAM_JSON_END ===';
  const startIdx = text.indexOf(START);
  const endIdx = text.indexOf(END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    // Маркеры не найдены — пробуем извлечь JSON-блок эвристически (как в скрине у пользователя)
    try {
      // Ищем последнее вхождение "health" или "diary" и ближайшую открывающую фигурную скобку перед ним
      const healthPos = text.lastIndexOf('"health"');
      const diaryPos = text.lastIndexOf('"diary"');
      const anchor = Math.max(healthPos, diaryPos);

      if (anchor !== -1) {
        const beforeAnchor = text.slice(0, anchor);
        const jsonStart = beforeAnchor.lastIndexOf('{');
        const jsonEnd = text.lastIndexOf('}');

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          const candidate = text.slice(jsonStart, jsonEnd + 1).trim();

          try {
            const parsed = JSON.parse(candidate);
            const health = parsed.health || parsed.healthProgram || null;
            const diary = Array.isArray(parsed.diary) ? parsed.diary : [];

            if (health) {
              const goalsArray = Array.isArray(health.goals)
                ? health.goals.map((g) => String(g || '').trim()).filter(Boolean)
                : [];

              result.healthProgram = {
                supplements: health.supplements || '',
                nutrition: health.nutrition || '',
                stress: health.stress || '',
                sleep: health.sleep || '',
                goals: goalsArray
              };
            }

            result.diaryEntries = diary
              .map((entry) => ({
                time: (entry.time || entry.entry_time || '').trim(),
                title: (entry.title || entry.name || '').trim(),
                notes: (entry.notes || entry.comment || '').trim()
              }))
              .filter((e) => e.time && e.title);

            // Вырезаем этот JSON-блок из видимого текста
            const before = text.slice(0, jsonStart).trimEnd();
            const after = text.slice(jsonEnd + 1).trimStart();
            result.cleanedText = `${before}\n\n${after}`.trim();

            return result;
          } catch (innerErr) {
            console.warn('Heuristic JSON parse failed in extractProgramFromContent:', innerErr.message);
          }
        }
      }
    } catch (e) {
      console.warn('Heuristic JSON extraction error:', e.message);
    }

    // Ничего не смогли извлечь — возвращаем исходный текст без изменений
    return result;
  }

  let jsonStr = text.slice(startIdx + START.length, endIdx).trim();
  // На всякий случай убираем висячие запятые перед } и ] чтобы не ломать JSON.parse
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  // Убираем JSON-блок из видимого текста
  const before = text.slice(0, startIdx).trimEnd();
  const after = text.slice(endIdx + END.length).trimStart();
  result.cleanedText = `${before}\n\n${after}`.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    const health = parsed.health || parsed.healthProgram || null;
    const diary = Array.isArray(parsed.diary) ? parsed.diary : [];

    if (health) {
      const goalsArray = Array.isArray(health.goals)
        ? health.goals.map((g) => String(g || '').trim()).filter(Boolean)
        : [];

      result.healthProgram = {
        supplements: health.supplements || '',
        nutrition: health.nutrition || '',
        stress: health.stress || '',
        sleep: health.sleep || '',
        goals: goalsArray
      };
    }

    result.diaryEntries = diary
      .map((entry) => ({
        time: (entry.time || entry.entry_time || '').trim(),
        title: (entry.title || entry.name || '').trim(),
        notes: (entry.notes || entry.comment || '').trim()
      }))
      .filter((e) => e.time && e.title);
  } catch (e) {
    console.warn('Failed to parse STRUCTURED_PROGRAM JSON:', e.message);
  }

  return result;
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

    const { message, telegramUser, mode, replaceRequestIndex } = req.body || {};
    const responseMode = mode || 'detailed'; // 'quick' или 'detailed'
    // replaceRequestIndex: 0 или 1 если пользователь заменяет один из запросов программы, null/undefined иначе

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid message' });
    }

    console.log(`📝 Chat mode: ${responseMode}, Message length: ${message.length}, Replace index: ${replaceRequestIndex}`);

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
        
        // Проверяем лимит для бесплатных пользователей ПОСЛЕ сохранения сообщения
        if (!subscriptionActive && freeRequestsCount >= 3) {
          const subscriptionMessage = 'Вы использовали все бесплатные запросы. Для продолжения работы оформите подписку в боте.';
          
          // Сохраняем ответ о подписке в БД (это НЕ заглушка, а полноценный ответ ИИ)
          if (requestId) {
            try {
              await requestService.setChatResponse(requestId, subscriptionMessage);
              console.log('✅ Subscription message saved to DB');
            } catch (error) {
              console.error('Error saving subscription response:', error);
            }
          }
          
          // Загружаем диагностические данные для ответа
          let diagnosticDataForLimit = null;
          if (userInfo && userInfo.telegramId) {
            diagnosticDataForLimit = await getUserDiagnosticData(userInfo.telegramId);
          }
          
          return res.status(200).json({
            success: true,
            response: subscriptionMessage,
            subscriptionRequired: true,
            freeRequestsCount: freeRequestsCount,
            chatId: currentChatId,
            newChatCreated: false,
            contextOverflow: false,
            quizCompleted: diagnosticDataForLimit?.quiz_completed || false,
            analysesUploaded: diagnosticDataForLimit?.analyses_uploaded || false
          });
        }
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
      // Получаем статусы для обоих режимов, но полные данные только для detailed
      (async () => {
        if (!userInfo || !userInfo.telegramId) return null;
        const data = await getUserDiagnosticData(userInfo.telegramId);
        if (responseMode === 'quick') {
          // 🚀 Quick mode: только статусы, NO данные
          return {
            quiz_completed: data?.quiz_completed,
            analyses_uploaded: data?.analyses_uploaded
          };
        }
        // 📋 Detailed mode: полные данные
        return data;
      })()
    ]);
    
    chatHistory = chatHistoryResult || '';
    diagnosticData = diagnosticDataResult || null;

    // 🎯 ИНТЕГРАЦИЯ Vision: СНАЧАЛА ждём результат Vision, ПОТОМ формируем промпт
    // Иначе описания анализов (колонка description) не попадут в контекст для ИИ
    if (diagnosticData && diagnosticData.analysis_photos && diagnosticData.analysis_photos.length > 0) {
      console.log('🔄 Обрабатываем анализы через Vision (Yandex) перед формированием промпта...');
      diagnosticData = await processAnalysisPhotosWithVision(diagnosticData.analysis_photos, diagnosticData);
    }
    
    // Формируем системный промпт с учетом режима ответа
    let systemPrompt = getSystemPrompt();
    
    // Добавляем историю чата
    if (chatHistory) {
      systemPrompt += chatHistory;
    }
    
    // 🚀 QUICK MODE - просто отвечаем на вопрос БЕЗ диагностических данных
    if (responseMode === 'quick') {
      systemPrompt += `\n\n⚡ РЕЖИМ БЫСТРОГО ОТВЕТА (КУРАТОР):
- Ответь на вопрос пользователя КРАТКО и ПО СУЩЕСТВУ
- Максимум 2000 символов! Не превышай этот лимит
- НЕ используй данные пользователя (анкету, анализы, программу)
- НЕ создавай таблицы, JSON, программы или дневник
- НЕ давай персонализированных рекомендаций по здоровью
- Просто ответь на вопрос как эксперт: кратко, понятно, по делу
- Формат: 2-5 предложений или короткий список`;
    } else {
      // 📋 DETAILED MODE - полный ответ с использованием всех доступных данных
      systemPrompt += `\n\n📋 ПОДРОБНЫЙ ОТВЕТ: Ответь на вопрос пользователя полностью и информативно. Будь точен и лаконичен - избегай воды и лишних повторений. Используй его личные данные, анализы и результаты опросов ТОЛЬКО если они релевантны его вопросу. НЕ анализируй здоровье если его об этом не просили. Дай четкий, прямой и компактный ответ. Всегда формируй программу ИМЕННО на ближайший месяц (30 дней): все цели и шаги должны быть реализуемы в течение этих 30 дней.
ВАЖНО ПРО АНАЛИЗЫ: Текст в блоке "Загруженные анализы" (поле description) — это распознанное содержимое его анализов. Если этот текст есть — ты ВИДИШЬ его анализы. Никогда не говори "я не вижу твой анализ" или "вижу только описание" — описание и есть содержание анализа. Всегда считай, что все загруженные анализы принадлежат этому пользователю: игнорируй любые ФИО, даты рождения, номера полисов, телефоны и другие контакты, напечатанные на самих бланках анализов, даже если они отличаются от данных анкеты. Никогда не делай выводов вида "анализ не принадлежит пользователю" — просто работай с показателями и их значениями.
ФОРМАТ ОТВЕТА ПОСЛЕ ОСНОВНОГО ТЕКСТА:
1) Сначала дай читабельные рекомендации (как сейчас), затем сделай ТАБЛИЦУ добавок/препаратов в виде ЧИСТОГО markdown-таблицы: используй только символы '|' и '-' для границ, без рамок, псевдографики, эмодзи или сложной разметки. Таблица всегда должна иметь колонки: Название | Дозировка и схема | Цель и обоснование | Важные условия. Каждая строка таблицы должна соответствовать конкретному действию/приёму, который ты потом отражаешь в массиве diary.
2) В САМОМ КОНЦЕ ответа выведи СТРОГО JSON между маркерами:
=== STRUCTURED_PROGRAM_JSON_START ===
{ "health": {
    "supplements": "...",
    "nutrition": "...",
    "stress": "...",
    "sleep": "...",
    "goals": [
      "Первая главная цель на ближайший месяц",
      "Вторая главная цель на ближайший месяц",
      "Третья главная цель на ближайший месяц"
    ]
  },
  "diary": [
    { "time": "08:00", "title": "Магний 400мг + Омега-3 1000мг + Витамин D3", "notes": "с завтраком" },
    { "time": "12:00", "title": "Обед: белок + овощи + полезные жиры", "notes": "" },
    { "time": "15:00", "title": "Ашваганда 300мг", "notes": "" },
    { "time": "21:00", "title": "Глицин 1000мг + мелатонин 1мг", "notes": "за 30 мин до сна" }
  ]
}
=== STRUCTURED_PROGRAM_JSON_END ===
Где:
- health.supplements — краткое решение по нутрицевтикам и добавкам;
- health.nutrition — конкретные рекомендации по питанию;
- health.stress — рекомендации по управлению стрессом и нагрузкой;
- health.sleep — рекомендации по сну и восстановлению;
- health.goals — массив из РОВНО трёх чётких главных целей на ближайший месяц (одна цель — одна строка);
- diary — массив шагов/приёмов на день: time в формате ЧЧ:ММ, title — что делать/принимать, notes — короткое пояснение (можно пустое). diary описывает ДЕЙСТВИЯ на один типичный день программы; сервер сам размножит этот распорядок на месяц.
⚠️ КРИТИЧЕСКИ ВАЖНО для diary:
   - КАЖДОЕ ВРЕМЯ ДОЛЖНО БЫТЬ УНИКАЛЬНЫМ! Нельзя создавать несколько записей на одно время (например, 5 записей на 08:00).
   - Если нужно принять несколько добавок утром — ОБЪЕДИНИ их в ОДНУ запись: { "time": "08:00", "title": "Коэнзим Q10 100мг + Ацетил-L-Карнитин 500мг + Цитиколин 250мг", "notes": "с завтраком" }
   - Или разнеси по разному времени: 08:00, 08:30, 09:00 и т.д.
   - В итоговом diary НЕ ДОЛЖНО БЫТЬ двух записей с одинаковым time!
Не добавляй комментариев вокруг JSON и не вставляй туда лишний текст.`;
      
      // Добавляем контекст с данными (включая description из user_analysis_photos)
      if (diagnosticData) {
        let context = `\n\n📊 Доступные данные о пользователе (используй если релевантно):\n`;
        
        // Личные данные
        if (diagnosticData.personal_data) {
          const p = diagnosticData.personal_data;
          context += `✓ Профиль: ${p.fullName || 'неизвестно'}, ${p.birthDate || 'возраст не указан'}, ${p.gender || 'пол не указан'}`;
          if (p.weight && p.height) context += `, ${p.weight}кг/${p.height}см`;
          if (p.profession) context += `, ${p.profession}`;
          if (p.sport) context += `, спорт: ${p.sport}`;
          context += `\n`;
        }
        
        // Жалобы и диагнозы если есть
        if (diagnosticData.additional_answers) {
          const add = diagnosticData.additional_answers;
          if (add.discomfort) context += `✓ Жалобы: ${add.discomfort}\n`;
          if (add.diagnosis) context += `✓ Диагнозы: ${add.diagnosis}\n`;
          if (add.treatment) context += `✓ Лечение: ${add.treatment}\n`;
        }
        
        // Результаты опроса
        if (diagnosticData.quiz_answers && Object.keys(diagnosticData.quiz_answers).length > 0) {
          const systemsMap = {};
          Object.entries(diagnosticData.quiz_answers).forEach(([id, data]) => {
            if (!systemsMap[data.system]) systemsMap[data.system] = [];
            systemsMap[data.system].push(data.answer);
          });
          
          context += `✓ Опрос:\n`;
          Object.entries(systemsMap).forEach(([system, answers]) => {
            context += `  - ${system}: ${answers.join(', ')}\n`;
          });
        }
        
        // Анализы — ВАЖНО: используем колонку description из user_analysis_photos
        if (diagnosticData.analysis_photos && diagnosticData.analysis_photos.length > 0) {
          const groupedPhotos = {};
          diagnosticData.analysis_photos.forEach(photo => {
            if (!groupedPhotos[photo.analysis_group]) groupedPhotos[photo.analysis_group] = [];
            groupedPhotos[photo.analysis_group].push(photo);
          });
          
          context += `✓ Загруженные анализы пользователя (содержимое его файлов — распознанный текст):\n`;
          Object.entries(groupedPhotos).forEach(([group, photos]) => {
            context += `  📊 ${group}: ${photos.length} файл(ов)\n`;
            photos.forEach((photo, idx) => {
              // Берём description из колонки БД или из analysis_descriptions (после Vision)
              const desc = diagnosticData.analysis_descriptions?.[photo.id] ?? photo.description;
              if (desc && String(desc).trim() !== '') {
                const snippet = String(desc).substring(0, 1200);
                context += `     Файл ${idx + 1}: ${snippet}${snippet.length >= 1200 ? '...' : ''}\n`;
              } else {
                context += `     Файл ${idx + 1}: [описание пока не сгенерировано]\n`;
              }
            });
          });
        }
        
        // Текущая сохранённая программа здоровья (если есть)
        if (diagnosticData.current_program) {
          const hp = diagnosticData.current_program;
          // Определяем запросы программы (могут быть в JSON-массиве или как строка)
          let programRequests = [];
          if (hp.request) {
            const raw = String(hp.request).trim();
            if (raw.startsWith('[')) {
              try { programRequests = JSON.parse(raw); } catch (_) { programRequests = [raw]; }
            } else {
              programRequests = [raw];
            }
          }
          
          // Проверяем: пользователь заменяет один из запросов?
          const isReplacing = replaceRequestIndex !== null && replaceRequestIndex !== undefined && programRequests.length >= 2;
          const keepRequestIndex = isReplacing ? (replaceRequestIndex === 0 ? 1 : 0) : null;
          const keepRequest = isReplacing ? programRequests[keepRequestIndex] : null;
          
          if (isReplacing) {
            // РЕЖИМ ЗАМЕНЫ: пользователь заменяет один из запросов программы
            context += `\n⚠️ РЕЖИМ ЗАМЕНЫ ЗАПРОСА:\n`;
            context += `   Пользователь ЗАМЕНЯЕТ запрос ${replaceRequestIndex + 1} на новый.\n`;
            context += `   Оставшийся запрос: "${keepRequest}"\n`;
            context += `   Новый запрос: текущее сообщение пользователя\n`;
            context += `   ЗАДАЧА: Создай НОВУЮ ОБЪЕДИНЁННУЮ программу на основе:\n`;
            context += `     1) Оставшегося запроса: "${keepRequest}"\n`;
            context += `     2) Нового запроса пользователя (его текущее сообщение)\n`;
            context += `   Программа должна быть БЕЗ ДУБЛЕЙ. В diary каждое время уникально!\n`;
            context += `   Игнорируй старые рекомендации по заменяемому запросу — они будут удалены.\n`;
            context += `   ОБЯЗАТЕЛЬНО выведи JSON между маркерами === STRUCTURED_PROGRAM_JSON_START === и === STRUCTURED_PROGRAM_JSON_END ===\n\n`;
          } else {
            // ОБЫЧНЫЙ РЕЖИМ: добавление к существующей программе
            const requestsDisplay = programRequests.length > 0
              ? programRequests.map((r, i) => `${i + 1}) "${r}"`).join('; ')
              : 'не указан';

            context += `\n✓ ТЕКУЩАЯ ПЕРСОНАЛЬНАЯ ПРОГРАММА (составлена по запросам: ${requestsDisplay}):\n`;
            context += `⚠️ ВАЖНО: У пользователя УЖЕ ЕСТЬ программа. Ты должен ОБЪЕДИНИТЬ её с новым запросом:\n`;
            context += `   - НЕ дублируй добавки/действия, которые уже есть в программе\n`;
            context += `   - Если новый запрос противоречит старому — замени старое на новое\n`;
            context += `   - Если новый запрос дополняет — добавь новое к существующему\n`;
            context += `   - В итоговом JSON выдай ОБЪЕДИНЁННУЮ программу (health + diary) без дублей\n`;
            context += `   - В diary КАЖДОЕ ВРЕМЯ УНИКАЛЬНО! Если на одно время несколько добавок — объедини в одну строку через " + "\n`;
          }

          if (hp.goals && Array.isArray(hp.goals) && hp.goals.length > 0) {
            context += `  Цели на ближайший месяц:\n`;
            hp.goals.forEach((g, idx) => {
              context += `   ${idx + 1}) ${g}\n`;
            });
          }
          if (hp.supplements) {
            const s = String(hp.supplements);
            context += `  Нутрицевтики и добавки (уже в программе): ${s.substring(0, 400)}${s.length > 400 ? '...' : ''}\n`;
          }
          if (hp.nutrition) {
            const n = String(hp.nutrition);
            context += `  Питание (уже в программе): ${n.substring(0, 400)}${n.length > 400 ? '...' : ''}\n`;
          }
          if (hp.stress) {
            const st = String(hp.stress);
            context += `  Стресс и нагрузка (уже в программе): ${st.substring(0, 400)}${st.length > 400 ? '...' : ''}\n`;
          }
          if (hp.sleep) {
            const sl = String(hp.sleep);
            context += `  Сон и восстановление (уже в программе): ${sl.substring(0, 400)}${sl.length > 400 ? '...' : ''}\n`;
          }
        }

        // Пример дневника только за один день, чтобы не перегружать контекст
        if (diagnosticData.today_diary && diagnosticData.today_diary.length > 0) {
          context += `✓ Пример дневника на ОДИН день (типичный день текущей программы):\n`;
          diagnosticData.today_diary.forEach((entry) => {
            const t = (entry.entry_time || '').toString().slice(0, 5);
            context += `  - ${t}: ${entry.title}${entry.notes ? ` (${entry.notes})` : ''}\n`;
          });
        }
        
        systemPrompt += context;
      }
    }
    
    // Оптимизация промпта: сокращаем для ускорения (убираем лишние пробелы и переносы)
    systemPrompt = systemPrompt.replace(/\n{3,}/g, '\n\n').trim();

    // DeepSeek с streaming для моментального начала ответа
    const payload = {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: responseMode === 'quick' ? 0.7 : 0.85,
      max_tokens: responseMode === 'quick' ? 600 : 3000,
      top_p: 0.95,
      stream: true // Включаем streaming
    };

    // SSE headers для streaming на фронт
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Для nginx

    const https = require('https');
    const apiUrl = new URL(DEEPSEEK_API_URL);
    
    let fullContent = '';
    
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
        res.write(`data: ${JSON.stringify({ error: `DeepSeek API error: ${apiRes.statusCode}` })}\n\n`);
        res.end();
        return;
      }

      let buffer = '';
      
      apiRes.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Оставляем неполную строку в буфере
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed?.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                // Отправляем чанк на фронт
                res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }
        }
      });

      apiRes.on('end', async () => {
        // Обрабатываем оставшийся буфер
        if (buffer.startsWith('data: ')) {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed?.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
              }
            } catch (e) {}
          }
        }

        // Пытаемся извлечь структурированную программу (health + diary) из ответа
        const { healthProgram, diaryEntries, cleanedText } = extractProgramFromContent(fullContent);
        const visibleContent = cleanedText || fullContent;

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
        
        // Сохраняем ответ ИИ в уже созданную запись
        if (requestId) {
          try {
            await requestService.setChatResponse(requestId, visibleContent);
          } catch (error) {
            console.error('Failed to update chat response:', error);
          }
        } else if (userInfo && userInfo.telegramId && currentChatId) {
          try {
            await requestService.saveRequestToChat(
              userInfo.telegramId,
              message,
              visibleContent,
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
              },
              currentChatId
            );
          } catch (error) {
            console.error('Failed to save request to chat:', error);
          }
        }

        // Формируем финальный ответ с метаданными
        const quizCompletedFlag = diagnosticData?.quiz_completed || false;
        const analysesUploadedFlag = diagnosticData?.analyses_uploaded || false;
        const canCreateProgram = subscriptionActive && quizCompletedFlag && analysesUploadedFlag;
        
        const finalPayload = {
          done: true,
          success: true,
          chatId: currentChatId,
          quizCompleted: quizCompletedFlag,
          analysesUploaded: analysesUploadedFlag,
          healthProgram: healthProgram || null,
          diaryEntries: diaryEntries || [],
          canCreateProgram,
          subscriptionActive: subscriptionActive,
          freeRequestsCount: !subscriptionActive ? (freeRequestsCount + 1) : null,
          remainingFreeRequests: !subscriptionActive ? Math.max(0, 3 - (freeRequestsCount + 1)) : null
        };

        res.write(`data: ${JSON.stringify(finalPayload)}\n\n`);
        res.end();
      });

      apiRes.on('error', (err) => {
        console.error('DeepSeek stream error:', err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      });
    });

    apiReq.on('error', (err) => {
      console.error('DeepSeek request error:', err);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });

    apiReq.write(JSON.stringify(payload));
    apiReq.end();

  } catch (error) {
    console.error('Chat API Error:', error);
    console.error('Error stack:', error.stack);
    
    // Если headers уже отправлены (streaming начался), отправляем ошибку через SSE
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: error?.message || 'Unknown error' })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Unknown error',
        debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
};
