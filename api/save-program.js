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
    const { telegramUser, healthProgram, diaryEntries } = req.body || {};

    if (!telegramUser || !telegramUser.id) {
      return res.status(400).json({ success: false, error: 'Telegram user data required' });
    }

    if (!healthProgram || typeof healthProgram !== 'object') {
      return res.status(400).json({ success: false, error: 'healthProgram is required' });
    }

    const telegramId = telegramUser.id;

    // Ищем пользователя по telegram_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (userError || !user) {
      console.error('User not found for program save:', userError);
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const userId = user.id;

    // Очищаем старую программу и дневник для пользователя (если были)
    await supabase.from('health_programs').delete().eq('telegram_id', telegramId);
    await supabase.from('diary_entries').delete().eq('telegram_id', telegramId);

    // Вставляем программу здоровья
    const { data: hpData, error: hpError } = await supabase
      .from('health_programs')
      .insert({
        user_id: userId,
        telegram_id: telegramId,
        supplements: healthProgram.supplements || '',
        nutrition: healthProgram.nutrition || '',
        stress: healthProgram.stress || '',
        sleep: healthProgram.sleep || ''
      })
      .select()
      .single();

    if (hpError) {
      console.error('Error inserting health_program:', hpError);
      return res.status(500).json({ success: false, error: 'Failed to save health program' });
    }

    // Вставляем записи дневника (если есть)
    const entries = Array.isArray(diaryEntries) ? diaryEntries : [];
    if (entries.length > 0) {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

      const rows = entries
        .map((entry) => {
          const time = (entry.time || '').trim();
          const title = (entry.title || '').trim();
          if (!time || !title) return null;
          return {
            user_id: userId,
            telegram_id: telegramId,
            entry_date: dateStr,
            entry_time: time,
            title,
            notes: (entry.notes || '').trim()
          };
        })
        .filter(Boolean);

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

