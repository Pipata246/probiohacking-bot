-- НАДЕЖНЫЙ способ убрать дубликаты и создать constraint
-- Выполни это ПЕРЕД тем как обновлять код

-- 1. Сначала удаляем ВСЕ дубликаты
DELETE FROM quiz_answers 
WHERE ctid NOT IN (
    SELECT max(ctid) 
    FROM quiz_answers 
    GROUP BY telegram_id, question_id
);

-- 2. Создаем уникальный constraint (если его еще нет)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_user_question'
    ) THEN
        ALTER TABLE quiz_answers 
        ADD CONSTRAINT unique_user_question 
        UNIQUE (telegram_id, question_id);
    END IF;
END $$;

-- 3. Добавляем updated_at если нет
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

-- 4. Проверяем результат
SELECT COUNT(*) as total_answers, 
       COUNT(DISTINCT telegram_id) as users,
       COUNT(DISTINCT question_id) as unique_questions
FROM quiz_answers;
