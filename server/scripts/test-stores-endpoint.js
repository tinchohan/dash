#!/usr/bin/env node

import { getDb, initDatabase } from '../lib/db.js';
import { dbWrapper } from '../lib/db-wrapper.js';

async function testStoresEndpoint() {
  console.log('🔍 Testing stores endpoint...');
  console.log('📅 Test started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    initDatabase();
    
    const isPostgres = process.env.DATABASE_URL ? true : false;
    console.log(`🗄️ Database type: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);
    
    // Simular la lógica del endpoint /stats/stores
    console.log('\n📊 1. Testing stores endpoint logic:');
    
    // Siempre devolver todas las tiendas configuradas
    const allStores = ['63953', '66220', '72267', '30036', '30038', '10019', '10020'];
    console.log(`📋 All configured stores: ${allStores.join(', ')}`);
    
    // Obtener las tiendas que tienen datos en la base de datos
    let storesWithData;
    if (isPostgres) {
      const result = await dbWrapper.query('SELECT DISTINCT store_id FROM sale_orders WHERE store_id IS NOT NULL ORDER BY store_id');
      storesWithData = result.map(r => String(r.store_id));
    } else {
      const db = getDb();
      const rows = db.prepare('SELECT DISTINCT store_id FROM sale_orders WHERE store_id IS NOT NULL ORDER BY store_id').all();
      storesWithData = rows.map(r => String(r.store_id));
    }
    
    console.log(`📊 Stores with data: ${storesWithData.join(', ')}`);
    
    // Combinar todas las tiendas
    const combinedStores = [...new Set([...allStores, ...storesWithData])].sort();
    console.log(`📋 Combined stores: ${combinedStores.join(', ')}`);
    
    // Simular la respuesta del endpoint
    const response = { stores: combinedStores };
    console.log('\n📤 Endpoint response:');
    console.log(JSON.stringify(response, null, 2));
    
    // Verificar si hay algún problema con el formato
    console.log('\n🔍 2. Verifying response format:');
    console.log(`Response type: ${typeof response}`);
    console.log(`Stores array type: ${Array.isArray(response.stores)}`);
    console.log(`Stores count: ${response.stores.length}`);
    
    if (response.stores.length === 0) {
      console.log('❌ No stores found - this could be the problem!');
    } else {
      console.log('✅ Stores found successfully');
    }
    
    // Verificar cada tienda individualmente
    console.log('\n🏪 3. Individual store verification:');
    response.stores.forEach((store, index) => {
      console.log(`  ${index + 1}. ${store} (type: ${typeof store})`);
    });
    
    // Verificar si hay tiendas con datos
    console.log('\n📊 4. Checking stores with actual data:');
    for (const storeId of combinedStores) {
      let orderCount;
      if (isPostgres) {
        const result = await dbWrapper.query('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = $1', [Number(storeId)]);
        orderCount = result[0].count;
      } else {
        const db = getDb();
        const result = db.prepare('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = ?').get(Number(storeId));
        orderCount = result.count;
      }
      
      console.log(`  Store ${storeId}: ${orderCount} orders`);
    }
    
    console.log('\n📅 Test completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar test
testStoresEndpoint();
