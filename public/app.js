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
  
  // Закрываем страницу "Мои анализы" если она открыта
  const myTestsFormOverlay = document.getElementById('myTestsFormOverlay');
  if (myTestsFormOverlay && pageName !== 'myTests') {
    myTestsFormOverlay.remove();
    document.body.classList.remove('chat-overlay-visible');
    isDiagnosticFormMode = false;
  }
  
  // Скрываем все страницы
  mainApp.style.display = 'none';
  knowledgeBase.classList.remove('active');
  diagnosticsPage.classList.remove('active');
  chatOverlay.classList.remove('active');
  
  // Скрываем страницу здоровье
  const healthPage = document.getElementById('healthPage');
  if (healthPage) {
    healthPage.classList.remove('active');
  }
  
  // Скрываем страницу дневник
  const diaryPage = document.getElementById('diaryPage');
  if (diaryPage) {
    diaryPage.classList.remove('active');
  }
  
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
    case 'health':
      const healthPage = document.getElementById('healthPage');
      healthPage.classList.add('active');
      currentPage = 'health';
      isChatMode = false;
      break;
    case 'diary':
      const diaryPage = document.getElementById('diaryPage');
      diaryPage.classList.add('active');
      currentPage = 'diary';
      isChatMode = false;
      // Инициализируем дневник при первом открытии
      initializeDiary();
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
updateAvatar(document.getElementById('healthAvatar'), user, userName);
updateAvatar(document.getElementById('diaryAvatar'), user, userName);

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
        // УМНАЯ ЛОГИКА для кнопки диагностики
        const hasProgress = checkDiagnosticProgress();
        const isCompleted = isDiagnosticCompleted();
        
        // ЕСЛИ УЖЕ В ФОРМЕ ДИАГНОСТИКИ ИЛИ НА СТРАНИЦЕ АНАЛИЗОВ - ВЫХОДИМ НА ГЛАВНУЮ ДИАГНОСТИКИ И СБРАСЫВАЕМ
        if (isDiagnosticFormMode) {
          console.log('Выход из формы диагностики на главную страницу диагностики');
          
          // Проверяем какая именно форма открыта
          const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
          const myTestsFormOverlay = document.getElementById('myTestsFormOverlay');
          
          if (diagnosticFormOverlay) {
            // Если это диагностическая форма - сбрасываем данные
            clearDiagnosticData();
            diagnosticFormOverlay.remove();
          }
          
          if (myTestsFormOverlay) {
            // Если это страница анализов - просто закрываем
            myTestsFormOverlay.remove();
          }
          
          isDiagnosticFormMode = false;
          document.body.classList.remove('chat-overlay-visible');
          showPage('diagnostics');
          return;
        }
        
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
      case 3: // Дневник
        showPage('diary');
        break;
      case 4: // База знаний
        showPage('knowledge');
        break;
    }
    return;
  }
  
  // Боковое меню - ОПТИМИЗИРОВАННАЯ ОБРАБОТКА
  if (e.target.closest('.menu-btn')) {
    openSidebar();
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
  
  // Кнопка "Мои анализы"
  if (e.target.closest('.my-tests-btn')) {
    showMyTestsPage();
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
  
  // Обработка кликов по опциям квиза - НОВАЯ ЛОГИКА ОТМЕНЫ ВЫБОРА
  if (e.target.closest('.quiz-option')) {
    const quizOption = e.target.closest('.quiz-option');
    const radioInput = quizOption.querySelector('input[type="radio"]');
    const customInput = document.querySelector('.quiz-custom-input');
    
    // Проверяем, была ли эта опция уже выбрана
    if (radioInput.checked) {
      // Если опция уже выбрана - отменяем выбор
      radioInput.checked = false;
      
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
    
    // Предотвращаем стандартное поведение
    e.preventDefault();
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
    tg.showAlert('Эта функция пока в разработке');
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
// ФУНКЦИИ БОКОВОГО МЕНЮ
// ========================================

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebarOverlay) {
    // Используем requestAnimationFrame для плавности
    requestAnimationFrame(() => {
      sidebar.classList.add('active');
      sidebarOverlay.classList.add('active');
    });
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
  updateAvatar(document.getElementById('additionalFormAvatar'), user, userName);
  
  // ВОССТАНАВЛИВАЕМ СОХРАНЕННЫЕ ДАННЫЕ ФОРМЫ
  restoreFormData();
  
  // АВТОМАТИЧЕСКИ ПЕРЕХОДИМ К НУЖНОМУ ШАГУ
  if (diagnosticState === 'additional') {
    // Если был в дополнительных вопросах - переходим к ним
    setTimeout(() => {
      document.getElementById('personalDataStep').classList.add('hidden');
      document.getElementById('additionalQuestionsStep').classList.remove('hidden');
      restoreAdditionalAnswers();
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
  
  // Обработчики дополнительных вопросов
  document.getElementById('additionalBackBtn').addEventListener('click', () => {
    // Возвращаемся к последнему вопросу квиза
    diagnosticState = 'quiz';
    document.getElementById('additionalQuestionsStep').classList.add('hidden');
    document.getElementById('surveyStep').classList.remove('hidden');
    currentQuestionIndex = surveyQuestions.length - 1;
    showQuestion(currentQuestionIndex);
  });
  
  document.getElementById('additionalNextBtn').addEventListener('click', () => {
    // Сохраняем дополнительные ответы
    const additionalAnswers = {
      discomfort: document.getElementById('additionalAnswer1').value.trim(),
      diagnosis: document.getElementById('additionalAnswer2').value.trim(),
      treatment: document.getElementById('additionalAnswer3').value.trim(),
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('additionalAnswers', JSON.stringify(additionalAnswers));
    
    // Завершаем диагностику
    const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
    isDiagnosticFormMode = false;
    
    tg.showAlert('Спасибо! Ваши ответы сохранены.\nВ ближайшее время мы подготовим для вас персональные рекомендации.');
    
    diagnosticFormOverlay.remove();
    document.body.classList.remove('chat-overlay-visible');
    
    showPage('diagnostics');
    
    console.log('Диагностика завершена');
    console.log('Личные данные:', JSON.parse(localStorage.getItem('diagnosticPersonalData')));
    console.log('Ответы на вопросы:', JSON.parse(localStorage.getItem('surveyAnswers')));
    console.log('Дополнительные ответы:', JSON.parse(localStorage.getItem('additionalAnswers')));
  });
}

// ========================================
// СТРАНИЦА "МОИ АНАЛИЗЫ"
// ========================================

function showMyTestsPage() {
  isDiagnosticFormMode = true; // Устанавливаем флаг что мы в специальном режиме
  
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
              <div class="test-item">
                <div class="test-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#6B7280"/>
                    <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M6.5 2H20V22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5V4.5C4 3.83696 4.26339 3.20107 4.73223 2.73223C5.20107 2.26339 5.83696 2 6.5 2V2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="test-info">
                  <h4 class="test-name">Общий анализ крови</h4>
                  <p class="test-date">01.11.2025</p>
                </div>
                <div class="test-actions">
                  <div class="test-action-btn success">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <button class="test-action-btn delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              <div class="test-item">
                <div class="test-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" fill="#6B7280"/>
                    <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M6.5 2H20V22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5V4.5C4 3.83696 4.26339 3.20107 4.73223 2.73223C5.20107 2.26339 5.83696 2 6.5 2V2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div class="test-info">
                  <h4 class="test-name">Биохимия крови</h4>
                  <p class="test-date">01.11.2025</p>
                </div>
                <div class="test-actions">
                  <div class="test-action-btn success">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <button class="test-action-btn delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
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
  
  document.body.appendChild(myTestsForm);
  myTestsForm.style.display = 'flex';
  document.body.classList.add('chat-overlay-visible');
  
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

function handleFileUpload(file) {
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
    // Создаем URL для файла для возможности просмотра
    const fileURL = URL.createObjectURL(file);
    console.log('URL файла создан:', fileURL);
    
    // Определяем источник файла для более понятного названия
    let displayName = file.name;
    const isImage = file.type.startsWith('image/') || 
                   file.name.toLowerCase().includes('img_') || 
                   file.name.toLowerCase().includes('photo');
    
    if (isImage) {
      // Если это фото с камеры, даем ему более понятное название
      const now = new Date();
      const timestamp = now.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/[,\s:]/g, '_');
      const extension = file.type.split('/')[1] || 'jpg';
      displayName = `Фото_${timestamp}.${extension}`;
    }
    
    console.log('Отображаемое имя:', displayName);
    
    // Добавляем новый элемент в список с данными файла
    addUploadedTest(displayName, file.type, fileURL);
    
    // Показываем уведомление об успешной загрузке
    const sourceText = isImage ? 'Фото' : 'Файл';
    alert(`${sourceText} успешно загружен!`);
    
    console.log('=== ФАЙЛ УСПЕШНО ОБРАБОТАН ===');
    
  } catch (error) {
    console.error('ОШИБКА при обработке файла:', error);
    alert('Произошла ошибка при загрузке файла');
  }
}

function addUploadedTest(fileName, fileType, fileURL) {
  const testsList = document.getElementById('uploadedTestsList');
  const activeType = document.querySelector('.test-type-btn.active').textContent;
  const currentDate = new Date().toLocaleDateString('ru-RU');
  
  const testItem = document.createElement('div');
  testItem.className = 'test-item';
  testItem.setAttribute('data-file-url', fileURL);
  testItem.setAttribute('data-file-type', fileType);
  testItem.innerHTML = `
    <div class="test-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#6B7280"/>
        <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6.5 2H20V22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5V4.5C4 3.83696 4.26339 3.20107 4.73223 2.73223C5.20107 2.26339 5.83696 2 6.5 2V2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="test-info">
      <h4 class="test-name">${activeType} - ${fileName}</h4>
      <p class="test-date">${currentDate}</p>
    </div>
    <div class="test-actions">
      <div class="test-action-btn success">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <button class="test-action-btn delete">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;
  
  testsList.appendChild(testItem);
  
  // ДОБАВЛЯЕМ ОБРАБОТЧИКИ К НОВОМУ ЭЛЕМЕНТУ
  const testInfo = testItem.querySelector('.test-info');
  const deleteBtn = testItem.querySelector('.test-action-btn.delete');
  
  // Обработчик просмотра
  testInfo.addEventListener('click', () => {
    console.log('Клик по файлу:', fileName, 'Тип:', fileType);
    
    if (fileType && fileType.startsWith('image/')) {
      showImageModal(fileURL, fileName);
    } else if (fileType === 'application/pdf') {
      window.open(fileURL, '_blank');
    } else {
      const link = document.createElement('a');
      link.href = fileURL;
      link.download = fileName;
      link.click();
    }
  });
  
  // Обработчик удаления
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('Удаление файла:', fileName);
    
    if (confirm(`Удалить анализ "${fileName}"?`)) {
      testItem.remove();
    }
  });
}

// Функция просмотра файла анализа
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
    let customAnswer = document.querySelector('.quiz-custom-input');
    
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
    const customInput = document.querySelector('.quiz-custom-input');
    
    if (radioButton) {
      // Это стандартный ответ - выбираем его и отключаем остальные
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

// ФУНКЦИЯ: Восстановление дополнительных ответов
function restoreAdditionalAnswers() {
  const savedAnswers = JSON.parse(localStorage.getItem('additionalAnswers') || '{}');
  
  if (Object.keys(savedAnswers).length > 0) {
    const answer1 = document.getElementById('additionalAnswer1');
    const answer2 = document.getElementById('additionalAnswer2');
    const answer3 = document.getElementById('additionalAnswer3');
    
    if (answer1 && savedAnswers.discomfort) answer1.value = savedAnswers.discomfort;
    if (answer2 && savedAnswers.diagnosis) answer2.value = savedAnswers.diagnosis;
    if (answer3 && savedAnswers.treatment) answer3.value = savedAnswers.treatment;
  }
}

function saveSurveyAnswer(questionId, answer) {
  let surveyAnswers = JSON.parse(localStorage.getItem('surveyAnswers') || '{}');
  surveyAnswers[questionId] = answer;
  localStorage.setItem('surveyAnswers', JSON.stringify(surveyAnswers));
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
      addUserMessage(message);
      chatInput.value = '';
      setTimeout(() => {
        addBotMessage('Извините, ИИ-помощник находится в разработке. Скоро мы сможем предоставить вам персональные рекомендации!');
      }, 1000);
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
    
    // В режиме редактирования добавляем кнопку удаления
    if (isEditMode) {
      entryElement.innerHTML = `
        <span class="entry-time">${entry.time}</span>
        <span class="entry-text">${entry.text}</span>
        <button class="delete-entry-btn" onclick="deleteEntry('${entry.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      `;
    } else {
      entryElement.innerHTML = `
        <span class="entry-time">${entry.time}</span>
        <span class="entry-text">${entry.text}</span>
      `;
    }
    
    entriesContainer.appendChild(entryElement);
  });
  
  // Если режим редактирования активен, включаем drag & drop для новых элементов
  if (isEditMode) {
    enableDragAndDrop();
  }
  
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

// Функция переключения режима редактирования
function toggleEditMode() {
  isEditMode = !isEditMode;
  const editBtn = document.getElementById('editModeBtn');
  const entriesContainer = document.querySelector('.diary-entries');
  
  if (isEditMode) {
    editBtn.classList.add('active');
    entriesContainer.classList.add('edit-mode');
    enableDragAndDrop();
    console.log('🖊️ Режим редактирования включен');
  } else {
    editBtn.classList.remove('active');
    entriesContainer.classList.remove('edit-mode');
    disableDragAndDrop();
    console.log('✅ Режим редактирования выключен');
  }
}

// Функция включения drag & drop
function enableDragAndDrop() {
  const entries = document.querySelectorAll('.diary-entry');
  
  entries.forEach(entry => {
    entry.draggable = true;
    entry.addEventListener('dragstart', handleDragStart);
    entry.addEventListener('dragover', handleDragOver);
    entry.addEventListener('drop', handleDrop);
    entry.addEventListener('dragend', handleDragEnd);
    entry.addEventListener('dragenter', handleDragEnter);
  });
}

// Функция отключения drag & drop
function disableDragAndDrop() {
  const entries = document.querySelectorAll('.diary-entry');
  
  entries.forEach(entry => {
    entry.draggable = false;
    entry.removeEventListener('dragstart', handleDragStart);
    entry.removeEventListener('dragover', handleDragOver);
    entry.removeEventListener('drop', handleDrop);
    entry.removeEventListener('dragend', handleDragEnd);
    entry.removeEventListener('dragenter', handleDragEnter);
  });
}

let draggedElement = null;

// Обработчики drag & drop
function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragEnter(e) {
  e.preventDefault();
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  // Добавляем визуальную подсветку
  if (this !== draggedElement) {
    this.style.borderColor = '#2A3F5F';
    this.style.backgroundColor = '#E5E7EB';
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Убираем визуальную подсветку
  this.style.borderColor = '';
  this.style.backgroundColor = '';
  
  if (draggedElement !== this && draggedElement) {
    // Получаем данные обеих записей
    const draggedId = draggedElement.getAttribute('data-entry-id');
    const targetId = this.getAttribute('data-entry-id');
    
    // Находим записи в данных
    const entries = diaryData[currentSelectedDay];
    const draggedEntry = entries.find(entry => entry.id === draggedId);
    const targetEntry = entries.find(entry => entry.id === targetId);
    
    if (draggedEntry && targetEntry) {
      // Меняем местами только текст, время остается прежним
      const tempText = draggedEntry.text;
      draggedEntry.text = targetEntry.text;
      targetEntry.text = tempText;
      
      // Перезагружаем записи
      loadDayEntries(currentSelectedDay);
      
      console.log(`🔄 Поменяли местами записи: "${draggedEntry.text}" ↔ "${targetEntry.text}"`);
    }
  }
  
  return false;
}

function handleDragEnd(e) {
  // Убираем визуальную подсветку со всех элементов
  const entries = document.querySelectorAll('.diary-entry');
  entries.forEach(entry => {
    entry.style.borderColor = '';
    entry.style.backgroundColor = '';
    entry.classList.remove('dragging');
  });
  
  draggedElement = null;
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