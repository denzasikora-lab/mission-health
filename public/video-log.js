(() => {
  const dialog = document.getElementById('media-diary-dialog');
  const panel = document.getElementById('video-log-dialog');
  const visible = () => window.missionDiary.active && !panel.hidden;
  const canvas = document.getElementById('video-log-canvas');
  const screen = document.getElementById('video-log-screen');
  const context = canvas.getContext('2d');
  const video = document.getElementById('video-log-input');
  const segmentationInput = document.createElement('canvas');
  segmentationInput.width = 640; segmentationInput.height = 360;
  const segmentationContext = segmentationInput.getContext('2d');
  const cameraButton = document.getElementById('video-log-camera');
  const backgroundChoice = document.getElementById('video-log-background');
  const notice = document.getElementById('video-log-notice');
  const helmetZoom = document.getElementById('video-log-zoom');
  const researcher = document.getElementById('video-log-researcher');
  const firstName = document.getElementById('video-log-first-name');
  const lastName = document.getElementById('video-log-last-name');
  const identityForm = document.getElementById('video-log-identity');
  const locationName = document.getElementById('video-log-location');
  const background = new Image();
  background.src = '/assets/video-log-lab.png';
  const orbitBackground=new Image();orbitBackground.src='/assets/video-log-orbit.png';
  let phase = 'idle', epoch = 0, stream, worker, workerReady = false, workerBusy = false;
  let portrait, frame = 0, lastDraw = 0, lastSegmentation = 0;
  let recorder, recordedStream, recordingStarted = 0, recordingTimer, cameraTimer, workerTimer, autoRecordAttempt = -1;
  let entry = 1, identity, identityPromise, identityEpoch = 0;
  const microphoneMeter = window.missionMedia.meter('video-log');
  const earthStation = () => locationName.dataset.station || 'HOUSTON / JOHNSON';
  const storageKey = suffix => 'mission-health-log-' + (identity?.researcherId || 'local') + '-' + suffix;
  function normalized(value) { return String(value || '').replace(/[\u2013\u2014]/g, '-'); }
  function filmName(value) { return normalized(value).trim().replace(/\s+/g, ' ') || 'Participant'; }
  async function loadIdentity() {
    const ticket = ++identityEpoch;
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) throw new Error('identity_unavailable');
      const incoming = await response.json();
      if (ticket !== identityEpoch) return;
      identity = incoming;
      try { entry = Math.max(1, Number(localStorage.getItem(storageKey('entry'))) || 1); } catch {}
      firstName.value = 'Sara'; lastName.value = 'Khan';
      updateSignature(); renderControls();
    } catch { if (ticket === identityEpoch) message('Could not read the profile. Refresh the page after signing in.', true); }
  }

  function updateSignature() {
    researcher.value = 'Cdr. Sara Khan';
    document.getElementById('video-log-title').textContent = 'Diary';
    window.missionAppearance?.setIdentity({storageScope:identity?.storageScope,name:'Cdr. Sara Khan'});
  }

  function message(value, error = false) { notice.textContent = value; notice.dataset.error = String(error); }
  function renderPreview() {
    // Live video is visible immediately, until a reliable person mask is available.
    screen.dataset.preview = !stream ? 'idle' : backgroundChoice.value === 'room' || !portrait ? 'camera' : 'background';
    canvas.setAttribute('aria-label', screen.dataset.preview === 'camera' ? 'Original camera without background replacement' : 'Video diary camera with selected appearance');
  }
  function renderControls() {
    renderPreview();
    const active = phase === 'live' || phase === 'recording';
    cameraButton.textContent = phase === 'requesting' ? 'Cancel connection' : phase === 'recording' ? 'Stop recording' : phase === 'finishing' ? 'Preparing recording' : active ? 'Disable camera' : 'Enable camera';
    cameraButton.disabled = phase === 'finishing';
    cameraButton.setAttribute('aria-pressed', String(active));
    cameraButton.dataset.recording = String(phase === 'recording');
    backgroundChoice.disabled = phase === 'recording' || phase === 'finishing';
    helmetZoom.disabled = backgroundChoice.disabled;
    document.getElementById('video-log-zoom-label').hidden = backgroundChoice.value !== 'helmet';
    firstName.disabled = lastName.disabled = phase === 'recording' || phase === 'finishing';
    window.missionDiary.lock('video', phase === 'recording' || phase === 'finishing');
  }

  function stopCamera() {
    if(recorder?.state==='recording')recorder.observationSnapshot=recorder.captureObservation?.();
    epoch++; window.missionSpeech?.stop('video'); microphoneMeter.stop();
    window.missionAppearance?.stop();
    if (recorder?.state === 'recording') { phase = 'finishing'; recorder.stop(); }
    clearTimeout(cameraTimer); clearTimeout(workerTimer); clearInterval(recordingTimer);
    cameraTimer = workerTimer = recordingTimer = null;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    video.pause(); video.srcObject = null;
    worker?.terminate(); worker = null; workerReady = workerBusy = false;
    portrait?.close(); portrait = null;
    renderPreview();
  }

  function backgroundError(attempt, activeWorker = worker) {
    if (attempt !== epoch || worker !== activeWorker) return;
    clearTimeout(workerTimer); workerTimer = null;
    activeWorker?.terminate(); worker = null; workerReady = workerBusy = false;
    portrait?.close(); portrait = null; renderPreview();
    message('Background unavailable. Camera works without background replacement.' + (phase === 'recording' ? ' Recording continues.' : ''));
  }

  function prepareBackground(attempt) {
    if (worker || backgroundChoice.value === 'room') return;
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
      message('Camera works without background replacement: background processing is unavailable in this browser.'); return;
    }
    message((phase === 'recording' ? 'Recording. ' : '') + 'Processing background on your device.');
    worker = new Worker('/video-background-worker.js?v=20261030-camera-preview1');
    const activeWorker = worker;
    workerTimer = setTimeout(() => {
      if (worker === activeWorker && !workerReady) backgroundError(attempt, activeWorker);
    }, 45000);
    worker.onmessage = event => {
      const data = event.data;
      if (attempt !== epoch || worker !== activeWorker) { data.bitmap?.close(); return; }
      if (data.type === 'ready') { clearTimeout(workerTimer); workerTimer = null; workerReady = true; }
      else if (data.type === 'frame') {
        clearTimeout(workerTimer); workerTimer = null;
        const hadPortrait = Boolean(portrait);
        portrait?.close(); portrait = data.hasPerson === false ? null : data.bitmap; workerBusy = false;
        if (!portrait) data.bitmap?.close();
        renderPreview();
        if (portrait && !hadPortrait && phase === 'recording') message('Recording video and audio. Press «Stop recording», when finished.');
      } else if (data.type === 'error') backgroundError(attempt, activeWorker);
    };
    worker.onerror = () => backgroundError(attempt, activeWorker);
    worker.postMessage({ type: 'init' });
  }

  async function startCamera() {
    stopCamera(); microphoneMeter.prepare(); window.missionSpeech?.reset('video'); phase = 'requesting'; renderControls();
    message('Allow camera and microphone access in your browser. Audio is included in the recording.');
    const attempt = epoch;
    try {
      await (identityPromise ||= loadIdentity());
      if (attempt !== epoch || !visible()) return;
      if (!identity || !researcher.value.trim()) {
        stopCamera(); phase = 'idle'; renderControls();
        message('Could not read the profile name. Refresh the page after signing in.', true); return;
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
      const incoming = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      // Permission granted after closing or cancelling must not reactivate the camera.
      if (attempt !== epoch || !visible()) { incoming.getTracks().forEach(track => track.stop()); return; }
      if(!incoming.getAudioTracks().length){incoming.getTracks().forEach(track=>track.stop());throw new Error('audio_required');}
      stream = incoming; video.srcObject = incoming; renderPreview(); await video.play();
      if (attempt !== epoch || !visible()) return;
      phase = 'live'; microphoneMeter.attach(incoming); renderControls();
      void window.missionSpeech?.start('video', stream);
      window.missionAppearance?.start(video,incoming.getVideoTracks?.()[0]?.getSettings?.());
      incoming.getTracks().forEach(track => track.addEventListener('ended', () => {
        if (attempt !== epoch) return;
        stopCamera(); if (phase !== 'finishing') phase = 'idle'; renderControls(); message('Device disconnected. You can reconnect the camera.', true);
      }));
      cameraTimer = setTimeout(() => {
        stopCamera(); if (phase !== 'finishing') phase = 'idle'; renderControls(); message('Camera stopped after three minutes of preview.');
      }, 180000);
      void recordWhenReady(attempt);
      if (backgroundChoice.value !== 'room') {
        try { prepareBackground(attempt); } catch { backgroundError(attempt); }
      }
    } catch (error) {
      if (attempt !== epoch) return;
      stopCamera(); phase = 'idle'; renderControls();
      const errors = {
        NotAllowedError: 'Access denied. Allow camera and microphone access for this site and retry.',
        NotFoundError: 'Camera or microphone not found. Both devices are required for recording.',
        NotReadableError: 'Device busy. Close other camera applications and retry.'
      };
      message(errors[error.name] || 'Could not enable the camera. Retry in Safari or Chrome.', true);
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
    // Captions and positioning follow the selected video diary reference Avatar.
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
    context.fillText('EARTH SOURCE: ' + earthStation(), 140, 618);
    context.fillText('RESEARCHER: ' + name, 140, 632, 300); context.fillText('P.I.: ' + name, 140, 646, 300);
    context.fillText('ID# ' + id, 450, 632); context.fillText('ID# ' + id, 450, 646);
    const clock = [date.getHours(), date.getMinutes(), date.getSeconds(), Math.floor(date.getMilliseconds() / 1000 * 24)].map(value => String(value).padStart(2, '0')).join(':');
    const calendar = [date.getMonth() + 1, date.getDate(), date.getFullYear()].map(value => String(value).padStart(2, '0')).join('/');
    context.fillText('LST:  ' + clock, 720, 632); context.fillText('DATE: ' + calendar, 720, 646);
    context.restore();
  }

  async function sendFrame(time) {
    const attempt = epoch, activeWorker = worker;
    workerBusy = true; lastSegmentation = time;
    workerTimer = setTimeout(() => backgroundError(attempt, activeWorker), 5000);
    try {
      // Intermediate canvas also works in Safari without conversion video in bitmap.
      segmentationContext.drawImage(video, 0, 0, 640, 360);
      const bitmap = await createImageBitmap(segmentationInput);
      if (attempt !== epoch || worker !== activeWorker || !visible()) { bitmap.close(); return; }
      activeWorker.postMessage({ type: 'frame', bitmap, timestamp: time }, [bitmap]);
    } catch { backgroundError(attempt, activeWorker); }
  }

  function animate(time) {
    if (!visible() || document.hidden) { frame = 0; return; }
    frame = requestAnimationFrame(animate);
    if (time - lastDraw < 33) return;
    lastDraw = time;
    context.fillStyle = backgroundChoice.value === 'room' ? '#000' : '#102027'; context.fillRect(0, 0, 1280, 720);
    if (backgroundChoice.value === 'room') {
      // Preview fills its container, analysis receives the original camera track.
      if (stream && video.readyState >= 2) cover(video);
      return;
    }
    const helmet=backgroundChoice.value==='helmet';
    const backdrop=backgroundChoice.value==='orbit'?orbitBackground:background;
    if(helmet) window.missionHelmet.backdrop(context);
    else if (backdrop.complete && backdrop.naturalWidth) cover(backdrop);
    if (stream && video.readyState >= 2) {
      {
        if (portrait) { if(helmet)window.missionHelmet.portrait(context,portrait,Number(helmetZoom.value)||1.45);else cover(portrait, true); }
        if (workerReady && !workerBusy && time - lastSegmentation > 80) void sendFrame(time);
      }
    }
    if(helmet) window.missionHelmet.hud(context,{time,active:phase==='live'||phase==='recording',recording:phase==='recording',seconds:phase==='recording'?Math.max(0,Math.floor((time-recordingStarted)/1000)):0,name:filmName(researcher.value),location:earthStation(),entry,audio:Boolean(stream?.getAudioTracks().some(track=>track.readyState!=='ended'&&track.enabled))});
    else drawOverlay(time);
  }

  function recordWhenReady(attempt) {
    if (attempt !== epoch || phase !== 'live' || autoRecordAttempt === attempt) return;
    autoRecordAttempt = attempt;
    // Recording of original tracks does not depend on appearance readiness.
    startRecording();
  }

  function startRecording() {
    if (phase !== 'live') return;
    updateSignature();
    if (!identity || !researcher.value.trim()) { message('Could not read the profile name. Refresh the page after signing in.', true); return; }
    if (!window.MediaStream || !window.MediaRecorder) { message('Recording video is unsupported in this browser. Try Safari or Chrome.', true); return; }
    const audio = stream.getAudioTracks().length > 0;
    const types = audio ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'] : ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'];
    const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { message('No suitable recording format found. Try another browser.', true); return; }
    const chunks = [];
    const ageContext = window.missionAppearance?.ageContext?.();
    try {
      recordedStream = new MediaStream(stream.getTracks().map(track => track.clone()));
      recorder = new MediaRecorder(recordedStream, { mimeType, videoBitsPerSecond: 900000, audioBitsPerSecond: 96000 });
      const recording = recorder;
      recording.captureObservation=()=>window.missionAppearance?.ageSnapshot?.(ageContext);
      let failed = false;
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onerror = () => { failed = true; stopCamera(); if (phase !== 'finishing') phase = 'idle'; renderControls(); message('Could not finish recording. Retry after connecting the camera.', true); };
      recording.onstop = () => {
        const ageInput = recording.observationSnapshot||window.missionAppearance?.ageSnapshot?.(ageContext);
        window.missionSpeech?.stop('video');
        recordedStream?.getTracks().forEach(track => track.stop()); recordedStream = null;
        stopCamera(); recorder = null;
        if (failed || !chunks.length) { phase = 'idle'; renderControls(); return; }
        const blob = new Blob(chunks, { type: recording.mimeType });
        const duration = Math.max(.1,(performance.now()-recordingStarted)/1000);
        entry++;
        try { localStorage.setItem(storageKey('entry'), String(entry)); } catch {}
        phase = 'idle'; renderControls(); message('Recording sent for analysis.');
        void window.missionMedia.submit('video',blob,duration,ageInput);
      };
      recordingStarted = performance.now(); phase = 'recording';
      recording.start(250); clearTimeout(cameraTimer);
      recordingTimer = setInterval(() => {
        if (performance.now() - recordingStarted >= 120000 && recording.state === 'recording') { phase = 'finishing'; recording.stop(); renderControls(); }
      }, 250);
      renderControls(); message('Recording video and audio. Press «Stop recording», when finished.');
    } catch {
      recordedStream?.getTracks().forEach(track => track.stop()); recordedStream = null; recorder = null;
      window.missionSpeech?.stop('video');phase = 'live'; renderControls(); message('Could not start recording. Reconnect the camera.', true);
    }
  }

  function prepare() { identityPromise ||= loadIdentity(); }
  function enter() {
    prepare(); renderControls();
    if (!frame) frame = requestAnimationFrame(animate);
  }
  function leave() {
    stopCamera(); cancelAnimationFrame(frame); frame = 0;
    if (phase !== 'finishing') phase = 'idle'; renderControls();
  }
  function open() { window.missionDiary.open('video'); }
  window.missionDiary.register('video', {enter, leave, prepare});
  document.querySelectorAll('[data-open-video-log]').forEach(button => button.addEventListener('click', open));
  cameraButton.addEventListener('click', () => {
    if (phase === 'requesting' || phase === 'live' || phase === 'recording') {
      stopCamera(); if (phase !== 'finishing') phase = 'idle'; renderControls(); message('Camera is off.');
    } else void startCamera();
  });
  backgroundChoice.addEventListener('change', () => {
    portrait?.close(); portrait = null;
    if (stream && backgroundChoice.value !== 'room') prepareBackground(epoch);
    if (backgroundChoice.value === 'room') { clearTimeout(workerTimer); workerTimer = null; worker?.terminate(); worker = null; workerReady = workerBusy = false; if (stream) message(''); }
    renderControls();
    if (stream) void recordWhenReady(epoch);
  });
  identityForm.addEventListener('submit', event => event.preventDefault());
  window.addEventListener('mission-profile-change', () => {
    const nextScope = window.missionProfileName?.identity?.storageScope;
    if (!nextScope || identity?.storageScope === nextScope || (!identity && !identityPromise)) return;
    stopCamera(); identity = undefined; identityEpoch++;
    window.missionAppearance?.setIdentity(null);
    if (phase !== 'finishing') phase = 'idle';
    identityPromise = loadIdentity(); renderControls();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopCamera(); cancelAnimationFrame(frame); frame = 0;
      if (phase !== 'finishing') phase = 'idle'; renderControls(); message('');
    } else if (visible() && !frame) frame = requestAnimationFrame(animate);
  });
  window.addEventListener('pagehide', stopCamera);
  const query=new URLSearchParams(location.search);
  if(['lab','orbit','helmet','room'].includes(query.get('background')))backgroundChoice.value=query.get('background');
  if (query.get('log') === '1') document.addEventListener('DOMContentLoaded',open,{once:true});
})();
