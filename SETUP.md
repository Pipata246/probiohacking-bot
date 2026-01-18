# Настройка бота на Vercel

## Шаг 1: Добавить переменную окружения в Vercel

1. Зайди на https://vercel.com/pipata246/probiohacking-bot
2. Перейди в **Settings** → **Environment Variables**
3. Добавь переменную:
   - **Name**: `BOT_TOKEN`
   - **Value**: `8313677702:AAFtaix5kgylEZ6sm9VF1nFkdR0ob9f3AMM`
   - **Environment**: Production, Preview, Development (выбери все)
4. Нажми **Save**

## Шаг 2: Redeploy проект

1. Перейди в **Deployments**
2. Найди последний деплой
3. Нажми три точки → **Redeploy**
4. Дождись завершения

## Шаг 3: Установить webhook

Открой в браузере:
```
https://probiohacking-bot.vercel.app/api/setWebhook
```

Должен вернуться JSON:
```json
{
  "success": true,
  "message": "Webhook установлен",
  "url": "https://probiohacking-bot.vercel.app/api/webhook"
}
```

## Шаг 4: Проверить бота

1. Открой бота в Telegram
2. Отправь `/start`
3. Должно прийти сообщение с кнопкой

## Если не работает:

Проверь логи в Vercel:
1. Перейди в **Deployments**
2. Кликни на последний деплой
3. Перейди в **Functions**
4. Посмотри логи `api/webhook.js`
