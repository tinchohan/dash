import { Router } from 'express';
import fetch from 'node-fetch';
import dayjs from 'dayjs';
import { getDb } from '../lib/db.js';
import { requireAuth } from './auth.js';

export const syncRouter = Router();

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
      // Match sample curl UA; some backends rely on this
      'user-agent': 'vscode-restclient'
    },
    body: JSON.stringify({ user: { email, password } })
  });
  if (!resp.ok) throw new Error(`Login failed for ${email}`);
  const json = await resp.json();
  // Try several common locations for the token
  const token =
    json?.user?.authentication_token ||
    json?.authentication_token ||
    json?.user?.token ||
    json?.token ||
    json?.auth_token;
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
  // API expects dd/MM/YYYY; ensure we pass-through or convert ISO to that format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  const d = dayjs(str);
  return d.isValid() ? d.format('DD/MM/YYYY') : dayjs().format('DD/MM/YYYY');
}

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
        // idSaleOrder is the sale order identifier in sample
        id: r.idSaleOrder || r.id,
        // shopNumber identifies the store/shop in sample
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        // orderDate is the timestamp in sample
        created_at: r.created_at || r.createdAt || r.orderDate || r.date || null,
        total_amount: totalAmount,
        // paymentmethod is lowercase in sample
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
        // idSaleProduct is the product line identifier in sample
        id: r.idSaleProduct || r.id,
        order_id: r.order_id || r.orderId || r.idSaleOrder || null,
        // shopNumber identifies the store/shop in sample
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        // sale_products does not include date; keep null to be derived via join
        created_at: r.created_at || r.createdAt || r.date || null,
        product_name: r.product_name || r.name || r.product || null,
        quantity: r.quantity || r.qty || 0,
        // Prefer explicit totals, else compute from salePrice * quantity
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
        // idSession in sample
        id: r.idSession || r.id,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        // use checkin as the timestamp for session
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

async function fetchEndpointSince(endpoint, email, token, sinceId) {
  // Por ahora, usamos el mismo método pero podríamos optimizar
  // para que la API externa soporte filtros por ID
  const today = dayjs().format('YYYY-MM-DD');
  return fetchEndpoint(endpoint, email, token, today, today);
}

async function pollNewData(email, password) {
  try {
    console.log(`🔍 Polling new data for ${email}...`);
    const db = getDb();
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
  
  const db = getDb();
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

syncRouter.post('/', requireAuth, async (req, res) => {
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
  
  // Validación local cada 6 horas (sin llamadas a API)
  autoSyncInterval = setInterval(() => {
    performLocalValidation();
  }, 6 * 60 * 60 * 1000); // 6 horas
  
  // Polling inmediato al iniciar
  performPolling();
  
  console.log('🔄 Optimized hybrid sync started:');
  console.log('  - Polling every 5 minutes for new data');
  console.log('  - Local validation every 6 hours (no API calls)');
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

async function performLocalValidation() {
  try {
    console.log('🔍 Local validation starting...');
    const db = getDb();
    
    // Verificar integridad de datos locales
    const stats = {
      totalOrders: db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count,
      totalProducts: db.prepare('SELECT COUNT(*) as count FROM sale_products').get().count,
      totalSessions: db.prepare('SELECT COUNT(*) as count FROM psessions').get().count,
      lastOrder: db.prepare('SELECT MAX(created_at) as last FROM sale_orders').get().last,
      accounts: db.prepare('SELECT COUNT(DISTINCT account_email) as count FROM sale_orders').get().count
    };
    
    lastAutoSync = new Date();
    
    console.log('✅ Local validation completed:', {
      orders: stats.totalOrders,
      products: stats.totalProducts,
      sessions: stats.totalSessions,
      accounts: stats.accounts,
      lastOrder: stats.lastOrder
    });
    
    // Si hay problemas, podríamos hacer un polling específico
    // pero por ahora solo validamos
    
  } catch (error) {
    console.error('❌ Local validation failed:', error.message);
  }
}

// Endpoint para ver estado de auto-sync
syncRouter.get('/status', (req, res) => {
  res.json({
    pollingEnabled: !!pollingInterval,
    lastPoll: lastPoll,
    validationEnabled: !!autoSyncInterval,
    lastValidation: lastAutoSync,
    nextPoll: pollingInterval ? new Date(Date.now() + 5 * 60 * 1000) : null,
    nextValidation: autoSyncInterval ? new Date(Date.now() + 6 * 60 * 60 * 1000) : null
  });
});

// Endpoint para polling manual
syncRouter.post('/poll', async (req, res) => {
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

// Endpoint para validación local
syncRouter.post('/validate', async (req, res) => {
  try {
    console.log('🔍 Local validation triggered');
    
    // Realizar validación local sin llamadas a API
    const result = await performLocalValidation();
    
    res.json({
      ok: true,
      message: 'Validación local completada',
      result
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Exportar funciones para uso en index.js
export { startHybridSync, performPolling, performLocalValidation };


