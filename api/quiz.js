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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { action } = req.query;
    console.log('🔥 QUIZ API:', { method: req.method, action });

    // Получаем пользователя из Telegram данных
    const telegramData = req.headers['x-telegram-webapp-data'];
    if (!telegramData) {
      return res.status(401).json({ success: false, error: 'No Telegram data' });
    }

    // Парсим Telegram данные без URL.parse
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
    console.log('🔥 User:', user);

    // Находим или создаем пользователя
    let { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', user.id)
      .single();

    let userId;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username
        })
        .select()
        .single();
      
      if (createError) throw createError;
      userId = newUser.id;
    }

    console.log('🔥 User ID:', userId);

    if (action === 'save') {
      const quizData = req.body;
      console.log('🔥 Quiz data:', quizData);

      // Сначала удаляем старые результаты если есть
      await supabase
        .from('quiz_results')
        .delete()
        .eq('user_id', userId);

      // Вставляем новые результаты
      const { data, error } = await supabase
        .from('quiz_results')
        .insert({
          user_id: userId,
          age: quizData.age,
          gender: quizData.gender,
          weight: quizData.weight,
          height: quizData.height,
          activity_level: quizData.activity_level,
          goals: quizData.goals || [],
          health_concerns: quizData.health_concerns || [],
          dietary_preferences: quizData.dietary_preferences || [],
          supplements: quizData.supplements || [],
          medications: quizData.medications || [],
          sleep_hours: quizData.sleep_hours,
          stress_level: quizData.stress_level,
          energy_level: quizData.energy_level,
          digestion_quality: quizData.digestion_quality,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select();

      if (error) {
        console.error('🔥 INSERT ERROR:', error);
        throw error;
      }

      console.log('🔥 INSERT SUCCESS:', data);

      // Обновляем статус прохождения квиза и дату
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          quiz_completed: true,
          quiz_completion_date: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('🔥 UPDATE ERROR:', updateError);
        throw updateError;
      }

      console.log('🔥 UPDATE SUCCESS');

      return res.json({ success: true, data });
    }

    if (action === 'status') {
      const { data, error } = await supabase
        .from('users')
        .select('quiz_completed, quiz_completion_date')
        .eq('id', userId)
        .single();

      if (error) throw error;

      return res.json({ 
        success: true, 
        quizCompleted: data.quiz_completed,
        quiz_completed: data.quiz_completed,
        quiz_completion_date: data.quiz_completion_date
      });
    }

    if (action === 'context') {
      const { data, error } = await supabase
        .from('quiz_results')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      const context = data ? `
        Возраст: ${data.age}
        Пол: ${data.gender}
        Вес: ${data.weight}кг
        Рост: ${data.height}см
        Активность: ${data.activity_level}
        Цели: ${data.goals.join(', ')}
        Проблемы: ${data.health_concerns.join(', ')}
        Диета: ${data.dietary_preferences.join(', ')}
        Стресс: ${data.stress_level}/10
        Энергия: ${data.energy_level}/10
      ` : 'Нет данных квиза';

      return res.json({ success: true, context });
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });

  } catch (error) {
    console.error('🔥 QUIZ API ERROR:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
