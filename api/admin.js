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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const telegramData = req.headers['x-telegram-webapp-data'];
    if (!telegramData) {
      return res.status(401).json({ success: false, error: 'No Telegram data' });
    }

    // Парсим Telegram данные
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
    
    // Проверяем что пользователь админ
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('admin')
      .eq('telegram_id', user.id)
      .single();

    if (userError || !currentUser || !currentUser.admin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { action, userId, analysisId } = req.query;

    // Получение списка всех пользователей
    if (action === 'users' && req.method === 'GET') {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, telegram_id, first_name, last_name, username, quiz_completed, analyses_uploaded, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return res.json({ success: true, users });
    }

    // Получение диагностики пользователя
    if (action === 'quiz' && userId && req.method === 'GET') {
      const { data: answers, error } = await supabase
        .from('quiz_answers')
        .select('*')
        .eq('user_id', userId)
        .order('question_id', { ascending: true });

      if (error) throw error;

      const { data: userData } = await supabase
        .from('users')
        .select('quiz_completed')
        .eq('id', userId)
        .single();

      return res.json({ 
        success: true, 
        answers: answers || [],
        quiz_completed: userData?.quiz_completed || false
      });
    }

    // Обновление диагностики пользователя
    if (action === 'quiz' && userId && req.method === 'PUT') {
      const { answers } = req.body; // Массив { question_id, answer_text }

      if (!Array.isArray(answers)) {
        return res.status(400).json({ success: false, error: 'Invalid answers format' });
      }

      // Обновляем каждый ответ
      for (const answer of answers) {
        const { error } = await supabase
          .from('quiz_answers')
          .update({ 
            answer_text: answer.answer_text,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('question_id', answer.question_id);

        if (error) {
          console.error('Error updating answer:', error);
          // Если записи нет - создаём
          await supabase
            .from('quiz_answers')
            .insert({
              user_id: userId,
              question_id: answer.question_id,
              answer_text: answer.answer_text,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      }

      return res.json({ success: true });
    }

    // Получение анализов пользователя
    if (action === 'analyses' && userId && req.method === 'GET') {
      const { data: analyses, error } = await supabase
        .from('user_analysis_photos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: userData } = await supabase
        .from('users')
        .select('analyses_uploaded')
        .eq('id', userId)
        .single();

      return res.json({ 
        success: true, 
        analyses: analyses || [],
        analyses_uploaded: userData?.analyses_uploaded || false
      });
    }

    // Обновление анализа
    if (action === 'analyses' && userId && analysisId && req.method === 'PUT') {
      const { category } = req.body;

      if (!category) {
        return res.status(400).json({ success: false, error: 'Category required' });
      }

      const { error } = await supabase
        .from('user_analysis_photos')
        .update({ category, updated_at: new Date().toISOString() })
        .eq('id', analysisId)
        .eq('user_id', userId);

      if (error) throw error;

      return res.json({ success: true });
    }

    // Удаление анализа
    if (action === 'analyses' && userId && analysisId && req.method === 'DELETE') {
      const { error } = await supabase
        .from('user_analysis_photos')
        .delete()
        .eq('id', analysisId)
        .eq('user_id', userId);

      if (error) throw error;

      // Проверяем остались ли анализы
      const { data: remaining } = await supabase
        .from('user_analysis_photos')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      // Если анализов не осталось - сбрасываем статус
      if (!remaining || remaining.length === 0) {
        await supabase
          .from('users')
          .update({ analyses_uploaded: false })
          .eq('id', userId);
      }

      return res.json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
