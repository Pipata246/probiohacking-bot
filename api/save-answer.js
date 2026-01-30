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
    const { telegramId, questionId, answer } = req.body;
    
    if (!telegramId || !questionId || !answer) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: telegramId, questionId, answer' 
      });
    }

    console.log('💾 Saving answer:', { telegramId, questionId, answer });

    // Сохраняем ответ
    const { data, error } = await supabase
      .from('quiz_answers')
      .insert({
        telegram_id: telegramId,
        question_id: questionId,
        answer: answer
      })
      .select();

    if (error) {
      console.error('❌ Save error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ Answer saved:', data);

    // Проверяем статус квиза
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('quiz_completed')
      .eq('telegram_id', telegramId)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('❌ Status check error:', userError);
    }

    return res.json({ 
      success: true, 
      data,
      quizCompleted: user?.quiz_completed || false
    });

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
