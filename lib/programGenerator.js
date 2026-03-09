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

// Вырезание JSON программы из ответа (упрощённая версия extractProgramFromContent)
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
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return result;
  }
  const jsonPart = text.slice(startIdx + START.length, endIdx).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    const health = parsed.health || {};
    const diary = Array.isArray(parsed.diary) ? parsed.diary : [];
    result.healthProgram = {
      supplements: health.supplements || '',
      nutrition: health.nutrition || '',
      stress: health.stress || '',
      sleep: health.sleep || '',
      goals: Array.isArray(health.goals) ? health.goals : []
    };
    result.diaryEntries = diary.map(e => ({
      time: e.time || '',
      title: e.title || '',
      notes: e.notes || ''
    }));
  } catch (e) {
    console.warn('extractProgramFromContent (generator): JSON parse error:', e.message);
  }
  return result;
}

function buildProgramPrompt(diagnosticData) {
  let prompt = 'Ты — PROBIOHACKING AI \"Профи\". На основе данных ниже составь персональную программу здоровья на ближайший месяц и дневник в формате JSON.\n\n';

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
        const snippet = desc.slice(0, 1200);
        prompt += `  Файл ${idx + 1} (${ph.analysis_group}): ${snippet}${snippet.length >= 1200 ? '...' : ''}\n`;
      }
    });
  }

  prompt += `\nВ конце ответа выведи СТРОГО JSON между маркерами:
=== STRUCTURED_PROGRAM_JSON_START ===
{ "health": {
    "supplements": "...",
    "nutrition": "...",
    "stress": "...",
    "sleep": "...",
    "goals": [
      "Первая главная цель на ближайший месяц",
      "Вторая главная цель на ближайший месяц",
      "Третья главная цель на ближайший месяц"
    ]
  },
  "diary": [
    { "time": "08:00", "title": "Магний 400мг + Омега-3 1000мг + Витамин D3", "notes": "с завтраком" }
  ]
}
=== STRUCTURED_PROGRAM_JSON_END ===
Не добавляй комментариев вокруг JSON и не вставляй туда лишний текст.`;

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
    temperature: 0.85,
    max_tokens: 3000,
    top_p: 0.95,
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
async function generateProgramForUser(telegramId) {
  try {
    const diagnosticData = await loadDiagnosticData(telegramId);
    if (!diagnosticData || !diagnosticData.quiz_completed) {
      console.log('programGenerator: quiz not completed or no data, skip generation for', telegramId);
      return;
    }

    const systemPrompt = buildProgramPrompt(diagnosticData);
    const content = await callDeepseekForProgram(systemPrompt);
    if (!content) {
      console.error('programGenerator: empty content from DeepSeek');
      return;
    }

    const { healthProgram, diaryEntries } = extractProgramFromContent(content);
    if (!healthProgram) {
      console.error('programGenerator: healthProgram not found in model output');
      return;
    }

    await saveProgramToSupabase(telegramId, healthProgram, diaryEntries);
  } catch (e) {
    console.error('programGenerator: unexpected error for', telegramId, e);
  }
}

module.exports = {
  generateProgramForUser
};

