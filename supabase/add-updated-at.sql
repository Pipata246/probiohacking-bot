-- Добавляем поле updated_at в таблицу quiz_answers если его нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quiz_answers' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE quiz_answers ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;
