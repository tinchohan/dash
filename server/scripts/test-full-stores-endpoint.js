#!/usr/bin/env node

import express from 'express';
import { statsRouter } from '../routes/stats.js';
import { getDb, initDatabase } from '../lib/db.js';

async function testFullStoresEndpoint() {
  console.log('🔍 Testing full stores endpoint with Express...');
  console.log('📅 Test started at:', new Date().toISOString());
  
  try {
    // Inicializar la base de datos
    initDatabase();
    
    // Crear una app Express temporal
    const app = express();
    app.use(express.json());
    
    // Mock de autenticación (simular que el usuario está autenticado)
    app.use((req, res, next) => {
      req.user = { email: 'test@test.com' };
      next();
    });
    
    // Usar el router de stats
    app.use('/api/stats', statsRouter);
    
    // Simular una petición al endpoint
    const mockReq = {
      method: 'GET',
      url: '/api/stats/stores',
      user: { email: 'test@test.com' }
    };
    
    const mockRes = {
      json: (data) => {
        console.log('\n📤 Full endpoint response:');
        console.log(JSON.stringify(data, null, 2));
        
        if (data.stores && Array.isArray(data.stores)) {
          console.log(`✅ Response is valid: ${data.stores.length} stores found`);
          data.stores.forEach((store, index) => {
            console.log(`  ${index + 1}. ${store}`);
          });
        } else {
          console.log('❌ Response is invalid - stores array not found');
        }
      },
      status: (code) => ({
        json: (data) => {
          console.log(`❌ Error ${code}:`, data);
        }
      })
    };
    
    // Simular la llamada al endpoint
    console.log('\n📡 Simulating API call to /api/stats/stores...');
    
    // Crear un servidor temporal
    const server = app.listen(0, async () => {
      const port = server.address().port;
      console.log(`🚀 Test server running on port ${port}`);
      
      try {
        // Hacer una petición real al endpoint
        const response = await fetch(`http://localhost:${port}/api/stats/stores`);
        const data = await response.json();
        
        console.log('\n📤 Real API response:');
        console.log(`Status: ${response.status}`);
        console.log(`Data:`, JSON.stringify(data, null, 2));
        
        if (response.ok && data.stores) {
          console.log(`✅ API call successful: ${data.stores.length} stores`);
        } else {
          console.log('❌ API call failed');
        }
        
      } catch (error) {
        console.error('❌ API call error:', error.message);
      } finally {
        server.close();
        console.log('\n📅 Test completed at:', new Date().toISOString());
      }
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Ejecutar test
testFullStoresEndpoint();
