-- Создаем простую таблицу для ответов квиза с полными вопросами
CREATE TABLE IF NOT EXISTS quiz_answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    telegram_id BIGINT NOT NULL,
    question_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    answer_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_quiz_answers_telegram_id ON quiz_answers(telegram_id);

-- Функция для обновления статуса квиза (вызывается вручную)
CREATE OR REPLACE FUNCTION complete_quiz_for_user(p_telegram_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Обновляем статус пользователя
    UPDATE users 
    SET quiz_completed = true 
    WHERE telegram_id = p_telegram_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Даем права
GRANT ALL ON quiz_answers TO anon;
GRANT EXECUTE ON FUNCTION complete_quiz_for_user(BIGINT) TO anon;

-- Включаем Realtime (только если еще не включен)
-- ALTER PUBLICATION supabase_realtime ADD TABLE quiz_answers;
