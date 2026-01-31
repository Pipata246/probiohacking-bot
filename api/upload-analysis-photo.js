const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // Используем service role key для загрузки файлов
  {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
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
    const { data, error } = await supabase.storage
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
    const { data: { publicUrl } } = supabase.storage
      .from('analysis-photos')
      .getPublicUrl(filePath);

    console.log('Upload URL created successfully');

    return res.status(200).json({
      success: true,
      uploadUrl: data.signedUrl,
      publicUrl: publicUrl,
      filePath: filePath
    });

  } catch (error) {
    console.error('Upload analysis photo API Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
