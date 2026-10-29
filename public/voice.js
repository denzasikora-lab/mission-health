(() => {
  const dialog = document.getElementById('media-diary-dialog');
  const panel = document.getElementById('voice-dialog');
  const visible = () => dialog.open && !panel.hidden;
  const stage = document.getElementById('voice-stage');
  const canvas = document.getElementById('voice-canvas');
  const context = canvas.getContext('2d');
  const micButton = document.getElementById('voice-mic');
  const demoButton = document.getElementById('voice-demo');
  const styleChoice = document.getElementById('voice-style');
  const notice = document.getElementById('voice-notice');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let source = 'idle', style = 'silo', sequence = 0, frame = 0;
  try { const savedStyle=localStorage.getItem('mission-health-voice-style'); if(['silo','particles','wave'].includes(savedStyle))style=savedStyle; } catch {}
  if(styleChoice)styleChoice.value=style;
  let stream, audioContext, audioSource, analyser, samples, frequencies;
  let startedAt = 0, previousFrame = 0, level = 0, decibels = -90;
  let width = 0, height = 0, lastReadout = 0;

  function stopSignal() {
    sequence++; window.missionSpeech?.stop('voice');
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
    if(styleChoice)styleChoice.value=style;
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
      if (attempt !== sequence || !visible()) { incoming.getTracks().forEach(track => track.stop()); return; }
      stream = incoming; window.missionSpeech?.start('voice', incoming);
      await resume;
      if (attempt !== sequence || !visible()) return;
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

  function drawSilo(time) {
    const motion = reducedMotion.matches ? 0 : time * .0006;
    const energy = source === 'mic' || source === 'demo' ? level : 0;
    const center = width * .5, base = height * .84, reach = height * (.43 + energy * .3);
    context.save();
    const background = context.createLinearGradient(0,0,0,height);
    background.addColorStop(0,'#061321');background.addColorStop(.55,'#12344e');background.addColorStop(1,'#071a2a');
    context.fillStyle=background;context.fillRect(0,0,width,height);
    const haze=context.createRadialGradient(center,height*.58,0,center,height*.58,width*.52);
    haze.addColorStop(0,`rgba(64,161,231,${.2+energy*.15})`);haze.addColorStop(1,'rgba(29,90,144,0)');
    context.fillStyle=haze;context.fillRect(0,0,width,height);
    // Изогнутые линии задают глубину голубого экрана вокруг звуковой голограммы.
    for(let line=0;line<7;line++){
      const y=height*(.07+line*.14);
      context.beginPath();context.moveTo(-width*.04,y-height*.055);
      context.bezierCurveTo(width*.25,y+height*.09,width*.75,y+height*.09,width*1.04,y-height*.055);
      context.strokeStyle=`rgba(118,215,255,${line===4?.23:.11})`;context.lineWidth=line===4?1.4:.7;context.stroke();
    }
    for(let line=1;line<12;line++){
      const x=width*line/12,bend=(x-center)*.1;
      context.beginPath();context.moveTo(x-bend,0);context.quadraticCurveTo(x+bend,height*.5,x-bend,height);
      context.strokeStyle='rgba(104,186,234,.045)';context.lineWidth=.6;context.stroke();
    }
    const glow=context.createRadialGradient(center,base,0,center,base,width*.23);
    glow.addColorStop(0,`rgba(118,215,255,${.2+energy*.3})`);glow.addColorStop(1,'rgba(67,169,245,0)');
    context.fillStyle=glow;context.fillRect(center-width*.25,base-height*.3,width*.5,height*.45);
    context.globalCompositeOperation='lighter';
    const light=context.createLinearGradient(0,base-reach,0,base);
    light.addColorStop(0,'rgba(118,215,255,0)');light.addColorStop(.25,'rgba(118,215,255,.22)');light.addColorStop(.8,'rgba(118,215,255,.72)');light.addColorStop(1,'rgba(118,215,255,.08)');
    context.strokeStyle=light;
    const columns=width<500?72:112;
    // Высота и плотность центральных световых нитей реагируют на существующий сигнал микрофона.
    for(let layer=0;layer<3;layer++)for(let column=0;column<columns;column++){
      const u=column/(columns-1)*2-1,envelope=Math.exp(-u*u*4.5);
      const bin=frequencies?frequencies[Math.min(frequencies.length-1,5+Math.floor(column/columns*80))]/255:energy*Math.abs(Math.sin(column*.91+motion));
      const crest=.28+.72*Math.pow(.5+.5*Math.sin(column*1.71+layer*.8+motion*(.3+energy)),2);
      const lift=reach*envelope*(.2+crest*.7+bin*.4);
      const x=center+u*width*(.13+energy*.035)+(layer-1)*2;
      context.beginPath();
      for(let step=0;step<=14;step++){
        const fraction=step/14,y=base-fraction*lift+Math.sin(column*.6+layer)*height*.018;
        const ripple=Math.sin(fraction*13+column*.7+motion*2)*(1.1+energy*2.7)*Math.sin(fraction*Math.PI);
        if(step)context.lineTo(x+ripple,y);else context.moveTo(x,y);
      }
      context.globalAlpha=(.12+energy*.2)*(.4+envelope*.6);context.lineWidth=.6+layer*.25;context.stroke();
      const rise=(column*.618+motion*.12)%1;
      context.fillStyle='#76d7ff';context.globalAlpha=(.12+energy*.22)*envelope*(1-rise);
      context.fillRect(x+Math.sin(column+motion)*2,base-rise*lift,1,1.6+energy*2);
    }
    context.restore();
  }

  function animate(time) {
    if (!visible() || document.hidden) { frame = 0; return; }
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

  function enter() {
    resize(); renderStatus();
    if (!frame) frame = requestAnimationFrame(animate);
  }
  function leave() { stopSignal(); cancelAnimationFrame(frame); frame = 0; renderStatus(); }
  function open() { window.missionDiary.open('audio'); }
  window.missionDiary.register('audio', {enter, leave});
  document.querySelectorAll('[data-open-voice]').forEach(button => button.addEventListener('click', open));
  micButton.addEventListener('click', () => {
    if (source === 'mic' || source === 'requesting') { stopSignal(); renderStatus(); }
    else void startMicrophone();
  });
  demoButton.addEventListener('click', () => {
    const wasDemo = source === 'demo'; stopSignal();
    if (!wasDemo) { source = 'demo'; startedAt = performance.now(); }
    renderStatus();
  });
  function setStyle(value) {
    if(!['silo','particles','wave'].includes(value))return;
    style=value;try{localStorage.setItem('mission-health-voice-style',style);}catch{}renderStatus();
  }
  styleChoice?.addEventListener('change',()=>setStyle(styleChoice.value));
  document.querySelectorAll('[data-voice-style]').forEach(button => button.addEventListener('click', () => setStyle(button.dataset.voiceStyle)));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopSignal(); cancelAnimationFrame(frame); frame = 0;
      renderStatus();
    } else if (visible() && !frame) frame = requestAnimationFrame(animate);
  });
  window.addEventListener('pagehide', stopSignal);
  new ResizeObserver(resize).observe(stage);
  if (new URLSearchParams(location.search).get('voice') === '1') open();
})();
