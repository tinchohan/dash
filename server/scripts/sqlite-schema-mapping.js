#!/usr/bin/env node

import { getDb, initDatabase } from '../lib/db.js';

async function mapSQLiteSchema() {
  console.log('🗺️ Mapping SQLite Database Schema...');
  console.log('📅 Mapping started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    initDatabase();
    const db = getDb();
    console.log('✅ SQLite connection established');
    
    // 1. Obtener información de todas las tablas
    console.log('\n📊 1. Database Tables Overview:');
    const tables = db.prepare(`
      SELECT name, type 
      FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    
    console.log(`📋 Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`  - ${table.name} (${table.type})`);
    });
    
    // 2. Mapear cada tabla con sus columnas
    console.log('\n📋 2. Detailed Table Schema:');
    
    for (const table of tables) {
      console.log(`\n🏷️ Table: ${table.name}`);
      console.log('─'.repeat(50));
      
      // Obtener información de columnas usando PRAGMA
      const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
      
      console.log(`📊 Columns (${columns.length}):`);
      columns.forEach((col, index) => {
        const nullable = col.notnull === 0 ? 'NULL' : 'NOT NULL';
        const pk = col.pk === 1 ? ' PRIMARY KEY' : '';
        const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
        
        console.log(`  ${index + 1}. ${col.name}: ${col.type} ${nullable}${pk}${defaultVal}`);
      });
      
      // Obtener índices de la tabla
      const indexes = db.prepare(`PRAGMA index_list(${table.name})`).all();
      
      if (indexes.length > 0) {
        console.log(`🔍 Indexes (${indexes.length}):`);
        indexes.forEach(idx => {
          console.log(`  - ${idx.name}: ${idx.unique ? 'UNIQUE' : 'NON-UNIQUE'}`);
        });
      }
      
      // Obtener estadísticas de la tabla
      const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;
      console.log(`📈 Statistics: ${rowCount} rows`);
    }
    
    // 3. Mapear relaciones entre tablas (foreign keys)
    console.log('\n🔗 3. Table Relationships:');
    const foreignKeys = db.prepare(`
      SELECT 
        name,
        sql
      FROM sqlite_master 
      WHERE type='table' 
      AND sql LIKE '%FOREIGN KEY%'
    `).all();
    
    if (foreignKeys.length > 0) {
      console.log(`🔗 Found tables with foreign keys:`);
      foreignKeys.forEach(fk => {
        console.log(`  - ${fk.name}: ${fk.sql}`);
      });
    } else {
      console.log('ℹ️ No explicit foreign key relationships found');
    }
    
    // 4. Crear mapeo específico para las tablas de ventas
    console.log('\n💰 4. Sales Tables Detailed Mapping:');
    
    const salesTables = ['sale_orders', 'sale_products', 'psessions'];
    
    for (const tableName of salesTables) {
      const tableExists = tables.find(t => t.name === tableName);
      if (!tableExists) {
        console.log(`❌ Table ${tableName} not found`);
        continue;
      }
      
      console.log(`\n🏪 ${tableName.toUpperCase()}:`);
      
      // Obtener columnas específicas
      const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
      
      // Mapeo de columnas con descripción
      const columnDescriptions = {
        'sale_orders': {
          'id': 'Primary key - Order ID',
          'store_id': 'Store identifier (10019, 10020, etc.)',
          'account_email': 'Account email that created the order',
          'created_at': 'Order creation timestamp',
          'total_amount': 'Total order amount in ARS',
          'payment_method': 'Payment method (cash, cc_rappiol, etc.)',
          'raw': 'Raw JSON data from API'
        },
        'sale_products': {
          'id': 'Primary key - Product ID',
          'order_id': 'Foreign key to sale_orders.id',
          'store_id': 'Store identifier',
          'account_email': 'Account email',
          'created_at': 'Product creation timestamp',
          'product_name': 'Product name',
          'quantity': 'Product quantity',
          'total_amount': 'Product total amount',
          'raw': 'Raw JSON data from API'
        },
        'psessions': {
          'id': 'Primary key - Session ID',
          'store_id': 'Store identifier',
          'account_email': 'Account email',
          'created_at': 'Session creation timestamp',
          'raw': 'Raw JSON data from API'
        }
      };
      
      columns.forEach(col => {
        const description = columnDescriptions[tableName]?.[col.name] || 'No description available';
        const nullable = col.notnull === 0 ? 'NULL' : 'NOT NULL';
        const pk = col.pk === 1 ? ' PRIMARY KEY' : '';
        console.log(`  • ${col.name} (${col.type} ${nullable}${pk}): ${description}`);
      });
      
      // Obtener muestra de datos
      const sampleData = db.prepare(`
        SELECT * FROM ${tableName} 
        ORDER BY created_at DESC 
        LIMIT 3
      `).all();
      
      console.log(`📊 Sample data (${sampleData.length} rows):`);
      sampleData.forEach((row, index) => {
        console.log(`  Row ${index + 1}:`);
        Object.entries(row).forEach(([key, value]) => {
          if (key === 'raw' && value) {
            console.log(`    ${key}: [JSON data - ${JSON.stringify(value).length} chars]`);
          } else {
            console.log(`    ${key}: ${value}`);
          }
        });
      });
    }
    
    // 5. Crear consultas de ejemplo
    console.log('\n💡 5. Example Queries:');
    
    const exampleQueries = {
      'Get all stores with order counts': `
        SELECT 
          store_id,
          COUNT(*) as order_count,
          SUM(total_amount) as total_amount,
          MIN(created_at) as first_order,
          MAX(created_at) as last_order
        FROM sale_orders 
        GROUP BY store_id 
        ORDER BY order_count DESC
      `,
      'Get daily sales for store 10019 (April-September 2024)': `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as orders,
          SUM(total_amount) as total_amount
        FROM sale_orders 
        WHERE store_id = 10019
        AND DATE(created_at) >= '2024-04-01'
        AND DATE(created_at) <= '2024-09-30'
        GROUP BY DATE(created_at)
        ORDER BY date
      `,
      'Get top products for store 10019': `
        SELECT 
          product_name,
          SUM(quantity) as total_quantity,
          SUM(total_amount) as total_amount,
          COUNT(*) as order_count
        FROM sale_products 
        WHERE store_id = 10019
        GROUP BY product_name
        ORDER BY total_amount DESC
        LIMIT 10
      `,
      'Get payment method breakdown for store 10019': `
        SELECT 
          payment_method,
          COUNT(*) as order_count,
          SUM(total_amount) as total_amount,
          ROUND(AVG(total_amount), 2) as avg_amount
        FROM sale_orders 
        WHERE store_id = 10019
        GROUP BY payment_method
        ORDER BY total_amount DESC
      `,
      'Check data availability for store 10019 in date range': `
        SELECT 
          COUNT(*) as orders_in_range,
          SUM(total_amount) as amount_in_range,
          MIN(created_at) as earliest,
          MAX(created_at) as latest
        FROM sale_orders 
        WHERE store_id = 10019
        AND DATE(created_at) >= '2024-04-01'
        AND DATE(created_at) <= '2024-09-30'
      `
    };
    
    Object.entries(exampleQueries).forEach(([title, query]) => {
      console.log(`\n📝 ${title}:`);
      console.log(query.trim());
    });
    
    // 6. Ejecutar algunas consultas de ejemplo
    console.log('\n🔍 6. Running Example Queries:');
    
    // Consulta 1: Tiendas con conteo de órdenes
    console.log('\n📊 Store order counts:');
    const storeCounts = db.prepare(`
      SELECT 
        store_id,
        COUNT(*) as order_count,
        SUM(total_amount) as total_amount,
        MIN(created_at) as first_order,
        MAX(created_at) as last_order
      FROM sale_orders 
      GROUP BY store_id 
      ORDER BY order_count DESC
    `).all();
    
    storeCounts.forEach(store => {
      console.log(`  Store ${store.store_id}: ${store.order_count} orders, $${store.total_amount} total`);
    });
    
    // Consulta 2: Verificar datos para tienda 10019 en el rango específico
    console.log('\n🔍 Store 10019 data in April-September 2024:');
    const store10019Data = db.prepare(`
      SELECT 
        COUNT(*) as orders_in_range,
        SUM(total_amount) as amount_in_range,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM sale_orders 
      WHERE store_id = 10019
      AND DATE(created_at) >= '2024-04-01'
      AND DATE(created_at) <= '2024-09-30'
    `).get();
    
    if (store10019Data.orders_in_range > 0) {
      console.log(`  ✅ Found ${store10019Data.orders_in_range} orders`);
      console.log(`  💰 Total amount: $${store10019Data.amount_in_range}`);
      console.log(`  📅 Range: ${store10019Data.earliest} to ${store10019Data.latest}`);
    } else {
      console.log(`  ❌ No data found for store 10019 in April-September 2024`);
    }
    
    // Consulta 3: Verificar datos generales para tienda 10019
    console.log('\n📊 Store 10019 general data:');
    const store10019General = db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(total_amount) as total_amount,
        MIN(created_at) as first_order,
        MAX(created_at) as last_order
      FROM sale_orders 
      WHERE store_id = 10019
    `).get();
    
    console.log(`  Total orders: ${store10019General.total_orders}`);
    console.log(`  Total amount: $${store10019General.total_amount}`);
    console.log(`  Date range: ${store10019General.first_order} to ${store10019General.last_order}`);
    
    console.log('\n📅 Schema mapping completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Schema mapping failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar mapeo
mapSQLiteSchema();
