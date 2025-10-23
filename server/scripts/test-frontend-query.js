#!/usr/bin/env node

import { getDb, initDatabase } from '../lib/db.js';

async function testFrontendQuery() {
  console.log('🔍 Verificando consultas del frontend...');
  console.log('📅 Test started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    initDatabase();
    const db = getDb();
    
    console.log('\n📊 1. Simulando consulta del frontend (by-store endpoint):');
    
    // Simular la consulta que hace el frontend
    const frontendQuery = db.prepare(`
      SELECT 
        store_id,
        COUNT(*) as c,
        SUM(total_amount) as total
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-04-01'
      AND DATE(created_at) <= '2025-09-01'
      GROUP BY store_id
    `).all();
    
    console.log('📊 Resultado de la consulta del frontend:');
    if (frontendQuery.length > 0) {
      frontendQuery.forEach(row => {
        console.log(`  Store ${row.store_id}: ${row.c} órdenes, $${row.total}`);
      });
    } else {
      console.log('❌ No se encontraron resultados');
    }
    
    // Verificar si hay problemas con el formato de fecha
    console.log('\n📅 2. Verificando formato de fechas:');
    const sampleDates = db.prepare(`
      SELECT created_at, DATE(created_at) as date_only
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-04-01'
      AND DATE(created_at) <= '2025-09-01'
      LIMIT 5
    `).all();
    
    console.log('📅 Muestra de fechas:');
    sampleDates.forEach(row => {
      console.log(`  ${row.created_at} -> ${row.date_only}`);
    });
    
    // Verificar la consulta de overview
    console.log('\n📊 3. Simulando consulta de overview:');
    const overviewQuery = db.prepare(`
      SELECT 
        COUNT(*) as c, 
        SUM(total_amount) as total
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-04-01'
      AND DATE(created_at) <= '2025-09-01'
    `).get();
    
    console.log(`📊 Overview: ${overviewQuery.c} órdenes, $${overviewQuery.total}`);
    
    // Verificar la consulta diaria
    console.log('\n📅 4. Simulando consulta diaria:');
    const dailyQuery = db.prepare(`
      SELECT 
        DATE(created_at) as day, 
        COUNT(*) as c, 
        SUM(total_amount) as total
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2025-04-01'
      AND DATE(created_at) <= '2025-09-01'
      GROUP BY DATE(created_at)
      ORDER BY day
      LIMIT 10
    `).all();
    
    console.log('📅 Primeros 10 días:');
    dailyQuery.forEach(row => {
      console.log(`  ${row.day}: ${row.c} órdenes, $${row.total}`);
    });
    
    // Verificar si el problema está en el filtro de tienda
    console.log('\n🔍 5. Verificando filtro de tienda:');
    const allStores = db.prepare(`
      SELECT DISTINCT store_id
      FROM sale_orders 
      WHERE DATE(created_at) >= '2025-04-01'
      AND DATE(created_at) <= '2025-09-01'
      ORDER BY store_id
    `).all();
    
    console.log('🏪 Tiendas con datos en el rango:');
    allStores.forEach(store => {
      console.log(`  ${store.store_id}`);
    });
    
    // Verificar si 10019 está en la lista
    const store10019Exists = allStores.find(s => s.store_id === 10019);
    console.log(`\n🎯 Store 10019 en la lista: ${store10019Exists ? 'SÍ' : 'NO'}`);
    
    console.log('\n📅 Test completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar test
testFrontendQuery();
