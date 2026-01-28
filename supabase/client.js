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
      const { data, error } = await supabase.rpc('get_or_create_user', {
        p_telegram_id: telegramId,
        p_first_name: firstName,
        p_last_name: lastName,
        p_username: username,
        p_language_code: languageCode
      });

      if (error) {
        console.error('Error in getOrCreateUser:', error);
        return null;
      }

      return data;
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
      const { data, error } = await supabase.rpc('save_user_request', {
        p_telegram_id: telegramId,
        p_message_text: messageText,
        p_response_text: responseText,
        p_request_type: requestType,
        p_metadata: metadata
      });

      if (error) {
        console.error('Error in saveRequest:', error);
        return null;
      }

      return data;
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
