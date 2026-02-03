-- Добавление колонки admin в таблицу users
-- Выполните этот SQL в Supabase SQL Editor

-- Добавляем колонку admin (BOOLEAN, по умолчанию FALSE)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS admin BOOLEAN DEFAULT FALSE;

-- Создаём индекс для быстрого поиска админов (опционально)
CREATE INDEX IF NOT EXISTS idx_users_admin ON users(admin) WHERE admin = TRUE;

-- Комментарий к колонке
COMMENT ON COLUMN users.admin IS 'Административные права пользователя';

-- Пример: сделать пользователя админом (замените telegram_id на нужный)
-- UPDATE users SET admin = TRUE WHERE telegram_id = 123456789;
