-- ============================================
-- ИСПРАВЛЕНИЕ КОЛОНКИ ADMIN В ТАБЛИЦЕ USERS
-- Этот скрипт откатывает предыдущие изменения и применяет правильную версию
-- ============================================

-- ШАГ 1: Удаляем индекс если он существует (может быть создан дважды)
DROP INDEX IF EXISTS idx_users_admin;

-- ШАГ 2: Удаляем колонку admin если она существует
ALTER TABLE users DROP COLUMN IF EXISTS admin;

-- ШАГ 3: Добавляем колонку admin правильно (BOOLEAN, по умолчанию FALSE)
ALTER TABLE users 
ADD COLUMN admin BOOLEAN DEFAULT FALSE NOT NULL;

-- ШАГ 4: Создаём индекс для быстрого поиска админов (только для TRUE значений)
CREATE INDEX idx_users_admin ON users(admin) WHERE admin = TRUE;

-- ШАГ 5: Добавляем комментарий к колонке
COMMENT ON COLUMN users.admin IS 'Административные права пользователя';

-- ШАГ 6: Проверяем что всё создано правильно
DO $$
BEGIN
    -- Проверяем наличие колонки
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'admin'
    ) THEN
        RAISE EXCEPTION 'Колонка admin не была создана!';
    END IF;
    
    -- Проверяем наличие индекса
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'users' 
        AND indexname = 'idx_users_admin'
    ) THEN
        RAISE EXCEPTION 'Индекс idx_users_admin не был создан!';
    END IF;
    
    RAISE NOTICE '✅ Колонка admin успешно создана и настроена!';
END $$;

-- ============================================
-- ПРИМЕР: Сделать пользователя админом
-- Раскомментируйте и замените telegram_id на нужный:
-- UPDATE users SET admin = TRUE WHERE telegram_id = YOUR_TELEGRAM_ID;
-- ============================================
