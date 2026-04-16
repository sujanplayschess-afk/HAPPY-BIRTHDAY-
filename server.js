const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let appState = {
  slides: [],
  songs: [],
  endCard: {},
  page: {}
};

// Load saved gift on startup
try {
  if (fs.existsSync('./data.json')) {
    appState = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
    console.log('✓ Loaded saved gift');
  }
} catch (e) {
  console.log('Starting with empty gift');
}

app.get('/api/load', (req, res) => {
  res.json(appState);
});

app.post('/api/save', (req, res) => {
  appState = req.body;
  fs.writeFileSync('./data.json', JSON.stringify(appState, null, 2));
  res.json({ ok: true, message: 'Gift saved!' });
  console.log('💾 Gift saved by admin');
});

app.get('/health', (req, res) => {
  res.json({ ok: true, slides: appState.slides.length, songs: appState.songs.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  🎁 FOR HER — GIFT SERVER         ║
╠════════════════════════════════════╣
║  Server running on port ${PORT}         ║
║  Admin: http://localhost:${PORT}/admin ║
║  Viewer: http://localhost:${PORT}      ║
╚════════════════════════════════════╝
  `);
});
