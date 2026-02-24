const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('👨‍⚕️ Fetching doctors list...');

    const { data, error } = await supabase
      .from('doctors')
      .select('id, full_name, specialization, experience, avatar_url, about')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching doctors:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to load doctors'
      });
    }

    return res.json({
      success: true,
      doctors: data || []
    });
  } catch (err) {
    console.error('❌ Doctors API error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Unknown error'
    });
  }
};

