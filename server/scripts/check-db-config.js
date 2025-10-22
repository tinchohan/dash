#!/usr/bin/env node

/**
 * Script para verificar la configuración de base de datos
 * Se ejecuta durante el build para diagnosticar problemas
 */

import 'dotenv/config';

console.log('🔍 Database Configuration Check');
console.log('================================');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL available:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0);

if (process.env.DATABASE_URL) {
  console.log('✅ DATABASE_URL is configured');
  console.log('Connection string preview:', process.env.DATABASE_URL.substring(0, 30) + '...');
} else {
  console.log('❌ DATABASE_URL is NOT configured');
  console.log('This will cause the app to use SQLite instead of PostgreSQL');
}

console.log('================================');
