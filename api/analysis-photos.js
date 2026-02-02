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

// Supabase admin client for file uploads
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
);

// Предопределенные группы анализов
const ANALYSIS_GROUPS = [
  'Анализ крови',
  'Гормоны',
  'Витамины',
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
    // Роутинг по методам и action
    const { action } = req.query;
    
    if (action === 'upload-url') {
      // Получение URL для загрузки файла
      return handleUploadUrl(req, res);
    } else {
      // Управление фото в БД
      return handleAnalysisPhotos(req, res);
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

// Обработка получения URL для загрузки
async function handleUploadUrl(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { fileName, fileType, fileSize, filePath } = req.body;

  if (!fileName || !fileType || !filePath) {
    return res.status(400).json({ 
      success: false, 
      error: 'fileName, fileType, and filePath are required' 
    });
  }

  console.log('Creating upload URL for:', filePath);

  // Создаем signed URL для загрузки файла в Supabase Storage
  const { data, error } = await supabaseAdmin.storage
    .from('analysis-photos')
    .createSignedUploadUrl(filePath, 60 * 5); // URL действителен 5 минут

  if (error) {
    console.error('Error creating signed upload URL:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to create upload URL',
      details: error.message 
    });
  }

  // Получаем public URL для файла
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('analysis-photos')
    .getPublicUrl(filePath);

  console.log('Upload URL created successfully');

  return res.status(200).json({
    success: true,
    uploadUrl: data.signedUrl,
    publicUrl: publicUrl,
    filePath: filePath
  });
}

// Управление фото в БД
async function handleAnalysisPhotos(req, res) {
  if (!['POST', 'GET', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Для GET запросов получаем telegram ID из заголовка
  if (req.method === 'GET') {
    const telegramData = req.headers['x-telegram-webapp-data'];
    
    let telegramId = null;
    if (telegramData) {
      try {
        const urlParams = new URLSearchParams(telegramData);
        const userStr = urlParams.get('user');
        if (userStr) {
          const user = JSON.parse(decodeURIComponent(userStr));
          telegramId = user.id;
        }
      } catch (e) {
        console.error('Error parsing telegram data:', e);
      }
    }
    
    if (!telegramId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Telegram ID is required' 
      });
    }
    
    console.log('📋 GET /api/analysis-photos for telegram_id:', telegramId);
    
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

    console.log('✅ Found photos:', data?.length || 0);

    return res.status(200).json({
      success: true,
      photos: data || [],
      total: data?.length || 0
    });
  }

  // Для POST и DELETE запросов получаем данные из body
  const { telegramUser } = req.body || {};

  if (!telegramUser || !telegramUser.id) {
    return res.status(400).json({ success: false, error: 'Telegram user data required' });
  }

  const telegramId = telegramUser.id;

  if (req.method === 'POST') {
    // Загрузка новой фотографии
    const { photo_url, photo_name, file_size, analysis_group, description } = req.body;

    console.log('=== POST /api/analysis-photos ===');
    console.log('Request body:', { photo_url, photo_name, file_size, analysis_group, description });
    console.log('Telegram user data:', telegramUser);

    if (!photo_url || !analysis_group) {
      console.log('❌ Missing required fields:', { photo_url, analysis_group });
      return res.status(400).json({ 
        success: false, 
        error: 'photo_url and analysis_group are required' 
      });
    }

    if (!ANALYSIS_GROUPS.includes(analysis_group)) {
      console.log('❌ Invalid analysis group:', analysis_group);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid analysis_group',
        valid_groups: ANALYSIS_GROUPS
      });
    }

    console.log('✅ Validation passed, saving to database...');

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
      console.error('❌ Database error:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to save photo',
        details: error.message 
      });
    }

    console.log('✅ Photo saved successfully:', data);

    return res.status(200).json({
      success: true,
      photo: data,
      message: 'Фото успешно загружено'
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
}
