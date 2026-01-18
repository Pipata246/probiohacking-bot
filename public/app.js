// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Получение данных пользователя
const user = tg.initDataUnsafe?.user;
const userName = user?.first_name || 'Александр';
const userFullName = user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Иван Иванов';

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
    const titles = ['Энергия и тонус', 'Память', 'Стресс и ментальный фокус'];
    tg.showAlert(`${titles[index]}\n\nФункция в разработке`);
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
