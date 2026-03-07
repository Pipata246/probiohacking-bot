/**
 * Генерация ссылки на оплату Robokassa (переадресация в браузер).
 * POST body: { telegramId, months } (months: 1, 3 или 12)
 * Возвращает: { paymentUrl, invId, outSum, periodText }
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { persistSession: false, autoRefreshToken: false }
);

const ROBOKASSA_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';
const PRICES = { 1: 990, 3: 2490, 12: 8990 };

function getSignatureForPayment(login, outSum, invId, password1, shpParams) {
  // Строка подписи: MerchantLogin:OutSum:InvId:Пароль#1:Shp_months=...:Shp_telegram_id=... (алфавитный порядок Shp_)
  const part = `${login}:${outSum}:${invId}:${password1}`;
  const shpStr = shpParams.length ? ':' + shpParams.join(':') : '';
  return crypto.createHash('md5').update(part + shpStr, 'utf8').digest('hex').toUpperCase();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const login = process.env.ROBOKASSA_LOGIN;
  const password1 = process.env.ROBOKASSA_PASSWORD1;
  const isTest = process.env.ROBOKASSA_IS_TEST !== '0';
  const baseUrl = process.env.MINI_APP_URL || 'https://probio-hacking.store';

  if (!login || !password1) {
    console.error('Robokassa: ROBOKASSA_LOGIN or ROBOKASSA_PASSWORD1 not set');
    return res.status(500).json({ success: false, error: 'Payment system not configured' });
  }

  const { telegramId, months } = req.body || {};
  if (!telegramId || ![1, 3, 12].includes(months)) {
    return res.status(400).json({ success: false, error: 'Invalid telegramId or months (use 1, 3, 12)' });
  }

  const outSum = (PRICES[months] || 990).toFixed(2);
  const invId = Number(String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, '0'));
  const periodText = months === 1 ? '1 месяц' : months === 3 ? '3 месяца' : '1 год';
  const description = `Подписка PROBIOHACKING на ${periodText}`;

  const shpParams = [
    `Shp_months=${months}`,
    `Shp_telegram_id=${telegramId}`
  ].sort();

  const signatureValue = getSignatureForPayment(login, outSum, invId, password1, shpParams);

  try {
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
      console.error('Robokassa create payment insert error:', error);
      return res.status(500).json({ success: false, error: 'Failed to register payment' });
    }
  } catch (e) {
    console.error('Robokassa create payment error:', e);
    return res.status(500).json({ success: false, error: 'Server error' });
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

  return res.status(200).json({
    success: true,
    paymentUrl,
    invId,
    outSum: parseFloat(outSum),
    periodText
  });
};
