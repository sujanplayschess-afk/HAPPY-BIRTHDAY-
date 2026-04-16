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

  ws.send(JSON.stringify({
    type: 'INIT',
    state: appState,
    viewerId,
    timestamp: Date.now()
  }));

  ws.on('close', () => {
    viewers.delete(viewerId);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  viewers.forEach((viewer) => {
    if (viewer.ws.readyState === WebSocket.OPEN) {
      viewer.ws.send(data);
    }
  });
}

app.get('/api/state', (req, res) => {
  res.json(appState);
});

app.post('/api/state', (req, res) => {
  appState = req.body;
  broadcast({
    type: 'CONTENT_UPDATED',
    state: appState,
    timestamp: Date.now()
  });
  res.json({ ok: true, viewers: viewers.size });
});

app.get('/api/viewers', (req, res) => {
  res.json({ count: viewers.size });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
