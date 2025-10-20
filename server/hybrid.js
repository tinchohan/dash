import express from 'express';
import cors from 'cors';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import fetch from 'node-fetch';
import dayjs from 'dayjs';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Environment check:', {
  PORT,
  NODE_ENV: process.env.NODE_ENV,
  hasAccounts: process.env.LINISCO_EMAIL_1 ? 'yes' : 'no'
});

// Database setup
let db;
function initDatabase() {
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'data.db');
  console.log('Initializing database at:', dbPath);
  
  try {
    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      console.log('Creating directory:', dbDir);
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    migrate(db);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

function migrate(dbInstance) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS sale_orders (
      id INTEGER PRIMARY KEY,
      store_id INTEGER,
      account_email TEXT,
      created_at TEXT,
      total_amount REAL,
      payment_method TEXT,
      raw JSON
    );
    CREATE TABLE IF NOT EXISTS sale_products (
      id INTEGER PRIMARY KEY,
      order_id INTEGER,
      store_id INTEGER,
      account_email TEXT,
      created_at TEXT,
      product_name TEXT,
      quantity REAL,
      total_amount REAL,
      raw JSON
    );
    CREATE TABLE IF NOT EXISTS psessions (
      id INTEGER PRIMARY KEY,
      store_id INTEGER,
      account_email TEXT,
      created_at TEXT,
      raw JSON
    );
    CREATE INDEX IF NOT EXISTS idx_orders_date ON sale_orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_products_date ON sale_products(created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON psessions(created_at);
  `);
}

// Initialize database
initDatabase();

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

// Database insert functions
function insertOrders(db, rows, email) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO sale_orders (id, store_id, account_email, created_at, total_amount, payment_method, raw)
    VALUES (@id, @store_id, @account_email, @created_at, @total_amount, @payment_method, @raw)
  `);
  const tx = db.transaction((items) => {
    for (const r of items) {
      insert.run({
        id: r.idSaleOrder || r.id,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        created_at: r.created_at || r.createdAt || r.orderDate || r.date || null,
        total_amount: r.total_amount || r.total || r.amount || 0,
        payment_method: r.payment_method || r.paymentMethod || r.paymentmethod || null,
        raw: JSON.stringify(r)
      });
    }
  });
  tx(rows || []);
}

function insertProducts(db, rows, email) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO sale_products (id, order_id, store_id, account_email, created_at, product_name, quantity, total_amount, raw)
    VALUES (@id, @order_id, @store_id, @account_email, @created_at, @product_name, @quantity, @total_amount, @raw)
  `);
  const tx = db.transaction((items) => {
    for (const r of items) {
      insert.run({
        id: r.idSaleProduct || r.id,
        order_id: r.order_id || r.orderId || r.idSaleOrder || null,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        created_at: r.created_at || r.createdAt || r.date || null,
        product_name: r.product_name || r.name || r.product || null,
        quantity: r.quantity || r.qty || 0,
        total_amount: r.total_amount || r.total || r.amount || ((r.salePrice || 0) * (r.quantity || 1)),
        raw: JSON.stringify(r)
      });
    }
  });
  tx(rows || []);
  // Backfill created_at from sale_orders when missing
  db.prepare(`
    UPDATE sale_products
    SET created_at = (
      SELECT created_at FROM sale_orders o WHERE o.id = sale_products.order_id
    )
    WHERE account_email = @email AND created_at IS NULL AND order_id IS NOT NULL
  `).run({ email });
}

function insertSessions(db, rows, email) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO psessions (id, store_id, account_email, created_at, raw)
    VALUES (@id, @store_id, @account_email, @created_at, @raw)
  `);
  const tx = db.transaction((items) => {
    for (const r of items) {
      insert.run({
        id: r.idSession || r.id,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        created_at: r.created_at || r.createdAt || r.checkin || r.date || null,
        raw: JSON.stringify(r)
      });
    }
  });
  tx(rows || []);
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
        
        // Save to database
        insertOrders(db, orders, email);
        insertProducts(db, products, email);
        insertSessions(db, sessions, email);
        
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

// Real stats endpoints with database
function whereAndParams({ fromDate, toDate, storeIds }) {
  const where = [];
  const params = {};
  if (fromDate) {
    where.push('date(created_at) >= date(@fromDate)');
    params.fromDate = dayjs(fromDate).format('YYYY-MM-DD');
  }
  if (toDate) {
    where.push('date(created_at) <= date(@toDate)');
    params.toDate = dayjs(toDate).format('YYYY-MM-DD');
  }
  if (storeIds?.length) {
    const ids = storeIds.split(',').map((x) => x.trim()).filter(Boolean);
    where.push(`store_id IN (${ids.map((_, i) => `@s${i}`).join(',')})`);
    ids.forEach((v, i) => (params[`s${i}`] = Number(v)));
  }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { sql, params };
}

app.get('/stats/overview', (req, res) => {
  console.log('Stats overview called');
  const { sql, params } = whereAndParams(req.query);
  const totalOrders = db.prepare(`SELECT COUNT(*) as c, SUM(total_amount) as total FROM sale_orders ${sql}`).get(params);
  const byPayment = db.prepare(`SELECT payment_method as method, COUNT(*) as c, IFNULL(SUM(total_amount),0) as total FROM sale_orders ${sql} GROUP BY payment_method`).all(params);

  // Group payment methods
  const groups = {
    Efectivo: new Set(['cash', 'cc_pedidosyaft']),
    Apps: new Set(['cc_rappiol', 'cc_pedidosyaol']),
  };
  const grouped = { Efectivo: { group: 'Efectivo', count: 0, total: 0 }, Apps: { group: 'Apps', count: 0, total: 0 }, Otros: { group: 'Otros', count: 0, total: 0 } };
  for (const row of byPayment) {
    const method = String(row.method || 'unknown').toLowerCase().trim();
    const target = groups.Efectivo.has(method) ? 'Efectivo' : groups.Apps.has(method) ? 'Apps' : 'Otros';
    grouped[target].count += Number(row.c || 0);
    grouped[target].total += Number(row.total || 0);
  }

  res.json({
    totalOrders: totalOrders.c || 0,
    totalAmount: totalOrders.total || 0,
    paymentMethods: byPayment,
    paymentGroups: [grouped.Efectivo, grouped.Apps, grouped.Otros]
  });
});

app.get('/stats/by-store', (req, res) => {
  console.log('Stats by-store called');
  const { sql, params } = whereAndParams(req.query);
  const rows = db.prepare(`SELECT store_id, COUNT(*) as c, IFNULL(SUM(total_amount),0) as total FROM sale_orders ${sql} GROUP BY store_id`).all(params);
  res.json({ stores: rows });
});

app.get('/stats/daily', (req, res) => {
  console.log('Stats daily called');
  const { sql, params } = whereAndParams(req.query);
  const rows = db.prepare(`SELECT date(created_at) as day, COUNT(*) as c, IFNULL(SUM(total_amount),0) as total FROM sale_orders ${sql} GROUP BY date(created_at) ORDER BY day`).all(params);
  res.json({ days: rows });
});

app.get('/stats/top-products', (req, res) => {
  console.log('Stats top-products called');
  const { sql, params } = whereAndParams(req.query);
  const rows = db.prepare(`SELECT product_name as name, IFNULL(SUM(total_amount),0) as total, IFNULL(SUM(quantity),0) as qty FROM sale_products ${sql} GROUP BY product_name ORDER BY total DESC LIMIT 20`).all(params);
  res.json({ products: rows });
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
