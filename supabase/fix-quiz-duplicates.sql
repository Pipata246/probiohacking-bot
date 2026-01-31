-- Добавляем уникальный constraint и updated_at для quiz_answers
-- Это предотвратит дублирование ответов

-- Сначала удаляем дубликаты, если они есть
DELETE FROM quiz_answers 
WHERE ctid NOT IN (
    SELECT max(ctid) 
    FROM quiz_answers 
    GROUP BY telegram_id, question_id
);

-- Добавляем колонку updated_at если ее нет
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

-- Создаем уникальный constraint
ALTER TABLE quiz_answers ADD CONSTRAINT unique_user_question 
UNIQUE (telegram_id, question_id);

-- Обновляем existing records с правильным updated_at
UPDATE quiz_answers SET updated_at = created_at WHERE updated_at IS NULL;

-- Создаем индекс для уникального constraint (если его еще нет)
CREATE INDEX IF NOT EXISTS idx_quiz_answers_unique ON quiz_answers(telegram_id, question_id);
