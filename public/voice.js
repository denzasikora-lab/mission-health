(() => {
  const dialog = document.getElementById('voice-dialog');
  const stage = document.getElementById('voice-stage');
  const canvas = document.getElementById('voice-canvas');
  const context = canvas.getContext('2d');
  const micButton = document.getElementById('voice-mic');
  const demoButton = document.getElementById('voice-demo');
  const notice = document.getElementById('voice-notice');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let source = 'idle', style = 'glass', sequence = 0, frame = 0;
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

  function drawGlass(time) {
    const motion = reducedMotion.matches ? 0 : time * .00055;
    const baseline = height * .83;
    // Изогнутые линии создают глубину стекла, а нити растут из общего основания.
    context.lineWidth = 1;
    for (let row = 0; row < 7; row++) {
      const y = height * (.12 + row * .126);
      context.strokeStyle = `rgba(181,222,255,${row === 0 ? .2 : .075})`;
      context.beginPath(); context.moveTo(-20, y - height * .035);
      context.bezierCurveTo(width * .27, y + height * .075, width * .73, y + height * .075, width + 20, y - height * .035);
      context.stroke();
    }
    const glow = context.createRadialGradient(width * .5, baseline - height * .1, 0, width * .5, baseline - height * .1, width * .38);
    glow.addColorStop(0, `rgba(105,205,255,${.06 + level * .18})`);
    glow.addColorStop(.5, `rgba(63,155,239,${.03 + level * .06})`);
    glow.addColorStop(1, 'rgba(28,92,162,0)');
    context.fillStyle = glow; context.fillRect(0, 0, width, height);

    const strands = width < 500 ? 58 : 92;
    const active = source === 'mic' || source === 'demo';
    for (let strand = 0; strand < strands; strand++) {
      const u = strand / (strands - 1), x = u * 2 - 1;
      const depth = (strand * .61803398875) % 1;
      const envelope = Math.exp(-x * x * 5.5);
      const frequencyIndex = frequencies ? Math.min(frequencies.length - 1, Math.round(3 * Math.pow(80, u))) : 0;
      const spectral = frequencies ? frequencies[frequencyIndex] / 255 : .35 + .3 * Math.sin(u * 17 + motion * 2);
      const summit = .55 + .45 * Math.pow(Math.sin(strand * 1.71 + motion * .7), 2);
      const reach = Math.min(height * .68, height * envelope * (.015 + (active ? Math.sqrt(level) : 0) * (.75 + spectral * .28)) * summit);
      const rootX = width * .5 + x * width * .34;
      const rootY = baseline + (depth - .5) * height * .065;
      const alpha = (.24 + depth * .35) * (.6 + level * .4) * envelope;
      context.strokeStyle = `rgba(170,229,255,${alpha})`;
      context.lineWidth = depth > .8 ? 1.1 : .65;
      context.beginPath();
      for (let point = 0; point < 36; point++) {
        const v = point / 35;
        const drift = Math.sin(v * 10 + strand * 2 + motion * 2) * (1 + v * 3) * (.2 + level);
        const px = rootX + drift + x * v * width * .014;
        const py = rootY - v * reach;
        if (point) context.lineTo(px, py); else context.moveTo(px, py);
      }
      context.stroke();
      context.fillStyle = `rgba(212,244,255,${Math.min(.85, alpha * 2)})`;
      for (let point = 0; point < 16; point++) {
        const v = (point / 16 + (reducedMotion.matches ? 0 : motion * (.15 + depth * .12))) % 1;
        const drift = Math.sin(v * 10 + strand * 2 + motion * 2) * (1 + v * 3) * (.2 + level);
        context.fillRect(rootX + drift + x * v * width * .014, rootY - v * reach, .7 + depth * .7, 1 + depth);
      }
    }
    const baseGlow = context.createLinearGradient(width * .12, 0, width * .88, 0);
    baseGlow.addColorStop(0, 'rgba(130,211,255,0)'); baseGlow.addColorStop(.5, `rgba(163,229,255,${.15 + level * .32})`); baseGlow.addColorStop(1, 'rgba(130,211,255,0)');
    context.strokeStyle = baseGlow; context.lineWidth = 1;
    context.beginPath(); context.moveTo(width * .12, baseline + 8);
    context.bezierCurveTo(width * .35, baseline + 18, width * .65, baseline + 18, width * .88, baseline + 8); context.stroke();
  }

  function animate(time) {
    if (!dialog.open || document.hidden) { frame = 0; return; }
    frame = requestAnimationFrame(animate);
    if (time - previousFrame < (reducedMotion.matches ? 125 : 32)) return;
    previousFrame = time;
    sampleSignal(time);
    if (context && width && height) {
      context.clearRect(0, 0, width, height);
      if (style === 'glass') drawGlass(time);
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
