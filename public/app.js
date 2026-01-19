// ПОЛНОСТЬЮ НОВЫЙ JAVASCRIPT - НАПИСАН С НУЛЯ

// Telegram Web App API
const tg = window.Telegram.WebApp;
tg.ready();

// Получение данных пользователя
const user = tg.initDataUnsafe?.user;
const userName = user?.first_name || 'Александр';

// Элементы DOM
const welcomeScreen = document.getElementById('welcomeScreen');
const mainApp = document.getElementById('mainApp');
const chatOverlay = document.getElementById('chatOverlay');
const knowledgeBase = document.getElementById('knowledgeBase');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Состояние приложения
let isChatModeActive = false;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Полноэкранный режим
    tg.expand();
    
    // Обновление аватаров
    updateAvatar(document.getElementById('avatar'), user, userName);
    updateAvatar(document.getElementById('sidebarAvatar'), user, userName);
    updateAvatar(document.getElementById('knowledgeAvatar'), user, userName);
    
    // Показ приветственного экрана
    setTimeout(() => {
        document.getElementById('continueText').style.opacity = '1';
    }, 2000);
});

// Функция обновления аватара
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

// Переход от приветственного экрана к главному приложению
welcomeScreen.addEventListener('click', () => {
    welcomeScreen.classList.add('fade-out');
    setTimeout(() => {
        welcomeScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        mainApp.classList.add('show');
    }, 500);
});

// НАВИГАЦИЯ МЕЖДУ СТРАНИЦАМИ
function showMainApp() {
    mainApp.style.display = 'flex';
    chatOverlay.classList.remove('active');
    knowledgeBase.classList.remove('active');
    isChatModeActive = false;
    
    // Обновляем активную кнопку навигации
    updateActiveNavButton(0);
}

function showChat() {
    chatOverlay.classList.add('active');
    chatOverlay.style.display = 'flex';
    isChatModeActive = true;
    
    // Обновляем активную кнопку навигации
    updateActiveNavButton(0); // Главная остается активной
}

function showKnowledgeBase() {
    knowledgeBase.classList.add('active');
    knowledgeBase.style.display = 'flex';
    chatOverlay.classList.remove('active');
    
    // Обновляем активную кнопку навигации
    updateActiveNavButton(4);
}

function updateActiveNavButton(activeIndex) {
    document.querySelectorAll('.nav-item').forEach((item, index) => {
        item.classList.remove('active');
        if (index % 5 === activeIndex) {
            item.classList.add('active');
        }
    });
}

// ФУНКЦИИ ДЛЯ РАБОТЫ С ЧАТОМ
function addUserMessage(text) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'user-message';
    
    // Создаем аватар пользователя
    const userAvatarHtml = user?.photo_url 
        ? `<div class="user-avatar" style="background-image: url(${user.photo_url}); background-size: cover; background-position: center;"></div>`
        : `<div class="user-avatar">${userName.charAt(0).toUpperCase()}</div>`;
    
    messageDiv.innerHTML = `
        ${userAvatarHtml}
        <div class="message-bubble">
            ${text}
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="message-bubble">
            ${text}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addBotMessageWithButton(text) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'bot-message';
    
    messageDiv.innerHTML = `
        <div class="bot-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="message-bubble">
            ${text}
            <button class="diagnosis-btn" style="display: block; width: 100%; margin-top: 12px; padding: 8px 16px; background: #3B4F6B; color: white; border: none; border-radius: 12px; font-size: 14px; cursor: pointer;">Пройти диагностику</button>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function startChatWithMessage(message) {
    showChat();
    // Очищаем чат
    document.getElementById('chatMessages').innerHTML = '';
    
    // Добавляем сообщение пользователя
    addUserMessage(message);
    
    // Симуляция ответа бота
    setTimeout(() => {
        addBotMessageWithButton('Отличный вопрос! Для персонализированных рекомендаций по энергии и тонусу мне нужно узнать больше о вашем текущем состоянии.');
    }, 1000);
}

function startEmptyChat() {
    showChat();
    // Очищаем чат и показываем пустой чат
    document.getElementById('chatMessages').innerHTML = '';
}

// ОБРАБОТЧИКИ СОБЫТИЙ
document.addEventListener('click', (e) => {
    // Обработка кнопки меню
    if (e.target.closest('.menu-btn')) {
        if (chatOverlay.classList.contains('active')) {
            return; // В чате кнопка меню не работает
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
        return;
    }
    
    // Закрытие сайдбара
    if (e.target.closest('.sidebar-overlay')) {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        return;
    }
    
    // Обработка навигации
    if (e.target.closest('.nav-item')) {
        const navItem = e.target.closest('.nav-item');
        const allNavItems = document.querySelectorAll('.nav-item');
        const navIndex = Array.from(allNavItems).indexOf(navItem);
        
        // Закрываем сайдбар если открыт
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        
        const buttonIndex = navIndex % 5;
        
        if (buttonIndex === 0) { // Главная
            if (isChatModeActive && chatOverlay.classList.contains('active')) {
                // Выходим из чата
                showMainApp();
            } else if (isChatModeActive && !chatOverlay.classList.contains('active')) {
                // Возвращаемся в чат
                showChat();
            } else {
                // Обычный переход на главную
                showMainApp();
            }
        } else if (buttonIndex === 4) { // База знаний
            showKnowledgeBase();
        } else {
            // Другие страницы в разработке
            const pages = ['Главная', 'Диагностика', 'Здоровье', 'Дневник', 'База знаний'];
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
    
    // Обработка поиска
    if (e.target.closest('.search-btn')) {
        if (chatOverlay.classList.contains('active')) {
            return; // Не обрабатываем если чат активен
        }
        
        const searchInput = document.querySelector('.search-input');
        const query = searchInput.value.trim();
        
        if (query) {
            startChatWithMessage(query);
            searchInput.value = '';
        }
        return;
    }
    
    // Обработка карточек запросов
    if (e.target.closest('.request-card')) {
        const card = e.target.closest('.request-card');
        const title = card.querySelector('.request-title').textContent;
        const subtitle = card.querySelector('.request-subtitle').textContent;
        
        startChatWithMessage(`${title}: ${subtitle}`);
        return;
    }
    
    // Обработка кнопки создания программы
    if (e.target.closest('.create-program-btn')) {
        startChatWithMessage('Создание персональной программы рекомендаций');
        return;
    }
    
    // Обработка истории в сайдбаре
    if (e.target.closest('.history-item')) {
        const historyText = e.target.closest('.history-item').textContent;
        startChatWithMessage(historyText);
        
        // Закрываем сайдбар
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        return;
    }
    
    // Обработка кнопки "Новый чат"
    if (e.target.closest('.new-chat-btn')) {
        startEmptyChat();
        
        // Закрываем сайдбар
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        return;
    }
});

// Обработка ввода в чате
document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const input = e.target;
        const message = input.value.trim();
        
        if (message) {
            addUserMessage(message);
            input.value = '';
            
            // Симуляция ответа бота
            setTimeout(() => {
                addBotMessage('Спасибо за ваш вопрос! Я анализирую информацию и подготовлю персонализированные рекомендации.');
            }, 1000);
        }
    }
});

// Обработка кнопки отправки в чате
document.getElementById('chatSendBtn').addEventListener('click', () => {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (message) {
        addUserMessage(message);
        input.value = '';
        
        // Симуляция ответа бота
        setTimeout(() => {
            addBotMessage('Спасибо за ваш вопрос! Я анализирую информацию и подготовлю персонализированные рекомендации.');
        }, 1000);
    }
});

// Обработка кнопки диагностики
document.addEventListener('click', (e) => {
    if (e.target.closest('.diagnosis-btn')) {
        addBotMessage('Отлично! Начинаем диагностику. Расскажите о своем режиме сна: во сколько обычно ложитесь спать и просыпаетесь?');
    }
});

console.log('Новое приложение инициализировано');