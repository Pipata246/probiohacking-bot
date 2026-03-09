const { createClient } = require('@supabase/supabase-js');
const { analyzePhotoWithVision } = require('../supabase/visionClient.js');

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

const BUCKET_NAME = 'analysis-photos';

/**
 * Если photo_url — Supabase Storage, возвращаем подписанный URL для надёжной загрузки (в т.ч. приватный бакет)
 */
async function getDownloadUrlForVision(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return photoUrl;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return photoUrl;
  const base = supabaseUrl.replace(/\/$/, '');
  const prefix = `${base}/storage/v1/object/public/${BUCKET_NAME}/`;
  const signedPrefix = `${base}/storage/v1/object/sign/${BUCKET_NAME}/`;
  if (!photoUrl.startsWith(prefix) && !photoUrl.startsWith(signedPrefix)) return photoUrl;
  try {
    const path = photoUrl.startsWith(prefix)
      ? photoUrl.slice(prefix.length).split('?')[0]
      : photoUrl.includes('/sign/')
        ? photoUrl.split(`/sign/${BUCKET_NAME}/`)[1]?.split('?')[0]
        : null;
    if (!path) return photoUrl;
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, 60 * 10); // 10 минут
    if (error || !data?.signedUrl) {
      console.warn('Signed URL creation failed, using original URL:', error?.message);
      return photoUrl;
    }
    return data.signedUrl;
  } catch (e) {
    console.warn('getDownloadUrlForVision error:', e.message);
    return photoUrl;
  }
}

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

  console.log('📥 =========================');
  console.log('📥 handleUploadUrl request:');
  console.log('   fileName:', fileName);
  console.log('   fileType:', fileType);
  console.log('   fileSize:', fileSize);
  console.log('   filePath:', filePath);

  if (!fileName || !fileType || !filePath) {
    console.error('❌ Missing required fields');
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
  console.log('🔧 Cleaned filePath:', cleanFilePath);

  // Проверяем Supabase конфиги
  if (!supabaseAdmin) {
    console.error('❌ Supabase admin client not initialized');
    return res.status(500).json({ 
      success: false, 
      error: 'Server error: Supabase not configured'
    });
  }

  // Создаем signed URL для загрузки файла в Supabase Storage
  console.log('⏳ Creating signed upload URL...');
  const { data, error } = await supabaseAdmin.storage
    .from('analysis-photos')
    .createSignedUploadUrl(cleanFilePath, 60 * 5); // URL действителен 5 минут

  if (error) {
    console.error('❌ Error creating signed upload URL:');
    console.error('   Error type:', error.name);
    console.error('   Error message:', error.message);
    console.error('   Full error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to create upload URL',
      details: error.message,
      hint: 'Check if analysis-photos bucket exists and is public'
    });
  }

  console.log('✅ Signed URL created');

  // Получаем public URL для файла
  console.log('📍 Getting public URL...');
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('analysis-photos')
    .getPublicUrl(cleanFilePath);

  console.log('✅ Public URL:', publicUrl);

  const responseData = {
    success: true,
    uploadUrl: data.signedUrl,
    publicUrl: publicUrl,
    filePath: cleanFilePath
  };
  
  console.log('📤 Sending response:');
  console.log('   uploadUrl (first 100 chars):', responseData.uploadUrl?.substring(0, 100));
  console.log('   publicUrl:', responseData.publicUrl);
  
  return res.status(200).json(responseData);
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

    // Определяем тип файла (клиент может присылать 'image'/'pdf' или MIME)
    const fileExtension = photo_name ? '.' + photo_name.split('.').pop().toLowerCase() : null;
    const rawFileType = (file_type && typeof file_type === 'string') ? file_type.trim().toLowerCase() : '';

    let fileTypeToUse;
    if (rawFileType === 'pdf') {
      fileTypeToUse = 'application/pdf';
    } else if (rawFileType === 'image' || !rawFileType) {
      // Клиент часто присылает file_type: 'image' — определяем MIME по расширению или дефолт
      if (fileExtension === '.pdf') fileTypeToUse = 'application/pdf';
      else if (['.jpg', '.jpeg'].includes(fileExtension)) fileTypeToUse = 'image/jpeg';
      else if (fileExtension === '.png') fileTypeToUse = 'image/png';
      else if (fileExtension === '.webp') fileTypeToUse = 'image/webp';
      else fileTypeToUse = 'image/jpeg'; // дефолт для фото (в т.ч. «Сделать фото» без расширения)
    } else {
      // Полный MIME от клиента
      fileTypeToUse = rawFileType;
    }

    const isPdf = fileTypeToUse === 'application/pdf' || fileExtension === '.pdf';

    // Проверка поддерживаемого типа
    const isSupported = SUPPORTED_FILE_TYPES.includes(fileTypeToUse) || isPdf;
    if (!isSupported) {
      console.log('❌ Unsupported file type:', fileTypeToUse, 'extension:', fileExtension);
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

    console.log('✅ Validation passed, prepared for Vision (Yandex) analysis...');

    // 🎯 Анализируем фото при загрузке с Vision (Yandex Cloud OCR)
    let analysisDescription = description || null;
    
    if (!analysisDescription) {
      try {
        const downloadUrl = await getDownloadUrlForVision(photo_url);
        console.log(`🤖 Запускаем Vision (Yandex) для анализа "${analysis_group}" (${isPdf ? 'PDF' : 'IMAGE'})...`);
        analysisDescription = await analyzePhotoWithVision(downloadUrl, analysis_group, isPdf);
        console.log(`✅ Vision (Yandex) завершил анализ на ${analysisDescription.length} символов`);
      } catch (visionError) {
        console.error('⚠️  Ошибка в Vision API, но продолжаем:', visionError.message);
        analysisDescription = `[Ошибка анализа Yandex Vision: ${visionError.message}]`;
      }
    } else {
      console.log('📦 Используем предоставленное описание (кэш)');
    }

    console.log('✅ Saving to database with description...');

    // Сохраняем файл в базу с описанием от Vision и типом файла
    const { data, error } = await supabase
      .from('user_analysis_photos')
      .insert({
        telegram_id: telegramId,
        photo_url,
        photo_name: photo_name || (isPdf ? 'PDF анализа' : 'Фото анализа'),
        file_size: file_size || 0,
        analysis_group,
        description: analysisDescription, // Сохраняем описание от Vision
        file_type: isPdf ? 'pdf' : 'image' // Сохраняем тип файла для различия
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

    // Если квиз уже пройден, пересоздаём программу с учётом новых анализов (асинхронно)
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('quiz_completed')
        .eq('telegram_id', telegramId)
        .single();
      if (userRow && userRow.quiz_completed) {
        try {
          const { generateProgramForUser } = require('../lib/programGenerator.js');
          generateProgramForUser(telegramId);
        } catch (e) {
          console.error('Error starting programGenerator after analysis upload:', e);
        }
      }
    } catch (e) {
      console.error('Error checking quiz_completed after analysis upload:', e);
    }

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
