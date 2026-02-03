-- Добавление колонки admin в таблицу users
-- Выполните этот SQL в Supabase SQL Editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS admin BOOLEAN DEFAULT FALSE;

-- Комментарий к колонке (опционально)
COMMENT ON COLUMN users.admin IS 'Административные права пользователя';

-- Пример: сделать пользователя админом (замените telegram_id на нужный)
-- UPDATE users SET admin = TRUE WHERE telegram_id = 'YOUR_TELEGRAM_ID';
