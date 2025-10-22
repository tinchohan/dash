@echo off
REM Script de build para Windows (alternativo)

echo 🚀 Starting build process for Render...

REM Instalar dependencias del servidor
echo 📦 Installing server dependencies...
cd server
call npm install

REM Instalar dependencias del cliente
echo 📦 Installing client dependencies...
cd ..\client
call npm install

REM Build del cliente
echo 🔨 Building client...
call npm run build

REM Copiar archivos del cliente al directorio público del servidor
echo 📁 Copying client files to server public directory...
xcopy /E /I /Y dist\* ..\server\public\

REM Volver al directorio raíz
cd ..

REM Ejecutar script de inicialización de datos
echo 📊 Initializing data during build...
cd server
node scripts/init-data.js

echo ✅ Build process completed successfully!
