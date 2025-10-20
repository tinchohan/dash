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

console.log('Environment check:', {
  PORT,
  SQLITE_PATH: process.env.SQLITE_PATH,
  NODE_ENV: process.env.NODE_ENV,
  hasAccounts: process.env.LINISCO_EMAIL_1 ? 'yes' : 'no'
});
// Healthcheck endpoint
app.get('/healthz', (_req, res) => res.json({ ok: true }));

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

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
  console.log('Healthcheck available at /healthz');
  console.log('Static files served from:', path.join(__dirname, 'public'));
});


