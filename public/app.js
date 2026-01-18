// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Получение данных пользователя
const user = tg.initDataUnsafe?.user;
const userName = user?.first_name || 'Александр';

// Обновление имени пользователя
document.querySelector('.welcome-name').textContent = userName;

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
