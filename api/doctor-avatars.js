const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { fileName, fileType, fileSize, filePath } = req.body || {};

    if (!fileName || !fileType || !filePath) {
      return res.status(400).json({
        success: false,
        error: 'fileName, fileType и filePath обязательны'
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        success: false,
        error: 'Supabase admin client not initialized'
      });
    }

    // Создаем signed URL для загрузки файла в bucket doctor-avatars
    const { data, error } = await supabaseAdmin.storage
      .from('doctor-avatars')
      .createSignedUploadUrl(filePath, 60 * 5);

    if (error || !data?.signedUrl) {
      console.error('❌ Error creating signed upload URL for doctor avatar:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create upload URL for doctor avatar'
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/doctor-avatars/${filePath}`;

    return res.status(200).json({
      success: true,
      uploadUrl: data.signedUrl,
      publicUrl,
      filePath
    });
  } catch (error) {
    console.error('❌ Doctor avatars API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error'
    });
  }
};

