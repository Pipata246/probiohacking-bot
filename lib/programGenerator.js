/**
 * Автогенерация программы здоровья и дневника на основе квиза и анализов.
 * Используется после сохранения квиза и после загрузки новых анализов.
 */
const https = require('https');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { persistSession: false, autoRefreshToken: false }
  );
}

// Упрощённая версия getUserDiagnosticData из api/chat.js (без Vision)
async function loadDiagnosticData(telegramId) {
  const supabase = getSupabase();

  // user + quiz_answers
  const [userResult, answersResult] = await Promise.all([
    supabase
      .from('users')
      .select('id, quiz_completed, analyses_uploaded')
      .eq('telegram_id', telegramId)
      .single(),
    supabase
      .from('quiz_answers')
      .select('question_id, answer_text, question_text')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: true })
  ]);

  const { data: userData, error: userError } = userResult;
  const { data: answers, error: answersError } = answersResult;

  if (userError || !userData) {
    console.log('loadDiagnosticData: user not found or error:', userError);
    return null;
  }
  if (answersError) {
    console.error('loadDiagnosticData: quiz answers error:', answersError);
    return null;
  }

  // Анализы, если загружены
  let analysisPhotos = [];
  if (userData.analyses_uploaded) {
    const { data: photos } = await supabase
      .from('user_analysis_photos')
      .select('id, analysis_group, description')
      .eq('telegram_id', telegramId)
      .limit(20);
    analysisPhotos = photos || [];
  }

  const diagnosticData = {
    quiz_completed: userData.quiz_completed,
    analyses_uploaded: userData.analyses_uploaded,
    personal_data: {},
    quiz_answers: {},
    additional_answers: {},
    analysis_photos: analysisPhotos
  };

  answers.forEach(answer => {
    const questionId = answer.question_id;

    if (['fullName', 'birthDate', 'profession', 'city', 'weight', 'height', 'sport', 'gender'].includes(questionId)) {
      diagnosticData.personal_data[questionId] = answer.answer_text;
    } else if (['discomfort', 'diagnosis', 'treatment'].includes(questionId)) {
      diagnosticData.additional_answers[questionId] = answer.answer_text;
    } else {
      diagnosticData.quiz_answers[questionId] = {
        question: answer.question_text,
        answer: answer.answer_text
      };
    }
  });

  return diagnosticData;
}

// Нормализация JSON-подстроки перед parse (запятые перед } ], типичные артефакты)
function normalizeJsonString(s) {
  if (!s || typeof s !== 'string') return s;
  let out = s.trim();
  out = out.replace(/,\s*([}\]])/g, '$1');
  return out;
}

// Баланс фигурных скобок от позиции openIdx (строки не учитываются — упрощённо; для большинства ответов хватает)
function sliceBalancedBraces(text, openIdx) {
  if (openIdx < 0 || openIdx >= text.length || text[openIdx] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

function tryParseProgramJson(jsonPart) {
  const result = { healthProgram: null, diaryEntries: [] };
  if (!jsonPart || typeof jsonPart !== 'string') return result;
  const normalized = normalizeJsonString(jsonPart);
  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (e) {
    return result;
  }
  const health = parsed.health || parsed.healthProgram || null;
  if (!health || typeof health !== 'object') return result;
  const diary = Array.isArray(parsed.diary) ? parsed.diary : [];
  result.healthProgram = {
    supplements: (health.supplements != null) ? String(health.supplements) : '',
    nutrition: (health.nutrition != null) ? String(health.nutrition) : '',
    stress: (health.stress != null) ? String(health.stress) : '',
    sleep: (health.sleep != null) ? String(health.sleep) : '',
    goals: Array.isArray(health.goals) ? health.goals.map(g => String(g || '')) : []
  };
  result.diaryEntries = diary
    .map(e => ({
      time: (e && (e.time != null || e.entry_time != null)) ? String(e.time || e.entry_time || '') : '',
      title: (e && (e.title != null || e.name != null)) ? String(e.title || e.name || '') : '',
      notes: (e && (e.notes != null || e.comment != null)) ? String(e.notes || e.comment || '') : ''
    }))
    .filter(e => e.time && e.title);
  return result;
}

// Вырезание JSON программы из ответа (устойчиво к обрезке, нескольким ``` блокам, без END-маркера)
function extractProgramFromContent(text) {
  const result = {
    healthProgram: null,
    diaryEntries: []
  };
  if (!text || typeof text !== 'string') return result;

  const START = '=== STRUCTURED_PROGRAM_JSON_START ===';
  const END = '=== STRUCTURED_PROGRAM_JSON_END ===';
  const startIdx = text.indexOf(START);
  const endIdx = text.indexOf(END);

  // 1) Маркеры START и END
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonPart = text.slice(startIdx + START.length, endIdx).trim();
    const parsed = tryParseProgramJson(jsonPart);
    if (parsed.healthProgram) return parsed;
  }

  // 1b) Только START (модель обрезала ответ) — берём JSON по балансу скобок после первого {
  if (startIdx !== -1 && endIdx === -1) {
    const after = text.slice(startIdx + START.length);
    const braceIdx = after.indexOf('{');
    if (braceIdx !== -1) {
      const absStart = startIdx + START.length + braceIdx;
      const balanced = sliceBalancedBraces(text, absStart);
      if (balanced && balanced.includes('"health"')) {
        const parsed = tryParseProgramJson(balanced);
        if (parsed.healthProgram) return parsed;
      }
    }
  }

  // 2) Все блоки ``` ... ``` — пробуем каждый, где есть health и diary
  const codeBlockRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let m;
  while ((m = codeBlockRe.exec(text)) !== null) {
    const block = m[1].trim();
    if (!block.includes('health')) continue;
    const parsed = tryParseProgramJson(block);
    if (parsed.healthProgram) return parsed;
  }

  // 3) Сырой JSON без ограждений: последнее вхождение "health"/"diary" + эвристика как в api/chat.js
  const healthPos = text.lastIndexOf('"health"');
  const diaryPos = text.lastIndexOf('"diary"');
  const anchor = Math.max(healthPos, diaryPos);
  if (anchor !== -1) {
    const beforeAnchor = text.slice(0, anchor);
    const jsonStart = beforeAnchor.lastIndexOf('{');
    if (jsonStart !== -1) {
      const balanced = sliceBalancedBraces(text, jsonStart);
      if (balanced && balanced.includes('"health"')) {
        const parsed = tryParseProgramJson(balanced);
        if (parsed.healthProgram) return parsed;
      }
    }
  }

  // 4) Фолбэк: первый { с "health" без учёта строк (старый алгоритм)
  const healthIdx = text.indexOf('"health"');
  if (healthIdx !== -1) {
    let braceStart = text.lastIndexOf('{', healthIdx);
    if (braceStart === -1) braceStart = text.indexOf('{', healthIdx);
    if (braceStart !== -1) {
      const balanced = sliceBalancedBraces(text, braceStart);
      if (balanced && balanced.includes('"diary"')) {
        const parsed = tryParseProgramJson(balanced);
        if (parsed.healthProgram) return parsed;
      }
    }
  }

  return result;
}

function buildProgramPrompt(diagnosticData) {
  let prompt = 'Ты — PROBIOHACKING AI \"Профи\". По данным ниже составь персональную программу здоровья и дневник на месяц.\n\n';

  if (diagnosticData.personal_data) {
    const p = diagnosticData.personal_data;
    prompt += 'Личные данные:\n';
    Object.entries(p).forEach(([k, v]) => {
      prompt += `- ${k}: ${v}\n`;
    });
  }

  if (diagnosticData.additional_answers) {
    const add = diagnosticData.additional_answers;
    if (add.discomfort) prompt += `\nЖалобы: ${add.discomfort}\n`;
    if (add.diagnosis) prompt += `Диагнозы: ${add.diagnosis}\n`;
    if (add.treatment) prompt += `Текущее лечение/БАДы: ${add.treatment}\n`;
  }

  const qa = diagnosticData.quiz_answers || {};
  if (Object.keys(qa).length > 0) {
    prompt += '\nОтветы квиза по системам организма:\n';
    Object.values(qa).forEach(({ question, answer }) => {
      prompt += `- ${question}: ${answer}\n`;
    });
  }

  if (diagnosticData.analysis_photos && diagnosticData.analysis_photos.length > 0) {
    prompt += '\nЗагруженные анализы (распознанный текст):\n';
    diagnosticData.analysis_photos.forEach((ph, idx) => {
      const desc = (ph.description || '').toString();
      if (desc) {
        const snippet = desc.slice(0, 600);
        prompt += `  Файл ${idx + 1} (${ph.analysis_group}): ${snippet}${snippet.length >= 600 ? '...' : ''}\n`;
      }
    });
  }

  prompt += `

Требования к программе (health):
- supplements: точные добавки с дозировками и схемой приёма (утро/вечер, с едой/натощак). Включай фитотерапию: при стрессе — ромашка, мелисса; при дискомфорте в желудке — чайный гриб (комбуча); при проблемах со сном — магний, ромашковый чай.
- nutrition: конкретные принципы питания (что есть, когда, примеры блюд).
- stress: что делать при стрессе (дыхание, ромашка, прогулка и т.д.).
- sleep: ритуал отхода ко сну, добавки за 1–2 ч до сна.
- goals: 3–5 конкретных целей на месяц.

Требования к дневнику (diary) — табличный формат как у специалиста:
- Каждая запись = одна строка с колонками: Время, Название, Дозировка и схема, Цель и обоснование, Важные условия.
- Для КАЖДОЙ записи в diary задай:
  - time: "HH:00" или "HH:30" (утро 07–09, 12:30, 14–15, 18–19, 20–21).
  - title: точное название (например "Липосомальное железо", "Витамин D3 + K2", "Магний (бисглицинат)", "Берберин", "Завтрак", "Обед", "Ромашковый чай при стрессе").
  - notes: СТРОГО в формате "Дозировка: ... Цель: ... Условия: ..." (для приёмов пищи можно "Дозировка: — Цель: ... Условия: —").
- Пример notes для добавки: "Дозировка: 30-50 мг элементарного железа, утром натощак, через день. Цель: Коррекция дефицита ферритина, митохондрии, энергия. Условия: Отдельно от кофе/чая. С витамином С 100-200 мг. Контроль ферритина через 8-10 нед."
- Пример для магния: "Дозировка: 300-400 мг, за 1-2 ч до сна. Цель: Поддержка нервной системы, сон, чувствительность к инсулину. Условия: Начинать с меньшей дозы для адаптации ЖКТ."
- Дневник должен повторять программу на месяц: те же добавки с дозировками, цели и условия. План на месяц = одни и те же записи по времени для каждого дня (как в примере JSON ниже).

В конце ответа выведи СТРОГО JSON между маркерами:
=== STRUCTURED_PROGRAM_JSON_START ===
{ "health": {
    "supplements": "подробный текст с дозировками и фитотерапией",
    "nutrition": "подробные принципы питания",
    "stress": "конкретные рекомендации при стрессе",
    "sleep": "ритуал и добавки для сна",
    "goals": ["цель 1", "цель 2", "цель 3"]
  },
  "diary": [
    { "time": "08:00", "title": "Липосомальное железо + витамин D3 + K2, завтрак", "notes": "Дозировка: 30-50 мг железа натощак через день; 4000 МЕ D3 + 100 мкг K2 с жирной пищей. Цель: Ферритин и 25(OH)D. Условия: Железо отдельно от чая/кофе. Контроль анализов через 8-10 нед и 3 мес." },
    { "time": "12:30", "title": "Обед", "notes": "Дозировка: — Цель: Основной приём углеводов в первой половине дня. Условия: —" },
    { "time": "15:00", "title": "При стрессе — ромашковый чай", "notes": "Дозировка: 1 чашка. Цель: Успокоение, снижение напряжения. Условия: По необходимости." },
    { "time": "19:00", "title": "Ужин", "notes": "Дозировка: — Цель: Белок, некрахмалистые овощи. Условия: При дискомфорте в ЖКТ — комбуча." },
    { "time": "21:00", "title": "Магний (бисглицинат)", "notes": "Дозировка: 300-400 мг за 1-2 ч до сна. Цель: Сон, чувствительность к инсулину. Условия: Начинать с меньшей дозы." }
  ]
}
=== STRUCTURED_PROGRAM_JSON_END ===
В diary только записи в формате с "Дозировка: ... Цель: ... Условия: ..." в notes. Не добавляй комментариев вокруг JSON.`;

  return prompt;
}

async function callDeepseekForProgram(systemPrompt) {
  if (!DEEPSEEK_API_KEY) {
    console.error('programGenerator: DEEPSEEK_API_KEY is not set');
    return null;
  }

  const payload = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Составь программу здоровья и дневник на месяц по данным выше.' }
    ],
    temperature: 0.6,
    max_tokens: 8192,
    top_p: 0.9,
    stream: false
  };

  return new Promise((resolve, reject) => {
    const url = new URL(DEEPSEEK_API_URL);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk.toString()));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const content = json?.choices?.[0]?.message?.content || '';
            resolve(content);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function saveProgramToSupabase(telegramId, healthProgram, diaryEntries) {
  const supabase = getSupabase();

  // Ищем пользователя, нужен id и дата диагностики
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, quiz_completion_date')
    .eq('telegram_id', telegramId)
    .single();

  if (userError || !user) {
    console.error('programGenerator: user not found for saveProgram', userError);
    return false;
  }

  const userId = user.id;

  // Чистим старую программу и дневник
  await supabase.from('health_programs').delete().eq('telegram_id', telegramId);
  await supabase.from('diary_entries').delete().eq('telegram_id', telegramId);

  const goalsArray = Array.isArray(healthProgram.goals)
    ? healthProgram.goals.map(g => String(g || '').trim()).filter(Boolean)
    : [];
  const goalsText = goalsArray.join('\n');

  const { data: hpData, error: hpError } = await supabase
    .from('health_programs')
    .insert({
      user_id: userId,
      telegram_id: telegramId,
      supplements: healthProgram.supplements || '',
      nutrition: healthProgram.nutrition || '',
      stress: healthProgram.stress || '',
      sleep: healthProgram.sleep || '',
      request: null,
      goals: goalsText || null
    })
    .select()
    .single();

  if (hpError) {
    console.error('programGenerator: error inserting health_program:', hpError);
    return false;
  }

  const rawEntries = Array.isArray(diaryEntries) ? diaryEntries : [];
  const uniqueEntries = [];
  const seenTimes = new Set();
  for (const entry of rawEntries) {
    const time = (entry.time || '').trim();
    if (!time) continue;
    if (seenTimes.has(time)) continue;
    seenTimes.add(time);
    uniqueEntries.push(entry);
  }
  const entries = uniqueEntries;

  if (entries.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let daysCount = 30;
    if (user.quiz_completion_date) {
      const quizDate = new Date(user.quiz_completion_date);
      const expiryDate = new Date(quizDate);
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      if (expiryDate >= today) {
        const diffMs = expiryDate.getTime() - today.getTime();
        daysCount = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
      } else {
        daysCount = 0;
      }
    }

    const rows = [];
    for (let offset = 0; offset < daysCount; offset++) {
      const day = new Date(today);
      day.setDate(today.getDate() + offset);
      const dateStr = day.toISOString().slice(0, 10);

      entries.forEach(entry => {
        const time = (entry.time || '').trim();
        const title = (entry.title || '').trim();
        if (!time || !title) return;
        rows.push({
          user_id: userId,
          telegram_id: telegramId,
          entry_date: dateStr,
          entry_time: time,
          title,
          notes: (entry.notes || '').trim(),
          request: null
        });
      });
    }

    if (rows.length > 0) {
      const { error: deError } = await supabase.from('diary_entries').insert(rows);
      if (deError) {
        console.error('programGenerator: error inserting diary_entries:', deError);
        return false;
      }
    }
  }

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ program_created: true })
    .eq('id', userId);
  if (userUpdateError) {
    console.error('programGenerator: error updating program_created flag:', userUpdateError);
  }

  console.log('programGenerator: program saved, health_program id:', hpData?.id);
  return true;
}

/**
 * Основная функция: генерирует и сохраняет программу для пользователя.
 * @param {number} telegramId
 */
/**
 * Генерирует и сохраняет программу. При неудаче выбрасывает ошибку (для API program-description).
 */
async function generateProgramForUser(telegramId) {
  const diagnosticData = await loadDiagnosticData(telegramId);
  if (!diagnosticData || !diagnosticData.quiz_completed) {
    console.log('programGenerator: quiz not completed or no data, skip generation for', telegramId);
    throw new Error('Квиз не пройден или нет данных диагностики');
  }

  const systemPrompt = buildProgramPrompt(diagnosticData);
  const content = await callDeepseekForProgram(systemPrompt);
  if (!content || !content.trim()) {
    console.error('programGenerator: empty content from DeepSeek');
    throw new Error('ИИ не вернул программу (таймаут или ошибка API)');
  }

  const { healthProgram, diaryEntries } = extractProgramFromContent(content);
  if (!healthProgram) {
    const snippet = (content || '').slice(0, 400).replace(/\s+/g, ' ');
    console.error('programGenerator: healthProgram not found in model output. Snippet:', snippet);
    throw new Error('ИИ вернул ответ без структуры программы');
  }

  const saved = await saveProgramToSupabase(telegramId, healthProgram, diaryEntries);
  if (!saved) {
    throw new Error('Не удалось сохранить программу в БД');
  }
}

module.exports = {
  generateProgramForUser
};

