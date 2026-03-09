/**
 * API: составление программы в БД (здоровье + дневник до окончания квиза) и текст описания для чата.
 * Вызывается при открытии чата после нажатия «Создать программу»: сначала создаёт программу, затем описание.
 */
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { generateProgramForUser } = require('../lib/programGenerator.js');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { persistSession: false, autoRefreshToken: false }
  );
}

async function loadDiagnosticAndProgram(telegramId) {
  const supabase = getSupabase();

  const [userResult, answersResult, programResult] = await Promise.all([
    supabase.from('users').select('quiz_completed, analyses_uploaded').eq('telegram_id', telegramId).single(),
    supabase
      .from('quiz_answers')
      .select('question_id, answer_text, question_text')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: true }),
    supabase
      .from('health_programs')
      .select('supplements, nutrition, stress, sleep, goals')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const { data: userData, error: userError } = userResult;
  const { data: answers, error: answersError } = answersResult;
  const { data: program } = programResult;

  if (userError || !userData || answersError) {
    return null;
  }

  let analysisPhotos = [];
  if (userData.analyses_uploaded) {
    const { data: photos } = await supabase
      .from('user_analysis_photos')
      .select('id, analysis_group, description')
      .eq('telegram_id', telegramId)
      .limit(20);
    analysisPhotos = photos || [];
  }

  const personal_data = {};
  const additional_answers = {};
  const quiz_answers = {};

  (answers || []).forEach((a) => {
    if (['fullName', 'birthDate', 'profession', 'city', 'weight', 'height', 'sport', 'gender'].includes(a.question_id)) {
      personal_data[a.question_id] = a.answer_text;
    } else if (['discomfort', 'diagnosis', 'treatment'].includes(a.question_id)) {
      additional_answers[a.question_id] = a.answer_text;
    } else {
      quiz_answers[a.question_id] = { question: a.question_text, answer: a.answer_text };
    }
  });

  return {
    personal_data,
    additional_answers,
    quiz_answers,
    analysis_photos: analysisPhotos,
    program: program || null
  };
}

function buildDescriptionPrompt(data) {
  const p = data.personal_data || {};
  const add = data.additional_answers || {};
  const qa = data.quiz_answers || {};
  const program = data.program;
  const firstName = (p.fullName || '').split(/\s+/)[0] || 'Пользователь';

  let prompt = `Ты — ИИ-ассистент "Профи" (PROBIOHACKING), специалист-фитотерапевт. По данным ниже составь полное описание программы в чате. Ответ должен быть ОБЯЗАТЕЛЬНО в следующем формате, без пропусков.\n\n`;

  prompt += '**Данные пользователя:**\n';
  prompt += 'Личные данные: ';
  Object.entries(p).forEach(([k, v]) => { if (v) prompt += `${k}: ${v}; `; });
  prompt += '\n';
  if (add.discomfort) prompt += `Жалобы: ${add.discomfort}\n`;
  if (add.diagnosis) prompt += `Диагнозы: ${add.diagnosis}\n`;
  if (add.treatment) prompt += `Текущее лечение/БАДы: ${add.treatment}\n`;

  if (Object.keys(qa).length > 0) {
    prompt += '\nОтветы квиза:\n';
    Object.values(qa).forEach(({ question, answer }) => { prompt += `- ${question}: ${answer}\n`; });
  }

  if (data.analysis_photos && data.analysis_photos.length > 0) {
    prompt += '\nЗагруженные анализы (распознанный текст):\n';
    data.analysis_photos.forEach((ph, idx) => {
      const desc = (ph.description || '').toString().slice(0, 500);
      if (desc) prompt += `  Файл ${idx + 1} (${ph.analysis_group}): ${desc}${desc.length >= 500 ? '...' : ''}\n`;
    });
  }

  if (program) {
    prompt += '\n**Уже составленная программа (обязательно используй для блоков и таблицы):**\n';
    if (program.supplements) prompt += `Добавки/нутрицевтика: ${program.supplements}\n`;
    if (program.nutrition) prompt += `Питание: ${program.nutrition}\n`;
    if (program.stress) prompt += `Стресс: ${program.stress}\n`;
    if (program.sleep) prompt += `Сон: ${program.sleep}\n`;
    if (program.goals) prompt += `Цели: ${String(program.goals).replace(/\n/g, '; ')}\n`;
  }

  prompt += `

---

**СТРОГО выведи ответ в таком формате (ничего не пропускай):**

**1. Приветствие (одним абзацем):**  
Здравствуйте, ${firstName}. Завершена первичная обработка ваших диагностических данных. На основании жалоб и лабораторных показателей (и анализов, если есть) я составил предварительный синдромальный профиль. Давайте его обсудим и наметим поэтапный план коррекции.

**2. Вводная фраза:**  
Синдромальный анализ выявил [укажи число] ключевых взаимосвязанных блоков:

**3. Блоки (для каждого блока — заголовок, Данные, Интерпретация):**  
Например:  
**1. Блок «Энергия и метаболизм»**  
**Данные:** [жалобы пользователя по этой теме; если есть анализы — конкретные показатели с целевыми значениями в скобках, например: ферритин 22 мкг/л (целевой для женщин >50-70), витамин D — 18 нг/мл (целевой коридор 50-80 нг/мл)].  
**Интерпретация:** [краткое объяснение: что это значит для здоровья, связь с энергией/метаболизмом].

**2. Блок «Углеводный обмен и аппетит»**  
**Данные:** ... **Интерпретация:** ...

**3. Блок «Стресс и восстановление»** (или другие блоки по данным пользователя)  
**Данные:** ... **Интерпретация:** ...

**4. Ключевые задачи:**  
Таким образом, ключевые задачи на первые 3 месяца:  
1) [первая задача].  
2) [вторая задача].  
3) [третья задача].  
Предлагаю комплексный протокол, разбитый на категории, как это делает специалист.

**5. Заголовок программы:**  
**Персональная программа коррекции**  
(первый этап, 1-3 месяца)

**6. Категория 1: Нутрицевтическая поддержка (добавки)**  
Оформи в виде таблицы или по строкам с подзаголовками. Для КАЖДОЙ добавки/фитосредства (из программы: магний, витамин D, железо, ромашка, мелисса и т.д.) укажи:  
- **Название**  
- **Дозировка и схема** (например: 30-50 мг железа утром натощак через день)  
- **Цель и обоснование** (зачем, как влияет на здоровье)  
- **Важные условия** (с чем не сочетать, контроль анализов, длительность курса)

**7. Категория 2: Персонализированное питание**  
**Принцип 1: [название]**  
**Действие:** [конкретные рекомендации по приёму пищи].  
**Обоснование:** [почему это важно].  

**Принцип 2: [название]**  
**Действие:** ... **Обоснование:** ...

(Принцип 3 при необходимости.)

Пиши развёрнуто, используй данные пользователя и составленную программу. Не выводи JSON и служебные маркеры. Ответ только текстом в указанной структуре.`;

  return prompt;
}

function callDeepseek(prompt) {
  if (!DEEPSEEK_API_KEY) return Promise.resolve('');

  return new Promise((resolve, reject) => {
    const url = new URL(DEEPSEEK_API_URL);
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'Ты — экспертный ИИ-ассистент "Профи", фитотерапевт. Отвечай только текстом для отображения в чате: без JSON, без маркеров ===.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.75,
      max_tokens: 3500,
      stream: false
    });

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk.toString()));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode !== 200 || json.error) {
              const errMsg = json?.error?.message || json?.error || 'Ошибка AI (DeepSeek)';
              return reject(new Error(errMsg));
            }
            const content = json?.choices?.[0]?.message?.content || '';
            resolve(content);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-WebApp-Data');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const telegramData = req.headers['x-telegram-webapp-data'];
    if (!telegramData) {
      return res.status(401).json({ success: false, error: 'No Telegram data' });
    }

    const params = {};
    telegramData.split('&').forEach((param) => {
      const [key, value] = param.split('=');
      if (key && value) {
        try {
          params[key] = decodeURIComponent(value.replace(/\+/g, ' '));
        } catch (e) {
          params[key] = value;
        }
      }
    });

    const user = JSON.parse(params.user || '{}');
    const telegramId = user.id;
    if (!telegramId) {
      return res.status(401).json({ success: false, error: 'Invalid user' });
    }

    // Сначала создаём и сохраняем программу и дневник в БД (здоровье + дневник до окончания квиза)
    try {
      await generateProgramForUser(telegramId);
    } catch (e) {
      console.error('program-description: generateProgramForUser error:', e);
      return res.status(500).json({ success: false, error: 'Не удалось составить программу в БД. ' + (e && e.message ? e.message : '') });
    }

    const data = await loadDiagnosticAndProgram(telegramId);
    if (!data) {
      console.error('program-description: loadDiagnosticAndProgram returned null for', telegramId);
      return res.status(404).json({ success: false, error: 'Нет данных диагностики. Пройдите квиз заново.' });
    }

    const prompt = buildDescriptionPrompt(data);
    const description = await callDeepseek(prompt);

    if (!description || !description.trim()) {
      return res.status(500).json({ success: false, error: 'ИИ не вернул описание. Попробуйте позже.' });
    }

    return res.status(200).json({ description: description.trim() });
  } catch (e) {
    console.error('program-description error:', e);
    const msg = (e && e.message) ? e.message : 'Ошибка сервера';
    return res.status(500).json({ success: false, error: msg });
  }
};

module.exports.loadDiagnosticAndProgram = loadDiagnosticAndProgram;
module.exports.buildDescriptionPrompt = buildDescriptionPrompt;
