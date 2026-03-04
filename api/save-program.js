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

module.exports = async (req, res) => {
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
    const { telegramUser, healthProgram, diaryEntries, request, requests } = req.body || {};

    if (!telegramUser || !telegramUser.id) {
      return res.status(400).json({ success: false, error: 'Telegram user data required' });
    }

    if (!healthProgram || typeof healthProgram !== 'object') {
      return res.status(400).json({ success: false, error: 'healthProgram is required' });
    }

    const telegramId = telegramUser.id;

    // Ищем пользователя по telegram_id (нужны id и дата последней диагностики)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, quiz_completion_date')
      .eq('telegram_id', telegramId)
      .single();

    if (userError || !user) {
      console.error('User not found for program save:', userError);
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userId = user.id;

    // Список запросов, из которых состоит программа: массив накапливается (не заменяется)
    const requestsList = Array.isArray(requests) && requests.length > 0
      ? requests.map((r) => String(r || '').trim()).filter(Boolean)
      : (request !== undefined && request !== null && String(request).trim())
        ? [String(request).trim()]
        : [];
    const requestStorage = requestsList.length > 0 ? JSON.stringify(requestsList) : null;

    // ИИ возвращает ОБЪЕДИНЁННУЮ программу (без дублей), поэтому полностью перезаписываем
    // health_programs и diary_entries — старые записи удаляем, вставляем новые
    await supabase.from('health_programs').delete().eq('telegram_id', telegramId);
    await supabase.from('diary_entries').delete().eq('telegram_id', telegramId);

    // Вставляем программу здоровья
    const goalsArray = Array.isArray(healthProgram.goals)
      ? healthProgram.goals.map((g) => String(g || '').trim()).filter(Boolean)
      : [];
    const goalsText = goalsArray.join('\n');

    const { data: hpData, error: hpError } = await supabase
      .from('health_programs')
      .insert({
        user_id: userId,
        telegram_id: telegramId,
        supplements: healthProgram.supplements || '',
        nutrition: healthProgram.nutrition || '',
        stress: healthProgram.stress || '',
        sleep: healthProgram.sleep || '',
        request: requestStorage,
        goals: goalsText || null
      })
      .select()
      .single();

    if (hpError) {
      console.error('Error inserting health_program:', hpError);
      return res.status(500).json({ success: false, error: 'Failed to save health program' });
    }

    // Вставляем записи дневника (если есть)
    const rawEntries = Array.isArray(diaryEntries) ? diaryEntries : [];
    // Убираем дубли по времени: на один временной слот (например, 08:00) оставляем только первую запись
    const uniqueEntries = [];
    const seenTimes = new Set();
    for (const entry of rawEntries) {
      const time = (entry.time || '').trim();
      if (!time) continue;
      if (seenTimes.has(time)) continue;
      seenTimes.add(time);
      uniqueEntries.push(entry);
    }
    const entries = uniqueEntries;
    if (entries.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // По умолчанию — 30 дней, но если есть дата актуальной диагностики,
      // ограничиваем расписание датой окончания её актуальности
      let daysCount = 30;
      if (user.quiz_completion_date) {
        const quizDate = new Date(user.quiz_completion_date);
        const expiryDate = new Date(quizDate);
        expiryDate.setMonth(expiryDate.getMonth() + 1);

        if (expiryDate >= today) {
          const diffMs = expiryDate.getTime() - today.getTime();
          // +1, чтобы включить последний день (до конца актуальности диагностики)
          daysCount = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
        } else {
          // На всякий случай: если диагностика уже не актуальна, не создаём записи
          daysCount = 0;
        }
      }

      const rows = [];

      // Создаём расписание до конца актуальности диагностики (или на 30 дней, если даты нет)
      for (let offset = 0; offset < daysCount; offset++) {
        const day = new Date(today);
        day.setDate(today.getDate() + offset);
        const dateStr = day.toISOString().slice(0, 10); // YYYY-MM-DD

        entries.forEach((entry) => {
          const time = (entry.time || '').trim();
          const title = (entry.title || '').trim();
          if (!time || !title) return;

          rows.push({
            user_id: userId,
            telegram_id: telegramId,
            entry_date: dateStr,
            entry_time: time,
            title,
            notes: (entry.notes || '').trim(),
            request: requestStorage  // Все запросы программы (JSON-массив)
          });
        });
      }

      if (rows.length > 0) {
        const { error: deError } = await supabase
          .from('diary_entries')
          .insert(rows);

        if (deError) {
          console.error('Error inserting diary_entries:', deError);
          return res.status(500).json({ success: false, error: 'Failed to save diary entries' });
        }
      }
    }

    // Обновляем флаг program_created у пользователя
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ program_created: true })
      .eq('id', userId);

    if (userUpdateError) {
      console.error('Error updating program_created flag:', userUpdateError);
    }

    return res.status(200).json({
      success: true,
      healthProgramId: hpData?.id || null,
      diaryEntriesSaved: entries.length
    });
  } catch (error) {
    console.error('save-program API Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error'
    });
  }
};

