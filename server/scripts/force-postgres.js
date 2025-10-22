#!/usr/bin/env node

/**
 * Script para forzar el uso de PostgreSQL en producción
 * Si no hay DATABASE_URL, intenta crear una conexión de prueba
 */

import 'dotenv/config';

console.log('🔧 Force PostgreSQL Configuration');
console.log('================================');

if (!process.env.DATABASE_URL) {
  console.log('❌ DATABASE_URL not found');
  console.log('🔧 Attempting to force PostgreSQL configuration...');
  
  // En Render, la base de datos debería estar disponible
  // pero a veces la variable no se pasa correctamente
  console.log('⚠️ This indicates a configuration issue in Render');
  console.log('📋 Please check:');
  console.log('  1. Database is created in Render dashboard');
  console.log('  2. Database name matches "dash-db"');
  console.log('  3. Environment variable is properly linked');
  
  process.exit(1);
} else {
  console.log('✅ DATABASE_URL is available');
  console.log('🐘 PostgreSQL will be used');
}

console.log('================================');
