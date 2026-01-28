-- Исправление RLS проблем для Supabase
-- Отключаем RLS и упрощаем доступ

-- Отключаем RLS для таблиц (временно для теста)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_requests DISABLE ROW LEVEL SECURITY;

-- Удаляем политики (если они есть)
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can view own requests" ON user_requests;

-- Даем публичный доступ на чтение/запись (временно!)
-- В проде нужно будет настроить правильную аутентификацию

GRANT ALL ON users TO anon;
GRANT ALL ON user_requests TO anon;
GRANT ALL ON users TO authenticated;
GRANT ALL ON user_requests TO authenticated;

-- Обновляем последовательности если нужно
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE user_requests_id_seq RESTART WITH 1;
