// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Получение данных пользователя
const user = tg.initDataUnsafe?.user;
const userName = user?.first_name || 'Александр';
const userFullName = user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Иван Иванов';

// Приветственный экран
const welcomeScreen = document.getElementById('welcomeScreen');
const mainApp = document.getElementById('mainApp');
const knowledgeBase = document.getElementById('knowledgeBase');

// Показать приложение после клика на приветственный экран
welcomeScreen.addEventListener('click', () => {
  welcomeScreen.classList.add('fade-out');
  setTimeout(() => {
    welcomeScreen.style.display = 'none';
    mainApp.classList.add('show');
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
  
  // Устанавливаем активную кнопку "Главная" во всех навигациях
  document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.classList.remove('active');
    // Главная кнопка - первая в каждой навигации (0 и 5)
    if (index === 0 || index === 5) {
      item.classList.add('active');
    }
  });
}

function showKnowledgeBase() {
  mainApp.style.display = 'none';
  knowledgeBase.classList.add('active');
  
  // Устанавливаем активную кнопку "База знаний" во всех навигациях
  document.querySelectorAll('.nav-item').forEach((item, index) => {
    item.classList.remove('active');
    // База знаний - пятая кнопка в каждой навигации (4 и 9)
    if (index === 4 || index === 9) {
      item.classList.add('active');
    }
  });
}

// Централизованный обработчик всех событий клика
document.addEventListener('click', (e) => {
  // Обработка кнопок меню (3 полоски)
  if (e.target.closest('.menu-btn')) {
    e.preventDefault();
    e.stopPropagation();
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebarOverlay) {
      sidebar.classList.add('active');
      sidebarOverlay.classList.add('active');
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
    
    // Определяем какая кнопка нажата (учитываем что есть две навигации)
    const buttonIndex = navIndex % 5;
    
    if (buttonIndex === 0) { // Главная
      showMainApp();
    } else if (buttonIndex === 4) { // База знаний
      showKnowledgeBase();
    } else {
      // Другие страницы в разработке
      tg.showAlert(`${pages[buttonIndex]}\n\nСтраница в разработке`);
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
    const searchInput = document.querySelector('.search-input');
    const query = searchInput.value.trim();
    if (query) {
      tg.showAlert(`Поиск: ${query}\n\nФункция в разработке`);
    }
    return;
  }
  
  // Обработка кнопки создания программы
  if (e.target.closest('.create-program-btn')) {
    tg.showAlert('Создание персональной программы\n\nФункция в разработке');
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
      tg.showAlert(`${titles[index]}\n\nФункция в разработке`);
    } else {
      // Карточки для спортсменов
      const sportsIndex = index - quickCards.length;
      const sportsTitles = ['Восстановление мышц и энергия', 'Сила и мышечная масса', 'Выносливость и оксигенация', 'Фокус и реакция', 'Суставы и связки', 'Иммунитет при нагрузках', 'Детокс и очищение', 'Качество сна и нейровосстановление'];
      tg.showAlert(`${sportsTitles[sportsIndex]}\n\nФункция в разработке`);
    }
    return;
  }
});

// Обработчик скролла для изменения цвета навигации и показа дополнительных карточек
const bottomNav = document.querySelector('.bottom-nav');
const quickRequests = document.querySelector('.quick-requests');
const sportsRequests = document.querySelector('.sports-requests');

function updateNavBackground() {
  if (!bottomNav || !quickRequests || !sportsRequests) return;
  
  const quickRequestsRect = quickRequests.getBoundingClientRect();
  const sportsRequestsRect = sportsRequests.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  
  // Если любая из секций быстрых запросов видна в области нижней навигации
  if ((quickRequestsRect.bottom > windowHeight - 80 && quickRequestsRect.top < windowHeight) ||
      (sportsRequestsRect.bottom > windowHeight - 80 && sportsRequestsRect.top < windowHeight)) {
    bottomNav.classList.add('blue-bg');
  } else {
    bottomNav.classList.remove('blue-bg');
  }
}

function handleQuickRequestsExpansion() {
  if (!quickRequests) return;
  
  const scrollY = window.scrollY;
  
  // Показать дополнительные карточки при любом скролле вниз
  if (scrollY > 50) {
    quickRequests.classList.add('expanded');
  } else {
    quickRequests.classList.remove('expanded');
  }
}

function handleSportsRequestsVisibility() {
  if (!quickRequests || !sportsRequests) return;
  
  const quickRequestsRect = quickRequests.getBoundingClientRect();
  const scrollY = window.scrollY;
  
  // Показать секцию для спортсменов когда пользователь прокрутил дальше быстрых запросов
  if (scrollY > 300 || quickRequestsRect.bottom < window.innerHeight * 0.5) {
    sportsRequests.classList.add('visible');
  } else {
    sportsRequests.classList.remove('visible');
  }
}

function handleScroll() {
  updateNavBackground();
  handleQuickRequestsExpansion();
  handleSportsRequestsVisibility();
}

window.addEventListener('scroll', handleScroll);
window.addEventListener('resize', handleScroll);

// Инициальная проверка
handleScroll();

console.log('Mini App загружен');