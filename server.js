/**
 * Express-сервер для запуска на VPS (вместо Vercel)
 * Загрузи .env и запусти: node server.js
 */
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// API routes (Vercel-style handlers)
app.post('/api/webhook', require('./api/webhook.js'));
app.all('/api/chat', require('./api/chat.js'));
app.all('/api/analysis-photos', require('./api/analysis-photos.js'));
app.all('/api/admin', require('./api/admin.js'));
app.all('/api/chats', require('./api/chats.js'));
app.all('/api/init-user', require('./api/init-user.js'));
app.all('/api/save-all-quiz-answers', require('./api/save-all-quiz-answers.js'));
app.get('/api/health-program', require('./api/health-program.js'));
app.all('/api/diary', require('./api/diary.js'));
app.post('/api/save-program', require('./api/save-program.js'));
app.all('/api/doctors', require('./api/doctors.js'));
app.all('/api/doctor-avatars', require('./api/doctor-avatars.js'));

// SetWebhook — обычно вызывается вручную один раз
app.all('/api/setWebhook', require('./api/setWebhook.js'));

// Robokassa: создание ссылки на оплату и ResultURL
app.post('/api/robokassa-create-payment', require('./api/robokassa-create-payment.js'));
app.all('/api/robokassa-result', require('./api/robokassa-result.js'));

// Статические файлы (Mini App)
app.use(express.static(path.join(__dirname, 'public')));

// Главная
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Mini App: http://localhost:${PORT}`);
});
