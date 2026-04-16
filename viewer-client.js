// viewer-client.js

const WS_URL = `ws://${window.location.host}`;
let ws = null;
let deviceId = null;
let isMaster = false;

let state = {
  slides: [],
  songs: [],
  endCard: {},
  page: {},
  playback: {
    currentSlide: -1,
    timestamp: 0,
    isPlaying: false,
    masterDeviceId: null,
    masterTime: Date.now()
  }
};

let audioElements = [];
let cur = -1;
let running = false;
let activeSng = -1;
let stTimer = null;
let syncTimer = null;
let lastMasterTime = 0;
let timeOffset = 0;

// ─────────────────────────────────────────────
// WEBSOCKET CONNECTION
// ─────────────────────────────────────────────
function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('✓ Connected to server');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('Message error:', e);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('✗ Disconnected');
    setTimeout(connectWebSocket, 3000);
  };
}

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────
function handleMessage(msg) {
  switch (msg.type) {
    case 'INIT':
      deviceId = msg.deviceId;
      state = msg.state;
      buildSlides();
      setupAudio();
      renderEndCard();
      applyPageData();
      document.getElementById('loader').classList.add('gone');
      console.log('✓ Initialized');
      break;

    case 'SLIDE_UPDATED':
      state.slides[msg.slideId] = msg.data;
      buildSlides();
      console.log(`📝 Slide ${msg.slideId} updated`);
      break;

    case 'SLIDES_CHANGED':
      state.slides = msg.slides;
      buildSlides();
      break;

    case 'SONG_UPDATED':
      state.songs[msg.songId] = msg.data;
      setupAudio();
      if (running && activeSng === msg.songId) {
        playAudio(msg.songId);
      }
      break;

    case 'SONGS_CHANGED':
      state.songs = msg.songs;
      setupAudio();
      break;

    case 'ENDCARD_UPDATED':
      state.endCard = msg.data;
      renderEndCard();
      break;

    case 'PAGE_UPDATED':
      state.page = msg.data;
      applyPageData();
      break;

    case 'PLAYBACK_START':
      if (msg.masterDeviceId !== deviceId) {
        isMaster = false;
        state.playback = {
          currentSlide: msg.slide || 0,
          timestamp: msg.timestamp || 0,
          isPlaying: true,
          masterDeviceId: msg.masterDeviceId,
          masterTime: msg.masterTime
        };
        lastMasterTime = msg.masterTime;
        syncToMaster();
        if (cur < 0) goSlide(state.playback.currentSlide);
      }
      break;

    case 'PLAYBACK_TICK':
      if (msg.masterDeviceId !== deviceId && running) {
        state.playback.timestamp = msg.timestamp;
        state.playback.masterTime = msg.masterTime;
        lastMasterTime = msg.masterTime;
        syncToMaster();
      }
      break;

    case 'PLAYBACK_PAUSE':
      if (msg.deviceId !== deviceId && running) {
        running = false;
        pauseAllAudio();
        clearTimeout(stTimer);
      }
      break;

    case 'PLAYBACK_JUMP':
      if (running && msg.deviceId !== deviceId) {
        goSlide(msg.slide);
      }
      break;

    case 'MASTER_CHANGED':
      if (msg.masterDeviceId === deviceId && running) {
        isMaster = true;
        startMasterSync();
      }
      break;

    case 'FULL_SYNC':
      state = msg.state;
      buildSlides();
      setupAudio();
      renderEndCard();
      if (running && msg.state.playback.isPlaying) {
        goSlide(msg.state.playback.currentSlide);
      }
      break;

    default:
      break;
  }
}

// ─────────────────────────────────────────────
// PLAYBACK CONTROL
// ─────────────────────────────────────────────
function start() {
  document.getElementById('intro').classList.add('gone');
  document.getElementById('pw').classList.add('on');
  document.getElementById('ctr').classList.add('on');
  document.getElementById('mbars').classList.add('on');

  running = true;
  isMaster = true;

  ws.send(JSON.stringify({
    type: 'PLAYBACK_START',
    slide: 0,
    timestamp: 0
  }));

  if (audioElements[0]?.src) {
    playAudio(0);
    activeSng = 0;
  }

  startMasterSync();
  goSlide(0);
}

function startMasterSync() {
  clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (running && isMaster) {
      const slideDur = state.slides[cur]?.dur || 9000;
      const elapsedInSlide = Date.now() - slideStartTime;
      const newTimestamp = Math.min(elapsedInSlide, slideDur);

      ws.send(JSON.stringify({
        type: 'PLAYBACK_TICK',
        slide: cur,
        timestamp: newTimestamp
      }));

      state.playback.timestamp = newTimestamp;
    }
  }, 100);
}

function syncToMaster() {
  const now = Date.now();
  const elapsedSinceMaster = now - lastMasterTime;
  const expectedTimestamp = state.playback.timestamp + elapsedSinceMaster;

  // If off by more than 500ms, snap back
  if (Math.abs(expectedTimestamp - state.playback.timestamp) > 500) {
    if (cur !== state.playback.currentSlide) {
      goSlide(state.playback.currentSlide);
    }
  }
}

let slideStartTime = 0;
function goSlide(idx) {
  if (idx >= state.slides.length) {
    showEnd();
    return;
  }

  const prev = cur;
  cur = idx;
  slideStartTime = Date.now();

  // Hide previous
  if (prev >= 0) {
    const pe = document.getElementById(`sl-${prev}`);
    if (pe) {
      pe.querySelectorAll('.ll').forEach(l => {
        l.classList.remove('in');
      });
      setTimeout(() => pe.classList.remove('active'), 2200);
    }
  }

  const el = document.getElementById(`sl-${idx}`);
  if (!el) return;

  // Reset Ken Burns
  const ob = el.querySelector('.sbg');
  if (ob) {
    const nb = document.createElement('div');
    nb.className = ob.className;
    nb.style.cssText = ob.style.cssText;
    ob.parentNode.replaceChild(nb, ob);
  }

  el.classList.add('active');

  // Animate text
  const lls = el.querySelectorAll('.ll');
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      lls.forEach(l => l.classList.add('in'))
    )
  );

  // Progress bar
  const dur = state.slides[idx].dur || 9000;
  document.getElementById('pb').style.transition = `width ${dur / 1000}s linear`;
  document.getElementById('pb').style.width = '100%';

  // Counter
  document.getElementById('ctr').textContent = `${String(idx + 1).padStart(2, '0')} / ${String(state.slides.length).padStart(2, '0')}`;

  // Switch audio
  const sng = state.slides[idx].song || 0;
  if (sng !== activeSng) {
    if (activeSng >= 0) stopAudio(activeSng);
    playAudio(sng);
    activeSng = sng;
  }

  // Schedule next
  clearTimeout(stTimer);
  if (isMaster) {
    stTimer = setTimeout(() => {
      if (running) goSlide(cur + 1);
    }, dur);
  }

  // Report status
  ws.send(JSON.stringify({
    type: 'DEVICE_STATUS',
    currentSlide: idx,
    isPlaying: running,
    label: 'Viewer'
  }));
}

function showEnd() {
  running = false;
  document.getElementById('pb').style.width = '100%';
  pauseAllAudio();
  setTimeout(() => document.getElementById('ec').classList.add('on'), 2000);
}

function replay() {
  document.getElementById('ec').classList.remove('on');
  cur = -1;
  activeSng = -1;
  document.querySelectorAll('.slide').forEach(s => {
    s.classList.remove('active');
    s.querySelectorAll('.ll').forEach(l => l.classList.remove('in'));
  });

  running = true;
  isMaster = true;

  ws.send(JSON.stringify({
    type: 'PLAYBACK_START',
    slide: 0,
    timestamp: 0
  }));

  if (audioElements[0]?.src) {
    playAudio(0);
    activeSng = 0;
  }

  startMasterSync();
  setTimeout(() => goSlide(0), 800);
}

// ─────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────
function setupAudio() {
  audioElements = [];
  state.songs.forEach((song, i) => {
    const audio = new Audio();
    const audioSrc = song.audioData || song.audioUrl || song.src;

    if (audioSrc?.startsWith('data:')) {
      audio.src = audioSrc;
    }

    audio.preload = 'auto';
    audio.volume = 0;

    audio.addEventListener('ended', () => {
      audio.currentTime = song.start || 0;
      if (running) audio.play().catch(() => {});
    });

    audioElements[i] = audio;
  });
}

function playAudio(idx) {
  if (!audioElements[idx]?.src) return;
  const audio = audioElements[idx];
  const song = state.songs[idx];

  audio.currentTime = song.start || 0;
  audio.play().catch(() => {});

  fadeAudio(audio, 0, song.volume || 0.85, song.fadeIn || 800);
}

function stopAudio(idx) {
  if (!audioElements[idx]) return;
  const audio = audioElements[idx];
  const song = state.songs[idx];

  fadeAudio(audio, null, 0, song.fadeOut || 1200, () => {
    audio.pause();
  });
}

function pauseAllAudio() {
  audioElements.forEach(a => {
    if (a.src) {
      fadeAudio(a, null, 0, 500, () => a.pause());
    }
  });
}

function fadeAudio(audio, fromVol, toVol, duration, callback) {
  let vol = fromVol != null ? fromVol : audio.volume;
  const steps = 30;
  const stepTime = duration / steps;
  const delta = (toVol - vol) / steps;

  let step = 0;
  const iv = setInterval(() => {
    vol += delta;
    audio.volume = Math.max(0, Math.min(1, vol));
    step++;

    if (step >= steps) {
      clearInterval(iv);
      audio.volume = toVol;
      if (callback) callback();
    }
  }, stepTime);
}

// ─────────────────────────────────────────────
// BUILDING UI
// ─────────────────────────────────────────────
function buildSlides() {
  const stage = document.getElementById('stage');
  stage.innerHTML = '';

  state.slides.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'slide';
    d.id = `sl-${i}`;

    const linesHTML = (s.lines || []).map(l => {
      const cls = ['ll', l.cls || `d${l.delay || 1}`].filter(Boolean).join(' ');
      return `<span class="${cls}">${escHtml(l.text)}</span>`;
    }).join('');

    d.innerHTML = `
      <div class="sbg ${s.kb || 'kb-zi'}" style="background-image: url('${escAttr(s.img)}')"></div>
      <div class="stint" style="background: ${escAttr(s.tint || 'rgba(0,0,0,0.26)')}"></div>
      <div class="sbar-b"></div>
      <div class="lw">${linesHTML}</div>`;

    stage.appendChild(d);
  });
}

function renderEndCard() {
  document.getElementById('ec-name').textContent = state.endCard?.title || 'Happy Birthday';
  document.getElementById('ec-msg').textContent = (state.endCard?.msg || 'Every song...').replace(/\\n/g, '\n');
}

function applyPageData() {
  document.getElementById('intro-name').textContent = state.page?.name || 'Her';
  document.title = `For ${state.page?.name || 'Her'}`;
}

// ─────────────────────────────────────────────
// HELPERS & INIT
// ─────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

document.addEventListener('keydown', (e) => {
  if (!running) return;
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    clearTimeout(stTimer);
    if (isMaster) goSlide(cur + 1);
    else {
      ws.send(JSON.stringify({
        type: 'PLAYBACK_JUMP',
        slide: cur + 1
      }));
    }
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    clearTimeout(stTimer);
    if (isMaster) goSlide(Math.max(0, cur - 1));
    else {
      ws.send(JSON.stringify({
        type: 'PLAYBACK_JUMP',
        slide: Math.max(0, cur - 1)
      }));
    }
  }
});

document.getElementById('playBtn').addEventListener('click', start);
document.getElementById('replayBtn').addEventListener('click', replay);

connectWebSocket();
