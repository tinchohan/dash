import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/healthz', (_req, res) => {
  console.log('Healthcheck called');
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/ping', (_req, res) => {
  console.log('Ping called');
  res.json({ pong: true, time: Date.now() });
});

// Serve static files
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  console.log('Root called - serving index.html');
  res.sendFile(path.join(publicDir, 'index.html'));
});

// API endpoints for testing
app.get('/api/test', (_req, res) => {
  res.json({ message: 'Dash API is running', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Simple server listening on 0.0.0.0:${PORT}`);
  console.log('Healthcheck: /healthz');
  console.log('Ping: /ping');
  console.log('Static files from:', publicDir);
  try {
    console.log('Files available:', fs.readdirSync(publicDir));
  } catch (e) {
    console.log('Error reading public dir:', e.message);
  }
});

// Keep process alive
setInterval(() => {
  console.log('Heartbeat:', new Date().toISOString());
}, 30000);
