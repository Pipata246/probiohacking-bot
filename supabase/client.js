// Упрощенный Supabase клиент для probiohacking-bot
// Без RPC функций для надежности
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

// Создание Supabase клиента
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

// Функции для работы с пользователями
const userService = {
  // Получить или создать пользователя
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

// Функции для работы с чатами (без RPC)
const chatService = {
  // Создать новый чат
  async createChat(userId, title = 'Новый чат', isActive = true, autoCreated = false) {
    console.log('createChat called with:', { userId, title, isActive, autoCreated });
    
    try {
      // Деактивируем предыдущие активные чаты пользователя
      await supabase
        .from('chats')
        .update({ is_active: false })
        .eq('user_id', userId);

      // Создаем новый чат
      const { data, error } = await supabase
        .from('chats')
        .insert({
          user_id: userId,
          title: title,
          is_active: isActive,
          auto_created: autoCreated
        })
        .select()
        .single();

      if (error) {
        console.error('Error in createChat:', error);
        return null;
      }

      return data.id;
    } catch (error) {
      console.error('Exception in createChat:', error);
      return null;
    }
  },

  // Получить активный чат пользователя
  async getActiveChat(userId) {
    console.log('getActiveChat called with:', { userId });
    
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error in getActiveChat:', error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.error('Exception in getActiveChat:', error);
      return null;
    }
  },

  // Получить список чатов пользователя
  async getUserChats(userId) {
    console.log('getUserChats called with:', { userId });
    
    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          id,
          title,
          created_at,
          updated_at,
          message_count,
          is_active,
          auto_created
        `)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

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
      const { data, error } = await supabase
        .from('user_requests')
        .select(`
          id,
          message_text,
          response_text,
          request_type,
          metadata,
          created_at
        `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .limit(limit);

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
        .update({ 
          is_active: true, 
          updated_at: new Date().toISOString() 
        })
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

// Функции для работы с запросами
const requestService = {
  // Сохранить запрос с привязкой к чату (упрощенная версия)
  async saveRequestToChat(telegramId, messageText, responseText = null, requestType = 'chat', metadata = {}, chatId = null) {
    console.log('saveRequestToChat called with:', { telegramId, messageText, chatId });
    
    try {
      // Получаем пользователя
      let userId = metadata?.userId || null;
      if (!userId) {
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('telegram_id', telegramId)
          .single();

        if (userError || !user) {
          console.error('User not found for request:', userError);
          return null;
        }

        userId = user.id;
      }

      // Если chat_id не указан, получаем активный чат
      let finalChatId = chatId;
      if (!finalChatId) {
        finalChatId = await chatService.getActiveChat(userId);
        
        // Если активного чата нет, создаем новый
        if (!finalChatId) {
          finalChatId = await chatService.createChat(userId, 'Новый чат', true, false);
        }
      }

      if (!finalChatId) {
        console.error('No chat ID available');
        return null;
      }

      // Сохраняем запрос
      const { data, error } = await supabase
        .from('user_requests')
        .insert({
          user_id: userId,
          chat_id: finalChatId,
          message_text: messageText,
          response_text: responseText,
          request_type: requestType,
          metadata: metadata
        })
        .select()
        .single();

      if (error) {
        console.error('Error in saveRequestToChat:', error);
        return null;
      }

      return data.id;
    } catch (error) {
      console.error('Exception in saveRequestToChat:', error);
      return null;
    }
  },

  async createChatRequest(userId, chatId, messageText, requestType = 'chat', metadata = {}) {
    try {
      const { data, error } = await supabase
        .from('user_requests')
        .insert({
          user_id: userId,
          chat_id: chatId,
          message_text: messageText,
          response_text: null,
          request_type: requestType,
          metadata
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error in createChatRequest:', error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.error('Exception in createChatRequest:', error);
      return null;
    }
  },

  async setChatResponse(requestId, responseText) {
    try {
      const { error } = await supabase
        .from('user_requests')
        .update({ response_text: responseText })
        .eq('id', requestId);

      if (error) {
        console.error('Error in setChatResponse:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Exception in setChatResponse:', error);
      return false;
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
