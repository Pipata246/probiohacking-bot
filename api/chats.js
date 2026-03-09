// API для работы с чатами
const { chatService, userService, requestService } = require('../supabase/client.js');
const { initUserFromWebApp } = require('../supabase/userMiddleware.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Инициализируем пользователя
    const userInfo = await initUserFromWebApp(req);
    
    if (!userInfo || !userInfo.id) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { action } = req.query || {};

    if (req.method === 'GET') {
      // Получение списка чатов
      if (action === 'list') {
        await chatService.ensureActiveChat(userInfo.id);
        const chats = await chatService.getUserChats(userInfo.id);
        return res.status(200).json({
          success: true,
          chats
        });
      }

      // Получение активного чата
      if (action === 'active') {
        const activeChatId = await chatService.ensureActiveChat(userInfo.id);
        return res.status(200).json({
          success: true,
          activeChatId
        });
      }

      // Получение сообщений чата
      if (action === 'messages') {
        const { chatId } = req.query || {};
        if (!chatId) {
          return res.status(400).json({ success: false, error: 'Chat ID required' });
        }

        const messages = await chatService.getChatMessages(userInfo.id, chatId);
        return res.status(200).json({
          success: true,
          messages
        });
      }

      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};

      // Создание нового чата
      if (action === 'create') {
        const { title, autoCreated = false } = req.body || {};
        
        const chatId = await chatService.createChat(
          userInfo.id, 
          title || 'Новый чат', 
          true, 
          autoCreated
        );

        if (!chatId) {
          return res.status(500).json({ success: false, error: 'Failed to create chat' });
        }

        return res.status(200).json({
          success: true,
          chatId,
          message: 'Chat created successfully'
        });
      }

      // Переключение на другой чат
      if (action === 'switch') {
        const { chatId } = req.body || {};
        if (!chatId) {
          return res.status(400).json({ success: false, error: 'Chat ID required' });
        }

        const chat = await chatService.switchToChat(userInfo.id, chatId);
        if (!chat) {
          return res.status(500).json({ success: false, error: 'Failed to switch chat' });
        }

        return res.status(200).json({
          success: true,
          chat,
          message: 'Switched to chat successfully'
        });
      }

      // Сохранение сообщения «описание программы» в историю чата (чтобы не пропадало при выходе)
      if (action === 'addProgramMessage') {
        const { chatId, descriptionText } = req.body || {};
        if (!chatId || descriptionText == null) {
          return res.status(400).json({ success: false, error: 'chatId and descriptionText required' });
        }
        const fullResponse = String(descriptionText).trim();
        const requestId = await requestService.saveRequestToChat(
          userInfo.telegramId,
          'Составление программы',
          fullResponse,
          'program',
          { userId: userInfo.id },
          chatId
        );
        if (!requestId) {
          return res.status(500).json({ success: false, error: 'Failed to save message' });
        }
        return res.status(200).json({ success: true, requestId });
      }

      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Chats API Error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
};
