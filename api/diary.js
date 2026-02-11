const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const method = req.method || 'GET';

  try {
    const telegramData = req.headers['x-telegram-webapp-data'];
    if (!telegramData) {
      return res.status(401).json({ success: false, error: 'No Telegram data' });
    }

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
    const telegramId = user.id;

    if (method === 'GET') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('diary_entries')
        .select('id, entry_date, entry_time, title, notes')
        .eq('telegram_id', telegramId)
        .gte('entry_date', todayStr) // показываем только актуальные записи (сегодня и дальше)
        .order('entry_date', { ascending: true })
        .order('entry_time', { ascending: true });

      if (error) {
        console.error('Error fetching diary entries:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({
        success: true,
        entries: data || []
      });
    }

    // Добавление / обновление записи
    if (method === 'POST') {
      const { id, entry_date, entry_time, title, notes } = req.body || {};

      if (!entry_date || !entry_time || !title) {
        return res.status(400).json({ success: false, error: 'entry_date, entry_time и title обязательны' });
      }

      // Находим пользователя для user_id
      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegramId)
        .single();

      if (userError || !userRow) {
        console.error('User not found for diary save:', userError);
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      let entry;
      if (id) {
        const { data: updated, error: updateError } = await supabase
          .from('diary_entries')
          .update({
            entry_date,
            entry_time,
            title,
            notes: notes || null
          })
          .eq('id', id)
          .eq('telegram_id', telegramId)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating diary entry:', updateError);
          return res.status(500).json({ success: false, error: updateError.message });
        }

        entry = updated;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('diary_entries')
          .insert({
            user_id: userRow.id,
            telegram_id: telegramId,
            entry_date,
            entry_time,
            title,
            notes: notes || null
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting diary entry:', insertError);
          return res.status(500).json({ success: false, error: insertError.message });
        }

        entry = inserted;
      }

      return res.status(200).json({
        success: true,
        entry
      });
    }

    // Удаление записи
    if (method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) {
        return res.status(400).json({ success: false, error: 'id is required' });
      }

      const { error: deleteError } = await supabase
        .from('diary_entries')
        .delete()
        .eq('id', id)
        .eq('telegram_id', telegramId);

      if (deleteError) {
        console.error('Error deleting diary entry:', deleteError);
        return res.status(500).json({ success: false, error: deleteError.message });
      }

      return res.status(200).json({
        success: true
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('diary API Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error'
    });
  }
};

