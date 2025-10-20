import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Environment check:', {
  PORT,
  NODE_ENV: process.env.NODE_ENV,
  hasAccounts: process.env.LINISCO_EMAIL_1 ? 'yes' : 'no'
});

// Healthcheck endpoint
app.get('/healthz', (_req, res) => {
  console.log('Healthcheck called');
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/ping', (_req, res) => {
  console.log('Ping called');
  res.json({ pong: true, time: Date.now() });
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'dev-secret'],
    httpOnly: true,
    sameSite: 'lax'
  })
);

// Auth routes (without database)
app.post('/auth/login', (req, res) => {
  const { user, pass } = req.body || {};
  console.log('Login attempt:', { user, pass });
  if (user === 'H4' && pass === 'SRL') {
    req.session.isAuth = true;
    console.log('Login successful');
    return res.json({ ok: true });
  }
  console.log('Login failed');
  return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
});

app.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// Mock API routes (without database)
app.post('/sync', (req, res) => {
  console.log('Sync called');
  res.json({ 
    ok: true, 
    message: 'Sync endpoint working (no database yet)',
    fromDate: req.body?.fromDate,
    toDate: req.body?.toDate
  });
});

app.get('/stats/overview', (req, res) => {
  console.log('Stats overview called');
  res.json({
    totalOrders: 0,
    totalAmount: 0,
    paymentMethods: [],
    paymentGroups: []
  });
});

app.get('/stats/by-store', (req, res) => {
  console.log('Stats by-store called');
  res.json({ stores: [] });
});

app.get('/stats/daily', (req, res) => {
  console.log('Stats daily called');
  res.json({ days: [] });
});

app.get('/stats/top-products', (req, res) => {
  console.log('Stats top-products called');
  res.json({ products: [] });
});

app.get('/stats/stores', (req, res) => {
  console.log('Stats stores called');
  res.json({ stores: ['63953', '66220', '72267', '30036', '30038', '10019', '10020'] });
});

// Serve static files
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('/', (req, res) => {
  console.log('Root called - serving index.html');
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hybrid server listening on 0.0.0.0:${PORT}`);
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
