#!/usr/bin/env node

import { getDb } from '../lib/db.js';
import { dbWrapper } from '../lib/db-wrapper.js';
import { initDatabase } from '../lib/db.js';
import { performSync } from '../routes/sync.js';

async function syncStore10019Historical() {
  console.log('🔄 Syncing historical data for store 10019...');
  console.log('📅 Sync started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    initDatabase();
    
    // Verificar cuentas disponibles
    const accounts = [];
    for (let i = 1; i <= 10; i++) {
      const email = process.env[`LINISCO_EMAIL_${i}`];
      if (email) {
        accounts.push({ index: i, email });
      }
    }
    
    console.log(`📧 Found ${accounts.length} configured accounts:`);
    accounts.forEach(acc => {
      console.log(`  ${acc.index}. ${acc.email}`);
    });
    
    if (accounts.length === 0) {
      console.log('❌ No accounts configured. Please check environment variables.');
      console.log('💡 You need to set LINISCO_EMAIL_1, LINISCO_EMAIL_2, etc. with the store accounts');
      return;
    }
    
    // Buscar la cuenta específica para la tienda 10019
    const store10019Account = accounts.find(acc => acc.email.includes('10019'));
    
    if (!store10019Account) {
      console.log('❌ No account found for store 10019');
      console.log('💡 You need to configure an account with email containing "10019"');
      console.log('💡 Example: LINISCO_EMAIL_1=10019@linisco.com.ar');
      return;
    }
    
    console.log(`✅ Found account for store 10019: ${store10019Account.email}`);
    
    // Sincronizar datos históricos para el período específico
    const fromDate = '2024-04-01';
    const toDate = '2024-09-30';
    
    console.log(`🔄 Syncing historical data for store 10019 from ${fromDate} to ${toDate}...`);
    console.log('⏱️ This may take several minutes...');
    
    const result = await performSync(fromDate, toDate, false);
    
    console.log('📊 Sync results:');
    console.log(`  - Total accounts processed: ${result.results.length}`);
    console.log(`  - Successful: ${result.results.filter(r => r.ok).length}`);
    console.log(`  - Failed: ${result.results.filter(r => !r.ok).length}`);
    
    result.results.forEach((accResult, index) => {
      const account = accounts[index];
      if (account) {
        console.log(`  ${account.email}: ${accResult.ok ? '✅ Success' : '❌ Failed'}`);
        if (!accResult.ok && accResult.error) {
          console.log(`    Error: ${accResult.error}`);
        }
        if (accResult.ok && accResult.stats) {
          console.log(`    Orders: ${accResult.stats.orders || 0}`);
          console.log(`    Products: ${accResult.stats.products || 0}`);
        }
      }
    });
    
    // Verificar datos cargados para la tienda 10019
    console.log('\n🔍 Verifying loaded data for store 10019...');
    const isPostgres = process.env.DATABASE_URL ? true : false;
    
    let finalCount;
    if (isPostgres) {
      const result = await dbWrapper.query(`
        SELECT COUNT(*) as count 
        FROM sale_orders 
        WHERE store_id = $1 
        AND date(created_at) >= $2 
        AND date(created_at) <= $3
      `, [10019, fromDate, toDate]);
      finalCount = result[0].count;
    } else {
      const db = getDb();
      const result = db.prepare(`
        SELECT COUNT(*) as count 
        FROM sale_orders 
        WHERE store_id = ? 
        AND date(created_at) >= ? 
        AND date(created_at) <= ?
      `).get(10019, fromDate, toDate);
      finalCount = result.count;
    }
    
    console.log(`📊 Final count for store 10019 (${fromDate} to ${toDate}): ${finalCount} orders`);
    
    if (finalCount > 0) {
      console.log('✅ Historical data sync completed successfully!');
      console.log('🎉 You should now be able to search for store 10019 data in the specified date range');
    } else {
      console.log('❌ No data was loaded for the specified period');
      console.log('💡 This might mean:');
      console.log('  1. The store had no sales during this period');
      console.log('  2. The account credentials are incorrect');
      console.log('  3. The API is not returning data for this period');
    }
    
    console.log('\n📅 Sync completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Historical sync failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar sincronización
syncStore10019Historical();
