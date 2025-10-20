import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fetch from 'node-fetch';
import dayjs from 'dayjs';

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

// Real sync functionality
const BASE_URL = process.env.LINISCO_BASE || 'http://pos.linisco.com.ar';
const LOGIN_URL = process.env.LINISCO_LOGIN || 'https://pos.linisco.com.ar/users/sign_in';

function getAccountsFromEnv() {
  const accounts = [];
  for (let i = 1; i <= 7; i++) {
    const email = process.env[`LINISCO_EMAIL_${i}`];
    const password = process.env[`LINISCO_PASSWORD_${i}`];
    if (email && password) accounts.push({ email, password });
  }
  return accounts;
}

async function login(email, password) {
  const resp = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'vscode-restclient'
    },
    body: JSON.stringify({ user: { email, password } })
  });
  if (!resp.ok) throw new Error(`Login failed for ${email}`);
  const json = await resp.json();
  const token = json?.user?.authentication_token || json?.authentication_token || json?.token;
  if (!token) throw new Error('No token in login response');
  return token;
}

async function fetchEndpoint(pathname, email, token, fromDate, toDate) {
  const qs = new URLSearchParams({ fromDate, toDate }).toString();
  const url = `${BASE_URL}${pathname}?${qs}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'vscode-restclient',
      'x-user-email': email,
      'x-user-token': token
    }
  });
  if (!resp.ok) throw new Error(`Fetch failed ${pathname}`);
  return resp.json();
}

function parseDateStr(str) {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  const d = dayjs(str);
  return d.isValid() ? d.format('DD/MM/YYYY') : dayjs().format('DD/MM/YYYY');
}

app.post('/sync', async (req, res) => {
  try {
    console.log('Sync called with:', req.body);
    const { fromDate, toDate } = req.body || {};
    const from = parseDateStr(fromDate || dayjs().format('YYYY-MM-DD'));
    const to = parseDateStr(toDate || dayjs().format('YYYY-MM-DD'));
    const accounts = getAccountsFromEnv();
    
    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No hay cuentas configuradas' });
    }

    console.log(`Syncing ${accounts.length} accounts from ${from} to ${to}`);
    
    const results = [];
    for (const { email, password } of accounts) {
      const accResult = { email, ok: true };
      try {
        console.log(`Logging in ${email}...`);
        const token = await login(email, password);
        
        console.log(`Fetching data for ${email}...`);
        const [orders, products, sessions] = await Promise.all([
          fetchEndpoint('/sale_orders', email, token, from, to),
          fetchEndpoint('/sale_products', email, token, from, to),
          fetchEndpoint('/psessions', email, token, from, to)
        ]);
        
        accResult.counts = {
          sale_orders: Array.isArray(orders) ? orders.length : 0,
          sale_products: Array.isArray(products) ? products.length : 0,
          psessions: Array.isArray(sessions) ? sessions.length : 0,
        };
        
        console.log(`Success for ${email}:`, accResult.counts);
      } catch (e) {
        console.error(`Error for ${email}:`, e.message);
        accResult.ok = false;
        accResult.error = e.message;
      }
      results.push(accResult);
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      return res.status(207).json({ 
        ok: false, 
        partial: true, 
        results, 
        fromDate: from, 
        toDate: to 
      });
    }
    
    res.json({ 
      ok: true, 
      results, 
      fromDate: from, 
      toDate: to 
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
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
