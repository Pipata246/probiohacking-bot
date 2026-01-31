-- Создание таблицы для хранения фотографий анализов
CREATE TABLE IF NOT EXISTS user_analysis_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  photo_url TEXT NOT NULL,
  photo_name TEXT,
  file_size INTEGER,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  analysis_group TEXT NOT NULL, -- Группа анализа: "Общий анализ крови", "Биохимия", "Гормоны" и т.д.
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Добавление индексов для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_user_analysis_photos_telegram_id ON user_analysis_photos(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_analysis_photos_group ON user_analysis_photos(analysis_group);
CREATE INDEX IF NOT EXISTS idx_user_analysis_photos_upload_date ON user_analysis_photos(upload_date);

-- Добавление колонки в таблицу users для отслеживания загруженных анализов
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS analyses_uploaded BOOLEAN DEFAULT FALSE;

-- RLS политики для таблицы фотографий
ALTER TABLE user_analysis_photos ENABLE ROW LEVEL SECURITY;

-- Политика для чтения своих фотографий
CREATE POLICY "Users can view their own analysis photos" ON user_analysis_photos
  FOR SELECT USING (
    auth.uid()::text = telegram_id::text
  );

-- Политика для вставки своих фотографий  
CREATE POLICY "Users can insert their own analysis photos" ON user_analysis_photos
  FOR INSERT WITH CHECK (
    auth.uid()::text = telegram_id::text
  );

-- Политика для обновления своих фотографий
CREATE POLICY "Users can update their own analysis photos" ON user_analysis_photos
  FOR UPDATE USING (
    auth.uid()::text = telegram_id::text
  );

-- Политика для удаления своих фотографий
CREATE POLICY "Users can delete their own analysis photos" ON user_analysis_photos
  FOR DELETE USING (
    auth.uid()::text = telegram_id::text
  );

-- Создание функции для обновления флага analyses_uploaded
CREATE OR REPLACE FUNCTION update_analyses_uploaded_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- Обновляем флаг в таблице users при добавлении фото
  UPDATE users 
  SET analyses_uploaded = TRUE 
  WHERE telegram_id = NEW.telegram_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создание триггера для автоматического обновления флага
DROP TRIGGER IF EXISTS trigger_update_analyses_uploaded ON user_analysis_photos;
CREATE TRIGGER trigger_update_analyses_uploaded
  AFTER INSERT ON user_analysis_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_analyses_uploaded_flag();

-- Создание функции для получения фотографий пользователя
CREATE OR REPLACE FUNCTION get_user_analysis_photos(p_telegram_id BIGINT)
RETURNS TABLE (
  id UUID,
  photo_url TEXT,
  photo_name TEXT,
  file_size INTEGER,
  upload_date TIMESTAMP WITH TIME ZONE,
  analysis_group TEXT,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ap.id,
    ap.photo_url,
    ap.photo_name,
    ap.file_size,
    ap.upload_date,
    ap.analysis_group,
    ap.description
  FROM user_analysis_photos ap
  WHERE ap.telegram_id = p_telegram_id
  ORDER BY ap.upload_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
