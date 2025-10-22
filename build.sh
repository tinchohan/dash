#!/bin/bash

# Script de build para Render
# Este script se ejecuta durante el deploy para preparar la aplicación

set -e  # Exit on any error

echo "🚀 Starting build process for Render..."
echo "📅 Build started at: $(date)"

# Verificar variables de entorno críticas
echo "🔍 Checking environment variables..."
if [ -z "$LINISCO_EMAIL_1" ]; then
    echo "❌ LINISCO_EMAIL_1 not set"
    exit 1
fi
echo "✅ Environment variables check passed"

# Instalar dependencias del servidor
echo "📦 Installing server dependencies..."
cd server
npm install --production
echo "✅ Server dependencies installed"

# Instalar dependencias del cliente
echo "📦 Installing client dependencies..."
cd ../client
npm install
echo "✅ Client dependencies installed"

# Build del cliente
echo "🔨 Building client..."
npm run build
echo "✅ Client build completed"

# Crear directorio público si no existe
echo "📁 Preparing public directory..."
mkdir -p ../server/public

# Copiar archivos del cliente al directorio público del servidor
echo "📁 Copying client files to server public directory..."
cp -r dist/* ../server/public/
echo "✅ Client files copied to server"

# Volver al directorio raíz
cd ..

# Ejecutar script de inicialización de datos
echo "📊 Initializing data during build..."
echo "🔄 This may take several minutes depending on data volume..."
cd server

# Ejecutar con timeout para evitar colgar
timeout 1800 node scripts/init-data.js || {
    echo "⚠️ Data initialization timed out or failed"
    echo "🔄 Continuing with build (data will be loaded on first access)"
    exit 0
}

echo "✅ Data initialization completed successfully!"

# Verificar que el servidor puede iniciar
echo "🔍 Testing server startup..."
timeout 30 node index.js &
SERVER_PID=$!
sleep 5
kill $SERVER_PID 2>/dev/null || true
echo "✅ Server startup test passed"

echo "🎉 Build process completed successfully!"
echo "📅 Build finished at: $(date)"
