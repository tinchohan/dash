#!/usr/bin/env node

/**
 * Script para cargar datos históricos del año completo
 * Se puede ejecutar manualmente para poblar la base de datos PostgreSQL
 */

import 'dotenv/config';
import { initDatabase } from '../lib/db.js';
import { getDb } from '../lib/db.js';
import { dbWrapper } from '../lib/db-wrapper.js';
import { performSync } from '../routes/sync.js';

// Función para obtener cuentas desde variables de entorno
function getAccountsFromEnv() {
  const accounts = [];
  for (let i = 1; i <= 7; i++) {
    const email = process.env[`LINISCO_EMAIL_${i}`];
    const password = process.env[`LINISCO_PASSWORD_${i}`];
    if (email && password) accounts.push({ email, password });
  }
  return accounts;
}

async function loadHistoricalData() {
  console.log('🚀 Starting historical data load for PostgreSQL...');
  console.log('📅 Load started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    console.log('📊 Initializing database...');
    initDatabase();
    
    // Verificar cuentas disponibles
    const accounts = getAccountsFromEnv();
    console.log(`🔍 Found ${accounts.length} accounts configured`);
    accounts.forEach((acc, index) => {
      console.log(`  ${index + 1}. ${acc.email}`);
    });
    
    if (accounts.length === 0) {
      console.log('❌ No accounts configured. Please check environment variables.');
      process.exit(1);
    }
    
    // Verificar datos existentes
    let existingOrders;
    if (process.env.DATABASE_URL) {
      const result = await dbWrapper.query('SELECT COUNT(*) as count FROM sale_orders');
      existingOrders = result[0].count;
    } else {
      const db = getDb();
      existingOrders = db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count;
    }
    
    console.log(`📊 Current database state: ${existingOrders} orders`);
    
    if (existingOrders > 1000) {
      console.log('ℹ️ Database already has substantial data. Skipping historical load.');
      console.log('✅ Historical data load completed (already populated)');
      process.exit(0);
    }
    
    console.log('📊 Database needs historical data. Loading full year...');
    
    const currentYear = new Date().getFullYear();
    const fromDate = `${currentYear}-01-01`;
    const toDate = `${currentYear}-12-31`;
    
    console.log(`🔄 Loading historical data for year ${currentYear} (${fromDate} to ${toDate})...`);
    console.log(`📅 Full year range: ${fromDate} to ${toDate}`);
    console.log(`🏪 Stores to process: ${accounts.length}`);
    
    // Realizar sincronización histórica
    const result = await performSync(fromDate, toDate, true);
    
    console.log(`📊 Historical sync result:`);
    console.log(`  - Accounts processed: ${result.results.length}`);
    console.log(`  - Successful accounts: ${result.results.filter(r => r.ok).length}`);
    console.log(`  - Failed accounts: ${result.results.filter(r => !r.ok).length}`);
    
    // Mostrar detalles de cada cuenta
    result.results.forEach((accResult, index) => {
      if (accResult.ok) {
        console.log(`  ✅ ${accResult.email}: ${JSON.stringify(accResult.counts)}`);
      } else {
        console.log(`  ❌ ${accResult.email}: ${accResult.error}`);
      }
    });
    
    const successfulAccounts = result.results.filter(r => r.ok).length;
    
    if (successfulAccounts > 0) {
      console.log(`🎉 Historical data load completed successfully!`);
      console.log(`✅ ${successfulAccounts}/${accounts.length} accounts processed successfully`);
      
      // Verificar datos cargados
      let finalOrderCount, finalProductCount, finalSessionCount;
      if (process.env.DATABASE_URL) {
        const [orderResult, productResult, sessionResult] = await Promise.all([
          dbWrapper.query('SELECT COUNT(*) as count FROM sale_orders'),
          dbWrapper.query('SELECT COUNT(*) as count FROM sale_products'),
          dbWrapper.query('SELECT COUNT(*) as count FROM psessions')
        ]);
        finalOrderCount = orderResult[0].count;
        finalProductCount = productResult[0].count;
        finalSessionCount = sessionResult[0].count;
      } else {
        const db = getDb();
        finalOrderCount = db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count;
        finalProductCount = db.prepare('SELECT COUNT(*) as count FROM sale_products').get().count;
        finalSessionCount = db.prepare('SELECT COUNT(*) as count FROM psessions').get().count;
      }
      
      console.log(`📊 Final database state:`);
      console.log(`  - Orders: ${finalOrderCount}`);
      console.log(`  - Products: ${finalProductCount}`);
      console.log(`  - Sessions: ${finalSessionCount}`);
      
      // Verificar que tenemos datos de múltiples tiendas
      let storeCount;
      if (process.env.DATABASE_URL) {
        const result = await dbWrapper.query('SELECT COUNT(DISTINCT store_id) as count FROM sale_orders');
        storeCount = result[0].count;
      } else {
        const db = getDb();
        storeCount = db.prepare('SELECT COUNT(DISTINCT store_id) as count FROM sale_orders').get().count;
      }
      console.log(`🏪 Stores with data: ${storeCount}`);
      
      console.log('📅 Historical load finished at:', new Date().toISOString());
      process.exit(0);
    } else {
      console.log('❌ No data was loaded from any account');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Historical data load failed:', error.message);
    console.error('Stack trace:', error.stack);
    console.log('📅 Historical load failed at:', new Date().toISOString());
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  loadHistoricalData();
}

export { loadHistoricalData };
