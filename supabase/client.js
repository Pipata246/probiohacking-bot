// Supabase клиент для probiohacking-bot
const { createClient } = require('@supabase/supabase-js');

// Конфигурация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

console.log('Supabase config check:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
  urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 30) : 'none'
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase configuration');
}

// Создание Supabase клиента с кастомным auth
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'X-Client-Info': 'probiohacking-bot'
    }
  }
});

// Функция для создания клиента с Telegram WebApp данными
function createSupabaseClientWithAuth(telegramWebAppData) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'X-Client-Info': 'probiohacking-bot',
        'X-Telegram-WebApp-Data': telegramWebAppData
      }
    }
  });
}

// Функции для работы с пользователями
const userService = {
  // Получить или создать пользователя - ПРОСТОЙ ВАРИАНТ
  async getOrCreateUser(telegramId, firstName = null, lastName = null, username = null, languageCode = 'ru') {
    console.log('getOrCreateUser called with:', { telegramId, firstName, lastName, username, languageCode });
    
    try {
      // Сначала пытаемся найти существующего пользователя
      let { data: existingUser, error: findError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      console.log('Find user result:', { existingUser, findError });

      if (findError && findError.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Error finding user:', findError);
        return null;
      }

      // Если пользователь найден, обновляем его данные
      if (existingUser) {
        console.log('User exists, updating...');
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

        console.log('Update result:', { updatedUser, updateError });

        if (updateError) {
          console.error('Error updating user:', updateError);
          return null;
        }

        return updatedUser.id;
      }

      // Если пользователь не найден, создаем нового
      console.log('Creating new user...');
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

      console.log('Create result:', { newUser, createError });

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
  // Сохранить запрос пользователя - ПРОСТОЙ ВАРИАНТ
  async saveRequest(telegramId, messageText, responseText = null, requestType = 'chat', metadata = {}) {
    console.log('saveRequest called with:', { telegramId, messageText, requestType });
    
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

  // Сохранить запрос с привязкой к чату
  async saveRequestToChat(telegramId, messageText, responseText = null, requestType = 'chat', metadata = {}, chatId = null) {
    console.log('saveRequestToChat called with:', { telegramId, messageText, chatId });
    
    try {
      const { data, error } = await supabase.rpc('save_request_to_chat', {
        p_telegram_id: telegramId,
        p_message_text: messageText,
        p_response_text: responseText,
        p_request_type: requestType,
        p_metadata: metadata,
        p_chat_id: chatId
      });

      if (error) {
        console.error('Error in saveRequestToChat:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Exception in saveRequestToChat:', error);
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

// Функции для работы с чатами
const chatService = {
  // Создать новый чат
  async createChat(userId, title = 'Новый чат', isActive = true, autoCreated = false) {
    console.log('createChat called with:', { userId, title, isActive, autoCreated });
    
    try {
      const { data, error } = await supabase.rpc('create_chat', {
        p_user_id: userId,
        p_title: title,
        p_is_active: isActive,
        p_auto_created: autoCreated
      });

      if (error) {
        console.error('Error in createChat:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Exception in createChat:', error);
      return null;
    }
  },

  // Получить активный чат пользователя
  async getActiveChat(userId) {
    console.log('getActiveChat called with:', { userId });
    
    try {
      const { data, error } = await supabase.rpc('get_active_chat', {
        p_user_id: userId
      });

      if (error) {
        console.error('Error in getActiveChat:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Exception in getActiveChat:', error);
      return null;
    }
  },

  // Получить список чатов пользователя
  async getUserChats(userId) {
    console.log('getUserChats called with:', { userId });
    
    try {
      const { data, error } = await supabase.rpc('get_user_chats', {
        p_user_id: userId
      });

      if (error) {
        console.error('Error in getUserChats:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception in getUserChats:', error);
      return [];
    }
  },

  // Получить сообщения чата
  async getChatMessages(chatId, limit = 50) {
    console.log('getChatMessages called with:', { chatId, limit });
    
    try {
      const { data, error } = await supabase.rpc('get_chat_messages', {
        p_chat_id: chatId,
        p_limit: limit
      });

      if (error) {
        console.error('Error in getChatMessages:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception in getChatMessages:', error);
      return [];
    }
  },

  // Переключиться на другой чат
  async switchToChat(userId, chatId) {
    console.log('switchToChat called with:', { userId, chatId });
    
    try {
      // Деактивируем все чаты пользователя
      await supabase
        .from('chats')
        .update({ is_active: false })
        .eq('user_id', userId);

      // Активируем выбранный чат
      const { data, error } = await supabase
        .from('chats')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', chatId)
        .select()
        .single();

      if (error) {
        console.error('Error in switchToChat:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Exception in switchToChat:', error);
      return null;
    }
  }
};

// Экспорт для CommonJS
module.exports = {
  supabase,
  userService,
  requestService,
  chatService
};
