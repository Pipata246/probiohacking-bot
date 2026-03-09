/**
 * ResultURL Robokassa: оповещение об успешной оплате.
 * Robokassa вызывает этот URL GET-запросом с параметрами OutSum, InvId, SignatureValue, Shp_*.
 * Нужно проверить подпись (Пароль#2), обновить подписку пользователя и вернуть "OK" + InvId.
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { persistSession: false, autoRefreshToken: false }
);

const bot = process.env.BOT_TOKEN ? new TelegramBot(process.env.BOT_TOKEN, { polling: false }) : null;

function buildResultSignature(outSum, invId, password2, shpSorted) {
  const part = `${outSum}:${invId}:${password2}`;
  const shpStr = shpSorted.length ? ':' + shpSorted.join(':') : '';
  return crypto.createHash('md5').update(part + shpStr, 'utf8').digest('hex').toUpperCase();
}

async function updateSubscriptionAfterPayment(telegramId, months) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + months);

  const { error } = await supabase
    .from('users')
    .update({
      subscription_active: true,
      subscription_start_date: startDate.toISOString(),
      subscription_end_date: endDate.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('telegram_id', telegramId);

  return { ok: !error, endDate };
}

module.exports = async (req, res) => {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(405).send('Method not allowed');
  }

  const query = method === 'GET' ? req.query : (req.body || {});
  const outSum = query.OutSum != null ? String(query.OutSum).trim() : null;
  const invId = query.InvId != null ? String(query.InvId).trim() : null;
  const signatureValue = query.SignatureValue != null ? String(query.SignatureValue).trim() : null;

  if (!outSum || !invId || !signatureValue) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('Missing OutSum, InvId or SignatureValue');
  }

  const password2 = process.env.ROBOKASSA_PASSWORD2;
  if (!password2) {
    console.error('Robokassa Result: ROBOKASSA_PASSWORD2 not set');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('Server config error');
  }

  const shpKeys = Object.keys(query).filter(k => k.toLowerCase().startsWith('shp_'));
  shpKeys.sort((a, b) => a.localeCompare(b));
  const shpSorted = shpKeys.map(k => `${k}=${query[k]}`);

  const expectedSig = buildResultSignature(outSum, invId, password2, shpSorted);
  if (signatureValue.toUpperCase() !== expectedSig) {
    console.error('Robokassa Result: invalid signature', { invId });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('Invalid signature');
  }

  const invIdNum = parseInt(invId, 10);
  if (Number.isNaN(invIdNum)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('Invalid InvId');
  }

  const { data: row, error: fetchError } = await supabase
    .from('robokassa_payments')
    .select('inv_id, telegram_id, months, processed_at, message_id')
    .eq('inv_id', invIdNum)
    .single();

  if (fetchError || !row) {
    console.error('Robokassa Result: payment not found', invIdNum, fetchError);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Payment not found');
  }

  if (row.processed_at) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('OK' + invId);
  }

  const telegramId = Number(row.telegram_id);
  const months = Number(row.months) || 1;

  const { ok: updated, endDate } = await updateSubscriptionAfterPayment(telegramId, months);
  if (!updated) {
    console.error('Robokassa Result: failed to update user subscription', telegramId);
  }

  await supabase
    .from('robokassa_payments')
    .update({ processed_at: new Date().toISOString() })
    .eq('inv_id', invIdNum);

  // Пытаемся удалить исходное сообщение с кнопкой оплаты, если оно известно
  if (bot && row.message_id) {
    try {
      await bot.deleteMessage(telegramId, row.message_id);
    } catch (e) {
      console.warn('Robokassa Result: could not delete payment message', e.message);
    }
  }

  if (bot) {
    try {
      if (updated) {
        const endText = endDate
          ? new Date(endDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : '';
        await bot.sendMessage(
          telegramId,
          `✅ Ваша подписка успешно оплачена и будет действовать до ${endText}.`
        );
      } else {
        await bot.sendMessage(
          telegramId,
          '❌ Оплата получена, но не удалось обновить статус подписки. Пожалуйста, свяжитесь с поддержкой.'
        );
      }
    } catch (e) {
      console.warn('Robokassa Result: could not send final notification', e.message);
    }
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send('OK' + invId);
};
