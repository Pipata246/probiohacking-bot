const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Проверка статуса квиза (GET запрос)
  if (req.method === 'GET' && req.query.action === 'status') {
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
      
      // Получаем статус квиза и админский статус
      const { data, error } = await supabase
        .from('users')
        .select('quiz_completed, quiz_completion_date, admin')
        .eq('telegram_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching quiz status:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      // Проверяем прошёл ли месяц с момента прохождения
      let quizCompleted = data?.quiz_completed ?? false;
      const completionDate = data?.quiz_completion_date;
      
      if (quizCompleted && completionDate) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const quizDate = new Date(completionDate);
        
        // Если прошёл месяц - сбрасываем статус
        if (quizDate < oneMonthAgo) {
          console.log('Quiz expired! Resetting status to FALSE');
          
          await supabase
            .from('users')
            .update({ quiz_completed: false })
            .eq('telegram_id', user.id);
          
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
    } catch (error) {
      console.error('Quiz status API error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
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
    const validAnswersCount = Object.values(answers).filter(value => 
      value && value.trim() !== '' && value !== 'undefined' && value !== 'null'
    ).length;
    
    console.log('📊 Answer validation:', {
      total_keys: answerCount,
      valid_answers: validAnswersCount,
      expected: 25
    });
    
    if (validAnswersCount !== 25) {
      const emptyFields = Object.entries(answers).filter(([key, value]) => 
        !value || value.trim() === '' || value === 'undefined' || value === 'null'
      );
      
      console.error('❌ VALIDATION ERROR: Expected 25 valid answers, got', validAnswersCount);
      console.error('❌ Empty/invalid fields:', emptyFields);
      
      return res.status(400).json({ 
        success: false, 
        error: `Expected 25 valid answers, got ${validAnswersCount}`,
        details: {
          received: answerCount,
          valid: validAnswersCount,
          expected: 25,
          empty_fields: emptyFields.map(([key]) => key),
          all_answers: answers
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
    
    // Карта вопросов с текстами (должна соответствовать surveyQuestions в app.js)
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
      
      // Вопросы квиза (V17-V30) - СИНХРОНИЗИРОВАНЫ с surveyQuestions в app.js
      V17: '[Нервная система] Как вы справляетесь со стрессом и умственной нагрузкой?',
      V18: '[Сердечно-сосудистая система] Как вы ощущаете своё сердце и кровообращение?',
      V19: '[Дыхательная система] Как ваше дыхание в покое и при нагрузке?',
      V20: '[Пищеварительная система] Как вы оцениваете своё пищеварение?',
      V21: '[Иммунная система] Как часто вы болеете и как восстанавливаетесь?',
      V22: '[Эндокринная система] Как вы ощущаете свой гормональный баланс?',
      V23: '[Опорно-двигательная система] Как вы чувствуете свои мышцы, суставы и кости?',
      V24: '[Мочевыделительная система] Как работает ваша мочевыделительная система?',
      V25: '[Репродуктивная система] Как вы оцениваете своё репродуктивное здоровье?',
      V26: '[Покровная система] Как выглядит и чувствуется ваша кожа?',
      V27: '[Лимфатическая система] Есть ли признаки застоя лимфы?',
      V28: '[Сенсорная система] Как вы воспринимаете мир через органы чувств?',
      V29: '[Состояние] Как выглядит ваш язык по утрам?',
      V30: '[Цель] Какую главную цель в здоровье вы ставите?',
      
      // Дополнительные вопросы
      discomfort: 'Что вас беспокоит?:',
      diagnosis: 'Поставленные диагнозы:',
      treatment: 'Принимаемые лекарства/БАДы:'
    };

    // Создаем записи для каждого ответа
    for (const [questionId, answerValue] of Object.entries(answers)) {
      // Пропускаем пустые или невалидные ответы
      if (!answerValue || answerValue.trim() === '' || answerValue === 'undefined' || answerValue === 'null') {
        console.log('⚠️ Skipping empty/invalid answer for:', questionId, 'value:', answerValue);
        continue;
      }
      
      answersToInsert.push({
        telegram_id: telegramId,
        question_id: questionId,
        question_text: questionTexts[questionId] || questionId,
        answer_text: answerValue,
        answer_value: answerValue,
        updated_at: new Date().toISOString()
      });
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

    // Обновляем статус квиза и дату прохождения
    console.log('🔄 Updating quiz status to TRUE for telegram_id:', telegramId);
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        quiz_completed: true,
        quiz_completion_date: new Date().toISOString(),
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
