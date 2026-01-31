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
    console.log('📝 All answers being saved:', answers);

    // Проверяем что ровно 25 ответов
    const answerCount = Object.keys(answers).length;
    if (answerCount !== 25) {
      console.error('❌ VALIDATION ERROR: Expected 25 answers, got', answerCount);
      console.error('❌ Missing answers:', Object.keys(answers).filter(key => !answers[key] || answers[key].trim() === ''));
      return res.status(400).json({ 
        success: false, 
        error: `Expected 25 answers, got ${answerCount}`,
        details: {
          received: answerCount,
          expected: 25,
          missing: Object.keys(answers).filter(key => !answers[key] || answers[key].trim() === ''),
          all_keys: Object.keys(answers)
        }
      });
    }

    console.log('✅ Validation passed, proceeding to save...');

    // Удаляем все старые ответы пользователя
    console.log('🗑️ Deleting old answers for telegram_id:', telegramId);
    const { error: deleteError } = await supabase
      .from('quiz_answers')
      .delete()
      .eq('telegram_id', telegramId);

    if (deleteError) {
      console.error('❌ DELETE ERROR:', deleteError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to delete old answers',
        details: deleteError
      });
    }
    console.log('✅ Old answers deleted successfully');

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
    console.log('📋 Sample answers to insert:', answersToInsert.slice(0, 3));

    // Вставляем все ответы одним запросом
    const { data, error } = await supabase
      .from('quiz_answers')
      .insert(answersToInsert)
      .select();

    console.log('📊 INSERT RESULT:', { data, error });

    if (error) {
      console.error('❌ INSERT ERROR DETAILS:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        details: error
      });
    }

    console.log('✅ All answers saved:', data?.length || 0);

    // Обновляем статус квиза
    console.log('🔄 Updating quiz status to TRUE for telegram_id:', telegramId);
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        quiz_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);

    console.log('📊 STATUS UPDATE RESULT:', { updateError });

    if (updateError) {
      console.error('❌ STATUS UPDATE ERROR DETAILS:', {
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code
      });
    } else {
      console.log('✅ Quiz status updated to TRUE');
    }

    const finalResponse = { 
      success: true, 
      saved: data?.length || 0,
      total: answerCount
    };
    
    console.log('🎉 FINAL SUCCESS RESPONSE:', finalResponse);
    return res.json(finalResponse);

  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
