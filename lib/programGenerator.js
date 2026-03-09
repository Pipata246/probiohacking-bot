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

// Вырезание JSON программы из ответа (устойчиво к разным форматам вывода модели)
function extractProgramFromContent(text) {
  const result = {
    healthProgram: null,
    diaryEntries: []
  };
  if (!text || typeof text !== 'string') return result;

  let jsonPart = null;

  // 1) Точные маркеры
  const START = '=== STRUCTURED_PROGRAM_JSON_START ===';
  const END = '=== STRUCTURED_PROGRAM_JSON_END ===';
  const startIdx = text.indexOf(START);
  const endIdx = text.indexOf(END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    jsonPart = text.slice(startIdx + START.length, endIdx).trim();
  }

  // 2) Блок ```json ... ```
  if (!jsonPart) {
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      const block = jsonBlockMatch[1].trim();
      if (block.includes('"health"') && block.includes('"diary"')) {
        jsonPart = block;
      }
    }
  }

  // 3) Поиск объекта с "health" и "diary" в тексте (последний подходящий фрагмент)
  if (!jsonPart) {
    const healthIdx = text.indexOf('"health"');
    if (healthIdx !== -1) {
      let braceStart = text.lastIndexOf('{', healthIdx);
      if (braceStart === -1) braceStart = text.indexOf('{', healthIdx);
      if (braceStart !== -1) {
        let depth = 0;
        let end = -1;
        for (let i = braceStart; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        if (end > braceStart) {
          const candidate = text.slice(braceStart, end + 1);
          if (candidate.includes('"diary"')) {
            jsonPart = candidate;
          }
        }
      }
    }
  }

  if (!jsonPart) return result;

  try {
    const parsed = JSON.parse(jsonPart);
    const health = parsed.health || {};
    const diary = Array.isArray(parsed.diary) ? parsed.diary : [];
    result.healthProgram = {
      supplements: (health.supplements != null) ? String(health.supplements) : '',
      nutrition: (health.nutrition != null) ? String(health.nutrition) : '',
      stress: (health.stress != null) ? String(health.stress) : '',
      sleep: (health.sleep != null) ? String(health.sleep) : '',
      goals: Array.isArray(health.goals) ? health.goals.map(g => String(g || '')) : []
    };
    result.diaryEntries = diary.map(e => ({
      time: (e && e.time != null) ? String(e.time) : '',
      title: (e && e.title != null) ? String(e.title) : '',
      notes: (e && e.notes != null) ? String(e.notes) : ''
    }));
  } catch (e) {
    console.warn('extractProgramFromContent (generator): JSON parse error:', e.message);
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

Требования к дневнику (diary):
- Заполни день с утра до вечера. Обязательно включи время 08:00–09:00 (завтрак/добавки), 12:30–13:30 (обед), 14:00–15:00, 18:00–19:00 (ужин), 20:00–21:00 (вечерние добавки/сон). Не оставляй дыр с 12:30 до 20:00.
- title: краткое название (добавка или действие).
- notes: конкретика, например: "с завтраком", "при стрессе — ромашковый чай", "при дискомфорте в желудке — комбуча", "магний за 1–2 ч до сна", "витамин D с жирной пищей".

В конце ответа выведи СТРОГО JSON между маркерами:
=== STRUCTURED_PROGRAM_JSON_START ===
{ "health": {
    "supplements": "подробный текст с дозировками и фитотерапией (ромашка, мелисса, чайный гриб где уместно)",
    "nutrition": "подробные принципы питания",
    "stress": "конкретные рекомендации при стрессе",
    "sleep": "ритуал и добавки для сна",
    "goals": ["цель 1", "цель 2", "цель 3"]
  },
  "diary": [
    { "time": "08:00", "title": "Завтрак + витамин D3, Омега-3", "notes": "D3 с жирной пищей" },
    { "time": "12:30", "title": "Обед", "notes": "белок, овощи, сложные углеводы" },
    { "time": "15:00", "title": "При стрессе — ромашковый чай", "notes": "или перекус" },
    { "time": "19:00", "title": "Ужин", "notes": "лёгкий, без тяжёлых углеводов" },
    { "time": "21:00", "title": "Магний 300–400 мг", "notes": "за 1–2 ч до сна; при дискомфорте в ЖКТ — чайный гриб по необходимости" }
  ]
}
=== STRUCTURED_PROGRAM_JSON_END ===
Добавь в diary все нужные времена (утро, 12:30, 14:00–15:00, 18:00–20:00, вечер), чтобы не было пустых дыр. Не добавляй комментариев вокруг JSON.`;

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
    temperature: 0.8,
    max_tokens: 2000,
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
    console.error('programGenerator: healthProgram not found in model output');
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

