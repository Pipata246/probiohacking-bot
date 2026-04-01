/**
 * Общая логика Robokassa: генерация ссылки на оплату.
 * Используется и в webhook (без HTTP-запроса), и в API create-payment.
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const ROBOKASSA_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';
const PRICES = { 1: 990, 3: 2490, 12: 8990 };

function isPaymentsEnabled() {
  // Default: enabled. Set PAYMENTS_ENABLED=0 to disable payment link generation.
  return process.env.PAYMENTS_ENABLED !== '0';
}

function getSignatureForPayment(login, outSum, invId, password1, shpParams) {
  const part = `${login}:${outSum}:${invId}:${password1}`;
  const shpStr = shpParams.length ? ':' + shpParams.join(':') : '';
  return crypto.createHash('md5').update(part + shpStr, 'utf8').digest('hex').toUpperCase();
}

/**
 * Создаёт платёж в БД и возвращает URL для перехода в Robokassa.
 * @param {number} telegramId
 * @param {number} months — 1, 3 или 12
 * @returns {{ paymentUrl: string, invId: number, periodText: string } | { error: string }}
 */
async function createPaymentLink(telegramId, months) {
  if (!isPaymentsEnabled()) {
    return { error: 'Payments disabled' };
  }

  const login = process.env.ROBOKASSA_LOGIN;
  const password1 = process.env.ROBOKASSA_PASSWORD1;
  const isTest = process.env.ROBOKASSA_IS_TEST !== '0';

  if (!login || !password1) {
    console.error('Robokassa: ROBOKASSA_LOGIN or ROBOKASSA_PASSWORD1 not set');
    return { error: 'Payment system not configured' };
  }

  if (!telegramId || ![1, 3, 12].includes(months)) {
    return { error: 'Invalid telegramId or months (use 1, 3, 12)' };
  }

  const outSum = (PRICES[months] || 990).toFixed(2);
  const invId = Math.floor(Date.now() / 1000) * 1000 + Math.floor(Math.random() * 1000);
  const periodText = months === 1 ? '1 месяц' : months === 3 ? '3 месяца' : '1 год';
  const description = `Подписка PROBIOHACKING на ${periodText}`;

  const shpParams = [
    `Shp_months=${months}`,
    `Shp_telegram_id=${telegramId}`
  ].sort();

  const signatureValue = getSignatureForPayment(login, outSum, invId, password1, shpParams);

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { persistSession: false, autoRefreshToken: false }
  );

  const { error } = await supabase
    .from('robokassa_payments')
    .insert({
      inv_id: invId,
      telegram_id: Number(telegramId),
      months,
      out_sum: parseFloat(outSum),
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('Robokassa createPaymentLink insert error:', error);
    return { error: error.message || 'Failed to register payment' };
  }

  const params = new URLSearchParams({
    MerchantLogin: login,
    OutSum: outSum,
    InvId: String(invId),
    Description: description,
    SignatureValue: signatureValue,
    Culture: 'ru',
    Encoding: 'utf-8'
  });
  shpParams.forEach(p => {
    const [k, v] = p.split('=');
    params.append(k, v);
  });
  if (isTest) params.set('IsTest', '1');

  const paymentUrl = `${ROBOKASSA_URL}?${params.toString()}`;
  return { paymentUrl, invId, periodText, outSum: parseFloat(outSum) };
}

module.exports = { createPaymentLink };
