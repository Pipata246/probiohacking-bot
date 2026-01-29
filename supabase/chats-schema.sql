-- Схема для системы чатов
-- Добавляем таблицы для управления чатами

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

-- 2. Обновляем таблицу user_requests для связи с чатами
ALTER TABLE user_requests ADD COLUMN IF NOT EXISTS chat_id UUID REFERENCES chats(id) ON DELETE CASCADE;

-- 3. Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_user_active ON chats(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_requests_chat_id ON user_requests(chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);

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
        -- Используем существующую функцию или создаем пользователя
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
    UPDATE chat_stats(chat_id);
    
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

-- 9. Функция для получения сообщений чата
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
