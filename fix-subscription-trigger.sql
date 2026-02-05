-- Исправление бесконечной рекурсии триггера подписки
-- Выполните этот код в Supabase SQL Editor

-- Удаляем триггер, который вызывал бесконечную рекурсию
DROP TRIGGER IF EXISTS check_subscriptions_trigger ON public.users;

-- Удаляем функцию триггера
DROP FUNCTION IF EXISTS public.trigger_check_subscriptions();

-- Функция check_and_update_expired_subscriptions() остается и может вызываться вручную через API
-- Она уже вызывается в api/admin.js при обновлении подписки
