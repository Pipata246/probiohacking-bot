const { createClient } = require('@supabase/supabase-js');
const { initUserFromWebApp } = require('../supabase/client.js');

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
  // Устанавливаем CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { action } = req.query;
    console.log('🔍 API Quiz: Request received:', { method: req.method, action, query: req.query });

    // Инициализация пользователя
    const user = await initUserFromWebApp(req);
    console.log('🔍 API Quiz: User initialized:', user);
    
    if (!user) {
      console.error('❌ API Quiz: User not found');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    switch (action) {
      case 'save':
        return await saveQuizResults(req, res, user.id);
      case 'status':
        return await getQuizStatus(req, res, user.id);
      case 'context':
        return await getQuizContext(req, res, user.id);
      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Quiz API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Сохранение результатов квиза
async function saveQuizResults(req, res, userId) {
  try {
    console.log('🔍 API: Получен запрос на сохранение квиза');
    console.log('🔍 API: userId:', userId);
    console.log('🔍 API: req.body:', req.body);
    
    const {
      age,
      gender,
      weight,
      height,
      activity_level,
      goals,
      health_concerns,
      dietary_preferences,
      supplements,
      medications,
      sleep_hours,
      stress_level,
      energy_level,
      digestion_quality
    } = req.body;

    console.log('🔍 API: Распакованные данные:', {
      age, gender, weight, height, activity_level,
      goals, health_concerns, dietary_preferences,
      supplements, medications, sleep_hours,
      stress_level, energy_level, digestion_quality
    });

    // Валидация обязательных полей
    if (!age || !gender || !weight || !height || !activity_level) {
      console.error('❌ API: Отсутствуют обязательные поля:', { age, gender, weight, height, activity_level });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: age, gender, weight, height, activity_level'
      });
    }

    console.log('✅ API: Валидация пройдена, вызываем Supabase функцию');

    // Вызов функции для сохранения результатов
    const { data, error } = await supabase.rpc('save_quiz_results', {
      p_user_id: userId,
      p_age: parseInt(age),
      p_gender: gender,
      p_weight: parseFloat(weight),
      p_height: parseFloat(height),
      p_activity_level: activity_level,
      p_goals: goals || [],
      p_health_concerns: health_concerns || [],
      p_dietary_preferences: dietary_preferences || [],
      p_supplements: supplements || [],
      p_medications: medications || [],
      p_sleep_hours: sleep_hours ? parseFloat(sleep_hours) : null,
      p_stress_level: stress_level ? parseInt(stress_level) : null,
      p_energy_level: energy_level ? parseInt(energy_level) : null,
      p_digestion_quality: digestion_quality || null
    });

    console.log('🔍 API: Ответ Supabase:', { data, error });

    if (error) {
      console.error('❌ API: Ошибка Supabase:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ API: Успешно сохранено!');
    return res.status(200).json({
      success: true,
      message: 'Quiz results saved successfully'
    });
  } catch (error) {
    console.error('❌ API: Общая ошибка сохранения:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// Получение статуса прохождения квиза
async function getQuizStatus(req, res, userId) {
  try {
    const { data, error } = await supabase.rpc('check_user_quiz_status', {
      p_user_id: userId
    });

    if (error) {
      console.error('Get quiz status error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      quiz_completed: data
    });
  } catch (error) {
    console.error('Get quiz status error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// Получение контекста квиза для ИИ
async function getQuizContext(req, res, userId) {
  try {
    const { data, error } = await supabase.rpc('get_user_quiz_context', {
      p_user_id: userId
    });

    if (error) {
      console.error('Get quiz context error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      context: data
    });
  } catch (error) {
    console.error('Get quiz context error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
