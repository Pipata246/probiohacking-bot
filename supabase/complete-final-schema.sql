-- ============================================
-- ФИНАЛЬНАЯ ПОЛНАЯ СХЕМА БАЗЫ ДАННЫХ
-- Проверено по всем файлам API - все функции работают
-- 
-- ВАЖНО: Таблица quiz_results НЕ используется в проекте
-- Все ответы квиза сохраняются в таблицу quiz_answers
-- ИИ получает данные из quiz_answers для консультаций
--
-- ИНТЕГРАЦИЯ KIMI:
-- - при загрузке фото анализа: Kimi описывает анализ → сохраняется в description
-- - при чате: если description = NULL → Kimi анализирует параллельно с DeepSeek
-- - если description заполнена → используется тот же текст (кэш)
-- ============================================

-- ============================================
-- 0. УДАЛЕНИЕ ЛИШНИХ ОБЪЕКТОВ (если существуют)
-- ============================================

-- Безопасное удаление всех объектов связанных с quiz_results
DO $$ 
BEGIN
  -- Удаляем триггеры (если таблица существует)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quiz_results') THEN
    DROP TRIGGER IF EXISTS update_quiz_results_updated_at ON public.quiz_results CASCADE;
  END IF;
  
  -- Удаляем таблицу quiz_results если она существует
  DROP TABLE IF EXISTS public.quiz_results CASCADE;
  
  -- Удаляем функции (все варианты сигнатур)
  DROP FUNCTION IF EXISTS public.save_quiz_results CASCADE;
  DROP FUNCTION IF EXISTS public.get_user_quiz_context CASCADE;
  
  -- Удаляем индексы
  DROP INDEX IF EXISTS public.idx_quiz_results_user_id CASCADE;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Ошибка при удалении объектов quiz_results: %', SQLERRM;
END $$;

-- ============================================
-- 1. ТАБЛИЦЫ (точная копия из вашей БД - 5 таблиц)
-- ============================================

CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE,
  first_name text,
  last_name text,
  username text,
  language_code text DEFAULT 'ru'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  quiz_completed boolean DEFAULT false,
  analyses_uploaded boolean DEFAULT false,
  quiz_completion_date timestamp with time zone,
  admin boolean NOT NULL DEFAULT false,
  subscription_active boolean NOT NULL DEFAULT false,
  free_requests_count integer NOT NULL DEFAULT 0,
  subscription_start_date timestamp with time zone,
  subscription_end_date timestamp with time zone,
  program_created boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- Добавляем колонки подписки если таблица уже существует и колонок нет
DO $$ 
BEGIN
  -- Добавляем subscription_active если её нет
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'subscription_active'
  ) THEN
    ALTER TABLE public.users ADD COLUMN subscription_active boolean NOT NULL DEFAULT false;
    RAISE NOTICE 'Добавлена колонка subscription_active';
  END IF;
  
     -- Добавляем free_requests_count если её нет
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'free_requests_count'
     ) THEN
       ALTER TABLE public.users ADD COLUMN free_requests_count integer NOT NULL DEFAULT 0;
       RAISE NOTICE 'Добавлена колонка free_requests_count';
     END IF;
     
     -- Добавляем subscription_start_date если её нет
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'subscription_start_date'
     ) THEN
       ALTER TABLE public.users ADD COLUMN subscription_start_date timestamp with time zone;
       RAISE NOTICE 'Добавлена колонка subscription_start_date';
     END IF;
     
     -- Добавляем subscription_end_date если её нет
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'subscription_end_date'
     ) THEN
       ALTER TABLE public.users ADD COLUMN subscription_end_date timestamp with time zone;
       RAISE NOTICE 'Добавлена колонка subscription_end_date';
     END IF;
     
     -- Добавляем program_created если её нет
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'program_created'
     ) THEN
       ALTER TABLE public.users ADD COLUMN program_created boolean NOT NULL DEFAULT false;
       RAISE NOTICE 'Добавлена колонка program_created (флаг созданной персональной программы)';
     END IF;
     
     -- Добавляем onboarding_completed если её нет
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'users'
       AND column_name = 'onboarding_completed'
     ) THEN
       ALTER TABLE public.users ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
       RAISE NOTICE 'Добавлена колонка onboarding_completed (флаг прохождения инструкции)';
     END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Ошибка при добавлении колонок подписки: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS public.chats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  title text DEFAULT 'Новый чат'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  message_count integer DEFAULT 0,
  context_tokens integer DEFAULT 0,
  auto_created boolean DEFAULT false,
  CONSTRAINT chats_pkey PRIMARY KEY (id),
  CONSTRAINT chats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.quiz_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  telegram_id bigint NOT NULL,
  question_id text NOT NULL,
  question_text text NOT NULL,
  answer_text text NOT NULL,
  answer_value text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quiz_answers_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_question UNIQUE (telegram_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.user_analysis_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  photo_url text NOT NULL,
  photo_name text,
  file_size integer,
  upload_date timestamp with time zone DEFAULT now(),
  analysis_group text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  CONSTRAINT user_analysis_photos_pkey PRIMARY KEY (id),
  CONSTRAINT fk_user FOREIGN KEY (telegram_id) REFERENCES public.users(telegram_id),
  CONSTRAINT user_analysis_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Миграция: убедяемся что колонка description есть для KIMI интеграции
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_analysis_photos' 
    AND column_name = 'description'
  ) THEN
    ALTER TABLE public.user_analysis_photos ADD COLUMN description text;
    RAISE NOTICE 'Добавлена колонка description для кэширования описаний анализов от Kimi';
  ELSE
    RAISE NOTICE 'Колонка description уже существует в user_analysis_photos';
  END IF;
  
  -- Добавляем file_type колонку для различения фото и PDF
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_analysis_photos' 
    AND column_name = 'file_type'
  ) THEN
    ALTER TABLE public.user_analysis_photos ADD COLUMN file_type varchar(10) DEFAULT 'image';
    RAISE NOTICE 'Добавлена колонка file_type для поддержки PDF и фото (image/pdf)';
  ELSE
    RAISE NOTICE 'Колонка file_type уже существует в user_analysis_photos';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Ошибка при добавлении колонок: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS public.user_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  message_text text NOT NULL,
  response_text text,
  request_type text DEFAULT 'chat'::text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  chat_id uuid,
  CONSTRAINT user_requests_pkey PRIMARY KEY (id),
  CONSTRAINT user_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_requests_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE
);

-- Таблица ЗДОРОВЬЕ: агрегированные рекомендации ИИ по 4 ключевым направлениям
CREATE TABLE IF NOT EXISTS public.health_programs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  telegram_id bigint NOT NULL REFERENCES public.users(telegram_id),
  supplements text,           -- Нутрицевтики и добавки (решение проблемы)
  nutrition text,             -- Питание
  stress text,                -- Стресс и управление нагрузкой
  sleep text,                 -- Сон и восстановление
  goals text,                 -- 3 главные цели на ближайший месяц (каждая с новой строки)
  request text,               -- Исходный запрос пользователя, по которому составлена программа
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT health_programs_pkey PRIMARY KEY (id)
);

-- Миграция: добавляем колонку goals, если её ещё нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'health_programs'
      AND column_name = 'goals'
  ) THEN
    ALTER TABLE public.health_programs
      ADD COLUMN goals text;
    RAISE NOTICE 'Добавлена колонка goals в health_programs (3 главные цели на месяц)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'health_programs'
      AND column_name = 'request'
  ) THEN
    ALTER TABLE public.health_programs
      ADD COLUMN request text;
    RAISE NOTICE 'Добавлена колонка request в health_programs (исходный запрос)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Ошибка при добавлении колонки goals в health_programs: %', SQLERRM;
END $$;

-- Таблица ДНЕВНИК: расписание приёмов/действий из персональной программы
CREATE TABLE IF NOT EXISTS public.diary_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  telegram_id bigint NOT NULL REFERENCES public.users(telegram_id),
  entry_date date NOT NULL,
  entry_time time NOT NULL,
  title text NOT NULL,        -- Текст записи (напр. "Магний 400 мг")
  notes text,                 -- Доп. пояснение при необходимости
   request text,              -- Исходный запрос, к которому относится запись дневника
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT diary_entries_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'diary_entries'
      AND column_name = 'request'
  ) THEN
    ALTER TABLE public.diary_entries
      ADD COLUMN request text;
    RAISE NOTICE 'Добавлена колонка request в diary_entries (исходный запрос)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Ошибка при добавлении колонки request в diary_entries: %', SQLERRM;
END $$;

-- ============================================
-- 2. ИНДЕКСЫ (для оптимизации запросов)
-- ============================================

-- Индексы для users
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_quiz_completed ON public.users(quiz_completed);
CREATE INDEX IF NOT EXISTS idx_users_admin ON public.users(admin) WHERE admin = TRUE;

-- Индексы для quiz_answers
CREATE INDEX IF NOT EXISTS idx_quiz_answers_user_id ON public.quiz_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_telegram_id ON public.quiz_answers(telegram_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_question_id ON public.quiz_answers(question_id);

-- Индексы для chats
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_user_active ON public.chats(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON public.chats(updated_at DESC);
-- Уникальный индекс для одного активного чата на пользователя (важно для логики чатов)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_one_active_per_user ON public.chats(user_id) WHERE is_active = TRUE;

-- Индексы для user_requests
CREATE INDEX IF NOT EXISTS idx_user_requests_user_id ON public.user_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_chat_id ON public.user_requests(chat_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_created_at ON public.user_requests(created_at DESC);

-- Индексы для user_analysis_photos
CREATE INDEX IF NOT EXISTS idx_user_analysis_photos_user_id ON public.user_analysis_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analysis_photos_telegram_id ON public.user_analysis_photos(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_analysis_photos_group ON public.user_analysis_photos(analysis_group);
CREATE INDEX IF NOT EXISTS idx_user_analysis_photos_upload_date ON public.user_analysis_photos(upload_date DESC);

-- ============================================
-- 3. ФУНКЦИИ ДЛЯ ОБНОВЛЕНИЯ TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. ТРИГГЕРЫ ДЛЯ UPDATED_AT
-- ============================================

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quiz_answers_updated_at ON public.quiz_answers;
CREATE TRIGGER update_quiz_answers_updated_at
  BEFORE UPDATE ON public.quiz_answers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_analysis_photos_updated_at ON public.user_analysis_photos;
CREATE TRIGGER update_user_analysis_photos_updated_at
  BEFORE UPDATE ON public.user_analysis_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_chats_set_updated_at ON public.chats;
CREATE TRIGGER trg_chats_set_updated_at
  BEFORE UPDATE ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================
-- 5. ФУНКЦИИ ДЛЯ РАБОТЫ С ЧАТАМИ (используется в api/chat.js через RPC)
-- ============================================

CREATE OR REPLACE FUNCTION get_active_chat(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    active_chat_id UUID;
BEGIN
    SELECT id INTO active_chat_id
    FROM public.chats 
    WHERE user_id = p_user_id AND is_active = TRUE
    ORDER BY updated_at DESC
    LIMIT 1;
    
    RETURN active_chat_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. ТРИГГЕРЫ ДЛЯ АВТОМАТИЧЕСКИХ ОБНОВЛЕНИЙ
-- ============================================

-- Триггер для обновления счетчика сообщений в чате (используется в api/chat.js)
CREATE OR REPLACE FUNCTION chat_increment_message_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chats
  SET message_count = message_count + 1,
      updated_at = NOW()
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_increment_message_count ON public.user_requests;
CREATE TRIGGER trg_chat_increment_message_count
  AFTER INSERT ON public.user_requests
  FOR EACH ROW
  WHEN (NEW.chat_id IS NOT NULL)
  EXECUTE FUNCTION chat_increment_message_count();

-- Триггер для обновления флага analyses_uploaded при добавлении фото (используется в api/analysis-photos.js)
CREATE OR REPLACE FUNCTION update_analyses_uploaded_flag()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users 
  SET analyses_uploaded = TRUE 
  WHERE telegram_id = NEW.telegram_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_analyses_uploaded ON public.user_analysis_photos;
CREATE TRIGGER trigger_update_analyses_uploaded
  AFTER INSERT ON public.user_analysis_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_analyses_uploaded_flag();

-- ============================================
-- 7. ROW LEVEL SECURITY (RLS) - ОТКЛЮЧЕНО
-- ============================================

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_analysis_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_programs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_entries DISABLE ROW LEVEL SECURITY;

-- Удаляем все существующие политики если они есть
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can view own requests" ON public.user_requests;
DROP POLICY IF EXISTS "Users can view their own analysis photos" ON public.user_analysis_photos;
DROP POLICY IF EXISTS "Users can insert their own analysis photos" ON public.user_analysis_photos;
DROP POLICY IF EXISTS "Users can update their own analysis photos" ON public.user_analysis_photos;
DROP POLICY IF EXISTS "Users can delete their own analysis photos" ON public.user_analysis_photos;
DROP POLICY IF EXISTS "Allow all operations on users" ON public.users;
DROP POLICY IF EXISTS "Allow all operations on requests" ON public.user_requests;

-- ============================================
-- 8. ПРАВА ДОСТУПА (GRANTS)
-- ============================================

-- Полные права для anon пользователя
GRANT ALL ON public.users TO anon;
GRANT ALL ON public.user_requests TO anon;
GRANT ALL ON public.chats TO anon;
GRANT ALL ON public.quiz_answers TO anon;
GRANT ALL ON public.user_analysis_photos TO anon;
GRANT ALL ON public.health_programs TO anon;
GRANT ALL ON public.diary_entries TO anon;

-- Права на выполнение функций
GRANT EXECUTE ON FUNCTION get_active_chat(UUID) TO anon;
GRANT EXECUTE ON FUNCTION update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION chat_increment_message_count() TO anon;
GRANT EXECUTE ON FUNCTION update_analyses_uploaded_flag() TO anon;

-- Права на использование последовательностей (для gen_random_uuid)
GRANT USAGE ON SCHEMA public TO anon;

-- ============================================
-- 9. КОММЕНТАРИИ К ПОЛЯМ
-- ============================================

COMMENT ON COLUMN public.users.quiz_completed IS 'Статус прохождения диагностики';
COMMENT ON COLUMN public.users.admin IS 'Административные права пользователя';
COMMENT ON COLUMN public.users.quiz_completion_date IS 'Дата прохождения квиза (для проверки истечения через месяц)';
COMMENT ON COLUMN public.users.subscription_active IS 'Статус активной подписки (true = есть подписка, false = бесплатный пользователь)';
COMMENT ON COLUMN public.users.free_requests_count IS 'Количество запросов бесплатного пользователя (максимум 3)';
COMMENT ON COLUMN public.chats.is_active IS 'Активен ли чат (только один активный чат на пользователя)';
COMMENT ON COLUMN public.chats.message_count IS 'Счетчик сообщений в чате (обновляется триггером)';
COMMENT ON COLUMN public.chats.auto_created IS 'Был ли чат создан автоматически при переполнении контекста';
COMMENT ON COLUMN public.quiz_answers.telegram_id IS 'Telegram ID пользователя (для быстрого поиска без JOIN)';
COMMENT ON COLUMN public.user_analysis_photos.analysis_group IS 'Группа анализа: Анализ крови, Гормоны, Витамины, Другое';

-- ============================================
-- 10. STORAGE BUCKET И ПОЛИТИКИ
-- ============================================

-- Создаем bucket для фотографий анализов (если не существует)
-- Публичный bucket для чтения файлов
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('analysis-photos', 'analysis-photos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];

-- Политика 1: Разрешить загрузку файлов всем (через signed URL с SERVICE_ROLE_KEY)
-- ВАЖНО: В коде используется supabaseAdmin с SERVICE_ROLE_KEY, который обходит политики
-- Но политика нужна на случай прямых загрузок через anon key
DROP POLICY IF EXISTS "Allow anon users to upload analysis photos" ON storage.objects;
CREATE POLICY "Allow anon users to upload analysis photos"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'analysis-photos');

-- Политика 2: Разрешить чтение файлов всем (публичный доступ)
DROP POLICY IF EXISTS "Allow public read access to analysis photos" ON storage.objects;
CREATE POLICY "Allow public read access to analysis photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'analysis-photos');

-- Политика 3: Разрешить удаление файлов всем (управление через API с проверкой владельца)
DROP POLICY IF EXISTS "Allow anon users to delete analysis photos" ON storage.objects;
CREATE POLICY "Allow anon users to delete analysis photos"
ON storage.objects
FOR DELETE
TO anon
USING (bucket_id = 'analysis-photos');

-- ============================================
-- ФУНКЦИЯ ДЛЯ ПРОВЕРКИ И ОБНОВЛЕНИЯ СТАТУСА ПОДПИСКИ
-- ============================================

-- Функция для проверки и обновления истекших подписок
-- ВАЖНО: Вызывается вручную через API, НЕ через триггер (чтобы избежать рекурсии)
CREATE OR REPLACE FUNCTION public.check_and_update_expired_subscriptions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Обновляем статус подписки на false для пользователей с истекшей подпиской
  -- Используем прямое обновление без вызова других функций, чтобы избежать рекурсии
  UPDATE public.users
  SET 
    subscription_active = false,
    updated_at = now()
  WHERE 
    subscription_active = true
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < now();
    
  RAISE NOTICE 'Проверка истекших подписок выполнена';
END;
$$;

-- УДАЛЯЕМ ТРИГГЕР - он вызывал бесконечную рекурсию
-- Триггер вызывал функцию при каждом UPDATE на users,
-- функция делала UPDATE на users, что снова вызывало триггер...
DROP TRIGGER IF EXISTS check_subscriptions_trigger ON public.users;
DROP FUNCTION IF EXISTS public.trigger_check_subscriptions();

-- Функция будет вызываться вручную через API при необходимости
-- (например, при обновлении подписки или по расписанию через cron)

-- ============================================
-- КОНЕЦ СКРИПТА
-- ============================================