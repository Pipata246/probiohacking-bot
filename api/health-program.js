const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const telegramData = req.headers['x-telegram-webapp-data'];
    if (!telegramData) {
      return res.status(401).json({ success: false, error: 'No Telegram data' });
    }

    // Парсим Telegram initData (как в save-all-quiz-answers)
    const params = {};
    telegramData.split('&').forEach(param => {
      const [key, value] = param.split('=');
      if (key && value) {
        try {
          params[key] = decodeURIComponent(value.replace(/\+/g, ' '));
        } catch (e) {
          params[key] = value;
        }
      }
    });

    const user = JSON.parse(params.user);
    const telegramId = user.id;

    // Получаем последнюю сохранённую программу
    const { data: program, error } = await supabase
      .from('health_programs')
      .select('supplements, nutrition, stress, sleep, created_at')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116: no rows found
      console.error('Error fetching health_program:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const hasProgram = !!program;

    return res.status(200).json({
      success: true,
      programCreated: hasProgram,
      healthProgram: hasProgram ? {
        supplements: program.supplements || '',
        nutrition: program.nutrition || '',
        stress: program.stress || '',
        sleep: program.sleep || ''
      } : null
    });
  } catch (error) {
    console.error('health-program API Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error'
    });
  }
};

