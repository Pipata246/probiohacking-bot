// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand(); // Расширяем на весь экран
tg.enableClosingConfirmation(); // Подтверждение при закрытии
tg.disableVerticalSwipes(); // Отключаем вертикальные свайпы
tg.ready();

// Принудительно включаем полноэкранный режим
if (tg.isExpanded === false) {
  tg.expand();
}

// Устанавливаем цвет хедера
tg.setHeaderColor('#4A8B6C');

// Скрываем кнопку "Назад" если она есть
tg.BackButton.hide();

// Получение данных пользователя
const user = tg.initDataUnsafe?.user;
const userName = user?.first_name || 'Александр';
const userFullName = user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Иван Иванов';

// Приветственный экран
const welcomeScreen = document.getElementById('welcomeScreen');
const mainApp = document.getElementById('mainApp');
const knowledgeBase = document.getElementById('knowledgeBase');
const diagnosticsPage = document.getElementById('diagnosticsPage');
const chatOverlay = document.getElementById('chatOverlay');

// ========================================
// НОВАЯ СИСТЕМА НАВИГАЦИИ - ПОЛНАЯ ПЕРЕЗАПИСЬ
// ========================================

// Состояние приложения
let isChatModeActive = false;
let isDiagnosticModeActive = false;

// Функция показа главной страницы
function showMainApp() {
  // Скрываем все страницы
  mainApp.style.display = 'block';
  knowledgeBase.classList.remove('active');
  diagnosticsPage.classList.remove('active');
  chatOverlay.classList.remove('active');
  
  // Скрываем диагностическую форму если она есть и режим неактивен
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  if (diagnosticFormOverlay && !isDiagnosticModeActive) {
    diagnosticFormOverlay.style.display = 'none';
  } else if (diagnosticFormOverlay && isDiagnosticModeActive) {
    diagnosticFormOverlay.style.display = 'none';
  }
  
  // Управление скроллом
  document.body.classList.remove('chat-overlay-visible');
  
  // Сбрасываем режим чата если не в чате
  if (!chatOverlay.classList.contains('active')) {
    isChatModeActive = false;
  }
  
  // Принудительно обеспечиваем правильную структуру быстрых запросов
  const quickRequestsContainer = document.querySelector('.quick-requests');
  const quickCardsContainer = document.querySelector('.quick-requests .quick-cards');
  
  if (quickRequestsContainer && quickCardsContainer) {
    // Убеждаемся что контейнер имеет правильные стили
    quickRequestsContainer.style.display = 'flex';
    quickRequestsContainer.style.flexDirection = 'column';
    quickRequestsContainer.style.height = 'clamp(240px, 42vh, 300px)'; // ФИКСИРОВАННАЯ высота для мобильных
    quickRequestsContainer.style.flexShrink = '0'; // Не сжимается
    quickRequestsContainer.style.flex = 'none'; // Убираем flex: 1
    quickCardsContainer.style.overflowY = 'auto';
    quickCardsContainer.style.flex = '1';
  }
  
  // Устанавливаем активную кнопку "Главная"
  setActiveNavButton(0);
}

// Функция показа базы знаний
function showKnowledgeBase() {
  // Скрываем все страницы
  mainApp.style.display = 'none';
  knowledgeBase.classList.add('active');
  diagnosticsPage.classList.remove('active');
  chatOverlay.classList.remove('active');
  
  // Скрываем диагностическую форму если она есть и режим неактивен
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  if (diagnosticFormOverlay && !isDiagnosticModeActive) {
    diagnosticFormOverlay.style.display = 'none';
  } else if (diagnosticFormOverlay && isDiagnosticModeActive) {
    diagnosticFormOverlay.style.display = 'none';
  }
  
  // Управление скроллом
  document.body.classList.remove('chat-overlay-visible');
  
  // Устанавливаем активную кнопку "База знаний"
  setActiveNavButton(4);
}

// Функция показа диагностики
function showDiagnostics() {
  // Скрываем все страницы
  mainApp.style.display = 'none';
  knowledgeBase.classList.remove('active');
  chatOverlay.classList.remove('active');
  
  // Проверяем режим диагностики
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  if (isDiagnosticModeActive && diagnosticFormOverlay) {
    // Если в режиме диагностики - показываем форму
    diagnosticsPage.classList.remove('active');
    diagnosticFormOverlay.style.display = 'flex';
    document.body.classList.add('chat-overlay-visible');
  } else {
    // Иначе показываем обычную страницу диагностики
    diagnosticsPage.classList.add('active');
    if (diagnosticFormOverlay) {
      diagnosticFormOverlay.style.display = 'none';
    }
    document.body.classList.remove('chat-overlay-visible');
  }
  
  // Устанавливаем активную кнопку "Диагностика"
  setActiveNavButton(1);
}

// Функция показа чата
function showChat() {
  // Показываем чат как оверлей
  chatOverlay.classList.add('active');
  document.body.classList.add('chat-overlay-visible');
  isChatModeActive = true;
  
  // Главная остается активной (чат - часть главной)
  setActiveNavButton(0);
}

// Функция скрытия чата
function hideChat() {
  chatOverlay.classList.remove('active');
  document.body.classList.remove('chat-overlay-visible');
  isChatModeActive = false;
}

// Вспомогательная функция установки активной кнопки навигации
function setActiveNavButton(buttonIndex) {
  document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.classList.remove('active');
    if (index % 5 === buttonIndex) {
      item.classList.add('active');
    }
  });
}

// Показать приложение после клика на приветственный экран
welcomeScreen.addEventListener('click', () => {
  // Еще раз принудительно расширяем перед показом приложения
  tg.expand();
  
  welcomeScreen.classList.add('fade-out');
  setTimeout(() => {
    welcomeScreen.style.display = 'none';
    mainApp.classList.add('show');
    
    // Финальная проверка полноэкранного режима
    setTimeout(() => {
      if (!tg.isExpanded) {
        tg.expand();
      }
    }, 100);
  }, 800);
});

// Обновление имени пользователя
document.querySelector('.welcome-name').textContent = userName;
document.getElementById('sidebarUsername').textContent = userFullName;

// Функция обновления аватарки
function updateAvatar(element, user, userName) {
  if (element && user?.photo_url) {
    element.style.backgroundImage = `url(${user.photo_url})`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.textContent = '';
  } else if (element) {
    const initials = userName.charAt(0).toUpperCase();
    element.textContent = initials;
  }
}

// Обновление аватарок
updateAvatar(document.getElementById('avatar'), user, userName);
updateAvatar(document.getElementById('sidebarAvatar'), user, userName);
updateAvatar(document.getElementById('knowledgeAvatar'), user, userName);
updateAvatar(document.getElementById('diagnosticsAvatar'), user, userName);

// ========================================
// НОВЫЙ ОБРАБОТЧИК НАВИГАЦИИ - ПРОСТОЙ И ПОНЯТНЫЙ
// ========================================

// Централизованный обработчик всех событий клика
document.addEventListener('click', (e) => {
  // Закрытие чата при клике на оверлей (но не на сообщения) - только если НЕ в режиме чата
  if (e.target.closest('#chatOverlay') && !e.target.closest('.chat-messages') && !e.target.closest('.chat-input-container') && !e.target.closest('.header') && !e.target.closest('.bottom-nav')) {
    if (isChatModeActive) {
      // В режиме чата не закрываем по клику вне области
      return;
    } else {
      hideChat();
      return;
    }
  }
  
  // Обработка кнопок меню (3 полоски) - только для главной и других страниц
  if (e.target.closest('.menu-btn') || e.target.closest('#menuBtn')) {
    // Проверяем что мы НЕ в чате
    if (chatOverlay.classList.contains('active')) {
      return; // В чате кнопка меню не работает
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.add('active');
      sidebarOverlay.classList.add('active');
    }
    return;
  }
  
  // Обработка закрытия бокового меню
  if (e.target.closest('#sidebarClose') || e.target.closest('#sidebarOverlay')) {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    }
    return;
  }
  
  // Обработка навигации - НОВАЯ ПРОСТАЯ ЛОГИКА
  if (e.target.closest('.nav-item')) {
    const navItem = e.target.closest('.nav-item');
    const allNavItems = document.querySelectorAll('.nav-item');
    const navIndex = Array.from(allNavItems).indexOf(navItem);
    
    // Сначала закрываем боковое меню если оно открыто
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    }
    
    const pages = ['Главная', 'Диагностика', 'Здоровье', 'Дневник', 'База знаний'];
    
    // Определяем какая кнопка нажата (учитываем что есть три навигации)
    const buttonIndex = navIndex % 5;
    
    if (buttonIndex === 0) { // Главная
      if (isChatModeActive && chatOverlay.classList.contains('active')) {
        // Если в режиме чата И чат открыт - выходим из режима чата
        showMainApp();
      } else if (isChatModeActive && !chatOverlay.classList.contains('active')) {
        // Если в режиме чата, но чат закрыт - возвращаемся в чат
        showChat();
      } else if (isDiagnosticModeActive) {
        // Если в режиме диагностики - скрываем форму но не выходим из режима
        showMainApp();
      } else {
        // Обычный переход на главную
        showMainApp();
      }
    } else if (buttonIndex === 1) { // Диагностика
      if (isDiagnosticModeActive) {
        // Если в режиме диагностики - возвращаемся к форме
        showDiagnostics();
      } else {
        // Обычный переход на диагностику
        showDiagnostics();
      }
    } else if (buttonIndex === 4) { // База знаний
      showKnowledgeBase();
    } else {
      // Другие страницы в разработке
      if (isChatModeActive) {
        // В режиме чата показываем алерт, но остаемся в режиме чата
        tg.showAlert(`${pages[buttonIndex]}\n\nСтраница в разработке`);
        setTimeout(() => {
          showChat();
        }, 100);
      } else if (isDiagnosticModeActive) {
        // В режиме диагностики показываем алерт, но остаемся в режиме диагностики
        tg.showAlert(`${pages[buttonIndex]}\n\nСтраница в разработке`);
        setTimeout(() => {
          showDiagnostics();
        }, 100);
      } else {
        tg.showAlert(`${pages[buttonIndex]}\n\nСтраница в разработке`);
      }
    }
    return;
  }
  
  // Обработка кнопки поиска
  if (e.target.closest('.search-btn')) {
    const searchInput = document.querySelector('.search-input');
    const query = searchInput.value.trim();
    if (query) {
      openChatWithMessage(query);
      searchInput.value = '';
    }
    return;
  }
  
  // Обработка кнопки "Заполнить анкету"
  if (e.target.closest('.fill-form-btn')) {
    showDiagnosticForm();
    return;
  }
  
  // Обработка кнопки создания программы
  if (e.target.closest('.create-program-btn')) {
    tg.showAlert('Создание персональной программы\n\nФункция в разработке');
    return;
  }
  
  // Обработка кнопки отправки в чате
  if (e.target.closest('.chat-send-btn')) {
    const chatInput = document.querySelector('.chat-input');
    const message = chatInput.value.trim();
    if (message) {
      addUserMessage(message);
      chatInput.value = '';
      setTimeout(() => {
        addBotMessage('Извините, ИИ-помощник находится в разработке. Скоро мы сможем предоставить вам персональные рекомендации!');
      }, 1000);
    }
    return;
  }
  
  // Обработка карточек быстрых запросов
  if (e.target.closest('.quick-card')) {
    const card = e.target.closest('.quick-card');
    const quickCards = document.querySelectorAll('.quick-requests .quick-card');
    const sportsCards = document.querySelectorAll('.sports-requests .quick-card');
    const allCards = [...quickCards, ...sportsCards];
    const index = allCards.indexOf(card);
    
    if (index < quickCards.length) {
      const questions = [
        'Как повысить жизненную энергию и избавиться от хронической усталости?',
        'Как улучшить память, концентрацию и когнитивные функции?',
        'Как повысить стрессоустойчивость и эмоциональную стабильность?',
        'Как укрепить естественный иммунитет и снизить частоту заболеваний?',
        'Как поддержать здоровье суставов, гибкость и легкость движений?',
        'Как наладить работу ЖКТ, избавиться от дискомфорта?'
      ];
      openChatWithMessage(questions[index]);
    } else {
      const sportsIndex = index - quickCards.length;
      const sportsQuestions = [
        'Как ускорить восстановление мышц и сократить усталость после нагрузок?',
        'Как повысить силовые показатели и укрепить соединительные ткани?',
        'Как улучшить использование кислорода и отсрочить утомления?',
        'Как усилить скорость реакции и стрессоустойчивость на соревнованиях?',
        'Как укрепить суставы, связки и предотвратить травмы при высоких нагрузках?',
        'Как поддержать иммунитет в периоды интенсивных тренировок и снизить риск инфекций?',
        'Как помочь организму выводить метаболиты и снизить интоксикацию после нагрузок?',
        'Как улучшить глубокий сон и ускорить восстановление ЦНС после нагрузок?'
      ];
      openChatWithMessage(sportsQuestions[sportsIndex]);
    }
    return;
  }
  
  // Обработка кнопки "Создать новый чат"
  if (e.target.closest('.new-chat-btn') || e.target.closest('#newChatBtn')) {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    }
    showChat();
    document.getElementById('chatMessages').innerHTML = '';
    return;
  }
  
  // Обработка истории запросов в боковом меню
  if (e.target.closest('.history-item')) {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    }
    openChatFromHistory();
    return;
  }
});

// ========================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ЧАТОМ
// ========================================

function addUserMessage(text) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'user-message';
  
  let userAvatarHtml = '';
  if (user?.photo_url) {
    userAvatarHtml = `<div class="user-avatar" style="background-image: url(${user.photo_url}); background-size: cover; background-position: center;"></div>`;
  } else {
    userAvatarHtml = `<div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>`;
  }
  
  messageDiv.innerHTML = `
    ${userAvatarHtml}
    <div class="message-bubble">
      <p class="message-text">${text}</p>
    </div>
  `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function addBotMessage(text) {
  const chatMessages = document.getElementById('chatMessages');
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
    </div>
  `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addBotMessageWithButton(text, buttonText, buttonAction) {
  const chatMessages = document.getElementById('chatMessages');
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
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function openChatWithMessage(message) {
  showChat();
  document.getElementById('chatMessages').innerHTML = '';
  addUserMessage(message);
  setTimeout(() => {
    addBotMessageWithButton(
      'Для данного запроса мне требуются твои данные, однако ты не прошел диагностику и я не могу тебе помочь. Пройди диагностику и загрузи свои анализы для лучшего ответа!',
      'Пройти диагностику',
      'handleDiagnosticButton()'
    );
  }, 1000);
}

function openChatFromHistory() {
  showChat();
  document.getElementById('chatMessages').innerHTML = '';
}

function handleDiagnosticButton() {
  hideChat();
  showDiagnostics();
  setTimeout(() => {
    showDiagnosticForm();
  }, 100);
}
// ========================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ДИАГНОСТИЧЕСКОЙ ФОРМОЙ
// ========================================

function showDiagnosticForm() {
  isDiagnosticModeActive = true;
  
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
        
        <nav class="bottom-nav">
          <button class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Главная</span>
          </button>
          <button class="nav-item active">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Диагностика</span>
          </button>
          <button class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4.5 16.5C3 14 3 11 3 9C3 5.5 5.5 3 9 3C10 3 11 3.5 12 4C13 3.5 14 3 15 3C18.5 3 21 5.5 21 9C21 11 21 14 19.5 16.5L12 22L4.5 16.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Здоровье</span>
          </button>
          <button class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M16 2V6M8 2V6M3 10H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span>Дневник</span>
          </button>
          <button class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6.5 2H20V22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5V4.5C4 3.83696 4.26339 3.20107 4.73223 2.73223C5.20107 2.26339 5.83696 2 6.5 2V2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>База знаний</span>
          </button>
        </nav>
      </div>
      
      <!-- Экран вопросов -->
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
        
        <nav class="bottom-nav">
          <button class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Главная</span>
          </button>
          <button class="nav-item active">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Диагностика</span>
          </button>
          <button class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4.5 16.5C3 14 3 11 3 9C3 5.5 5.5 3 9 3C10 3 11 3.5 12 4C13 3.5 14 3 15 3C18.5 3 21 5.5 21 9C21 11 21 14 19.5 16.5L12 22L4.5 16.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Здоровье</span>
          </button>
          <button class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M16 2V6M8 2V6M3 10H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span>Дневник</span>
          </button>
          <button class="nav-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6.5 2H20V22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5V4.5C4 3.83696 4.26339 3.20107 4.73223 2.73223C5.20107 2.26339 5.83696 2 6.5 2V2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>База знаний</span>
          </button>
        </nav>
      </div>
    </div>
  `;
  
  const diagnosticsPage = document.getElementById('diagnosticsPage');
  diagnosticsPage.appendChild(diagnosticForm);
  
  updateAvatar(document.getElementById('diagnosticFormAvatar'), user, userName);
  updateAvatar(document.getElementById('surveyFormAvatar'), user, userName);
  
  setupDiagnosticFormHandlers();
}

function setupDiagnosticFormHandlers() {
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  const formBackBtn = document.getElementById('formBackBtn');
  const formNextBtn = document.getElementById('formNextBtn');
  const personalDataStep = document.getElementById('personalDataStep');
  const surveyStep = document.getElementById('surveyStep');
  
  formBackBtn.addEventListener('click', () => {
    isDiagnosticModeActive = false;
    diagnosticFormOverlay.remove();
  });
  
  formNextBtn.addEventListener('click', () => {
    if (validatePersonalData()) {
      savePersonalData();
      personalDataStep.classList.add('hidden');
      surveyStep.classList.remove('hidden');
      initSurvey();
    }
  });
}
function validatePersonalData() {
  const gender = document.querySelector('input[name="gender"]:checked');
  const fullName = document.getElementById('fullName').value.trim();
  
  if (!gender) {
    tg.showAlert('Пожалуйста, выберите ваш пол');
    return false;
  }
  
  if (!fullName) {
    tg.showAlert('Пожалуйста, введите ваше ФИО');
    return false;
  }
  
  return true;
}

function savePersonalData() {
  const personalData = {
    gender: document.querySelector('input[name="gender"]:checked').value,
    fullName: document.getElementById('fullName').value.trim(),
    birthDate: document.getElementById('birthDate').value.trim(),
    profession: document.getElementById('profession').value.trim(),
    city: document.getElementById('city').value.trim(),
    weight: document.getElementById('weight').value.trim(),
    height: document.getElementById('height').value.trim(),
    sport: document.getElementById('sport').value.trim(),
    timestamp: new Date().toISOString()
  };
  
  localStorage.setItem('diagnosticPersonalData', JSON.stringify(personalData));
}

// ========================================
// СИСТЕМА ОПРОСА
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
  ...Array.from({length: 16}, (_, i) => ({
    id: `V${i + 18}`,
    system: "Система организма",
    question: `Вопрос ${i + 2} (будет добавлен позже)`,
    type: "multiple_with_custom",
    options: [
      { value: "option1", label: "Вариант 1" },
      { value: "option2", label: "Вариант 2" },
      { value: "option3", label: "Вариант 3" },
      { value: "option4", label: "Вариант 4" }
    ]
  }))
];

function initSurvey() {
  currentQuestionIndex = 0;
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
      <input type="text" class="quiz-custom-input" placeholder="Например: Плохо, почти никак" name="custom_${question.id}">
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
          <div class="quiz-progress-fill" style="width: ${((currentQuestionIndex + 1) / surveyQuestions.length) * 100}%"></div>
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
  
  setupAnswerExclusion(question.id);
}

function setupAnswerExclusion(questionId) {
  const radioButtons = document.querySelectorAll(`input[name="question_${questionId}"]`);
  const customInput = document.querySelector(`input[name="custom_${questionId}"]`);
  const quizOptions = document.querySelectorAll('.quiz-option');
  
  radioButtons.forEach(radio => {
    let lastClickTime = 0;
    
    radio.addEventListener('change', () => {
      if (radio.checked) {
        customInput.disabled = true;
        customInput.value = '';
        customInput.classList.add('disabled');
      }
    });
    
    radio.parentElement.addEventListener('click', (e) => {
      e.preventDefault();
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastClickTime;
      
      if (radio.checked && timeDiff < 500) {
        radio.checked = false;
        customInput.disabled = false;
        customInput.classList.remove('disabled');
        
        quizOptions.forEach(option => {
          option.classList.remove('disabled');
        });
        radioButtons.forEach(r => {
          r.disabled = false;
        });
      } else if (!radio.checked) {
        radioButtons.forEach(r => r.checked = false);
        radio.checked = true;
        
        customInput.disabled = true;
        customInput.value = '';
        customInput.classList.add('disabled');
      }
      
      lastClickTime = currentTime;
    });
  });
  
  customInput.addEventListener('input', () => {
    if (customInput.value.trim()) {
      radioButtons.forEach(radio => {
        radio.checked = false;
        radio.disabled = true;
      });
      quizOptions.forEach(option => {
        option.classList.add('disabled');
      });
    } else {
      radioButtons.forEach(radio => {
        radio.disabled = false;
      });
      quizOptions.forEach(option => {
        option.classList.remove('disabled');
      });
    }
  });
  
  customInput.addEventListener('focus', () => {
    if (!customInput.disabled) {
      radioButtons.forEach(radio => {
        radio.checked = false;
      });
    }
  });
}

function setupSurveyNavigation() {
  const surveyBackBtn = document.getElementById('surveyBackBtn');
  const surveyNextBtn = document.getElementById('surveyNextBtn');
  
  surveyBackBtn.onclick = () => {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      showQuestion(currentQuestionIndex);
      updateNavigationButtons();
    } else {
      const surveyStep = document.getElementById('surveyStep');
      const personalDataStep = document.getElementById('personalDataStep');
      surveyStep.classList.add('hidden');
      personalDataStep.classList.remove('hidden');
    }
  };
  
  surveyNextBtn.onclick = () => {
    const currentQuestion = surveyQuestions[currentQuestionIndex];
    let selectedAnswer = document.querySelector(`input[name="question_${currentQuestion.id}"]:checked`);
    let customAnswer = document.querySelector(`input[name="custom_${currentQuestion.id}"]`);
    
    if (!selectedAnswer && (!customAnswer || !customAnswer.value.trim())) {
      tg.showAlert('Пожалуйста, выберите ответ или введите свой вариант');
      return;
    }
    
    let answerValue = selectedAnswer ? selectedAnswer.value : customAnswer.value.trim();
    saveSurveyAnswer(currentQuestion.id, answerValue);
    
    if (currentQuestionIndex < surveyQuestions.length - 1) {
      currentQuestionIndex++;
      showQuestion(currentQuestionIndex);
      updateNavigationButtons();
    } else {
      completeSurvey();
    }
  };
  
  updateNavigationButtons();
}

function updateNavigationButtons() {
  const surveyBackBtn = document.getElementById('surveyBackBtn');
  const surveyNextBtn = document.getElementById('surveyNextBtn');
  
  surveyBackBtn.classList.add('nav-circle-btn-active');
  
  if (currentQuestionIndex === surveyQuestions.length - 1) {
    surveyNextBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20 6L9 17L4 12" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  } else {
    surveyNextBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M5 12H19M12 5L19 12L12 19" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
}
function saveSurveyAnswer(questionId, answer) {
  let surveyAnswers = JSON.parse(localStorage.getItem('surveyAnswers') || '{}');
  surveyAnswers[questionId] = answer;
  localStorage.setItem('surveyAnswers', JSON.stringify(surveyAnswers));
}

function completeSurvey() {
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  
  isDiagnosticModeActive = false;
  
  tg.showAlert('Спасибо! Ваши ответы сохранены.\nВ ближайшее время мы подготовим для вас персональные рекомендации.');
  
  diagnosticFormOverlay.remove();
  
  console.log('Опрос завершен');
  console.log('Личные данные:', JSON.parse(localStorage.getItem('diagnosticPersonalData')));
  console.log('Ответы на вопросы:', JSON.parse(localStorage.getItem('surveyAnswers')));
}

// ========================================
// ОБРАБОТЧИКИ КЛАВИАТУРЫ И VIEWPORT
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
      addUserMessage(message);
      chatInput.value = '';
      setTimeout(() => {
        addBotMessage('Извините, ИИ-помощник находится в разработке. Скоро мы сможем предоставить вам персональные рекомендации!');
      }, 1000);
    }
  }
});

function handleViewportChange() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  
  const surveyStep = document.getElementById('surveyStep');
  if (surveyStep && surveyStep.style.display !== 'none') {
    surveyStep.style.height = `${window.innerHeight}px`;
  }
}

window.addEventListener('resize', handleViewportChange);
window.addEventListener('orientationchange', () => {
  setTimeout(handleViewportChange, 100);
});

handleViewportChange();

document.addEventListener('focusin', (e) => {
  if (e.target.classList.contains('quiz-custom-input')) {
    setTimeout(() => {
      handleViewportChange();
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }
});

document.addEventListener('focusout', (e) => {
  if (e.target.classList.contains('quiz-custom-input')) {
    setTimeout(handleViewportChange, 300);
  }
});

console.log('Новая система навигации загружена');