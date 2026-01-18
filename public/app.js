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
  if (user?.photo_url) {
    element.style.backgroundImage = `url(${user.photo_url})`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.textContent = '';
  } else {
    const initials = userName.charAt(0).toUpperCase();
    element.textContent = initials;
  }
}

// Обновление аватарок
updateAvatar(document.getElementById('avatar'), user, userName);
updateAvatar(document.getElementById('sidebarAvatar'), user, userName);

// Боковое меню
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarClose = document.getElementById('sidebarClose');

function openSidebar() {
  sidebar.classList.add('active');
  sidebarOverlay.classList.add('active');
}

function closeSidebar() {
  sidebar.classList.remove('active');
  sidebarOverlay.classList.remove('active');
}

menuBtn.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// Обработчик скролла для изменения цвета навигации и показа дополнительных карточек
const bottomNav = document.querySelector('.bottom-nav');
const quickRequests = document.querySelector('.quick-requests');
const sportsRequests = document.querySelector('.sports-requests');
const recommendationsCard = document.querySelector('.recommendations-card');

function updateNavBackground() {
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
  const scrollY = window.scrollY;
  
  // Показать дополнительные карточки при любом скролле вниз
  if (scrollY > 50) {
    quickRequests.classList.add('expanded');
  } else {
    quickRequests.classList.remove('expanded');
  }
}

function handleSportsRequestsVisibility() {
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

// Обработчики событий
document.querySelector('.search-btn').addEventListener('click', () => {
  const searchInput = document.querySelector('.search-input');
  const query = searchInput.value.trim();
  if (query) {
    tg.showAlert(`Поиск: ${query}\n\nФункция в разработке`);
  }
});

document.querySelector('.create-program-btn').addEventListener('click', () => {
  tg.showAlert('Создание персональной программы\n\nФункция в разработке');
});

document.querySelectorAll('.quick-card').forEach((card, index) => {
  card.addEventListener('click', () => {
    const quickCards = document.querySelectorAll('.quick-requests .quick-card');
    const sportsCards = document.querySelectorAll('.sports-requests .quick-card');
    
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
  });
});

document.querySelectorAll('.nav-item').forEach((item, index) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    
    const pages = ['Главная', 'Диагностика', 'Здоровье', 'Дневник', 'База знаний'];
    if (index !== 0) {
      tg.showAlert(`${pages[index]}\n\nСтраница в разработке`);
    }
  });
});

console.log('Mini App загружен');