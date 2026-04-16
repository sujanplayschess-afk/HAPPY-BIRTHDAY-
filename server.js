const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let appState = {
  slides: [],
  songs: [],
  endCard: {},
  page: {}
};

const viewers = new Map();

wss.on('connection', (ws) => {
  const viewerId = uuid();
  viewers.set(viewerId, { id: viewerId, ws });

  console.log(`Viewer connected: ${viewerId.substring(0, 8)} (Total: ${viewers.size})`);

  ws.send(JSON.stringify({
    type: 'INIT',
    state: appState,
    viewerId,
    timestamp: Date.now()
  }));

  ws.on('close', () => {
    viewers.delete(viewerId);
    console.log(`Viewer disconnected (Total: ${viewers.size})`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  let count = 0;
  viewers.forEach((viewer) => {
    if (viewer.ws.readyState === WebSocket.OPEN) {
      try {
        viewer.ws.send(data);
        count++;
      } catch (e) {
        console.error('Broadcast error:', e);
      }
    }
  });
  return count;
}

app.get('/api/state', (req, res) => {
  res.json(appState);
});

app.post('/api/state', (req, res) => {
  appState = req.body;
  const count = broadcast({
    type: 'CONTENT_UPDATED',
    state: appState,
    timestamp: Date.now()
  });
  res.json({ ok: true, viewers: count });
  console.log(`State updated, broadcast to ${count} viewers`);
});

app.get('/api/viewers', (req, res) => {
  res.json({ count: viewers.size });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, viewers: viewers.size });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  🎁 FOR HER — GIFT SERVER         ║
╠════════════════════════════════════╣
║  Server running on port ${PORT}         ║
║  Admin: /admin.html                ║
║  Viewer: /                         ║
╚════════════════════════════════════╝
  `);
});
