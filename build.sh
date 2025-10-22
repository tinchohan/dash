#!/bin/bash

# Script de build para Render
# Este script se ejecuta durante el deploy para preparar la aplicación

echo "🚀 Starting build process for Render..."

# Instalar dependencias del servidor
echo "📦 Installing server dependencies..."
cd server
npm install

# Instalar dependencias del cliente
echo "📦 Installing client dependencies..."
cd ../client
npm install

# Build del cliente
echo "🔨 Building client..."
npm run build

# Copiar archivos del cliente al directorio público del servidor
echo "📁 Copying client files to server public directory..."
cp -r dist/* ../server/public/

# Volver al directorio raíz
cd ..

# Ejecutar script de inicialización de datos
echo "📊 Initializing data during build..."
cd server
node scripts/init-data.js

echo "✅ Build process completed successfully!"
