-- Supabase schema for probiohacking-bot
-- Создание таблиц для пользователей и запросов

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  language_code TEXT DEFAULT 'ru',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица запросов пользователей
CREATE TABLE IF NOT EXISTS user_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  response_text TEXT,
  request_type TEXT DEFAULT 'chat', -- chat, diagnostics, analysis, etc.
  metadata JSONB DEFAULT '{}', -- дополнительная информация
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_user_id ON user_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_created_at ON user_requests(created_at DESC);

-- RLS (Row Level Security) политики
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_requests ENABLE ROW LEVEL SECURITY;

-- Политика для пользователей (только для чтения своих данных)
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid()::text = telegram_id::text);

-- Политика для запросов (только для чтения своих данных)
CREATE POLICY "Users can view own requests" ON user_requests
  FOR SELECT USING (user_id IN (
    SELECT id FROM users WHERE telegram_id = auth.uid()::text::bigint
  ));

-- Функция для получения или создания пользователя
CREATE OR REPLACE FUNCTION get_or_create_user(
  p_telegram_id BIGINT,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_username TEXT DEFAULT NULL,
  p_language_code TEXT DEFAULT 'ru'
) RETURNS UUID AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Пытаемся найти существующего пользователя
  SELECT id INTO user_uuid FROM users WHERE telegram_id = p_telegram_id;
  
  -- Если не найден, создаем нового
  IF user_uuid IS NULL THEN
    INSERT INTO users (telegram_id, first_name, last_name, username, language_code)
    VALUES (p_telegram_id, p_first_name, p_last_name, p_username, p_language_code)
    RETURNING id INTO user_uuid;
  ELSE
    -- Обновляем данные существующего пользователя
    UPDATE users 
    SET 
      first_name = COALESCE(p_first_name, first_name),
      last_name = COALESCE(p_last_name, last_name),
      username = COALESCE(p_username, username),
      updated_at = NOW()
    WHERE id = user_uuid;
  END IF;
  
  RETURN user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Функция для сохранения запроса
CREATE OR REPLACE FUNCTION save_user_request(
  p_telegram_id BIGINT,
  p_message_text TEXT,
  p_response_text TEXT DEFAULT NULL,
  p_request_type TEXT DEFAULT 'chat',
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  user_uuid UUID;
  request_uuid UUID;
BEGIN
  -- Получаем или создаем пользователя
  user_uuid := get_or_create_user(p_telegram_id);
  
  -- Сохраняем запрос
  INSERT INTO user_requests (user_id, message_text, response_text, request_type, metadata)
  VALUES (user_uuid, p_message_text, p_response_text, p_request_type, p_metadata)
  RETURNING id INTO request_uuid;
  
  RETURN request_uuid;
END;
$$ LANGUAGE plpgsql;
