/**
 * API: генерация ссылки на оплату Robokassa.
 * POST body: { telegramId, months } (months: 1, 3 или 12)
 */
const { createPaymentLink } = require('../lib/robokassa.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  // Temporarily block payments regardless of other config
  if (process.env.PAYMENTS_ENABLED === '0') {
    return res.status(503).json({ success: false, error: 'Payments disabled' });
  }

  const { telegramId, months } = req.body || {};
  const result = await createPaymentLink(telegramId, months);

  if (result.error) {
    const code = (result.error === 'Payment system not configured' || result.error === 'Payments disabled') ? 503 : 400;
    return res.status(code).json({ success: false, error: result.error });
  }

  return res.status(200).json({
    success: true,
    paymentUrl: result.paymentUrl,
    invId: result.invId,
    outSum: result.outSum,
    periodText: result.periodText
  });
};
