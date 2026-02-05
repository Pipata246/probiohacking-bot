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

// Используем тот же клиент для всех операций (ANON_KEY)
// Все операции работают через RLS политики

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');
  // Отключаем кеширование для админских запросов
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('🔧 Admin API called:', req.method, req.url, 'action:', req.query.action);
    const telegramData = req.headers['x-telegram-webapp-data'];
    if (!telegramData) {
      console.error('❌ No Telegram data in request');
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
      console.log('📥 Fetching users list...');
      const { data: users, error } = await supabase
        .from('users')
        .select('id, telegram_id, first_name, last_name, username, quiz_completed, analyses_uploaded, admin, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching users:', error);
        throw error;
      }

      console.log('✅ Users fetched:', users?.length || 0);
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

      // Получаем telegram_id пользователя
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', userId)
        .single();

      if (userError || !userData) throw userError || new Error('User not found');

      // Карта текстов вопросов для обновления question_text
      const questionTexts = {
        fullName: 'ФИО:',
        birthDate: 'Дата рождения:',
        profession: 'Профессия:',
        city: 'Город:',
        weight: 'Вес (кг):',
        height: 'Рост (см):',
        sport: 'Спорт/активность:',
        gender: 'Пол:',
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
        discomfort: 'Что вас беспокоит?:',
        diagnosis: 'Поставленные диагнозы:',
        treatment: 'Принимаемые лекарства/БАДы:'
      };

      // Обновляем каждый ответ (обновляем ОБА поля: answer_text и answer_value)
      for (const answer of answers) {
        const questionText = questionTexts[answer.question_id] || answer.question_id;
        
        const { error } = await supabase
          .from('quiz_answers')
          .update({ 
            answer_text: answer.answer_text,
            answer_value: answer.answer_text, // Обновляем оба поля одновременно
            question_text: questionText, // Обновляем текст вопроса
            updated_at: new Date().toISOString()
          })
          .eq('telegram_id', userData.telegram_id)
          .eq('question_id', answer.question_id);

        if (error) {
          console.error('Error updating answer:', error);
          // Если записи нет - создаём
          const { error: insertError } = await supabase
            .from('quiz_answers')
            .insert({
              telegram_id: userData.telegram_id,
              question_id: answer.question_id,
              question_text: questionText,
              answer_text: answer.answer_text,
              answer_value: answer.answer_text, // Оба поля одинаковые при создании
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          
          if (insertError) {
            console.error('Error inserting answer:', insertError);
            throw insertError;
          }
        }
      }

      return res.json({ success: true });
    }

    // Получение анализов пользователя
    if (action === 'analyses' && userId && req.method === 'GET') {
      // Сначала получаем telegram_id пользователя
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('telegram_id, analyses_uploaded')
        .eq('id', userId)
        .single();

      if (userError || !userData) throw userError || new Error('User not found');

      // Получаем анализы по telegram_id
      const { data: analyses, error } = await supabase
        .from('user_analysis_photos')
        .select('*')
        .eq('telegram_id', userData.telegram_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

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

      // Получаем telegram_id пользователя для проверки
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', userId)
        .single();

      if (userError || !userData) throw userError || new Error('User not found');

      // Используем analysis_group вместо category (правильное поле в БД)
      const { error } = await supabase
        .from('user_analysis_photos')
        .update({ analysis_group: category, updated_at: new Date().toISOString() })
        .eq('id', analysisId)
        .eq('telegram_id', userData.telegram_id);

      if (error) throw error;

      return res.json({ success: true });
    }

    // Удаление анализа
    if (action === 'analyses' && userId && analysisId && req.method === 'DELETE') {
      // Получаем telegram_id пользователя для проверки
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', userId)
        .single();

      if (userError || !userData) throw userError || new Error('User not found');

      const { error } = await supabase
        .from('user_analysis_photos')
        .delete()
        .eq('id', analysisId)
        .eq('telegram_id', userData.telegram_id);

      if (error) throw error;

      // Проверяем остались ли анализы
      const { data: remaining } = await supabase
        .from('user_analysis_photos')
        .select('id')
        .eq('telegram_id', userData.telegram_id)
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

    // Получение данных подписки пользователя
    if (action === 'subscription' && userId && req.method === 'GET') {
      const { data: userData, error } = await supabase
        .from('users')
        .select('subscription_active, subscription_start_date, subscription_end_date')
        .eq('id', userId)
        .single();

      if (error) throw error;

      return res.json({ 
        success: true, 
        subscription_active: userData?.subscription_active || false,
        subscription_start_date: userData?.subscription_start_date || null,
        subscription_end_date: userData?.subscription_end_date || null
      });
    }

    // Обновление подписки пользователя
    if (action === 'subscription' && userId && req.method === 'PUT') {
      const { subscriptionActive, subscriptionEndDate } = req.body;

      if (typeof subscriptionActive !== 'boolean') {
        return res.status(400).json({ success: false, error: 'subscriptionActive must be a boolean' });
      }

      // Преобразуем userId в число, если нужно
      const userIdNum = parseInt(userId, 10);
      if (isNaN(userIdNum)) {
        return res.status(400).json({ success: false, error: 'Invalid userId' });
      }

      console.log(`🔧 Updating subscription for user ${userIdNum}: active=${subscriptionActive}, endDate=${subscriptionEndDate}`);

      // ВАЛИДАЦИЯ: При активации подписки через админку дата окончания ОБЯЗАТЕЛЬНА
      if (subscriptionActive && !subscriptionEndDate) {
        return res.status(400).json({ 
          success: false, 
          error: 'При активации подписки необходимо указать дату окончания' 
        });
      }

      // Формируем объект обновления
      const updateData = {
        subscription_active: subscriptionActive,
        updated_at: new Date().toISOString()
      };

      // Если подписка активируется, устанавливаем даты
      if (subscriptionActive) {
        // Дата окончания обязательна (уже проверена выше)
        updateData.subscription_end_date = new Date(subscriptionEndDate).toISOString();
        
        // Если дата начала не установлена, устанавливаем текущую дату
        const { data: currentUser, error: fetchError } = await supabase
          .from('users')
          .select('subscription_start_date')
          .eq('id', userIdNum)
          .single();
        
        if (fetchError) {
          console.warn('⚠️ Error fetching current user (non-blocking):', fetchError.message);
          // Если не удалось получить данные, устанавливаем дату начала
          updateData.subscription_start_date = new Date().toISOString();
        } else if (!currentUser?.subscription_start_date) {
          updateData.subscription_start_date = new Date().toISOString();
        }
      } else {
        // Если подписка деактивируется, даты оставляем для истории (не очищаем)
        // Это позволяет видеть когда была подписка и когда закончилась
      }

      // Обновляем данные подписки
      console.log('📝 Update data:', JSON.stringify(updateData, null, 2));
      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userIdNum)
        .select();

      if (error) {
        console.error('❌ Error updating subscription:', error);
        console.error('❌ Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      if (!data || data.length === 0) {
        console.error('❌ No data returned after update');
        throw new Error('No data returned after update');
      }

      // После успешного обновления проверяем истекшие подписки
      // Это нужно чтобы автоматически деактивировать подписки с прошедшей датой окончания
      try {
        const { error: rpcError } = await supabase.rpc('check_and_update_expired_subscriptions');
        if (rpcError) {
          console.warn('⚠️ RPC check_and_update_expired_subscriptions returned error (non-blocking):', rpcError.message);
        } else {
          console.log('✅ RPC check_and_update_expired_subscriptions executed successfully');
        }
      } catch (rpcError) {
        console.warn('⚠️ RPC check_and_update_expired_subscriptions failed (non-blocking):', rpcError.message);
      }

      console.log('✅ Subscription updated successfully:', data[0]);
      return res.json({ success: true, user: data[0] });
    }

    // Установка админского статуса пользователя
    if (action === 'setAdmin' && userId && req.method === 'PUT') {
      const { isAdmin } = req.body;

      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ success: false, error: 'isAdmin must be a boolean' });
      }

      console.log(`🔧 Setting admin status for user ${userId} to ${isAdmin}`);

      const { data, error } = await supabase
        .from('users')
        .update({ admin: isAdmin, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select();

      if (error) {
        console.error('❌ Error updating admin status:', error);
        throw error;
      }

      console.log('✅ Admin status updated successfully:', data);
      return res.json({ success: true, data });
    }

    return res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (error) {
    console.error('❌ Admin API error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Unknown error',
      details: error.details || null,
      code: error.code || null
    });
  }
};
