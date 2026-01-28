// Supabase клиент для probiohacking-bot
const { createClient } = require('@supabase/supabase-js');

// Конфигурация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase configuration. Please check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
}

// Создание Supabase клиента
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Функции для работы с пользователями
const userService = {
  // Получить или создать пользователя
  async getOrCreateUser(telegramId, firstName = null, lastName = null, username = null, languageCode = 'ru') {
    try {
      // Сначала пытаемся найти существующего пользователя
      let { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (findError && findError.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Error finding user:', findError);
        return null;
      }

      // Если пользователь найден, обновляем его данные
      if (existingUser) {
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            first_name: firstName || existingUser.first_name,
            last_name: lastName || existingUser.last_name,
            username: username || existingUser.username,
            updated_at: new Date().toISOString()
          })
          .eq('telegram_id', telegramId)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating user:', updateError);
          return null;
        }

        return updatedUser.id;
      }

      // Если пользователь не найден, создаем нового
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramId,
          first_name: firstName,
          last_name: lastName,
          username: username,
          language_code: languageCode
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating user:', createError);
        return null;
      }

      return newUser.id;
    } catch (error) {
      console.error('Exception in getOrCreateUser:', error);
      return null;
    }
  },

  // Получить пользователя по Telegram ID
  async getUserByTelegramId(telegramId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error getting user:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Exception in getUserByTelegramId:', error);
      return null;
    }
  }
};

// Функции для работы с запросами
const requestService = {
  // Сохранить запрос пользователя
  async saveRequest(telegramId, messageText, responseText = null, requestType = 'chat', metadata = {}) {
    try {
      // Сначала получаем пользователя
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegramId)
        .single();

      if (userError || !user) {
        console.error('User not found for request:', userError);
        return null;
      }

      // Сохраняем запрос
      const { data, error } = await supabase
        .from('user_requests')
        .insert({
          user_id: user.id,
          message_text: messageText,
          response_text: responseText,
          request_type: requestType,
          metadata: metadata
        })
        .select()
        .single();

      if (error) {
        console.error('Error in saveRequest:', error);
        return null;
      }

      return data.id;
    } catch (error) {
      console.error('Exception in saveRequest:', error);
      return null;
    }
  },

  // Получить запросы пользователя
  async getUserRequests(telegramId, limit = 50) {
    try {
      const { data, error } = await supabase
        .from('user_requests')
        .select(`
          *,
          users!inner(telegram_id, first_name, last_name, username)
        `)
        .eq('users.telegram_id', telegramId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error getting user requests:', error);
        return [];
      }

      return data;
    } catch (error) {
      console.error('Exception in getUserRequests:', error);
      return [];
    }
  },

  // Получить статистику запросов
  async getRequestStats(telegramId) {
    try {
      const { data, error } = await supabase
        .from('user_requests')
        .select('request_type, created_at')
        .eq('users.telegram_id', telegramId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting request stats:', error);
        return null;
      }

      // Группировка по типам запросов
      const stats = data.reduce((acc, request) => {
        acc[request.request_type] = (acc[request.request_type] || 0) + 1;
        return acc;
      }, {});

      return {
        totalRequests: data.length,
        requestTypes: stats,
        lastRequest: data[0]?.created_at || null
      };
    } catch (error) {
      console.error('Exception in getRequestStats:', error);
      return null;
    }
  }
};

// Экспорт для CommonJS
module.exports = {
  supabase,
  userService,
  requestService
};
