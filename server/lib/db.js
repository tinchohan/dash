import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function initDatabase() {
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data.db');
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
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      label TEXT
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY,
      name TEXT
    );

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


