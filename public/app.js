// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();
tg.disableVerticalSwipes();
tg.ready();

if (tg.isExpanded === false) {
  tg.expand();
}

tg.setHeaderColor('#4A8B6C');
tg.BackButton.hide();

// Получение данных пользователя
const user = tg.initDataUnsafe?.user;
const userName = user?.first_name || 'Александр';
const userFullName = user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Иван Иванов';

// Элементы страниц
const welcomeScreen = document.getElementById('welcomeScreen');
const mainApp = document.getElementById('mainApp');
const knowledgeBase = document.getElementById('knowledgeBase');
const diagnosticsPage = document.getElementById('diagnosticsPage');
const chatOverlay = document.getElementById('chatOverlay');

// ========================================
// СИСТЕМА НАВИГАЦИИ И СОСТОЯНИЙ
// ========================================

let currentPage = 'main';
let isChatMode = false;
let isDiagnosticFormMode = false;
let diagnosticState = 'main'; // 'main', 'form', 'quiz'

// Функции навигации
function showPage(pageName) {
  console.log('Переход на страницу:', pageName);
  
  // Закрываем диагностическую форму если она открыта
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  if (diagnosticFormOverlay && pageName !== 'diagnosticForm') {
    // НЕ УДАЛЯЕМ ДАННЫЕ при переходе между страницами
    diagnosticFormOverlay.remove();
    document.body.classList.remove('chat-overlay-visible');
    isDiagnosticFormMode = false;
  }
  
  // Скрываем все страницы
  mainApp.style.display = 'none';
  knowledgeBase.classList.remove('active');
  diagnosticsPage.classList.remove('active');
  chatOverlay.classList.remove('active');
  
  // Убираем классы скролла
  document.body.classList.remove('chat-overlay-visible');
  
  // Показываем нужную страницу
  switch(pageName) {
    case 'main':
      mainApp.style.display = 'block';
      currentPage = 'main';
      isChatMode = false;
      break;
    case 'diagnostics':
      diagnosticsPage.classList.add('active');
      currentPage = 'diagnostics';
      isChatMode = false;
      break;
    case 'knowledge':
      knowledgeBase.classList.add('active');
      currentPage = 'knowledge';
      isChatMode = false;
      break;
    case 'chat':
      chatOverlay.classList.add('active');
      document.body.classList.add('chat-overlay-visible');
      isChatMode = true;
      currentPage = 'main'; // Чат это часть главной
      break;
  }
  
  // Обновляем все навигации
  updateAllNavigations();
}

function updateAllNavigations() {
  // Находим все навигации
  const navigations = document.querySelectorAll('.bottom-nav');
  
  navigations.forEach(nav => {
    const navItems = nav.querySelectorAll('.nav-item');
    
    navItems.forEach((item, index) => {
      item.classList.remove('active');
      
      // Определяем какая кнопка должна быть активной
      let shouldBeActive = false;
      
      switch(index) {
        case 0: // Главная
          shouldBeActive = (currentPage === 'main');
          break;
        case 1: // Диагностика
          shouldBeActive = (currentPage === 'diagnostics' || isDiagnosticFormMode);
          break;
        case 4: // База знаний
          shouldBeActive = (currentPage === 'knowledge');
          break;
      }
      
      if (shouldBeActive) {
        item.classList.add('active');
      }
    });
  });
}

// Показать приложение после клика на приветственный экран
welcomeScreen.addEventListener('click', () => {
  tg.expand();
  
  welcomeScreen.classList.add('fade-out');
  setTimeout(() => {
    welcomeScreen.style.display = 'none';
    mainApp.classList.add('show');
    showPage('main');
    
    setTimeout(() => {
      if (!tg.isExpanded) {
        tg.expand();
      }
    }, 100);
  }, 800);
});

// Обновление имени пользователя и аватарок
document.querySelector('.welcome-name').textContent = userName;
document.getElementById('sidebarUsername').textContent = userFullName;

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

updateAvatar(document.getElementById('avatar'), user, userName);
updateAvatar(document.getElementById('sidebarAvatar'), user, userName);
updateAvatar(document.getElementById('knowledgeAvatar'), user, userName);
updateAvatar(document.getElementById('diagnosticsAvatar'), user, userName);

// ========================================
// ОБРАБОТЧИК ВСЕХ СОБЫТИЙ
// ========================================

document.addEventListener('click', (e) => {
  // НАВИГАЦИЯ - ИСПРАВЛЕННАЯ ЛОГИКА
  if (e.target.closest('.nav-item')) {
    const navItem = e.target.closest('.nav-item');
    const nav = navItem.closest('.bottom-nav');
    const navItems = nav.querySelectorAll('.nav-item');
    const buttonIndex = Array.from(navItems).indexOf(navItem);
    
    console.log('Нажата кнопка навигации:', buttonIndex);
    
    // Закрываем боковое меню если открыто
    closeSidebar();
    
    switch(buttonIndex) {
      case 0: // Главная
        showPage('main');
        break;
      case 1: // Диагностика
        // УМНАЯ ЛОГИКА для кнопки диагностики
        if (currentPage === 'diagnostics' && isDiagnosticFormMode) {
          // Если уже в диагностике И в форме - возвращаемся в главное меню диагностики
          // И УДАЛЯЕМ ВСЕ СОХРАНЕННЫЕ ДАННЫЕ
          localStorage.removeItem('surveyAnswers');
          localStorage.removeItem('diagnosticPersonalData');
          diagnosticState = 'main';
          showPage('diagnostics');
        } else if (currentPage === 'diagnostics' && !isDiagnosticFormMode) {
          // Если уже в главном меню диагностики - проверяем есть ли прогресс
          const hasProgress = checkDiagnosticProgress();
          if (hasProgress) {
            showDiagnosticForm();
          }
        } else {
          // Если НЕ в диагностике - проверяем есть ли прогресс
          const hasProgress = checkDiagnosticProgress();
          if (hasProgress) {
            // Есть прогресс - возвращаемся к форме
            showPage('diagnostics');
            setTimeout(() => {
              showDiagnosticForm();
            }, 100);
          } else {
            // Нет прогресса - идем в главное меню диагностики
            showPage('diagnostics');
          }
        }
        break;
      case 2: // Здоровье
        tg.showAlert('Здоровье\n\nСтраница в разработке');
        break;
      case 3: // Дневник
        tg.showAlert('Дневник\n\nСтраница в разработке');
        break;
      case 4: // База знаний
        showPage('knowledge');
        break;
    }
    return;
  }
  
  // Боковое меню
  if (e.target.closest('.menu-btn') || e.target.closest('#menuBtn')) {
    if (!isChatMode) {
      openSidebar();
    }
    return;
  }
  
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
  
  // Кнопка создания программы
  if (e.target.closest('.create-program-btn')) {
    tg.showAlert('Создание персональной программы\n\nФункция в разработке');
    return;
  }
  
  // Отправка сообщения в чате
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
  
  // Быстрые запросы
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
  
  // Новый чат
  if (e.target.closest('.new-chat-btn') || e.target.closest('#newChatBtn')) {
    closeSidebar();
    showPage('chat');
    document.getElementById('chatMessages').innerHTML = '';
    return;
  }
  
  // История запросов
  if (e.target.closest('.history-item')) {
    closeSidebar();
    showPage('chat');
    return;
  }
  
  // Раскрытие разделов в базе знаний
  if (e.target.closest('.expand-btn') || e.target.closest('.section-header')) {
    const clickedElement = e.target.closest('.expand-btn') || e.target.closest('.section-header');
    const knowledgeSection = clickedElement.closest('.knowledge-section');
    const expandBtn = knowledgeSection.querySelector('.expand-btn');
    
    // Переключаем состояние раскрытия через CSS класс
    if (knowledgeSection.classList.contains('expanded')) {
      // Закрываем - показываем крестик (+)
      knowledgeSection.classList.remove('expanded');
      expandBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5V19" stroke="#3B4F6B" stroke-width="3" stroke-linecap="round"/>
          <path d="M5 12H19" stroke="#3B4F6B" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `;
    } else {
      // Открываем - показываем минус (-)
      knowledgeSection.classList.add('expanded');
      expandBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M5 12H19" stroke="#3B4F6B" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `;
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
// ФУНКЦИИ БОКОВОГО МЕНЮ
// ========================================

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebarOverlay) {
    sidebar.classList.add('active');
    sidebarOverlay.classList.add('active');
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebarOverlay) {
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  }
}

// ========================================
// ФУНКЦИИ ЧАТА
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
  showPage('chat');
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
  
  return savedPersonalData || savedAnswers;
}

// Определение где остановился пользователь
function getDiagnosticState() {
  const savedPersonalData = JSON.parse(localStorage.getItem('diagnosticPersonalData') || '{}');
  const savedAnswers = JSON.parse(localStorage.getItem('surveyAnswers') || '{}');
  
  if (Object.keys(savedAnswers).length > 0) {
    return 'quiz'; // Есть ответы на вопросы - был в квизе
  } else if (Object.keys(savedPersonalData).length > 0) {
    return 'form'; // Есть личные данные - был в форме
  } else {
    return 'main'; // Нет данных - начинаем с главной
  }
}

// ========================================
// ДИАГНОСТИЧЕСКАЯ ФОРМА
// ========================================

function showDiagnosticForm() {
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
  
  document.body.appendChild(diagnosticForm);
  diagnosticForm.style.display = 'flex';
  document.body.classList.add('chat-overlay-visible');
  
  updateAvatar(document.getElementById('diagnosticFormAvatar'), user, userName);
  updateAvatar(document.getElementById('surveyFormAvatar'), user, userName);
  
  // ВОССТАНАВЛИВАЕМ СОХРАНЕННЫЕ ДАННЫЕ ФОРМЫ
  restoreFormData();
  
  // АВТОМАТИЧЕСКИ ПЕРЕХОДИМ К НУЖНОМУ ШАГУ
  if (diagnosticState === 'quiz') {
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
    question: "Как вы оцениваете состояние вашей сердечно-сосудистой системы?",
    type: "multiple_with_custom",
    options: [
      { value: "excellent", label: "Отличное самочувствие, нормальное давление, хорошая выносливость" },
      { value: "moderate", label: "Периодические скачки давления, быстрая утомляемость" },
      { value: "poor", label: "Частые проблемы с давлением, одышка, боли в сердце" },
      { value: "unknown", label: "Не знаю, не обследовался" }
    ]
  },
  {
    id: "V19",
    system: "Пищеварительная система",
    question: "Как работает ваша пищеварительная система?",
    type: "multiple_with_custom",
    options: [
      { value: "normal", label: "Нормальное пищеварение, регулярный стул, нет дискомфорта" },
      { value: "bloating", label: "Вздутие, газообразование, периодические боли" },
      { value: "irregular", label: "Нерегулярный стул, запоры или диарея" },
      { value: "serious", label: "Серьезные проблемы, требующие постоянного внимания" }
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
        <span class="quiz-progress-counter">${currentQuestionIndex + 1}/${surveyQuestions.length}</span>
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
  
  // ВОССТАНАВЛИВАЕМ СОХРАНЕННЫЕ ОТВЕТЫ
  restoreQuestionAnswer(question.id);
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
    let customAnswer = document.querySelector(`input[name="custom_${currentQuestion.id}"]`);
    
    if (!selectedAnswer && (!customAnswer || !customAnswer.value.trim())) {
      tg.showAlert('Пожалуйста, выберите ответ или введите свой вариант');
      return;
    }
    
    // СОХРАНЯЕМ ТЕКУЩИЙ ОТВЕТ
    let answerValue = selectedAnswer ? selectedAnswer.value : customAnswer.value.trim();
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
    let customAnswer = document.querySelector(`input[name="custom_${currentQuestion.id}"]`);
    
    if (selectedAnswer) {
      saveSurveyAnswer(currentQuestion.id, selectedAnswer.value);
    } else if (customAnswer && customAnswer.value.trim()) {
      saveSurveyAnswer(currentQuestion.id, customAnswer.value.trim());
    }
  }
}

// ФУНКЦИЯ: Восстановление сохраненного ответа
function restoreQuestionAnswer(questionId) {
  const savedAnswers = JSON.parse(localStorage.getItem('surveyAnswers') || '{}');
  const savedAnswer = savedAnswers[questionId];
  
  if (savedAnswer) {
    // Проверяем, это стандартный ответ или кастомный
    const radioButton = document.querySelector(`input[name="question_${questionId}"][value="${savedAnswer}"]`);
    const customInput = document.querySelector(`input[name="custom_${questionId}"]`);
    
    if (radioButton) {
      // Это стандартный ответ
      radioButton.checked = true;
      if (customInput) {
        customInput.disabled = true;
        customInput.classList.add('disabled');
      }
    } else if (customInput) {
      // Это кастомный ответ
      customInput.value = savedAnswer;
      // Отключаем радио-кнопки
      const radioButtons = document.querySelectorAll(`input[name="question_${questionId}"]`);
      const quizOptions = document.querySelectorAll('.quiz-option');
      
      radioButtons.forEach(radio => {
        radio.disabled = true;
      });
      quizOptions.forEach(option => {
        option.classList.add('disabled');
      });
    }
  }
}

// ФУНКЦИЯ: Восстановление данных формы
function restoreFormData() {
  const savedData = JSON.parse(localStorage.getItem('diagnosticPersonalData') || '{}');
  
  if (Object.keys(savedData).length > 0) {
    // Восстанавливаем пол
    if (savedData.gender) {
      const genderRadio = document.querySelector(`input[name="gender"][value="${savedData.gender}"]`);
      if (genderRadio) genderRadio.checked = true;
    }
    
    // Восстанавливаем текстовые поля
    const fields = ['fullName', 'birthDate', 'profession', 'city', 'weight', 'height', 'sport'];
    fields.forEach(field => {
      const input = document.getElementById(field);
      if (input && savedData[field]) {
        input.value = savedData[field];
      }
    });
  }
}

function saveSurveyAnswer(questionId, answer) {
  let surveyAnswers = JSON.parse(localStorage.getItem('surveyAnswers') || '{}');
  surveyAnswers[questionId] = answer;
  localStorage.setItem('surveyAnswers', JSON.stringify(surveyAnswers));
}

function completeSurvey() {
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  
  isDiagnosticFormMode = false;
  
  tg.showAlert('Спасибо! Ваши ответы сохранены.\nВ ближайшее время мы подготовим для вас персональные рекомендации.');
  
  diagnosticFormOverlay.remove();
  document.body.classList.remove('chat-overlay-visible');
  
  // Переходим на главную диагностики после завершения
  // ДАННЫЕ НЕ УДАЛЯЕМ - они удалятся только при повторном нажатии "Диагностика"
  showPage('diagnostics');
  
  console.log('Опрос завершен');
  console.log('Личные данные:', JSON.parse(localStorage.getItem('diagnosticPersonalData')));
  console.log('Ответы на вопросы:', JSON.parse(localStorage.getItem('surveyAnswers')));
}

// ========================================
// ОБРАБОТЧИКИ КЛАВИАТУРЫ
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

console.log('Система навигации загружена - исправлены все проблемы с навигацией и сохранением');