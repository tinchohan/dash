import { Router } from 'express';
import fetch from 'node-fetch';
import dayjs from 'dayjs';
import { getDb } from '../lib/db.js';
import { dbWrapper } from '../lib/db-wrapper.js';
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

async function insertOrders(rows, email) {
  const isPostgres = process.env.DATABASE_URL ? true : false;
  
  await dbWrapper.transaction(async (db) => {
    for (const r of rows || []) {
      const totalAmount = r.total_amount || r.total || r.amount || 0;
      
      // Filtrar órdenes con total negativo (devoluciones, cancelaciones, etc.)
      if (totalAmount < 0) {
        console.log(`Skipping order ${r.idSaleOrder || r.id} with negative total: ${totalAmount}`);
        continue;
      }
      
      const orderData = {
        id: r.idSaleOrder || r.id,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        created_at: r.created_at || r.createdAt || r.orderDate || r.date || null,
        total_amount: totalAmount,
        payment_method: r.payment_method || r.paymentMethod || r.paymentmethod || null,
        raw: JSON.stringify(r)
      };

      if (isPostgres) {
        await db.query(`
          INSERT INTO sale_orders (id, store_id, account_email, created_at, total_amount, payment_method, raw)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            store_id = EXCLUDED.store_id,
            account_email = EXCLUDED.account_email,
            created_at = EXCLUDED.created_at,
            total_amount = EXCLUDED.total_amount,
            payment_method = EXCLUDED.payment_method,
            raw = EXCLUDED.raw
        `, [orderData.id, orderData.store_id, orderData.account_email, orderData.created_at, orderData.total_amount, orderData.payment_method, orderData.raw]);
      } else {
        // SQLite
        const insert = db.prepare(`
          INSERT OR REPLACE INTO sale_orders (id, store_id, account_email, created_at, total_amount, payment_method, raw)
          VALUES (@id, @store_id, @account_email, @created_at, @total_amount, @payment_method, @raw)
        `);
        insert.run(orderData);
      }
    }
  });
}

async function insertProducts(rows, email) {
  const isPostgres = process.env.DATABASE_URL ? true : false;
  
  console.log(`🛍️ Processing ${rows?.length || 0} products for ${email}`);
  
  await dbWrapper.transaction(async (db) => {
    let processedCount = 0;
    let skippedCount = 0;
    
    for (const r of rows || []) {
      const totalAmount = r.total_amount || r.total || r.amount || ((r.salePrice || 0) * (r.quantity || 1));
      
      // Filtrar productos con total negativo (devoluciones, cancelaciones, etc.)
      if (totalAmount < 0) {
        console.log(`⚠️ Skipping product ${r.idSaleProduct || r.id} with negative total: ${totalAmount} for ${email}`);
        skippedCount++;
        continue;
      }
      
      processedCount++;
      
      const productData = {
        id: r.idSaleProduct || r.id,
        order_id: r.order_id || r.orderId || r.idSaleOrder || null,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        created_at: r.created_at || r.createdAt || r.date || null,
        product_name: r.product_name || r.name || r.product || null,
        quantity: r.quantity || r.qty || 0,
        total_amount: totalAmount,
        raw: JSON.stringify(r)
      };

      if (isPostgres) {
        await db.query(`
          INSERT INTO sale_products (id, order_id, store_id, account_email, created_at, product_name, quantity, total_amount, raw)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            order_id = EXCLUDED.order_id,
            store_id = EXCLUDED.store_id,
            account_email = EXCLUDED.account_email,
            created_at = EXCLUDED.created_at,
            product_name = EXCLUDED.product_name,
            quantity = EXCLUDED.quantity,
            total_amount = EXCLUDED.total_amount,
            raw = EXCLUDED.raw
        `, [productData.id, productData.order_id, productData.store_id, productData.account_email, productData.created_at, productData.product_name, productData.quantity, productData.total_amount, productData.raw]);
      } else {
        // SQLite
        const insert = db.prepare(`
          INSERT OR REPLACE INTO sale_products (id, order_id, store_id, account_email, created_at, product_name, quantity, total_amount, raw)
          VALUES (@id, @order_id, @store_id, @account_email, @created_at, @product_name, @quantity, @total_amount, @raw)
        `);
        insert.run(productData);
      }
    }
    
    console.log(`✅ Products processed for ${email}: ${processedCount} inserted, ${skippedCount} skipped`);
  });

  // Backfill created_at from sale_orders when missing
  if (isPostgres) {
    await dbWrapper.query(`
      UPDATE sale_products
      SET created_at = (
        SELECT created_at FROM sale_orders o WHERE o.id = sale_products.order_id
      )
      WHERE account_email = $1 AND created_at IS NULL AND order_id IS NOT NULL
    `, [email]);
  } else {
    const db = getDb();
    db.prepare(`
      UPDATE sale_products
      SET created_at = (
        SELECT created_at FROM sale_orders o WHERE o.id = sale_products.order_id
      )
      WHERE account_email = @email AND created_at IS NULL AND order_id IS NOT NULL
    `).run({ email });
  }
}

async function insertSessions(rows, email) {
  const isPostgres = process.env.DATABASE_URL ? true : false;
  
  await dbWrapper.transaction(async (db) => {
    for (const r of rows || []) {
      const sessionData = {
        id: r.idSession || r.id,
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        created_at: r.created_at || r.createdAt || r.checkin || r.date || null,
        raw: JSON.stringify(r)
      };

      if (isPostgres) {
        await db.query(`
          INSERT INTO psessions (id, store_id, account_email, created_at, raw)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            store_id = EXCLUDED.store_id,
            account_email = EXCLUDED.account_email,
            created_at = EXCLUDED.created_at,
            raw = EXCLUDED.raw
        `, [sessionData.id, sessionData.store_id, sessionData.account_email, sessionData.created_at, sessionData.raw]);
      } else {
        // SQLite
        const insert = db.prepare(`
          INSERT OR REPLACE INTO psessions (id, store_id, account_email, created_at, raw)
          VALUES (@id, @store_id, @account_email, @created_at, @raw)
        `);
        insert.run(sessionData);
      }
    }
  });
}

// Funciones para polling inteligente
async function getSyncState(email) {
  const isPostgres = process.env.DATABASE_URL ? true : false;
  
  if (isPostgres) {
    const result = await dbWrapper.get('SELECT * FROM sync_state WHERE account_email = $1', [email]);
    return result || {
      account_email: email,
      last_order_id: 0,
      last_product_id: 0,
      last_session_id: 0,
      last_poll_at: null,
      last_full_sync_at: null
    };
  } else {
    const db = getDb();
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
}

async function updateSyncState(email, updates) {
  const isPostgres = process.env.DATABASE_URL ? true : false;
  
  const current = await getSyncState(email);
  const newState = { ...current, ...updates };
  
  if (isPostgres) {
    await dbWrapper.query(`
      INSERT INTO sync_state 
      (account_email, last_order_id, last_product_id, last_session_id, last_poll_at, last_full_sync_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (account_email) DO UPDATE SET
        last_order_id = EXCLUDED.last_order_id,
        last_product_id = EXCLUDED.last_product_id,
        last_session_id = EXCLUDED.last_session_id,
        last_poll_at = EXCLUDED.last_poll_at,
        last_full_sync_at = EXCLUDED.last_full_sync_at
    `, [newState.account_email, newState.last_order_id, newState.last_product_id, newState.last_session_id, newState.last_poll_at, newState.last_full_sync_at]);
  } else {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sync_state 
      (account_email, last_order_id, last_product_id, last_session_id, last_poll_at, last_full_sync_at)
      VALUES (@account_email, @last_order_id, @last_product_id, @last_session_id, @last_poll_at, @last_full_sync_at)
    `);
    
    stmt.run({
      account_email: newState.account_email,
      last_order_id: newState.last_order_id,
      last_product_id: newState.last_product_id,
      last_session_id: newState.last_session_id,
      last_poll_at: newState.last_poll_at,
      last_full_sync_at: newState.last_full_sync_at
    });
  }
}

async function fetchEndpointSince(endpoint, email, token, sinceId) {
  // Buscar datos de los últimos 7 días para asegurar que no se pierdan datos
  const today = dayjs();
  const weekAgo = today.subtract(7, 'days');
  
  console.log(`🔍 Fetching ${endpoint} from ${weekAgo.format('YYYY-MM-DD')} to ${today.format('YYYY-MM-DD')} (since ID: ${sinceId})`);
  
  return fetchEndpoint(endpoint, email, token, weekAgo.format('YYYY-MM-DD'), today.format('YYYY-MM-DD'));
}

async function pollNewData(email, password) {
  try {
    console.log(`🔍 Polling new data for ${email}...`);
    const db = getDb();
    const token = await login(email, password);
    const syncState = await getSyncState(email);
    
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
    
    // Procesar nuevas órdenes (filtrar por ID)
    if (Array.isArray(newOrders) && newOrders.length > 0) {
      const filteredOrders = newOrders.filter(o => (o.idSaleOrder || o.id || 0) > syncState.last_order_id);
      if (filteredOrders.length > 0) {
        await insertOrders(filteredOrders, email);
        maxOrderId = Math.max(maxOrderId, ...filteredOrders.map(o => o.idSaleOrder || o.id || 0));
        hasNewData = true;
        console.log(`📦 New orders: ${filteredOrders.length} (filtered from ${newOrders.length})`);
      } else {
        console.log(`📦 No new orders found (${newOrders.length} total, all <= ID ${syncState.last_order_id})`);
      }
    }
    
    // Procesar nuevos productos (filtrar por ID)
    if (Array.isArray(newProducts) && newProducts.length > 0) {
      const filteredProducts = newProducts.filter(p => (p.idSaleProduct || p.id || 0) > syncState.last_product_id);
      if (filteredProducts.length > 0) {
        await insertProducts(filteredProducts, email);
        maxProductId = Math.max(maxProductId, ...filteredProducts.map(p => p.idSaleProduct || p.id || 0));
        hasNewData = true;
        console.log(`🛍️ New products: ${filteredProducts.length} (filtered from ${newProducts.length})`);
      } else {
        console.log(`🛍️ No new products found (${newProducts.length} total, all <= ID ${syncState.last_product_id})`);
      }
    }
    
    // Procesar nuevas sesiones (filtrar por ID)
    if (Array.isArray(newSessions) && newSessions.length > 0) {
      const filteredSessions = newSessions.filter(s => (s.idSession || s.id || 0) > syncState.last_session_id);
      if (filteredSessions.length > 0) {
        await insertSessions(filteredSessions, email);
        maxSessionId = Math.max(maxSessionId, ...filteredSessions.map(s => s.idSession || s.id || 0));
        hasNewData = true;
        console.log(`👥 New sessions: ${filteredSessions.length} (filtered from ${newSessions.length})`);
      } else {
        console.log(`👥 No new sessions found (${newSessions.length} total, all <= ID ${syncState.last_session_id})`);
      }
    }
    
    // Actualizar estado de sincronización
    await updateSyncState(email, {
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
      
      // Logging específico para tienda 63953
      if (email.includes('63953')) {
        console.log(`🔍 DEBUG 63953 - Orders: ${orders?.length || 0}, Products: ${products?.length || 0}, Sessions: ${sessions?.length || 0}`);
        if (products && products.length > 0) {
          console.log(`🔍 DEBUG 63953 - First product sample:`, JSON.stringify(products[0], null, 2));
        }
      }
      
      // Save to database
      await insertOrders(orders, email);
      await insertProducts(products, email);
      await insertSessions(sessions, email);
      
      // Update sync state with latest IDs
      const maxOrderId = Math.max(0, ...(Array.isArray(orders) ? orders.map(o => o.idSaleOrder || o.id || 0) : [0]));
      const maxProductId = Math.max(0, ...(Array.isArray(products) ? products.map(p => p.idSaleProduct || p.id || 0) : [0]));
      const maxSessionId = Math.max(0, ...(Array.isArray(sessions) ? sessions.map(s => s.idSession || s.id || 0) : [0]));
      
      await updateSyncState(email, {
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

// Endpoint para sincronización histórica específica
syncRouter.post('/historical', requireAuth, async (req, res) => {
  try {
    const { fromDate, toDate, force = false } = req.body;
    
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate are required' });
    }
    
    console.log(`🔄 Historical sync requested: ${fromDate} to ${toDate}`);
    const result = await performSync(fromDate, toDate, false);
    
    const failed = result.results.filter(r => !r.ok);
    if (failed.length) {
      return res.status(207).json({ 
        ok: false, 
        partial: true, 
        ...result,
        message: `Historical sync completed with some failures from ${fromDate} to ${toDate}`
      });
    }
    
    res.json({ 
      success: true, 
      ...result,
      message: `Historical data synced from ${fromDate} to ${toDate}`,
      force
    });
  } catch (error) {
    console.error('Historical sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sistema de sincronización híbrida
let autoSyncInterval;
let pollingInterval;
let lastAutoSync = null;
let lastPoll = null;

function startHybridSync() {
  // Polling cada 30 minutos para datos nuevos
  pollingInterval = setInterval(() => {
    performPolling();
  }, 30 * 60 * 1000); // 30 minutos
  
  // Validación local cada 6 horas (sin llamadas a API)
  autoSyncInterval = setInterval(() => {
    performLocalValidation();
  }, 6 * 60 * 60 * 1000); // 6 horas
  
  // Polling inmediato al iniciar
  performPolling();
  
  console.log('🔄 Optimized hybrid sync started:');
  console.log('  - Polling every 30 minutes for new data');
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
    
    // Retornar las estadísticas para el endpoint
    return {
      orders: stats.totalOrders,
      products: stats.totalProducts,
      sessions: stats.totalSessions,
      accounts: stats.accounts,
      lastOrder: stats.lastOrder,
      timestamp: lastAutoSync
    };
    
  } catch (error) {
    console.error('❌ Local validation failed:', error.message);
    throw error;
  }
}

// Endpoint para ver estado de auto-sync
syncRouter.get('/status', (req, res) => {
  // Usar zona horaria de Buenos Aires para las fechas
  const now = new Date();
  const buenosAiresTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
  
  res.json({
    pollingEnabled: !!pollingInterval,
    lastPoll: lastPoll,
    validationEnabled: !!autoSyncInterval,
    lastValidation: lastAutoSync,
    nextPoll: pollingInterval ? new Date(buenosAiresTime.getTime() + 30 * 60 * 1000) : null,
    nextValidation: autoSyncInterval ? new Date(buenosAiresTime.getTime() + 6 * 60 * 60 * 1000) : null,
    currentTime: buenosAiresTime.toISOString(),
    timezone: 'America/Argentina/Buenos_Aires'
  });
});

// Endpoint para polling manual
syncRouter.post('/poll', async (req, res) => {
  try {
    console.log('🔄 Manual polling endpoint called');
    
    const accounts = getAccountsFromEnv();
    console.log(`📊 Found ${accounts.length} accounts configured`);
    
    if (accounts.length === 0) {
      console.log('❌ No accounts configured');
      return res.status(400).json({ error: 'No hay cuentas configuradas' });
    }

    console.log('🔄 Manual polling triggered');
    const results = [];
    
    for (const { email, password } of accounts) {
      console.log(`🔄 Processing account: ${email}`);
      try {
        const result = await pollNewData(email, password);
        results.push(result);
        console.log(`✅ Account ${email} processed:`, result);
      } catch (accountError) {
        console.error(`❌ Error processing account ${email}:`, accountError);
        results.push({
          email,
          success: false,
          error: accountError.message,
          hasNewData: false,
          counts: { orders: 0, products: 0, sessions: 0 }
        });
      }
    }
    
    const hasNewData = results.some(r => r.hasNewData);
    const successCount = results.filter(r => r.success).length;
    
    console.log(`📊 Polling completed: ${successCount}/${accounts.length} accounts successful, hasNewData: ${hasNewData}`);
    
    res.json({
      ok: true,
      hasNewData,
      successCount,
      totalAccounts: accounts.length,
      results
    });
  } catch (error) {
    console.error('❌ Polling endpoint error:', error);
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

// Función para verificar si la base de datos está vacía y cargar datos del año
async function checkAndLoadYearData() {
  try {
    const db = getDb();
    
    // Verificar si hay datos en la base de datos
    const orderCount = db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count;
    
    if (orderCount === 0) {
      console.log('📊 Base de datos vacía detectada. Cargando datos del año actual...');
      
      const currentYear = new Date().getFullYear();
      const fromDate = `${currentYear}-01-01`;
      const toDate = `${currentYear}-12-31`;
      
      console.log(`🔄 Cargando datos históricos del año ${currentYear} (${fromDate} a ${toDate})...`);
      
      const result = await performSync(fromDate, toDate, true);
      
      console.log(`✅ Carga automática del año ${currentYear} completada:`, {
        accounts: result.results.length,
        success: result.results.filter(r => r.ok).length
      });
      
      return {
        success: true,
        year: currentYear,
        fromDate,
        toDate,
        result
      };
    } else {
      console.log(`ℹ️ Base de datos ya contiene ${orderCount} órdenes. No se requiere carga automática.`);
      return {
        success: true,
        alreadyHasData: true,
        orderCount
      };
    }
  } catch (error) {
    console.error('❌ Error en carga automática del año:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Endpoint para verificar y cargar datos del año si es necesario
syncRouter.post('/check-and-load-year', async (req, res) => {
  try {
    const result = await checkAndLoadYearData();
    res.json(result);
  } catch (error) {
    console.error('Check and load year error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para cargar datos históricos manualmente
syncRouter.post('/load-historical', requireAuth, async (req, res) => {
  try {
    console.log('🔄 Historical load endpoint called');
    console.log('📝 Request body:', req.body);
    
    const { fromDate, toDate } = req.body || {};
    
    // Validar fechas requeridas
    if (!fromDate || !toDate) {
      console.log('❌ Missing dates in request');
      return res.status(400).json({ 
        error: 'fromDate and toDate are required',
        message: 'Debe proporcionar fechas de inicio y fin'
      });
    }
    
    // Validar formato de fechas
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    
    if (isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date format',
        message: 'Las fechas deben estar en formato YYYY-MM-DD'
      });
    }
    
    if (fromDateObj > toDateObj) {
      return res.status(400).json({ 
        error: 'Invalid date range',
        message: 'La fecha de inicio no puede ser mayor que la fecha de fin'
      });
    }
    
    console.log(`🔄 Manual historical load requested: ${fromDate} to ${toDate}`);
    console.log(`📅 Date range: ${fromDate} to ${toDate}`);
    console.log(`⏱️ This may take several minutes depending on data volume...`);
    
    // Verificar datos existentes antes de la carga
    console.log('🔍 Checking existing data...');
    let existingOrders = 0;
    try {
      if (process.env.DATABASE_URL) {
        console.log('🐘 Using PostgreSQL for count query');
        const result = await dbWrapper.query('SELECT COUNT(*) as count FROM sale_orders');
        existingOrders = result[0].count;
        console.log('✅ PostgreSQL count query successful');
      } else {
        console.log('🗃️ Using SQLite for count query');
        const db = getDb();
        existingOrders = db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count;
        console.log('✅ SQLite count query successful');
      }
    } catch (error) {
      console.error('❌ Error checking existing orders:', error);
      throw error;
    }
    
    console.log(`📊 Existing orders before load: ${existingOrders}`);
    
    const result = await performSync(fromDate, toDate, false);
    
    // Verificar datos después de la carga
    console.log('🔍 Checking final data count...');
    let finalOrders = 0;
    try {
      if (process.env.DATABASE_URL) {
        console.log('🐘 Using PostgreSQL for final count query');
        const result = await dbWrapper.query('SELECT COUNT(*) as count FROM sale_orders');
        finalOrders = result[0].count;
        console.log('✅ PostgreSQL final count query successful');
      } else {
        console.log('🗃️ Using SQLite for final count query');
        const db = getDb();
        finalOrders = db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count;
        console.log('✅ SQLite final count query successful');
      }
    } catch (error) {
      console.error('❌ Error checking final orders:', error);
      throw error;
    }
    
    const newOrders = finalOrders - existingOrders;
    console.log(`📊 New orders added: ${newOrders}`);
    console.log(`📊 Total orders after load: ${finalOrders}`);
    
    const failed = result.results.filter(r => !r.ok);
    if (failed.length) {
      return res.status(207).json({ 
        ok: false, 
        partial: true, 
        ...result,
        message: `Historical load completed with some failures from ${fromDate} to ${toDate}`,
        fromDate,
        toDate,
        existingOrders,
        newOrders,
        finalOrders
      });
    }
    
    res.json({ 
      success: true, 
      ...result,
      message: `Historical data loaded from ${fromDate} to ${toDate}`,
      fromDate,
      toDate,
      existingOrders,
      newOrders,
      finalOrders,
      duplicatePrevention: 'ON CONFLICT clauses prevent duplicates',
      negativeOrdersFiltered: 'Orders with negative totals are automatically filtered out'
    });
  } catch (error) {
    console.error('Historical load error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Exportar funciones para uso en index.js
export { startHybridSync, performPolling, performLocalValidation, checkAndLoadYearData };


