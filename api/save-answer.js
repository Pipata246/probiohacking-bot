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

    // Используем UPSERT с правильным constraint
    const { data, error } = await supabase
      .from('quiz_answers')
      .upsert({
        telegram_id: telegramId,
        question_id: questionId,
        question_text: questionText || '',
        answer_text: answerText,
        answer_value: answerValue || answerText,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'telegram_id,question_id', // Конфликт по уникальным полям
        ignoreDuplicates: false // Обновляем при конфликте
      })
      .select();

    if (error) {
      console.error('❌ Save error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ Answer saved:', data);

    // Проверяем сколько всего ответов у пользователя
    const { count } = await supabase
      .from('quiz_answers')
      .select('*', { count: 'exact', head: true })
      .eq('telegram_id', telegramId);
    
    console.log(`📊 User ${telegramId} now has ${count} answers in DB`);

    return res.json({ 
      success: true, 
      data,
      totalAnswers: count
    });

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
