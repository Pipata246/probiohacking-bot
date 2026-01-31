const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
);

// Предопределенные группы анализов
const ANALYSIS_GROUPS = [
  'Общий анализ крови',
  'Биохимический анализ',
  'Гормональный профиль',
  'Маркеры воспаления',
  'Витамины и микроэлементы',
  'Липидный профиль',
  'Печеночные пробы',
  'Почечные пробы',
  'Сахарный диабет',
  'Щитовидная железа',
  'Онкомаркеры',
  'Аллергология',
  'Иммунология',
  'Другое'
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { telegramUser, telegramWebAppData } = req.body || {};

    if (!telegramUser || !telegramUser.id) {
      return res.status(400).json({ success: false, error: 'Telegram user data required' });
    }

    const telegramId = telegramUser.id;

    if (req.method === 'POST') {
      // Загрузка новой фотографии
      const { photo_url, photo_name, file_size, analysis_group, description } = req.body;

      if (!photo_url || !analysis_group) {
        return res.status(400).json({ 
          success: false, 
          error: 'photo_url and analysis_group are required' 
        });
      }

      if (!ANALYSIS_GROUPS.includes(analysis_group)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid analysis_group',
          valid_groups: ANALYSIS_GROUPS
        });
      }

      // Сохраняем фото в базу
      const { data, error } = await supabase
        .from('user_analysis_photos')
        .insert({
          telegram_id: telegramId,
          photo_url,
          photo_name: photo_name || 'Фото анализа',
          file_size: file_size || 0,
          analysis_group,
          description: description || ''
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving photo:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to save photo',
          details: error.message 
        });
      }

      return res.status(200).json({
        success: true,
        photo: data,
        message: 'Фото успешно загружено'
      });

    } else if (req.method === 'GET') {
      // Получение списка фотографий пользователя
      const { data, error } = await supabase
        .from('user_analysis_photos')
        .select('*')
        .eq('telegram_id', telegramId)
        .order('upload_date', { ascending: false });

      if (error) {
        console.error('Error fetching photos:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch photos',
          details: error.message 
        });
      }

      // Группируем фото по категориям
      const groupedPhotos = {};
      data.forEach(photo => {
        if (!groupedPhotos[photo.analysis_group]) {
          groupedPhotos[photo.analysis_group] = [];
        }
        groupedPhotos[photo.analysis_group].push(photo);
      });

      return res.status(200).json({
        success: true,
        photos: data,
        groupedPhotos,
        total: data.length,
        groups: ANALYSIS_GROUPS
      });

    } else if (req.method === 'DELETE') {
      // Удаление фотографии
      const { photo_id } = req.body;

      if (!photo_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'photo_id is required' 
        });
      }

      // Проверяем что фото принадлежит пользователю
      const { data: photoData, error: fetchError } = await supabase
        .from('user_analysis_photos')
        .select('*')
        .eq('id', photo_id)
        .eq('telegram_id', telegramId)
        .single();

      if (fetchError || !photoData) {
        return res.status(404).json({ 
          success: false, 
          error: 'Photo not found or access denied' 
        });
      }

      // Удаляем фото
      const { error: deleteError } = await supabase
        .from('user_analysis_photos')
        .delete()
        .eq('id', photo_id)
        .eq('telegram_id', telegramId);

      if (deleteError) {
        console.error('Error deleting photo:', deleteError);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to delete photo',
          details: deleteError.message 
        });
      }

      // Проверяем остались ли еще фото у пользователя
      const { count } = await supabase
        .from('user_analysis_photos')
        .select('*', { count: 'exact', head: true })
        .eq('telegram_id', telegramId);

      // Обновляем флаг в users если фото не осталось
      if (count === 0) {
        await supabase
          .from('users')
          .update({ analyses_uploaded: false })
          .eq('telegram_id', telegramId);
      }

      return res.status(200).json({
        success: true,
        message: 'Фото успешно удалено',
        remaining_photos: count
      });
    }

  } catch (error) {
    console.error('Analysis photos API Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
