# 🗄️ Database Schema Mapping - PostgreSQL

## 📊 Overview

Este documento mapea la estructura completa de la base de datos PostgreSQL utilizada en el sistema de ventas.

## 🏗️ Table Structure

### 1. **sale_orders** - Órdenes de Venta
Tabla principal que almacena todas las órdenes de venta.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NOT NULL | **Primary Key** - ID único de la orden |
| `store_id` | INTEGER | NULL | **Store ID** - Identificador de la tienda (10019, 10020, etc.) |
| `account_email` | VARCHAR(255) | NULL | Email de la cuenta que creó la orden |
| `created_at` | TIMESTAMP | NULL | **Timestamp** - Fecha y hora de creación de la orden |
| `total_amount` | DECIMAL(10,2) | NULL | **Amount** - Monto total de la orden en ARS |
| `payment_method` | VARCHAR(255) | NULL | **Payment** - Método de pago (cash, cc_rappiol, cc_pedidosyaol, etc.) |
| `raw` | JSONB | NULL | **Raw Data** - Datos JSON completos de la API |

**Indexes:**
- `idx_orders_date` - Index on `created_at`

### 2. **sale_products** - Productos de Venta
Tabla que almacena los productos individuales de cada orden.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NOT NULL | **Primary Key** - ID único del producto |
| `order_id` | INTEGER | NULL | **Foreign Key** - Referencia a `sale_orders.id` |
| `store_id` | INTEGER | NULL | **Store ID** - Identificador de la tienda |
| `account_email` | VARCHAR(255) | NULL | Email de la cuenta |
| `created_at` | TIMESTAMP | NULL | **Timestamp** - Fecha y hora de creación |
| `product_name` | VARCHAR(255) | NULL | **Product Name** - Nombre del producto |
| `quantity` | DECIMAL(10,2) | NULL | **Quantity** - Cantidad del producto |
| `total_amount` | DECIMAL(10,2) | NULL | **Amount** - Monto total del producto |
| `raw` | JSONB | NULL | **Raw Data** - Datos JSON completos |

**Indexes:**
- `idx_products_date` - Index on `created_at`

### 3. **psessions** - Sesiones
Tabla que almacena información de sesiones.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NOT NULL | **Primary Key** - ID único de la sesión |
| `store_id` | INTEGER | NULL | **Store ID** - Identificador de la tienda |
| `account_email` | VARCHAR(255) | NULL | Email de la cuenta |
| `created_at` | TIMESTAMP | NULL | **Timestamp** - Fecha y hora de la sesión |
| `raw` | JSONB | NULL | **Raw Data** - Datos JSON completos |

**Indexes:**
- `idx_sessions_date` - Index on `created_at`

### 4. **accounts** - Cuentas
Tabla de configuración de cuentas.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL | NOT NULL | **Primary Key** - ID único de la cuenta |
| `email` | VARCHAR(255) | NOT NULL | **Email** - Email de la cuenta (único) |
| `label` | VARCHAR(255) | NULL | **Label** - Etiqueta descriptiva |

### 5. **stores** - Tiendas
Tabla de configuración de tiendas.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | NOT NULL | **Primary Key** - ID de la tienda |
| `name` | VARCHAR(255) | NULL | **Name** - Nombre de la tienda |

### 6. **sync_state** - Estado de Sincronización
Tabla que mantiene el estado de sincronización por cuenta.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `account_email` | VARCHAR(255) | NOT NULL | **Primary Key** - Email de la cuenta |
| `last_order_id` | INTEGER | NULL | **Last Order ID** - Último ID de orden sincronizado |
| `last_product_id` | INTEGER | NULL | **Last Product ID** - Último ID de producto sincronizado |
| `last_session_id` | INTEGER | NULL | **Last Session ID** - Último ID de sesión sincronizado |
| `last_poll_at` | TIMESTAMP | NULL | **Last Poll** - Última vez que se consultó la API |
| `last_full_sync_at` | TIMESTAMP | NULL | **Last Full Sync** - Última sincronización completa |

## 🔗 Relationships

```
sale_orders (1) ←→ (N) sale_products
    ↓
store_id → stores.id
    ↓
account_email → accounts.email
```

## 🏪 Store IDs Mapping

| Store ID | Store Name | Account Email |
|----------|------------|---------------|
| 63953 | Subway Lacroze | 63953@linisco.com.ar |
| 66220 | Subway Corrientes | 66220@linisco.com.ar |
| 72267 | Subway Ortiz | 72267@linisco.com.ar |
| 30036 | Daniel Lacroze | 30036@linisco.com.ar |
| 30038 | Daniel Corrientes | 30038@linisco.com.ar |
| 10019 | Daniel Ortiz | 10019@linisco.com.ar |
| 10020 | Seitu Juramento | 10020@linisco.com.ar |

## 💰 Payment Methods

| Payment Method | Description | Group |
|----------------|-------------|-------|
| `cash` | Efectivo | Efectivo |
| `cc_pedidosyaft` | PedidosYa Efectivo | Efectivo |
| `cc_rappiol` | Rappi Online | Apps |
| `cc_pedidosyaol` | PedidosYa Online | Apps |
| Others | Otros métodos | Otros |

## 📊 Common Queries

### 1. Obtener todas las tiendas con conteo de órdenes
```sql
SELECT 
  store_id,
  COUNT(*) as order_count,
  SUM(total_amount) as total_amount,
  MIN(created_at) as first_order,
  MAX(created_at) as last_order
FROM sale_orders 
GROUP BY store_id 
ORDER BY order_count DESC;
```

### 2. Ventas diarias para una tienda específica
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as orders,
  SUM(total_amount) as total_amount
FROM sale_orders 
WHERE store_id = 10019
AND DATE(created_at) >= '2024-04-01'
AND DATE(created_at) <= '2024-09-30'
GROUP BY DATE(created_at)
ORDER BY date;
```

### 3. Top productos para una tienda
```sql
SELECT 
  product_name,
  SUM(quantity) as total_quantity,
  SUM(total_amount) as total_amount,
  COUNT(*) as order_count
FROM sale_products 
WHERE store_id = 10019
GROUP BY product_name
ORDER BY total_amount DESC
LIMIT 10;
```

### 4. Desglose por método de pago
```sql
SELECT 
  payment_method,
  COUNT(*) as order_count,
  SUM(total_amount) as total_amount,
  ROUND(AVG(total_amount), 2) as avg_amount
FROM sale_orders 
WHERE store_id = 10019
GROUP BY payment_method
ORDER BY total_amount DESC;
```

### 5. Verificar disponibilidad de datos por rango de fechas
```sql
SELECT 
  store_id,
  COUNT(*) as order_count,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM sale_orders 
WHERE DATE(created_at) >= '2024-04-01'
AND DATE(created_at) <= '2024-09-30'
GROUP BY store_id
ORDER BY order_count DESC;
```

## 🔍 Diagnostic Queries

### Verificar si una tienda tiene datos
```sql
SELECT 
  store_id,
  COUNT(*) as total_orders,
  SUM(total_amount) as total_amount,
  MIN(created_at) as first_order,
  MAX(created_at) as last_order
FROM sale_orders 
WHERE store_id = 10019;
```

### Verificar datos en un rango específico
```sql
SELECT 
  COUNT(*) as orders_in_range,
  SUM(total_amount) as amount_in_range
FROM sale_orders 
WHERE store_id = 10019
AND DATE(created_at) >= '2024-04-01'
AND DATE(created_at) <= '2024-09-30';
```

### Obtener fechas disponibles para una tienda
```sql
SELECT DISTINCT 
  DATE(created_at) as date,
  COUNT(*) as order_count
FROM sale_orders 
WHERE store_id = 10019
GROUP BY DATE(created_at)
ORDER BY date;
```

## 🚀 Performance Tips

1. **Use indexes**: Las consultas por `created_at` son rápidas gracias a los índices
2. **Filter by store_id**: Siempre filtra por `store_id` cuando sea posible
3. **Use DATE() function**: Para agrupar por día, usa `DATE(created_at)`
4. **Limit results**: Usa `LIMIT` para consultas de exploración
5. **JSON queries**: Para consultar datos en `raw`, usa operadores JSON de PostgreSQL

## 📝 Notes

- **Timestamps**: Todos los timestamps están en UTC
- **Amounts**: Todos los montos están en ARS (pesos argentinos)
- **Store IDs**: Son enteros, no strings
- **Raw Data**: Contiene la respuesta completa de la API original
- **Nulls**: Algunos campos pueden ser NULL si no están disponibles en la API
