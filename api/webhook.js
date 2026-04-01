const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const token = process.env.BOT_TOKEN;
// URL мини-аппа на нашем VPS-домене
const miniAppUrl = process.env.MINI_APP_URL || 'https://probio-hacking.store';
// URL публичной оферты (можно переопределить через env)
const publicOfferUrl = process.env.PUBLIC_OFFER_URL || `${miniAppUrl}/offer.html`;

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
  const paymentsEnabled = process.env.PAYMENTS_ENABLED !== '0';
  return {
    reply_markup: {
      keyboard: [
        [
          ...(paymentsEnabled ? [{ text: '💳 Оплатить подписку' }] : []),
          { text: '👤 Профиль' }
        ],
        [
          { text: '📖 Инструкция' },
          { text: '🚀 Открыть мини ап' }
        ],
        [
          { text: 'ℹ️ Информация' }
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

// Оплата через Robokassa: генерация ссылки напрямую (без HTTP-запроса к себе)
const { createPaymentLink } = require('../lib/robokassa.js');

// Функция для форматирования информации о подписке
function formatSubscriptionInfo(subData) {
  if (!subData) {
    return '❌ Не удалось загрузить информацию о подписке';
  }

  // null => безлимитная (активна по умолчанию)
  const isActive = subData.subscription_active !== false;
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
      const { message, callback_query } = req.body;
      const paymentsEnabled = process.env.PAYMENTS_ENABLED !== '0';
      const paymentsUnavailableText = 'Функция оплаты временно недоступна.';

      // Обработка callback_query (нажатия на inline кнопки)
      if (callback_query) {
        const chatId = callback_query.message.chat.id;
        const data = callback_query.data;

        if (data === 'show_payment_options') {
          if (!paymentsEnabled) {
            await bot.answerCallbackQuery(callback_query.id, {
              text: paymentsUnavailableText,
              show_alert: true
            });
            return res.status(200).json({ ok: true });
          }

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
          if (!paymentsEnabled) {
            await bot.answerCallbackQuery(callback_query.id, {
              text: paymentsUnavailableText,
              show_alert: true
            });
            return res.status(200).json({ ok: true });
          }

          const period = parseInt(data.split('_')[1]);
          const periodText = period === 1 ? '1 месяц' : period === 3 ? '3 месяца' : '1 год';
          const telegramId = callback_query.from.id;

          const result = await createPaymentLink(telegramId, period);
          const paymentUrl = result.paymentUrl || null;
          if (result.error) {
            console.error('Robokassa createPaymentLink:', result.error);
          }

          if (paymentUrl) {
            await bot.answerCallbackQuery(callback_query.id, {
              text: `Ссылка на оплату подписки на ${periodText} создана`
            });
            const sent = await bot.sendMessage(chatId,
              `💳 Оплата подписки на *${periodText}*\n\nНажмите кнопку ниже — откроется страница оплаты Robokassa в браузере. После успешной оплаты подписка активируется автоматически.`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🌐 Перейти к оплате', url: paymentUrl }]
                  ]
                }
              }
            );
            // Сохраняем message_id для последующего удаления после оплаты
            try {
              if (sent && sent.message_id && result.invId) {
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(
                  process.env.SUPABASE_URL,
                  process.env.SUPABASE_ANON_KEY,
                  { persistSession: false, autoRefreshToken: false }
                );
                await supabase
                  .from('robokassa_payments')
                  .update({ message_id: sent.message_id })
                  .eq('inv_id', result.invId);
              }
            } catch (e) {
              console.warn('Failed to save payment message_id:', e.message);
            }
          } else {
            await bot.answerCallbackQuery(callback_query.id, {
              text: 'Ошибка при создании ссылки на оплату. Попробуйте позже.',
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
          
          // Сообщение с inline‑кнопками (мини‑апп + публичная оферта)
          await bot.sendMessage(chatId, welcomeMessage, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🚀 Открыть мини ап', web_app: { url: miniAppUrl } }
                ],
                [
                  { text: '📄 Публичная оферта', url: publicOfferUrl }
                ]
              ]
            }
          });

          // Отдельным сообщением включаем основное меню (reply‑клавиатура)
          await bot.sendMessage(chatId, 'Выберите действие:', getMainKeyboard());
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

          // Если подписка явно неактивна (false), добавляем кнопку оплаты (если платежи включены)
          const paymentsEnabled = process.env.PAYMENTS_ENABLED !== '0';
          if (paymentsEnabled && subData && subData.subscription_active === false) {
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
          if (!paymentsEnabled) {
            await bot.sendMessage(chatId, paymentsUnavailableText, getMainKeyboard());
            return res.status(200).json({ ok: true });
          }

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

        // Кнопка "Информация" — показываем ссылку на публичную оферту
        if (text === 'ℹ️ Информация') {
          const infoMessage = '📄 Публичная оферта сервиса PROBIOHACKING доступна по ссылке ниже.';

          await bot.sendMessage(chatId, infoMessage, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Открыть публичную оферту', url: publicOfferUrl }
                ]
              ]
            }
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
