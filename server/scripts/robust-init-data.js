#!/usr/bin/env node

/**
 * Script de inicialización ROBUSTO de datos para Render
 * Incluye retry logic y manejo mejorado de errores
 */

import 'dotenv/config';
import { initDatabase } from '../lib/db.js';
import { getDb } from '../lib/db.js';
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

// Función para retry con backoff exponencial
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⚠️ Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function initializeData() {
  console.log('🚀 Starting ROBUST data initialization for Render deploy...');
  console.log('📅 Initialization started at:', new Date().toISOString());
  
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
    
    // Verificar si hay datos en la base de datos
    const db = getDb();
    const orderCount = db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count;
    
    if (orderCount > 0) {
      console.log(`ℹ️ Database already has ${orderCount} orders`);
      console.log('✅ Data initialization skipped - database already populated');
      process.exit(0);
    }
    
    console.log('📊 Base de datos vacía detectada. Cargando datos del año actual...');
    
    const currentYear = new Date().getFullYear();
    const fromDate = `${currentYear}-01-01`;
    const toDate = `${currentYear}-12-31`;
    
    console.log(`🔄 Cargando datos históricos del año ${currentYear} (${fromDate} a ${toDate})...`);
    console.log(`📅 Rango completo: ${fromDate} a ${toDate}`);
    console.log(`🏪 Tiendas a procesar: ${accounts.length}`);
    
    // Realizar sincronización con retry logic
    const result = await retryWithBackoff(async () => {
      console.log('🔄 Attempting data synchronization...');
      return await performSync(fromDate, toDate, true);
    }, 3, 5000); // 3 intentos, delay base de 5 segundos
    
    console.log(`📊 Resultado de la sincronización:`);
    console.log(`  - Cuentas procesadas: ${result.results.length}`);
    console.log(`  - Cuentas exitosas: ${result.results.filter(r => r.ok).length}`);
    console.log(`  - Cuentas fallidas: ${result.results.filter(r => !r.ok).length}`);
    
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
      console.log(`🎉 Data initialization completed successfully!`);
      console.log(`✅ ${successfulAccounts}/${accounts.length} accounts processed successfully`);
      
      // Verificar datos cargados
      const finalOrderCount = db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count;
      const finalProductCount = db.prepare('SELECT COUNT(*) as count FROM sale_products').get().count;
      const finalSessionCount = db.prepare('SELECT COUNT(*) as count FROM psessions').get().count;
      
      console.log(`📊 Final database state:`);
      console.log(`  - Orders: ${finalOrderCount}`);
      console.log(`  - Products: ${finalProductCount}`);
      console.log(`  - Sessions: ${finalSessionCount}`);
      
      // Verificar que tenemos datos de múltiples tiendas
      const storeCount = db.prepare('SELECT COUNT(DISTINCT store_id) as count FROM sale_orders').get().count;
      console.log(`🏪 Stores with data: ${storeCount}`);
      
      if (storeCount < 2) {
        console.log('⚠️ Warning: Only one store has data. This might indicate an issue.');
      }
      
      console.log('📅 Initialization finished at:', new Date().toISOString());
      process.exit(0);
    } else {
      console.log('❌ No data was loaded from any account');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Data initialization failed:', error.message);
    console.error('Stack trace:', error.stack);
    console.log('📅 Initialization failed at:', new Date().toISOString());
    process.exit(1);
  }
}

// Ejecutar solo si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeData();
}

export { initializeData };
