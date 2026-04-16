// admin-client.js

const WS_URL = `ws://${window.location.host}`;
let ws = null;
let deviceId = null;
let data = {
  slides: [],
  songs: [],
  endCard: {},
  page: {}
};

let devices = [];

// ─────────────────────────────────────────────
// WEBSOCKET CONNECTION
// ─────────────────────────────────────────────
function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('✓ Connected to server');
    updateSyncStatus(true);

    // Identify as admin
    ws.send(JSON.stringify({
      type: 'IDENTIFY_ADMIN',
      label: 'Admin Panel'
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('Message parse error:', e);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateSyncStatus(false);
  };

  ws.onclose = () => {
    console.log('✗ Disconnected from server');
    updateSyncStatus(false);
    // Reconnect after 3 seconds
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
      data = msg.state;
      devices = msg.devices;
      render();
      console.log('✓ Initialized with state');
      break;

    case 'SLIDE_UPDATED':
      if (msg.deviceId !== deviceId) {
        data.slides[msg.slideId] = msg.data;
        renderSlides();
        toast(`Slide ${msg.slideId + 1} updated`);
      }
      break;

    case 'SLIDES_CHANGED':
      if (msg.deviceId !== deviceId) {
        data.slides = msg.slides;
        renderSlides();
      }
      break;

    case 'SONG_UPDATED':
      if (msg.deviceId !== deviceId) {
        data.songs[msg.songId] = msg.data;
        renderSongs();
        toast(`Song updated`);
      }
      break;

    case 'SONGS_CHANGED':
      if (msg.deviceId !== deviceId) {
        data.songs = msg.songs;
        renderSongs();
      }
      break;

    case 'ENDCARD_UPDATED':
      if (msg.deviceId !== deviceId) {
        data.endCard = msg.data;
        renderEndCard();
        toast('End card updated');
      }
      break;

    case 'PAGE_UPDATED':
      if (msg.deviceId !== deviceId) {
        data.page = msg.data;
        renderPageEdit();
        toast('Page updated');
      }
      break;

    case 'DEVICE_LIST':
      devices = msg.devices;
      renderDevices();
      updateViewerCount();
      break;

    case 'PLAYBACK_START':
      console.log('📺 Playback started on', msg.deviceId.substring(0, 8));
      break;

    case 'PLAYBACK_PAUSE':
      console.log('⏸ Playback paused');
      break;

    case 'FULL_SYNC':
      data = msg.state;
      devices = msg.devices;
      render();
      toast('Full sync from server');
      break;

    default:
      // Ignore other playback messages
      break;
  }
}

// ─────────────────────────────────────────────
// SEND UPDATES TO SERVER
// ─────────────────────────────────────────────
function updateSlideOnServer(slideId, newData) {
  ws.send(JSON.stringify({
    type: 'SLIDE_UPDATE',
    slideId,
    data: newData
  }));
  toast(`Slide ${slideId + 1} updated on all devices`);
}

function addSlideOnServer(slideData) {
  ws.send(JSON.stringify({
    type: 'SLIDE_ADD',
    data: slideData
  }));
  toast('Slide added on all devices');
}

function deleteSlideOnServer(slideId) {
  ws.send(JSON.stringify({
    type: 'SLIDE_DELETE',
    slideId
  }));
  toast('Slide deleted on all devices');
}

function reorderSlidesOnServer(slides) {
  ws.send(JSON.stringify({
    type: 'SLIDES_REORDER',
    slides
  }));
}

function updateSongOnServer(songId, newData) {
  ws.send(JSON.stringify({
    type: 'SONG_UPDATE',
    songId,
    data: newData
  }));
  toast(`Song updated on all devices`);
}

function addSongOnServer(songData) {
  ws.send(JSON.stringify({
    type: 'SONG_ADD',
    data: songData
  }));
  toast('Song added on all devices');
}

function deleteSongOnServer(songId) {
  ws.send(JSON.stringify({
    type: 'SONG_DELETE',
    songId
  }));
  toast('Song deleted on all devices');
}

function updateEndCardOnServer(newData) {
  data.endCard = newData;
  ws.send(JSON.stringify({
    type: 'ENDCARD_UPDATE',
    data: newData
  }));
  toast('End card updated on all devices');
}

function updatePageOnServer(newData) {
  data.page = newData;
  ws.send(JSON.stringify({
    type: 'PAGE_UPDATE',
    data: newData
  }));
  toast('Page updated on all devices');
}

// ─────────────────────────────────────────────
// RENDERING FUNCTIONS
// ─────────────────────────────────────────────
function render() {
  renderSlides();
  renderSongs();
  renderEndCard();
  renderPageEdit();
  renderDevices();
  updateViewerCount();
}

function renderSlides() {
  const list = document.getElementById('slides-list');
  list.innerHTML = '';
  data.slides.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'slide-card';
    const firstLine = s.lines?.[0]?.text || 'New slide';

    card.innerHTML = `
      <div class="slide-card-header" onclick="this.parentElement.classList.toggle('open')">
        <span style="font-size: 13px; color: var(--gold);">#${i + 1}</span>
        <div class="slide-card-title">${escHtml(firstLine.substring(0, 40))}</div>
        <button class="btn btn-danger" onclick="deleteSlideOnServer(${i}); event.stopPropagation();">Delete</button>
      </div>
      <div class="slide-card-body">
        <div class="form-grid">
          <div class="form-group full">
            <label>Image URL</label>
            <input type="url" value="${escAttr(s.img || '')}" 
              onchange="updateSlide(${i}, 'img', this.value)"/>
          </div>
          <div class="form-group full">
            <label>Song Index</label>
            <select onchange="updateSlide(${i}, 'song', +this.value)">
              ${data.songs.map((sg, si) => `<option value="${si}" ${s.song === si ? 'selected' : ''}>${si}. ${escHtml(sg.title || 'Song')}</option>`).join('')}
            </select>
          </div>
          <div class="form-group full">
            <label>Duration (ms)</label>
            <input type="number" value="${s.dur || 9000}" 
              onchange="updateSlide(${i}, 'dur', +this.value)"/>
          </div>
          <div class="form-group full">
            <label>Lines (JSON)</label>
            <textarea rows="6" onchange="updateSlide(${i}, 'lines', JSON.parse(this.value))">${JSON.stringify(s.lines || [], null, 2)}</textarea>
          </div>
        </div>
      </div>`;
    list.appendChild(card);
  });
}

function renderSongs() {
  const list = document.getElementById('songs-list');
  list.innerHTML = '';
  data.songs.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'slide-card';
    div.innerHTML = `
      <div class="slide-card-header" onclick="this.parentElement.classList.toggle('open')">
        <span style="font-size: 13px; color: var(--gold);">🎵 ${i}</span>
        <div class="slide-card-title">${escHtml(s.title || 'Song')}</div>
        <button class="btn btn-danger" onclick="deleteSongOnServer(${i}); event.stopPropagation();">Delete</button>
      </div>
      <div class="slide-card-body">
        <div class="form-grid">
          <div class="form-group full">
            <label>Title</label>
            <input type="text" value="${escAttr(s.title || '')}" 
              onchange="updateSong(${i}, 'title', this.value)"/>
          </div>
          <div class="form-group">
            <label>Volume (0-1)</label>
            <input type="number" step="0.1" min="0" max="1" value="${s.volume || 0.85}" 
              onchange="updateSong(${i}, 'volume', +this.value)"/>
          </div>
          <div class="form-group">
            <label>Fade In (ms)</label>
            <input type="number" value="${s.fadeIn || 800}" 
              onchange="updateSong(${i}, 'fadeIn', +this.value)"/>
          </div>
          <div class="form-group">
            <label>Fade Out (ms)</label>
            <input type="number" value="${s.fadeOut || 1200}" 
              onchange="updateSong(${i}, 'fadeOut', +this.value)"/>
          </div>
          <div class="form-group full">
            <label>Audio File (MP3/WAV/OGG)</label>
            <div class="audio-upload-row">
              <input type="text" id="audio-name-${i}" readonly value="${escAttr(s.fileName || 'No file')}" style="flex: 1;"/>
              <label class="audio-upload-label" for="audio-file-${i}">
                ♪ Upload
              </label>
              <input class="file-input" type="file" id="audio-file-${i}" accept="audio/*"
                onchange="handleAudioUpload(${i}, this)"/>
            </div>
            ${s.audioData ? `<div class="audio-player">
              <audio controls preload="metadata" src="${escAttr(s.audioData)}"></audio>
              <button class="btn btn-danger" style="padding: 5px 10px; font-size: 9px;" onclick="updateSong(${i}, 'audioData', null); updateSong(${i}, 'audioUrl', null); renderSongs();">Clear</button>
            </div>` : ''}
          </div>
        </div>
      </div>`;
    list.appendChild(div);
  });
}

function renderEndCard() {
  document.getElementById('ec-pre').value = data.endCard?.pre || '';
  document.getElementById('ec-title').value = data.endCard?.title || '';
  document.getElementById('ec-msg').value = data.endCard?.msg || '';
}

function renderPageEdit() {
  document.getElementById('pg-name').value = data.page?.name || '';
  document.getElementById('pg-btn').value = data.page?.btn || '';
  document.getElementById('pg-title').value = data.page?.title || '';
}

function renderDevices() {
  const list = document.getElementById('deviceList');
  if (devices.length === 0) {
    list.innerHTML = '<p style="color: var(--dim); font-size: 12px;">No devices connected</p>';
    return;
  }

  list.innerHTML = devices.map(d => `
    <div class="device-item">
      <div class="status">
        <div style="font-size: 11px; font-weight: 500; color: var(--white);">
          ${d.label || d.type} <small style="color: var(--dim);">${d.id.substring(0, 8)}</small>
        </div>
        <div style="font-size: 9px; color: var(--dim2);">
          Slide ${d.currentSlide + 1} ${d.isPlaying ? '▶' : '⏸'}
        </div>
      </div>
      <div class="status-dot ${d.type === 'admin' ? '' : d.isPlaying ? '' : 'offline'}"></div>
    </div>
  `).join('');
}

function updateViewerCount() {
  const viewers = devices.filter(d => d.type === 'viewer').length;
  document.getElementById('stat-viewers').textContent = viewers;
}

// ─────────────────────────────────────────────
// EVENT HANDLERS
// ─────────────────────────────────────────────
function updateSlide(i, key, val) {
  if (!data.slides[i]) return;
  data.slides[i][key] = val;
  updateSlideOnServer(i, data.slides[i]);
}

function updateSong(i, key, val) {
  if (!data.songs[i]) return;
  data.songs[i][key] = val;
  updateSongOnServer(i, data.songs[i]);
}

function updateEndCard(key, val) {
  if (!data.endCard) data.endCard = {};
  data.endCard[key] = val;
  updateEndCardOnServer(data.endCard);
}

function updatePage(key, val) {
  if (!data.page) data.page = {};
  data.page[key] = val;
  updatePageOnServer(data.page);
}

function addSlide() {
  const newSlide = {
    img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1600&q=85',
    tint: 'rgba(0,0,0,0.26)',
    kenBurns: 'zoom-in',
    pos: 'pos-bc',
    song: 0,
    dur: 9000,
    lines: [{ text: 'New slide', delay: 1 }]
  };
  data.slides.push(newSlide);
  addSlideOnServer(newSlide);
  renderSlides();
}

function addSong() {
  const newSong = {
    title: 'New Song',
    volume: 0.85,
    fadeIn: 800,
    fadeOut: 1200
  };
  data.songs.push(newSong);
  addSongOnServer(newSong);
  renderSongs();
}

function handleAudioUpload(songIdx, input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    data.songs[songIdx].audioData = dataUrl;
    data.songs[songIdx].audioUrl = dataUrl;
    data.songs[songIdx].fileName = file.name;
    updateSongOnServer(songIdx, data.songs[songIdx]);
    renderSongs();
    toast(`${file.name} uploaded`);
  };
  reader.readAsDataURL(file);
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');
}

function updateSyncStatus(online) {
  const badge = document.getElementById('syncStatus');
  if (online) {
    badge.classList.remove('offline');
    badge.innerHTML = '<span class="status-dot"></span> Synced';
  } else {
    badge.classList.add('offline');
    badge.innerHTML = '<span class="status-dot offline"></span> Offline';
  }
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

function downloadJSON() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'content.json';
  a.click();
  toast('Downloaded');
}

function copyJSON() {
  navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  toast('Copied to clipboard');
}

function goExport() {
  switchTab('export', document.querySelectorAll('.tab')[5]);
}

function previewSite() {
  window.open('/', '_blank');
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
connectWebSocket();
