-- Настройка правильной RLS для Supabase
-- Безопасный доступ через Telegram WebApp

-- 1. Включаем RLS для таблиц
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_requests ENABLE ROW LEVEL SECURITY;

-- 2. Удаляем старые политики если есть
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can view own requests" ON user_requests;

-- 3. Создаем функции для проверки Telegram WebApp токенов
CREATE OR REPLACE FUNCTION verify_telegram_webapp(init_data_text text)
RETURNS TABLE (telegram_id bigint, first_name text, last_name text, username text, language_code text) AS $$
DECLARE
    bot_token TEXT := '8434719499:AAFDOiobfnUjVqEeQTJDhEJgSw5UlqZ-LB0';
    init_data JSONB;
    hash TEXT;
    data_check_string TEXT;
    secret_key BYTEA;
    calculated_hash BYTEA;
BEGIN
    -- Парсим входные данные
    init_data := init_data_text::jsonb;
    
    -- Получаем hash из данных
    hash := init_data->>'hash';
    
    -- Удаляем hash из данных для проверки
    data_check_string := (
        SELECT string_agg(key || '=' || value, chr(10))
        FROM jsonb_each_text(init_data - 'hash')
        ORDER BY key
    );
    
    -- Создаем секретный ключ из bot token
    secret_key := hmac('sha256', 'WebAppData', bot_token::bytea);
    
    -- Вычисляем хеш
    calculated_hash := hmac('sha256', data_check_string, secret_key);
    
    -- Проверяем хеш
    IF encode(calculated_hash, 'hex') != hash THEN
        RAISE EXCEPTION 'Invalid Telegram WebApp hash';
    END IF;
    
    -- Возвращаем данные пользователя
    RETURN QUERY
    SELECT 
        (init_data->>'user')::jsonb->>'id'::bigint,
        (init_data->>'user')::jsonb->>'first_name',
        (init_data->>'user')::jsonb->>'last_name',
        (init_data->>'user')::jsonb->>'username',
        (init_data->>'user')::jsonb->>'language_code';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Создаем политики для пользователей
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (
    telegram_id = (
      SELECT telegram_id 
      FROM verify_telegram_webapp(current_setting('request.headers')::json->>'x-telegram-webapp-data')
    )
  );

CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (
    telegram_id = (
      SELECT telegram_id 
      FROM verify_telegram_webapp(current_setting('request.headers')::json->>'x-telegram-webapp-data')
    )
  );

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (
    telegram_id = (
      SELECT telegram_id 
      FROM verify_telegram_webapp(current_setting('request.headers')::json->>'x-telegram-webapp-data')
    )
  );

-- 5. Создаем политики для запросов
CREATE POLICY "Users can insert own requests" ON user_requests
  FOR INSERT WITH CHECK (
    user_id IN (
      SELECT id 
      FROM users 
      WHERE telegram_id = (
        SELECT telegram_id 
        FROM verify_telegram_webapp(current_setting('request.headers')::json->>'x-telegram-webapp-data')
      )
    )
  );

CREATE POLICY "Users can view own requests" ON user_requests
  FOR SELECT USING (
    user_id IN (
      SELECT id 
      FROM users 
      WHERE telegram_id = (
        SELECT telegram_id 
        FROM verify_telegram_webapp(current_setting('request.headers')::json->>'x-telegram-webapp-data')
      )
    )
  );

-- 6. Отзываем публичные права
REVOKE ALL ON users FROM anon;
REVOKE ALL ON user_requests FROM anon;
REVOKE ALL ON users FROM authenticated;
REVOKE ALL ON user_requests FROM authenticated;

-- 7. Даем права только на конкретные операции
GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT ON user_requests TO authenticated;
