-- Создаем простую таблицу для ответов квиза
CREATE TABLE IF NOT EXISTS quiz_answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    question_id TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_quiz_answers_telegram_id ON quiz_answers(telegram_id);

-- Триггер для обновления статуса квиза когда пользователь ответил на все вопросы
CREATE OR REPLACE FUNCTION update_quiz_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Проверяем ответил ли пользователь на все основные вопросы
    IF (
        SELECT COUNT(DISTINCT question_id) 
        FROM quiz_answers 
        WHERE telegram_id = NEW.telegram_id
        AND question_id IN ('age', 'gender', 'weight', 'height', 'activity')
    ) >= 5 THEN
        -- Обновляем статус пользователя
        UPDATE users 
        SET quiz_completed = true 
        WHERE telegram_id = NEW.telegram_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер
DROP TRIGGER IF EXISTS quiz_answer_trigger ON quiz_answers;
CREATE TRIGGER quiz_answer_trigger
    AFTER INSERT ON quiz_answers
    FOR EACH ROW
    EXECUTE FUNCTION update_quiz_status();

-- Даем права
GRANT ALL ON quiz_answers TO anon;
GRANT EXECUTE ON FUNCTION update_quiz_status() TO anon;

-- Включаем Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE quiz_answers;
