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
    CREATE TABLE IF NOT EXISTS sync_state (
      account_email TEXT PRIMARY KEY,
      last_order_id INTEGER DEFAULT 0,
      last_product_id INTEGER DEFAULT 0,
      last_session_id INTEGER DEFAULT 0,
      last_poll_at TEXT,
      last_full_sync_at TEXT
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
      const totalAmount = r.total_amount || r.total || r.amount || 0;
      
      // Filtrar órdenes con total negativo (devoluciones, cancelaciones, etc.)
      if (totalAmount < 0) {
        console.log(`Skipping order ${r.idSaleOrder || r.id} with negative total: ${totalAmount}`);
        continue;
      }
      
      insert.run({
        id: r.idSaleOrder || r.id,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        created_at: r.created_at || r.createdAt || r.orderDate || r.date || null,
        total_amount: totalAmount,
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
      const totalAmount = r.total_amount || r.total || r.amount || ((r.salePrice || 0) * (r.quantity || 1));
      
      // Filtrar productos con total negativo (devoluciones, cancelaciones, etc.)
      if (totalAmount < 0) {
        console.log(`Skipping product ${r.idSaleProduct || r.id} with negative total: ${totalAmount}`);
        continue;
      }
      
      insert.run({
        id: r.idSaleProduct || r.id,
        order_id: r.order_id || r.orderId || r.idSaleOrder || null,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        created_at: r.created_at || r.createdAt || r.date || null,
        product_name: r.product_name || r.name || r.product || null,
        quantity: r.quantity || r.qty || 0,
        total_amount: totalAmount,
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

// Funciones para polling inteligente
function getSyncState(db, email) {
  const stmt = db.prepare('SELECT * FROM sync_state WHERE account_email = ?');
  return stmt.get(email) || {
    account_email: email,
    last_order_id: 0,
    last_product_id: 0,
    last_session_id: 0,
    last_poll_at: null,
    last_full_sync_at: null
  };
}

function updateSyncState(db, email, updates) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sync_state 
    (account_email, last_order_id, last_product_id, last_session_id, last_poll_at, last_full_sync_at)
    VALUES (@account_email, @last_order_id, @last_product_id, @last_session_id, @last_poll_at, @last_full_sync_at)
  `);
  
  const current = getSyncState(db, email);
  const newState = { ...current, ...updates };
  
  stmt.run({
    account_email: email,
    last_order_id: newState.last_order_id,
    last_product_id: newState.last_product_id,
    last_session_id: newState.last_session_id,
    last_poll_at: newState.last_poll_at,
    last_full_sync_at: newState.last_full_sync_at
  });
}

async function pollNewData(email, password) {
  try {
    console.log(`🔍 Polling new data for ${email}...`);
    const token = await login(email, password);
    const syncState = getSyncState(db, email);
    
    // Obtener datos desde el último ID conocido
    const [newOrders, newProducts, newSessions] = await Promise.all([
      fetchEndpointSince('/sale_orders', email, token, syncState.last_order_id),
      fetchEndpointSince('/sale_products', email, token, syncState.last_product_id),
      fetchEndpointSince('/psessions', email, token, syncState.last_session_id)
    ]);
    
    let hasNewData = false;
    let maxOrderId = syncState.last_order_id;
    let maxProductId = syncState.last_product_id;
    let maxSessionId = syncState.last_session_id;
    
    // Procesar nuevas órdenes
    if (Array.isArray(newOrders) && newOrders.length > 0) {
      insertOrders(db, newOrders, email);
      maxOrderId = Math.max(maxOrderId, ...newOrders.map(o => o.idSaleOrder || o.id || 0));
      hasNewData = true;
      console.log(`📦 New orders: ${newOrders.length}`);
    }
    
    // Procesar nuevos productos
    if (Array.isArray(newProducts) && newProducts.length > 0) {
      insertProducts(db, newProducts, email);
      maxProductId = Math.max(maxProductId, ...newProducts.map(p => p.idSaleProduct || p.id || 0));
      hasNewData = true;
      console.log(`🛍️ New products: ${newProducts.length}`);
    }
    
    // Procesar nuevas sesiones
    if (Array.isArray(newSessions) && newSessions.length > 0) {
      insertSessions(db, newSessions, email);
      maxSessionId = Math.max(maxSessionId, ...newSessions.map(s => s.idSession || s.id || 0));
      hasNewData = true;
      console.log(`👥 New sessions: ${newSessions.length}`);
    }
    
    // Actualizar estado de sincronización
    updateSyncState(db, email, {
      last_order_id: maxOrderId,
      last_product_id: maxProductId,
      last_session_id: maxSessionId,
      last_poll_at: new Date().toISOString()
    });
    
    return {
      email,
      success: true,
      hasNewData,
      counts: {
        orders: Array.isArray(newOrders) ? newOrders.length : 0,
        products: Array.isArray(newProducts) ? newProducts.length : 0,
        sessions: Array.isArray(newSessions) ? newSessions.length : 0
      }
    };
    
  } catch (error) {
    console.error(`❌ Polling error for ${email}:`, error.message);
    return {
      email,
      success: false,
      error: error.message,
      hasNewData: false,
      counts: { orders: 0, products: 0, sessions: 0 }
    };
  }
}

async function fetchEndpointSince(endpoint, email, token, sinceId) {
  // Por ahora, usamos el mismo método pero podríamos optimizar
  // para que la API externa soporte filtros por ID
  const today = dayjs().format('YYYY-MM-DD');
  return fetchEndpoint(endpoint, email, token, today, today);
}

// Función reutilizable para sincronización
async function performSync(fromDate, toDate, isAutoSync = false) {
  console.log(`${isAutoSync ? 'Auto' : 'Manual'} sync called:`, { fromDate, toDate });
  const from = parseDateStr(fromDate || dayjs().format('YYYY-MM-DD'));
  const to = parseDateStr(toDate || dayjs().format('YYYY-MM-DD'));
  const accounts = getAccountsFromEnv();
  
  if (accounts.length === 0) {
    throw new Error('No hay cuentas configuradas');
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
      
      // Update sync state with latest IDs
      const maxOrderId = Math.max(0, ...(Array.isArray(orders) ? orders.map(o => o.idSaleOrder || o.id || 0) : [0]));
      const maxProductId = Math.max(0, ...(Array.isArray(products) ? products.map(p => p.idSaleProduct || p.id || 0) : [0]));
      const maxSessionId = Math.max(0, ...(Array.isArray(sessions) ? sessions.map(s => s.idSession || s.id || 0) : [0]));
      
      updateSyncState(db, email, {
        last_order_id: maxOrderId,
        last_product_id: maxProductId,
        last_session_id: maxSessionId,
        last_full_sync_at: new Date().toISOString()
      });
      
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
  if (failed.length > 0) {
    console.warn(`Failed accounts: ${failed.map(f => f.email).join(', ')}`);
  }

  return {
    ok: true,
    results,
    fromDate: from,
    toDate: to,
    isAutoSync
  };
}

app.post('/sync', async (req, res) => {
  try {
    const { fromDate, toDate } = req.body || {};
    const result = await performSync(fromDate, toDate, false);
    
    const failed = result.results.filter(r => !r.ok);
    if (failed.length) {
      return res.status(207).json({ 
        ok: false, 
        partial: true, 
        ...result
      });
    }
    
    res.json(result);
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

// Sistema de sincronización híbrida
let autoSyncInterval;
let pollingInterval;
let lastAutoSync = null;
let lastPoll = null;

function startHybridSync() {
  // Polling frecuente cada 5 minutos para datos nuevos
  pollingInterval = setInterval(() => {
    performPolling();
  }, 5 * 60 * 1000); // 5 minutos
  
  // Sync completo cada 6 horas para asegurar consistencia
  autoSyncInterval = setInterval(() => {
    performAutoSync();
  }, 6 * 60 * 60 * 1000); // 6 horas
  
  // Polling inmediato al iniciar
  performPolling();
  
  console.log('🔄 Hybrid sync started:');
  console.log('  - Polling every 5 minutes for new data');
  console.log('  - Full sync every 6 hours for consistency');
}

async function performPolling() {
  try {
    const accounts = getAccountsFromEnv();
    if (accounts.length === 0) return;
    
    console.log('🔍 Polling for new data...');
    const results = [];
    
    for (const { email, password } of accounts) {
      const result = await pollNewData(email, password);
      results.push(result);
    }
    
    const hasNewData = results.some(r => r.hasNewData);
    const successCount = results.filter(r => r.success).length;
    
    lastPoll = new Date();
    
    if (hasNewData) {
      console.log(`✅ Polling completed: ${successCount}/${accounts.length} accounts, new data found`);
    } else {
      console.log(`ℹ️ Polling completed: ${successCount}/${accounts.length} accounts, no new data`);
    }
    
  } catch (error) {
    console.error('❌ Polling failed:', error.message);
  }
}

async function performAutoSync() {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    console.log(`🔄 Auto-sync starting for today: ${today}`);
    
    const result = await performSync(today, today, true);
    lastAutoSync = new Date();
    
    console.log(`✅ Auto-sync completed for ${today}:`, {
      success: result.results.filter(r => r.ok).length,
      failed: result.results.filter(r => !r.ok).length,
      totalOrders: result.results.reduce((sum, r) => sum + (r.counts?.sale_orders || 0), 0)
    });
  } catch (error) {
    console.error('❌ Auto-sync failed:', error.message);
  }
}

// Endpoint para ver estado de auto-sync
app.get('/sync/status', (req, res) => {
  res.json({
    autoSyncEnabled: !!autoSyncInterval,
    lastAutoSync: lastAutoSync,
    nextAutoSync: autoSyncInterval ? new Date(Date.now() + 60 * 60 * 1000) : null,
    pollingEnabled: !!pollingInterval,
    lastPoll: lastPoll
  });
});

// Endpoint para polling manual
app.post('/sync/poll', async (req, res) => {
  try {
    const accounts = getAccountsFromEnv();
    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No hay cuentas configuradas' });
    }

    console.log('🔄 Manual polling triggered');
    const results = [];
    
    for (const { email, password } of accounts) {
      const result = await pollNewData(email, password);
      results.push(result);
    }
    
    const hasNewData = results.some(r => r.hasNewData);
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      ok: true,
      hasNewData,
      successCount,
      totalAccounts: accounts.length,
      results
    });
  } catch (error) {
    console.error('Polling error:', error);
    res.status(500).json({ error: error.message });
  }
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
  
  // Iniciar sistema híbrido después de que el servidor esté listo
  setTimeout(() => {
    startHybridSync();
  }, 5000); // 5 segundos de delay para asegurar que todo esté inicializado
});

// Keep process alive
setInterval(() => {
  console.log('Heartbeat:', new Date().toISOString());
}, 30000);
