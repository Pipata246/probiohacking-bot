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
const chatOverlay = document.getElementById('chatOverlay');

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

// Навигация между страницами
function showMainApp() {
  mainApp.style.display = 'block';
  knowledgeBase.classList.remove('active');
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
  // Показываем алерт что функция в разработке
  tg.showAlert('Диагностика\n\nФункция в разработке');
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
    } else if (buttonIndex === 4) { // База знаний
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