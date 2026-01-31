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
    const { telegramId, answers } = req.body;
    
    if (!telegramId || !answers) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: telegramId, answers' 
      });
    }

    console.log('💾 Saving all quiz answers for telegramId:', telegramId);
    console.log('📊 Answers count:', Object.keys(answers).length);

    // Проверяем что ровно 25 ответов
    const answerCount = Object.keys(answers).length;
    if (answerCount !== 25) {
      return res.status(400).json({ 
        success: false, 
        error: `Expected 25 answers, got ${answerCount}` 
      });
    }

    // Удаляем все старые ответы пользователя
    await supabase
      .from('quiz_answers')
      .delete()
      .eq('telegram_id', telegramId);

    // Готовим массив для вставки всех ответов
    const answersToInsert = [];
    
    // Карпа вопросов с текстами
    const questionTexts = {
      // Персональные данные
      fullName: 'ФИО:',
      birthDate: 'Дата рождения:',
      profession: 'Профессия:',
      city: 'Город:',
      weight: 'Вес (кг):',
      height: 'Рост (см):',
      sport: 'Спорт/активность:',
      gender: 'Пол:',
      
      // Вопросы квиза
      V17: 'Как вы справляетесь со стрессом и умственной нагрузкой?',
      V18: 'Как вы ощущаете своё сердце и кровообращение?',
      V19: 'Как работает ваша пищеварительная система?',
      V20: 'Как вы оцениваете состояние своей иммунной системы?',
      V21: 'Как вы ощущаете свою гормональную систему?',
      V22: 'Как вы оцениваете состояние опорно-двигательного аппарата?',
      V23: 'Как работает ваша нервная система?',
      V24: 'Как вы оцениваете состояние дыхательной системы?',
      V25: 'Как вы оцениваете состояние мочевыделительной системы?',
      V26: 'Как вы оцениваете состояние репродуктивной системы?',
      V27: 'Как вы оцениваете состояние эндокринной системы?',
      V28: 'Как вы оцениваете состояние лимфатической системы?',
      V29: 'Как вы оцениваете состояние сердечно-сосудистой системы?',
      V30: 'Как вы оцениваете состояние пищеварительной системы?',
      V31: 'Как вы оцениваете состояние мышечной системы?',
      V32: 'Как вы оцениваете состояние костной системы?',
      V33: 'Как вы оцениваете состояние соединительной ткани?',
      
      // Дополнительные вопросы
      discomfort: 'Что вас беспокоит?:',
      diagnosis: 'Поставленные диагнозы:',
      treatment: 'Принимаемые лекарства/БАДы:'
    };

    // Создаем записи для каждого ответа
    for (const [questionId, answerValue] of Object.entries(answers)) {
      if (answerValue && answerValue.trim() !== '') {
        answersToInsert.push({
          telegram_id: telegramId,
          question_id: questionId,
          question_text: questionTexts[questionId] || questionId,
          answer_text: answerValue,
          answer_value: answerValue,
          updated_at: new Date().toISOString()
        });
      }
    }

    console.log('📝 Inserting', answersToInsert.length, 'answers');

    // Вставляем все ответы одним запросом
    const { data, error } = await supabase
      .from('quiz_answers')
      .insert(answersToInsert)
      .select();

    if (error) {
      console.error('❌ Save error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('✅ All answers saved:', data?.length || 0);

    // Обновляем статус квиза
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        quiz_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);

    if (updateError) {
      console.error('❌ Status update error:', updateError);
    } else {
      console.log('✅ Quiz status updated to TRUE');
    }

    return res.json({ 
      success: true, 
      saved: data?.length || 0,
      total: answerCount
    });

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
