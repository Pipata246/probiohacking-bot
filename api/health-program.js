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
      .select('supplements, nutrition, stress, sleep, goals, request, created_at')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116: no rows found
      console.error('Error fetching health_program:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const now = new Date();
    let hasProgram = !!program;
    let programExpired = false;

    if (program && program.created_at) {
      const createdAt = new Date(program.created_at);
      const diffMs = now.getTime() - createdAt.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 30) {
        programExpired = true;
        hasProgram = false;
      }
    }

    let goals = null;
    if (program && program.goals) {
      const raw = String(program.goals);
      goals = raw
        .split(/\r?\n/)
        .map((g) => g.trim())
        .filter(Boolean);
    }

    return res.status(200).json({
      success: true,
      programCreated: hasProgram,
      programExpired,
      healthProgram: hasProgram
        ? {
            supplements: program.supplements || '',
            nutrition: program.nutrition || '',
            stress: program.stress || '',
            sleep: program.sleep || '',
            goals: goals || null,
            request: program.request || null
          }
        : null
    });
  } catch (error) {
    console.error('health-program API Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error'
    });
  }
};

