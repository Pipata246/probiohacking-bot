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
    const { telegramId, questionId, questionText, answerText, answerValue } = req.body;
    
    if (!telegramId || !questionId || !answerText) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: telegramId, questionId, answerText' 
      });
    }

    console.log('💾 Saving answer:', { telegramId, questionId, answerText });

    // Сначала удаляем существующий ответ если есть
    await supabase
      .from('quiz_answers')
      .delete()
      .eq('telegram_id', telegramId)
      .eq('question_id', questionId);

    // Вставляем новый ответ
    const { data, error } = await supabase
      .from('quiz_answers')
      .insert({
        telegram_id: telegramId,
        question_id: questionId,
        question_text: questionText || '',
        answer_text: answerText,
        answer_value: answerValue || answerText,
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('❌ Save error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ Answer saved:', data);

    return res.json({ 
      success: true, 
      data
    });

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
