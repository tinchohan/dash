#!/usr/bin/env node

import { getDb, initDatabase } from '../lib/db.js';

async function checkStore10019_2025() {
  console.log('🔍 Verificando datos de la tienda 10019 para abril-septiembre 2025...');
  console.log('📅 Check started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    initDatabase();
    const db = getDb();
    
    // Verificar datos en el rango específico de 2025
    console.log('\n📊 1. Datos en abril-septiembre 2025:');
    const data2025 = db.prepare(`
      SELECT 
        COUNT(*) as orders_in_range,
        SUM(total_amount) as amount_in_range,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-04-01'
      AND DATE(created_at) <= '2025-09-30'
    `).get();
    
    console.log(`  Órdenes: ${data2025.orders_in_range}`);
    console.log(`  Monto: $${data2025.amount_in_range}`);
    console.log(`  Rango: ${data2025.earliest} a ${data2025.latest}`);
    
    if (data2025.orders_in_range === 0) {
      console.log('❌ NO hay datos para abril-septiembre 2025');
    } else {
      console.log('✅ SÍ hay datos para abril-septiembre 2025');
    }
    
    // Verificar fechas disponibles en 2025
    console.log('\n📅 2. Fechas disponibles en abril-septiembre 2025:');
    const dates2025 = db.prepare(`
      SELECT DISTINCT DATE(created_at) as date, COUNT(*) as count
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-04-01'
      AND DATE(created_at) <= '2025-09-30'
      GROUP BY DATE(created_at)
      ORDER BY date
      LIMIT 10
    `).all();
    
    if (dates2025.length > 0) {
      console.log(`📅 Primeras ${dates2025.length} fechas con datos:`);
      dates2025.forEach(row => {
        console.log(`  ${row.date}: ${row.count} órdenes`);
      });
    } else {
      console.log('❌ No hay fechas con datos en este rango');
    }
    
    // Verificar datos generales de 2025
    console.log('\n📊 3. Datos generales de 2025:');
    const general2025 = db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        MIN(created_at) as first_order,
        MAX(created_at) as last_order
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-01-01'
      AND DATE(created_at) <= '2025-12-31'
    `).get();
    
    console.log(`  Total órdenes en 2025: ${general2025.total_orders}`);
    console.log(`  Primera orden: ${general2025.first_order}`);
    console.log(`  Última orden: ${general2025.last_order}`);
    
    // Verificar datos por mes en 2025
    console.log('\n📅 4. Datos por mes en 2025:');
    const monthlyData = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as orders,
        SUM(total_amount) as total_amount
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-01-01'
      AND DATE(created_at) <= '2025-12-31'
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month
    `).all();
    
    monthlyData.forEach(row => {
      console.log(`  ${row.month}: ${row.orders} órdenes, $${row.total_amount}`);
    });
    
    // Verificar si hay datos en el rango específico que buscas
    console.log('\n🎯 5. Verificación específica del rango 1 abril - 1 septiembre 2025:');
    const specificRange = db.prepare(`
      SELECT 
        COUNT(*) as orders_in_range,
        SUM(total_amount) as amount_in_range,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-04-01'
      AND DATE(created_at) <= '2025-09-01'
    `).get();
    
    console.log(`  Órdenes en el rango específico: ${specificRange.orders_in_range}`);
    console.log(`  Monto en el rango específico: $${specificRange.amount_in_range}`);
    console.log(`  Primera orden: ${specificRange.earliest}`);
    console.log(`  Última orden: ${specificRange.latest}`);
    
    if (specificRange.orders_in_range === 0) {
      console.log('❌ NO hay datos para el rango 1 abril - 1 septiembre 2025');
      
      // Verificar qué datos hay alrededor de esas fechas
      console.log('\n🔍 6. Verificando datos alrededor del rango:');
      
      const beforeRange = db.prepare(`
        SELECT 
          COUNT(*) as orders,
          MAX(created_at) as last_order
        FROM sale_orders 
        WHERE store_id = 10019
        AND DATE(created_at) < '2025-04-01'
        AND DATE(created_at) >= '2025-01-01'
      `).get();
      
      const afterRange = db.prepare(`
        SELECT 
          COUNT(*) as orders,
          MIN(created_at) as first_order
        FROM sale_orders 
        WHERE store_id = 10019
        AND DATE(created_at) > '2025-09-01'
        AND DATE(created_at) <= '2025-12-31'
      `).get();
      
      console.log(`  Antes del rango (enero-marzo 2025): ${beforeRange.orders} órdenes, última: ${beforeRange.last_order}`);
      console.log(`  Después del rango (septiembre-diciembre 2025): ${afterRange.orders} órdenes, primera: ${afterRange.first_order}`);
      
    } else {
      console.log('✅ SÍ hay datos para el rango 1 abril - 1 septiembre 2025');
    }
    
    console.log('\n📅 Check completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar verificación
checkStore10019_2025();
