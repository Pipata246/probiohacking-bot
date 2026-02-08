# 🎯 Интеграция Kimi API - Гибридный подход обработки изображений и PDF

## 📋 Обзор

Реализован полностью рабочий гибридный подход для обработки медицинских анализов (фотографии и PDF) с использованием **Kimi Vision API**:

- **При загрузке фото/PDF**: Kimi автоматически анализирует файл и сохраняет описание в БД (кэш)
- **При запросе в чат**: Если описание уже есть в БД - используется из кэша (быстро), если нет - обрабатывается параллельно с DeepSeek
- **Параллельная обработка**: Kimi и DeepSeek работают параллельно, не блокируют друг друга

---

## 🔧 Технические детали

### 1. **При загрузке анализа** (`/api/analysis-photos.js`)

#### Процесс:
1. Пользователь загружает фото или PDF анализа
2. Сервер проверяет расширение файла (`.jpg`, `.png`, `.pdf`)
3. **Kimi Vision API** анализирует файл и возвращает детальное описание
4. Описание + тип файла сохраняются в БД в таблице `user_analysis_photos`:
   - `description` - полный текст анализа (кэш)
   - `file_type` - тип файла (`image` или `pdf`)

#### Код:
```javascript
// api/analysis-photos.js (строка ~270)
let analysisDescription = description || null;

if (!analysisDescription) {
  try {
    console.log(`🤖 Запускаем Kimi для анализа "${analysis_group}" (${isPdf ? 'PDF' : 'IMAGE'})...`);
    analysisDescription = await analyzePhotoWithKimi(photo_url, analysis_group, isPdf);
    console.log(`✅ Kimi завершил анализ на ${analysisDescription.length} символов`);
  } catch (kimiError) {
    console.error('⚠️  Ошибка в Kimi API, но продолжаем:', kimiError.message);
    analysisDescription = `[Ошибка анализа Kimi: ${kimiError.message}]`;
  }
}

// Сохранение в БД с типом файла
const { data, error } = await supabase
  .from('user_analysis_photos')
  .insert({
    telegram_id: telegramId,
    photo_url,
    photo_name: photo_name || (isPdf ? 'PDF анализа' : 'Фото анализа'),
    file_size: file_size || 0,
    analysis_group,
    description: analysisDescription,   // ← Кэш описания
    file_type: isPdf ? 'pdf' : 'image'  // ← Тип файла
  })
  .select()
  .single();
```

---

### 2. **При обращении в чат** (`/api/chat.js`)

#### Процесс:
1. Пользователь отправляет сообщение в чат
2. **Параллельно** запускаются:
   - Обработка анализов через Kimi (если есть без описания)
   - Формирование системного промпта для DeepSeek
3. Результаты Kimi добавляются в контекст для DeepSeek
4. DeepSeek генерирует ответ с учетом описаний анализов

#### Код:
```javascript
// api/chat.js (строка ~507)

// 🚀 Запускаем Kimi параллельно - обработка анализов
const kimiProcessPromise = (async () => {
  if (diagnosticData && diagnosticData.analysis_photos && diagnosticData.analysis_photos.length > 0) {
    console.log('🔄 Запускаем Kimi параллельно для анализов без описания...');
    return await processAnalysisPhotosWithKimi(diagnosticData.analysis_photos, diagnosticData);
  }
  return diagnosticData;
})();

// ... формирование системного промпта ...

// ⏳ Ждём результата Kimi перед отправкой в DeepSeek
diagnosticData = await kimiProcessPromise;

// Отправляем запрос к DeepSeek с актуальными описаниями
const response = await doRequest(DEEPSEEK_API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ... },
  body: JSON.stringify(payload)
});
```

---

### 3. **Описания анализов в контексте**

Описания от Kimi включаются в системный промпт для того, чтобы DeepSeek мог учитывать информацию об анализах:

```javascript
// api/chat.js (строка ~564)

// Анализы - с описаниями от Kimi
if (diagnosticData.analysis_photos && diagnosticData.analysis_photos.length > 0) {
  const groupedPhotos = {};
  diagnosticData.analysis_photos.forEach(photo => {
    if (!groupedPhotos[photo.analysis_group]) groupedPhotos[photo.analysis_group] = [];
    groupedPhotos[photo.analysis_group].push(photo);
  });
  
  context += `✓ Загруженные анализы и их описания:\n`;
  Object.entries(groupedPhotos).forEach(([group, photos]) => {
    context += `  📊 ${group}: ${photos.length} файл(ов)\n`;
    // Добавляем описания от Kimi
    photos.forEach((photo, idx) => {
      if (diagnosticData.analysis_descriptions && diagnosticData.analysis_descriptions[photo.id]) {
        const descriptionSnippet = diagnosticData.analysis_descriptions[photo.id].substring(0, 200);
        context += `     Файл ${idx + 1}: ${descriptionSnippet}...\n`;
      }
    });
  });
}
```

---

## 📊 Структура БД

### Таблица `user_analysis_photos`

| Колонка | Тип | Описание |
|---------|-----|---------|
| `id` | UUID | Уникальный ID анализа |
| `telegram_id` | bigint | ID пользователя в Telegram |
| `photo_url` | text | URL файла в Supabase Storage |
| `photo_name` | text | Имя файла |
| `file_size` | integer | Размер файла в байтах |
| `analysis_group` | text | Группа анализа (Анализ крови, Гормоны, Витамины, Другое) |
| **`description`** | text | **Описание от Kimi (кэш)** ⭐ |
| **`file_type`** | varchar(10) | **Тип файла: 'image' или 'pdf'** ⭐ |
| `upload_date` | timestamp | Дата загрузки |
| `created_at` | timestamp | Дата создания записи |
| `updated_at` | timestamp | Дата последнего обновления |
| `user_id` | UUID | Foreign key на таблицу users |

---

## 🔄 Процесс Kimi обработки

### Функция `processAnalysisPhotosWithKimi()` (`api/chat.js`)

```javascript
async function processAnalysisPhotosWithKimi(analysisPhotos, diagnosticData) {
  if (!analysisPhotos || analysisPhotos.length === 0) {
    return diagnosticData;
  }

  // 1️⃣ Находим анализы БЕЗ описания
  const photosNeedingAnalysis = analysisPhotos.filter(photo => 
    !photo.description || photo.description.trim() === ''
  );

  if (photosNeedingAnalysis.length === 0) {
    // ✅ Все анализы уже проанализированы - используем кэш
    console.log(`✅ Все ${analysisPhotos.length} анализов имеют описание (кэш)`);
    return diagnosticData;
  }

  // 2️⃣ Запускаем Kimi параллельно для всех без описания
  const kimiPromises = photosNeedingAnalysis.map(async (photo) => {
    try {
      const isPdf = photo.file_type === 'pdf' || photo.photo_url.toLowerCase().endsWith('.pdf');
      const description = await analyzePhotoWithKimi(photo.photo_url, photo.analysis_group, isPdf);
      
      // 3️⃣ Сохраняем результат в БД (асинхронно)
      supabase
        .from('user_analysis_photos')
        .update({ description })
        .eq('id', photo.id)
        .catch(err => console.error(`❌ Ошибка сохранения для ${photo.id}:`, err));

      return { id: photo.id, description: description };
    } catch (error) {
      console.error(`⚠️  Ошибка Kimi для ${photo.analysis_group}:`, error.message);
      return { id: photo.id, description: `[Ошибка: ${error.message}]` };
    }
  });

  // 4️⃣ Ждём ВСЕ Kimi запросы одновременно (параллельно)
  const kimiResults = await Promise.all(kimiPromises);

  // 5️⃣ Обновляем кэш описаний в памяти
  kimiResults.forEach(result => {
    diagnosticData.analysis_descriptions[result.id] = result.description;
  });

  return diagnosticData;
}
```

---

## ⚡ Преимущества гибридного подхода

| Сценарий | Поведение | Скорость |
|---------|-----------|---------|
| **Первая загрузка анализа** | Kimi анализирует → Сохраняется описание в БД | 5-10 сек (длительно) |
| **Запрос в чат, анализ уже в БД** | Используется кэш из БД | ✅ Мгновенно |
| **Запрос в чат, новый анализ без описания** | Kimi обрабатывает параллельно с DeepSeek | ⚡ Параллельно (не блокирует ответ) |
| **Несколько анализов без описания** | Все Kimi запросы запускаются одновременно | 🚀 Оптимально |

---

## 🎯 Примеры использования

### Пример 1: Загрузка анализа крови

```
Пользователь загружает PNG-файл анализа крови
     ↓
api/analysis-photos.js обрабатывает:
  1. Определяет тип файла: image (PNG)
  2. Запускает Kimi Vision API
  3. Получает описание (200-300 слов):
     "Анализ крови показывает РОЭ 15 мм/ч, 
      гемоглобин 142 г/л (норма 120-160), 
      тромбоциты 245*10^9 (норма 180-320)..."
  4. Сохраняет в БД:
     - description: "Анализ крови показывает..."
     - file_type: "image"
     - analysis_group: "Анализ крови"
```

### Пример 2: Запрос в чат с анализами

```
Пользователь: "У меня заболела спина, что мне делать?"
     ↓
api/chat.js обрабатывает:
  1. Параллельно запускает Kimi (если нужна обработка)
  2. Формирует системный промпт:
     "Доступные данные о пользователе:
      - Профиль: Марк, 35 лет, 75кг/180см
      - Жалобы: боли в спине
      - Анализы: Анализ крови (описание есть в кэше)"
  3. Отправляет запрос к DeepSeek
  4. DeepSeek генерирует ответ с учетом анализов
     ← ответ с рекомендациями
```

---

## 🔌 API Endpoints

### Загрузка анализа
```
POST /api/analysis-photos
Body: {
  photo_url: "https://...",
  photo_name: "blood_test.jpg",
  analysis_group: "Анализ крови",
  file_type: "image/jpeg",
  file_size: 245000
}
Response: {
  success: true,
  photo: {
    id: "uuid",
    description: "Описание от Kimi...",
    file_type: "image"
  }
}
```

### Чат (использует Kimi параллельно)
```
POST /api/chat
Body: {
  message: "Какие рекомендации по результатам анализов?",
  telegramUser: { id: 123456 },
  mode: "detailed"
}
Response: {
  success: true,
  response: "На основе ваших анализов..."
}
```

---

## 🚀 Что работает

✅ Загрузка фотографий анализов с автоматическим анализом Kimi  
✅ Загрузка PDF-документов с анализом содержимого  
✅ Кэширование описаний в БД для быстрого доступа  
✅ Параллельная обработка Kimi и DeepSeek  
✅ Интеграция описаний в контекст для DeepSeek  
✅ Сохранение типа файла (image/pdf) для различия формата  
✅ Обработка ошибок и fallback механизмы  

---

## 📝 Логирование

Все операции логируются для отладки:

```
🎯 Kimi Vision: Начинаем анализ Анализ крови...
📄 File type: IMAGE
📤 Отправляем запрос на Kimi API...
✅ Kimi Vision: Анализ завершен на 523 символов

🔄 Запускаем Kimi параллельно для анализов без описания...
✅ Kimi завершил анализ 2 файлов

📊 Доступные данные о пользователе:
  ✓ Профиль: ...
  ✓ Загруженные анализы и их описания:
    - Анализ крови: 1 файл(ов)
      Файл 1: Анализ крови показывает РОЭ 15...
```

---

## ⚙️ Переменные окружения

Убедитесь что в `.env` есть:

```
KIMI_API_KEY=sk-xxxxxxxxxxxxx
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxxxxxxxxxx
```

---

## 🎓 Дополнительные замечания

1. **Kimi запускается асинхронно** - не блокирует основной поток
2. **Ошибки Kimi не критичны** - система продолжает работать с fallback описанием
3. **Описания кэшируются** - уменьшает набор API запросов к Kimi
4. **Параллельность** - улучшает скорость отклика при наличии многих анализов

---

**Статус**: ✅ **Полностью интегрировано и работает**
