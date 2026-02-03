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
      let updateError = null;
      
      // Сначала пробуем с датой
      const result1 = await supabase
        .from('users')
        .update({ 
          quiz_completed: true,
          quiz_completion_date: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (result1.error) {
        console.log('🔥 Update with date failed, trying without date...');
        // Если не получилось с датой - пробуем только статус
        const result2 = await supabase
          .from('users')
          .update({ quiz_completed: true })
          .eq('id', userId);
        
        updateError = result2.error;
      }

      if (updateError) {
        console.error('🔥 UPDATE ERROR:', updateError);
        throw updateError;
      }

      console.log('🔥 UPDATE SUCCESS');

      return res.json({ success: true, data });
    }

    if (action === 'status') {
      // Сначала пробуем получить с датой и admin статусом
      let { data, error } = await supabase
        .from('users')
        .select('quiz_completed, quiz_completion_date, admin')
        .eq('id', userId)
        .single();

      // Если ошибка (возможно поле не существует) - пробуем без даты
      if (error) {
        console.log('🔥 Trying without quiz_completion_date...');
        const result = await supabase
          .from('users')
          .select('quiz_completed')
          .eq('id', userId)
          .single();
        
        if (result.error) throw result.error;
        data = result.data;
      }

      console.log('🔥 Quiz status data:', data);

      // Проверяем прошёл ли месяц с момента прохождения
      let quizCompleted = data?.quiz_completed ?? false;
      const completionDate = data?.quiz_completion_date;
      
      if (quizCompleted && completionDate) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const quizDate = new Date(completionDate);
        
        console.log('🔥 Checking quiz expiration:', {
          quizDate: quizDate.toISOString(),
          oneMonthAgo: oneMonthAgo.toISOString(),
          expired: quizDate < oneMonthAgo
        });
        
        // Если прошёл месяц - сбрасываем статус
        if (quizDate < oneMonthAgo) {
          console.log('🔥 Quiz expired! Resetting status to FALSE');
          
          await supabase
            .from('users')
            .update({ quiz_completed: false })
            .eq('id', userId);
          
          quizCompleted = false;
        }
      }

      return res.json({ 
        success: true, 
        quizCompleted: quizCompleted,
        quiz_completed: quizCompleted,
        quiz_completion_date: quizCompleted ? (data?.quiz_completion_date || null) : null,
        admin: data?.admin === true
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
