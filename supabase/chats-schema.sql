-- Исправленная схема для системы чатов
-- Без синтаксических ошибок

-- 1. Таблица чатов
CREATE TABLE IF NOT EXISTS chats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'Новый чат',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true, -- Текущий активный чат пользователя
    message_count INTEGER DEFAULT 0,
    context_tokens INTEGER DEFAULT 0,
    auto_created BOOLEAN DEFAULT false -- Создан автоматически при переполнении
);

-- 2. Обновляем таблицу users - добавляем статус прохождения квиза
ALTER TABLE users ADD COLUMN IF NOT EXISTS quiz_completed BOOLEAN DEFAULT false;

-- 3. Новая таблица для результатов квиза
CREATE TABLE IF NOT EXISTS quiz_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE, -- Один результат на пользователя
    age INTEGER,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    weight DECIMAL(5,2), -- в кг
    height DECIMAL(5,2), -- в см
    activity_level TEXT CHECK (activity_level IN ('low', 'moderate', 'high')),
    goals TEXT[], -- массив целей: ['weight_loss', 'muscle_gain', 'health', 'energy']
    health_concerns TEXT[], -- массив проблем: ['digestion', 'sleep', 'stress', 'immunity']
    dietary_preferences TEXT[], -- массив предпочтений: ['vegetarian', 'vegan', 'gluten_free', 'dairy_free']
    supplements TEXT[], -- текущие добавки
    medications TEXT[], -- текущие лекарства
    sleep_hours DECIMAL(3,1),
    stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 10),
    energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 10),
    digestion_quality TEXT CHECK (digestion_quality IN ('poor', 'fair', 'good', 'excellent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Обновляем таблицу user_requests для связи с чатами
ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES chats(id) ON DELETE CASCADE;

-- 5. Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_user_active ON chats(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_requests_chat_id ON user_requests(chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_users_quiz_completed ON users(quiz_completed);

-- 6. Функция для сохранения/обновления результатов квиза
CREATE OR REPLACE FUNCTION save_quiz_results(
    p_user_id UUID,
    p_age INTEGER,
    p_gender TEXT,
    p_weight DECIMAL(5,2),
    p_height DECIMAL(5,2),
    p_activity_level TEXT,
    p_goals TEXT[],
    p_health_concerns TEXT[],
    p_dietary_preferences TEXT[],
    p_supplements TEXT[],
    p_medications TEXT[],
    p_sleep_hours DECIMAL(3,1),
    p_stress_level INTEGER,
    p_energy_level INTEGER,
    p_digestion_quality TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Вставляем или обновляем результаты квиза
    INSERT INTO quiz_results (
        user_id, age, gender, weight, height, activity_level,
        goals, health_concerns, dietary_preferences, supplements,
        medications, sleep_hours, stress_level, energy_level,
        digestion_quality, updated_at
    ) VALUES (
        p_user_id, p_age, p_gender, p_weight, p_height, p_activity_level,
        p_goals, p_health_concerns, p_dietary_preferences, p_supplements,
        p_medications, p_sleep_hours, p_stress_level, p_energy_level,
        p_digestion_quality, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        weight = EXCLUDED.weight,
        height = EXCLUDED.height,
        activity_level = EXCLUDED.activity_level,
        goals = EXCLUDED.goals,
        health_concerns = EXCLUDED.health_concerns,
        dietary_preferences = EXCLUDED.dietary_preferences,
        supplements = EXCLUDED.supplements,
        medications = EXCLUDED.medications,
        sleep_hours = EXCLUDED.sleep_hours,
        stress_level = EXCLUDED.stress_level,
        energy_level = EXCLUDED.energy_level,
        digestion_quality = EXCLUDED.digestion_quality,
        updated_at = NOW();
    
    -- Обновляем статус прохождения квиза у пользователя
    UPDATE users SET quiz_completed = true WHERE id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 7. Функция для получения результатов квиза с контекстом для ИИ
CREATE OR REPLACE FUNCTION get_user_quiz_context(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    result_text TEXT;
BEGIN
    SELECT 
        'Пользовательские данные для контекста: ' ||
        'Возраст: ' || COALESCE(age::TEXT, 'не указан') || ', ' ||
        'Пол: ' || COALESCE(gender, 'не указан') || ', ' ||
        'Вес: ' || COALESCE(weight::TEXT, 'не указан') || 'кг, ' ||
        'Рост: ' || COALESCE(height::TEXT, 'не указан') || 'см, ' ||
        'Уровень активности: ' || COALESCE(activity_level, 'не указан') || ', ' ||
        'Цели: ' || COALESCE(array_to_string(goals, ', '), 'не указаны') || ', ' ||
        'Проблемы со здоровьем: ' || COALESCE(array_to_string(health_concerns, ', '), 'не указаны') || ', ' ||
        'Пищевые предпочтения: ' || COALESCE(array_to_string(dietary_preferences, ', '), 'не указаны') || ', ' ||
        'Часы сна: ' || COALESCE(sleep_hours::TEXT, 'не указано') || ', ' ||
        'Уровень стресса: ' || COALESCE(stress_level::TEXT, 'не указан') || '/10, ' ||
        'Уровень энергии: ' || COALESCE(energy_level::TEXT, 'не указан') || '/10, ' ||
        'Качество пищеварения: ' || COALESCE(digestion_quality, 'не указано')
    INTO result_text
    FROM quiz_results
    WHERE user_id = p_user_id;
    
    RETURN COALESCE(result_text, 'Нет данных квиза');
END;
$$ LANGUAGE plpgsql;

-- 8. Функция для проверки статуса квиза пользователя
CREATE OR REPLACE FUNCTION check_user_quiz_status(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE((SELECT quiz_completed FROM users WHERE id = p_user_id), false);
END;
$$ LANGUAGE plpgsql;

-- 9. Realtime подписки для таблиц
-- Включаем Realtime для таблиц
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE quiz_results;

-- Нормализуем данные: оставляем активным только самый свежий чат на пользователя
WITH latest_active AS (
  SELECT DISTINCT ON (user_id) id, user_id
  FROM chats
  WHERE is_active = true
  ORDER BY user_id, updated_at DESC
)
UPDATE chats c
SET is_active = false
WHERE c.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM latest_active la
    WHERE la.id = c.id
  );

-- Права доступа
GRANT ALL ON quiz_results TO anon;
GRANT EXECUTE ON FUNCTION save_quiz_results TO anon;
GRANT EXECUTE ON FUNCTION get_user_quiz_context TO anon;
GRANT EXECUTE ON FUNCTION check_user_quiz_status TO anon;

-- Гарантия: у пользователя может быть только 1 активный чат
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_one_active_per_user
  ON chats(user_id)
  WHERE is_active = true;

-- Автообновление updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chats_set_updated_at ON chats;
CREATE TRIGGER trg_chats_set_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Обновляем message_count при вставке нового запроса
CREATE OR REPLACE FUNCTION chat_increment_message_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chats
  SET message_count = message_count + 1,
      updated_at = NOW()
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_increment_message_count ON user_requests;
CREATE TRIGGER trg_chat_increment_message_count
  AFTER INSERT ON user_requests
  FOR EACH ROW
  WHEN (NEW.chat_id IS NOT NULL)
  EXECUTE FUNCTION chat_increment_message_count();

-- 4. Функция для создания нового чата
CREATE OR REPLACE FUNCTION create_chat(
    p_user_id UUID,
    p_title TEXT DEFAULT 'Новый чат',
    p_is_active BOOLEAN DEFAULT true,
    p_auto_created BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    new_chat_id UUID;
BEGIN
    -- Деактивируем предыдущие активные чаты пользователя
    UPDATE chats 
    SET is_active = false 
    WHERE user_id = p_user_id AND is_active = true;
    
    -- Создаем новый чат
    INSERT INTO chats (user_id, title, is_active, auto_created)
    VALUES (p_user_id, p_title, p_is_active, p_auto_created)
    RETURNING id INTO new_chat_id;
    
    RETURN new_chat_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Функция для получения активного чата пользователя
CREATE OR REPLACE FUNCTION get_active_chat(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    active_chat_id UUID;
BEGIN
    SELECT id INTO active_chat_id
    FROM chats 
    WHERE user_id = p_user_id AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1;
    
    RETURN active_chat_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Функция для обновления статистики чата
CREATE OR REPLACE FUNCTION update_chat_stats(p_chat_id UUID)
RETURNS VOID AS $$
DECLARE
    msg_count INTEGER;
BEGIN
    -- Считаем сообщения в чате
    SELECT COUNT(*) INTO msg_count
    FROM user_requests 
    WHERE chat_id = p_chat_id;
    
    -- Обновляем статистику
    UPDATE chats 
    SET 
        message_count = msg_count,
        updated_at = NOW()
    WHERE id = p_chat_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Функция для сохранения запроса с привязкой к чату
CREATE OR REPLACE FUNCTION save_request_to_chat(
    p_telegram_id BIGINT,
    p_message_text TEXT,
    p_response_text TEXT DEFAULT NULL,
    p_request_type TEXT DEFAULT 'chat',
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_chat_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    user_id UUID;
    chat_id UUID;
    new_request_id UUID;
BEGIN
    -- Находим ID пользователя
    SELECT id INTO user_id 
    FROM users 
    WHERE telegram_id = p_telegram_id;
    
    -- Если пользователь не найден, создаем его
    IF user_id IS NULL THEN
        INSERT INTO users (telegram_id, first_name, last_name, username, language_code)
        VALUES (p_telegram_id, 'User', NULL, NULL, 'ru')
        RETURNING id INTO user_id;
    END IF;
    
    -- Если chat_id не указан, получаем активный чат
    IF p_chat_id IS NULL THEN
        chat_id := get_active_chat(user_id);
        
        -- Если активного чата нет, создаем новый
        IF chat_id IS NULL THEN
            chat_id := create_chat(user_id, 'Новый чат', true, false);
        END IF;
    ELSE
        chat_id := p_chat_id;
    END IF;
    
    -- Создаем запрос
    INSERT INTO user_requests (
        user_id,
        chat_id,
        message_text,
        response_text,
        request_type,
        metadata
    )
    VALUES (
        user_id,
        chat_id,
        p_message_text,
        p_response_text,
        p_request_type,
        p_metadata
    )
    RETURNING id INTO new_request_id;
    
    -- Обновляем статистику чата
    PERFORM update_chat_stats(chat_id);
    
    RETURN new_request_id;
EXCEPTION
    WHEN OTHERS THEN
    RAISE NOTICE 'Error in save_request_to_chat: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 8. Функция для получения списка чатов пользователя
CREATE OR REPLACE FUNCTION get_user_chats(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    message_count INTEGER,
    is_active BOOLEAN,
    auto_created BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        c.message_count,
        c.is_active,
        c.auto_created
    FROM chats c
    WHERE c.user_id = p_user_id
    ORDER BY c.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 9. Функция для получения сообщений чата (исправленная)
CREATE OR REPLACE FUNCTION get_chat_messages(p_chat_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
    id UUID,
    message_text TEXT,
    response_text TEXT,
    request_type TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.id,
        ur.message_text,
        ur.response_text,
        ur.request_type,
        ur.metadata,
        ur.created_at   
    FROM user_requests ur
    WHERE ur.chat_id = p_chat_id
    ORDER BY ur.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 10. Даем права на выполнение функций
GRANT EXECUTE ON FUNCTION create_chat(UUID, TEXT, BOOLEAN, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION get_active_chat(UUID) TO anon;
GRANT EXECUTE ON FUNCTION update_chat_stats(UUID) TO anon;
GRANT EXECUTE ON FUNCTION save_request_to_chat(BIGINT, TEXT, TEXT, TEXT, JSONB, UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_user_chats(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_chat_messages(UUID, INTEGER) TO anon;
