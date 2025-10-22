/**
 * Database wrapper to handle both SQLite and PostgreSQL
 * Provides a unified interface for database operations
 */

import { getDb } from './db.js';

export class DatabaseWrapper {
  constructor() {
    this.db = getDb();
    this.isPostgres = process.env.DATABASE_URL ? true : false;
  }

  // Execute a query and return results
  async query(sql, params = []) {
    if (this.isPostgres) {
      const client = await this.db.connect();
      try {
        const result = await client.query(sql, params);
        return result.rows;
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const stmt = this.db.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return stmt.all(params);
      } else {
        return stmt.run(params);
      }
    }
  }

  // Get a single row
  async get(sql, params = []) {
    if (this.isPostgres) {
      const client = await this.db.connect();
      try {
        const result = await client.query(sql, params);
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const stmt = this.db.prepare(sql);
      return stmt.get(params);
    }
  }

  // Execute a transaction
  async transaction(callback) {
    if (this.isPostgres) {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      // SQLite
      const tx = this.db.transaction(callback);
      return tx();
    }
  }

  // Prepare a statement (SQLite only)
  prepare(sql) {
    if (this.isPostgres) {
      throw new Error('prepare() is not available for PostgreSQL. Use query() instead.');
    }
    return this.db.prepare(sql);
  }

  // Execute raw SQL (for migrations, etc.)
  async exec(sql) {
    if (this.isPostgres) {
      const client = await this.db.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
    } else {
      this.db.exec(sql);
    }
  }
}

// Export a singleton instance
export const dbWrapper = new DatabaseWrapper();
