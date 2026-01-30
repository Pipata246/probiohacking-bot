const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: telegramId' 
      });
    }

    console.log('🏁 Completing quiz for telegramId:', telegramId);

    // Вызываем функцию для завершения квиза
    const { data, error } = await supabase
      .rpc('complete_quiz_for_user', { p_telegram_id: telegramId });

    if (error) {
      console.error('❌ Complete quiz error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ Quiz completed:', data);

    return res.json({ 
      success: true, 
      completed: data
    });

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
