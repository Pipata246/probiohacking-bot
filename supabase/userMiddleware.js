// Middleware для инициализации пользователя
const { userService } = require('./client.js');

// Хранилище активных сессий пользователей (в проде можно заменить на Redis)
const userSessions = new Map();

// Функция для получения или создания пользователя
async function getOrCreateUser(telegramUser) {
  if (!telegramUser || !telegramUser.id) {
    return null;
  }

  const telegramId = telegramUser.id;
  
  // Проверяем, есть ли пользователь в сессии
  if (userSessions.has(telegramId)) {
    return userSessions.get(telegramId);
  }

  try {
    // Создаем или получаем пользователя из Supabase
    const userId = await userService.getOrCreateUser(
      telegramId,
      telegramUser.first_name,
      telegramUser.last_name,
      telegramUser.username,
      telegramUser.language_code || 'ru'
    );

    if (userId) {
      // Сохраняем в сессию
      const userInfo = {
        id: userId,
        telegramId: telegramId,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        username: telegramUser.username,
        languageCode: telegramUser.language_code || 'ru'
      };
      
      userSessions.set(telegramId, userInfo);
      console.log(`User initialized: ${telegramId} (${telegramUser.first_name})`);
      return userInfo;
    }
  } catch (error) {
    console.error('Error creating user:', error);
  }

  return null;
}

// Express middleware для автоматической инициализации пользователя
function userInitMiddleware() {
  return async (req, res, next) => {
    const telegramUser = req.body?.telegramUser || req.query?.telegramUser;
    
    if (telegramUser) {
      req.user = await getOrCreateUser(telegramUser);
    }
    
    next();
  };
}

// Функция для инициализации пользователя из Telegram WebApp
async function initUserFromWebApp(req) {
  const telegramUserFromBody = req.body?.telegramUser;
  if (telegramUserFromBody && telegramUserFromBody.id) {
    return await getOrCreateUser(telegramUserFromBody);
  }

  const initData = req.headers?.['x-telegram-webapp-data'];
  if (!initData || typeof initData !== 'string') {
    return null;
  }

  try {
    // initData is a querystring. We only need the user field.
    const params = new URLSearchParams(initData);
    const userRaw = params.get('user');
    if (!userRaw) return null;

    const telegramUser = JSON.parse(userRaw);
    if (!telegramUser || !telegramUser.id) return null;
    return await getOrCreateUser(telegramUser);
  } catch (error) {
    console.error('Error parsing Telegram WebApp initData:', error);
    return null;
  }
}

// Функция для инициализации пользователя из Telegram Bot
async function initUserFromBot(ctx) {
  const telegramUser = ctx.from || ctx.message?.from;
  if (telegramUser) {
    return await getOrCreateUser(telegramUser);
  }
  return null;
}

// Очистка сессии (для logout)
function clearUserSession(telegramId) {
  userSessions.delete(telegramId);
}

// Получение пользователя из сессии
function getUserFromSession(telegramId) {
  return userSessions.get(telegramId) || null;
}

module.exports = {
  getOrCreateUser,
  userInitMiddleware,
  initUserFromWebApp,
  initUserFromBot,
  clearUserSession,
  getUserFromSession
};
