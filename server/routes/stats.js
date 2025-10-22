import { Router } from 'express';
import dayjs from 'dayjs';
import { getDb } from '../lib/db.js';
import { dbWrapper } from '../lib/db-wrapper.js';
import { requireAuth } from './auth.js';

export const statsRouter = Router();

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

// Helper function to execute queries with both SQLite and PostgreSQL support
async function executeQuery(sql, params = {}) {
  const isPostgres = process.env.DATABASE_URL ? true : false;
  
  if (isPostgres) {
    // Convert SQLite syntax to PostgreSQL
    let pgSql = sql;
    let pgParams = [];
    
    // Convert @param syntax to $1, $2, etc.
    const paramKeys = Object.keys(params);
    paramKeys.forEach((key, index) => {
      const placeholder = `@${key}`;
      const pgPlaceholder = `$${index + 1}`;
      pgSql = pgSql.replace(new RegExp(placeholder, 'g'), pgPlaceholder);
      pgParams.push(params[key]);
    });
    
    // Convert SQLite functions to PostgreSQL
    pgSql = pgSql.replace(/IFNULL\(/g, 'COALESCE(');
    pgSql = pgSql.replace(/datetime\(/g, 'created_at::timestamp');
    
    return await dbWrapper.query(pgSql, pgParams);
  } else {
    // SQLite
    const db = getDb();
    const stmt = db.prepare(sql);
    return stmt.all(params);
  }
}

async function executeQuerySingle(sql, params = {}) {
  const isPostgres = process.env.DATABASE_URL ? true : false;
  
  if (isPostgres) {
    // Convert SQLite syntax to PostgreSQL
    let pgSql = sql;
    let pgParams = [];
    
    // Convert @param syntax to $1, $2, etc.
    const paramKeys = Object.keys(params);
    paramKeys.forEach((key, index) => {
      const placeholder = `@${key}`;
      const pgPlaceholder = `$${index + 1}`;
      pgSql = pgSql.replace(new RegExp(placeholder, 'g'), pgPlaceholder);
      pgParams.push(params[key]);
    });
    
    // Convert SQLite functions to PostgreSQL
    pgSql = pgSql.replace(/IFNULL\(/g, 'COALESCE(');
    pgSql = pgSql.replace(/datetime\(/g, 'created_at::timestamp');
    
    const result = await dbWrapper.query(pgSql, pgParams);
    return result[0] || null;
  } else {
    // SQLite
    const db = getDb();
    const stmt = db.prepare(sql);
    return stmt.get(params);
  }
}

statsRouter.get('/overview', requireAuth, async (req, res) => {
  try {
    const { sql, params } = whereAndParams(req.query);
    const totalOrders = await executeQuerySingle(`SELECT COUNT(*) as c, SUM(total_amount) as total FROM sale_orders ${sql}`, params);
    const byPayment = await executeQuery(`SELECT payment_method as method, COUNT(*) as c, IFNULL(SUM(total_amount),0) as total FROM sale_orders ${sql} GROUP BY payment_method`, params);

  // Group payment methods into Efectivo, Apps, Otros
  const groups = {
    Efectivo: new Set(['cash', 'cc_pedidosyaft']),
    Apps: new Set(['cc_rappiol', 'cc_pedidosyaol']),
  };
  const grouped = { Efectivo: { group: 'Efectivo', count: 0, total: 0 }, Apps: { group: 'Apps', count: 0, total: 0 }, Otros: { group: 'Otros', count: 0, total: 0 } };
  for (const row of byPayment) {
    const method = String(row.method || 'unknown').toLowerCase().trim();
    const target = groups.Efectivo.has(method)
      ? 'Efectivo'
      : groups.Apps.has(method)
      ? 'Apps'
      : 'Otros';
    grouped[target].count += Number(row.c || 0);
    grouped[target].total += Number(row.total || 0);
  }

    res.json({
      totalOrders: totalOrders.c || 0,
      totalAmount: totalOrders.total || 0,
      paymentMethods: byPayment,
      paymentGroups: [grouped.Efectivo, grouped.Apps, grouped.Otros],
    });
  } catch (error) {
    console.error('Error in overview endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

statsRouter.get('/by-store', requireAuth, async (req, res) => {
  try {
    const { sql, params } = whereAndParams(req.query);
    const rows = await executeQuery(`SELECT store_id, COUNT(*) as c, IFNULL(SUM(total_amount),0) as total FROM sale_orders ${sql} GROUP BY store_id`, params);
    res.json({ stores: rows });
  } catch (error) {
    console.error('Error in by-store endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

statsRouter.get('/daily', requireAuth, async (req, res) => {
  try {
    const { sql, params } = whereAndParams(req.query);
    const rows = await executeQuery(`SELECT date(created_at) as day, COUNT(*) as c, IFNULL(SUM(total_amount),0) as total FROM sale_orders ${sql} GROUP BY date(created_at) ORDER BY day`, params);
    res.json({ days: rows });
  } catch (error) {
    console.error('Error in daily endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

statsRouter.get('/top-products', requireAuth, async (req, res) => {
  try {
    const { sql, params } = whereAndParams(req.query);
    const rows = await executeQuery(`SELECT product_name as name, IFNULL(SUM(total_amount),0) as total, IFNULL(SUM(quantity),0) as qty FROM sale_products ${sql} GROUP BY product_name ORDER BY total DESC LIMIT 20`, params);
    res.json({ products: rows });
  } catch (error) {
    console.error('Error in top-products endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// List distinct stores present in DB
statsRouter.get('/stores', requireAuth, async (_req, res) => {
  try {
    const rows = await executeQuery('SELECT DISTINCT store_id FROM sale_orders WHERE store_id IS NOT NULL ORDER BY store_id');
    
    // Si no hay datos en la base de datos, usar tiendas hardcodeadas como respaldo
    if (rows.length === 0) {
      console.log('No stores found in database, using hardcoded stores');
      res.json({ stores: ['63953', '66220', '72267', '30036', '30038', '10019', '10020'] });
      return;
    }
    
    res.json({ stores: rows.map(r => r.store_id) });
  } catch (error) {
    console.error('Error in stores endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Recent sales endpoint
statsRouter.get('/recent-sales', requireAuth, async (req, res) => {
  try {
    const { storeIds } = req.query;
    
    // Construir WHERE clause solo para tiendas (no fechas para mostrar las más recientes)
    const where = [];
    const params = {};
    
    if (storeIds) {
      const ids = storeIds.split(',').filter(Boolean);
      if (ids.length > 0) {
        where.push(`o.store_id IN (${ids.map((_, i) => `@s${i}`).join(',')})`);
        ids.forEach((v, i) => (params[`s${i}`] = Number(v)));
      }
    }
    
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    
    // Obtener las últimas órdenes (sin filtro de fecha para mostrar las más recientes)
    const recentOrders = await executeQuery(`
      SELECT 
        o.id,
        o.store_id,
        o.total_amount,
        o.payment_method,
        o.created_at,
        p.product_name,
        p.quantity,
        p.total_amount as product_amount
      FROM sale_orders o
      LEFT JOIN sale_products p ON o.id = p.order_id
      ${whereClause}
      ORDER BY o.created_at DESC, p.total_amount DESC
      LIMIT 15
    `, params);
    
    // Agrupar por orden y tomar el producto principal (mayor monto)
    const groupedOrders = {};
    recentOrders.forEach(row => {
      if (!groupedOrders[row.id]) {
        groupedOrders[row.id] = {
          id: row.id,
          store_id: row.store_id,
          total_amount: row.total_amount,
          payment_method: row.payment_method,
          created_at: row.created_at,
          main_product: null,
          main_product_amount: 0
        };
      }
      
      // Mantener el producto con mayor monto
      if (row.product_amount && row.product_amount > groupedOrders[row.id].main_product_amount) {
        groupedOrders[row.id].main_product = row.product_name;
        groupedOrders[row.id].main_product_amount = row.product_amount;
      }
    });
    
    const result = Object.values(groupedOrders).slice(0, 3);
    res.json({ recentSales: result });
  } catch (error) {
    console.error('Error in recent-sales endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug: últimos N registros de órdenes y productos
statsRouter.get('/debug/recent', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
  const recentOrders = db.prepare(`SELECT id, store_id, account_email, created_at, total_amount, payment_method FROM sale_orders ORDER BY datetime(created_at) DESC LIMIT ?`).all(limit);
  const recentProducts = db.prepare(`SELECT id, order_id, store_id, account_email, created_at, product_name, quantity, total_amount FROM sale_products ORDER BY datetime(created_at) DESC LIMIT ?`).all(limit);
  res.json({ limit, sale_orders: recentOrders, sale_products: recentProducts });
});

// Debug: estadísticas de la base de datos
statsRouter.get('/debug/stats', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const orderCount = db.prepare(`SELECT COUNT(*) as count FROM sale_orders`).get();
    const productCount = db.prepare(`SELECT COUNT(*) as count FROM sale_products`).get();
    const sessionCount = db.prepare(`SELECT COUNT(*) as count FROM psessions`).get();
    
    const oldestOrder = db.prepare(`SELECT created_at FROM sale_orders ORDER BY datetime(created_at) ASC LIMIT 1`).get();
    const newestOrder = db.prepare(`SELECT created_at FROM sale_orders ORDER BY datetime(created_at) DESC LIMIT 1`).get();
    
    const storeStats = db.prepare(`
      SELECT store_id, COUNT(*) as count 
      FROM sale_orders 
      GROUP BY store_id 
      ORDER BY count DESC
    `).all();
    
    res.json({
      counts: {
        orders: orderCount.count,
        products: productCount.count,
        sessions: sessionCount.count
      },
      dateRange: {
        oldest: oldestOrder?.created_at,
        newest: newestOrder?.created_at
      },
      storeStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verificar disponibilidad de fechas en la base de datos
statsRouter.get('/date-coverage', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const { fromDate, toDate } = req.query;
    
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate are required' });
    }
    
    // Verificar si hay datos en el rango especificado
    const orderCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM sale_orders 
      WHERE date(created_at) >= date(@fromDate) AND date(created_at) <= date(@toDate)
    `).get({ fromDate, toDate });
    
    const productCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM sale_products 
      WHERE date(created_at) >= date(@fromDate) AND date(created_at) <= date(@toDate)
    `).get({ fromDate, toDate });
    
    // Obtener fechas disponibles en el rango
    const availableDates = db.prepare(`
      SELECT DISTINCT date(created_at) as date, COUNT(*) as count
      FROM sale_orders 
      WHERE date(created_at) >= date(@fromDate) AND date(created_at) <= date(@toDate)
      GROUP BY date(created_at)
      ORDER BY date(created_at)
    `).all({ fromDate, toDate });
    
    res.json({
      hasData: orderCount.count > 0,
      counts: {
        orders: orderCount.count,
        products: productCount.count
      },
      availableDates,
      requestedRange: { fromDate, toDate }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


