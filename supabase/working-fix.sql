-- ПРОСТОЕ РАБОЧЕЕ РЕШЕНИЕ БЕЗ RLS
-- Отключаем всю безопасность и возвращаемся к рабочему состоянию

-- 1. Отключаем RLS полностью
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_requests DISABLE ROW LEVEL SECURITY;

-- 2. Удаляем все политики
DROP POLICY IF EXISTS "Allow all operations on users" ON users;
DROP POLICY IF EXISTS "Allow all operations on requests" ON user_requests;

-- 3. Удаляем все RPC функции
DROP FUNCTION IF EXISTS create_user_if_not_exists(BIGINT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS save_user_request(BIGINT, TEXT, TEXT, TEXT, JSONB);

-- 4. Даем полные права anon
GRANT ALL ON users TO anon;
GRANT ALL ON user_requests TO anon;

-- 5. Проверка
SELECT 'Tables configured for direct access' as status;
