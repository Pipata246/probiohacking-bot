const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const token = process.env.BOT_TOKEN;
const miniAppUrl = process.env.MINI_APP_URL || 'https://probiohacking-bot.vercel.app';

// Создаем бота с опциями для serverless окружения
const bot = new TelegramBot(token, { polling: false });

// Инициализация Supabase клиента
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Функция для создания постоянной клавиатуры (нижнее меню)
function getMainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: '💳 Оплатить подписку' },
          { text: '👤 Профиль' }
        ],
        [
          { text: '📖 Инструкция' },
          { text: '🚀 Открыть мини ап' }
        ]
      ],
      resize_keyboard: true,
      persistent: true
    }
  };
}

// Функция для создания inline клавиатуры с кнопкой открытия мини-аппа
function getMiniAppInlineKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🚀 Открыть мини ап', web_app: { url: miniAppUrl } }
        ]
      ]
    }
  };
}

// Функция для получения данных о подписке пользователя
async function getUserSubscriptionData(telegramId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('subscription_active, subscription_start_date, subscription_end_date')
      .eq('telegram_id', telegramId)
      .single();

    if (error) {
      console.error('Error fetching subscription data:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception in getUserSubscriptionData:', error);
    return null;
  }
}

// Функция для обновления статуса подписки после оплаты
async function updateSubscriptionAfterPayment(telegramId, months) {
  try {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    const { data, error } = await supabase
      .from('users')
      .update({
        subscription_active: true,
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId)
      .select();

    if (error) {
      console.error('Error updating subscription:', error);
      return false;
    }

    console.log('✅ Subscription updated successfully:', data);
    return true;
  } catch (error) {
    console.error('Exception in updateSubscriptionAfterPayment:', error);
    return false;
  }
}

// Функция для создания invoice (счета на оплату)
async function createInvoice(chatId, months, price) {
  const periodText = months === 1 ? '1 месяц' : months === 3 ? '3 месяца' : '1 год';
  const title = `Подписка PROBIOHACKING на ${periodText}`;
  const description = `Активация подписки на ${periodText}. Доступ ко всем функциям приложения.`;

  try {
    await bot.sendInvoice(chatId, {
      title: title,
      description: description,
      payload: `subscription_${months}_months`,
      provider_token: process.env.PAYMENT_PROVIDER_TOKEN || 'TEST_PROVIDER_TOKEN',
      currency: 'RUB',
      prices: [
        {
          label: `Подписка на ${periodText}`,
          amount: price * 100 // Цена в копейках
        }
      ],
      start_parameter: `subscription_${months}`,
      photo_url: 'https://probiohacking-bot.vercel.app/logo.png',
      need_name: false,
      need_phone_number: false,
      need_email: false,
      need_shipping_address: false,
      send_phone_number_to_provider: false,
      send_email_to_provider: false,
      is_flexible: false
    });
    return true;
  } catch (error) {
    console.error('Error creating invoice:', error);
    return false;
  }
}

// Функция для форматирования информации о подписке
function formatSubscriptionInfo(subData) {
  if (!subData) {
    return '❌ Не удалось загрузить информацию о подписке';
  }

  const isActive = subData.subscription_active === true;
  const startDate = subData.subscription_start_date 
    ? new Date(subData.subscription_start_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
  const endDate = subData.subscription_end_date 
    ? new Date(subData.subscription_end_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Безлимитная';

  let message = '👤 **Профиль**\n\n';
  message += `**Статус подписки:** ${isActive ? '✅ Активна' : '❌ Неактивна'}\n`;
  
  if (isActive) {
    message += `**Действует до:** ${endDate}\n`;
  }
  
  if (startDate !== '—') {
    message += `**Дата начала:** ${startDate}\n`;
  }

  return message;
}

// Функция для показа вариантов оплаты
function getPaymentOptionsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1 месяц', callback_data: 'payment_1' }
        ],
        [
          { text: '3 месяца', callback_data: 'payment_3' }
        ],
        [
          { text: '1 год', callback_data: 'payment_12' }
        ],
        [
          { text: '◀️ Назад', callback_data: 'back_to_main' }
        ]
      ]
    }
  };
}

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const { message, callback_query, pre_checkout_query, successful_payment } = req.body;

      // Обработка pre_checkout_query (подтверждение перед оплатой)
      if (pre_checkout_query) {
        const queryId = pre_checkout_query.id;
        const payload = pre_checkout_query.invoice_payload;
        
        console.log('Pre-checkout query received:', { queryId, payload });
        
        // Автоматически подтверждаем платеж
        try {
          await bot.answerPreCheckoutQuery(queryId, true);
          console.log('✅ Pre-checkout query approved');
        } catch (error) {
          console.error('Error answering pre-checkout query:', error);
          await bot.answerPreCheckoutQuery(queryId, false, {
            error_message: 'Произошла ошибка при обработке платежа'
          });
        }
        
        return res.status(200).json({ ok: true });
      }

      // Обработка successful_payment (успешная оплата)
      if (successful_payment && message) {
        const chatId = message.chat.id;
        const telegramId = message.from.id;
        const payload = successful_payment.invoice_payload;
        
        console.log('Successful payment received:', { telegramId, payload });
        
        // Извлекаем количество месяцев из payload (формат: subscription_1_months)
        const monthsMatch = payload.match(/subscription_(\d+)_months/);
        if (monthsMatch) {
          const months = parseInt(monthsMatch[1]);
          
          // Обновляем подписку в БД
          const success = await updateSubscriptionAfterPayment(telegramId, months);
          
          if (success) {
            const periodText = months === 1 ? '1 месяц' : months === 3 ? '3 месяца' : '1 год';
            await bot.sendMessage(chatId, 
              `✅ Оплата успешно обработана!\n\n` +
              `Ваша подписка активирована на ${periodText}.\n` +
              `Теперь у вас есть доступ ко всем функциям приложения.`,
              getMainKeyboard()
            );
          } else {
            await bot.sendMessage(chatId, 
              '❌ Произошла ошибка при активации подписки. Пожалуйста, обратитесь в поддержку.',
              getMainKeyboard()
            );
          }
        } else {
          console.error('Invalid payload format:', payload);
          await bot.sendMessage(chatId, 
            '❌ Произошла ошибка при обработке платежа. Пожалуйста, обратитесь в поддержку.',
            getMainKeyboard()
          );
        }
        
        return res.status(200).json({ ok: true });
      }

      // Обработка callback_query (нажатия на inline кнопки)
      if (callback_query) {
        const chatId = callback_query.message.chat.id;
        const data = callback_query.data;

        if (data === 'show_payment_options') {
          const paymentMessage = '💳 **Выберите период подписки:**';
          
          await bot.editMessageText(paymentMessage, {
            chat_id: chatId,
            message_id: callback_query.message.message_id,
            ...getPaymentOptionsKeyboard(),
            parse_mode: 'Markdown'
          });
          
          await bot.answerCallbackQuery(callback_query.id);
          return res.status(200).json({ ok: true });
        }

        if (data.startsWith('payment_')) {
          const period = parseInt(data.split('_')[1]);
          const periodText = period === 1 ? '1 месяц' : period === 3 ? '3 месяца' : '1 год';
          
          // Цены в рублях (можно настроить)
          const prices = {
            1: 990,   // 990 рублей за месяц
            3: 2490,  // 2490 рублей за 3 месяца
            12: 8990  // 8990 рублей за год
          };
          
          const price = prices[period] || 990;
          
          // Создаем invoice (счет на оплату)
          const invoiceCreated = await createInvoice(chatId, period, price);
          
          if (invoiceCreated) {
            await bot.answerCallbackQuery(callback_query.id, {
              text: `Открыто окно оплаты для подписки на ${periodText}`
            });
          } else {
            await bot.answerCallbackQuery(callback_query.id, {
              text: 'Ошибка при создании счета на оплату. Попробуйте позже.',
              show_alert: true
            });
          }
          
          return res.status(200).json({ ok: true });
        }

        if (data === 'back_to_main') {
          await bot.editMessageText('Выберите действие:', {
            chat_id: chatId,
            message_id: callback_query.message.message_id,
            ...getMainKeyboard()
          });
          
          await bot.answerCallbackQuery(callback_query.id);
          return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });
      }

      // Обработка обычных сообщений
      if (message) {
        const chatId = message.chat.id;
        const text = message.text;

        // Команда /start
        if (text === '/start') {
          const welcomeMessage = `🤖 PROBIOHACKING — ваш цифровой наставник по здоровью

Откройте Mini App для персональной диагностики и рекомендаций`;

          await bot.sendMessage(chatId, welcomeMessage, getMainKeyboard());
          return res.status(200).json({ ok: true });
        }

        // Кнопка "Профиль"
        if (text === '👤 Профиль') {
          const telegramId = message.from.id;
          const subData = await getUserSubscriptionData(telegramId);
          const profileMessage = formatSubscriptionInfo(subData);

          const keyboard = {
            reply_markup: {
              inline_keyboard: []
            }
          };

          // Если подписка неактивна, добавляем кнопку оплаты
          if (subData && !subData.subscription_active) {
            keyboard.reply_markup.inline_keyboard.push([
              { text: '💳 Оплатить подписку', callback_data: 'show_payment_options' }
            ]);
          }

          await bot.sendMessage(chatId, profileMessage, {
            ...keyboard,
            parse_mode: 'Markdown'
          });
          return res.status(200).json({ ok: true });
        }

        // Кнопка "Оплатить подписку"
        if (text === '💳 Оплатить подписку') {
          const paymentMessage = '💳 **Выберите период подписки:**';
          
          await bot.sendMessage(chatId, paymentMessage, {
            ...getPaymentOptionsKeyboard(),
            parse_mode: 'Markdown'
          });
          return res.status(200).json({ ok: true });
        }

        // Кнопка "Открыть мини ап" - отправляем сообщение с inline кнопкой
        if (text === '🚀 Открыть мини ап') {
          const miniAppMessage = '🚀 Откройте мини-апп для доступа к персональной диагностике и рекомендациям:';
          
          await bot.sendMessage(chatId, miniAppMessage, getMiniAppInlineKeyboard());
          return res.status(200).json({ ok: true });
        }

        // Кнопка "Инструкция"
        if (text === '📖 Инструкция') {
          const instructionMessage = `📖 *Инструкция по использованию PROBIOHACKING*

*1. Диагностика (15 мин)*
Пройдите опрос о состоянии здоровья и загрузите анализы. ИИ выявит дисбалансы организма.

*2. ИИ-наставник "Профи"*
Задайте вопрос в чате → получите персональную программу на основе 5 медицинских систем: нутрициологии, фитотерапии, Аюрведы, ТКМ и тибетской медицины.

*3. Здоровье*
Ваша программа: питание, добавки, управление стрессом и сном. Всё в одном месте.

*4. Дневник*
Отслеживайте прогресс. Напоминания помогут следовать плану.

*5. Поддержка эксперта*
Личный куратор адаптирует программу и ответит на вопросы.

*Как начать:*
1️⃣ Нажмите "🚀 Открыть мини ап"
2️⃣ Пройдите диагностику
3️⃣ Загрузите анализы (если есть)
4️⃣ Задайте вопрос ИИ-наставнику
5️⃣ Получите персональную программу`;

          await bot.sendMessage(chatId, instructionMessage, {
            parse_mode: 'Markdown'
          });
          return res.status(200).json({ ok: true });
        }

        // Для всех остальных сообщений показываем главное меню
        await bot.sendMessage(chatId, 'Выберите действие:', getMainKeyboard());
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Error:', error);
      res.status(200).json({ ok: true });
    }
  } else {
    res.status(200).send('Bot is running');
  }
};
