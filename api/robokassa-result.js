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

  return !error;
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
    .select('inv_id, telegram_id, months, processed_at')
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

  const updated = await updateSubscriptionAfterPayment(telegramId, months);
  if (!updated) {
    console.error('Robokassa Result: failed to update user subscription', telegramId);
  }

  await supabase
    .from('robokassa_payments')
    .update({ processed_at: new Date().toISOString() })
    .eq('inv_id', invIdNum);

  if (updated && bot) {
    const periodText = months === 1 ? '1 месяц' : months === 3 ? '3 месяца' : '1 год';
    try {
      await bot.sendMessage(telegramId,
        `✅ Оплата успешно обработана!\n\nВаша подписка активирована на ${periodText}.\nТеперь у вас есть доступ ко всем функциям приложения.`
      );
    } catch (e) {
      console.warn('Robokassa Result: could not send Telegram notification', e.message);
    }
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send('OK' + invId);
};
