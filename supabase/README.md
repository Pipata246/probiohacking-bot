# Supabase Integration для probiohacking-bot

## Установка и настройка

### 1. Создание проекта Supabase
1. Перейдите на https://supabase.com
2. Создайте новый проект
3. Скопируйте URL и anon ключ из Settings → API

### 2. Настройка переменных окружения
Добавьте в `.env` файл:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Создание таблиц
Выполните SQL код из `schema.sql` в Supabase SQL Editor:
1. Откройте Supabase Dashboard
2. Перейдите в SQL Editor
3. Вставьте содержимое `schema.sql`
4. Нажмите "Run"

## Структура базы данных

### Таблица `users`
- `id` - UUID (первичный ключ)
- `telegram_id` - Telegram ID пользователя (уникальный)
- `first_name` - Имя пользователя
- `last_name` - Фамилия пользователя
- `username` - Username в Telegram
- `language_code` - Код языка (по умолчанию 'ru')
- `created_at` - Дата создания
- `updated_at` - Дата обновления

### Таблица `user_requests`
- `id` - UUID (первичный ключ)
- `user_id` - Ссылка на пользователя
- `message_text` - Текст сообщения пользователя
- `response_text` - Текст ответа бота
- `request_type` - Тип запроса (chat, diagnostics, analysis, etc.)
- `metadata` - Дополнительная информация (JSON)
- `created_at` - Дата создания

## Использование в коде

### Импорт
```javascript
import { supabase, userService, requestService } from './supabase/client.js';
```

### Работа с пользователями
```javascript
// Получить или создать пользователя
const userId = await userService.getOrCreateUser(
  telegramId,
  firstName,
  lastName,
  username,
  languageCode
);

// Получить пользователя по Telegram ID
const user = await userService.getUserByTelegramId(telegramId);
```

### Работа с запросами
```javascript
// Сохранить запрос
const requestId = await requestService.saveRequest(
  telegramId,
  messageText,
  responseText,
  'chat',
  { source: 'web_app' }
);

// Получить запросы пользователя
const requests = await requestService.getUserRequests(telegramId, 50);

// Получить статистику
const stats = await requestService.getRequestStats(telegramId);
```

## Типы запросов

- `chat` - Обычный чат с AI
- `diagnostics` - Запуск диагностики
- `analysis` - Анализ анализов
- `program` - Создание программы
- `recommendations` - Рекомендации

## Безопасность

- Включен Row Level Security (RLS)
- Пользователи могут видеть только свои данные
- Используются анонимные ключи для доступа

## Индексы

Созданы индексы для оптимизации:
- `idx_users_telegram_id` - для быстрого поиска по Telegram ID
- `idx_user_requests_user_id` - для запросов пользователя
- `idx_user_requests_created_at` - для сортировки по дате
