#!/usr/bin/env node

/**
 * Script de inicialización de datos para Render
 * Se ejecuta durante el deploy para cargar datos históricos del año
 * antes de que la webapp esté live
 */

import 'dotenv/config';
import { initDatabase } from '../lib/db.js';
import { checkAndLoadYearData } from '../routes/sync.js';

async function initializeData() {
  console.log('🚀 Starting data initialization for Render deploy...');
  
  try {
    // Inicializar la base de datos
    console.log('📊 Initializing database...');
    initDatabase();
    
    // Verificar y cargar datos del año si es necesario
    console.log('🔍 Checking if database needs initial data load...');
    const result = await checkAndLoadYearData();
    
    if (result.success && !result.alreadyHasData) {
      console.log(`✅ Initial year data loaded for ${result.year}`);
      console.log(`📅 Date range: ${result.fromDate} to ${result.toDate}`);
      console.log(`📊 Accounts processed: ${result.result.results.length}`);
      
      const successfulAccounts = result.result.results.filter(r => r.ok).length;
      console.log(`✅ Successful accounts: ${successfulAccounts}/${result.result.results.length}`);
      
      if (successfulAccounts > 0) {
        console.log('🎉 Data initialization completed successfully!');
        process.exit(0);
      } else {
        console.log('⚠️ No data was loaded from any account');
        process.exit(1);
      }
    } else if (result.alreadyHasData) {
      console.log(`ℹ️ Database already has ${result.orderCount} orders`);
      console.log('✅ Data initialization skipped - database already populated');
      process.exit(0);
    } else {
      console.log('❌ Data initialization failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Data initialization failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeData();
}

export { initializeData };
