const { createClient } = require('@supabase/supabase-js');
const { analyzePhotoWithKimi } = require('../supabase/kimiClient.js');

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

// Поддерживаемые типы файлов
const SUPPORTED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

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

  // 🔧 ВАЖНО: Очищаем filePath от небезопасных символов
  function sanitizePath(path) {
    return path
      .split('/') // Разделяем на части
      .map(part => {
        // Очищаем каждую часть пути
        return part
          .replace(/[^a-zA-Z0-9._\-]/g, '_') // Спецсимволы → _
          .replace(/_+/g, '_') // Множественные _ → один _
          .toLowerCase();
      })
      .join('/'); // Собираем обратно
  }

  const cleanFilePath = sanitizePath(filePath);
  console.log('Original filePath:', filePath);
  console.log('Cleaned filePath:', cleanFilePath);

  // Создаем signed URL для загрузки файла в Supabase Storage
  const { data, error } = await supabaseAdmin.storage
    .from('analysis-photos')
    .createSignedUploadUrl(cleanFilePath, 60 * 5); // URL действителен 5 минут

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
    .getPublicUrl(cleanFilePath);

  console.log('Upload URL created successfully');

  return res.status(200).json({
    success: true,
    uploadUrl: data.signedUrl,
    publicUrl: publicUrl,
    filePath: cleanFilePath
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
    // Загрузка новой фотографии или PDF
    const { photo_url, photo_name, file_size, analysis_group, description, file_type } = req.body;

    console.log('=== POST /api/analysis-photos ===');
    console.log('Request body:', { photo_url, photo_name, file_size, analysis_group, file_type, description });
    console.log('Telegram user data:', telegramUser);

    if (!photo_url || !analysis_group) {
      console.log('❌ Missing required fields:', { photo_url, analysis_group });
      return res.status(400).json({ 
        success: false, 
        error: 'photo_url and analysis_group are required' 
      });
    }

    // Определяем тип файла
    const fileExtension = photo_name ? '.' + photo_name.split('.').pop().toLowerCase() : null;
    const fileTypeToUse = file_type || (fileExtension && SUPPORTED_EXTENSIONS.includes(fileExtension) ? 
      (fileExtension === '.pdf' ? 'application/pdf' : 'image/jpeg') : 'image/jpeg');
    
    const isPdf = fileTypeToUse === 'application/pdf' || fileExtension === '.pdf';
    
    if (!SUPPORTED_FILE_TYPES.includes(fileTypeToUse) && !isPdf) {
      console.log('❌ Unsupported file type:', fileTypeToUse);
      return res.status(400).json({ 
        success: false, 
        error: 'Unsupported file type. Supported: ' + SUPPORTED_EXTENSIONS.join(', ') 
      });
    }
    
    console.log(`📄 File type detected: ${isPdf ? 'PDF' : 'IMAGE'}`);

    if (!ANALYSIS_GROUPS.includes(analysis_group)) {
      console.log('❌ Invalid analysis group:', analysis_group);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid analysis_group',
        valid_groups: ANALYSIS_GROUPS
      });
    }

    console.log('✅ Validation passed, prepared for Kimi analysis...');

    // 🎯 ИНТЕГРАЦИЯ KIMI: Временно отключено для тестирования загрузки
    // Просто сохраняем файл без анализа Kimi
    let analysisDescription = description || '[Анализ будет доступен после настройки Kimi API]';
    
    // TODO: Включить после настройки Kimi
    /*
    try {
      console.log(`🤖 Запускаем Kimi для анализа "${analysis_group}" (${isPdf ? 'PDF' : 'IMAGE'})...`);
      analysisDescription = await analyzePhotoWithKimi(photo_url, analysis_group, isPdf);
      console.log(`✅ Kimi завершил анализ на ${analysisDescription.length} символов`);
    } catch (kimiError) {
      console.error('⚠️  Ошибка в Kimi API, но продолжаем:', kimiError.message);
      analysisDescription = `[Ошибка анализа Kimi: ${kimiError.message}]`;
    }
    */
    
    console.log('⏭️  Kimi анализ временно отключен, файл сохраняется в БД');

    console.log('✅ Saving to database with description...');

    // Сохраняем файл в базу с описанием от Kimi
    const { data, error } = await supabase
      .from('user_analysis_photos')
      .insert({
        telegram_id: telegramId,
        photo_url,
        photo_name: photo_name || (isPdf ? 'PDF анализа' : 'Фото анализа'),
        file_size: file_size || 0,
        analysis_group,
        description: analysisDescription, // Сохраняем описание от Kimi
        file_type: isPdf ? 'pdf' : 'image' // Тип файла для различения
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

    // Обновляем статус analyses_uploaded на TRUE
    await supabase
      .from('users')
      .update({ analyses_uploaded: true })
      .eq('telegram_id', telegramId);

    console.log('✅ analyses_uploaded status set to TRUE');

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

    console.log('📊 Remaining photos count:', count);

    // Обновляем флаг в users если фото не осталось
    if (count === 0) {
      await supabase
        .from('users')
        .update({ analyses_uploaded: false })
        .eq('telegram_id', telegramId);
      console.log('✅ analyses_uploaded status set to FALSE (no photos left)');
    }

    return res.status(200).json({
      success: true,
      message: 'Фото успешно удалено',
      remaining_photos: count
    });
  }
}
