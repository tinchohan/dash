import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './lib/db.js';
import { authRouter } from './routes/auth.js';
import { syncRouter } from './routes/sync.js';
import { statsRouter } from './routes/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
// Healthcheck endpoint
app.get('/healthz', (_req, res) => {
  console.log('Healthcheck called');
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Additional diagnostic endpoint
app.get('/ping', (_req, res) => {
  console.log('Ping called');
  res.json({ pong: true, time: Date.now() });
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
// Disable caching on API endpoints to avoid 304 issues during dev
app.use((req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/sync') || req.path.startsWith('/stats')) {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'dev-secret'],
    httpOnly: true,
    sameSite: 'lax'
  })
);

initDatabase();

app.use('/auth', authRouter);
app.use('/sync', syncRouter);
app.use('/stats', statsRouter);

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  console.log('Healthcheck available at /healthz');
  console.log('Ping available at /ping');
  console.log('Static files served from:', path.join(__dirname, 'public'));
});


