# 🚀 Guía de Deploy para Render

## 📋 Proceso de Deploy Automatizado

La aplicación ahora incluye un sistema de inicialización de datos que se ejecuta **durante el build process** en Render, antes de que la webapp esté live. Esto evita fallas de la API REST cuando la aplicación ya está en producción.

### 🔧 **Archivos de Configuración:**

1. **`build.sh`** - Script principal de build para Linux/macOS
2. **`build.bat`** - Script alternativo para Windows
3. **`server/scripts/init-data.js`** - Script de inicialización de datos
4. **`render.yaml`** - Configuración de Render actualizada

### 📊 **Proceso de Inicialización:**

Durante el deploy, el sistema:

1. **Instala dependencias** del servidor y cliente
2. **Build del cliente** (React/Vite)
3. **Copia archivos** del cliente al servidor
4. **🔄 INICIALIZA DATOS** - Carga automáticamente todos los datos del año actual
5. **Verifica éxito** - Solo continúa si la carga fue exitosa

### ✅ **Ventajas del Nuevo Sistema:**

- ✅ **Sin fallas de API**: Los datos se cargan antes de que la app esté live
- ✅ **Deploy más rápido**: La app inicia con datos ya cargados
- ✅ **Resistente a deploys**: Cada deploy carga automáticamente los datos
- ✅ **Logs detallados**: Puedes ver el progreso en los logs de Render

### 🔍 **Monitoreo del Deploy:**

En los logs de Render verás:

```
🚀 Starting data initialization for Render deploy...
📊 Initializing database...
🔍 Checking if database needs initial data load...
🔄 Cargando datos históricos del año 2024 (2024-01-01 a 2024-12-31)...
✅ Initial year data loaded for 2024
📊 Accounts processed: 7
✅ Successful accounts: 7/7
🎉 Data initialization completed successfully!
```

### ⚙️ **Configuración en Render:**

El `render.yaml` está configurado para usar:
```yaml
buildCommand: ./build.sh
```

### 🛠️ **Desarrollo Local:**

Para probar el proceso localmente:

```bash
# Ejecutar script de inicialización
cd server
npm run init-data

# O ejecutar el build completo
./build.sh
```

### 📝 **Notas Importantes:**

- Los datos se cargan **una sola vez** durante el build
- Si el build falla, Render no desplegará la aplicación
- Los logs te mostrarán exactamente qué cuentas se procesaron exitosamente
- El sistema es completamente automático y no requiere intervención manual

### 🔄 **Flujo Completo:**

1. **Push a GitHub** → Trigger deploy en Render
2. **Build Process** → Instala dependencias + build cliente
3. **Data Init** → Carga datos del año actual
4. **Deploy** → Aplicación live con datos ya cargados
5. **Polling** → Mantiene datos actualizados cada 5 minutos

¡Tu aplicación ahora es completamente autónoma y resistente a los deploys de Render! 🎉
