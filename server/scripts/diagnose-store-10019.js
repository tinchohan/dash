#!/usr/bin/env node

import { getDb } from '../lib/db.js';
import { dbWrapper } from '../lib/db-wrapper.js';
import { initDatabase } from '../lib/db.js';

async function diagnoseStore10019() {
  console.log('🔍 Diagnosing store 10019 data availability...');
  console.log('📅 Diagnosis started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    initDatabase();
    
    const isPostgres = process.env.DATABASE_URL ? true : false;
    console.log(`🗄️ Database type: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);
    
    // 1. Verificar si existe la tienda 10019 en la base de datos
    console.log('\n📊 1. Checking if store 10019 exists in database...');
    let storeExists;
    if (isPostgres) {
      const result = await dbWrapper.query('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = $1', [10019]);
      storeExists = result[0].count > 0;
    } else {
      const db = getDb();
      const result = db.prepare('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = ?').get(10019);
      storeExists = result.count > 0;
    }
    
    console.log(`🏪 Store 10019 exists in database: ${storeExists ? 'YES' : 'NO'}`);
    
    if (!storeExists) {
      console.log('❌ Store 10019 has no data in the database');
      console.log('💡 This explains why you get no results for this store');
      return;
    }
    
    // 2. Verificar el rango de fechas específico (1 abril - 30 septiembre)
    console.log('\n📅 2. Checking data for April 1 to September 30...');
    const fromDate = '2024-04-01';
    const toDate = '2024-09-30';
    
    let dateRangeData;
    if (isPostgres) {
      const result = await dbWrapper.query(`
        SELECT COUNT(*) as count, 
               MIN(created_at) as earliest, 
               MAX(created_at) as latest
        FROM sale_orders 
        WHERE store_id = $1 
        AND date(created_at) >= $2 
        AND date(created_at) <= $3
      `, [10019, fromDate, toDate]);
      dateRangeData = result[0];
    } else {
      const db = getDb();
      const result = db.prepare(`
        SELECT COUNT(*) as count, 
               MIN(created_at) as earliest, 
               MAX(created_at) as latest
        FROM sale_orders 
        WHERE store_id = ? 
        AND date(created_at) >= ? 
        AND date(created_at) <= ?
      `).get(10019, fromDate, toDate);
      dateRangeData = result;
    }
    
    console.log(`📊 Orders in date range (${fromDate} to ${toDate}): ${dateRangeData.count}`);
    console.log(`📅 Earliest order: ${dateRangeData.earliest}`);
    console.log(`📅 Latest order: ${dateRangeData.latest}`);
    
    // 3. Verificar todas las fechas disponibles para la tienda 10019
    console.log('\n📅 3. Checking all available dates for store 10019...');
    let allDates;
    if (isPostgres) {
      const result = await dbWrapper.query(`
        SELECT DISTINCT date(created_at) as date, COUNT(*) as count
        FROM sale_orders 
        WHERE store_id = $1
        GROUP BY date(created_at)
        ORDER BY date(created_at)
      `, [10019]);
      allDates = result;
    } else {
      const db = getDb();
      const result = db.prepare(`
        SELECT DISTINCT date(created_at) as date, COUNT(*) as count
        FROM sale_orders 
        WHERE store_id = ?
        GROUP BY date(created_at)
        ORDER BY date(created_at)
      `).all(10019);
      allDates = result;
    }
    
    console.log(`📊 Total unique dates with data: ${allDates.length}`);
    console.log('📅 Available dates:');
    allDates.slice(0, 10).forEach(row => {
      console.log(`  - ${row.date}: ${row.count} orders`);
    });
    if (allDates.length > 10) {
      console.log(`  ... and ${allDates.length - 10} more dates`);
    }
    
    // 4. Verificar si hay datos en el rango específico
    const hasDataInRange = dateRangeData.count > 0;
    console.log(`\n🎯 Result: ${hasDataInRange ? 'YES' : 'NO'} data found for store 10019 from April 1 to September 30`);
    
    if (!hasDataInRange) {
      console.log('\n💡 Possible reasons:');
      console.log('1. Store 10019 might not have had sales during this period');
      console.log('2. Data might not have been synced for this specific date range');
      console.log('3. Store 10019 might have been inactive during this period');
      console.log('4. There might be an issue with the historical data sync for this store');
      
      // Verificar si hay datos antes y después del rango
      console.log('\n🔍 Checking data before and after the specified range...');
      
      let beforeRange, afterRange;
      if (isPostgres) {
        const [beforeResult, afterResult] = await Promise.all([
          dbWrapper.query('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = $1 AND date(created_at) < $2', [10019, fromDate]),
          dbWrapper.query('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = $1 AND date(created_at) > $2', [10019, toDate])
        ]);
        beforeRange = beforeResult[0].count;
        afterRange = afterResult[0].count;
      } else {
        const db = getDb();
        beforeRange = db.prepare('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = ? AND date(created_at) < ?').get(10019, fromDate).count;
        afterRange = db.prepare('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = ? AND date(created_at) > ?').get(10019, toDate).count;
      }
      
      console.log(`📊 Orders before ${fromDate}: ${beforeRange}`);
      console.log(`📊 Orders after ${toDate}: ${afterRange}`);
      
      if (beforeRange > 0 || afterRange > 0) {
        console.log('✅ Store 10019 has data outside the specified range, so the store is active');
        console.log('💡 The issue is specifically with the April-September 2024 period');
      } else {
        console.log('❌ Store 10019 has no data at all in the database');
        console.log('💡 This suggests the store might not be properly configured or synced');
      }
    }
    
    // 5. Verificar configuración de cuentas
    console.log('\n🔧 5. Checking account configuration...');
    const accounts = [];
    for (let i = 1; i <= 10; i++) {
      const email = process.env[`LINISCO_EMAIL_${i}`];
      if (email) {
        accounts.push({ index: i, email });
      }
    }
    
    console.log(`📧 Configured accounts: ${accounts.length}`);
    accounts.forEach(acc => {
      console.log(`  ${acc.index}. ${acc.email}`);
    });
    
    // Verificar si alguna cuenta corresponde a la tienda 10019
    const store10019Account = accounts.find(acc => acc.email.includes('10019'));
    if (store10019Account) {
      console.log(`✅ Found account for store 10019: ${store10019Account.email}`);
    } else {
      console.log('❌ No account found for store 10019');
      console.log('💡 This might explain why there\'s no data for this store');
    }
    
    console.log('\n📅 Diagnosis completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar diagnóstico
diagnoseStore10019();
