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

-- Проверяем права доступа
SELECT 
    schemaname,
    tablename,
    tableowner,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'user_requests');
