// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuid } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// GLOBAL STATE (Your creations)
// ─────────────────────────────────────────────
let appState = {
  slides: [],
  songs: [],
  endCard: {},
  page: {}
};

function loadState() {
  try {
    if (fs.existsSync('./appstate.json')) {
      appState = JSON.parse(fs.readFileSync('./appstate.json', 'utf8'));
      console.log('✓ Loaded content.json');
    }
  } catch (e) {
    console.log('Starting fresh');
  }
}

function saveState() {
  fs.writeFileSync('./appstate.json', JSON.stringify(appState, null, 2));
  
  // 🔴 BROADCAST TO ALL VIEWERS: "Content updated!"
  broadcast({
    type: 'CONTENT_UPDATED',
    state: appState,
    timestamp: Date.now()
  });
}

loadState();

// ─────────────────────────────────────────────
// CONNECTED VIEWERS
// ─────────────────────────────────────────────
const viewers = new Map();

wss.on('connection', (ws) => {
  const viewerId = uuid();
  viewers.set(viewerId, {
    id: viewerId,
    connectedAt: Date.now(),
    ws
  });

  console.log(`👁️  Viewer connected: ${viewerId.substring(0, 8)}`);
  console.log(`📊 Total viewers: ${viewers.size}`);

  // 🔴 SEND EVERYTHING IMMEDIATELY
  ws.send(JSON.stringify({
    type: 'INIT',
    state: appState,
    viewerId,
    timestamp: Date.now()
  }));

  // Handle disconnect
  ws.on('close', () => {
    viewers.delete(viewerId);
    console.log(`✗ Viewer left: ${viewerId.substring(0, 8)}`);
    console.log(`📊 Total viewers: ${viewers.size}`);
  });

  ws.on('error', (err) => console.error('Viewer error:', err));
});

// ─────────────────────────────────────────────
// BROADCAST TO ALL VIEWERS
// ─────────────────────────────────────────────
function broadcast(message) {
  const data = JSON.stringify(message);
  let count = 0;
  
  viewers.forEach((viewer) => {
    if (viewer.ws.readyState === WebSocket.OPEN) {
      viewer.ws.send(data);
      count++;
    }
  });

  return count;
}

// ─────────────────────────────────────────────
// ADMIN API (You editing)
// ─────────────────────────────────────────────

// Get current state
app.get('/api/state', (req, res) => {
  res.json(appState);
});

// Update entire state (you save everything)
app.post('/api/state', (req, res) => {
  appState = req.body;
  saveState();
  
  const count = broadcast({
    type: 'CONTENT_UPDATED',
    state: appState,
    timestamp: Date.now()
  });

  res.json({ 
    ok: true, 
    message: `Updated ${count} viewers` 
  });
});

// Get viewer count
app.get('/api/viewers', (req, res) => {
  res.json({ 
    count: viewers.size,
    viewers: Array.from(viewers.values()).map(v => ({
      id: v.id.substring(0, 8),
      connectedAt: v.connectedAt
    }))
  });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  🎁 FOR HER — GIFT DELIVERY       ║
╠════════════════════════════════════╣
║  Server: http://localhost:${PORT}      ║
║  Admin:  http://localhost:${PORT}/admin║
║  View:   http://localhost:${PORT}      ║
║  Status: http://localhost:${PORT}/api/viewers
╚════════════════════════════════════╝
  `);
});

process.on('SIGINT', () => {
  console.log('\n✓ Saved.');
  process.exit(0);
});
