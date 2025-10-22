import Database from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;
let isPostgres = false;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function initDatabase() {
  // Check if we should use PostgreSQL (production) or SQLite (development)
  if (process.env.DATABASE_URL) {
    console.log('🐘 Initializing PostgreSQL database...');
    initPostgres();
  } else {
    console.log('🗃️ Initializing SQLite database...');
    initSQLite();
  }
}

function initSQLite() {
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data.db');
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    console.log('Creating database directory:', dbDir);
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  console.log('Initializing SQLite database at:', dbPath);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  migrateSQLite(db);
  console.log('SQLite database initialized successfully');
}

async function initPostgres() {
  try {
    isPostgres = true;
    const { Pool } = pg;
    
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Test connection
    const client = await db.connect();
    console.log('✅ PostgreSQL connection established');
    client.release();
    
    // Run migrations
    await migratePostgres(db);
    console.log('PostgreSQL database initialized successfully');
  } catch (error) {
    console.error('❌ PostgreSQL initialization failed:', error.message);
    throw error;
  }
}

function migrateSQLite(dbInstance) {
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
      raw TEXT
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
      raw TEXT
    );

    CREATE TABLE IF NOT EXISTS psessions (
      id INTEGER PRIMARY KEY,
      store_id INTEGER,
      account_email TEXT,
      created_at TEXT,
      raw TEXT
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

async function migratePostgres(dbInstance) {
  const client = await dbInstance.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        label VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY,
        name VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS sale_orders (
        id INTEGER PRIMARY KEY,
        store_id INTEGER,
        account_email VARCHAR(255),
        created_at TIMESTAMP,
        total_amount DECIMAL(10,2),
        payment_method VARCHAR(255),
        raw JSONB
      );

      CREATE TABLE IF NOT EXISTS sale_products (
        id INTEGER PRIMARY KEY,
        order_id INTEGER,
        store_id INTEGER,
        account_email VARCHAR(255),
        created_at TIMESTAMP,
        product_name VARCHAR(255),
        quantity DECIMAL(10,2),
        total_amount DECIMAL(10,2),
        raw JSONB
      );

      CREATE TABLE IF NOT EXISTS psessions (
        id INTEGER PRIMARY KEY,
        store_id INTEGER,
        account_email VARCHAR(255),
        created_at TIMESTAMP,
        raw JSONB
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        account_email VARCHAR(255) PRIMARY KEY,
        last_order_id INTEGER DEFAULT 0,
        last_product_id INTEGER DEFAULT 0,
        last_session_id INTEGER DEFAULT 0,
        last_poll_at TIMESTAMP,
        last_full_sync_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_orders_date ON sale_orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_products_date ON sale_products(created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_date ON psessions(created_at);
    `);
    
    console.log('✅ PostgreSQL tables created successfully');
  } finally {
    client.release();
  }
}


