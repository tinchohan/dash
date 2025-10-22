#!/bin/bash

# Script PRE-BUILD para Render
# Se ejecuta ANTES del build para cargar datos históricos
# Esto asegura que los datos estén disponibles antes de que la app esté live

set -e  # Exit on any error

echo "🚀 Starting PRE-BUILD data initialization for Render..."
echo "📅 Pre-build started at: $(date)"

# Verificar variables de entorno críticas
echo "🔍 Checking environment variables..."
if [ -z "$LINISCO_EMAIL_1" ]; then
    echo "❌ LINISCO_EMAIL_1 not set"
    exit 1
fi
echo "✅ Environment variables check passed"

# Instalar solo dependencias del servidor para la inicialización
echo "📦 Installing server dependencies for data initialization..."
cd server
npm install --production
echo "✅ Server dependencies installed"

# Ejecutar script de inicialización de datos ANTES del build
echo "📊 Initializing data BEFORE build process..."
echo "🔄 This will load ALL data for the current year from ALL stores..."
echo "⏱️ This may take 5-15 minutes depending on data volume..."

# Ejecutar con timeout extendido para datos históricos
timeout 3600 node scripts/robust-init-data.js || {
    echo "⚠️ Data initialization timed out or failed"
    echo "🔄 Will retry during build process"
    exit 0
}

echo "✅ PRE-BUILD data initialization completed successfully!"

# Verificar datos cargados
echo "📊 Verifying loaded data..."
node -e "
const { getDb } = require('./lib/db.js');
const db = getDb();
const orders = db.prepare('SELECT COUNT(*) as count FROM sale_orders').get().count;
const products = db.prepare('SELECT COUNT(*) as count FROM sale_products').get().count;
const sessions = db.prepare('SELECT COUNT(*) as count FROM psessions').get().count;
console.log(\`📊 Database state after pre-build:\`);
console.log(\`  - Orders: \${orders}\`);
console.log(\`  - Products: \${products}\`);
console.log(\`  - Sessions: \${sessions}\`);
"

echo "🎉 PRE-BUILD process completed successfully!"
echo "📅 Pre-build finished at: $(date)"
