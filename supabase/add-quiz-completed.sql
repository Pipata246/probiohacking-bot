-- Добавляем поле quiz_completed в таблицу users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'quiz_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN quiz_completed BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Добавляем комментарий
COMMENT ON COLUMN users.quiz_completed IS 'Статус прохождения диагностики';
