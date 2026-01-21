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
const diagnosticForm = document.getElementById('diagnosticForm');

// Состояние чата
let isChatModeActive = false;

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

// Навигация между страницами
function showMainApp() {
  mainApp.style.display = 'block';
  knowledgeBase.classList.remove('active');
  diagnosticsPage.classList.remove('active');
  chatOverlay.classList.remove('active');
  document.body.classList.remove('chat-overlay-visible'); // Разблокируем скролл body
  isChatModeActive = false; // Выходим из режима чата
  
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
  
  // Устанавливаем активную кнопку "Главная" во всех навигациях
  document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.classList.remove('active');
    // Главная кнопка - первая в каждой навигации (0, 5, 10)
    if (index % 5 === 0) {
      item.classList.add('active');
    }
  });
}

function showKnowledgeBase() {
  mainApp.style.display = 'none';
  knowledgeBase.classList.add('active');
  diagnosticsPage.classList.remove('active');
  chatOverlay.classList.remove('active');
  // ВСЕГДА разблокируем скролл в базе знаний, независимо от режима чата
  document.body.classList.remove('chat-overlay-visible');
  
  // Устанавливаем активную кнопку "База знаний" во всех навигациях
  document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.classList.remove('active');
    // База знаний - пятая кнопка в каждой навигации (4, 9, 14)
    if (index % 5 === 4) {
      item.classList.add('active');
    }
  });
}

function showDiagnostics() {
  mainApp.style.display = 'none';
  knowledgeBase.classList.remove('active');
  diagnosticsPage.classList.add('active');
  chatOverlay.classList.remove('active');
  document.body.classList.remove('chat-overlay-visible');
  isChatModeActive = false;
  
  // Устанавливаем активную кнопку "Диагностика" во всех навигациях
  document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.classList.remove('active');
    // Диагностика - вторая кнопка в каждой навигации (1, 6, 11)
    if (index % 5 === 1) {
      item.classList.add('active');
    }
  });
}

function showChat() {
  chatOverlay.classList.add('active');
  document.body.classList.add('chat-overlay-visible'); // Блокируем скролл body только когда чат видим
  // НЕ скрываем mainApp, так как чат теперь независимый оверлей
  isChatModeActive = true; // Входим в режим чата
  
  // Главная остается активной (чат - часть главной)
  document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.classList.remove('active');
    if (index % 5 === 0) {
      item.classList.add('active');
    }
  });
}

function hideChat() {
  chatOverlay.classList.remove('active');
  document.body.classList.remove('chat-overlay-visible'); // Разблокируем скролл body
  isChatModeActive = false; // Выходим из режима чата
}

function returnToChatFromOtherPage() {
  // Возвращаемся в чат из другой страницы (если были в режиме чата)
  mainApp.style.display = 'none';
  knowledgeBase.classList.remove('active');
  diagnosticsPage.classList.remove('active');
  chatOverlay.classList.add('active');
  document.body.classList.add('chat-overlay-visible'); // Блокируем скролл body только когда чат видим
  
  // Главная остается активной
  document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.classList.remove('active');
    if (index % 5 === 0) {
      item.classList.add('active');
    }
  });
}

// Функции для работы с чатом
function addUserMessage(text) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'user-message';
  
  // Создаем аватар пользователя с учетом данных из Telegram
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
  // Очищаем чат
  document.getElementById('chatMessages').innerHTML = '';
  // Добавляем сообщение пользователя
  addUserMessage(message);
  // Добавляем ответ бота с кнопкой диагностики
  setTimeout(() => {
    addBotMessageWithButton(
      'Для данного запроса мне требуются твои данные, однако ты не прошел диагностику и я не могу тебе помочь. Пройди диагностику и загрузи свои анализы для лучшего ответа!',
      'Пройти диагностику',
      'handleDiagnosticButton()'
    );
  }, 1000);
}

function handleDiagnosticButton() {
  // Закрываем чат и переходим к диагностической форме
  hideChat();
  showDiagnostics();
  // Небольшая задержка для плавного перехода
  setTimeout(() => {
    showDiagnosticForm();
  }, 100);
}

function showDiagnosticForm() {
  // Создаем форму диагностики как полноэкранный оверлей внутри диагностики
  const diagnosticForm = document.createElement('div');
  diagnosticForm.className = 'diagnostic-form-overlay';
  diagnosticForm.id = 'diagnosticFormOverlay';
  
  diagnosticForm.innerHTML = `
    <div class="diagnostic-form-content">
      <!-- Экран заполнения данных -->
      <div class="form-step" id="personalDataStep">
        <!-- Хедер внутри слайда -->
        <header class="slide-header">
          <div class="avatar" id="diagnosticFormAvatar">AM</div>
        </header>
        
        <h2 class="form-main-title">Диагностическая анкета:<br>оценка систем организма</h2>
        
        <!-- Выбор пола -->
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
        
        <!-- Поля ввода -->
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
        
        <!-- Навигация формы -->
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
      </div>
      
      <!-- Экран вопросов -->
      <div class="form-step hidden" id="surveyStep">
        <!-- Хедер внутри слайда -->
        <header class="slide-header">
          <div class="avatar" id="surveyFormAvatar">AM</div>
        </header>
        
        <!-- Прогресс бар -->
        <div class="survey-progress">
          <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
          </div>
          <div class="progress-info">
            <span class="progress-text" id="progressText">Вопрос 1 из 17</span>
          </div>
        </div>
        
        <!-- Контент вопроса -->
        <div class="survey-question" id="surveyQuestion">
          <!-- Вопросы будут загружаться динамически -->
        </div>
        
        <!-- Навигация вопросов -->
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
        
        <!-- Нижняя навигация в экране вопросов -->
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
  
  // Добавляем форму в страницу диагностики
  const diagnosticsPage = document.getElementById('diagnosticsPage');
  diagnosticsPage.appendChild(diagnosticForm);
  
  // Обновляем аватары в форме
  updateAvatar(document.getElementById('diagnosticFormAvatar'), user, userName);
  updateAvatar(document.getElementById('surveyFormAvatar'), user, userName);
  
  // Добавляем обработчики событий
  setupDiagnosticFormHandlers();
}

function setupDiagnosticFormHandlers() {
  const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
  const formBackBtn = document.getElementById('formBackBtn');
  const formNextBtn = document.getElementById('formNextBtn');
  const personalDataStep = document.getElementById('personalDataStep');
  const surveyStep = document.getElementById('surveyStep');
  
  // Кнопка "Назад" в форме данных - выход из формы
  formBackBtn.addEventListener('click', () => {
    diagnosticFormOverlay.remove();
  });
  
  // Кнопка "Вперед" в форме данных - переход к вопросам
  formNextBtn.addEventListener('click', () => {
    if (validatePersonalDataNew()) {
      savePersonalDataNew();
      // Переходим к экрану вопросов
      personalDataStep.classList.add('hidden');
      surveyStep.classList.remove('hidden');
      initSurvey();
    }
  });
}

function validatePersonalDataNew() {
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

function savePersonalDataNew() {
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
  
  // Сохраняем в localStorage (временно)
  localStorage.setItem('diagnosticPersonalData', JSON.stringify(personalData));
  console.log('Личные данные сохранены:', personalData);
}

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
  // Добавляем заглушки для остальных 16 вопросов
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
  updateProgress();
  setupSurveyNavigation();
}

function updateProgress() {
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const progress = ((currentQuestionIndex + 1) / surveyQuestions.length) * 100;
  
  progressFill.style.width = `${progress}%`;
  progressText.textContent = `Вопрос ${currentQuestionIndex + 1} из ${surveyQuestions.length}`;
}

function showQuestion(index) {
  const question = surveyQuestions[index];
  const questionContainer = document.getElementById('surveyQuestion');
  
  let optionsHtml = '';
  
  if (question.type === 'multiple_with_custom') {
    optionsHtml = question.options.map(option => `
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
  }
  
  questionContainer.innerHTML = `
    <!-- Заголовки сверху -->
    <div class="quiz-titles">
      <h1 class="quiz-main-title">Диагностическая анкета:</h1>
      <h2 class="quiz-sub-title">${question.system}</h2>
    </div>
    
    <!-- Объединенная карточка с прогрессом и вопросом -->
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
  
  // Добавляем обработчики для взаимоисключения и отмены выбора
  setupAnswerExclusion(question.id);
}

function setupAnswerExclusion(questionId) {
  const radioButtons = document.querySelectorAll(`input[name="question_${questionId}"]`);
  const customInput = document.querySelector(`input[name="custom_${questionId}"]`);
  const quizOptions = document.querySelectorAll('.quiz-option');
  
  // Обработчик для радио-кнопок с возможностью отмены
  radioButtons.forEach(radio => {
    let lastClickTime = 0;
    
    radio.addEventListener('change', () => {
      if (radio.checked) {
        // Отключаем поле ввода
        customInput.disabled = true;
        customInput.value = '';
        customInput.classList.add('disabled');
      }
    });
    
    // Добавляем обработчик клика для отмены выбора
    radio.parentElement.addEventListener('click', (e) => {
      e.preventDefault();
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastClickTime;
      
      if (radio.checked && timeDiff < 500) {
        // Двойной клик - отменяем выбор
        radio.checked = false;
        customInput.disabled = false;
        customInput.classList.remove('disabled');
        
        // Включаем все опции обратно
        quizOptions.forEach(option => {
          option.classList.remove('disabled');
        });
        radioButtons.forEach(r => {
          r.disabled = false;
        });
      } else if (!radio.checked) {
        // Первый клик - выбираем
        radioButtons.forEach(r => r.checked = false); // Снимаем выбор с других
        radio.checked = true;
        
        // Отключаем поле ввода
        customInput.disabled = true;
        customInput.value = '';
        customInput.classList.add('disabled');
      }
      
      lastClickTime = currentTime;
    });
  });
  
  // Обработчик для поля ввода
  customInput.addEventListener('input', () => {
    if (customInput.value.trim()) {
      // Отключаем все радио-кнопки
      radioButtons.forEach(radio => {
        radio.checked = false;
        radio.disabled = true;
      });
      quizOptions.forEach(option => {
        option.classList.add('disabled');
      });
    } else {
      // Включаем радио-кнопки обратно
      radioButtons.forEach(radio => {
        radio.disabled = false;
      });
      quizOptions.forEach(option => {
        option.classList.remove('disabled');
      });
    }
  });
  
  // Обработчик для очистки при фокусе на поле ввода
  customInput.addEventListener('focus', () => {
    if (!customInput.disabled) {
      // Снимаем выбор с радио-кнопок
      radioButtons.forEach(radio => {
        radio.checked = false;
      });
    }
  });
}



function setupSurveyNavigation() {
  const surveyBackBtn = document.getElementById('surveyBackBtn');
  const surveyNextBtn = document.getElementById('surveyNextBtn');
  
  // Кнопка "Назад" в опросе
  surveyBackBtn.onclick = () => {
    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      showQuestion(currentQuestionIndex);
      updateProgress();
      updateNavigationButtons();
    } else {
      // Если это первый вопрос, возвращаемся к форме данных
      const surveyStep = document.getElementById('surveyStep');
      const personalDataStep = document.getElementById('personalDataStep');
      surveyStep.classList.add('hidden');
      personalDataStep.classList.remove('hidden');
    }
  };
  
  // Кнопка "Вперед" в опросе
  surveyNextBtn.onclick = () => {
    const currentQuestion = surveyQuestions[currentQuestionIndex];
    let selectedAnswer = document.querySelector(`input[name="question_${currentQuestion.id}"]:checked`);
    let customAnswer = document.querySelector(`input[name="custom_${currentQuestion.id}"]`);
    
    // Проверяем есть ли выбранный ответ или кастомный ответ
    if (!selectedAnswer && (!customAnswer || !customAnswer.value.trim())) {
      tg.showAlert('Пожалуйста, выберите ответ или введите свой вариант');
      return;
    }
    
    // Сохраняем ответ
    let answerValue = selectedAnswer ? selectedAnswer.value : customAnswer.value.trim();
    saveSurveyAnswer(currentQuestion.id, answerValue);
    
    if (currentQuestionIndex < surveyQuestions.length - 1) {
      currentQuestionIndex++;
      showQuestion(currentQuestionIndex);
      updateProgress();
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
  
  // Кнопка назад всегда активна
  surveyBackBtn.classList.add('nav-circle-btn-active');
  
  if (currentQuestionIndex === surveyQuestions.length - 1) {
    // Последний вопрос - показываем галочку
    surveyNextBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20 6L9 17L4 12" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  } else {
    // Обычная стрелка вперед
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
  
  // Показываем сообщение о завершении
  tg.showAlert('Спасибо! Ваши ответы сохранены.\nВ ближайшее время мы подготовим для вас персональные рекомендации.');
  
  // Закрываем форму
  diagnosticFormOverlay.remove();
  
  // Можно добавить логику отправки данных на сервер
  console.log('Опрос завершен');
  console.log('Личные данные:', JSON.parse(localStorage.getItem('diagnosticPersonalData')));
  console.log('Ответы на вопросы:', JSON.parse(localStorage.getItem('surveyAnswers')));
}

function openChatFromHistory() {
  showChat();
  // Очищаем чат и показываем пустой чат
  document.getElementById('chatMessages').innerHTML = '';
}

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
    
    console.log('Menu button clicked'); // Для отладки
    
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.add('active');
      sidebarOverlay.classList.add('active');
      console.log('Sidebar opened'); // Для отладки
    } else {
      console.log('Sidebar elements not found'); // Для отладки
    }
    // НЕ переключаем страницы - остаемся там где есть
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
  
  // Обработка навигации
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
    
    // Убираем активный класс со всех кнопок навигации
    allNavItems.forEach(i => i.classList.remove('active'));
    navItem.classList.add('active');
    
    const pages = ['Главная', 'Диагностика', 'Здоровье', 'Дневник', 'База знаний'];
    
    // Определяем какая кнопка нажата (учитываем что есть три навигации)
    const buttonIndex = navIndex % 5;
    
    if (buttonIndex === 0) { // Главная
      // Закрываем диагностическую форму если она открыта
      const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
      if (diagnosticFormOverlay) {
        diagnosticFormOverlay.remove();
      }
      
      if (isChatModeActive && chatOverlay.classList.contains('active')) {
        // Если в режиме чата И чат открыт - выходим из режима чата
        showMainApp();
      } else if (isChatModeActive && !chatOverlay.classList.contains('active')) {
        // Если в режиме чата, но чат закрыт (например, в базе знаний) - возвращаемся в чат
        returnToChatFromOtherPage();
      } else {
        // Обычный переход на главную (не в режиме чата)
        showMainApp();
      }
    } else if (buttonIndex === 1) { // Диагностика
      // Закрываем диагностическую форму если она открыта
      const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
      if (diagnosticFormOverlay) {
        diagnosticFormOverlay.remove();
      }
      showDiagnostics();
    } else if (buttonIndex === 4) { // База знаний
      // Закрываем диагностическую форму если она открыта
      const diagnosticFormOverlay = document.getElementById('diagnosticFormOverlay');
      if (diagnosticFormOverlay) {
        diagnosticFormOverlay.remove();
      }
      showKnowledgeBase();
    } else {
      // Другие страницы в разработке
      // ВСЕГДА разблокируем скролл для других страниц
      document.body.classList.remove('chat-overlay-visible');
      
      if (isChatModeActive) {
        // В режиме чата показываем алерт, но остаемся в режиме чата
        tg.showAlert(`${pages[buttonIndex]}\n\nСтраница в разработке`);
        // Возвращаемся в чат после алерта
        setTimeout(() => {
          returnToChatFromOtherPage();
        }, 100);
      } else {
        tg.showAlert(`${pages[buttonIndex]}\n\nСтраница в разработке`);
      }
    }
    return;
  }
  
  // Обработка разделов базы знаний
  if (e.target.closest('.knowledge-section .section-header')) {
    const header = e.target.closest('.knowledge-section .section-header');
    const section = header.parentElement;
    section.classList.toggle('expanded');
    return;
  }
  
  // Обработка кнопки поиска
  if (e.target.closest('.search-btn')) {
    // Проверяем, не активен ли чат
    if (chatOverlay.classList.contains('active')) {
      return; // Не обрабатываем если чат активен
    }
    
    const searchInput = document.querySelector('.search-input');
    const query = searchInput.value.trim();
    if (query) {
      // Переходим в чат с сообщением
      openChatWithMessage(query);
      searchInput.value = ''; // Очищаем поле
    }
    return;
  }
  
  // Обработка кнопки "Создать новый чат"
  if (e.target.closest('.new-chat-btn') || e.target.closest('#newChatBtn')) {
    // Сначала закрываем боковое меню
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    }
    
    // Создаем новый чат
    showChat();
    // Очищаем чат для нового разговора
    document.getElementById('chatMessages').innerHTML = '';
    
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
  
  // Обработка истории запросов в боковом меню
  if (e.target.closest('.history-item')) {
    // Сначала закрываем боковое меню
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    }
    
    // Если в режиме чата - переключаемся между чатами
    if (isChatModeActive) {
      openChatFromHistory();
    } else {
      // Если не в режиме чата - входим в режим чата
      openChatFromHistory();
    }
    return;
  }
  
  // Обработка кнопки отправки в чате
  if (e.target.closest('.chat-send-btn')) {
    const chatInput = document.querySelector('.chat-input');
    const message = chatInput.value.trim();
    if (message) {
      // Добавляем сообщение пользователя в чат
      addUserMessage(message);
      chatInput.value = ''; // Очищаем поле ввода
      
      // Добавляем ответ бота (заглушка) через секунду
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
      // Быстрые запросы
      const titles = ['Энергия и тонус', 'Память и ясность ума', 'Стресс и баланс', 'Иммунитет и защита', 'Суставы и подвижность', 'Пищеварение и метаболизм'];
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
      // Карточки для спортсменов
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
});

// Обработчик скролла для изменения цвета навигации (упрощенная версия)
const bottomNav = document.querySelector('.bottom-nav');

function updateNavBackground() {
  // Простая логика - можно расширить при необходимости
  if (!bottomNav) return;
  
  // Всегда используем базовый цвет навигации
  bottomNav.classList.remove('blue-bg');
}

function handleScroll() {
  updateNavBackground();
}

window.addEventListener('scroll', handleScroll);
window.addEventListener('resize', handleScroll);

// Инициальная проверка
handleScroll();

// Обработчик Enter в поле поиска и чата
document.addEventListener('keypress', (e) => {
  if (e.target.closest('.search-input') && e.key === 'Enter') {
    // Проверяем, не активен ли чат
    if (chatOverlay.classList.contains('active')) {
      return; // Не обрабатываем если чат активен
    }
    
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
      // Добавляем сообщение пользователя в чат
      addUserMessage(message);
      chatInput.value = ''; // Очищаем поле ввода
      
      // Добавляем ответ бота (заглушка) через секунду
      setTimeout(() => {
        addBotMessage('Извините, ИИ-помощник находится в разработке. Скоро мы сможем предоставить вам персональные рекомендации!');
      }, 1000);
    }
  }
});

console.log('Mini App загружен');

// Дополнительный обработчик для кнопок меню (только для главной страницы)
document.addEventListener('DOMContentLoaded', () => {
  const menuButtons = document.querySelectorAll('.menu-btn, #menuBtn');
  menuButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Проверяем что мы НЕ в чате
      if (chatOverlay.classList.contains('active')) {
        return; // В чате кнопка меню не работает
      }
      
      e.preventDefault();
      e.stopPropagation();
      console.log('Direct menu button handler triggered');
      
      const sidebar = document.getElementById('sidebar');
      const sidebarOverlay = document.getElementById('sidebarOverlay');
      if (sidebar && sidebarOverlay) {
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
      }
    });
  });
});