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
      insert.run({
        // idSaleOrder is the sale order identifier in sample
        id: r.idSaleOrder || r.id,
        // shopNumber identifies the store/shop in sample
        store_id: r.store_id || r.storeId || r.shopNumber || null,
        account_email: email,
        // orderDate is the timestamp in sample
        created_at: r.created_at || r.createdAt || r.orderDate || r.date || null,
        total_amount: r.total_amount || r.total || r.amount || 0,
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

syncRouter.post('/', requireAuth, async (req, res) => {
  try {
    const { fromDate, toDate } = req.body || {};
    const from = parseDateStr(fromDate || dayjs().format('YYYY-MM-DD'));
    const to = parseDateStr(toDate || dayjs().format('YYYY-MM-DD'));
    const accounts = getAccountsFromEnv();
    if (accounts.length === 0) return res.status(400).json({ error: 'No hay cuentas configuradas' });

    const db = getDb();
    const results = [];
    for (const { email, password } of accounts) {
      const accResult = { email, ok: true };
      try {
        const token = await login(email, password);
        const [orders, products, sessions] = await Promise.all([
          fetchEndpoint('/sale_orders', email, token, from, to),
          fetchEndpoint('/sale_products', email, token, from, to),
          fetchEndpoint('/psessions', email, token, from, to)
        ]);
        insertOrders(db, orders, email);
        insertProducts(db, products, email);
        insertSessions(db, sessions, email);
        accResult.counts = {
          sale_orders: Array.isArray(orders) ? orders.length : 0,
          sale_products: Array.isArray(products) ? products.length : 0,
          psessions: Array.isArray(sessions) ? sessions.length : 0,
        };
      } catch (e) {
        accResult.ok = false;
        accResult.error = e.message;
      }
      results.push(accResult);
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length) return res.status(207).json({ ok: false, partial: true, results, fromDate: from, toDate: to });
    res.json({ ok: true, results, fromDate: from, toDate: to });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


