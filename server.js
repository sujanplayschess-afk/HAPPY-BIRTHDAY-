// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const uuid = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// STATE (In-Memory + Persistent)
// ─────────────────────────────────────────────
let appState = {
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
  },
  devices: {}
};

// Load initial state (would load from DB in production)
function loadState() {
  try {
    const fs = require('fs');
    if (fs.existsSync('./appstate.json')) {
      appState = JSON.parse(fs.readFileSync('./appstate.json', 'utf8'));
    }
  } catch (e) {
    console.log('Using default state');
  }
}

function saveState() {
  const fs = require('fs');
  fs.writeFileSync('./appstate.json', JSON.stringify(appState, null, 2));
}

loadState();

// ─────────────────────────────────────────────
// WEBSOCKET CONNECTIONS
// ─────────────────────────────────────────────
const clients = new Map();

wss.on('connection', (ws) => {
  const deviceId = uuid.v4();
  const deviceInfo = {
    id: deviceId,
    type: 'viewer', // 'admin' or 'viewer'
    connectedAt: Date.now(),
    currentSlide: -1,
    isPlaying: false
  };

  clients.set(deviceId, { ws, deviceInfo });

  console.log(`✓ Device connected: ${deviceId}`);

  // Send initial state to new device
  ws.send(JSON.stringify({
    type: 'INIT',
    deviceId,
    state: appState,
    devices: Array.from(clients.values()).map(c => c.deviceInfo)
  }));

  // Broadcast device list to all
  broadcast({
    type: 'DEVICE_LIST',
    devices: Array.from(clients.values()).map(c => c.deviceInfo)
  });

  // ─────────────────────────────────────────────
  // MESSAGE HANDLER
  // ─────────────────────────────────────────────
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      console.log(`📨 ${msg.type} from ${deviceId.substring(0, 8)}`);

      switch (msg.type) {
        // Admin identifies itself
        case 'IDENTIFY_ADMIN':
          if (clients.has(deviceId)) {
            const client = clients.get(deviceId);
            client.deviceInfo.type = 'admin';
            client.deviceInfo.label = msg.label || 'Admin';
          }
          broadcast({
            type: 'DEVICE_LIST',
            devices: Array.from(clients.values()).map(c => c.deviceInfo)
          });
          break;

        // Slide update (admin)
        case 'SLIDE_UPDATE':
          appState.slides[msg.slideId] = msg.data;
          saveState();
          broadcast({
            type: 'SLIDE_UPDATED',
            slideId: msg.slideId,
            data: msg.data,
            deviceId
          }, deviceId);
          break;

        // Add slide
        case 'SLIDE_ADD':
          appState.slides.push(msg.data);
          saveState();
          broadcast({
            type: 'SLIDES_CHANGED',
            slides: appState.slides,
            deviceId
          }, deviceId);
          break;

        // Delete slide
        case 'SLIDE_DELETE':
          appState.slides.splice(msg.slideId, 1);
          saveState();
          broadcast({
            type: 'SLIDES_CHANGED',
            slides: appState.slides,
            deviceId
          }, deviceId);
          break;

        // Reorder slides
        case 'SLIDES_REORDER':
          appState.slides = msg.slides;
          saveState();
          broadcast({
            type: 'SLIDES_CHANGED',
            slides: appState.slides,
            deviceId
          }, deviceId);
          break;

        // Song update
        case 'SONG_UPDATE':
          if (!appState.songs[msg.songId]) appState.songs[msg.songId] = {};
          Object.assign(appState.songs[msg.songId], msg.data);
          saveState();
          broadcast({
            type: 'SONG_UPDATED',
            songId: msg.songId,
            data: appState.songs[msg.songId],
            deviceId
          }, deviceId);
          break;

        // Add song
        case 'SONG_ADD':
          appState.songs.push(msg.data);
          saveState();
          broadcast({
            type: 'SONGS_CHANGED',
            songs: appState.songs,
            deviceId
          }, deviceId);
          break;

        // Delete song
        case 'SONG_DELETE':
          appState.songs.splice(msg.songId, 1);
          saveState();
          broadcast({
            type: 'SONGS_CHANGED',
            songs: appState.songs,
            deviceId
          }, deviceId);
          break;

        // End card update
        case 'ENDCARD_UPDATE':
          appState.endCard = msg.data;
          saveState();
          broadcast({
            type: 'ENDCARD_UPDATED',
            data: appState.endCard,
            deviceId
          }, deviceId);
          break;

        // Page config update
        case 'PAGE_UPDATE':
          appState.page = msg.data;
          saveState();
          broadcast({
            type: 'PAGE_UPDATED',
            data: appState.page,
            deviceId
          }, deviceId);
          break;

        // Playback start
        case 'PLAYBACK_START':
          appState.playback.isPlaying = true;
          appState.playback.masterDeviceId = deviceId;
          appState.playback.masterTime = Date.now();
          appState.playback.currentSlide = msg.slide || 0;
          appState.playback.timestamp = msg.timestamp || 0;

          if (clients.has(deviceId)) {
            clients.get(deviceId).deviceInfo.isPlaying = true;
          }

          broadcast({
            type: 'PLAYBACK_START',
            masterDeviceId: deviceId,
            slide: appState.playback.currentSlide,
            timestamp: appState.playback.timestamp,
            masterTime: appState.playback.masterTime,
            deviceId
          });
          break;

        // Playback tick (master sends this every 100ms)
        case 'PLAYBACK_TICK':
          appState.playback.currentSlide = msg.slide;
          appState.playback.timestamp = msg.timestamp;
          appState.playback.masterTime = Date.now();

          if (clients.has(deviceId)) {
            clients.get(deviceId).deviceInfo.currentSlide = msg.slide;
          }

          broadcast({
            type: 'PLAYBACK_TICK',
            slide: msg.slide,
            timestamp: msg.timestamp,
            masterTime: appState.playback.masterTime,
            masterDeviceId: deviceId
          }, deviceId); // Don't send back to sender
          break;

        // Playback pause
        case 'PLAYBACK_PAUSE':
          appState.playback.isPlaying = false;
          if (clients.has(deviceId)) {
            clients.get(deviceId).deviceInfo.isPlaying = false;
          }
          broadcast({
            type: 'PLAYBACK_PAUSE',
            deviceId
          });
          break;

        // Jump to slide
        case 'PLAYBACK_JUMP':
          appState.playback.currentSlide = msg.slide;
          appState.playback.timestamp = 0;
          appState.playback.masterTime = Date.now();
          broadcast({
            type: 'PLAYBACK_JUMP',
            slide: msg.slide,
            masterTime: appState.playback.masterTime,
            deviceId
          });
          break;

        // Device status update
        case 'DEVICE_STATUS':
          if (clients.has(deviceId)) {
            const client = clients.get(deviceId);
            client.deviceInfo.currentSlide = msg.currentSlide;
            client.deviceInfo.isPlaying = msg.isPlaying;
            client.deviceInfo.label = msg.label;
          }
          break;

        // Request full sync
        case 'SYNC_REQUEST':
          ws.send(JSON.stringify({
            type: 'FULL_SYNC',
            state: appState,
            devices: Array.from(clients.values()).map(c => c.deviceInfo)
          }));
          break;

        // Admin requests state export
        case 'EXPORT_STATE':
          ws.send(JSON.stringify({
            type: 'STATE_EXPORT',
            state: appState
          }));
          break;

        // Admin imports state
        case 'IMPORT_STATE':
          appState = msg.state;
          saveState();
          broadcast({
            type: 'FULL_SYNC',
            state: appState,
            devices: Array.from(clients.values()).map(c => c.deviceInfo)
          });
          break;

        default:
          console.log('Unknown message type:', msg.type);
      }
    } catch (e) {
      console.error('Message error:', e.message);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    clients.delete(deviceId);
    console.log(`✗ Device disconnected: ${deviceId}`);

    // If master disconnected, pick new master
    if (appState.playback.masterDeviceId === deviceId && appState.playback.isPlaying) {
      const remaining = Array.from(clients.values()).filter(c => c.deviceInfo.type === 'viewer');
      if (remaining.length > 0) {
        const newMaster = remaining[0].deviceInfo.id;
        appState.playback.masterDeviceId = newMaster;
        broadcast({
          type: 'MASTER_CHANGED',
          masterDeviceId: newMaster
        });
      } else {
        appState.playback.isPlaying = false;
        broadcast({ type: 'PLAYBACK_PAUSE' });
      }
    }

    broadcast({
      type: 'DEVICE_LIST',
      devices: Array.from(clients.values()).map(c => c.deviceInfo)
    });
  });
});

// ─────────────────────────────────────────────
// BROADCAST TO ALL CLIENTS
// ─────────────────────────────────────────────
function broadcast(message, excludeId = null) {
  const data = JSON.stringify(message);
  clients.forEach((client, id) => {
    if (excludeId && id === excludeId) return;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

// ─────────────────────────────────────────────
// REST ENDPOINTS
// ─────────────────────────────────────────────
app.get('/api/state', (req, res) => {
  res.json(appState);
});

app.post('/api/state', (req, res) => {
  appState = req.body;
  saveState();
  broadcast({
    type: 'FULL_SYNC',
    state: appState
  });
  res.json({ ok: true });
});

app.get('/api/devices', (req, res) => {
  res.json(Array.from(clients.values()).map(c => c.deviceInfo));
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} on multiple devices`);
});
