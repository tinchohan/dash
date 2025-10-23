#!/usr/bin/env node

import { dbWrapper } from '../lib/db-wrapper.js';

async function mapDatabaseSchema() {
  console.log('🗺️ Mapping Database Schema...');
  console.log('📅 Mapping started at:', new Date().toISOString());
  
  try {
    const isPostgres = process.env.DATABASE_URL ? true : false;
    console.log(`🗄️ Database type: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);
    
    if (isPostgres) {
      console.log('✅ PostgreSQL connection detected');
    } else {
      console.log('✅ SQLite connection detected');
    }
    
    // 1. Obtener información de todas las tablas
    console.log('\n📊 1. Database Tables Overview:');
    let tables;
    if (isPostgres) {
      tables = await dbWrapper.query(`
        SELECT 
          table_name,
          table_type
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
    } else {
      // SQLite
      const { getDb } = await import('../lib/db.js');
      const db = getDb();
      const tableNames = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all();
      
      tables = tableNames.map(t => ({
        table_name: t.name,
        table_type: 'BASE TABLE'
      }));
    }
    
    console.log(`📋 Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`  - ${table.table_name} (${table.table_type})`);
    });
    
    // 2. Mapear cada tabla con sus columnas
    console.log('\n📋 2. Detailed Table Schema:');
    
    for (const table of tables) {
      console.log(`\n🏷️ Table: ${table.table_name}`);
      console.log('─'.repeat(50));
      
      // Obtener columnas de la tabla
      const columns = await dbWrapper.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          ordinal_position
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [table.table_name]);
      
      console.log(`📊 Columns (${columns.length}):`);
      columns.forEach(col => {
        let typeInfo = col.data_type;
        if (col.character_maximum_length) {
          typeInfo += `(${col.character_maximum_length})`;
        } else if (col.numeric_precision) {
          typeInfo += `(${col.numeric_precision}`;
          if (col.numeric_scale) {
            typeInfo += `,${col.numeric_scale}`;
          }
          typeInfo += ')';
        }
        
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        
        console.log(`  ${col.ordinal_position}. ${col.column_name}: ${typeInfo} ${nullable}${defaultVal}`);
      });
      
      // Obtener índices de la tabla
      const indexes = await dbWrapper.query(`
        SELECT 
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE tablename = $1
        ORDER BY indexname
      `, [table.table_name]);
      
      if (indexes.length > 0) {
        console.log(`🔍 Indexes (${indexes.length}):`);
        indexes.forEach(idx => {
          console.log(`  - ${idx.indexname}: ${idx.indexdef}`);
        });
      }
      
      // Obtener estadísticas de la tabla
      const stats = await dbWrapper.query(`
        SELECT 
          COUNT(*) as row_count,
          pg_size_pretty(pg_total_relation_size($1)) as table_size
      `, [table.table_name]);
      
      if (stats[0]) {
        console.log(`📈 Statistics: ${stats[0].row_count} rows, ${stats[0].table_size} total size`);
      }
    }
    
    // 3. Mapear relaciones entre tablas
    console.log('\n🔗 3. Table Relationships:');
    const foreignKeys = await dbWrapper.query(`
      SELECT 
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, kcu.column_name
    `);
    
    if (foreignKeys.length > 0) {
      console.log(`🔗 Found ${foreignKeys.length} foreign key relationships:`);
      foreignKeys.forEach(fk => {
        console.log(`  ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      });
    } else {
      console.log('ℹ️ No foreign key relationships found');
    }
    
    // 4. Crear mapeo específico para las tablas de ventas
    console.log('\n💰 4. Sales Tables Detailed Mapping:');
    
    const salesTables = ['sale_orders', 'sale_products', 'psessions'];
    
    for (const tableName of salesTables) {
      const tableExists = tables.find(t => t.table_name === tableName);
      if (!tableExists) {
        console.log(`❌ Table ${tableName} not found`);
        continue;
      }
      
      console.log(`\n🏪 ${tableName.toUpperCase()}:`);
      
      // Obtener columnas específicas
      const columns = await dbWrapper.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);
      
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
        const description = columnDescriptions[tableName]?.[col.column_name] || 'No description available';
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        console.log(`  • ${col.column_name} (${col.data_type} ${nullable}): ${description}`);
      });
      
      // Obtener muestra de datos
      const sampleData = await dbWrapper.query(`
        SELECT * FROM ${tableName} 
        ORDER BY created_at DESC 
        LIMIT 3
      `);
      
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
      'Get daily sales for a specific store': `
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
      'Get top products for a store': `
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
      'Get payment method breakdown': `
        SELECT 
          payment_method,
          COUNT(*) as order_count,
          SUM(total_amount) as total_amount,
          ROUND(AVG(total_amount), 2) as avg_amount
        FROM sale_orders 
        WHERE store_id = 10019
        GROUP BY payment_method
        ORDER BY total_amount DESC
      `
    };
    
    Object.entries(exampleQueries).forEach(([title, query]) => {
      console.log(`\n📝 ${title}:`);
      console.log(query.trim());
    });
    
    console.log('\n📅 Schema mapping completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Schema mapping failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar mapeo
mapDatabaseSchema();
