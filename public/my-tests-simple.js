// ПРОСТАЯ СИСТЕМА ЗАГРУЗКИ АНАЛИЗОВ - БЕЗ КОНФЛИКТОВ

function showMyTestsPageSimple() {
  // Закрываем старую форму если есть
  const oldForm = document.getElementById('myTestsFormOverlay');
  if (oldForm) oldForm.remove();
  
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const userName = user?.first_name || 'Пользователь';
  const userInitials = userName.charAt(0).toUpperCase() + (user?.last_name?.charAt(0).toUpperCase() || '');
  
  const myTestsForm = document.createElement('div');
  myTestsForm.id = 'myTestsFormOverlay';
  myTestsForm.className = 'chat-form-overlay';
  myTestsForm.innerHTML = `
    <div class="chat-form-container">
      <div class="chat-form-header">
        <div class="static-avatar" id="myTestsAvatar">${userInitials}</div>
        
        <div class="my-tests-content">
          <h2 class="my-tests-title">Мои анализы</h2>
          <p class="my-tests-subtitle">Загрузите результаты исследований</p>
          
          <div class="file-upload-section">
            <div class="file-upload-area" id="fileUploadArea">
              <div class="upload-icon">📁</div>
              <p>Выберите файл или перетащите сюда</p>
              <p style="font-size: 12px; opacity: 0.7;">PDF, PNG, JPG до 10MB</p>
            </div>
            <input type="file" id="fileInput" accept="image/*,.pdf" style="display: none;">
          </div>
          
          <div class="analysis-group-selection">
            <label>Тип анализа:</label>
            <select id="analysisGroup">
              <option value="Анализ крови">Анализ крови</option>
              <option value="Анализ мочи">Анализ мочи</option>
              <option value="Биохимия">Биохимия</option>
              <option value="Гормоны">Гормоны</option>
            </select>
          </div>
          
          <div id="uploadedTestsList">
            <h3>Загруженные анализы</h3>
            <p style="text-align: center; opacity: 0.7;">Загрузка...</p>
          </div>
        </div>
        
        <nav class="chat-form-nav">
          <button class="nav-btn" onclick="closeMyTestsFormSimple()">✖ Закрыть</button>
        </nav>
      </div>
    </div>
  `;
  
  document.body.appendChild(myTestsForm);
  myTestsForm.style.display = 'flex';
  document.body.classList.add('chat-overlay-visible');
  
  // Загружаем анализы
  loadMyTestsSimple();
  
  // Обработчики
  setupMyTestsHandlersSimple();
}

function setupMyTestsHandlersSimple() {
  const fileInput = document.getElementById('fileInput');
  const fileUploadArea = document.getElementById('fileUploadArea');
  
  fileUploadArea.addEventListener('click', () => fileInput.click());
  
  fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.style.background = 'rgba(0,0,0,0.1)';
  });
  
  fileUploadArea.addEventListener('dragleave', () => {
    fileUploadArea.style.background = '';
  });
  
  fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.style.background = '';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUploadSimple(files[0]);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUploadSimple(e.target.files[0]);
    }
  });
}

async function loadMyTestsSimple() {
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/analysis-photos', {
      headers: {
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      }
    });
    
    const testsList = document.getElementById('uploadedTestsList');
    
    if (!response.ok) {
      testsList.innerHTML = '<h3>Загруженные анализы</h3><p style="text-align: center; color: red;">Ошибка загрузки</p>';
      return;
    }
    
    const data = await response.json();
    
    if (!data.success || !data.photos || data.photos.length === 0) {
      testsList.innerHTML = '<h3>Загруженные анализы</h3><p style="text-align: center; opacity: 0.7;">Нет загруженных анализов</p>';
      return;
    }
    
    testsList.innerHTML = '<h3>Загруженные анализы</h3>';
    
    data.photos.forEach(photo => {
      const photoElement = document.createElement('div');
      photoElement.className = 'uploaded-test';
      photoElement.innerHTML = `
        <div class="test-info">
          <div class="test-name">${photo.photo_name}</div>
          <div class="test-group">${photo.analysis_group}</div>
        </div>
        <div class="test-actions">
          <button onclick="viewPhotoSimple('${photo.photo_url}')" style="background: none; border: none; font-size: 16px;">👁</button>
          <button onclick="deletePhotoSimple(${photo.id})" style="background: none; border: none; font-size: 16px;">🗑</button>
        </div>
      `;
      testsList.appendChild(photoElement);
    });
    
  } catch (error) {
    const testsList = document.getElementById('uploadedTestsList');
    testsList.innerHTML = '<h3>Загруженные анализы</h3><p style="text-align: center; color: red;">Ошибка загрузки</p>';
  }
}

function closeMyTestsFormSimple() {
  const overlay = document.getElementById('myTestsFormOverlay');
  if (overlay) {
    overlay.remove();
    document.body.classList.remove('chat-overlay-visible');
  }
}

function viewPhotoSimple(url) {
  window.open(url, '_blank');
}

async function deletePhotoSimple(photoId) {
  if (!confirm('Удалить этот анализ?')) return;
  
  try {
    const telegramWebAppData = window.Telegram?.WebApp?.initData || null;
    const response = await fetch('/api/analysis-photos', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(telegramWebAppData && { 'X-Telegram-WebApp-Data': telegramWebAppData })
      },
      body: JSON.stringify({ photo_id: photoId })
    });
    
    if (response.ok) {
      loadMyTestsSimple(); // Перезагружаем список
    }
  } catch (error) {
    alert('Ошибка при удалении');
  }
}

async function handleFileUploadSimple(file) {
  console.log('Загрузка файла:', file.name);
  // Здесь будет логика загрузки файла
  alert('Функция загрузки будет добавлена позже');
}

// Заменяем старую функцию на новую
window.showMyTestsPage = showMyTestsPageSimple;
