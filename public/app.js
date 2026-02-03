// Инициализация Telegram Web App
const tg = window.Telegram?.WebApp || {
  // Заглушки для локального тестирования - ТОЛЬКО ПОДДЕРЖИВАЕМЫЕ МЕТОДЫ
  ready: () => console.log('TG: ready (заглушка)'),
  expand: () => console.log('TG: expand (заглушка)'),
  BackButton: { hide: () => console.log('TG: BackButton.hide (заглушка)') },
  MainButton: { hide: () => console.log('TG: MainButton.hide (заглушка)') },
  onEvent: (event, callback) => console.log('TG: onEvent', event, '(заглушка)'),
  initDataUnsafe: { user: { first_name: 'Тест', last_name: 'Пользователь' } }
};

tg.ready();

// ========================================
// STATE ДЛЯ ДИАГНОСТИКИ
// ========================================
let diagnosticAnswers = {
  // Персональные данные (8 полей включая gender)
  fullName: '',
  birthDate: '',
  profession: '',
  city: '',
  weight: '',
  height: '',
  sport: '',
  gender: '',
  
  // Ответы квиза (17 вопросов)
  V17: '', V18: '', V19: '', V20: '', V21: '', V22: '', V23: '', V24: '',
  V25: '', V26: '', V27: '', V28: '', V29: '', V30: '', V31: '', V32: '', V33: '',
  
  // Дополнительные вопросы (3 поля)
  discomfort: '',
  diagnosis: '',
  treatment: ''
};

// Функции для работы с state диагностики
function saveDiagnosticAnswer(field, value) {
  diagnosticAnswers[field] = value;
  console.log(`💾 Saved ${field}:`, value);
}

function getDiagnosticAnswer(field) {
  return diagnosticAnswers[field] || '';
}

function getAllDiagnosticAnswers() {
  return { ...diagnosticAnswers };
}

function getFilledAnswersCount() {
  return Object.values(diagnosticAnswers).filter(value => 
    value && value.trim() !== '' && value !== 'undefined' && value !== 'null'
  ).length;
}

// =========================================
// ВРЕМЕННО ОТКЛЮЧАЕМ REALTIME
// =========================================

// Глобальные переменные для чатов (временно)
let cachedChats = [];

// Supabase конфигурация
const SUPABASE_URL = 'https://bqjxjzqzjpywxwztzsup.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxanhqenF6anB5d3h3enR6c3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc1ODk4MTcsImV4cCI6MjA1MzE2NTgxN30.Mg4UKokQRWkzZQK1L5YAw0yfTBw7A6bLo3YjKb_Jn4';

// Supabase клиент и Realtime переменные
let supabase = null;
let chatsSubscription = null;
let currentTelegramId = null;

// Инициализация Supabase (вызывается после загрузки приложения)
function initializeSupabaseClient() {
  if (window.supabase && !supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized');
    return true;
  }
  return false;
}

// =========================================
// SUPABASE REALTIME ФУНКЦИИ
// =========================================

// Инициализация Realtime подписки
async function initializeChatsRealtime(telegramId) {
  // Ждем инициализации Supabase клиента
  let attempts = 0;
  while (!initializeSupabaseClient() && attempts < 20) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (!supabase) {
    console.error('Supabase client not available');
    return false;
  }
  
  currentTelegramId = telegramId;
  
  // Загружаем начальные данные из Supabase
  await loadChatsFromSupabase();
  
  // Отписываемся от предыдущей подписки
  if (chatsSubscription) {
    chatsSubscription.unsubscribe();
  }
  
  // Создаем подписку на изменения
  chatsSubscription = supabase
    .channel(`chats_${telegramId}`)
    .on(
      'postgres_changes',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'chats',
        filter: `telegram_id=eq.${telegramId}`
      },
      (payload) => {
        console.log('Realtime chat update:', payload);
        handleRealtimeUpdate(payload);
      }
    )
    .subscribe((status) => {
      console.log('Realtime subscription status:', status);
    });
    
  return true;
}

// Загрузка чатов из Supabase
async function loadChatsFromSupabase() {
  if (!supabase) return;
  
  try {
    const { data: chats, error } = await supabase
      .from('chats')
      .select('*')
      .eq('telegram_id', currentTelegramId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading chats from Supabase:', error);
      return;
    }

    cachedChats = chats || [];
    renderChatsList(cachedChats);
    console.log('Chats loaded from Supabase:', cachedChats.length);
  } catch (error) {
    console.error('Exception in loadChatsFromSupabase:', error);
  }
}

// Обработка Realtime обновлений
function handleRealtimeUpdate(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  
  switch (eventType) {
    case 'INSERT':
      cachedChats.unshift(newRecord);
      break;
      
    case 'UPDATE':
      const index = cachedChats.findIndex(chat => chat.id === newRecord.id);
      if (index !== -1) {
        cachedChats[index] = newRecord;
        if (newRecord.is_active) {
          cachedChats.splice(index, 1);
          cachedChats.unshift(newRecord);
        }
      }
      break;
      
    case 'DELETE':
      cachedChats = cachedChats.filter(chat => chat.id !== oldRecord.id);
      break;
  }
  
  // Обновляем UI
  renderChatsList(cachedChats);
}

// Создание чата через Supabase
async function createChatViaSupabase(title = 'Новый чат') {
  if (!supabase || !currentTelegramId) return null;
  
  try {
    const { data: newChat, error } = await supabase
      .from('chats')
      .insert({
        telegram_id: currentTelegramId,
        title: title,
        is_active: false,
        auto_created: false,
        message_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating chat:', error);
      return null;
    }

    console.log('Chat created via Supabase:', newChat);
    return newChat;
  } catch (error) {
    console.error('Exception in createChatViaSupabase:', error);
    return null;
  }
}

// Очистка Realtime
function cleanupRealtime() {
  if (chatsSubscription) {
    chatsSubscription.unsubscribe();
    chatsSubscription = null;
  }
  currentTelegramId = null;
}
// ========================================
// ПРОСТАЯ ЛОГИКА ЧАТОВ - БЕЗ ПРОСМОТРА СТАРЫХ
// ========================================

// Глобальные переменные чата
let currentChatId = null;
/** При просмотре неактивного чата (is_active=false) — только чтение, отправка недоступна */
let viewingInactiveChatId = null;
let quizCompleted = false;
let quizCompletionDate = null;
let isAdmin = false;

// Проверка статуса квиза
async function checkQuizStatus() {
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    console.log('📋 Checking quiz status... TelegramData:', !!telegramWebAppData);
    
    const response = await fetch('/api/quiz?action=status', {
      headers: {
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });
    
    console.log('📋 Quiz status response:', response.status, response.ok);
    
    if (response.ok) {
      const data = await response.json();
      console.log('📋 Quiz status data:', data);
      
      quizCompleted = data.quiz_completed ?? data.quizCompleted ?? false;
      quizCompletionDate = data.quiz_completion_date || null;
      isAdmin = data.admin === true;
      console.log('📋 Quiz status SET:', quizCompleted, 'Date:', quizCompletionDate, 'Admin:', isAdmin);
      
      // Обновляем UI диагностики и админской панели
      updateDiagnosticsUI();
      updateAdminPanelVisibility();
      // Обновляем навигацию чтобы добавить/убрать кнопку админа
      updateAllNavigations();
      
      return quizCompleted;
    } else {
      const errorText = await response.text();
      console.error('📋 Quiz status error response:', errorText);
    }
  } catch (error) {
    console.error('📋 Error checking quiz status:', error);
  }
  return false;
}

// Обновление видимости админской панели
function updateAdminPanelVisibility() {
  const adminNavItems = document.querySelectorAll('.admin-nav-item');
  adminNavItems.forEach(item => {
    item.style.display = isAdmin ? 'flex' : 'none';
  });
}

// Обновление UI на основе статуса квиза
function updateDiagnosticsUI() {
  // Карточка повторного прохождения на странице Здоровье
  const retakeCard = document.getElementById('retakeDiagnosticCard');
  // Дата на странице Диагностика
  const completionDateBlock = document.getElementById('quizCompletionDate');
  const dateValue = document.getElementById('quizDateValue');
  
  if (quizCompleted) {
    // Показываем карточку повторного прохождения
    if (retakeCard) retakeCard.style.display = 'block';
    
    // Показываем дату
    if (completionDateBlock) completionDateBlock.style.display = 'block';
    
    // Форматируем и показываем дату
    if (dateValue && quizCompletionDate) {
      const date = new Date(quizCompletionDate);
      const formattedDate = date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      dateValue.textContent = formattedDate;
    }
  } else {
    // Скрываем элементы
    if (retakeCard) retakeCard.style.display = 'none';
    if (completionDateBlock) completionDateBlock.style.display = 'none';
  }
}

// Показать модальное окно повторного прохождения
function showRetakeQuizModal() {
  const modal = document.getElementById('retakeQuizModal');
  if (modal) {
    modal.classList.add('active');
  }
}

// Скрыть модальное окно
function hideRetakeQuizModal() {
  const modal = document.getElementById('retakeQuizModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Начать повторное прохождение квиза
function startRetakeQuiz() {
  hideRetakeQuizModal();
  
  // Сбрасываем локальный статус для прохождения
  // НЕ меняем quizCompleted - данные перезапишутся только после завершения
  
  // Очищаем сохранённый прогресс
  localStorage.removeItem('diagnosticPersonalData');
  localStorage.removeItem('diagnosticProgress');
  localStorage.removeItem('diagnosticAdditional');
  
  // Открываем форму диагностики напрямую (минуя проверку quizCompleted)
  openDiagnosticFormDirectly();
}

// Открыть форму диагностики напрямую (для повторного прохождения)
function openDiagnosticFormDirectly() {
  isDiagnosticFormMode = true;
  diagnosticState = getDiagnosticState();
  
  // Создаём форму (копия из showDiagnosticForm, но без проверки)
  const existingForm = document.getElementById('diagnosticFormOverlay');
  if (existingForm) existingForm.remove();
  
  // Вызываем создание формы
  createDiagnosticFormUI();
}

// Сохранение результатов квиза
async function saveQuizResults(quizData) {
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/quiz?action=save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      },
      body: JSON.stringify(quizData)
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        quizCompleted = true;
        console.log('Quiz results saved successfully');
        return true;
      }
    }
  } catch (error) {
    console.error('Error saving quiz results:', error);
  }
  return false;
}

// Сохранение одного ответа квиза с полным вопросом
async function saveQuizAnswer(telegramId, questionId, questionText, answerText, answerValue) {
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/save-answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      },
      body: JSON.stringify({
        telegramId: telegramId,
        questionId: questionId,
        questionText: questionText,
        answerText: answerText,
        answerValue: answerValue
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Answer saved:', data);
      return true;
    }
  } catch (error) {
    console.error('Error saving answer:', error);
  }
  return false;
}

// Завершение квиза
async function completeQuiz(telegramId) {
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/complete-quiz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      },
      body: JSON.stringify({
        telegramId: telegramId
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Quiz completed:', data);
      if (data.success) {
        quizCompleted = true;
        return true;
      }
    }
  } catch (error) {
    console.error('Error completing quiz:', error);
  }
  return false;
}

// Функция для сохранения всех ответов одним запросом
async function saveAllQuizAnswers() {
  try {
    console.log('🔍 Начинаем сохранение всех ответов...');
    
    // Получаем Telegram ID
    const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!telegramUser?.id) {
      console.error('❌ Ошибка: не удалось получить Telegram ID');
      return false;
    }
    
    const telegramId = telegramUser.id;
    const allAnswers = getAllDiagnosticAnswers();
    const filledCount = getFilledAnswersCount();
    
    console.log('📊 ДАННЫЕ ДЛЯ СОХРАНЕНИЯ:');
    console.log('🆔 Telegram ID:', telegramId);
    console.log('📝 Все ответы:', allAnswers);
    console.log('📊 Заполнено ответов:', filledCount, '/25');
    
    const emptyFields = Object.entries(allAnswers).filter(([key, value]) => 
      !value || value.trim() === '' || value === 'undefined' || value === 'null'
    );
    
    console.log('🔍 Пустые поля:', emptyFields);
    console.log('🔍 Количество пустых полей:', emptyFields.length);
    
    // Проверяем что все 25 ответов заполнены
    if (filledCount !== 25) {
      console.error(`❌ Ошибка: нужно 25 ответов, заполнено ${filledCount}`);
      console.error('❌ Список пустых полей:', emptyFields.map(([key]) => key));
      return false;
    }
    
    // Показываем загрузку
    showLoadingOverlay('Сохраняем ваши ответы...');
    
    // Отправляем все ответы одним запросом
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const requestBody = {
      telegramId: telegramId,
      answers: allAnswers
    };
    
    console.log('📤 Отправляем запрос:', requestBody);
    
    const response = await fetch('/api/save-all-quiz-answers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('📥 Ответ сервера (статус):', response.status);
    
    // Скрываем загрузку
    hideLoadingOverlay();
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Успешный ответ сервера:', data);
      
      // Обновляем локальный статус
      quizCompleted = true;
      quizCompletionDate = new Date().toISOString();
      console.log('📋 Локальный статус обновлён: quizCompleted =', quizCompleted);
      
      // Обновляем UI
      updateDiagnosticsUI();
      
      return data.success;
    } else {
      const error = await response.json();
      console.error('❌ Ошибка сервера:', error);
      console.error('❌ Детали ошибки:', {
        status: response.status,
        statusText: response.statusText,
        error: error
      });
      return false;
    }
  } catch (error) {
    console.error('❌ Ошибка в saveAllQuizAnswers:', error);
    console.error('❌ Stack trace:', error.stack);
    hideLoadingOverlay();
    return false;
  }
}

// Функция для сбора данных из формы диагностики и сохранения
async function completeDiagnosticQuiz() {
  try {
    console.log('🔍 Начинаем завершение диагностики...');
    
    // Используем новую функцию сохранения
    const success = await saveAllQuizAnswers();
    
    if (success) {
      console.log('✅ Диагностика завершена, все ответы сохранены');
      return true;
    } else {
      console.error('❌ Ошибка при сохранении ответов');
      return false;
    }
  } catch (error) {
    console.error('Error completing diagnostic quiz:', error);
    return false;
  }
}

// Функции для загрузки
function showLoadingOverlay(message = 'Загрузка...') {
  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.8); color: white; display: flex;
    align-items: center; justify-content: center; z-index: 10000;
    flex-direction: column; font-family: 'Inter', sans-serif;
  `;
  
  overlay.innerHTML = `
    <div style="width: 50px; height: 50px; border: 4px solid #3C805B; border-top: 4px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
    <div style="font-size: 18px; font-weight: 500;">${message}</div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.remove();
  }
}

// Индикатор загрузки при переходе на страницу
function showPageLoading(pageName) {
  // Удаляем старый если есть
  hidePageLoading();
  
  const loader = document.createElement('div');
  loader.id = 'pageLoadingOverlay';
  loader.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(60, 128, 91, 0.95); display: flex;
    align-items: center; justify-content: center; z-index: 9998;
    flex-direction: column;
  `;
  
  loader.innerHTML = `
    <div style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.3); border-top: 3px solid #fff; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px;"></div>
    <div style="color: white; font-size: 16px; font-weight: 500;">Загрузка...</div>
  `;
  
  document.body.appendChild(loader);
}

function hidePageLoading() {
  const loader = document.getElementById('pageLoadingOverlay');
  if (loader) {
    loader.remove();
  }
}

// Показать уведомление
function showNotificationMessage(text) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(76, 175, 80, 0.9); color: white; padding: 16px; border-radius: 8px;
    z-index: 10000; font-size: 14px; text-align: center;
  `;
  notification.innerHTML = text;
  notification.id = 'notification';
  document.body.appendChild(notification);
  
  // Автоматически скрываем через 3 секунды
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

// Загрузка активного чата при старте
async function loadActiveChat() {
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/chats?action=active', {
      headers: {
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Active chat response:', data);
    
    if (data.success && data.activeChatId) {
      currentChatId = data.activeChatId;
      
      // Загружаем сообщения активного чата
      await loadChatMessages(data.activeChatId, false);
      console.log('✅ Active chat loaded:', data.activeChatId);
    } else {
      // Если нет активного чата, создаем первый
      console.log('No active chat, creating first one...');
      await createNewChat();
    }
  } catch (error) {
    console.error('Error loading active chat:', error);
    // При ошибке создаем новый чат
    await createNewChat();
  }
}

// Отправка сообщения
function sendChatMessage(message) {
  if (viewingInactiveChatId) return; // В режиме просмотра неактивного чата отправка недоступна
  const trimmed = (message || '').trim();
  if (!trimmed) return;
  
  console.log('🔍 sendChatMessage called. currentChatId:', currentChatId);
  
  // Очищаем поле ввода
  const chatInput = document.querySelector('.chat-input');
  if (chatInput) chatInput.value = '';
  
  // Показываем сообщение в интерфейсе
  addUserMessage(trimmed);
  
  // Добавляем в очередь
  if (isAiBusy) {
    stopActiveTypewriter();
    pendingAiMessages.push(trimmed);
    stopAIResponse();
    return;
  }
  pendingAiMessages.push(trimmed);
  processAiQueue();
}

// Создание нового чата (становится активным)
async function createNewChat() {
  console.log('Creating new active chat...');
  
  try {
    // Закрываем сайдбар и показываем страницу чата
    closeSidebar();
    showPage('chat');
    
    // Показываем анимацию загрузки
    const chatMessages = document.getElementById('chatMessages');
    const container = chatMessages.querySelector('.chat-messages-container');
    if (container) {
      container.innerHTML = `
        <div class="chat-loading-animation">
          <div class="loading-spinner"></div>
          <div class="loading-text">Создаем новый чат...</div>
        </div>
      `;
    }
    
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      },
      body: JSON.stringify({ action: 'create', title: 'Новый чат' })
    });

    console.log('Create chat response status:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('New active chat created:', data);

    const chatId = data.chatId || data.chat?.id || data.id;
    
    if (chatId) {
      currentChatId = chatId;
      
      // Загружаем сообщения нового чата
      await loadChatMessages(chatId, false);
      
      // Обновляем список чатов в фоне
      loadChatsFromAPI();
      
      console.log('✅ New chat is now active:', chatId);
    } else {
      console.error('No chat ID in response:', data);
      throw new Error('Invalid response format');
    }

  } catch (error) {
    console.error('Error creating new chat:', error);
    
    // Показываем ошибку
    const chatMessages = document.getElementById('chatMessages');
    const container = chatMessages.querySelector('.chat-messages-container');
    if (container) {
      container.innerHTML = '<div class="error-message">Не удалось создать чат. Попробуйте еще раз.</div>';
    }
  }
}

async function loadChatsFromAPI() {
  const chatHistoryList = document.getElementById('chatHistoryList');
  
  // Показываем спиннер загрузки
  if (chatHistoryList) {
    chatHistoryList.innerHTML = `
      <div class="history-loading">
        <div class="history-spinner"></div>
      </div>
    `;
  }
  
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/chats?action=list', {
      headers: {
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      cachedChats = data.chats || [];
      renderChatsList(cachedChats);
    }
  } catch (error) {
    console.error('Error loading chats:', error);
    if (chatHistoryList) {
      chatHistoryList.innerHTML = '';
    }
  }
}

// Отрисовка списка чатов (простая - только для информации)
function renderChatsList(chats) {
  const chatHistoryList = document.getElementById('chatHistoryList');
  if (!chatHistoryList) return;
  
  if (chats && chats.length > 0) {
    chatHistoryList.innerHTML = '';
    
    // Сначала показываем активный чат отдельно
    const activeChat = chats.find(chat => chat.is_active);
    if (activeChat) {
      const activeChatItem = document.createElement('div');
      activeChatItem.className = 'history-item active';
      activeChatItem.setAttribute('data-chat-id', activeChat.id);
      
      const title = activeChat.auto_created ? `${activeChat.title} 🔄` : activeChat.title;
      activeChatItem.textContent = title;
      activeChatItem.style.cssText = 'border-left: 3px solid #4CAF50; background: rgba(76, 175, 80, 0.1);';
      
      // Активный чат можно кликнуть для перехода в чат (с возможностью отправки)
      activeChatItem.addEventListener('click', () => {
        console.log('Active chat clicked - opening chat');
        viewingInactiveChatId = null;
        closeSidebar();
        showPage('chat');
      });
      
      chatHistoryList.appendChild(activeChatItem);
    }
    
    // Показываем остальные чаты только для информации
    const inactiveChats = chats.filter(chat => !chat.is_active);
    
    if (inactiveChats.length > 0) {
      // Заголовок для старых чатов
      const header = document.createElement('div');
      header.textContent = 'Предыдущие чаты:';
      header.style.cssText = 'padding: 8px 16px; font-size: 12px; color: rgba(255,255,255,0.5); font-weight: 500;';
      chatHistoryList.appendChild(header);
      
      // Неактивные чаты — можно открыть для просмотра (без отправки сообщений)
      inactiveChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'history-item';
        chatItem.setAttribute('data-chat-id', chat.id);
        
        const title = chat.auto_created ? `${chat.title} 🔄` : chat.title;
        chatItem.textContent = title;
        chatItem.style.opacity = '0.9';
        chatItem.style.cursor = 'pointer';
        
        chatItem.addEventListener('click', () => {
          viewOldChat(chat.id);
        });
        
        // Добавляем дату
        const chatDate = new Date(chat.updated_at || chat.created_at);
        const dateStr = formatDate(chatDate);
        
        const dateElement = document.createElement('div');
        dateElement.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px;';
        dateElement.textContent = dateStr;
        
        chatHistoryList.appendChild(chatItem);
        chatHistoryList.appendChild(dateElement);
      });
    }
    
  } else {
    chatHistoryList.innerHTML = '';
  }
}

// Форматирование даты
function formatDate(date) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const chatDate = new Date(date);
  chatDate.setHours(0, 0, 0, 0);
  
  if (chatDate.getTime() === today.getTime()) {
    return 'Сегодня';
  } else if (chatDate.getTime() === yesterday.getTime()) {
    return 'Вчера';
  } else {
    return chatDate.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

// Просмотр неактивного чата (read-only: только чтение, без отправки; чат не становится активным)
async function viewOldChat(chatId) {
  try {
    console.log('Loading old chat for viewing:', chatId);
    viewingInactiveChatId = chatId;
    
    // Закрываем сайдбар
    closeSidebar();
    
    // Показываем страницу чата в режиме read-only
    showPage('chat');
    
    const titleEl = document.getElementById('chatOverlayTitle');
    if (titleEl) titleEl.textContent = 'Просмотр чата';
    const inputContainer = document.querySelector('.chat-overlay .chat-input-container');
    if (inputContainer) inputContainer.style.display = 'none';
    
    const chatMessages = document.getElementById('chatMessages');
    const container = chatMessages?.querySelector('.chat-messages-container');
    if (container) {
      container.innerHTML = `
        <div class="chat-readonly-notice">Этот чат только для просмотра. Отправка сообщений недоступна.</div>
        <div class="chat-loading-animation">
          <div class="loading-spinner"></div>
          <div class="loading-text">Загружаем сообщения...</div>
        </div>
      `;
    }
    
    // Загружаем сообщения старого чата в режиме read-only
    await loadChatMessages(chatId, true);
    
  } catch (error) {
    console.error('Error viewing old chat:', error);
  }
}

// Загрузка сообщений чата
async function loadChatMessages(chatId, isReadOnly = false) {
  console.log('📥 loadChatMessages called for chatId:', chatId);
  
  if (!chatId) {
    console.error('❌ loadChatMessages: No chatId provided');
    return;
  }
  
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch(`/api/chats?action=messages&chatId=${chatId}`, {
      headers: {
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });
    const data = await response.json();
    
    console.log('📋 Chat messages response:', data);
    
    if (data.success) {
      const chatMessages = document.getElementById('chatMessages');
      const container = chatMessages?.querySelector('.chat-messages-container');
      
      if (!container) {
        console.error('❌ Chat messages container not found');
        return;
      }
      
      // Очищаем контейнер
      if (!isReadOnly) {
        container.innerHTML = '';
      } else {
        const loadingElement = container.querySelector('.chat-loading-animation');
        if (loadingElement) {
          loadingElement.remove();
        }
      }
      
      // Если нет сообщений, добавляем приветствие
      if (!data.messages || data.messages.length === 0) {
        console.log('💬 No messages, showing welcome');
        addWelcomeMessage();
      } else {
        console.log(`✅ Loading ${data.messages.length} messages`);
        // Восстанавливаем сообщения в хронологическом порядке
        data.messages.forEach(msg => {
          if (msg.message_text) {
            addUserMessage(msg.message_text);
          }
          if (msg.response_text) {
            addBotMessage(msg.response_text);
          }
        });
        
        // Прокручиваем к последнему сообщению
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;
        }, 100);
      }
    } else {
      console.error('❌ API returned success=false:', data);
    }
  } catch (error) {
    console.error('❌ Error loading chat messages:', error);
  }
}

// Создание нового чата (становится активным)
async function createNewChat() {
  console.log('Creating new active chat...');
  viewingInactiveChatId = null;
  
  try {
    // СРАЗУ закрываем сайдбар и показываем страницу чата
    closeSidebar();
    showPage('chat');
    
    // Показываем поле ввода (скрыто если был старый чат)
    const chatInput = document.querySelector('.chat-input');
    const sendButton = document.querySelector('.chat-send-btn');
    if (chatInput) chatInput.style.display = 'flex';
    if (sendButton) sendButton.style.display = 'flex';
    
    // Показываем анимацию загрузки
    const chatMessages = document.getElementById('chatMessages');
    const container = chatMessages.querySelector('.chat-messages-container');
    if (container) {
      container.innerHTML = `
        <div class="chat-loading-animation">
          <div class="loading-spinner"></div>
          <div class="loading-text">Создаем новый чат...</div>
        </div>
      `;
    }
    
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      },
      body: JSON.stringify({ action: 'create', title: 'Новый чат' })
    });

    console.log('Create chat response status:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('New active chat created:', data);

    // Проверяем разные форматы ответа
    const chatId = data.chatId || data.chat?.id || data.id;
    
    if (chatId) {
      currentChatId = chatId;
      
      // Загружаем сообщения нового чата
      await loadChatMessages(chatId);
      
      // Обновляем список чатов в фоне
      loadChatsFromAPI();
      
      console.log('✅ New chat is now active:', chatId);
    } else {
      console.error('No chat ID in response:', data);
      throw new Error('Invalid response format');
    }

  } catch (error) {
    console.error('Error creating new chat:', error);
    
    // Показываем ошибку
    const chatMessages = document.getElementById('chatMessages');
    const container = chatMessages.querySelector('.chat-messages-container');
    if (container) {
      container.innerHTML = '<div class="error-message">Не удалось создать чат. Попробуйте еще раз.</div>';
    }
  }
}

// ========================================
// ФУНКЦИИ БОКОВОГО МЕНЮ
// ========================================

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebarOverlay) {
    requestAnimationFrame(() => {
      sidebar.classList.add('active');
      sidebarOverlay.classList.add('active');
    });
  }
  
  // Загружаем чаты при открытии сайдбара
  loadChatsFromAPI();
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebarOverlay) {
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  }
}

async function initializeUser() {
  const telegramUser = tg.initDataUnsafe?.user;
  
  if (telegramUser && telegramUser.id) {
    try {
      const response = await fetch('/api/init-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUser })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log('User initialized:', data.user);
          // Сохраняем ID пользователя для дальнейшего использования
          window.currentUserId = data.user.id;
          window.currentTelegramId = data.user.telegramId;
        }
      }
    } catch (error) {
      console.error('Failed to initialize user:', error);
    }
  }
}

// Вызываем инициализацию сразу после готовности Telegram Web App
initializeUser();

// ПРАВИЛЬНЫЙ полноэкранный режим для Telegram Mini App
if (window.Telegram?.WebApp) {
  // НЕМЕДЛЕННОЕ разворачивание в полноэкранный режим
  tg.expand();
  
  // ПРИНУДИТЕЛЬНОЕ включение полноэкранного режима
  try {
    // Используем новые методы Telegram WebApp 6.0+
    if (tg.requestFullscreen) {
      tg.requestFullscreen();
    }
    
    // Скрываем элементы интерфейса Telegram
    if (tg.setHeaderColor) {
      tg.setHeaderColor('#3C805B'); // Устанавливаем цвет заголовка
    }
    
    if (tg.setBackgroundColor) {
      tg.setBackgroundColor('#3C805B'); // Устанавливаем цвет фона
    }
    
    // Включаем полноэкранный режим
    if (tg.enableFullscreen) {
      tg.enableFullscreen();
    }
    
  } catch (e) {
    console.log('Новые методы полноэкранного режима не поддерживаются:', e.message);
  }

  // Скрываем кнопки Telegram
  if (tg.BackButton) {
    try {
      tg.BackButton.hide();
    } catch (e) {
      console.log('BackButton.hide не поддерживается:', e.message);
    }
  }
  
  if (tg.MainButton) {
    try {
      tg.MainButton.hide();
    } catch (e) {
      console.log('MainButton.hide не поддерживается:', e.message);
    }
  }

  // АГРЕССИВНЫЕ попытки разворачивания
  const expandAttempts = [50, 100, 200, 300, 500, 1000, 2000, 3000];
  expandAttempts.forEach(delay => {
    setTimeout(() => {
      tg.expand();
      // Дополнительные попытки полноэкранного режима
      try {
        if (tg.requestFullscreen) tg.requestFullscreen();
        if (tg.enableFullscreen) tg.enableFullscreen();
      } catch (e) {
        // Игнорируем ошибки
      }
    }, delay);
  });

  // Обработчики событий для поддержания полноэкранного режима
  try {
    tg.onEvent('viewportChanged', () => {
      setTimeout(() => {
        tg.expand();
        if (tg.requestFullscreen) tg.requestFullscreen();
      }, 10);
    });
  } catch (e) {
    console.log('onEvent не поддерживается:', e.message);
  }

  // Обработчики окна браузера
  window.addEventListener('resize', () => {
    setTimeout(() => {
      tg.expand();
      try {
        if (tg.requestFullscreen) tg.requestFullscreen();
      } catch (e) {}
    }, 50);
  });

  window.addEventListener('load', () => {
    setTimeout(() => {
      tg.expand();
      try {
        if (tg.requestFullscreen) tg.requestFullscreen();
      } catch (e) {}
    }, 100);
  });

  // Дополнительные обработчики
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(() => {
        tg.expand();
        try {
          if (tg.requestFullscreen) tg.requestFullscreen();
        } catch (e) {}
      }, 100);
    }
  });

  window.addEventListener('focus', () => {
    setTimeout(() => {
      tg.expand();
      try {
        if (tg.requestFullscreen) tg.requestFullscreen();
      } catch (e) {}
    }, 100);
  });

  // Периодическое поддержание полноэкранного режима
  setInterval(() => {
    tg.expand();
    try {
      if (tg.requestFullscreen) tg.requestFullscreen();
    } catch (e) {}
  }, 5000);

} else {
  console.log('Локальное тестирование - Telegram WebApp недоступен');
}

// ========================================
// ФУНКЦИИ СБРОСА ДАННЫХ ДИАГНОСТИКИ
// ========================================

// Функция сброса всех данных диагностики
function clearDiagnosticData() {
  localStorage.removeItem('surveyAnswers');
  localStorage.removeItem('diagnosticPersonalData');
  localStorage.removeItem('additionalAnswers');
  console.log('Данные диагностики сброшены');
}

// Сброс данных при закрытии мини-апп
tg.onEvent('mainButtonClicked', clearDiagnosticData);
tg.onEvent('backButtonClicked', clearDiagnosticData);

// Сброс данных при обновлении страницы
window.addEventListener('beforeunload', clearDiagnosticData);

// Сброс данных при закрытии/скрытии мини-апп
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearDiagnosticData();
  }
});

// Сброс данных при потере фокуса окна
window.addEventListener('blur', clearDiagnosticData);

// Получение данных пользователя из Telegram
const user = tg.initDataUnsafe?.user;
let userName = 'Пользователь';
let userFullName = 'Пользователь';

// Улучшенное получение данных пользователя
if (user) {
  userName = user.first_name || 'Пользователь';
  userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Пользователь';
  
  console.log('Данные пользователя Telegram:', {
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    photo_url: user.photo_url,
    id: user.id
  });
} else {
  console.log('Данные пользователя недоступны - используем заглушки');
  // Для локального тестирования
  userName = 'Александр';
  userFullName = 'Александр Тестов';
}

// Элементы страниц
const mainApp = document.getElementById('mainApp');
const knowledgeBase = document.getElementById('knowledgeBase');
const diagnosticsPage = document.getElementById('diagnosticsPage');
const chatOverlay = document.getElementById('chatOverlay');
const recommendedTestsPage = document.getElementById('recommendedTestsPage');

// Отладочная информация для локального тестирования
console.log('=== ОТЛАДКА ЭЛЕМЕНТОВ ===');
console.log('mainApp:', mainApp);
console.log('Telegram WebApp доступен:', typeof window.Telegram !== 'undefined');
console.log('========================');

// ========================================
// СИСТЕМА НАВИГАЦИИ И СОСТОЯНИЙ
// ========================================

let currentPage = 'main';
let isChatMode = false;
let isDiagnosticFormMode = false;
let diagnosticState = 'main'; // 'main', 'form', 'quiz'
let isInRecommendedTests = false; // Флаг для отслеживания нахождения в рекомендуемых анализах

// Функции навигации
function showPage(pageName) {
  console.log('🚀 showPage вызвана с параметром:', pageName);
  if (pageName !== 'chat') viewingInactiveChatId = null;
  
  // Закрываем диагностическую форму если она открыта
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  if (diagnosticFormOverlay && pageName !== 'diagnosticForm') {
    // НЕ УДАЛЯЕМ ДАННЫЕ при переходе между страницами
    diagnosticFormOverlay.remove();
    document.body.classList.remove('chat-overlay-visible');
    isDiagnosticFormMode = false;
  }
  
  // Закрываем страницу "Мои анализы" если она открыта
  const myTestsFormOverlay = document.getElementById('myTestsFormOverlay');
  if (myTestsFormOverlay && pageName !== 'myTests') {
    myTestsFormOverlay.remove();
    document.body.classList.remove('chat-overlay-visible');
    isDiagnosticFormMode = false;
  }
  
  // СНАЧАЛА показываем нужную страницу, ПОТОМ скрываем остальные
  switch(pageName) {
    case 'main':
      mainApp.style.display = 'block';
      currentPage = 'main';
      isChatMode = false;
      isInRecommendedTests = false;
      break;
    case 'diagnostics':
      diagnosticsPage.classList.add('active');
      currentPage = 'diagnostics';
      isChatMode = false;
      isInRecommendedTests = false;
      // Обновляем UI (показываем дату если есть)
      updateDiagnosticsUI();
      break;
    case 'knowledge':
      knowledgeBase.classList.add('active');
      currentPage = 'knowledge';
      isChatMode = false;
      isInRecommendedTests = false;
      break;
    case 'health':
      console.log('🏥 Переходим на страницу здоровья!');
      // Показываем страницу здоровья
      const healthPage = document.getElementById('healthPage');
      if (healthPage) {
        console.log('✅ Элемент healthPage найден, добавляем класс active');
        healthPage.classList.add('active');
      } else {
        console.error('❌ Элемент healthPage НЕ НАЙДЕН!');
      }
      currentPage = 'health';
      isChatMode = false;
      isInRecommendedTests = false;
      // Обновляем UI (показываем/скрываем карточку повторного прохождения)
      updateDiagnosticsUI();
      console.log('🎯 Текущая страница установлена:', currentPage);
      break;
    case 'diary': {
      const diaryPage = document.getElementById('diaryPage');
      const diaryGate = document.getElementById('diaryGate');
      const diaryContentBlock = document.getElementById('diaryContentBlock');
      diaryPage.classList.add('active');
      currentPage = 'diary';
      isChatMode = false;
      isInRecommendedTests = false;
      if (quizCompleted && diaryGate && diaryContentBlock) {
        diaryGate.classList.add('hidden');
        diaryContentBlock.classList.remove('hidden');
        initializeDiary();
      } else if (diaryGate && diaryContentBlock) {
        diaryGate.classList.remove('hidden');
        diaryContentBlock.classList.add('hidden');
      }
      break;
    }
    case 'chat':
      chatOverlay.classList.add('active');
      document.body.classList.add('chat-overlay-visible');
      isChatMode = true;
      currentPage = 'main'; // Чат это часть главной
      isInRecommendedTests = false;
      
      const chatInputEl = document.querySelector('.chat-input');
      const sendButtonEl = document.querySelector('.chat-send-btn');
      
      if (viewingInactiveChatId) {
        const titleEl = document.getElementById('chatOverlayTitle');
        if (titleEl) titleEl.textContent = 'Просмотр чата';
        const inputContainer = document.querySelector('.chat-overlay .chat-input-container');
        if (inputContainer) inputContainer.style.display = 'none';
      } else {
        const titleEl = document.getElementById('chatOverlayTitle');
        if (titleEl) titleEl.textContent = 'Чат';
        const inputContainer = document.querySelector('.chat-overlay .chat-input-container');
        if (inputContainer) inputContainer.style.display = 'flex';
        if (chatInputEl && sendButtonEl) {
          chatInputEl.style.display = 'flex';
          sendButtonEl.style.display = 'flex';
        }
        if (currentChatId) {
          loadChatMessages(currentChatId, false);
        } else {
          loadActiveChat();
        }
      }
      break;
    case 'recommendedTests':
      recommendedTestsPage.classList.add('active');
      currentPage = 'recommendedTests';
      isChatMode = false;
      isInRecommendedTests = true;
      break;
    case 'admin':
      console.log('🔧 Opening admin page, isAdmin:', isAdmin);
      const adminPage = document.getElementById('adminPage');
      if (!adminPage) {
        console.error('❌ Admin page element not found in DOM!');
        alert('Админская панель не найдена. Обновите страницу.');
        break; // Используем break вместо return
      }
      
      console.log('✅ Admin page found, showing it');
      // Показываем админскую страницу
      adminPage.classList.add('active');
      adminPage.style.display = 'flex';
      currentPage = 'admin';
      isChatMode = false;
      isInRecommendedTests = false;
      
      // Показываем индикатор загрузки
      const adminUsersList = document.getElementById('adminUsersList');
      if (adminUsersList) {
        adminUsersList.innerHTML = `
          <div class="admin-loading">
            <div class="loading-spinner"></div>
            <div class="loading-text">Загрузка пользователей...</div>
          </div>
        `;
      }
      
      console.log('📤 Starting to load admin users...');
      // Загружаем список пользователей при открытии (асинхронно)
      loadAdminUsers().catch(err => {
        console.error('❌ Error loading admin users:', err);
        if (adminUsersList) {
          adminUsersList.innerHTML = `<div class="admin-error">Ошибка загрузки пользователей: ${err.message}</div>`;
        }
      });
      break;
  }
  
  // ТЕПЕРЬ скрываем все остальные страницы
  if (pageName !== 'main') {
    mainApp.style.display = 'none';
  }
  if (pageName !== 'knowledge') {
    knowledgeBase.classList.remove('active');
  }
  if (pageName !== 'diagnostics') {
    diagnosticsPage.classList.remove('active');
  }
  if (pageName !== 'chat') {
    chatOverlay.classList.remove('active');
  }
  if (pageName !== 'recommendedTests') {
    recommendedTestsPage.classList.remove('active');
  }
  if (pageName !== 'admin') {
    const adminPage = document.getElementById('adminPage');
    if (adminPage) {
      adminPage.classList.remove('active');
      adminPage.style.display = 'none';
    }
  }
  
  // Закрываем диагностическую форму и "Мои анализы" если открываем админку
  if (pageName === 'admin') {
    console.log('🔧 Closing overlays before showing admin page');
    const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
    const myTestsFormOverlay = document.getElementById('myTestsFormOverlay');
    if (diagnosticFormOverlay) {
      diagnosticFormOverlay.remove();
      isDiagnosticFormMode = false;
    }
    if (myTestsFormOverlay) {
      myTestsFormOverlay.remove();
      isDiagnosticFormMode = false;
    }
    document.body.classList.remove('chat-overlay-visible');
    
    // Проверяем что страница действительно видна
    setTimeout(() => {
      const adminPage = document.getElementById('adminPage');
      if (adminPage) {
        const isVisible = adminPage.classList.contains('active') && adminPage.style.display === 'flex';
        console.log('🔍 Admin page visibility check:', {
          hasActive: adminPage.classList.contains('active'),
          display: adminPage.style.display,
          computedDisplay: window.getComputedStyle(adminPage).display,
          isVisible: isVisible
        });
        if (!isVisible) {
          console.error('❌ Admin page is not visible! Forcing display...');
          adminPage.style.display = 'flex';
          adminPage.classList.add('active');
        }
      }
    }, 100);
  }
  
  // Скрываем страницу здоровье если не она выбрана
  if (pageName !== 'health') {
    const healthPage = document.getElementById('healthPage');
    if (healthPage) {
      healthPage.classList.remove('active');
    }
  }
  
  // Скрываем страницу дневник если не она выбрана
  if (pageName !== 'diary') {
    const diaryPage = document.getElementById('diaryPage');
    if (diaryPage) {
      diaryPage.classList.remove('active');
    }
  }
  
  // Убираем классы скролла если не чат
  if (pageName !== 'chat') {
    document.body.classList.remove('chat-overlay-visible');
  }
  
  // Обновляем все навигации
  updateAllNavigations();
}

function updateAllNavigations() {
  // Находим все навигации
  const navigations = document.querySelectorAll('.bottom-nav');
  
  navigations.forEach(nav => {
    const navItems = nav.querySelectorAll('.nav-item:not(.admin-nav-item)');
    
    // Убеждаемся что кнопка админа есть во всех панелях (если пользователь админ)
    if (isAdmin) {
      let adminBtn = nav.querySelector('.admin-nav-item');
      if (!adminBtn) {
        // Создаем кнопку админа если её нет
        adminBtn = document.createElement('button');
        adminBtn.className = 'nav-item admin-nav-item';
        adminBtn.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Админ</span>
        `;
        nav.appendChild(adminBtn);
        
        // Добавляем обработчик клика
        adminBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('🔧 Admin button clicked (from updateAllNavigations), isAdmin:', isAdmin);
          if (isAdmin) {
            console.log('✅ Opening admin page from button...');
            showPage('admin');
          } else {
            console.log('❌ User is not admin');
          }
        });
      }
      adminBtn.style.display = 'flex';
    } else {
      // Скрываем кнопку админа если пользователь не админ
      const adminBtn = nav.querySelector('.admin-nav-item');
      if (adminBtn) {
        adminBtn.style.display = 'none';
      }
    }
    
    navItems.forEach((item, index) => {
      item.classList.remove('active');
      
      // Определяем какая кнопка должна быть активной
      let shouldBeActive = false;
      
      switch(index) {
        case 0: // Главная
          shouldBeActive = (currentPage === 'main');
          break;
        case 1: // Диагностика
          shouldBeActive = (currentPage === 'diagnostics' || currentPage === 'recommendedTests' || isDiagnosticFormMode);
          break;
        case 2: // Здоровье
          shouldBeActive = (currentPage === 'health');
          break;
        case 3: // Дневник
          shouldBeActive = (currentPage === 'diary');
          break;
        case 4: // База знаний
          shouldBeActive = (currentPage === 'knowledge');
          break;
      }
      
      if (shouldBeActive) {
        item.classList.add('active');
      }
    });
    
    // Обновляем активность кнопки админа
    const adminBtn = nav.querySelector('.admin-nav-item');
    if (adminBtn) {
      adminBtn.classList.remove('active');
      if (currentPage === 'admin') {
        adminBtn.classList.add('active');
      }
    }
  });
}



// Обновление имени пользователя и аватарок
document.querySelector('.welcome-name').textContent = userName;
document.getElementById('sidebarUsername').textContent = userFullName;

function updateAvatar(element, user, userName) {
  if (!element) return;
  
  // Проверяем есть ли фото пользователя в Telegram
  if (user?.photo_url) {
    // Устанавливаем фото из Telegram
    element.style.backgroundImage = `url(${user.photo_url})`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.textContent = '';
    console.log('Установлено фото пользователя:', user.photo_url);
  } else {
    // Если фото нет, показываем инициалы
    const initials = userName ? userName.charAt(0).toUpperCase() : 'U';
    element.textContent = initials;
    element.style.backgroundImage = '';
    console.log('Установлены инициалы:', initials);
  }
}

updateAvatar(document.getElementById('avatar'), user, userName);
updateAvatar(document.getElementById('sidebarAvatar'), user, userName);
updateAvatar(document.getElementById('knowledgeAvatar'), user, userName);
updateAvatar(document.getElementById('diagnosticsAvatar'), user, userName);
updateAvatar(document.getElementById('healthAvatar'), user, userName);
updateAvatar(document.getElementById('diaryAvatar'), user, userName);
updateAvatar(document.getElementById('recommendedTestsAvatar'), user, userName);
updateAvatar(document.getElementById('adminAvatar'), user, userName);

// Принудительное обновление всех аватарок
function forceUpdateAllAvatars() {
  console.log('Принудительное обновление всех аватарок...');
  
  const avatarElements = [
    'avatar', 'sidebarAvatar', 'knowledgeAvatar', 'diagnosticsAvatar', 
    'healthAvatar', 'diaryAvatar', 'recommendedTestsAvatar', 'adminAvatar'
  ];
  
  avatarElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      updateAvatar(element, user, userName);
    }
  });
}

// Обновляем аватарки через небольшие интервалы для надежности
setTimeout(forceUpdateAllAvatars, 500);
setTimeout(forceUpdateAllAvatars, 1000);
setTimeout(forceUpdateAllAvatars, 2000);
// ОБРАБОТЧИК ВСЕХ СОБЫТИЙ
// ========================================

document.addEventListener('click', (e) => {
  // Кнопка меню - открытие сайдбара
  if (e.target.closest('.menu-btn')) {
    openSidebar();
    return;
  }
  
  // Закрытие сайдбара
  if (e.target.closest('#sidebarClose') || e.target.closest('#sidebarOverlay')) {
    closeSidebar();
    return;
  }
  
  // Кнопка нового чата (удалил дубликат)
  
  // НАВИГАЦИЯ - ИСПРАВЛЕННАЯ ЛОГИКА
  if (e.target.closest('.nav-item')) {
    const navItem = e.target.closest('.nav-item');
    
    // Если это кнопка админа - обрабатываем отдельно
    if (navItem.classList.contains('admin-nav-item')) {
      console.log('🔧 Admin button clicked, isAdmin:', isAdmin);
      e.preventDefault();
      e.stopPropagation();
      
      if (isAdmin) {
        console.log('✅ Opening admin page...');
        // Показываем страницу сразу
        showPage('admin');
      } else {
        console.log('❌ User is not admin, cannot open admin panel');
        alert('У вас нет прав администратора');
      }
      return false;
    }
    
    const nav = navItem.closest('.bottom-nav');
    const navItems = nav.querySelectorAll('.nav-item:not(.admin-nav-item)');
    const buttonIndex = Array.from(navItems).indexOf(navItem);
    
    console.log('Нажата кнопка навигации:', buttonIndex);
    
    // Закрываем боковое меню если открыто
    closeSidebar();
    
    switch(buttonIndex) {
      case 0: // Главная
        // Если находимся в режиме диагностической формы или мои анализы - закрываем их
        if (isDiagnosticFormMode) {
          const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
          const myTestsFormOverlay = document.getElementById('myTestsFormOverlay');
          
          if (diagnosticFormOverlay) {
            diagnosticFormOverlay.remove();
          }
          
          if (myTestsFormOverlay) {
            myTestsFormOverlay.remove();
          }
          
          isDiagnosticFormMode = false;
          document.body.classList.remove('chat-overlay-visible');
        }
        showPage('main');
        break;
      case 1: // Диагностика
        // УМНАЯ ЛОГИКА для кнопки диагностики с учетом рекомендуемых анализов
        
        // Если находимся в рекомендуемых анализах - переходим в "Мои анализы"
        if (isInRecommendedTests) {
          showMyTestsPage();
          return;
        }
        
        // Если уже в "Мои анализы" - переходим на главную диагностики
        if (isDiagnosticFormMode && !isInRecommendedTests) {
          const myTestsFormOverlay = document.getElementById('myTestsFormOverlay');
          if (myTestsFormOverlay) {
            console.log('Закрываем Мои анализы и переходим на главную диагностики');
            myTestsFormOverlay.remove();
            isDiagnosticFormMode = false;
            document.body.classList.remove('chat-overlay-visible');
            showPage('diagnostics');
            return;
          }
          
          // Если это диагностическая форма - сбрасываем данные и переходим на главную
          const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
          if (diagnosticFormOverlay) {
            console.log('Закрываем диагностическую форму и переходим на главную диагностики');
            clearDiagnosticData();
            diagnosticFormOverlay.remove();
            isDiagnosticFormMode = false;
            document.body.classList.remove('chat-overlay-visible');
            showPage('diagnostics');
            return;
          }
        }
        
        const hasProgress = checkDiagnosticProgress();
        const isCompleted = isDiagnosticCompleted();
        
        // ЕСЛИ УЖЕ НА ГЛАВНОЙ СТРАНИЦЕ ДИАГНОСТИКИ - НИЧЕГО НЕ ДЕЛАЕМ
        if (currentPage === 'diagnostics' && !isDiagnosticFormMode) {
          console.log('Уже на главной странице диагностики - ничего не делаем');
          return;
        }
        
        // ЕСЛИ НЕ В ДИАГНОСТИКЕ - ПЕРЕХОДИМ К ДИАГНОСТИКЕ
        if (isCompleted) {
          // Если диагностика завершена - очищаем и идем на главную диагностики
          console.log('Диагностика завершена - очищаем данные и идем на главную');
          clearDiagnosticData();
          showPage('diagnostics');
        } else if (hasProgress) {
          // Есть незавершенный прогресс - идем на главную диагностики
          showPage('diagnostics');
        } else {
          // Нет прогресса - идем на главную диагностики
          showPage('diagnostics');
        }
        break;
      case 2: // Здоровье
        showPage('health');
        break;
      case 3: // Дневник — проверяем quiz_completed, затем показываем страницу
        showPageLoading('diary');
        checkQuizStatus().then(() => {
          hidePageLoading();
          showPage('diary');
        });
        break;
      case 4: // База знаний
        showPage('knowledge');
        break;
    }
    return;
  }
  
  // Боковое меню - УДАЛЕНО ДУБЛИРОВАНИЕ
  
  if (e.target.closest('#sidebarClose') || e.target.closest('#sidebarOverlay')) {
    closeSidebar();
    return;
  }
  
  // Поиск
  if (e.target.closest('.search-btn')) {
    const searchInput = document.querySelector('.search-input');
    const query = searchInput.value.trim();
    if (query) {
      openChatWithMessage(query);
      searchInput.value = '';
    }
    return;
  }
  
  // Кнопка "Заполнить анкету"
  if (e.target.closest('.fill-form-btn')) {
    showDiagnosticForm();
    return;
  }
  
  // Карточка "Пройти повторно диагностику" на странице Здоровье
  if (e.target.closest('#retakeDiagnosticCard') || e.target.closest('.retake-diagnostic-card')) {
    showRetakeQuizModal();
    return;
  }
  
  // Подтверждение повторного прохождения
  if (e.target.closest('#retakeQuizConfirmBtn')) {
    startRetakeQuiz();
    return;
  }
  
  // Отмена модального окна повторного прохождения
  if (e.target.closest('#retakeQuizCancelBtn')) {
    hideRetakeQuizModal();
    return;
  }
  
  // Закрытие модального окна по клику на overlay
  if (e.target.classList.contains('retake-quiz-modal-overlay')) {
    hideRetakeQuizModal();
    return;
  }
  
  // Кнопка "Мои анализы"
  if (e.target.closest('.my-tests-btn')) {
    showMyTestsPage();
    return;
  }
  
  // Кнопка создания программы
  if (e.target.closest('.create-program-btn')) {
    showPage('health');
    return;
  }
  
  // Отправка сообщения или остановка ИИ
  if (e.target.closest('.chat-send-btn') || e.target.closest('#sendButton')) {
    const btn = document.querySelector('.chat-send-btn');
    
    // Если режим "stop" - останавливаем ИИ
    if (btn?.dataset.mode === 'stop') {
      stopAIResponse();
      return;
    }
    
    // Иначе отправляем сообщение
    const chatInput = document.querySelector('.chat-input');
    const message = chatInput?.value?.trim();
    if (message) {
      sendChatMessage(message);
    }
    return;
  }
  
  // Новый чат
  if (e.target.closest('.new-chat-btn') || e.target.closest('#newChatBtn')) {
    createNewChat();
    return;
  }
  
  // История запросов (старые чаты - только просмотр)
  if (e.target.closest('.history-item')) {
    // Клик обрабатывается внутри renderChatsList
    return;
  }
  
  // В режиме просмотра неактивного чата отправка запрещена
  if (viewingInactiveChatId && (e.target.closest('.chat-send-btn') || e.target.closest('#sendButton'))) {
    return;
  }
  
  // Раскрытие разделов в базе знаний
  if (e.target.closest('.expand-btn') || e.target.closest('.section-header')) {
    const clickedElement = e.target.closest('.expand-btn') || e.target.closest('.section-header');
    const knowledgeSection = clickedElement.closest('.knowledge-section');
    const expandBtn = knowledgeSection.querySelector('.expand-btn');
    
    // Переключаем состояние раскрытия через CSS класс
    if (knowledgeSection.classList.contains('expanded')) {
      // Закрываем - показываем плюс (+)
      knowledgeSection.classList.remove('expanded');
      expandBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19" stroke="#2A3F5F" stroke-width="3" stroke-linecap="round"/>
          <path d="M5 12H19" stroke="#2A3F5F" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `;
    } else {
      // Открываем - показываем минус (-)
      knowledgeSection.classList.add('expanded');
      expandBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M5 12H19" stroke="#2A3F5F" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `;
    }
    return;
  }
  
  // Раскрытие разделов в рекомендуемых анализах
  if (e.target.closest('.recommended-expand-btn') || e.target.closest('.recommended-section-header')) {
    const clickedElement = e.target.closest('.recommended-expand-btn') || e.target.closest('.recommended-section-header');
    const recommendedSection = clickedElement.closest('.recommended-section');
    const expandBtn = recommendedSection.querySelector('.recommended-expand-btn');
    
    // Переключаем состояние раскрытия через CSS класс
    if (recommendedSection.classList.contains('expanded')) {
      // Закрываем - показываем плюс (+)
      recommendedSection.classList.remove('expanded');
      expandBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19" stroke="#31674A" stroke-width="3" stroke-linecap="round"/>
          <path d="M5 12H19" stroke="#31674A" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `;
    } else {
      // Открываем - показываем минус (-)
      recommendedSection.classList.add('expanded');
      expandBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M5 12H19" stroke="#31674A" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `;
    }
    return;
  }
  
  // Обработка кликов по опциям квиза - НОВАЯ ЛОГИКА ОТМЕНЫ ВЫБОРА
  if (e.target.closest('.quiz-option')) {
    const quizOption = e.target.closest('.quiz-option');
    const radioInput = quizOption.querySelector('input[type="radio"]');
    const customInput = document.querySelector('.quiz-custom-input');
    
    // Получаем текущий вопрос
    if (currentQuestionIndex >= 0 && currentQuestionIndex < surveyQuestions.length) {
      const currentQuestion = surveyQuestions[currentQuestionIndex];
      
      // Проверяем, была ли эта опция уже выбрана
      if (radioInput.checked) {
        // Если опция уже выбрана - отменяем выбор
        radioInput.checked = false;
        
        // Удаляем ответ из state
        saveDiagnosticAnswer(currentQuestion.id, '');
        
        // Включаем обратно поле для кастомного ответа
        if (customInput) {
          customInput.disabled = false;
          customInput.classList.remove('disabled');
        }
        
        // Включаем обратно все опции
        const allQuizOptions = document.querySelectorAll('.quiz-option');
        allQuizOptions.forEach(option => {
          option.classList.remove('disabled');
          const radio = option.querySelector('input[type="radio"]');
          if (radio) {
            radio.disabled = false;
          }
        });
      } else {
        // Если опция не была выбрана - выбираем её
        radioInput.checked = true;
        
        // Сохраняем LABEL (текст) в state, а не VALUE
        const selectedLabel = radioInput.nextElementSibling?.textContent?.trim() || radioInput.value;
        saveDiagnosticAnswer(currentQuestion.id, selectedLabel);
        
        // Отключаем поле для кастомного ответа
        if (customInput) {
          customInput.value = '';
          customInput.disabled = true;
          customInput.classList.add('disabled');
        }
        
        // Отключаем другие опции (оставляем только выбранную активной)
        const allQuizOptions = document.querySelectorAll('.quiz-option');
        allQuizOptions.forEach(option => {
          if (option !== quizOption) {
            option.classList.add('disabled');
            const radio = option.querySelector('input[type="radio"]');
            if (radio) {
              radio.disabled = true;
            }
          }
        });
      }
    }
    
    // Предотвращаем стандартное поведение
    e.preventDefault();
    return;
  }
  
  // Кнопка "Посмотреть рекомендованные анализы"
  if (e.target.closest('#viewRecommendationsBtn') && !e.target.closest('#helpIcon')) {
    showPage('recommendedTests');
    return;
  }
  
  // Кнопка "Пройти диагностику здоровья" в рекомендуемых анализах
  if (e.target.closest('#startDiagnosticBtn')) {
    showDiagnosticForm();
    return;
  }
  
  // Кнопка "Получить дополнительные рекомендации" в рекомендуемых анализах
  if (e.target.closest('#getRecommendationsBtn')) {
    showPage('health');
    return;
  }
  
  // Обработка ввода в поле кастомного ответа
  if (e.target.closest('.quiz-custom-input')) {
    const customInput = e.target.closest('.quiz-custom-input');
    
    // При фокусе на кастомном поле - отключаем все радио-кнопки
    if (e.type === 'focus' || e.type === 'click') {
      const allQuizOptions = document.querySelectorAll('.quiz-option');
      const allRadioInputs = document.querySelectorAll('.quiz-option input[type="radio"]');
      
      // Снимаем выбор со всех радио-кнопок
      allRadioInputs.forEach(radio => {
        radio.checked = false;
        radio.disabled = true;
      });
      
      // Отключаем все опции визуально
      allQuizOptions.forEach(option => {
        option.classList.add('disabled');
      });
    }
    return;
  }
  
  // Кнопки плюсов в рекомендациях на странице Здоровье
  if (e.target.closest('.rec-add-btn')) {
    showHealthModal();
    return;
  }
  
  // Клик по карточке быстрого запроса
  if (e.target.closest('.quick-request-card')) {
    const card = e.target.closest('.quick-request-card');
    const query = card.getAttribute('data-query');
    if (query) {
      openChatWithMessage(query);
    }
    return;
  }
  
  // Калитка Дневника: кнопка «Пройти диагностику»
  if (e.target.closest('#diaryGateBtn') || e.target.closest('.diary-gate-btn')) {
    showPage('diagnostics');
    return;
  }

  // Дневник - кнопка добавления записи
  if (e.target.closest('.add-entry-btn')) {
    openDiaryModal();
    return;
  }
  
  // Дневник - клик по записи для редактирования
  if (e.target.closest('.diary-entry')) {
    const entry = e.target.closest('.diary-entry');
    
    // Если кликнули по крестику удаления - не обрабатываем как клик по записи
    if (e.target.closest('.delete-entry-x')) {
      return;
    }
    
    // Если в режиме редактирования - не открываем модальное окно
    if (isEditMode) {
      return;
    }
    
    const entryId = entry.getAttribute('data-entry-id');
    const entryText = entry.querySelector('.entry-text').textContent;
    const entryTime = entry.querySelector('.entry-time').textContent;
    openDiaryModal(entryId, entryText, entryTime);
    return;
  }
  
  // Дневник - закрытие модального окна
  if (e.target.closest('.diary-modal-close') || (e.target.id === 'diaryModal' && !e.target.closest('.diary-modal-content'))) {
    closeDiaryModal();
    return;
  }
  
  // Дневник - сохранение записи
  if (e.target.closest('.diary-modal-btn')) {
    saveDiaryEntry();
    return;
  }
  
  // Дневник - переключение дней
  if (e.target.closest('.diary-day')) {
    const clickedDay = e.target.closest('.diary-day');
    switchToDay(clickedDay);
    return;
  }
  
  // Дневник - кнопка режима редактирования
  if (e.target.closest('.edit-mode-btn')) {
    toggleEditMode();
    return;
  }
  if (e.target.closest('#viewRecommendationsBtn') && !e.target.closest('#helpIcon')) {
    console.log('Основная кнопка рекомендаций нажата (заглушка)');
    return;
  }
  
  // Иконка помощи - открывает модальное окно
  if (e.target.closest('#helpIcon')) {
    e.preventDefault();
    e.stopPropagation();
    const modal = document.getElementById('recommendationsModal');
    if (modal) {
      modal.classList.add('active');
    }
    return;
  }
  
  // Закрытие модального окна
  if (e.target.closest('#closeModal')) {
    e.preventDefault();
    e.stopPropagation();
    const modal = document.getElementById('recommendationsModal');
    if (modal) {
      modal.classList.remove('active');
    }
    return;
  }
  
  // Закрытие модального окна по клику на фон
  if (e.target.id === 'recommendationsModal') {
    const modal = document.getElementById('recommendationsModal');
    if (modal) {
      modal.classList.remove('active');
    }
    return;
  }
  
  // Закрытие чата по клику на оверлей
  if (e.target.closest('#chatOverlay') && 
      !e.target.closest('.chat-messages') && 
      !e.target.closest('.chat-input-container') && 
      !e.target.closest('.header') && 
      !e.target.closest('.bottom-nav')) {
    showPage('main');
    return;
  }
});

// ========================================
// ФУНКЦИИ ЧАТА - ДУБЛИКАТ УДАЛЕН
// ========================================

let aiAbortController = null;
let isAiBusy = false;
let activeTypewriter = null;
let pendingAiMessages = [];

// Защита от зависания AI - время последней активности
let lastAiActivityTime = null;
const AI_STUCK_TIMEOUT = 120000; // 120 секунд без активности = зависание

// Безопасный сброс состояния AI
function resetAiState() {
  isAiBusy = false;
  lastAiActivityTime = null;
  setChatSendButtonMode('send');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Форматирование markdown в HTML для сообщений ИИ
function formatMarkdown(text) {
  let formatted = escapeHtml(text);
  
  // **текст** → <strong>текст</strong>
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // *текст* → <em>текст</em>
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Переносы строк → <br>
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
}

function addWelcomeMessage() {
  // УДАЛЕНО - больше не добавляем приветствие в чат
  // Быстрые запросы теперь на главной странице
}

function addUserMessage(text) {
  const chatMessages = document.getElementById('chatMessages');
  const container = chatMessages.querySelector('.chat-messages-container');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'user-message';
  
  let userAvatarHtml = '';
  if (user && user.photo_url) {
    userAvatarHtml = `<img src="${user.photo_url}" alt="${user.first_name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
  } else {
    const initials = user ? (user.first_name || 'U').substring(0, 2).toUpperCase() : 'U';
    userAvatarHtml = initials;
  }
  
  messageDiv.innerHTML = `
    <div class="user-avatar" style="background-image: url('${user?.photo_url || ''}');">
      ${!user?.photo_url ? (user ? (user.first_name || 'U').substring(0, 2).toUpperCase() : 'U') : ''}
    </div>
    <div class="message-bubble">
      <div class="message-text">${escapeHtml(text)}</div>
    </div>
  `;
  container.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addBotMessage(text) {
  const chatMessages = document.getElementById('chatMessages');
  const container = chatMessages.querySelector('.chat-messages-container');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'bot-message';

  // Извлекаем и удаляем кнопки из текста
  const buttonRegex = /\[BUTTON:(DIAGNOSTIC|ANALYSIS):([^\]]+)\]/g;
  const buttons = [];
  let match;
  while ((match = buttonRegex.exec(text)) !== null) {
    buttons.push({ type: match[1], text: match[2] });
  }
  const cleanText = text.replace(buttonRegex, '').trim();

  messageDiv.innerHTML = `
    <div class="bot-avatar">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill="#4A8B6C"/>
        <path d="M9 11C9 11 10.5 9.5 12 9.5C13.5 9.5 15 11 15 11M9 15C9 15 10.5 13.5 12 13.5C13.5 13.5 15 15 15 15" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="10" cy="11" r="0.5" fill="white"/>
        <circle cx="14" cy="11" r="0.5" fill="white"/>
      </svg>
    </div>
    <div class="message-bubble">
      <div class="message-text">${formatMarkdown(cleanText)}</div>
    </div>
  `;

  container.appendChild(messageDiv);
  
  // Добавляем кнопки если есть
  if (buttons.length > 0) {
    addActionButtons(messageDiv, buttons);
  }
  
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addBotMessageWithButton(text, buttonText, buttonAction) {
  const chatMessages = document.getElementById('chatMessages');
  const container = chatMessages.querySelector('.chat-messages-container');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'bot-message';
  messageDiv.innerHTML = `
    <div class="bot-avatar">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill="#4A8B6C"/>
        <path d="M9 11C9 11 10.5 9.5 12 9.5C13.5 9.5 15 11 15 11M9 15C9 15 10.5 13.5 12 13.5C13.5 13.5 15 15 15 15" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="10" cy="11" r="0.5" fill="white"/>
        <circle cx="14" cy="11" r="0.5" fill="white"/>
      </svg>
    </div>
    <div class="message-bubble">
      <p class="message-text">${text}</p>
      <button class="message-button" onclick="${buttonAction}">${buttonText}</button>
    </div>
  `;
  container.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addBotTypingIndicator() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) {
    console.error('❌ addBotTypingIndicator: chatMessages not found');
    return false;
  }
  
  const container = chatMessages.querySelector('.chat-messages-container');
  if (!container) {
    console.error('❌ addBotTypingIndicator: container not found');
    return false;
  }
  
  // Удаляем индикатор загрузки если есть
  const loadingOverlay = container.querySelector('.chat-loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'bot-message typing-indicator';
  messageDiv.id = 'typingIndicator';
  messageDiv.innerHTML = `
    <div class="bot-avatar">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill="#4A8B6C"/>
        <path d="M9 11C9 11 10.5 9.5 12 9.5C13.5 9.5 15 11 15 11M9 15C9 15 10.5 13.5 12 13.5C13.5 13.5 15 15 15 15" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="10" cy="11" r="0.5" fill="white"/>
        <circle cx="14" cy="11" r="0.5" fill="white"/>
      </svg>
    </div>
    <div class="message-bubble">
      <div class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="message-text" id="typingText" style="display:none;"></div>
      <div class="ai-actions" id="typingActions" style="display:none;"></div>
    </div>
  `;
  container.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return true;
}

function removeTypingIndicator() {
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) safeRemove(typingIndicator);
}

function chatMessagesScrollToBottom() {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function safeRemove(el) {
  if (!el) return;
  if (el.parentNode) {
    el.parentNode.removeChild(el);
    return;
  }
  if (typeof el.remove === 'function') {
    el.remove();
  }
}

function appendAiActions(bubble) {
  // УДАЛЕНО - быстрые запросы теперь в addWelcomeMessage()
  return;
}

function finalizeTypingBubble({ appendActions } = { appendActions: false }) {
  const typingIndicator = document.getElementById('typingIndicator');
  if (!typingIndicator) return;

  typingIndicator.classList.remove('typing-indicator');
  typingIndicator.removeAttribute('id');

  const dots = typingIndicator.querySelector('.typing-dots');
  if (dots) safeRemove(dots);

  const typingText = typingIndicator.querySelector('#typingText');
  if (typingText) {
    // Форматирование уже применено в реальном времени
    typingText.style.display = 'block';
    typingText.removeAttribute('id');
  }

  const actions = typingIndicator.querySelector('#typingActions');
  if (actions) safeRemove(actions);
}

function stopActiveTypewriter() {
  if (activeTypewriter && typeof activeTypewriter.stop === 'function') {
    activeTypewriter.stop();
    
    // Добавляем индикатор остановки к сообщению
    const typingText = document.getElementById('typingText');
    if (typingText && typingText.innerHTML.trim()) {
      typingText.innerHTML += '<br><span style="opacity: 0.6; font-size: 12px;">⏹ Остановлено</span>';
    }
  }
  activeTypewriter = null;
}

// Timeout для защиты от зависания typewriter (30 секунд)
let typewriterTimeout = null;
let typewriterStartTime = null;
const TYPEWRITER_MAX_TIME = 90000; // 90 секунд - достаточно для длинных сообщений

function typeMessage(text, callback) {
  const typingIndicator = document.getElementById('typingIndicator');
  const typingDots = typingIndicator?.querySelector('.typing-dots');
  const typingText = document.getElementById('typingText');
  
  if (!typingIndicator || !typingText) {
    console.error('❌ typeMessage: typingIndicator or typingText not found');
    // Добавляем сообщение напрямую
    addBotMessage(text);
    if (callback) callback();
    return;
  }

  // Извлекаем кнопки из текста
  const buttonRegex = /\[BUTTON:(DIAGNOSTIC|ANALYSIS):([^\]]+)\]/g;
  const buttons = [];
  let match;
  while ((match = buttonRegex.exec(text)) !== null) {
    buttons.push({ type: match[1], text: match[2] });
  }
  
  // Удаляем теги кнопок из текста
  const cleanText = text.replace(buttonRegex, '').trim();

  if (typingDots) typingDots.style.display = 'none';
  typingText.style.display = 'block';
  typingText.innerHTML = '';

  let index = 0;
  let currentText = ''; // Накапливаем напечатанный текст
  const baseSpeed = 8;
  let stopped = false;
  let finalized = false;
  
  typewriterStartTime = Date.now();

  function finalizeTyping() {
    // Защита от повторного вызова
    if (finalized) return;
    finalized = true;
    
    // Очищаем timeout
    if (typewriterTimeout) {
      clearTimeout(typewriterTimeout);
      typewriterTimeout = null;
    }
    
    finalizeTypingBubble({ appendActions: false });
    
    // Добавляем кнопки после завершения печати
    if (buttons.length > 0) {
      addActionButtons(typingIndicator, buttons);
    }
    
    activeTypewriter = null;
    if (callback) callback();
  }
  
  // Принудительное завершение если текст не допечатан
  function forceFinalize() {
    console.warn('⚠️ Typewriter timeout - forcing completion');
    if (finalized) return;
    
    // Показываем весь текст сразу
    typingText.innerHTML = formatMarkdown(cleanText);
    chatMessagesScrollToBottom();
    finalizeTyping();
  }
  
  // Устанавливаем защитный timeout
  typewriterTimeout = setTimeout(forceFinalize, TYPEWRITER_MAX_TIME);

  function typeChar() {
    if (finalized) return;
    
    // Обновляем время активности при каждом символе
    lastAiActivityTime = Date.now();
    
    if (stopped) {
      finalizeTyping();
      return;
    }
    
    // Проверка на зависание (если вкладка была неактивна)
    const elapsed = Date.now() - typewriterStartTime;
    if (elapsed > TYPEWRITER_MAX_TIME) {
      forceFinalize();
      return;
    }
    
    if (index < cleanText.length) {
      const char = cleanText.charAt(index);
      currentText += char;
      // Применяем форматирование в реальном времени
      typingText.innerHTML = formatMarkdown(currentText);
      index++;

      let delay = baseSpeed;
      if (char === '.' || char === '!' || char === '?') delay = 40;
      else if (char === ',' || char === ';' || char === ':') delay = 25;
      else if (char === '\n') delay = 35;
      else if (char === ' ') delay = 5;

      delay += Math.random() * 10 - 5;
      chatMessagesScrollToBottom();
      setTimeout(typeChar, Math.max(5, delay));
      return;
    }

    finalizeTyping();
  }

  activeTypewriter = {
    stop() {
      if (stopped || finalized) return;
      stopped = true;
    },
    forceComplete() {
      forceFinalize();
    }
  };

  typeChar();
}

// Добавление рекомендаций под последним сообщением на основе статусов
function addStatusRecommendations(quizCompleted, analysesUploaded) {
  // Если оба статуса TRUE - ничего не добавляем
  if (quizCompleted && analysesUploaded) return;
  
  const chatMessages = document.getElementById('chatMessages');
  const container = chatMessages?.querySelector('.chat-messages-container');
  if (!container) return;
  
  // Находим последнее сообщение бота
  const lastBotMessage = container.querySelector('.bot-message:last-of-type');
  if (!lastBotMessage) return;
  
  const bubble = lastBotMessage.querySelector('.message-bubble');
  if (!bubble) return;
  
  // Создаём блок рекомендаций
  const recommendationsBlock = document.createElement('div');
  recommendationsBlock.className = 'status-recommendations';
  
  let html = '';
  
  if (!quizCompleted) {
    html += `
      <div class="status-recommendation-item">
        <span class="recommendation-text">Чтобы ответ был точнее: пройди диагностику</span>
        <button class="recommendation-btn" onclick="showDiagnosticForm()">Пройти диагностику</button>
      </div>
    `;
  }
  
  if (!analysesUploaded) {
    html += `
      <div class="status-recommendation-item">
        <span class="recommendation-text">Загрузи анализы для персональных рекомендаций</span>
        <button class="recommendation-btn" onclick="showMyTestsPage()">Загрузить анализы</button>
      </div>
    `;
  }
  
  recommendationsBlock.innerHTML = html;
  bubble.appendChild(recommendationsBlock);
  
  chatMessagesScrollToBottom();
}

// Добавление кнопок действий к сообщению
function addActionButtons(messageElement, buttons) {
  const bubble = messageElement?.querySelector('.message-bubble');
  if (!bubble) return;
  
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'ai-action-buttons';
  
  buttons.forEach(btn => {
    const button = document.createElement('button');
    button.className = 'ai-action-btn';
    button.textContent = btn.text;
    
    button.addEventListener('click', () => {
      if (btn.type === 'DIAGNOSTIC') {
        // Переход на диагностику
        showDiagnosticForm();
      } else if (btn.type === 'ANALYSIS') {
        // Переход на загрузку анализов
        showMyTestsPage();
      }
    });
    
    buttonsContainer.appendChild(button);
  });
  
  bubble.appendChild(buttonsContainer);
  chatMessagesScrollToBottom();
}

function setChatSendButtonMode(mode) {
  const btn = document.querySelector('.chat-send-btn');
  if (!btn) return;
  btn.dataset.mode = mode;

  if (mode === 'stop') {
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="5" y="5" width="10" height="10" rx="2" fill="#666"/>
      </svg>
    `;
    return;
  }

  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M7 10L13 10M13 10L10 7M13 10L10 13" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function stopAIResponse() {
  console.log('🛑 Stopping AI response...');
  
  // Останавливаем запрос к API
  if (aiAbortController) {
    try {
      aiAbortController.abort();
      console.log('✅ API request aborted');
    } catch (e) {
      console.log('⚠️ Error aborting:', e);
    }
  }
  aiAbortController = null;

  // Останавливаем печать и финализируем сообщение
  stopActiveTypewriter();
  finalizeTypingBubble({ appendActions: false });

  // Сбрасываем состояние
  resetAiState();
  pendingAiMessages = []; // Очищаем очередь
  
  console.log('✅ AI response stopped');
}

function processAiQueue() {
  console.log('🔄 processAiQueue called, isAiBusy:', isAiBusy, 'queue length:', pendingAiMessages.length);
  
  if (isAiBusy) {
    console.log('⏳ AI is busy, waiting...');
    return;
  }
  
  const next = pendingAiMessages.shift();
  if (!next) {
    console.log('📭 Queue empty');
    return;
  }
  
  console.log('✅ Processing message:', next?.substring(0, 50) + '...');
  isAiBusy = true;
  setChatSendButtonMode('stop');
  sendMessageToAI(next);
}

async function sendMessageToAI(message) {
  console.log('🤖 sendMessageToAI called with:', message?.substring(0, 50) + '...');
  
  // Обновляем время активности
  lastAiActivityTime = Date.now();
  
  try {
    const indicatorAdded = addBotTypingIndicator();
    if (!indicatorAdded) {
      console.warn('⚠️ Typing indicator not added, but continuing...');
    }

    // Get Telegram user data and initData
    const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user || null;
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    
    console.log('📡 Sending to API, chatId:', currentChatId);

    aiAbortController = new AbortController();
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      },
      body: JSON.stringify({ 
        message,
        chatId: currentChatId, // Добавляем ID текущего чата
        telegramUser: telegramUser ? {
          id: telegramUser.id,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          username: telegramUser.username
        } : null,
        telegramWebAppData
      }),
      signal: aiAbortController.signal
    });

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    let data = null;
    let rawText = '';

    try {
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        rawText = await response.text();
        try {
          data = JSON.parse(rawText);
        } catch (_) {
          data = null;
        }
      }
    } catch (_) {
      try {
        rawText = await response.text();
      } catch (_) {
        rawText = '';
      }
    }

    if (!response.ok) {
      finalizeTypingBubble({ appendActions: false });
      const serverMsg = (data && (data.error || data.message)) ? String(data.error || data.message) : '';
      const hint = serverMsg ? `Ошибка сервера: ${serverMsg}` : `Ошибка сервера: ${response.status}`;
      addBotMessage(hint);
      resetAiState();
      aiAbortController = null;
      processAiQueue();
      return;
    }

    if (!data?.success || !data?.response) {
      finalizeTypingBubble({ appendActions: false });
      const serverMsg = data?.error ? `Ошибка сервера: ${String(data.error)}` : 'Извините, произошла ошибка при обработке запроса. Попробуйте позже.';
      addBotMessage(serverMsg);
      resetAiState();
      aiAbortController = null;
      processAiQueue();
      return;
    }

    aiAbortController = null;
    typeMessage(data.response, () => {
      chatMessagesScrollToBottom();
      resetAiState();
      processAiQueue();
      
      // Обрабатываем статус квиза из ответа
      if (data.quizCompleted !== undefined) {
        quizCompleted = data.quizCompleted;
        console.log('Updated quiz status from API:', quizCompleted);
      }
      
      // Добавляем рекомендации под сообщением если нужно
      addStatusRecommendations(data.quizCompleted, data.analysesUploaded);
      
      // Обрабатываем переполнение контекста
      if (false && (data.newChatCreated || data.contextOverflow)) {
        // Показываем специальное сообщение о создании нового чата
        const overflowMessage = `
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 12px; 
                      border-radius: 12px; 
                      margin: 16px 0;
                      text-align: center;
                      border: 2px solid rgba(255,255,255,0.2);
                      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);">
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div>
                <div style="font-weight: 600; font-size: 14px;">🔄 Создан новый чат</div>
                <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
                  Контекст переполнен, продолжаем в свежем чате
                </div>
              </div>
            </div>
          </div>
        `;
        
        addBotMessage(overflowMessage);
        
        // Обновляем текущий ID чата
        if (data.chatId) {
          currentChatId = data.chatId;
        }
        
        // Перезагружаем историю чатов
        loadChatsFromAPI();
      }
    });
  } catch (error) {
    console.error('❌ sendMessageToAI error:', error);
    
    if (error && (error.name === 'AbortError' || error.message === 'The user aborted a request.')) {
      // user stopped / new message arrived
      resetAiState();
      aiAbortController = null;
      finalizeTypingBubble({ appendActions: true });
      processAiQueue();
      return;
    }
    finalizeTypingBubble({ appendActions: false });
    const msg = error?.message ? String(error.message) : '';
    const shown = msg ? `Не удалось выполнить запрос: ${msg}` : 'Не удалось выполнить запрос к серверу.';
    addBotMessage(shown);
    resetAiState();
    aiAbortController = null;
    processAiQueue();
  }
}

// Флаг готовности приложения
let appDataLoaded = false;
let appDataPromise = null;

// Загрузка всех данных приложения (параллельно!)
async function loadAppData() {
  if (appDataLoaded) return;
  if (appDataPromise) return appDataPromise;
  
  console.log('🚀 Загрузка данных приложения...');
  const startTime = Date.now();
  
  // Ждём инициализации Telegram WebApp
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    console.log('📱 Telegram WebApp ready');
  }
  
  // Запускаем ВСЕ загрузки ПАРАЛЛЕЛЬНО
  appDataPromise = Promise.all([
    loadPhotosFromSupabase().catch(e => console.warn('Photos load error:', e)),
    checkQuizStatus().catch(e => console.warn('Quiz status error:', e)),
    loadActiveChat().catch(e => console.warn('Chat load error:', e))
  ]);
  
  await appDataPromise;
  
  // Инициализация Realtime (не блокирует)
  initPhotosRealtime();
  
  appDataLoaded = true;
  console.log(`✅ Все данные загружены за ${Date.now() - startTime}ms`);
}

// Проверка и восстановление состояния AI
function checkAndRecoverAiState() {
  if (!isAiBusy) return;
  
  const now = Date.now();
  if (lastAiActivityTime && (now - lastAiActivityTime) > AI_STUCK_TIMEOUT) {
    console.warn('⚠️ AI appears stuck, recovering state...');
    
    // Завершаем typewriter принудительно
    if (activeTypewriter?.forceComplete) {
      activeTypewriter.forceComplete();
    }
    
    // Сбрасываем состояние
    finalizeTypingBubble({ appendActions: false });
    resetAiState();
    pendingAiMessages = [];
    
    console.log('✅ AI state recovered');
  }
}

// Обработка возврата в приложение (visibility change)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('📱 App became visible, checking state...');
    
    // Проверяем не завис ли AI
    checkAndRecoverAiState();
    
    // Если был активный typewriter, завершаем его
    if (activeTypewriter) {
      console.log('⚠️ Active typewriter found, forcing completion...');
      if (activeTypewriter.forceComplete) {
        activeTypewriter.forceComplete();
      }
    }
  }
});

// Инициализация Telegram WebApp (выполняется сразу, не ждёт DOMContentLoaded)
if (window.Telegram?.WebApp) {
  console.log('Telegram WebApp detected');
  
  // Устанавливаем тему
  if (window.Telegram.WebApp.colorScheme) {
    document.body.setAttribute('data-theme', window.Telegram.WebApp.colorScheme);
  }
} else {
  console.log('Local mode - no Telegram WebApp');
}

// Периодическая проверка на зависание (каждые 10 секунд)
setInterval(checkAndRecoverAiState, 10000);

async function openChatWithMessage(message) {
  console.log('🚀 openChatWithMessage called with:', message);
  
  showPage('chat');
  
  // Показываем индикатор загрузки
  const chatMessages = document.getElementById('chatMessages');
  let container = chatMessages?.querySelector('.chat-messages-container');
  if (container) {
    container.innerHTML = `
      <div class="chat-loading-overlay">
        <div class="chat-loading-spinner"></div>
        <div class="chat-loading-text">Подготовка чата...</div>
      </div>
    `;
  }
  
  try {
    // Всегда загружаем активный чат для получения актуального ID
    await loadActiveChat();
    console.log('✅ Chat loaded, currentChatId:', currentChatId);
    
    // Обновляем ссылку на контейнер (мог измениться после loadActiveChat)
    container = chatMessages?.querySelector('.chat-messages-container');
    
    // Удаляем индикатор загрузки если остался
    const loadingOverlay = container?.querySelector('.chat-loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.remove();
    }
    
    // Даём время на рендеринг UI
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Проверяем что всё готово
    if (!currentChatId) {
      console.error('❌ No currentChatId after loadActiveChat');
      return;
    }
    
    // Отправляем сообщение
    console.log('📤 Sending message to chat:', currentChatId);
    sendChatMessage(message);
    
  } catch (error) {
    console.error('❌ Error in openChatWithMessage:', error);
    // Удаляем индикатор загрузки при ошибке
    const loadingOverlay = container?.querySelector('.chat-loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.remove();
    }
  }
}

function handleDiagnosticButton() {
  showPage('diagnostics');
  setTimeout(() => {
    showDiagnosticForm();
  }, 100);
}

// ========================================
// ФУНКЦИИ ДИАГНОСТИКИ
// ========================================

// Проверка есть ли сохраненный прогресс диагностики
function checkDiagnosticProgress() {
  const savedPersonalData = localStorage.getItem('diagnosticPersonalData');
  const savedAnswers = localStorage.getItem('surveyAnswers');
  const savedAdditionalAnswers = localStorage.getItem('additionalAnswers');
  
  return savedPersonalData || savedAnswers || savedAdditionalAnswers;
}

// Проверка завершена ли диагностика полностью
function isDiagnosticCompleted() {
  const savedAdditionalAnswers = JSON.parse(localStorage.getItem('additionalAnswers') || '{}');
  return Object.keys(savedAdditionalAnswers).length > 0;
}

// Определение где остановился пользователь
function getDiagnosticState() {
  const savedPersonalData = JSON.parse(localStorage.getItem('diagnosticPersonalData') || '{}');
  const savedAnswers = JSON.parse(localStorage.getItem('surveyAnswers') || '{}');
  const savedAdditionalAnswers = JSON.parse(localStorage.getItem('additionalAnswers') || '{}');
  
  if (Object.keys(savedAdditionalAnswers).length > 0) {
    return 'completed'; // Диагностика завершена
  } else if (Object.keys(savedAnswers).length > 0) {
    return 'quiz'; // Есть ответы на вопросы - был в квизе
  } else if (Object.keys(savedPersonalData).length > 0) {
    return 'form'; // Есть личные данные - был в форме
  } else {
    return 'main'; // Нет данных - начинаем с главной
  }
}

// ========================================
// ИСПРАВЛЕНИЕ ПРОБЛЕМ С VIEWPORT НА МОБИЛЬНЫХ
// ========================================

// Функция для принудительного сброса viewport
function resetViewport() {
  // Принудительно сбрасываем высоту viewport
  const surveyStep = document.getElementById('surveyStep');
  if (surveyStep && surveyStep.classList.contains('active')) {
    surveyStep.style.height = '100vh';
    surveyStep.style.minHeight = '100vh';
    
    // Через небольшую задержку восстанавливаем правильные значения
    setTimeout(() => {
      surveyStep.style.height = '100dvh';
      surveyStep.style.minHeight = '100dvh';
    }, 100);
  }
}

// Обработчики для сброса viewport при проблемах с клавиатурой
window.addEventListener('resize', resetViewport);
window.addEventListener('orientationchange', resetViewport);

// Сброс viewport при скрытии клавиатуры
document.addEventListener('focusout', (e) => {
  if (e.target.closest('.quiz-custom-input')) {
    // Небольшая задержка для корректного сброса после скрытия клавиатуры
    setTimeout(resetViewport, 300);
  }
});

// Дополнительный сброс при переходе между вопросами
function resetViewportOnQuestionChange() {
  setTimeout(resetViewport, 100);
}

// ========================================
// ДИАГНОСТИЧЕСКАЯ ФОРМА
// ========================================

function showDiagnosticForm() {
  // Если диагностика уже пройдена - перенаправляем на вкладку Здоровье
  if (quizCompleted) {
    showPage('health');
    return;
  }
  
  createDiagnosticFormUI();
}

// Создание UI формы диагностики (используется и для первого, и для повторного прохождения)
function createDiagnosticFormUI() {
  isDiagnosticFormMode = true;
  diagnosticState = getDiagnosticState();
  
  const diagnosticForm = document.createElement('div');
  diagnosticForm.className = 'diagnostic-form-overlay';
  diagnosticForm.id = 'diagnosticFormOverlay';
  
  diagnosticForm.innerHTML = `
    <div class="diagnostic-form-content">
      <!-- Экран заполнения данных -->
      <div class="form-step" id="personalDataStep">
        <header class="slide-header">
          <div class="avatar" id="diagnosticFormAvatar">AM</div>
        </header>
        
        <h2 class="form-main-title">Диагностическая анкета:<br>оценка систем организма</h2>
        
        <div class="gender-selection">
          <label class="gender-option">
            <input type="radio" name="gender" value="male" required>
            <span class="gender-radio"></span>
            <span class="gender-text">Мужчина</span>
          </label>
          <label class="gender-option">
            <input type="radio" name="gender" value="female" required>
            <span class="gender-radio"></span>
            <span class="gender-text">Женщина</span>
          </label>
        </div>
        
        <div class="form-fields">
          <div class="form-field">
            <label class="field-label">ФИО</label>
            <input type="text" class="field-input" id="fullName" placeholder="Иванов Иван Иванович">
          </div>
          
          <div class="form-field">
            <label class="field-label">Дата рождения</label>
            <input type="text" class="field-input" id="birthDate" placeholder="01.01.1970г">
          </div>
          
          <div class="form-field">
            <label class="field-label">Ваша профессия</label>
            <input type="text" class="field-input" id="profession" placeholder="Инженер">
          </div>
          
          <div class="form-field">
            <label class="field-label">Город проживания</label>
            <input type="text" class="field-input" id="city" placeholder="Москва">
          </div>
          
          <div class="form-field">
            <label class="field-label">Вес</label>
            <input type="text" class="field-input" id="weight" placeholder="">
          </div>
          
          <div class="form-field">
            <label class="field-label">Рост</label>
            <input type="text" class="field-input" id="height" placeholder="">
          </div>
          
          <div class="form-field">
            <label class="field-label">Спорт</label>
            <input type="text" class="field-input" id="sport" placeholder="Занимаетесь ли вы спортом?">
          </div>
        </div>
        
        <div class="form-navigation">
          <button class="nav-circle-btn nav-circle-btn-active" id="formBackBtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19L5 12L12 5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="nav-circle-btn nav-circle-btn-primary" id="formNextBtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M12 5L19 12L12 19" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        
        <!-- Навигация в форме -->
        <nav class="bottom-nav">
          <button class="nav-item">
            <svg width="24" height="27" viewBox="0 0 24 27" fill="none">
              <path d="M1.5 13.1393C1.5 11.1027 1.5 10.0844 1.91169 9.18926C2.32338 8.29415 3.09655 7.63144 4.64288 6.30601L6.14288 5.0203C8.93785 2.6246 10.3353 1.42676 12 1.42676C13.6647 1.42676 15.0621 2.6246 17.8571 5.0203L19.3571 6.30601C20.9035 7.63144 21.6766 8.29415 22.0883 9.18926C22.5 10.0844 22.5 11.1027 22.5 13.1393V19.4999C22.5 22.3283 22.5 23.7425 21.6213 24.6212C20.7426 25.4999 19.3284 25.4999 16.5 25.4999H7.5C4.67157 25.4999 3.25736 25.4999 2.37868 24.6212C1.5 23.7425 1.5 22.3283 1.5 19.4999V13.1393Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M15.75 25.5V18C15.75 17.1716 15.0784 16.5 14.25 16.5H9.75C8.92157 16.5 8.25 17.1716 8.25 18V25.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Главная</span>
          </button>
          <button class="nav-item active">
            <svg width="20" height="25" viewBox="0 0 20 25" fill="none">
              <path d="M18.4001 8.80001V20.8C18.4001 22.1255 17.3256 23.2 16.0001 23.2H4.0001C2.67461 23.2 1.6001 22.1255 1.6001 20.8V4.00001C1.6001 2.67452 2.67461 1.60001 4.0001 1.60001H11.2001M18.4001 8.80001H13.6001C12.2746 8.80001 11.2001 7.72549 11.2001 6.40001V1.60001M18.4001 8.80001L11.2001 1.60001M6.4001 13.6H8.8001M6.4001 18.4H12.4001" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Диагностика</span>
          </button>
          <button class="nav-item">
            <svg width="25" height="25" viewBox="0 0 25 25" fill="none">
              <path d="M10.8888 21.7778L21.7777 10.8889C23.9255 8.74112 23.9255 5.25889 21.7777 3.11112C19.6299 0.963344 16.1477 0.96334 13.9999 3.11111L3.11106 14C0.963283 16.1478 0.963283 19.63 3.11106 21.7778C5.25883 23.9256 8.74106 23.9256 10.8888 21.7778Z" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16.3334 16.3333C12.8384 14.8355 10.0535 12.0506 8.55566 8.55556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Здоровье</span>
          </button>
          <button class="nav-item">
            <svg width="28" height="25" viewBox="0 0 28 25" fill="none">
              <path d="M26.25 9.39178V8.90178C26.25 7.07227 26.25 6.15752 25.894 5.45874C25.5808 4.84408 25.081 4.34434 24.4664 4.03116C23.7676 3.67511 22.8528 3.67511 21.0233 3.67511H6.97667C5.14716 3.67511 4.23241 3.67511 3.53363 4.03116C2.91897 4.34434 2.41923 4.84408 2.10605 5.45874C1.75 6.15752 1.75 7.07227 1.75 8.90178V9.39178M26.25 9.39178V18.4568C26.25 20.2863 26.25 21.201 25.894 21.8998C25.5808 22.5145 25.081 23.0142 24.4664 23.3274C23.7676 23.6834 22.8528 23.6834 21.0233 23.6834H6.97667C5.14716 23.6834 4.23241 23.6834 3.53363 23.3274C2.91897 23.0142 2.41923 22.5145 2.10605 21.8998C1.75 21.201 1.75 20.2863 1.75 18.4568V9.39178M26.25 9.39178H1.75" stroke="currentColor" stroke-width="1.63333"/>
              <path d="M8.2832 0.816666L8.2832 6.53333M19.7165 0.816666L19.7165 6.53333" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
              <path d="M14 20.1104L14 12.9646" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
              <path d="M18.083 16.5376L9.91634 16.5376" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
            </svg>
            <span>Дневник</span>
          </button>
          <button class="nav-item">
            <svg width="28" height="24" viewBox="0 0 28 24" fill="none">
              <path d="M14 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777832 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 22.5556C27.2222 22.5556 25.6667 19.4444 20.2222 19.4444C14.7778 19.4444 14 22.5556 14 22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777778 22.5556C0.777778 22.5556 2.33333 19.4444 7.77778 19.4444C13.2222 19.4444 14 22.5556 14 22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 3.88888C27.2222 3.88888 25.6667 0.777771 20.2222 0.777771C14.7778 0.777771 14 3.88888 14 3.88888" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777778 3.88888C0.777778 3.88888 2.33333 0.777771 7.77778 0.777771C13.2222 0.777771 14 3.88888 14 3.88888" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
            </svg>
            <span>База знаний</span>
          </button>
          <button class="nav-item admin-nav-item" style="display: none;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Админ</span>
          </button>
        </nav>
      </div>
      
      <!-- Экран квиза -->
      <div class="form-step hidden" id="surveyStep">
        <header class="slide-header">
          <div class="avatar" id="surveyFormAvatar">AM</div>
        </header>
        
        <div class="survey-question" id="surveyQuestion">
          <!-- Вопросы будут загружаться динамически -->
        </div>
        
        <div class="quiz-navigation">
          <button class="quiz-nav-btn" id="surveyBackBtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19L5 12L12 5" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="quiz-nav-btn" id="surveyNextBtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M12 5L19 12L12 19" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        
        <!-- Навигация в квизе -->
        <nav class="bottom-nav">
          <button class="nav-item">
            <svg width="24" height="27" viewBox="0 0 24 27" fill="none">
              <path d="M1.5 13.1393C1.5 11.1027 1.5 10.0844 1.91169 9.18926C2.32338 8.29415 3.09655 7.63144 4.64288 6.30601L6.14288 5.0203C8.93785 2.6246 10.3353 1.42676 12 1.42676C13.6647 1.42676 15.0621 2.6246 17.8571 5.0203L19.3571 6.30601C20.9035 7.63144 21.6766 8.29415 22.0883 9.18926C22.5 10.0844 22.5 11.1027 22.5 13.1393V19.4999C22.5 22.3283 22.5 23.7425 21.6213 24.6212C20.7426 25.4999 19.3284 25.4999 16.5 25.4999H7.5C4.67157 25.4999 3.25736 25.4999 2.37868 24.6212C1.5 23.7425 1.5 22.3283 1.5 19.4999V13.1393Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M15.75 25.5V18C15.75 17.1716 15.0784 16.5 14.25 16.5H9.75C8.92157 16.5 8.25 17.1716 8.25 18V25.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Главная</span>
          </button>
          <button class="nav-item active">
            <svg width="20" height="25" viewBox="0 0 20 25" fill="none">
              <path d="M18.4001 8.80001V20.8C18.4001 22.1255 17.3256 23.2 16.0001 23.2H4.0001C2.67461 23.2 1.6001 22.1255 1.6001 20.8V4.00001C1.6001 2.67452 2.67461 1.60001 4.0001 1.60001H11.2001M18.4001 8.80001H13.6001C12.2746 8.80001 11.2001 7.72549 11.2001 6.40001V1.60001M18.4001 8.80001L11.2001 1.60001M6.4001 13.6H8.8001M6.4001 18.4H12.4001" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Диагностика</span>
          </button>
          <button class="nav-item">
            <svg width="25" height="25" viewBox="0 0 25 25" fill="none">
              <path d="M10.8888 21.7778L21.7777 10.8889C23.9255 8.74112 23.9255 5.25889 21.7777 3.11112C19.6299 0.963344 16.1477 0.96334 13.9999 3.11111L3.11106 14C0.963283 16.1478 0.963283 19.63 3.11106 21.7778C5.25883 23.9256 8.74106 23.9256 10.8888 21.7778Z" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16.3334 16.3333C12.8384 14.8355 10.0535 12.0506 8.55566 8.55556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Здоровье</span>
          </button>
          <button class="nav-item">
            <svg width="28" height="25" viewBox="0 0 28 25" fill="none">
              <path d="M26.25 9.39178V8.90178C26.25 7.07227 26.25 6.15752 25.894 5.45874C25.5808 4.84408 25.081 4.34434 24.4664 4.03116C23.7676 3.67511 22.8528 3.67511 21.0233 3.67511H6.97667C5.14716 3.67511 4.23241 3.67511 3.53363 4.03116C2.91897 4.34434 2.41923 4.84408 2.10605 5.45874C1.75 6.15752 1.75 7.07227 1.75 8.90178V9.39178M26.25 9.39178V18.4568C26.25 20.2863 26.25 21.201 25.894 21.8998C25.5808 22.5145 25.081 23.0142 24.4664 23.3274C23.7676 23.6834 22.8528 23.6834 21.0233 23.6834H6.97667C5.14716 23.6834 4.23241 23.6834 3.53363 23.3274C2.91897 23.0142 2.41923 22.5145 2.10605 21.8998C1.75 21.201 1.75 20.2863 1.75 18.4568V9.39178M26.25 9.39178H1.75" stroke="currentColor" stroke-width="1.63333"/>
              <path d="M8.2832 0.816666L8.2832 6.53333M19.7165 0.816666L19.7165 6.53333" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
              <path d="M14 20.1104L14 12.9646" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
              <path d="M18.083 16.5376L9.91634 16.5376" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
            </svg>
            <span>Дневник</span>
          </button>
          <button class="nav-item">
            <svg width="28" height="24" viewBox="0 0 28 24" fill="none">
              <path d="M14 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777832 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 22.5556C27.2222 22.5556 25.6667 19.4444 20.2222 19.4444C14.7778 19.4444 14 22.5556 14 22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777778 22.5556C0.777778 22.5556 2.33333 19.4444 7.77778 19.4444C13.2222 19.4444 14 22.5556 14 22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 3.88888C27.2222 3.88888 25.6667 0.777771 20.2222 0.777771C14.7778 0.777771 14 3.88888 14 3.88888" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777778 3.88888C0.777778 3.88888 2.33333 0.777771 7.77778 0.777771C13.2222 0.777771 14 3.88888 14 3.88888" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
            </svg>
            <span>База знаний</span>
          </button>
          <button class="nav-item admin-nav-item" style="display: none;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Админ</span>
          </button>
        </nav>
      </div>
      
      <!-- Экран дополнительных вопросов -->
      <div class="form-step hidden" id="additionalQuestionsStep">
        <header class="slide-header">
          <div class="avatar" id="additionalFormAvatar">AM</div>
        </header>
        
        <h2 class="form-main-title">Диагностическая анкета:<br>Нервная система</h2>
        
        <div class="additional-questions-container">
          <!-- Вопрос 1 -->
          <div class="additional-question-block">
            <div class="question-card-small">
              <div class="question-progress">
                <span class="progress-number">15/17</span>
                <div class="progress-bar-small">
                  <div class="progress-fill-small" style="width: 88%"></div>
                </div>
              </div>
              <p class="question-text-small">Напишите всё, что приносит вам дискомфорт</p>
            </div>
            <div class="answer-field">
              <label class="answer-label">Свой вариант ответа:</label>
              <textarea class="answer-textarea" id="additionalAnswer1" placeholder="Например: Плохо, часто ужасно..."></textarea>
            </div>
          </div>

          <!-- Вопрос 2 -->
          <div class="additional-question-block">
            <div class="question-card-small">
              <div class="question-progress">
                <span class="progress-number">16/17</span>
                <div class="progress-bar-small">
                  <div class="progress-fill-small" style="width: 94%"></div>
                </div>
              </div>
              <p class="question-text-small">Заключение врачей при предыдущих диагнозах</p>
            </div>
            <div class="answer-field">
              <label class="answer-label">Свой вариант ответа:</label>
              <textarea class="answer-textarea" id="additionalAnswer2" placeholder="Например: нет, никого..."></textarea>
            </div>
          </div>

          <!-- Вопрос 3 -->
          <div class="additional-question-block">
            <div class="question-card-small">
              <div class="question-progress">
                <span class="progress-number">17/17</span>
                <div class="progress-bar-small">
                  <div class="progress-fill-small" style="width: 100%"></div>
                </div>
              </div>
              <p class="question-text-small">Чем лечились при предыдущих диагнозах</p>
            </div>
            <div class="answer-field">
              <label class="answer-label">Свой вариант ответа:</label>
              <textarea class="answer-textarea" id="additionalAnswer3" placeholder="Например: препарат..."></textarea>
            </div>
          </div>
        </div>
        
        <div class="form-navigation">
          <button class="nav-circle-btn nav-circle-btn-active" id="additionalBackBtn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19L5 12L12 5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="create-program-final-btn" id="additionalNextBtn">Создать программу</button>
        </div>
        
        <!-- Навигация в дополнительных вопросах -->
        <nav class="bottom-nav">
          <button class="nav-item">
            <svg width="24" height="27" viewBox="0 0 24 27" fill="none">
              <path d="M1.5 13.1393C1.5 11.1027 1.5 10.0844 1.91169 9.18926C2.32338 8.29415 3.09655 7.63144 4.64288 6.30601L6.14288 5.0203C8.93785 2.6246 10.3353 1.42676 12 1.42676C13.6647 1.42676 15.0621 2.6246 17.8571 5.0203L19.3571 6.30601C20.9035 7.63144 21.6766 8.29415 22.0883 9.18926C22.5 10.0844 22.5 11.1027 22.5 13.1393V19.4999C22.5 22.3283 22.5 23.7425 21.6213 24.6212C20.7426 25.4999 19.3284 25.4999 16.5 25.4999H7.5C4.67157 25.4999 3.25736 25.4999 2.37868 24.6212C1.5 23.7425 1.5 22.3283 1.5 19.4999V13.1393Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M15.75 25.5V18C15.75 17.1716 15.0784 16.5 14.25 16.5H9.75C8.92157 16.5 8.25 17.1716 8.25 18V25.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Главная</span>
          </button>
          <button class="nav-item active">
            <svg width="20" height="25" viewBox="0 0 20 25" fill="none">
              <path d="M18.4001 8.80001V20.8C18.4001 22.1255 17.3256 23.2 16.0001 23.2H4.0001C2.67461 23.2 1.6001 22.1255 1.6001 20.8V4.00001C1.6001 2.67452 2.67461 1.60001 4.0001 1.60001H11.2001M18.4001 8.80001H13.6001C12.2746 8.80001 11.2001 7.72549 11.2001 6.40001V1.60001M18.4001 8.80001L11.2001 1.60001M6.4001 13.6H8.8001M6.4001 18.4H12.4001" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Диагностика</span>
          </button>
          <button class="nav-item">
            <svg width="25" height="25" viewBox="0 0 25 25" fill="none">
              <path d="M10.8888 21.7778L21.7777 10.8889C23.9255 8.74112 23.9255 5.25889 21.7777 3.11112C19.6299 0.963344 16.1477 0.96334 13.9999 3.11111L3.11106 14C0.963283 16.1478 0.963283 19.63 3.11106 21.7778C5.25883 23.9256 8.74106 23.9256 10.8888 21.7778Z" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16.3334 16.3333C12.8384 14.8355 10.0535 12.0506 8.55566 8.55556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Здоровье</span>
          </button>
          <button class="nav-item">
            <svg width="28" height="25" viewBox="0 0 28 25" fill="none">
              <path d="M26.25 9.39178V8.90178C26.25 7.07227 26.25 6.15752 25.894 5.45874C25.5808 4.84408 25.081 4.34434 24.4664 4.03116C23.7676 3.67511 22.8528 3.67511 21.0233 3.67511H6.97667C5.14716 3.67511 4.23241 3.67511 3.53363 4.03116C2.91897 4.34434 2.41923 4.84408 2.10605 5.45874C1.75 6.15752 1.75 7.07227 1.75 8.90178V9.39178M26.25 9.39178V18.4568C26.25 20.2863 26.25 21.201 25.894 21.8998C25.5808 22.5145 25.081 23.0142 24.4664 23.3274C23.7676 23.6834 22.8528 23.6834 21.0233 23.6834H6.97667C5.14716 23.6834 4.23241 23.6834 3.53363 23.3274C2.91897 23.0142 2.41923 22.5145 2.10605 21.8998C1.75 21.201 1.75 20.2863 1.75 18.4568V9.39178M26.25 9.39178H1.75" stroke="currentColor" stroke-width="1.63333"/>
              <path d="M8.2832 0.816666L8.2832 6.53333M19.7165 0.816666L19.7165 6.53333" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
              <path d="M14 20.1104L14 12.9646" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
              <path d="M18.083 16.5376L9.91634 16.5376" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
            </svg>
            <span>Дневник</span>
          </button>
          <button class="nav-item">
            <svg width="28" height="24" viewBox="0 0 28 24" fill="none">
              <path d="M14 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777832 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 22.5556C27.2222 22.5556 25.6667 19.4444 20.2222 19.4444C14.7778 19.4444 14 22.5556 14 22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777778 22.5556C0.777778 22.5556 2.33333 19.4444 7.77778 19.4444C13.2222 19.4444 14 22.5556 14 22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 3.88888C27.2222 3.88888 25.6667 0.777771 20.2222 0.777771C14.7778 0.777771 14 3.88888 14 3.88888" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777778 3.88888C0.777778 3.88888 2.33333 0.777771 7.77778 0.777771C13.2222 0.777771 14 3.88888 14 3.88888" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
            </svg>
            <span>База знаний</span>
          </button>
          <button class="nav-item admin-nav-item" style="display: none;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Админ</span>
          </button>
        </nav>
      </div>
    </div>
  `;
  
  document.body.appendChild(diagnosticForm);
  diagnosticForm.style.display = 'flex';
  document.body.classList.add('chat-overlay-visible');
  
  // Добавляем обработчики ПОСЛЕ создания HTML
  setTimeout(() => {
    // Инициализируем панели навигации в диагностической форме (показываем кнопку админа)
    updateAllNavigations();
    
    // Обработчик кнопки "Создать программу"
    const additionalNextBtn = document.getElementById('additionalNextBtn');
    console.log('🔍 Ищем кнопку additionalNextBtn:', additionalNextBtn);
    
    if (additionalNextBtn) {
      console.log('✅ Кнопка найдена, добавляем обработчик');
      additionalNextBtn.addEventListener('click', async () => {
        try {
          console.log('🔥 КНОПКА СОЗДАТЬ ПРОГРАММУ НАЖАТА!');
          
          // Сохраняем последние дополнительные ответы в state
          saveAdditionalAnswersRealtime();
          
          // Проверяем что все 25 ответов заполнены
          const filledCount = getFilledAnswersCount();
          console.log(`📊 Заполнено ответов: ${filledCount}/25`);
          
          if (filledCount !== 25) {
            if (window.Telegram?.WebApp) {
              window.Telegram.WebApp.showAlert(`Пожалуйста, заполните все поля. Заполнено: ${filledCount} из 25`);
            }
            return;
          }
          
          // ЗАВЕРШАЕМ ДИАГНОСТИКУ
          console.log('💾 Сохраняем все результаты в базу данных...');
          const success = await completeDiagnosticQuiz();
          
          if (success) {
            // Удаляем форму диагностики
            const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
            isDiagnosticFormMode = false;
            
            console.log('🗑️ Удаляем форму...');
            diagnosticFormOverlay.remove();
            document.body.classList.remove('chat-overlay-visible');
            
            console.log('✅ Показываем Telegram уведомление...');
            if (window.Telegram?.WebApp) {
              // Показываем уведомление и переходим на главную после нажатия "Хорошо"
              window.Telegram.WebApp.showAlert(
                'Спасибо! Ваши ответы сохранены.\nТеперь ИИ будет давать персонализированные рекомендации.',
                () => {
                  console.log('🏠 Переходим на главную страницу...');
                  showPage('main'); // Переход на главную
                }
              );
            } else {
              // Fallback для тестирования
              console.log('🏠 Переходим на главную страницу...');
              showPage('main');
            }
            
            console.log('📊 Диагностика завершена и сохранена в БД');
          } else {
            // Если сохранение не удалось, показываем ошибку
            console.error('❌ Ошибка при сохранении результатов квиза');
            if (window.Telegram?.WebApp) {
              window.Telegram.WebApp.showAlert('Произошла ошибка при сохранении результатов. Попробуйте еще раз.');
            }
          }
        } catch (error) {
          console.error('❌ Ошибка в обработчике кнопки:', error);
          if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.showAlert('Произошла ошибка. Попробуйте еще раз.');
          }
        }
      });
      
      console.log('✅ Обработчик кнопки "Создать программу" добавлен');
    } else {
      console.error('❌ Кнопка additionalNextBtn не найдена!');
    }
  }, 100);
  
  updateAvatar(document.getElementById('diagnosticFormAvatar'), user, userName);
  updateAvatar(document.getElementById('surveyFormAvatar'), user, userName);
  updateAvatar(document.getElementById('additionalFormAvatar'), user, userName);
  
  // ВОССТАНАВЛИВАЕМ СОХРАНЕННЫЕ ДАННЫЕ ФОРМЫ
  restoreFormData();
  
  // Добавляем обработчики для реалтайм сохранения персональных данных
  setTimeout(() => {
    // Поля ввода
    const weightInput = document.getElementById('weight');
    const heightInput = document.getElementById('height');
    const fullNameInput = document.getElementById('fullName');
    const birthDateInput = document.getElementById('birthDate');
    const professionInput = document.getElementById('profession');
    const cityInput = document.getElementById('city');
    const sportInput = document.getElementById('sport');
    
    // Radio кнопки пола
    const genderInputs = document.querySelectorAll('input[name="gender"]');
    
    // Добавляем обработчики на поля ввода
    if (weightInput) weightInput.addEventListener('input', savePersonalDataRealtime);
    if (heightInput) heightInput.addEventListener('input', savePersonalDataRealtime);
    if (fullNameInput) fullNameInput.addEventListener('input', savePersonalDataRealtime);
    if (birthDateInput) birthDateInput.addEventListener('input', savePersonalDataRealtime);
    if (professionInput) professionInput.addEventListener('input', savePersonalDataRealtime);
    if (cityInput) cityInput.addEventListener('input', savePersonalDataRealtime);
    if (sportInput) sportInput.addEventListener('input', savePersonalDataRealtime);
    
    // Добавляем обработчики на radio кнопки пола
    genderInputs.forEach(input => {
      input.addEventListener('change', savePersonalDataRealtime);
    });
    
    console.log('✅ Realtime save handlers added for personal data');
  }, 200);
  
  // АВТОМАТИЧЕСКИ ПЕРЕХОДИМ К НУЖНОМУ ШАГУ
  if (diagnosticState === 'additional') {
    // Если был в дополнительных вопросах - переходим к ним
    setTimeout(() => {
      document.getElementById('personalDataStep').classList.add('hidden');
      document.getElementById('additionalQuestionsStep').classList.remove('hidden');
      restoreAdditionalAnswers();
      
      // Добавляем обработчики для дополнительных полей
      const additionalAnswer1 = document.getElementById('additionalAnswer1');
      const additionalAnswer2 = document.getElementById('additionalAnswer2');
      const additionalAnswer3 = document.getElementById('additionalAnswer3');
      
      if (additionalAnswer1) additionalAnswer1.addEventListener('input', saveAdditionalAnswersRealtime);
      if (additionalAnswer2) additionalAnswer2.addEventListener('input', saveAdditionalAnswersRealtime);
      if (additionalAnswer3) additionalAnswer3.addEventListener('input', saveAdditionalAnswersRealtime);
      
      console.log('✅ Realtime save handlers added for additional answers');
    }, 100);
  } else if (diagnosticState === 'quiz') {
    // Если был в квизе - сразу переходим к квизу
    setTimeout(() => {
      document.getElementById('personalDataStep').classList.add('hidden');
      document.getElementById('surveyStep').classList.remove('hidden');
      initSurvey();
    }, 100);
  }
  // Если diagnosticState === 'form' или 'main' - остаемся в форме данных
  
  // Обработчики формы
  document.getElementById('formBackBtn').addEventListener('click', () => {
    // НЕ УДАЛЯЕМ ДАННЫЕ - только закрываем форму и возвращаемся в главное меню диагностики
    // ДАННЫЕ УДАЛЯЮТСЯ ТОЛЬКО при нажатии кнопки "Диагностика" когда уже в диагностике
    
    isDiagnosticFormMode = false;
    diagnosticForm.remove();
    document.body.classList.remove('chat-overlay-visible');
    showPage('diagnostics'); // Возвращаемся на главную диагностики
  });
  
  document.getElementById('formNextBtn').addEventListener('click', () => {
    const gender = document.querySelector('input[name="gender"]:checked');
    const fullName = document.getElementById('fullName').value.trim();
    
    if (!gender) {
      tg.showAlert('Пожалуйста, выберите ваш пол');
      return;
    }
    
    if (!fullName) {
      tg.showAlert('Пожалуйста, введите ваше ФИО');
      return;
    }
    
    // Сохраняем данные
    const personalData = {
      gender: gender.value,
      fullName: fullName,
      birthDate: document.getElementById('birthDate').value.trim(),
      profession: document.getElementById('profession').value.trim(),
      city: document.getElementById('city').value.trim(),
      weight: document.getElementById('weight').value.trim(),
      height: document.getElementById('height').value.trim(),
      sport: document.getElementById('sport').value.trim(),
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('diagnosticPersonalData', JSON.stringify(personalData));
    
    // ПЕРЕХОДИМ К КВИЗУ
    diagnosticState = 'quiz';
    document.getElementById('personalDataStep').classList.add('hidden');
    document.getElementById('surveyStep').classList.remove('hidden');
    initSurvey();
  });
  
  // Обработчик перехода к дополнительным вопросам из квиза
  document.getElementById('goToAdditionalBtn').addEventListener('click', () => {
    diagnosticState = 'additional';
    document.getElementById('surveyStep').classList.add('hidden');
    document.getElementById('additionalQuestionsStep').classList.remove('hidden');
    restoreAdditionalAnswers();
    
    // Добавляем обработчики для дополнительных полей
    setTimeout(() => {
      const additionalAnswer1 = document.getElementById('additionalAnswer1');
      const additionalAnswer2 = document.getElementById('additionalAnswer2');
      const additionalAnswer3 = document.getElementById('additionalAnswer3');
      
      if (additionalAnswer1) additionalAnswer1.addEventListener('input', saveAdditionalAnswersRealtime);
      if (additionalAnswer2) additionalAnswer2.addEventListener('input', saveAdditionalAnswersRealtime);
      if (additionalAnswer3) additionalAnswer3.addEventListener('input', saveAdditionalAnswersRealtime);
      
      console.log('✅ Realtime save handlers added for additional answers (from quiz)');
    }, 100);
  });
  
  // Обработчики дополнительных вопросов
  document.getElementById('additionalBackBtn').addEventListener('click', () => {
    // Возвращаемся к последнему вопросу квиза
    diagnosticState = 'quiz';
    document.getElementById('additionalQuestionsStep').classList.add('hidden');
    document.getElementById('surveyStep').classList.remove('hidden');
    currentQuestionIndex = surveyQuestions.length - 1;
    showQuestion(currentQuestionIndex);
  });
  
}

// ========================================
// СТРАНИЦА "МОИ АНАЛИЗЫ"
// ========================================

function showMyTestsPage() {
  isDiagnosticFormMode = true; // Устанавливаем флаг что мы в специальном режиме
  isInRecommendedTests = false; // Сбрасываем флаг рекомендуемых анализов
  
  const myTestsForm = document.createElement('div');
  myTestsForm.className = 'diagnostic-form-overlay';
  myTestsForm.id = 'myTestsFormOverlay';
  
  myTestsForm.innerHTML = `
    <div class="diagnostic-form-content">
      <div class="form-step" id="myTestsStep">
        <!-- Статичный аватар в правом верхнем углу -->
        <div class="static-avatar" id="myTestsAvatar">AM</div>
        
        <div class="my-tests-content">
          <h2 class="my-tests-title">Мои анализы</h2>
          <p class="my-tests-subtitle">Загрузите результаты исследований</p>
          
          <div class="file-upload-section">
            <div class="file-upload-card">
              <div class="upload-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="#4A8B6C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M7 10L12 5L17 10" stroke="#4A8B6C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M12 5V15" stroke="#4A8B6C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <h3 class="upload-title">Загрузить файл</h3>
              <p class="upload-subtitle">Поддерживаются форматы PDF, JPG, PNG или сделайте фото</p>
              <div class="upload-buttons">
                <button class="upload-btn-primary" id="selectFileBtn">Выбрать файл</button>
                <button class="upload-btn-secondary" id="takePhotoBtn">Сделать фото</button>
              </div>
              <input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif" style="display: none;">
              <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display: none;">
            </div>
          </div>
          
          <div class="test-type-section">
            <h3 class="section-title">Тип анализа</h3>
            <div class="test-type-buttons">
              <button class="test-type-btn active" data-type="blood">Анализ крови</button>
              <button class="test-type-btn" data-type="hormones">Гормоны</button>
              <button class="test-type-btn" data-type="vitamins">Витамины</button>
              <button class="test-type-btn" data-type="other">Другое</button>
            </div>
          </div>
          
          <div class="uploaded-tests-section">
            <div class="uploaded-tests-list" id="uploadedTestsList">
              <h3 class="uploaded-tests-title">Загруженные анализы</h3>
              <!-- Индикатор загрузки -->
              <div class="tests-loading" id="testsLoading">
                <div class="tests-loading-spinner"></div>
                <p>Загрузка анализов...</p>
              </div>
              <!-- Сюда будут добавляться загруженные анализы -->
            </div>
          </div>
          
          <div class="recommendations-section">
            <button class="recommendations-btn" id="viewRecommendationsBtn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 11H15M9 15H15M17 21L21 17M3 5C3 3.89543 3.89543 3 5 3H19C20.1046 3 21 3.89543 21 5V15C21 16.1046 20.1046 17 19 17H7L3 21V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Посмотреть рекомендованные анализы</span>
              <div class="help-icon" id="helpIcon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                  <path d="M9.09 9C9.3251 8.33167 9.78915 7.76811 10.4 7.40913C11.0108 7.05016 11.7289 6.91894 12.4272 7.03871C13.1255 7.15849 13.7588 7.52152 14.2151 8.06353C14.6713 8.60553 14.9211 9.29152 14.92 10C14.92 12 11.92 13 11.92 13M12 17H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
          </div>
        </div>
        
        <!-- Модальное окно с информацией -->
        <div class="modal-overlay" id="recommendationsModal">
          <div class="modal-content">
            <button class="modal-close" id="closeModal">×</button>
            <div class="modal-text">
              <p>Следует отметить, что высокотехнологичная концепция общественного уклада, в своём классическом представлении, допускает внедрение как самодостаточных, так и внешне зависимых концептуальных решений. Являясь всего лишь частью общей картины, представители современных социальных резервов лишь добавляют фракционных разногласий и объявлены нарушающими общечеловеческие нормы этики и морали.</p>
            </div>
          </div>
        </div>
        
        <!-- Навигация -->
        <nav class="bottom-nav">
          <button class="nav-item">
            <svg width="24" height="27" viewBox="0 0 24 27" fill="none">
              <path d="M1.5 13.1393C1.5 11.1027 1.5 10.0844 1.91169 9.18926C2.32338 8.29415 3.09655 7.63144 4.64288 6.30601L6.14288 5.0203C8.93785 2.6246 10.3353 1.42676 12 1.42676C13.6647 1.42676 15.0621 2.6246 17.8571 5.0203L19.3571 6.30601C20.9035 7.63144 21.6766 8.29415 22.0883 9.18926C22.5 10.0844 22.5 11.1027 22.5 13.1393V19.4999C22.5 22.3283 22.5 23.7425 21.6213 24.6212C20.7426 25.4999 19.3284 25.4999 16.5 25.4999H7.5C4.67157 25.4999 3.25736 25.4999 2.37868 24.6212C1.5 23.7425 1.5 22.3283 1.5 19.4999V13.1393Z" stroke="currentColor" stroke-width="1.5"/>
              <path d="M15.75 25.5V18C15.75 17.1716 15.0784 16.5 14.25 16.5H9.75C8.92157 16.5 8.25 17.1716 8.25 18V25.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Главная</span>
          </button>
          <button class="nav-item active">
            <svg width="20" height="25" viewBox="0 0 20 25" fill="none">
              <path d="M18.4001 8.80001V20.8C18.4001 22.1255 17.3256 23.2 16.0001 23.2H4.0001C2.67461 23.2 1.6001 22.1255 1.6001 20.8V4.00001C1.6001 2.67452 2.67461 1.60001 4.0001 1.60001H11.2001M18.4001 8.80001H13.6001C12.2746 8.80001 11.2001 7.72549 11.2001 6.40001V1.60001M18.4001 8.80001L11.2001 1.60001M6.4001 13.6H8.8001M6.4001 18.4H12.4001" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Диагностика</span>
          </button>
          <button class="nav-item">
            <svg width="25" height="25" viewBox="0 0 25 25" fill="none">
              <path d="M10.8888 21.7778L21.7777 10.8889C23.9255 8.74112 23.9255 5.25889 21.7777 3.11112C19.6299 0.963344 16.1477 0.96334 13.9999 3.11111L3.11106 14C0.963283 16.1478 0.963283 19.63 3.11106 21.7778C5.25883 23.9256 8.74106 23.9256 10.8888 21.7778Z" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16.3334 16.3333C12.8384 14.8355 10.0535 12.0506 8.55566 8.55556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Здоровье</span>
          </button>
          <button class="nav-item">
            <svg width="28" height="25" viewBox="0 0 28 25" fill="none">
              <path d="M26.25 9.39178V8.90178C26.25 7.07227 26.25 6.15752 25.894 5.45874C25.5808 4.84408 25.081 4.34434 24.4664 4.03116C23.7676 3.67511 22.8528 3.67511 21.0233 3.67511H6.97667C5.14716 3.67511 4.23241 3.67511 3.53363 4.03116C2.91897 4.34434 2.41923 4.84408 2.10605 5.45874C1.75 6.15752 1.75 7.07227 1.75 8.90178V9.39178M26.25 9.39178V18.4568C26.25 20.2863 26.25 21.201 25.894 21.8998C25.5808 22.5145 25.081 23.0142 24.4664 23.3274C23.7676 23.6834 22.8528 23.6834 21.0233 23.6834H6.97667C5.14716 23.6834 4.23241 23.6834 3.53363 23.3274C2.91897 23.0142 2.41923 22.5145 2.10605 21.8998C1.75 21.201 1.75 20.2863 1.75 18.4568V9.39178M26.25 9.39178H1.75" stroke="currentColor" stroke-width="1.63333"/>
              <path d="M8.2832 0.816666L8.2832 6.53333M19.7165 0.816666L19.7165 6.53333" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
              <path d="M14 20.1104L14 12.9646" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
              <path d="M18.083 16.5376L9.91634 16.5376" stroke="currentColor" stroke-width="1.63333" stroke-linecap="round"/>
            </svg>
            <span>Дневник</span>
          </button>
          <button class="nav-item">
            <svg width="28" height="24" viewBox="0 0 28 24" fill="none">
              <path d="M14 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777832 3.88889V22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 22.5556C27.2222 22.5556 25.6667 19.4444 20.2222 19.4444C14.7778 19.4444 14 22.5556 14 22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777778 22.5556C0.777778 22.5556 2.33333 19.4444 7.77778 19.4444C13.2222 19.4444 14 22.5556 14 22.5556" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M27.2222 3.88888C27.2222 3.88888 25.6667 0.777771 20.2222 0.777771C14.7778 0.777771 14 3.88888 14 3.88888" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
              <path d="M0.777778 3.88888C0.777778 3.88888 2.33333 0.777771 7.77778 0.777771C13.2222 0.777771 14 3.88888 14 3.88888" stroke="currentColor" stroke-width="1.55556" stroke-linecap="round"/>
            </svg>
            <span>База знаний</span>
          </button>
          <button class="nav-item admin-nav-item" style="display: none;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Админ</span>
          </button>
        </nav>
      </div>
    </div>
  `;
  
  document.body.appendChild(myTestsForm);
  myTestsForm.style.display = 'flex';
  document.body.classList.add('chat-overlay-visible');
  
  // Инициализируем панель навигации в "Мои анализы" (показываем кнопку админа)
  setTimeout(() => {
    updateAllNavigations();
  }, 100);
  
  // ВСЕГДА загружаем свежие данные из БД при открытии вкладки
  console.log('🔥 КНОПКА "МОИ АНАЛИЗЫ" НАЖАТА - НАЧИНАЮ ЗАГРУЗКУ');
  loadUploadedTests();
  
  // Обновляем аватар в статичной позиции
  updateAvatar(document.getElementById('myTestsAvatar'), user, userName);
  
  // Обработчики событий
  setupMyTestsHandlers();
}

function setupMyTestsHandlers() {
  // Выбор файла
  const selectFileBtn = document.getElementById('selectFileBtn');
  const fileInput = document.getElementById('fileInput');
  if (selectFileBtn && fileInput) {
    selectFileBtn.addEventListener('click', () => {
      console.log('Кнопка выбора файла нажата');
      fileInput.click();
    });
  }
  
  // Обработка выбора файла
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      console.log('Файл выбран:', e.target.files);
      const file = e.target.files[0];
      if (file) {
        console.log('Обрабатываем файл:', file.name);
        handleFileUpload(file);
      }
      // Очищаем input для повторного выбора того же файла
      e.target.value = '';
    });
  }
  
  // Обработка фото с камеры
  const cameraInput = document.getElementById('cameraInput');
  if (cameraInput) {
    cameraInput.addEventListener('change', (e) => {
      console.log('Фото с камеры выбрано:', e.target.files);
      const file = e.target.files[0];
      if (file) {
        console.log('Обрабатываем фото:', file.name);
        handleFileUpload(file);
      }
      // Очищаем input для повторного выбора
      e.target.value = '';
    });
  }
  
  // Сделать фото
  const takePhotoBtn = document.getElementById('takePhotoBtn');
  if (takePhotoBtn && cameraInput) {
    takePhotoBtn.addEventListener('click', () => {
      console.log('Кнопка камеры нажата');
      cameraInput.click();
    });
  }
  
  // Переключение типов анализов - ИСПРАВЛЕННАЯ ЛОГИКА
  const testTypeBtns = document.querySelectorAll('.test-type-btn');
  console.log('Найдено кнопок типов анализов:', testTypeBtns.length);
  
  // Убеждаемся что первая кнопка активна по умолчанию
  if (testTypeBtns.length > 0) {
    testTypeBtns.forEach(btn => btn.classList.remove('active'));
    testTypeBtns[0].classList.add('active');
  }
  
  testTypeBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      console.log('Кнопка типа анализа нажата:', btn.textContent);
      // Убираем active у всех кнопок
      testTypeBtns.forEach(b => b.classList.remove('active'));
      // Добавляем active к нажатой кнопке
      btn.classList.add('active');
    });
  });
  
  // Действия с тестами - ВОССТАНОВЛЕННАЯ ФУНКЦИОНАЛЬНОСТЬ
  const deleteButtons = document.querySelectorAll('.test-action-btn.delete');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const testItem = btn.closest('.test-item');
      const testName = testItem.querySelector('.test-name').textContent;
      
      if (confirm(`Удалить анализ "${testName}"?`)) {
        testItem.remove();
      }
    });
  });
  
  // Просмотр файлов - ВОССТАНОВЛЕННАЯ ФУНКЦИОНАЛЬНОСТЬ
  const testInfos = document.querySelectorAll('.test-info');
  testInfos.forEach(testInfo => {
    testInfo.addEventListener('click', () => {
      const testItem = testInfo.closest('.test-item');
      const fileURL = testItem.getAttribute('data-file-url');
      const fileType = testItem.getAttribute('data-file-type');
      const fileName = testInfo.querySelector('.test-name').textContent;
      
      if (!fileURL) {
        alert('Это демо-файл. Загрузите свой файл для просмотра.');
        return;
      }
      
      // Для изображений показываем в модальном окне
      if (fileType && fileType.startsWith('image/')) {
        showImageModal(fileURL, fileName);
      } else if (fileType === 'application/pdf') {
        // Для PDF открываем в новом окне
        window.open(fileURL, '_blank');
      } else {
        // Для других типов файлов предлагаем скачать
        const link = document.createElement('a');
        link.href = fileURL;
        link.download = fileName;
        link.click();
      }
    });
  });
}

async function handleFileUpload(file) {
  console.log('=== НАЧАЛО ЗАГРУЗКИ ФАЙЛА ===');
  console.log('Имя файла:', file.name);
  console.log('Тип файла:', file.type);
  console.log('Размер файла:', file.size, 'байт');
  
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (file.size > maxSize) {
    console.log('ОШИБКА: Файл слишком большой');
    alert('Файл слишком большой. Максимальный размер: 10MB');
    return;
  }
  
  const allowedTypes = [
    'application/pdf', 
    'image/jpeg', 
    'image/jpg', 
    'image/png', 
    'image/webp', 
    'image/heic', 
    'image/heif'
  ];
  
  console.log('Проверяем тип файла...');
  if (!allowedTypes.includes(file.type)) {
    console.log('ОШИБКА: Неподдерживаемый тип файла:', file.type);
    alert('Неподдерживаемый формат файла. Используйте PDF, JPG, PNG, WebP или HEIC');
    return;
  }
  
  console.log('Тип файла поддерживается');

  try {
    // Показываем индикатор загрузки
    showLoadingOverlay();
    
    // Получаем выбранный тип анализа
    const activeTypeBtn = document.querySelector('.test-type-btn.active');
    const analysisGroup = activeTypeBtn ? activeTypeBtn.textContent : 'Другое';
    
    // Загружаем файл в Supabase Storage
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `analysis-photos/${window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'unknown'}/${fileName}`;
    
    console.log('Загружаем файл в Storage:', filePath);
    
    // Сначала получаем URL для загрузки
    const uploadResponse = await fetch('/api/analysis-photos?action=upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-WebApp-Data': window.Telegram?.WebApp?.initData || ''
      },
      body: JSON.stringify({
        fileName,
        fileType: file.type,
        fileSize: file.size,
        filePath
      })
    });
    
    if (!uploadResponse.ok) {
      throw new Error('Не удалось получить URL для загрузки');
    }
    
    const { uploadUrl, publicUrl } = await uploadResponse.json();
    
    // Загружаем файл через signed URL
    const uploadResult = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type
      },
      body: file
    });
    
    if (!uploadResult.ok) {
      const errorText = await uploadResult.text();
      console.error('Upload error details:', errorText);
      throw new Error(`Не удалось загрузить файл: ${uploadResult.status} ${errorText}`);
    }
    
    console.log('Файл успешно загружен в Storage:', publicUrl);
    
    // Сохраняем информацию о файле в базу данных
    const saveResponse = await fetch('/api/analysis-photos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-WebApp-Data': window.Telegram?.WebApp?.initData || ''
      },
      body: JSON.stringify({
        telegramUser: window.Telegram?.WebApp?.initDataUnsafe?.user,
        photo_url: publicUrl,
        photo_name: file.name,
        file_size: file.size,
        analysis_group: analysisGroup,
        description: ''
      })
    });
    
    if (!saveResponse.ok) {
      throw new Error('Не удалось сохранить информацию о файле');
    }
    
    const saveResult = await saveResponse.json();
    console.log('Информация о файле сохранена в БД:', saveResult);
    
    // Добавляем фото в состояние и обновляем UI (НЕ перезагружаем весь список)
    if (saveResult.photo) {
      uploadedPhotosState.unshift(saveResult.photo);
      updatePhotosUI();
    }
    
    // Показываем уведомление об успешной загрузке
    alert('Анализ успешно загружен!');
    
    console.log('=== ФАЙЛ УСПЕШНО ЗАГРУЖЕН В БД ===');
  } catch (error) {
    console.error('Ошибка при загрузке файла:', error);
    alert('Ошибка при загрузке файла: ' + error.message);
  } finally {
    hideLoadingOverlay();
  }
}

// Глобальное состояние для фото
let uploadedPhotosState = [];
let photosSubscription = null;

// Инициализация Supabase Realtime для фото
function initPhotosRealtime() {
  if (photosSubscription) {
    photosSubscription.unsubscribe();
  }

  const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!telegramId) return;

  // Подписываемся на изменения в таблице user_analysis_photos
  photosSubscription = supabase
    .channel('user_analysis_photos')
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'user_analysis_photos',
        filter: `telegram_id=eq.${telegramId}`
      }, 
      (payload) => {
        console.log('Photos change:', payload);
        
        if (payload.eventType === 'INSERT') {
          // Добавляем новое фото в состояние
          uploadedPhotosState.unshift(payload.new);
          updatePhotosUI();
        } else if (payload.eventType === 'DELETE') {
          // Удаляем фото из состояния
          uploadedPhotosState = uploadedPhotosState.filter(p => p.id !== payload.old.id);
          updatePhotosUI();
        }
      }
    )
    .subscribe();
}

// Мгновенная загрузка фото из API
async function loadPhotosFromSupabase() {
  try {
    console.log('🔥 НАЧИНАЮ ЗАГРУЗКУ ФОТО...');
    
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    console.log('📱 Telegram data:', telegramWebAppData ? 'exists' : 'missing');
    
    const response = await fetch('/api/analysis-photos', {
      headers: {
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Ошибка загрузки фото:', response.status, errorText);
      uploadedPhotosState = [];
      updatePhotosUI();
      return;
    }
    
    const data = await response.json();
    console.log('📋 Photos API response:', data);
    
    if (!data.success) {
      console.error('❌ API returned success=false:', data);
      uploadedPhotosState = [];
      updatePhotosUI();
      return;
    }
    
    // Сохраняем в состояние (пустой массив если нет фото)
    uploadedPhotosState = data.photos || [];
    console.log('✅ Фото загружены в состояние:', uploadedPhotosState.length);
    console.log('📸 Фото данные:', uploadedPhotosState);
    
    // ВСЕГДА обновляем UI
    updatePhotosUI();
    
  } catch (error) {
    console.error('❌ Ошибка загрузки фото:', error);
    uploadedPhotosState = [];
    updatePhotosUI();
  }
}

// Обновление UI из состояния
function updatePhotosUI() {
  const testsList = document.getElementById('uploadedTestsList');
  if (!testsList) return;

  // Скрываем индикатор загрузки перед обновлением
  showTestsLoading(false);

  // Сохраняем заголовок, очищаем всё остальное
  testsList.innerHTML = '<h3 class="uploaded-tests-title">Загруженные анализы</h3>';
  
  // Показываем анализы или сообщение о пустом списке
  if (uploadedPhotosState.length > 0) {
    uploadedPhotosState.forEach(photo => {
      // addUploadedTest(fileName, fileType, fileURL, photoId, analysisGroup)
      addUploadedTest(photo.photo_name, null, photo.photo_url, photo.id, photo.analysis_group);
    });
  } else {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'no-tests-message';
    emptyMsg.textContent = 'Нет загруженных анализов';
    testsList.appendChild(emptyMsg);
  }
}

// Загрузка и отображение загруженных анализов — ВСЕГДА загружаем свежие данные из БД
async function loadUploadedTests() {
  // Показываем индикатор загрузки
  showTestsLoading(true);
  
  // ВСЕГДА загружаем свежие данные из БД
  await loadPhotosFromSupabase();
  
  // Скрываем индикатор загрузки (updatePhotosUI вызывается внутри loadPhotosFromSupabase)
  showTestsLoading(false);
}

// Показать/скрыть индикатор загрузки анализов
function showTestsLoading(show) {
  const loadingEl = document.getElementById('testsLoading');
  if (loadingEl) {
    loadingEl.style.display = show ? 'flex' : 'none';
  }
}

// Функция для обновления списка анализов если страница уже открыта
function updateUploadedTestsIfPageOpen() {
  const testsList = document.getElementById('uploadedTestsList');
  if (testsList) {
    console.log('Страница "Мои анализы" открыта, обновляем список...');
    // Просто вызываем единую функцию обновления UI
    updatePhotosUI();
  }
}

function addUploadedTest(fileName, fileType, fileURL, photoId, analysisGroup) {
  const testItem = document.createElement('div');
  testItem.className = 'test-item';
  testItem.innerHTML = `
    <div class="test-info">
      <p class="test-name">${fileName}</p>
      <p class="test-type">${analysisGroup}</p>
    </div>
    <div class="test-actions">
      <div class="test-check-btn">
        <svg width="24" height="24" viewBox="0 0 30 30" fill="none">
          <path d="M11.25 12.5L15.3226 15.5545C15.8457 15.9468 16.5828 15.8697 17.0133 15.3776L25 6.25" stroke="#FEF7EC" stroke-width="1.875" stroke-linecap="round"/>
          <path d="M26.25 15C26.25 17.3506 25.5137 19.6422 24.1445 21.5529C22.7753 23.4636 20.8421 24.8974 18.6162 25.653C16.3903 26.4085 13.9837 26.4479 11.7343 25.7656C9.4849 25.0832 7.50574 23.7134 6.07478 21.8486C4.64381 19.9837 3.83293 17.7174 3.75602 15.3681C3.67911 13.0187 4.34004 10.7043 5.64597 8.74984C6.9519 6.79537 8.83723 5.29906 11.0372 4.47106C13.2371 3.64305 15.6412 3.52495 17.9117 4.13333" stroke="#FEF7EC" stroke-width="1.875" stroke-linecap="round"/>
        </svg>
      </div>
      <button class="test-delete-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6L18 18" stroke="#C7563E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;
  
  // Клик по элементу (кроме кнопок) - просмотр файла
  testItem.addEventListener('click', (e) => {
    if (e.target.closest('.test-delete-btn') || e.target.closest('.test-check-btn')) return;
    
    console.log('Клик по файлу:', fileName, 'URL:', fileURL);
    
    const url = fileURL || '';
    const name = fileName || '';
    const isImage = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(url) || /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(name);
    const isPdf = /\.pdf$/i.test(url) || /\.pdf$/i.test(name);
    
    if (isImage) {
      showImageModal(fileURL, fileName);
    } else if (isPdf) {
      window.open(fileURL, '_blank');
    } else {
      showImageModal(fileURL, fileName);
    }
  });
  
  // Кнопка удаления
  const deleteBtn = testItem.querySelector('.test-delete-btn');
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    console.log('Удаление файла:', fileName, 'photoId:', photoId);
    
    if (confirm(`Удалить анализ "${fileName}"?`)) {
      try {
        const deleteResponse = await fetch('/api/analysis-photos', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-WebApp-Data': window.Telegram?.WebApp?.initData || ''
          },
          body: JSON.stringify({
            telegramUser: window.Telegram?.WebApp?.initDataUnsafe?.user,
            photo_id: photoId
          })
        });
        
        if (deleteResponse.ok) {
          uploadedPhotosState = uploadedPhotosState.filter(p => p.id !== photoId);
          console.log('✅ Файл удален, осталось в состоянии:', uploadedPhotosState.length);
          updatePhotosUI();
        } else {
          const errorData = await deleteResponse.json();
          console.error('Ошибка при удалении из БД:', errorData);
          alert('Ошибка при удалении файла');
        }
      } catch (error) {
        console.error('Ошибка при удалении:', error);
        alert('Ошибка при удалении файла');
      }
    }
  });
  
  const testsList = document.getElementById('uploadedTestsList');
  testsList.appendChild(testItem);
}

// Функция показа изображения в модальном окне
function showImageModal(imageURL, fileName) {
  // Создаем модальное окно для просмотра изображения
  const modal = document.createElement('div');
  modal.className = 'image-modal-overlay';
  modal.innerHTML = `
    <div class="image-modal-content">
      <button class="image-modal-close">&times;</button>
      <img src="${imageURL}" alt="${fileName}" class="modal-image">
      <p class="modal-image-title">${fileName}</p>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Обработчики закрытия
  const closeBtn = modal.querySelector('.image-modal-close');
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

function closeMyTestsPage() {
  isDiagnosticFormMode = false;
  isInRecommendedTests = false; // Сбрасываем флаг
  const myTestsFormOverlay = document.getElementById('myTestsFormOverlay');
  if (myTestsFormOverlay) {
    myTestsFormOverlay.remove();
    document.body.classList.remove('chat-overlay-visible');
  }
  showPage('diagnostics');
}

// ========================================
// СИСТЕМА КВИЗА
// ========================================

let currentQuestionIndex = 0;
const surveyQuestions = [
  {
    id: "V17",
    system: "Нервная система",
    question: "Как вы справляетесь со стрессом и умственной нагрузкой?",
    type: "multiple_with_custom",
    options: [
      { value: "good", label: "Умею расслабляться, мысли ясные, концентрация хорошая" },
      { value: "anxiety", label: "Часто чувствую тревогу, мысли скачут, трудно сфокусироваться" },
      { value: "irritability", label: "Раздражительность, нетерпение, умственная перегрузка" },
      { value: "apathy", label: "Апатия, медленное мышление, трудности с принятием решений" }
    ]
  },
  {
    id: "V18",
    system: "Сердечно-сосудистая система",
    question: "Как вы ощущаете своё сердце и кровообращение?",
    type: "multiple_with_custom",
    options: [
      { value: "excellent", label: "Сердцебиение ровное, давление стабильное, конечности тёплые" },
      { value: "stress", label: "Чувствую сердцебиение при стрессе, иногда головокружение" },
      { value: "heat", label: "Приступы жара, ощущение пульсации в голове" },
      { value: "cold", label: "Чувство тяжести в груди, холодные руки и ноги, низкое давление" }
    ]
  },
  {
    id: "V19",
    system: "Дыхательная система",
    question: "Как ваше дыхание в покое и при нагрузке?",
    type: "multiple_with_custom",
    options: [
      { value: "normal", label: "Дышу свободно, глубоко, нет одышки" },
      { value: "bloating", label: "Часто вздыхаю, чувство нехватки воздуха, поверхностное дыхание" },
      { value: "heat", label: "Ощущение жара в груди, потребность в прохладном воздухе" },
      { value: "heavy", label: "Дыхание тяжёлое, склонность к заложенности носа" }
    ]
  },
  {
    id: "V20",
    system: "Пищеварительная система",
    question: "Как вы оцениваете своё пищеварение?",
    type: "multiple_with_custom",
    options: [
      { value: "excellent", label: "Аппетит регулярный, стул ежедневный, без дискомфорта" },
      { value: "slow", label: "Замедленное пищеварение, тяжесть после еды, запоры" },
      { value: "fast", label: "Быстрое чувство голода, изжога, склонность к диарее" },
      { value: "unstable", label: "Нестабильный стул, непереносимость некоторых продуктов" }
    ]
  },
  {
    id: "V21",
    system: "Иммунная система",
    question: "Как часто вы болеете и как восстанавливаетесь?",
    type: "multiple_with_custom",
    options: [
      { value: "rarely", label: "Болею редко, быстро выздоравливаю" },
      { value: "frequent", label: "Частые простуды, долгое восстановление, аллергии" },
      { value: "inflammatory", label: "Воспалительные реакции, склонность к инфекциям с жаром" },
      { value: "chronic", label: "Хронические вялотекущие инфекции, отёки, слизь" }
    ]
  },
  {
    id: "V22",
    system: "Эндокринная система",
    question: "Как вы ощущаете свой гормональный баланс?",
    type: "multiple_with_custom",
    options: [
      { value: "stable", label: "Энергия стабильна, настроение ровное, вес постоянный" },
      { value: "emotional", label: "Эмоциональные качели, проблемы со сном, нестабильный аппетит" },
      { value: "heat", label: "Приступы жара, потливости, раздражительность, жажда" },
      { value: "fatigue", label: "Усталость, снижение либидо, набор веса, ощущение холода" }
    ]
  },
  {
    id: "V23",
    system: "Опорно-двигательная система",
    question: "Как вы чувствуете свои мышцы, суставы и кости?",
    type: "multiple_with_custom",
    options: [
      { value: "flexible", label: "Гибкость, сила, нет болей" },
      { value: "stiff", label: "Суставы хрустят, скованность, мышечные спазмы" },
      { value: "inflammatory", label: "Воспаления, отёки, чувство жара в суставах" },
      { value: "heavy", label: "Тяжесть, отёки, ноющие боли, скованность по утрам" }
    ]
  },
  {
    id: "V24",
    system: "Мочевыделительная система",
    question: "Голова утром:",
    type: "multiple_with_custom",
    options: [
      { value: "normal", label: "Мочеиспускание регулярное, цвет светлый, нет отёков" },
      { value: "frequent", label: "Частые позывы, особенно при стрессе" },
      { value: "burning", label: "Моча тёмная, жжение, ощущение жара в почках" },
      { value: "rare", label: "Редкие позывы, отёки, бледная моча" }
    ]
  },
  {
    id: "V25",
    system: "Репродуктивная система",
    question: "Как вы оцениваете своё репродуктивное здоровье?",
    type: "multiple_with_custom",
    options: [
      { value: "regular", label: "Цикл регулярный (у женщин), либидо в норме, нет дискомфорта" },
      { value: "irregular", label: "Нерегулярный цикл, ПМС, спазмы, перепады либидо" },
      { value: "painful", label: "Обильные менструации, жар в области таза, раздражительность" },
      { value: "weak", label: "Скудные менструации, холод внизу живота, сниженное либидо" }
    ]
  },
  {
    id: "V26",
    system: "Покровная система",
    question: "Как выглядит и чувствуется ваша кожа?",
    type: "multiple_with_custom",
    options: [
      { value: "clean", label: "Чистая, увлажнённая, эластичная" },
      { value: "dry", label: "Сухая, шелушащаяся, тонкая" },
      { value: "oily", label: "Жирная, склонная к высыпаниям, покраснениям" },
      { value: "swollen", label: "Отёчная, бледная, склонная к отёкам" }
    ]
  },
  {
    id: "V27",
    system: "Лимфатическая система",
    question: "Есть ли признаки застоя лимфы?",
    type: "multiple_with_custom",
    options: [
      { value: "normal", label: "Нет отёков, лёгкость в теле, чистые миндалины" },
      { value: "frequent", label: "Частые простуды, увеличенные лимфоузлы, аллергии" },
      { value: "inflammatory", label: "Воспалённые гланды, чувство жара в лимфоузлах" },
      { value: "stagnant", label: "Отёки, тяжесть, ощущение \"забитости\"" }
    ]
  },
  {
    id: "V28",
    system: "Сенсорная система",
    question: "Как вы воспринимаете мир через органы чувств?",
    type: "multiple_with_custom",
    options: [
      { value: "sharp", label: "Зрение, слух, обоняние острые, реакция быстрая" },
      { value: "sensitive", label: "Чувствительность к звукам, свету, тактильные перегрузки" },
      { value: "dull", label: "Притуплённость чувств, потребность в ярких стимулах" },
      { value: "irritated", label: "Раздражение от яркого света, громких звуков, острое восприятие запахов" }
    ]
  },
  {
    id: "V29",
    system: "Состояние",
    question: "Как выглядит ваш язык по утрам? (условно)",
    type: "multiple_with_custom",
    options: [
      { value: "clean", label: "Чистый, розовый, умеренно влажный" },
      { value: "white", label: "С белым налётом" },
      { value: "yellow", label: "С жёлтым налётом" },
      { value: "marks", label: "С отпечатками зубов по краям" }
    ]
  },
  {
    id: "V30",
    system: "Состояние",
    question: "Какую главную цель в здоровье вы ставите?",
    type: "multiple_with_custom",
    options: [
      { value: "energy", label: "Повысить энергию и продуктивность" },
      { value: "sleep", label: "Улучшить сон и эмоциональный баланс" },
      { value: "digestion", label: "Нормализовать пищеварение и обмен веществ" },
      { value: "fatigue", label: "Избавиться от хронической усталости и тяжести" }
    ]
  }
];

function initSurvey() {
  // Проверяем, есть ли сохраненный прогресс
  const savedAnswers = JSON.parse(localStorage.getItem('surveyAnswers') || '{}');
  const savedQuestions = Object.keys(savedAnswers);
  
  // Если есть сохраненные ответы, начинаем с последнего отвеченного вопроса + 1
  if (savedQuestions.length > 0) {
    let lastAnsweredIndex = -1;
    for (let i = 0; i < surveyQuestions.length; i++) {
      if (savedAnswers[surveyQuestions[i].id]) {
        lastAnsweredIndex = i;
      }
    }
    currentQuestionIndex = Math.min(lastAnsweredIndex + 1, surveyQuestions.length - 1);
  } else {
    currentQuestionIndex = 0;
  }
  
  showQuestion(currentQuestionIndex);
  setupSurveyNavigation();
}

function showQuestion(index) {
  const question = surveyQuestions[index];
  const questionContainer = document.getElementById('surveyQuestion');
  
  let optionsHtml = question.options.map(option => `
    <label class="quiz-option">
      <input type="radio" name="question_${question.id}" value="${option.value}">
      <span class="quiz-option-text">${option.label}</span>
      <span class="quiz-option-radio"></span>
    </label>
  `).join('');
  
  optionsHtml += `
    <div class="quiz-custom-answer">
      <label class="quiz-custom-label">Свой вариант ответа:</label>
      <input type="text" class="quiz-custom-input" placeholder="Например: Плохо, почти никак">
    </div>
  `;
  
  questionContainer.innerHTML = `
    <div class="quiz-titles">
      <h1 class="quiz-main-title">Диагностическая анкета:</h1>
      <h2 class="quiz-sub-title">${question.system}</h2>
    </div>
    
    <div class="quiz-question-card">
      <div class="quiz-progress-section">
        <span class="quiz-progress-counter">${currentQuestionIndex + 1}/17</span>
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width: ${((currentQuestionIndex + 1) / 17) * 100}%"></div>
        </div>
      </div>
      <div class="quiz-question-section">
        <h3 class="quiz-question-text">${question.question}</h3>
      </div>
    </div>
    
    <div class="quiz-options">
      ${optionsHtml}
    </div>
  `;
  
  // ВОССТАНАВЛИВАЕМ СОХРАНЕННЫЕ ОТВЕТЫ
  restoreQuestionAnswer(question.id);
  
  // СБРАСЫВАЕМ VIEWPORT при смене вопроса
  resetViewportOnQuestionChange();
}

function setupSurveyNavigation() {
  const surveyBackBtn = document.getElementById('surveyBackBtn');
  const surveyNextBtn = document.getElementById('surveyNextBtn');
  
  surveyBackBtn.onclick = () => {
    // СОХРАНЯЕМ ТЕКУЩИЙ ОТВЕТ ПЕРЕД ПЕРЕХОДОМ
    saveCurrentQuestionAnswer();
    
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      showQuestion(currentQuestionIndex);
    } else {
      // Возвращаемся к форме данных
      diagnosticState = 'form';
      document.getElementById('surveyStep').classList.add('hidden');
      document.getElementById('personalDataStep').classList.remove('hidden');
    }
  };
  
  surveyNextBtn.onclick = () => {
    const currentQuestion = surveyQuestions[currentQuestionIndex];
    let selectedAnswer = document.querySelector(`input[name="question_${currentQuestion.id}"]:checked`);
    let customAnswer = document.querySelector('.quiz-custom-input');
    
    if (!selectedAnswer && (!customAnswer || !customAnswer.value.trim())) {
      tg.showAlert('Пожалуйста, выберите ответ или введите свой вариант');
      return;
    }
    
    // СОХРАНЯЕМ ТЕКУЩИЙ ОТВЕТ - используем ТЕКСТ ответа (label), а не value
    let answerValue;
    if (selectedAnswer) {
      // Получаем текст из span рядом с radio кнопкой
      const selectedLabel = selectedAnswer.nextElementSibling?.textContent?.trim();
      answerValue = selectedLabel || selectedAnswer.value;
    } else {
      answerValue = customAnswer.value.trim();
    }
    saveSurveyAnswer(currentQuestion.id, answerValue);
    
    if (currentQuestionIndex < surveyQuestions.length - 1) {
      currentQuestionIndex++;
      showQuestion(currentQuestionIndex);
    } else {
      completeSurvey();
    }
  };
}

// ФУНКЦИЯ: Сохранение текущего ответа при переходе
function saveCurrentQuestionAnswer() {
  if (currentQuestionIndex >= 0 && currentQuestionIndex < surveyQuestions.length) {
    const currentQuestion = surveyQuestions[currentQuestionIndex];
    let selectedAnswer = document.querySelector(`input[name="question_${currentQuestion.id}"]:checked`);
    let customAnswer = document.querySelector('.quiz-custom-input');
    
    if (selectedAnswer) {
      // Сохраняем LABEL (текст который видит пользователь), а не VALUE
      const selectedLabel = selectedAnswer.nextElementSibling?.textContent?.trim() || selectedAnswer.value;
      saveSurveyAnswer(currentQuestion.id, selectedLabel);
    } else if (customAnswer && customAnswer.value.trim()) {
      saveSurveyAnswer(currentQuestion.id, customAnswer.value.trim());
    }
  }
}

// ФУНКЦИЯ: Восстановление сохраненного ответа из state
function restoreQuestionAnswer(questionId) {
  const savedAnswer = getDiagnosticAnswer(questionId);
  
  console.log(`🔄 Восстанавливаем ответ для ${questionId}: "${savedAnswer}"`);
  
  if (savedAnswer) {
    // Ищем радио-кнопку по тексту с более гибким сравнением
    const radioButton = Array.from(document.querySelectorAll(`input[name="question_${questionId}"]`))
      .find(radio => {
        const label = radio.nextElementSibling?.textContent?.trim();
        console.log(`🔍 Проверяем опцию: "${label}" vs "${savedAnswer}"`);
        return label === savedAnswer || label.includes(savedAnswer) || savedAnswer.includes(label);
      });
    const customInput = document.querySelector('.quiz-custom-input');
    
    console.log(`📋 Найдена радио-кнопка: ${!!radioButton}`);
    
    if (radioButton) {
      // Это стандартный ответ - выбираем его и отключаем остальные
      console.log('✅ Выбираем стандартный ответ');
      radioButton.checked = true;
      
      // Отключаем поле для кастомного ответа
      if (customInput) {
        customInput.disabled = true;
        customInput.classList.add('disabled');
        customInput.value = '';
      }
      
      // Отключаем другие опции (оставляем только выбранную активной)
      const allQuizOptions = document.querySelectorAll('.quiz-option');
      const selectedOption = radioButton.closest('.quiz-option');
      
      allQuizOptions.forEach(option => {
        if (option !== selectedOption) {
          option.classList.add('disabled');
          const radio = option.querySelector('input[type="radio"]');
          if (radio) {
            radio.disabled = true;
          }
        }
      });
      
    } else if (customInput) {
      // Это кастомный ответ - заполняем поле и отключаем радио-кнопки
      console.log('✅ Заполняем кастомный ответ');
      customInput.value = savedAnswer;
      
      // Отключаем все радио-кнопки
      const allQuizOptions = document.querySelectorAll('.quiz-option');
      const allRadioInputs = document.querySelectorAll('.quiz-option input[type="radio"]');
      
      allRadioInputs.forEach(radio => {
        radio.checked = false;
        radio.disabled = true;
      });
      
      // Отключаем все опции визуально
      allQuizOptions.forEach(option => {
        option.classList.add('disabled');
      });
    } else {
      console.log('❌ Не найдено ни радио-кнопки ни кастомного поля');
    }
  } else {
    console.log(`📭 Нет сохраненного ответа для ${questionId}`);
  }
}

// Функции для восстановления данных из state
function restoreFormData() {
  setTimeout(() => {
    // Восстанавливаем персональные данные из state
    const weightInput = document.getElementById('weight');
    const heightInput = document.getElementById('height');
    const fullNameInput = document.getElementById('fullName');
    const birthDateInput = document.getElementById('birthDate');
    const professionInput = document.getElementById('profession');
    const cityInput = document.getElementById('city');
    const sportInput = document.getElementById('sport');
    
    if (weightInput) weightInput.value = getDiagnosticAnswer('weight');
    if (heightInput) heightInput.value = getDiagnosticAnswer('height');
    if (fullNameInput) fullNameInput.value = getDiagnosticAnswer('fullName');
    if (birthDateInput) birthDateInput.value = getDiagnosticAnswer('birthDate');
    if (professionInput) professionInput.value = getDiagnosticAnswer('profession');
    if (cityInput) cityInput.value = getDiagnosticAnswer('city');
    if (sportInput) sportInput.value = getDiagnosticAnswer('sport');
    
    // Восстанавливаем пол
    const genderValue = getDiagnosticAnswer('gender');
    if (genderValue) {
      const genderRadio = document.querySelector(`input[name="gender"][value="${genderValue}"]`);
      if (genderRadio) genderRadio.checked = true;
    }
    
    console.log('✅ Form data restored from state');
  }, 200);
}

function restoreAdditionalAnswers() {
  setTimeout(() => {
    const answer1 = document.getElementById('additionalAnswer1');
    const answer2 = document.getElementById('additionalAnswer2');
    const answer3 = document.getElementById('additionalAnswer3');
    
    if (answer1) answer1.value = getDiagnosticAnswer('discomfort');
    if (answer2) answer2.value = getDiagnosticAnswer('diagnosis');
    if (answer3) answer3.value = getDiagnosticAnswer('treatment');
    
    console.log('✅ Additional answers restored from state');
  }, 200);
}

function restoreQuizAnswers() {
  // Восстанавливаем ответы квиза из state при необходимости
  console.log('✅ Quiz answers restored from state');
}

// Сохранение ответа квиза в state
function saveSurveyAnswer(questionId, answer) {
  saveDiagnosticAnswer(questionId, answer);
  console.log(`💾 Quiz answer saved: ${questionId} = ${answer}`);
}

// Сохранение персональных данных в state
function savePersonalDataRealtime() {
  const weight = document.getElementById('weight')?.value || '';
  const height = document.getElementById('height')?.value || '';
  const fullName = document.getElementById('fullName')?.value || '';
  const birthDate = document.getElementById('birthDate')?.value || '';
  const profession = document.getElementById('profession')?.value || '';
  const city = document.getElementById('city')?.value || '';
  const sport = document.getElementById('sport')?.value || '';
  const genderInput = document.querySelector('input[name="gender"]:checked');
  
  // Получаем правильный текст для пола
  let genderText = '';
  let genderValue = '';
  if (genderInput) {
    genderValue = genderInput.value;
    genderText = genderInput.nextElementSibling?.textContent?.trim() || genderValue;
  }
  
  // Сохраняем в state
  saveDiagnosticAnswer('weight', weight);
  saveDiagnosticAnswer('height', height);
  saveDiagnosticAnswer('fullName', fullName);
  saveDiagnosticAnswer('birthDate', birthDate);
  saveDiagnosticAnswer('profession', profession);
  saveDiagnosticAnswer('city', city);
  saveDiagnosticAnswer('sport', sport);
  saveDiagnosticAnswer('gender', genderText);
  
  console.log('💾 Personal data saved to state');
}

// Сохранение дополнительных ответов в state
function saveAdditionalAnswersRealtime() {
  const discomfort = document.getElementById('additionalAnswer1')?.value || '';
  const diagnosis = document.getElementById('additionalAnswer2')?.value || '';
  const treatment = document.getElementById('additionalAnswer3')?.value || '';
  
  // Сохраняем в state
  saveDiagnosticAnswer('discomfort', discomfort);
  saveDiagnosticAnswer('diagnosis', diagnosis);
  saveDiagnosticAnswer('treatment', treatment);
  
  console.log('💾 Additional answers saved to state');
}

// Проверка всех сохраненных ответов (для отладки)
function checkAllSavedAnswers() {
  const filledCount = getFilledAnswersCount();
  console.log(`📊 State answers filled: ${filledCount}/24`);
  return filledCount;
}

function completeSurvey() {
  // СОХРАНЯЕМ ТЕКУЩИЙ ОТВЕТ ПЕРЕД ЗАВЕРШЕНИЕМ
  saveCurrentQuestionAnswer();
  
  // ПЕРЕХОДИМ К ДОПОЛНИТЕЛЬНЫМ ВОПРОСАМ
  diagnosticState = 'additional';
  document.getElementById('surveyStep').classList.add('hidden');
  document.getElementById('additionalQuestionsStep').classList.remove('hidden');
  
  console.log('Переход к дополнительным вопросам');
}

// ========================================
// ОБРАБОТЧИКИ КЛАВИАТУРЫ И ДОПОЛНИТЕЛЬНЫХ СОБЫТИЙ
// ========================================

document.addEventListener('keypress', (e) => {
  if (e.target.closest('.search-input') && e.key === 'Enter') {
    const searchInput = e.target;
    const query = searchInput.value.trim();
    if (query) {
      openChatWithMessage(query);
      searchInput.value = '';
    }
  }
  
  if (e.target.closest('.chat-input') && e.key === 'Enter') {
    const chatInput = e.target;
    const message = chatInput.value.trim();
    if (message) {
      sendChatMessage(message);
    }
  }
});

// Обработчики для поля кастомного ввода в квизе
document.addEventListener('focus', (e) => {
  if (e.target.closest('.quiz-custom-input')) {
    const allQuizOptions = document.querySelectorAll('.quiz-option');
    const allRadioInputs = document.querySelectorAll('.quiz-option input[type="radio"]');
    
    // Снимаем выбор со всех радио-кнопок
    allRadioInputs.forEach(radio => {
      radio.checked = false;
      radio.disabled = true;
    });
    
    // Отключаем все опции визуально
    allQuizOptions.forEach(option => {
      option.classList.add('disabled');
    });
  }
}, true);

// Обработчик потери фокуса для кастомного поля ввода
document.addEventListener('blur', (e) => {
  if (e.target.closest('.quiz-custom-input')) {
    const customInput = e.target.closest('.quiz-custom-input');
    
    // Проверяем, пустое ли поле после потери фокуса
    if (!customInput.value.trim()) {
      // Если поле пустое - включаем обратно все варианты ответов
      const allQuizOptions = document.querySelectorAll('.quiz-option');
      const allRadioInputs = document.querySelectorAll('.quiz-option input[type="radio"]');
      
      // Включаем обратно все радио-кнопки
      allRadioInputs.forEach(radio => {
        radio.disabled = false;
      });
      
      // Включаем обратно все опции визуально
      allQuizOptions.forEach(option => {
        option.classList.remove('disabled');
      });
    }
  }
}, true);

// Обработчик изменения текста в кастомном поле (для мгновенной реакции)
document.addEventListener('input', (e) => {
  if (e.target.closest('.quiz-custom-input')) {
    const customInput = e.target.closest('.quiz-custom-input');
    
    // Получаем текущий вопрос и сохраняем текст в state
    if (currentQuestionIndex >= 0 && currentQuestionIndex < surveyQuestions.length) {
      const currentQuestion = surveyQuestions[currentQuestionIndex];
      
      if (customInput.value.trim()) {
        // Сохраняем кастомный ответ в state
        saveDiagnosticAnswer(currentQuestion.id, customInput.value.trim());
      } else {
        // Если поле пустое - удаляем ответ из state
        saveDiagnosticAnswer(currentQuestion.id, '');
      }
    }
    
    // Если поле стало пустым во время ввода - включаем варианты ответов
    if (!customInput.value.trim()) {
      const allQuizOptions = document.querySelectorAll('.quiz-option');
      const allRadioInputs = document.querySelectorAll('.quiz-option input[type="radio"]');
      
      // Включаем обратно все радио-кнопки
      allRadioInputs.forEach(radio => {
        radio.disabled = false;
      });
      
      // Включаем обратно все опции визуально
      allQuizOptions.forEach(option => {
        option.classList.remove('disabled');
      });
    } else {
      // Если в поле есть текст - отключаем варианты ответов
      const allQuizOptions = document.querySelectorAll('.quiz-option');
      const allRadioInputs = document.querySelectorAll('.quiz-option input[type="radio"]');
      
      // Снимаем выбор и отключаем все радио-кнопки
      allRadioInputs.forEach(radio => {
        radio.checked = false;
        radio.disabled = true;
      });
      
      // Отключаем все опции визуально
      allQuizOptions.forEach(option => {
        option.classList.add('disabled');
      });
    }
  }
});

// Обработчик для очистки кастомного поля при двойном клике
document.addEventListener('dblclick', (e) => {
  if (e.target.closest('.quiz-custom-input')) {
    const customInput = e.target.closest('.quiz-custom-input');
    
    // Очищаем поле и включаем обратно все опции
    customInput.value = '';
    customInput.disabled = false;
    customInput.classList.remove('disabled');
    
    const allQuizOptions = document.querySelectorAll('.quiz-option');
    const allRadioInputs = document.querySelectorAll('.quiz-option input[type="radio"]');
    
    // Включаем обратно все радио-кнопки
    allRadioInputs.forEach(radio => {
      radio.disabled = false;
    });
    
    // Включаем обратно все опции визуально
    allQuizOptions.forEach(option => {
      option.classList.remove('disabled');
    });
  }
});

console.log('Система навигации загружена - исправлены все проблемы с навигацией и сохранением');

// ========================================
// ========================================
// ФУНКЦИИ ДНЕВНИКА С ДИНАМИЧЕСКИМ КАЛЕНДАРЕМ
// ========================================

let currentEditingEntryId = null;
let currentSelectedDay = null; // Будет установлен динамически
let isEditMode = false; // Режим редактирования для перестановки записей
let selectedEntryId = null; // ID выбранной записи для обмена местами

// Функция для инициализации селекторов времени
function initializeTimeSelectors() {
  const hourSelect = document.getElementById('hourSelect');
  const minuteSelect = document.getElementById('minuteSelect');
  
  // Инициализируем часы (0-23) только если селектор пустой
  if (hourSelect && hourSelect.children.length === 0) {
    for (let i = 0; i < 24; i++) {
      const option = document.createElement('option');
      option.value = i.toString().padStart(2, '0');
      option.textContent = i.toString().padStart(2, '0');
      hourSelect.appendChild(option);
    }
  }
  
  // Минуты уже инициализированы в HTML (00, 15, 30, 45)
}

// Функция для получения 6 дней начиная с сегодня (сегодня всегда первый)
function generateWeekDays() {
  const today = new Date();
  const days = [];
  const dayNames = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  
  // Генерируем 6 дней: сегодня + 5 следующих дней
  for (let i = 0; i < 6; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    const dayName = dayNames[date.getDay()];
    const dayNumber = date.getDate();
    const fullDate = date.toISOString().split('T')[0];
    
    days.push({
      name: dayName,
      number: dayNumber,
      key: `${dayName}-${dayNumber}`,
      fullDate: fullDate,
      isToday: i === 0 // Первый день всегда сегодня
    });
  }
  
  return days;
}

// Функция для обновления HTML календаря
function updateCalendarHTML() {
  const calendarContainer = document.querySelector('.diary-calendar');
  if (!calendarContainer) return;
  
  const weekDays = generateWeekDays();
  
  calendarContainer.innerHTML = '';
  
  weekDays.forEach((day, index) => {
    const dayElement = document.createElement('div');
    dayElement.className = `diary-day ${day.isToday ? 'active' : ''}`;
    dayElement.setAttribute('data-date', day.fullDate);
    dayElement.innerHTML = `
      <span class="day-name">${day.name}</span>
      <span class="day-number">${day.number}</span>
    `;
    
    calendarContainer.appendChild(dayElement);
  });
  
  // Устанавливаем сегодняшний день как активный по умолчанию
  const todayDay = weekDays.find(day => day.isToday);
  if (todayDay) {
    currentSelectedDay = todayDay.key;
  }
}

// Структура для хранения записей по дням (теперь с датами)
let diaryData = {};

// Функция для инициализации данных дневника с примерами для сегодня
function initializeDiaryData() {
  const today = new Date();
  const todayKey = `${['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'][today.getDay()]}-${today.getDate()}`;
  
  console.log(`📝 Инициализация данных для сегодняшнего дня: ${todayKey}`);
  
  // Добавляем примеры записей только для сегодняшнего дня (если их еще нет)
  if (!diaryData[todayKey]) {
    diaryData[todayKey] = [
      { id: '1', time: '08:00', text: 'Магний 400 mg' },
      { id: '2', time: '09:00', text: 'Ашваганда 500mg' },
      { id: '3', time: '12:00', text: 'Омега-3' },
      { id: '4', time: '12:30', text: 'Магний 400 mg' },
      { id: '5', time: '13:00', text: 'Цинк' },
      { id: '6', time: '15:00', text: 'Витамин Б' },
      { id: '7', time: '16:00', text: 'Витамин С' },
      { id: '8', time: '17:00', text: 'Омега-3' },
      { id: '9', time: '18:00', text: 'Прием в больнице' }
    ];
    console.log(`✅ Добавлены примеры записей для ${todayKey}`);
  } else {
    console.log(`ℹ️ Записи для ${todayKey} уже существуют`);
  }
}

// Функция для очистки старых записей (старше 7 дней)
function cleanupOldEntries() {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  
  Object.keys(diaryData).forEach(dayKey => {
    // Извлекаем дату из ключа и проверяем, не старше ли она недели
    const [dayName, dayNumber] = dayKey.split('-');
    
    // Создаем дату для сравнения, учитывая возможность перехода между месяцами
    let dayDate = new Date(today.getFullYear(), today.getMonth(), parseInt(dayNumber));
    
    // Если дата в будущем (например, 30 число в начале месяца), значит это предыдущий месяц
    if (dayDate > today) {
      dayDate = new Date(today.getFullYear(), today.getMonth() - 1, parseInt(dayNumber));
    }
    
    if (dayDate < weekAgo) {
      delete diaryData[dayKey];
      console.log(`Удалены старые записи для ${dayKey}`);
    }
  });
}

// Функция инициализации дневника
function initializeDiary() {
  console.log('🗓️ Инициализация дневника с динамическим календарем');
  
  // Инициализируем селекторы времени
  initializeTimeSelectors();
  
  // Обновляем календарь с актуальными датами (сегодня всегда первый)
  updateCalendarHTML();
  
  // Инициализируем данные для сегодняшнего дня
  initializeDiaryData();
  
  // Очищаем старые записи (старше 7 дней)
  cleanupOldEntries();
  
  // Автоматически выбираем сегодняшний день (первый в списке)
  const todayElement = document.querySelector('.diary-day.active');
  if (todayElement) {
    const todayKey = getDayKey(todayElement);
    currentSelectedDay = todayKey;
    loadDayEntries(todayKey);
    console.log(`📅 Активный день: ${todayKey}`);
  }
  
  console.log('✅ Дневник инициализирован. Сегодня первый в списке, календарь обновляется автоматически');
}

// Функция для получения ключа дня из элемента
function getDayKey(dayElement) {
  const dayName = dayElement.querySelector('.day-name').textContent;
  const dayNumber = dayElement.querySelector('.day-number').textContent;
  return `${dayName}-${dayNumber}`;
}

// Функция для загрузки записей выбранного дня
function loadDayEntries(dayKey) {
  const entriesContainer = document.querySelector('.diary-entries');
  const entries = diaryData[dayKey] || [];
  
  entriesContainer.innerHTML = '';
  
  entries.forEach(entry => {
    const entryElement = document.createElement('div');
    entryElement.className = 'diary-entry';
    entryElement.setAttribute('data-entry-id', entry.id);
    
    // В режиме редактирования добавляем простой синий крестик
    if (isEditMode) {
      entryElement.innerHTML = `
        <span class="entry-time">${entry.time}</span>
        <span class="entry-text">${entry.text}</span>
        <span class="delete-entry-x" onclick="confirmDeleteEntry('${entry.id}')">×</span>
      `;
      
      // Добавляем обработчик клика для обмена местами
      entryElement.addEventListener('click', function(e) {
        // Если кликнули по крестику - не обрабатываем
        if (e.target.closest('.delete-entry-x')) {
          return;
        }
        handleEntryClick(this);
      });
    } else {
      entryElement.innerHTML = `
        <span class="entry-time">${entry.time}</span>
        <span class="entry-text">${entry.text}</span>
      `;
    }
    
    entriesContainer.appendChild(entryElement);
  });
  
  // Обновляем заголовок
  updateEntriesTitle(dayKey);
}

// Функция для обновления заголовка записей
function updateEntriesTitle(dayKey) {
  const entriesTitle = document.querySelector('.entries-title');
  const [dayName, dayNumber] = dayKey.split('-');
  entriesTitle.textContent = `Записи на ${dayName} ${dayNumber}`;
}

// Функция для переключения дня
function switchToDay(dayElement) {
  // Убираем активный класс у всех дней
  const allDays = document.querySelectorAll('.diary-day');
  allDays.forEach(day => day.classList.remove('active'));
  
  // Добавляем активный класс выбранному дню
  dayElement.classList.add('active');
  
  // Получаем ключ нового дня
  const newDayKey = getDayKey(dayElement);
  currentSelectedDay = newDayKey;
  
  // Загружаем записи для нового дня
  loadDayEntries(newDayKey);
  
  console.log(`Переключились на день: ${newDayKey}`);
}

function openDiaryModal(entryId = null, entryText = '', entryTime = '') {
  const modal = document.getElementById('diaryModal');
  const modalTitle = document.getElementById('diaryModalTitle');
  const modalInput = document.getElementById('diaryModalInput');
  const modalBtn = document.getElementById('diaryModalBtn');
  const hourSelect = document.getElementById('hourSelect');
  const minuteSelect = document.getElementById('minuteSelect');
  
  // Инициализируем селекторы времени если они пустые
  initializeTimeSelectors();
  
  if (entryId) {
    // Режим редактирования
    currentEditingEntryId = entryId;
    modalTitle.textContent = 'Редактировать запись';
    modalInput.value = entryText;
    modalBtn.textContent = 'Сохранить';
    
    // Устанавливаем время из записи
    if (entryTime) {
      const [hours, minutes] = entryTime.split(':');
      hourSelect.value = hours;
      minuteSelect.value = minutes;
    }
  } else {
    // Режим создания новой записи
    currentEditingEntryId = null;
    modalTitle.textContent = 'Новая запись';
    modalInput.value = '';
    modalBtn.textContent = 'Закрепить';
    
    // Устанавливаем текущее время по умолчанию
    const now = new Date();
    hourSelect.value = now.getHours().toString().padStart(2, '0');
    minuteSelect.value = Math.floor(now.getMinutes() / 15) * 15; // Округляем до ближайших 15 минут
  }
  
  modal.classList.add('active');
  
  // Фокус на поле ввода с небольшой задержкой
  setTimeout(() => {
    modalInput.focus();
  }, 100);
}

function closeDiaryModal() {
  const modal = document.getElementById('diaryModal');
  modal.classList.remove('active');
  currentEditingEntryId = null;
}

function saveDiaryEntry() {
  const modalInput = document.getElementById('diaryModalInput');
  const hourSelect = document.getElementById('hourSelect');
  const minuteSelect = document.getElementById('minuteSelect');
  const entryText = modalInput.value.trim();
  
  if (!entryText) {
    tg.showAlert('Пожалуйста, введите текст записи');
    return;
  }
  
  // Получаем выбранное время
  const selectedTime = `${hourSelect.value}:${minuteSelect.value}`;
  
  // Инициализируем массив для текущего дня если его нет
  if (!diaryData[currentSelectedDay]) {
    diaryData[currentSelectedDay] = [];
  }
  
  if (currentEditingEntryId) {
    // Редактирование существующей записи
    const entryIndex = diaryData[currentSelectedDay].findIndex(entry => entry.id === currentEditingEntryId);
    if (entryIndex !== -1) {
      diaryData[currentSelectedDay][entryIndex].text = entryText;
      diaryData[currentSelectedDay][entryIndex].time = selectedTime;
    }
  } else {
    // Создание новой записи
    const newEntryId = Date.now().toString();
    
    const newEntry = {
      id: newEntryId,
      time: selectedTime,
      text: entryText
    };
    
    diaryData[currentSelectedDay].push(newEntry);
  }
  
  // Сортируем записи по времени
  diaryData[currentSelectedDay].sort((a, b) => {
    const timeA = a.time.split(':').map(Number);
    const timeB = b.time.split(':').map(Number);
    return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
  });
  
  // Перезагружаем записи для текущего дня
  loadDayEntries(currentSelectedDay);
  
  closeDiaryModal();
  
  console.log(`Запись сохранена для дня ${currentSelectedDay}: ${selectedTime} - ${entryText}`);
}

// Функция показа модального окна для страницы здоровья
function showHealthModal() {
  // Создаем модальное окно
  const modal = document.createElement('div');
  modal.className = 'health-modal-overlay';
  modal.id = 'healthModal';
  
  modal.innerHTML = `
    <div class="health-modal-content">
      <button class="health-modal-close" id="closeHealthModal">×</button>
      <div class="health-modal-body">
        <h2 class="health-modal-title">Пройдите диагностику</h2>
        <p class="health-modal-text">Для того, чтобы узнать свои рекомендации, для начала необходимо пройти диагностику</p>
        <button class="health-modal-btn" id="goToDiagnosticsBtn">Пройти диагностику</button>
      </div>
    </div>
  `;
  
  // Добавляем модальное окно в body
  document.body.appendChild(modal);
  
  // Показываем модальное окно
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);
  
  // Обработчик закрытия по кнопке
  document.getElementById('closeHealthModal').addEventListener('click', () => {
    closeHealthModal();
  });
  
  // Обработчик кнопки "Пройти диагностику"
  document.getElementById('goToDiagnosticsBtn').addEventListener('click', () => {
    closeHealthModal();
    // Переходим на страницу диагностики
    showPage('diagnostics');
  });
  
  // Обработчик закрытия по клику на фон
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeHealthModal();
    }
  });
}

// Функция закрытия модального окна здоровья
function closeHealthModal() {
  const modal = document.getElementById('healthModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.remove();
    }, 300); // Ждем завершения анимации
  }
}

// Функция переключения режима редактирования
function toggleEditMode() {
  isEditMode = !isEditMode;
  const editBtn = document.getElementById('editModeBtn');
  const entriesContainer = document.querySelector('.diary-entries');
  
  if (isEditMode) {
    editBtn.classList.add('active');
    entriesContainer.classList.add('edit-mode');
    // ПЕРЕЗАГРУЖАЕМ ЗАПИСИ ЧТОБЫ КРЕСТИКИ ПОЯВИЛИСЬ СРАЗУ
    loadDayEntries(currentSelectedDay);
    console.log('🖊️ Режим редактирования включен');
  } else {
    editBtn.classList.remove('active');
    entriesContainer.classList.remove('edit-mode');
    // Сбрасываем выбранную запись
    selectedEntryId = null;
    // ПЕРЕЗАГРУЖАЕМ ЗАПИСИ ЧТОБЫ КРЕСТИКИ ИСЧЕЗЛИ
    loadDayEntries(currentSelectedDay);
    console.log('✅ Режим редактирования выключен');
  }
}

// Функция обработки клика по записи в режиме редактирования
function handleEntryClick(entryElement) {
  const entryId = entryElement.getAttribute('data-entry-id');
  
  if (!selectedEntryId) {
    // Первый клик - выбираем запись
    selectedEntryId = entryId;
    entryElement.classList.add('selected');
    console.log(`✅ Выбрана запись: ${entryId}`);
  } else if (selectedEntryId === entryId) {
    // Клик по той же записи - отменяем выбор
    selectedEntryId = null;
    entryElement.classList.remove('selected');
    console.log(`❌ Отменен выбор записи: ${entryId}`);
  } else {
    // Второй клик - меняем местами
    swapEntries(selectedEntryId, entryId);
    selectedEntryId = null;
    // Перезагружаем записи чтобы убрать выделение
    loadDayEntries(currentSelectedDay);
  }
}

// Функция обмена записями местами
function swapEntries(entryId1, entryId2) {
  if (!currentSelectedDay || !diaryData[currentSelectedDay]) {
    console.log('❌ Нет данных для текущего дня');
    return;
  }
  
  const entries = diaryData[currentSelectedDay];
  const entry1 = entries.find(entry => entry.id === entryId1);
  const entry2 = entries.find(entry => entry.id === entryId2);
  
  if (entry1 && entry2) {
    // Меняем местами только текст, время остается прежним
    const tempText = entry1.text;
    entry1.text = entry2.text;
    entry2.text = tempText;
    
    console.log(`🔄 Поменяли местами: "${entry1.text}" ↔ "${entry2.text}"`);
  } else {
    console.log('❌ Не найдены записи для обмена');
  }
}

// Функция подтверждения удаления записи
function confirmDeleteEntry(entryId) {
  if (!currentSelectedDay || !diaryData[currentSelectedDay]) {
    return;
  }
  
  // Находим запись для отображения в подтверждении
  const entry = diaryData[currentSelectedDay].find(entry => entry.id === entryId);
  if (!entry) return;
  
  // Показываем подтверждение
  const confirmed = confirm(`Удалить запись?\n\n${entry.time} - ${entry.text}`);
  
  if (confirmed) {
    deleteEntry(entryId);
  }
}

// Функция удаления записи
function deleteEntry(entryId) {
  if (!currentSelectedDay || !diaryData[currentSelectedDay]) {
    return;
  }
  
  // Находим индекс записи
  const entryIndex = diaryData[currentSelectedDay].findIndex(entry => entry.id === entryId);
  
  if (entryIndex !== -1) {
    const deletedEntry = diaryData[currentSelectedDay][entryIndex];
    
    // Удаляем запись из массива
    diaryData[currentSelectedDay].splice(entryIndex, 1);
    
    // Перезагружаем записи
    loadDayEntries(currentSelectedDay);
    
    console.log(`🗑️ Удалена запись: ${deletedEntry.time} - ${deletedEntry.text}`);
  }
}

// ========================================
// ПРИВЕТСТВЕННЫЙ ЭКРАН С АВТОМАТИЧЕСКИМ ПЕРЕХОДОМ
// ========================================

// ЕДИНСТВЕННЫЙ обработчик DOMContentLoaded - объединяет всю инициализацию
document.addEventListener('DOMContentLoaded', async function() {
  console.log('🚀 DOM loaded - starting initialization');
  
  const splashScreen = document.getElementById('splashScreen');
  const mainApp = document.getElementById('mainApp');

  // Функция для показа приложения
  async function showApp() {
    try {
      // Ждём загрузки данных
      await loadAppData();
      
      // Показываем главную страницу
      showPage('main');
      
      // Показываем приложение
      if (mainApp) {
        mainApp.style.display = 'block';
      }
      
      // Скрываем splash screen если есть
      if (splashScreen) {
        splashScreen.classList.add('fade-out');
        setTimeout(() => {
          splashScreen.classList.add('hidden');
          console.log('✅ Приложение готово');
        }, 500);
      } else {
        console.log('✅ Приложение готово (без splash screen)');
      }
    } catch (error) {
      console.error('❌ Ошибка при инициализации приложения:', error);
      // Показываем приложение даже при ошибке
      if (mainApp) {
        mainApp.style.display = 'block';
      }
      if (splashScreen) {
        splashScreen.classList.add('hidden');
      }
    }
  }
  
  // Запускаем инициализацию
  if (splashScreen) {
    console.log('✅ Приветственный экран найден');
    showApp();
  } else {
    // Если нет splash screen - сразу показываем приложение
    console.log('ℹ️ Splash screen не найден, показываем приложение сразу');
    if (mainApp) {
      mainApp.style.display = 'block';
    }
    showApp();
  }
});

// ========================================
// АДМИНСКАЯ ПАНЕЛЬ
// ========================================

let adminCurrentView = 'users'; // 'users' | 'quiz' | 'analyses'
let adminCurrentUserId = null;
let adminPendingChanges = {
  quiz: [],
  analyses: []
};

// Загрузка списка пользователей
async function loadAdminUsers() {
  try {
    console.log('📥 Loading admin users...');
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    
    // Добавляем timestamp чтобы избежать кеширования
    const timestamp = Date.now();
    
    // Используем Promise.race для таймаута
    const fetchPromise = fetch(`/api/admin?action=users&_t=${timestamp}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000)
    );
    
    console.log('📤 Sending request to /api/admin?action=users');
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    console.log('📥 Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Admin users loaded:', data.users?.length || 0, 'users');
    
    if (data.success) {
      renderAdminUsers(data.users || []);
    } else {
      console.error('❌ API returned success: false', data);
      throw new Error('API returned success: false');
    }
  } catch (error) {
    console.error('❌ Error loading admin users:', error);
    const list = document.getElementById('adminUsersList');
    if (list) {
      list.innerHTML = `<div class="admin-error">Ошибка загрузки пользователей: ${error.message}. Попробуйте обновить страницу.</div>`;
    }
  }
}

// Отрисовка списка пользователей
function renderAdminUsers(users) {
  const list = document.getElementById('adminUsersList');
  if (!list) return;

  list.innerHTML = '';

  users.forEach(user => {
    const userItem = document.createElement('div');
    userItem.className = 'admin-user-item';
    userItem.setAttribute('data-user-id', user.id);

    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || `ID: ${user.telegram_id}`;
    
    userItem.innerHTML = `
      <div class="admin-user-info">
        <span class="admin-user-name">${name}</span>
        <span class="admin-user-status">
          ${user.quiz_completed ? '✓ Диагностика' : '✗ Диагностика'} | 
          ${user.analyses_uploaded ? '✓ Анализы' : '✗ Анализы'}
        </span>
      </div>
      <button class="admin-expand-btn" data-user-id="${user.id}">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 4V16M4 10H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    const expandBtn = userItem.querySelector('.admin-expand-btn');
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleUserExpanded(user.id);
    });

    // Подменю (скрыто по умолчанию)
    const submenu = document.createElement('div');
    submenu.className = 'admin-user-submenu';
    submenu.id = `adminSubmenu_${user.id}`;
    submenu.style.display = 'none';
    
    submenu.innerHTML = `
      <button class="admin-submenu-item" data-action="quiz" data-user-id="${user.id}">
        <span>Диагностика пользователя</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="admin-submenu-item" data-action="analyses" data-user-id="${user.id}">
        <span>Анализы пользователя</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;

    submenu.querySelectorAll('.admin-submenu-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const userId = btn.dataset.userId;
        if (action === 'quiz') {
          viewUserQuiz(userId);
        } else if (action === 'analyses') {
          viewUserAnalyses(userId);
        }
      });
    });

    userItem.appendChild(submenu);
    list.appendChild(userItem);
  });
}

// Переключение раскрытия подменю пользователя
function toggleUserExpanded(userId) {
  const submenu = document.getElementById(`adminSubmenu_${userId}`);
  if (!submenu) return;

  const isExpanded = submenu.style.display !== 'none';
  submenu.style.display = isExpanded ? 'none' : 'block';
  
  const btn = document.querySelector(`[data-user-id="${userId}"] .admin-expand-btn`);
  if (btn) {
    btn.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(45deg)';
  }
}

// Просмотр диагностики пользователя
async function viewUserQuiz(userId) {
  try {
    adminCurrentView = 'quiz';
    adminCurrentUserId = userId;
    adminPendingChanges.quiz = [];

    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch(`/api/admin?action=quiz&userId=${userId}`, {
      headers: {
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.success) throw new Error('API error');

    const quizView = document.getElementById('adminQuizView');
    const answersContainer = document.getElementById('adminQuizAnswers');
    if (!quizView || !answersContainer) return;

    if (!data.quiz_completed || !data.answers || data.answers.length === 0) {
      answersContainer.innerHTML = '<div class="admin-message">У пользователя не пройдена диагностика</div>';
      showAdminNavigation(true);
      return;
    }

    // Загружаем вопросы из surveyQuestions
    const questions = surveyQuestions || [];
    
    answersContainer.innerHTML = '';
    
    data.answers.forEach((answer, idx) => {
      const question = questions.find(q => q.id === answer.question_id) || { text: `Вопрос ${answer.question_id}` };
      
      const answerItem = document.createElement('div');
      answerItem.className = 'admin-quiz-item';
      answerItem.innerHTML = `
        <div class="admin-quiz-question">
          <strong>Вопрос:</strong> ${question.text || question.question || 'Неизвестный вопрос'}
        </div>
        <div class="admin-quiz-answer">
          <strong>Ответ:</strong> 
          <input type="text" class="admin-quiz-input" 
                 data-question-id="${answer.question_id}" 
                 value="${(answer.answer_text || '').replace(/"/g, '&quot;')}" 
                 placeholder="Введите ответ">
        </div>
      `;

      const input = answerItem.querySelector('.admin-quiz-input');
      input.addEventListener('input', () => {
        const questionId = input.dataset.questionId;
        const existing = adminPendingChanges.quiz.findIndex(c => c.question_id === questionId);
        if (existing >= 0) {
          adminPendingChanges.quiz[existing].answer_text = input.value;
        } else {
          adminPendingChanges.quiz.push({
            question_id: questionId,
            answer_text: input.value
          });
        }
        updateAdminSaveButton();
      });

      answersContainer.appendChild(answerItem);
    });

    showAdminNavigation(true);
  } catch (error) {
    console.error('Error loading user quiz:', error);
    const answersContainer = document.getElementById('adminQuizAnswers');
    if (answersContainer) {
      answersContainer.innerHTML = '<div class="admin-error">Ошибка загрузки диагностики</div>';
    }
  }
}

// Просмотр анализов пользователя
async function viewUserAnalyses(userId) {
  try {
    adminCurrentView = 'analyses';
    adminCurrentUserId = userId;
    adminPendingChanges.analyses = [];

    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch(`/api/admin?action=analyses&userId=${userId}`, {
      headers: {
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.success) throw new Error('API error');

    const analysesView = document.getElementById('adminAnalysesView');
    const analysesList = document.getElementById('adminAnalysesList');
    if (!analysesView || !analysesList) return;

    if (!data.analyses_uploaded || !data.analyses || data.analyses.length === 0) {
      analysesList.innerHTML = '<div class="admin-message">У пользователя нет загруженных анализов</div>';
      showAdminNavigation(true);
      return;
    }

    analysesList.innerHTML = '';

    const categories = ['Анализ крови', 'Гормоны', 'Витамины', 'Другое'];

    data.analyses.forEach(analysis => {
      const analysisItem = document.createElement('div');
      analysisItem.className = 'admin-analysis-item';
      analysisItem.setAttribute('data-analysis-id', analysis.id);

      const currentCategory = analysis.category || 'Другое';
      
      analysisItem.innerHTML = `
        <div class="admin-analysis-image">
          <img src="${analysis.photo_url}" alt="Анализ" onerror="this.style.display='none'">
        </div>
        <div class="admin-analysis-controls">
          <select class="admin-analysis-category" data-analysis-id="${analysis.id}">
            ${categories.map(cat => `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat}</option>`).join('')}
          </select>
          <button class="admin-analysis-delete" data-analysis-id="${analysis.id}">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      `;

      const select = analysisItem.querySelector('.admin-analysis-category');
      select.addEventListener('change', () => {
        const analysisId = select.dataset.analysisId;
        const existing = adminPendingChanges.analyses.findIndex(c => c.id === analysisId);
        if (existing >= 0) {
          adminPendingChanges.analyses[existing].category = select.value;
        } else {
          adminPendingChanges.analyses.push({
            id: analysisId,
            category: select.value,
            action: 'update'
          });
        }
        updateAdminSaveButton();
      });

      const deleteBtn = analysisItem.querySelector('.admin-analysis-delete');
      deleteBtn.addEventListener('click', () => {
        const analysisId = deleteBtn.dataset.analysisId;
        const existing = adminPendingChanges.analyses.findIndex(c => c.id === analysisId);
        if (existing >= 0 && adminPendingChanges.analyses[existing].action === 'update') {
          adminPendingChanges.analyses[existing].action = 'delete';
        } else {
          adminPendingChanges.analyses.push({
            id: analysisId,
            action: 'delete'
          });
        }
        analysisItem.style.opacity = '0.5';
        updateAdminSaveButton();
      });

      analysesList.appendChild(analysisItem);
    });

    showAdminNavigation(true);
  } catch (error) {
    console.error('Error loading user analyses:', error);
    const analysesList = document.getElementById('adminAnalysesList');
    if (analysesList) {
      analysesList.innerHTML = '<div class="admin-error">Ошибка загрузки анализов</div>';
    }
  }
}

// Показать/скрыть навигацию админки (кнопки Назад и Сохранить)
function showAdminNavigation(show) {
  const nav = document.getElementById('adminNavButtons');
  if (nav) {
    nav.style.display = show ? 'flex' : 'none';
  }
  
  // Скрываем/показываем основной контент и view
  const content = document.getElementById('adminContent');
  const quizView = document.getElementById('adminQuizView');
  const analysesView = document.getElementById('adminAnalysesView');
  
  if (show) {
    if (content) content.style.display = 'none';
    if (adminCurrentView === 'quiz' && quizView) {
      quizView.style.display = 'block';
      if (analysesView) analysesView.style.display = 'none';
    } else if (adminCurrentView === 'analyses' && analysesView) {
      analysesView.style.display = 'block';
      if (quizView) quizView.style.display = 'none';
    }
  } else {
    if (content) content.style.display = 'block';
    if (quizView) quizView.style.display = 'none';
    if (analysesView) analysesView.style.display = 'none';
  }
}

// Обновление кнопки Сохранить
function updateAdminSaveButton() {
  const saveBtn = document.getElementById('adminSaveBtn');
  if (!saveBtn) return;

  const hasChanges = adminPendingChanges.quiz.length > 0 || 
                     adminPendingChanges.analyses.length > 0;
  saveBtn.style.display = hasChanges ? 'flex' : 'none';
}

// Сохранение изменений
async function saveAdminChanges() {
  if (!adminCurrentUserId) return;

  const saveBtn = document.getElementById('adminSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохранение...';
  }

  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const headers = {
      'Content-Type': 'application/json',
      ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
    };

    // Сохраняем диагностику
    if (adminPendingChanges.quiz.length > 0) {
      const response = await fetch(`/api/admin?action=quiz&userId=${adminCurrentUserId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ answers: adminPendingChanges.quiz })
      });
      if (!response.ok) throw new Error('Failed to save quiz');
    }

    // Сохраняем анализы
    for (const change of adminPendingChanges.analyses) {
      if (change.action === 'delete') {
        const response = await fetch(`/api/admin?action=analyses&userId=${adminCurrentUserId}&analysisId=${change.id}`, {
          method: 'DELETE',
          headers
        });
        if (!response.ok) throw new Error('Failed to delete analysis');
      } else if (change.action === 'update') {
        const response = await fetch(`/api/admin?action=analyses&userId=${adminCurrentUserId}&analysisId=${change.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ category: change.category })
        });
        if (!response.ok) throw new Error('Failed to update analysis');
      }
    }

    // Сбрасываем изменения и возвращаемся к списку
    adminPendingChanges = { quiz: [], analyses: [] };
    adminCurrentView = 'users';
    adminCurrentUserId = null;
    showAdminNavigation(false);
    await loadAdminUsers();
  } catch (error) {
    console.error('Error saving admin changes:', error);
    alert('Ошибка сохранения изменений');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить';
    }
  }
}

// Обработчики админской панели
document.addEventListener('DOMContentLoaded', () => {
  const adminBackBtn = document.getElementById('adminBackBtn');
  const adminSaveBtn = document.getElementById('adminSaveBtn');

  if (adminBackBtn) {
    adminBackBtn.addEventListener('click', () => {
      adminCurrentView = 'users';
      adminCurrentUserId = null;
      adminPendingChanges = { quiz: [], analyses: [] };
      showAdminNavigation(false);
      loadAdminUsers();
    });
  }

  if (adminSaveBtn) {
    adminSaveBtn.addEventListener('click', saveAdminChanges);
  }
  
  // Обработчик клика на кнопку админа (делегирование событий)
  document.addEventListener('click', (e) => {
    if (e.target.closest('.admin-nav-item')) {
      if (isAdmin) {
        showPage('admin');
      }
    }
  });
});
