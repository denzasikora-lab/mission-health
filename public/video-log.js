(() => {
  const dialog = document.getElementById('video-log-dialog');
  const canvas = document.getElementById('video-log-canvas');
  const context = canvas.getContext('2d');
  const video = document.getElementById('video-log-input');
  const review = document.getElementById('video-log-review');
  const cameraButton = document.getElementById('video-log-camera');
  const recordButton = document.getElementById('video-log-record');
  const download = document.getElementById('video-log-download');
  const backgroundChoice = document.getElementById('video-log-background');
  const microphone = document.getElementById('video-log-sound');
  const notice = document.getElementById('video-log-notice');
  const researcher = document.getElementById('video-log-researcher');
  const firstName = document.getElementById('video-log-first-name');
  const lastName = document.getElementById('video-log-last-name');
  const identityForm = document.getElementById('video-log-identity');
  const locationName = document.getElementById('video-log-location');
  const background = new Image();
  background.src = '/assets/video-log-lab.png';
  let phase = 'idle', epoch = 0, stream, worker, workerReady = false, workerBusy = false;
  let portrait, frame = 0, lastDraw = 0, lastSegmentation = 0;
  let recorder, recordedStream, recordingStarted = 0, recordingTimer, cameraTimer, workerTimer;
  let clipUrl, clipDate, entry = 1, identity, identityPromise;
  const storageKey = suffix => 'mission-health-log-' + (identity?.researcherId || 'local') + '-' + suffix;
  function normalized(value) { return String(value || '').replaceAll('\u0451', '\u0435').replaceAll('\u0401', '\u0415').replace(/[\u2013\u2014]/g, '-'); }
  function filmName(value) {
    const parts = normalized(value).trim().split(/\s+/);
    return (parts.length > 1 ? parts.at(-1) + ', ' + parts[0][0] + '.' : parts[0] || 'PARTICIPANT').toUpperCase();
  }
  async function loadIdentity() {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) throw new Error('identity_unavailable');
      identity = await response.json();
      try {
        entry = Math.max(1, Number(localStorage.getItem(storageKey('entry'))) || 1);
        researcher.value = normalized(localStorage.getItem(storageKey('name')) || identity.name || '');
        locationName.value = normalized(localStorage.getItem(storageKey('location')) || 'SCI MOD');
      } catch { researcher.value = normalized(identity.name || ''); }
      const parts = researcher.value.trim().split(/\s+/);
      firstName.value = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
      lastName.value = parts.length > 1 ? parts.at(-1) : '';
      updateSignature();
      renderControls();
    } catch { message('Не удалось прочитать профиль. Обнови страницу после входа в аккаунт.', true); }
  }

  function updateSignature() {
    researcher.value = normalized([firstName.value.trim(), lastName.value.trim()].filter(Boolean).join(' '));
    document.getElementById('video-log-title').textContent = researcher.value ? 'Видеодневник / ' + researcher.value : 'Твой видеодневник';
  }

  function message(value, error = false) { notice.textContent = value; notice.dataset.error = String(error); }
  function renderControls() {
    const active = phase === 'live' || phase === 'recording';
    cameraButton.textContent = phase === 'requesting' ? 'Отменить подключение' : active ? 'Выключить камеру' : clipUrl ? 'Новая запись' : 'Включить камеру';
    cameraButton.disabled = phase === 'finishing';
    cameraButton.setAttribute('aria-pressed', String(active));
    recordButton.disabled = !(phase === 'recording' || phase === 'live' && (backgroundChoice.value === 'room' || portrait));
    recordButton.querySelector('span').textContent = phase === 'recording' ? 'Остановить запись' : phase === 'finishing' ? 'Подготовка записи' : 'Начать запись';
    recordButton.setAttribute('aria-pressed', String(phase === 'recording'));
    backgroundChoice.disabled = phase === 'recording' || phase === 'finishing';
    firstName.disabled = lastName.disabled = locationName.disabled = identityForm.querySelector('button').disabled = phase === 'recording' || phase === 'finishing';
    microphone.disabled = Boolean(stream) || phase === 'requesting' || phase === 'finishing';
    download.hidden = !clipUrl || phase !== 'review';
    review.hidden = phase !== 'review';
  }

  function stopCamera() {
    epoch++;
    if (recorder?.state === 'recording') { phase = 'finishing'; recorder.stop(); }
    clearTimeout(cameraTimer); clearTimeout(workerTimer); clearInterval(recordingTimer);
    cameraTimer = workerTimer = recordingTimer = null;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    video.pause(); video.srcObject = null;
    worker?.terminate(); worker = null; workerReady = workerBusy = false;
    portrait?.close(); portrait = null;
  }

  function discardClip() {
    review.pause(); review.removeAttribute('src'); review.load();
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    clipUrl = null; download.removeAttribute('href');
  }

  function prepareBackground(attempt) {
    if (worker || backgroundChoice.value !== 'lab') return;
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
      message('Этот браузер не поддерживает замену фона. Выбери «Моя комната», чтобы включить обычную камеру.', true); return;
    }
    message('Загружаю обработчик фона. Кадры остаются на устройстве.');
    worker = new Worker('/video-background-worker.js?v=20261028-log1');
    const activeWorker = worker;
    workerTimer = setTimeout(() => {
      if (worker === activeWorker && !workerReady) backgroundError();
    }, 45000);
    function backgroundError() {
      clearTimeout(workerTimer); workerTimer = null;
      if (attempt !== epoch) return;
      activeWorker.terminate(); if (worker === activeWorker) worker = null;
      workerReady = workerBusy = false; portrait?.close(); portrait = null;
      if (recorder?.state === 'recording') stopCamera();
      message('Фон не удалось обработать. Повтори подключение или выбери «Моя комната» для обычной камеры.', true);
      renderControls();
    }
    worker.onmessage = event => {
      const data = event.data;
      if (attempt !== epoch || worker !== activeWorker) { data.bitmap?.close(); return; }
      if (data.type === 'ready') { clearTimeout(workerTimer); workerTimer = null; workerReady = true; }
      else if (data.type === 'frame') {
        portrait?.close(); portrait = data.bitmap; workerBusy = false;
        if (recordButton.disabled && phase === 'live') {
          message('Камера включена. Ты в кадре на фоне лаборатории. Можно начинать запись.'); renderControls();
        }
      } else if (data.type === 'error') backgroundError();
    };
    worker.onerror = backgroundError;
    worker.postMessage({ type: 'init' });
  }

  async function startCamera() {
    stopCamera(); discardClip(); phase = 'requesting'; renderControls();
    message('Разреши камеру' + (microphone.checked ? ' и микрофон' : '') + ' в браузере.');
    const attempt = epoch;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
      const incoming = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: microphone.checked ? { echoCancellation: true, noiseSuppression: true } : false
      });
      // Разрешение после закрытия или отмены не должно возобновлять камеру.
      if (attempt !== epoch || !dialog.open) { incoming.getTracks().forEach(track => track.stop()); return; }
      stream = incoming; video.srcObject = incoming; await video.play();
      if (attempt !== epoch || !dialog.open) return;
      phase = 'live'; renderControls();
      incoming.getTracks().forEach(track => track.addEventListener('ended', () => {
        if (attempt !== epoch) return;
        stopCamera(); if (phase !== 'finishing') phase = 'idle'; renderControls(); message('Устройство отключено. Можно подключить камеру снова.', true);
      }));
      cameraTimer = setTimeout(() => {
        stopCamera(); if (phase !== 'finishing') phase = 'idle'; renderControls(); message('Камера выключена после трех минут просмотра.');
      }, 180000);
      if (backgroundChoice.value === 'lab') prepareBackground(attempt);
      else message('Камера включена с твоим обычным фоном. Можно начинать запись.');
    } catch (error) {
      if (attempt !== epoch) return;
      stopCamera(); phase = 'idle'; renderControls();
      const errors = {
        NotAllowedError: 'Доступ закрыт. Разреши камеру и микрофон для сайта или отключи звук перед повтором.',
        NotFoundError: 'Камера или микрофон не найдены. Проверь устройства или попробуй запись без звука.',
        NotReadableError: 'Устройство занято. Закрой другое приложение с камерой и повтори.'
      };
      message(errors[error.name] || 'Не удалось включить камеру. Повтори в Safari или Chrome.', true);
    }
  }

  function cover(image, mirrored = false) {
    const w = image.videoWidth || image.width, h = image.videoHeight || image.height;
    if (!w || !h) return;
    const scale = Math.max(canvas.width / w, canvas.height / h);
    context.save();
    if (mirrored) { context.translate(canvas.width, 0); context.scale(-1, 1); }
    context.drawImage(image, (canvas.width - w * scale) / 2, (canvas.height - h * scale) / 2, w * scale, h * scale);
    context.restore();
  }

  function drawOverlay(time) {
    const recording = phase === 'recording', active = phase === 'live' || recording;
    const seconds = recording ? Math.max(0, Math.floor((time - recordingStarted) / 1000)) : 0;
    const duration = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    const date = new Date();
    context.save();
    const shade = context.createLinearGradient(0, canvas.height * .56, 0, canvas.height);
    shade.addColorStop(0, '#03151a00'); shade.addColorStop(1, '#03151acc');
    context.fillStyle = shade; context.fillRect(0, 0, canvas.width, canvas.height);
    // Надписи и расположение взяты из выбранного кадра видеодневника Avatar.
    const cyan = '#53e6ec';
    context.lineWidth = 1.3; context.strokeStyle = cyan;
    context.beginPath(); context.roundRect(136, 80, 321, 25, 4); context.stroke();
    const tabs = [['MAIN CAM', 142, 67, cyan], ['PAST ENTRIES', 210, 96, '#286673'], ['SUBMIT', 307, 70, '#245867'], ['TASK', 378, 73, '#ff782e']];
    for (const [label, x, w, color] of tabs) {
      context.fillStyle = color; context.beginPath(); context.moveTo(x, 85); context.lineTo(x + w - 13, 85); context.lineTo(x + w, 101); context.lineTo(x, 101); context.closePath(); context.fill();
      context.font = 'bold 10px Arial, sans-serif'; context.fillStyle = label === 'MAIN CAM' ? '#073b43' : '#b8fafb'; context.fillText(label, x + 4, 97);
    }
    context.font = '17px Arial, sans-serif'; context.fillStyle = '#c5f5f9';
    context.fillText(recording ? 'REC' : active ? 'STBY' : 'OFFLINE', 140, 130);
    if (recording) { context.fillStyle = '#ff241a'; context.beginPath(); context.arc(184, 122, 9, 0, Math.PI * 2); context.fill(); }
    if (recording) { context.font = '14px monospace'; context.fillStyle = cyan; context.fillText(duration, 209, 129); }

    context.fillStyle = cyan;
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      context.beginPath(); context.ellipse(155 + Math.cos(angle) * 9, 504 + Math.sin(angle) * 9, 7, 9, angle, 0, Math.PI * 2); context.fill();
    }
    context.font = '900 36px Arial, sans-serif'; context.fillText('RDA', 175, 514);
    context.font = 'bold 3.8px Arial, sans-serif'; context.fillText('RESOURCES DEVELOPMENT ADMINISTRATION', 175, 522);
    context.strokeRect(140, 533, 111, 50);
    if (stream && video.readyState >= 2) {
      context.save(); context.beginPath(); context.rect(141, 534, 43, 48); context.clip();
      context.filter = 'grayscale(1) sepia(1) hue-rotate(130deg) saturate(3)';
      const h = video.videoHeight * .46, w = h * 43 / 48;
      context.translate(325, 0); context.scale(-1, 1);
      context.drawImage(video, (video.videoWidth - w) / 2, video.videoHeight * .02, w, h, 141, 534, 43, 48); context.restore();
    } else { context.fillStyle = '#0b697680'; context.fillRect(141, 534, 43, 48); }
    context.fillStyle = cyan; context.font = 'bold 8px Arial, sans-serif'; context.fillText('SECURITY', 189, 546); context.fillText('LEVEL', 189, 556);
    context.fillStyle = '#ff7d2b'; context.beginPath(); context.roundRect(187, 560, 60, 19, 3); context.fill();
    context.fillStyle = '#182e34'; context.font = 'bold 10px Arial, sans-serif'; context.fillText('ORANGE G2', 190, 573, 54);
    context.fillStyle = cyan; context.font = 'bold 16px Arial, sans-serif';
    const name = filmName(researcher.value), id = identity?.researcherId || '--- --- ---';
    context.fillText('LOG ENTRY: ' + String(entry).padStart(2, '0'), 140, 604);
    context.fillText('LOCATION: ' + normalized(locationName.value || 'SCI MOD').toUpperCase().slice(0, 22), 140, 618);
    context.fillText('RESEARCHER: ' + name, 140, 632, 167); context.fillText('P.I.: ' + name, 140, 646, 167);
    context.fillText('ID# ' + id, 312, 632); context.fillText('ID# ' + id, 312, 646);
    const clock = [date.getHours(), date.getMinutes(), date.getSeconds(), Math.floor(date.getMilliseconds() / 1000 * 24)].map(value => String(value).padStart(2, '0')).join(':');
    const calendar = [date.getMonth() + 1, date.getDate(), date.getFullYear()].map(value => String(value).padStart(2, '0')).join('/');
    context.fillText('LST:  ' + clock, 450, 632); context.fillText('DATE: ' + calendar, 450, 646);
    context.restore();
  }

  async function sendFrame(time) {
    const attempt = epoch, activeWorker = worker;
    workerBusy = true; lastSegmentation = time;
    try {
      const bitmap = await createImageBitmap(video, { resizeWidth: 640, resizeHeight: 360 });
      if (attempt !== epoch || worker !== activeWorker || !dialog.open) { bitmap.close(); return; }
      activeWorker.postMessage({ type: 'frame', bitmap, timestamp: time }, [bitmap]);
    } catch {
      if (attempt === epoch) {
        workerBusy = false;
        if (recorder?.state === 'recording') stopCamera();
        message('Кадры камеры недоступны. Переподключи камеру или выбери обычный фон.', true); renderControls();
      }
    }
  }

  function animate(time) {
    if (!dialog.open || document.hidden) { frame = 0; return; }
    frame = requestAnimationFrame(animate);
    if (time - lastDraw < 33 || phase === 'review') return;
    lastDraw = time;
    context.fillStyle = '#102027'; context.fillRect(0, 0, 1280, 720);
    if (background.complete && background.naturalWidth) cover(background);
    if (stream && video.readyState >= 2) {
      if (backgroundChoice.value === 'room') cover(video, true);
      else {
        if (portrait) cover(portrait, true);
        if (workerReady && !workerBusy && time - lastSegmentation > 80) void sendFrame(time);
      }
    }
    drawOverlay(time);
  }

  function startRecording() {
    if (phase === 'recording') { phase = 'finishing'; recorder.stop(); renderControls(); return; }
    if (phase !== 'live' || backgroundChoice.value === 'lab' && !portrait) return;
    updateSignature();
    if (!identity || !researcher.value.trim()) { message('Укажи имя и фамилию, чтобы подписать запись.', true); firstName.focus(); return; }
    if (!canvas.captureStream || !window.MediaRecorder) { message('Запись видео не поддерживается этим браузером. Попробуй Safari или Chrome.', true); return; }
    const audio = stream.getAudioTracks().length > 0;
    const types = audio ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'] : ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'];
    const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { message('Подходящий формат записи не найден. Попробуй другой браузер.', true); return; }
    const chunks = [];
    try {
      recordedStream = canvas.captureStream(24);
      stream.getAudioTracks().forEach(track => recordedStream.addTrack(track.clone()));
      recorder = new MediaRecorder(recordedStream, { mimeType, videoBitsPerSecond: 2400000, audioBitsPerSecond: 96000 });
      const recording = recorder;
      let failed = false;
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onerror = () => { failed = true; stopCamera(); message('Не удалось завершить запись. Повтори после подключения камеры.', true); };
      recording.onstop = () => {
        recordedStream?.getTracks().forEach(track => track.stop()); recordedStream = null;
        stopCamera(); recorder = null;
        if (failed || !chunks.length) { phase = 'idle'; renderControls(); return; }
        const blob = new Blob(chunks, { type: recording.mimeType });
        clipUrl = URL.createObjectURL(blob); review.src = clipUrl;
        download.href = clipUrl; download.download = 'mission-health-log-' + String(entry).padStart(3, '0') + (blob.type.includes('mp4') ? '.mp4' : '.webm');
        entry++;
        try { localStorage.setItem(storageKey('entry'), String(entry)); } catch {}
        phase = 'review'; renderControls(); message('Запись готова. Посмотри ее и скачай файл, чтобы сохранить.');
      };
      clipDate = new Date(); recordingStarted = performance.now(); phase = 'recording';
      recording.start(250); clearTimeout(cameraTimer);
      recordingTimer = setInterval(() => {
        if (performance.now() - recordingStarted >= 120000 && recording.state === 'recording') { phase = 'finishing'; recording.stop(); renderControls(); }
      }, 250);
      renderControls(); message(audio ? 'Идет запись видео и голоса. Нажми «Остановить запись», когда закончишь.' : 'Идет запись видео без звука. Нажми «Остановить запись», когда закончишь.');
    } catch {
      recordedStream?.getTracks().forEach(track => track.stop()); recordedStream = null; recorder = null;
      phase = 'live'; renderControls(); message('Не удалось начать запись. Повтори подключение камеры.', true);
    }
  }

  function open() {
    if (dialog.open) return;
    document.getElementById('voice-dialog').close();
    identityPromise ||= loadIdentity();
    dialog.showModal(); if (clipUrl) phase = 'review'; renderControls();
    if (!frame) frame = requestAnimationFrame(animate);
  }
  document.querySelectorAll('[data-open-video-log]').forEach(button => button.addEventListener('click', open));
  document.getElementById('video-log-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    stopCamera(); review.pause(); cancelAnimationFrame(frame); frame = 0;
    if (phase !== 'finishing') phase = clipUrl ? 'review' : 'idle'; renderControls();
  });
  cameraButton.addEventListener('click', () => {
    if (phase === 'requesting' || phase === 'live' || phase === 'recording') {
      stopCamera(); if (phase !== 'finishing') phase = 'idle'; renderControls(); message('Камера выключена.');
    } else void startCamera();
  });
  recordButton.addEventListener('click', startRecording);
  backgroundChoice.addEventListener('change', () => {
    portrait?.close(); portrait = null;
    if (stream && backgroundChoice.value === 'lab') prepareBackground(epoch);
    if (backgroundChoice.value === 'room') { clearTimeout(workerTimer); workerTimer = null; worker?.terminate(); worker = null; workerReady = workerBusy = false; if (stream) message('В кадре твоя комната.'); }
    renderControls();
  });
  for (const [node, key] of [[researcher, 'name'], [locationName, 'location']]) node.addEventListener('change', () => {
    node.value = normalized(node.value);
    if (identity) try { localStorage.setItem(storageKey(key), node.value.trim()); } catch {}
  });
  firstName.addEventListener('input', updateSignature); lastName.addEventListener('input', updateSignature);
  identityForm.addEventListener('submit', event => {
    event.preventDefault(); updateSignature();
    if (!identity) { message('Дождись загрузки профиля и повтори сохранение.', true); return; }
    try { localStorage.setItem(storageKey('name'), researcher.value); localStorage.setItem(storageKey('location'), normalized(locationName.value)); window.dispatchEvent(new Event('mission-profile-change')); message('Подпись сохранена на этом устройстве: ' + filmName(researcher.value)); }
    catch { message('Подпись обновлена для этой записи. Браузер не разрешил сохранить ее на устройстве.', true); }
  });
  window.addEventListener('mission-profile-change', () => {
    if (!identity || phase === 'recording') return;
    try {
      const saved = localStorage.getItem(storageKey('name'));
      if (saved) { const parts = saved.trim().split(/\s+/); firstName.value = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0]; lastName.value = parts.length > 1 ? parts.at(-1) : ''; updateSignature(); }
    } catch {}
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopCamera(); review.pause(); cancelAnimationFrame(frame); frame = 0;
      if (phase !== 'finishing') phase = clipUrl ? 'review' : 'idle'; renderControls(); message('Камера выключена: вкладка была скрыта.');
    } else if (dialog.open && !frame) frame = requestAnimationFrame(animate);
  });
  window.addEventListener('pagehide', () => { stopCamera(); discardClip(); });
  if (new URLSearchParams(location.search).get('log') === '1') open();
})();
