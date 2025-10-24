#!/usr/bin/env node

import { getDb, initDatabase } from '../lib/db.js';

async function testDiagnosisEndpoint() {
  console.log('🔍 Testing store diagnosis endpoint locally...');
  console.log('📅 Test started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    initDatabase();
    const db = getDb();
    
    // Simular la consulta que hace el endpoint
    const storeId = 10019;
    const fromDate = '2025-04-01';
    const toDate = '2025-09-01';
    
    console.log('📊 Testing store diagnosis logic:');
    console.log(`Store ID: ${storeId}`);
    console.log(`Date range: ${fromDate} to ${toDate}`);
    
    // Verificar si la tienda existe
    const storeExists = db.prepare('SELECT COUNT(*) as count FROM sale_orders WHERE store_id = ?').get(storeId);
    console.log(`Store exists: ${storeExists.count > 0}`);
    
    if (storeExists.count > 0) {
      // Obtener estadísticas generales
      const storeStats = db.prepare(`
        SELECT 
          COUNT(*) as totalOrders,
          SUM(total_amount) as totalAmount,
          MIN(created_at) as earliestOrder,
          MAX(created_at) as latestOrder
        FROM sale_orders 
        WHERE store_id = ?
      `).get(storeId);
      
      console.log('📊 Store stats:', storeStats);
      
      // Verificar datos en el rango específico
      const dateRangeStats = db.prepare(`
        SELECT 
          COUNT(*) as ordersInRange,
          SUM(total_amount) as amountInRange,
          MIN(created_at) as earliestInRange,
          MAX(created_at) as latestInRange
        FROM sale_orders 
        WHERE store_id = ? 
        AND DATE(created_at) >= ? 
        AND DATE(created_at) <= ?
      `).get(storeId, fromDate, toDate);
      
      console.log('📅 Date range stats:', dateRangeStats);
      
      // Obtener fechas disponibles
      const availableDates = db.prepare(`
        SELECT DISTINCT DATE(created_at) as date, COUNT(*) as count
        FROM sale_orders 
        WHERE store_id = ?
        GROUP BY DATE(created_at)
        ORDER BY date
        LIMIT 5
      `).all(storeId);
      
      console.log('📅 Available dates (first 5):', availableDates);
      
      // Simular la respuesta del endpoint
      const response = {
        storeId: Number(storeId),
        exists: true,
        generalStats: storeStats,
        dateRangeStats: dateRangeStats,
        availableDates: availableDates,
        totalAvailableDates: availableDates.length,
        requestedRange: { fromDate, toDate }
      };
      
      console.log('\n📤 Simulated endpoint response:');
      console.log(JSON.stringify(response, null, 2));
      
      console.log('✅ Store diagnosis logic works locally');
    } else {
      console.log('❌ Store not found');
    }
    
    console.log('\n📅 Test completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar test
testDiagnosisEndpoint();
