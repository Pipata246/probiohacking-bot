const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const token = process.env.BOT_TOKEN;
const miniAppUrl = 'https://probiohacking-bot.vercel.app';

const bot = new TelegramBot(token);

// Инициализация Supabase клиента
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
);

// Клавиатура с кнопками меню
const menuKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '💳 Оплатить подписку' }],
      [{ text: '👤 Профиль' }],
      [{ text: '🚀 Открыть мини ап' }]
    ],
    resize_keyboard: true,
    persistent: true
  }
};

// Клавиатура с вариантами оплаты
const paymentOptionsKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '1 месяц' }],
      [{ text: '3 месяца' }],
      [{ text: '1 год' }],
      [{ text: '◀️ Назад' }]
    ],
    resize_keyboard: true
  }
};

// Клавиатура "Назад" для профиля
const backKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '◀️ Назад' }]
    ],
    resize_keyboard: true
  }
};

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const { message } = req.body;

      if (!message) {
        return res.status(200).json({ ok: true });
      }

      const chatId = message.chat.id;
      const text = message.text;

      // Обработка команды /start
      if (text === '/start') {
        const welcomeMessage = `🤖 PROBIOHACKING — ваш цифровой наставник по здоровью

Откройте Mini App для персональной диагностики и рекомендаций`;

        await bot.sendMessage(chatId, welcomeMessage, menuKeyboard);
        return res.status(200).json({ ok: true });
      }

      // Обработка кнопки "Открыть мини ап"
      if (text === '🚀 Открыть мини ап') {
        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '🚀 Открыть Mini App',
                web_app: { url: miniAppUrl }
              }
            ]
          ]
        };
        await bot.sendMessage(chatId, 'Нажмите на кнопку ниже, чтобы открыть Mini App:', { reply_markup: keyboard });
        return res.status(200).json({ ok: true });
      }

      // Обработка кнопки "Профиль"
      if (text === '👤 Профиль') {
        try {
          const telegramId = message.from.id;
          
          // Получаем данные о подписке из БД
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('subscription_active, subscription_start_date, subscription_end_date')
            .eq('telegram_id', telegramId)
            .single();

          if (userError || !userData) {
            await bot.sendMessage(chatId, '❌ Не удалось загрузить информацию о подписке', menuKeyboard);
            return res.status(200).json({ ok: true });
          }

          const isActive = userData.subscription_active === true;
          const startDate = userData.subscription_start_date 
            ? new Date(userData.subscription_start_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
          const endDate = userData.subscription_end_date 
            ? new Date(userData.subscription_end_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Безлимитная';

          let profileMessage = `👤 <b>Профиль</b>\n\n`;
          profileMessage += `📊 <b>Статус подписки:</b> ${isActive ? '✅ Активна' : '❌ Неактивна'}\n`;
          
          if (isActive) {
            profileMessage += `📅 <b>Действует до:</b> ${endDate}\n`;
          }
          
          if (startDate !== '—') {
            profileMessage += `📆 <b>Дата начала:</b> ${startDate}\n`;
          }

          const keyboard = isActive 
            ? menuKeyboard 
            : {
                reply_markup: {
                  keyboard: [
                    [{ text: '💳 Оплатить подписку' }],
                    [{ text: '◀️ Назад в меню' }]
                  ],
                  resize_keyboard: true
                }
              };

          await bot.sendMessage(chatId, profileMessage, { 
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
          });
        } catch (error) {
          console.error('Error loading profile:', error);
          await bot.sendMessage(chatId, '❌ Ошибка загрузки данных профиля', menuKeyboard);
        }
        return res.status(200).json({ ok: true });
      }

      // Обработка кнопки "Оплатить подписку"
      if (text === '💳 Оплатить подписку') {
        const paymentMessage = `💳 <b>Выберите период подписки:</b>\n\n`;
        await bot.sendMessage(chatId, paymentMessage, { 
          parse_mode: 'HTML',
          reply_markup: paymentOptionsKeyboard.reply_markup
        });
        return res.status(200).json({ ok: true });
      }

      // Обработка вариантов оплаты
      if (text === '1 месяц' || text === '3 месяца' || text === '1 год') {
        // Пока просто подтверждаем выбор (позже здесь будет интеграция с платежной системой)
        let periodText = '';
        if (text === '1 месяц') periodText = '1 месяц';
        else if (text === '3 месяца') periodText = '3 месяца';
        else if (text === '1 год') periodText = '1 год';

        await bot.sendMessage(chatId, `✅ Вы выбрали подписку на ${periodText}\n\n🔜 Интеграция с платежной системой будет добавлена позже.`, menuKeyboard);
        return res.status(200).json({ ok: true });
      }

      // Обработка кнопки "Назад"
      if (text === '◀️ Назад' || text === '◀️ Назад в меню') {
        await bot.sendMessage(chatId, 'Главное меню:', menuKeyboard);
        return res.status(200).json({ ok: true });
      }

      // Для всех остальных сообщений показываем меню
      await bot.sendMessage(chatId, 'Используйте кнопки меню для навигации:', menuKeyboard);

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Error:', error);
      res.status(200).json({ ok: true });
    }
  } else {
    res.status(200).send('Bot is running');
  }
};
