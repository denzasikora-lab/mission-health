(() => {
  const dialog = document.getElementById('voice-dialog');
  const stage = document.getElementById('voice-stage');
  const canvas = document.getElementById('voice-canvas');
  const context = canvas.getContext('2d');
  const micButton = document.getElementById('voice-mic');
  const demoButton = document.getElementById('voice-demo');
  const notice = document.getElementById('voice-notice');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let source = 'idle', style = 'silo', sequence = 0, frame = 0;
  let stream, audioContext, audioSource, analyser, samples, frequencies;
  let startedAt = 0, previousFrame = 0, level = 0, decibels = -90;
  let width = 0, height = 0, lastReadout = 0;

  function stopSignal() {
    sequence++;
    const previousStream = stream;
    stream = null;
    previousStream?.getTracks().forEach(track => track.stop());
    try { audioSource?.disconnect(); analyser?.disconnect(); } catch {}
    const previousContext = audioContext;
    audioContext = audioSource = analyser = samples = frequencies = null;
    if (previousContext && previousContext.state !== 'closed') void previousContext.close().catch(() => {});
    source = 'idle'; startedAt = 0; level = 0; decibels = -90;
  }

  function renderStatus(message = '', error = false) {
    const active = source === 'mic', waiting = source === 'requesting';
    micButton.querySelector('span').textContent = active ? 'Выключить микрофон' : waiting ? 'Отменить подключение' : 'Включить микрофон';
    micButton.setAttribute('aria-pressed', String(active));
    demoButton.textContent = source === 'demo' ? 'Остановить демо' : 'Посмотреть демо';
    demoButton.setAttribute('aria-pressed', String(source === 'demo'));
    stage.dataset.source = source;
    stage.dataset.style = style;
    document.getElementById('voice-source').textContent = active ? 'МИКРОФОН / ЖИВОЙ СИГНАЛ' : source === 'demo' ? 'ДЕМО / ИСКУССТВЕННЫЙ СИГНАЛ' : waiting ? 'ПОДКЛЮЧЕНИЕ МИКРОФОНА' : 'ОЖИДАНИЕ';
    document.getElementById('voice-stage-hint').textContent = active ? 'Волна реагирует на твой голос' : source === 'demo' ? 'Пример движения без микрофона' : waiting ? 'Разреши микрофон в браузере' : 'Включи микрофон или посмотри демо';
    document.getElementById('voice-input-name').textContent = active ? 'Микрофон' : source === 'demo' ? 'Демонстрация' : 'Не выбран';
    notice.textContent = message || (active ? 'Слушаю. Говори в обычном темпе.' : source === 'demo' ? 'Искусственный сигнал. Включи микрофон, чтобы увидеть свой голос.' : waiting ? 'Ожидаю разрешение на доступ к микрофону.' : 'Микрофон выключен.');
    notice.dataset.error = String(error);
    document.querySelectorAll('[data-voice-style]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.voiceStyle === style)));
    if (!active && source !== 'demo') updateReadings(performance.now());
  }

  async function startMicrophone() {
    stopSignal();
    if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
      renderStatus('Этот браузер не поддерживает микрофон. Открой сайт в Safari или Chrome по HTTPS.', true);
      return;
    }
    const attempt = sequence;
    source = 'requesting'; renderStatus();
    try {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      const engine = new AudioEngine();
      audioContext = engine;
      const resume = engine.resume();
      void resume.catch(() => {});
      const incoming = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      // Позднее разрешение не должно включать микрофон после отмены или закрытия окна.
      if (attempt !== sequence || !dialog.open) { incoming.getTracks().forEach(track => track.stop()); return; }
      stream = incoming;
      await resume;
      if (attempt !== sequence || !dialog.open) return;
      if (engine.state !== 'running') throw new Error('audio_suspended');
      analyser = engine.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = .78;
      audioSource = engine.createMediaStreamSource(incoming);
      audioSource.connect(analyser);
      samples = new Float32Array(analyser.fftSize);
      frequencies = new Uint8Array(analyser.frequencyBinCount);
      incoming.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (attempt !== sequence) return;
        stopSignal(); renderStatus('Микрофон отключен. Можно подключить его снова.', true);
      }));
      source = 'mic'; startedAt = performance.now(); renderStatus();
    } catch (error) {
      if (attempt !== sequence) return;
      stopSignal();
      const messages = {
        NotAllowedError: 'Доступ к микрофону закрыт. Разреши его для этого сайта в настройках браузера и повтори.',
        NotFoundError: 'Микрофон не найден. Подключи устройство и повтори.',
        NotReadableError: 'Не удалось открыть микрофон. Проверь, не занят ли он другим приложением.'
      };
      renderStatus(messages[error.name] || 'Микрофон недоступен. Повтори подключение или посмотри демо.', true);
    }
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = rect.width; height = rect.height;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function sampleSignal(time) {
    let target = 0;
    if (source === 'mic' && analyser) {
      analyser.getFloatTimeDomainData(samples);
      analyser.getByteFrequencyData(frequencies);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      decibels = Math.max(-90, 20 * Math.log10(Math.max(rms, .000001)));
      target = Math.min(1, Math.pow(Math.max(0, rms - .002) * 7, .7));
    } else if (source === 'demo') {
      const t = (time - startedAt) / 1000;
      const phrase = Math.pow(Math.max(0, Math.sin(t * 1.08)), .7);
      target = phrase * (.2 + .55 * Math.pow(Math.sin(t * 6.7), 2));
      decibels = -56 + target * 45;
    }
    level += (target - level) * (target > level ? .35 : .12);
  }

  function updateReadings(time) {
    const active = source === 'mic' || source === 'demo';
    const seconds = active ? Math.floor((time - startedAt) / 1000) : 0;
    document.getElementById('voice-clock').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    document.getElementById('voice-level').textContent = active ? Math.round(decibels) + ' dBFS' : '-';
    document.getElementById('voice-level-fill').style.width = active ? Math.min(100, Math.max(0, (decibels + 65) / 65 * 100)) + '%' : '0%';
    if (source === 'mic' && seconds >= 120) {
      stopSignal(); renderStatus('Две минуты прослушивания завершены. Включи микрофон снова, если хочешь продолжить.');
    }
  }

  function drawParticles(time) {
    const motion = reducedMotion.matches ? 0 : time * .00016;
    const amplitude = 8 + level * 50;
    // Частицы формируют стоячие волны; спектр голоса меняет рисунок и высоту поверхности.
    const harmonic = frequencies ? frequencies.slice(2, 22).reduce((sum, value) => sum + value, 0) / 5100 : level * .35;
    const rows = 65, columns = width < 500 ? 100 : 180;
    for (let row = 0; row < rows; row++) {
      const z = row / (rows - 1) * 2 - 1;
      const depth = (z + 1) / 2;
      const spread = .76 + depth * .24;
      context.fillStyle = `rgba(217,255,235,${.5 + depth * .5})`;
      for (let column = 0; column < columns; column++) {
        const x = column / (columns - 1) * 2 - 1;
        const envelope = Math.exp(-x * x * 1.6 - z * z * .6);
        const field = Math.cos(x * 8 + motion) * Math.cos(z * 6 - motion * .7) - Math.cos(z * 8 + harmonic * 3) * Math.cos(x * 6);
        const ridge = Math.exp(-field * field * (9 + level * 12));
        const surface = Math.sin(x * 6 + z * 4 + motion * 3) * envelope * amplitude;
        const px = width * .5 + x * width * .45 * spread;
        const py = height * .55 + z * height * .23 - ridge * amplitude * .9 - surface;
        const size = (.8 + ridge * 1.5) * (.7 + depth * .6);
        context.globalAlpha = (ridge * .8 + .15) * Math.min(1, (1 - Math.abs(x)) * 5);
        context.fillRect(px, py, size, size);
      }
    }
    context.globalAlpha = 1;
  }

  function drawWave(time) {
    const phase = reducedMotion.matches ? 0 : time * .0016;
    const amplitude = 3 + level * height * .27;
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(65,175,126,0)'); gradient.addColorStop(.25, '#53b88a');
    gradient.addColorStop(.5, '#d6ffea'); gradient.addColorStop(.75, '#53b88a'); gradient.addColorStop(1, 'rgba(65,175,126,0)');
    context.strokeStyle = gradient;
    for (let line = 0; line < 7; line++) {
      context.beginPath(); context.lineWidth = line === 3 ? 2 : 1;
      context.globalAlpha = line === 3 ? .95 : .15 + line * .035;
      for (let point = 0; point <= 220; point++) {
        const fraction = point / 220, x = fraction * width;
        const envelope = Math.pow(Math.sin(fraction * Math.PI), 2.8);
        const wave = Math.sin(fraction * Math.PI * (6 + line * .12) - phase + line * .3) * .65 + Math.sin(fraction * Math.PI * 10 + phase * .7) * .35;
        const y = height * .5 + envelope * wave * amplitude * (1 - Math.abs(line - 3) * .12);
        if (point) context.lineTo(x, y); else context.moveTo(x, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  let sand = [], sandColumns = 0;
  function prepareSand() {
    const columns = width < 500 ? 170 : 300;
    if (columns === sandColumns) return;
    sandColumns = columns; sand = [];
    let seed = 7319;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const rows = width < 500 ? 90 : 140;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const x = (column + random()) / columns * 2 - 1;
      const z = (row + random()) / rows * 2 - 1;
      if (x * x + z * z < 1) sand.push({x,z,jitter:random(),grain:random()});
    }
  }

  function drawSilo(time) {
    prepareSand();
    const motion = reducedMotion.matches ? 0 : time * .00012;
    const active = source === 'mic' || source === 'demo';
    const energy = active ? level : 0;
    const spectrum = frequencies ? frequencies.slice(5, 80).reduce((sum,value)=>sum+value,0) / (75 * 255) : energy * .6;
    const center = height * .64, reach = height * (.058 + energy * .18);
    const drift = Math.sin(motion * .62) * .18;
    const haze = context.createRadialGradient(width * .5, center, 0, width * .5, center, width * .47);
    haze.addColorStop(0, `rgba(218,221,216,${.018 + energy * .025})`);
    haze.addColorStop(.7, 'rgba(204,208,201,.006)'); haze.addColorStop(1, 'rgba(204,208,201,0)');
    context.fillStyle=haze; context.fillRect(0,0,width,height);
    // Неподвижные зерна образуют узловые гребни. Голос меняет рельеф и смешение мод.
    context.fillStyle = '#ecf0e8';
    for (const grain of sand) {
      const x = grain.x, z = grain.z, depth = (z + 1) * .5;
      const edge = Math.min(1, (1 - x*x - z*z) * 5);
      const u = x + Math.sin(motion * .6 + z * 3) * .045;
      const v = z + drift * .1;
      const a = Math.cos(u * Math.PI * 2.6 + drift) * Math.cos(v * Math.PI * 1.9);
      const b = Math.cos(u * Math.PI * 1.9) * Math.cos(v * Math.PI * 2.6 - drift);
      const secondary = Math.sin(u * 8 + motion) * Math.sin(v * 7 - motion * .7);
      const field = a - b + secondary * (.12 + spectrum * .45);
      const ridge = Math.exp(-field * field * (8 + energy * 6));
      const undulation = Math.sin(u * 4 + motion) * Math.cos(v * 4 - motion) * (.22 + energy * .2);
      const elevation = (ridge * .88 + undulation) * reach * edge;
      const px = width * .5 + x * width * .46 * (.7 + depth * .3);
      const py = center + z * height * .16 - elevation * (.65 + depth * .35);
      const size = (.62 + grain.grain * .65 + ridge * .35) * (.5 + depth * .8);
      context.globalAlpha = Math.min(1,edge * (.02 + Math.pow(ridge, 1.2) * (.65 + grain.jitter * .85)) * (.5 + depth * .5));
      context.fillRect(px,py,size,size);
      // Рассеянные зерна над гребнями добавляют объем без вертикальных столбиков.
      if (grain.jitter > .88 && ridge > .45) {
        const lift = (grain.jitter - .88) * 100 * (.3 + energy * 1.8);
        context.globalAlpha *= .28;
        context.fillRect(px + Math.sin(motion * 2 + grain.x * 25) * lift * .12, py - lift, size * .65, size * .65);
      }
    }
    context.globalAlpha = 1;
  }

  function animate(time) {
    if (!dialog.open || document.hidden) { frame = 0; return; }
    frame = requestAnimationFrame(animate);
    if (time - previousFrame < (reducedMotion.matches ? 125 : 32)) return;
    previousFrame = time;
    sampleSignal(time);
    if (context && width && height) {
      context.clearRect(0, 0, width, height);
      if (style === 'silo') drawSilo(time);
      else if (style === 'particles') drawParticles(time);
      else drawWave(time);
    }
    if (time - lastReadout > 100) { updateReadings(time); lastReadout = time; }
  }

  function open() {
    if (dialog.open) return;
    dialog.showModal(); resize(); renderStatus();
    if (!frame) frame = requestAnimationFrame(animate);
  }

  document.querySelectorAll('[data-open-voice]').forEach(button => button.addEventListener('click', open));
  document.getElementById('voice-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    stopSignal(); cancelAnimationFrame(frame); frame = 0; renderStatus();
  });
  micButton.addEventListener('click', () => {
    if (source === 'mic' || source === 'requesting') { stopSignal(); renderStatus(); }
    else void startMicrophone();
  });
  demoButton.addEventListener('click', () => {
    const wasDemo = source === 'demo'; stopSignal();
    if (!wasDemo) { source = 'demo'; startedAt = performance.now(); }
    renderStatus();
  });
  document.querySelectorAll('[data-voice-style]').forEach(button => button.addEventListener('click', () => {
    style = button.dataset.voiceStyle; renderStatus();
  }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const wasListening = source === 'mic' || source === 'requesting';
      stopSignal(); cancelAnimationFrame(frame); frame = 0;
      renderStatus(wasListening ? 'Микрофон выключен: вкладка была скрыта.' : '');
    } else if (dialog.open && !frame) frame = requestAnimationFrame(animate);
  });
  window.addEventListener('pagehide', stopSignal);
  new ResizeObserver(resize).observe(stage);
  if (new URLSearchParams(location.search).get('voice') === '1') open();
})();
