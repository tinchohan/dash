import React, { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

const API = import.meta.env.VITE_API_URL || ''
const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
const storeNames = {
  63953: 'Subway Lacroze',
  66220: 'Subway Corrientes',
  72267: 'Subway Ortiz',
  30036: 'Daniel Lacroze',
  30038: 'Daniel Corrientes',
  10019: 'Daniel Ortiz',
  10020: 'Seitu Juramento',
}

// Función helper para formatear fechas
function formatDateTime(dateString) {
  return new Date(dateString).toLocaleString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  })
}

function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires'
  })
}

// Función para generar colores únicos basados en el mes
function getMonthColor(dayString) {
  const date = new Date(dayString)
  const month = date.getMonth()
  const colors = [
    '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57', '#ffc0cb',
    '#ff7c7c', '#87ceeb', '#dda0dd', '#98fb98', '#f0e68c', '#ffb6c1'
  ]
  return colors[month % colors.length]
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    ...opts,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function Login({ onLogged }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ user, pass }) })
      onLogged()
    } catch (e) {
      setError('Error de login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handle} style={{ display: 'grid', gap: 8, maxWidth: 260, margin: '10vh auto' }}>
      <h2>Ingreso</h2>
      <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Usuario" />
      <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Clave" type="password" />
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button disabled={loading}>{loading ? 'Ingresando...' : 'Entrar'}</button>
    </form>
  )
}

function Filters({ fromDate, toDate, setFromDate, setToDate, storeIds, setStoreIds, stores, onLoadHistorical, onUpdateDashboard, onDiagnoseStore, isLoading }) {
  const selected = (storeIds || '').split(',').filter(Boolean)
  const toggle = (id) => {
    const set = new Set(selected)
    if (set.has(String(id))) set.delete(String(id))
    else set.add(String(id))
    setStoreIds(Array.from(set).sort().join(','))
  }
  const selectAll = () => setStoreIds(stores.map(String).join(','))
  const clearAll = () => setStoreIds('')

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <label>Desde</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <label>Hasta</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button 
            onClick={onUpdateDashboard} 
            disabled={isLoading}
            className="btn btn-success" 
            title="Actualizar dashboard con los filtros actuales"
          >
            {isLoading ? '⏳ Actualizando...' : '🔄 Actualizar Dashboard'}
          </button>
          <button onClick={onLoadHistorical} className="btn btn-primary" title="Cargar datos históricos con fechas personalizadas (evita duplicados y órdenes negativas)">
            📊 Cargar Histórico Personalizado
          </button>
          <button onClick={onDiagnoseStore} className="btn btn-info" title="Diagnosticar una tienda específica y verificar disponibilidad de datos">
            🔍 Diagnosticar Tienda
          </button>
        </div>
      </div>
      <div style={{ background: '#fff', padding: 12, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <b>Tiendas</b>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={selectAll}>Todas</button>
            <button onClick={clearAll}>Ninguna</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
          {stores.map((id) => {
            const checked = selected.includes(String(id))
            return (
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(id)}
                  style={{ width: 16, height: 16 }}
                />
                <span>{storeNames[id] || String(id)}</span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [logged, setLogged] = useState(false)
  const [fromDate, setFromDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })
  const [toDate, setToDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })
  const [storeIds, setStoreIds] = useState(() => {
    try {
      return localStorage.getItem('storeIds') || ''
    } catch {
      return ''
    }
  })
  const [overview, setOverview] = useState(null)
  const [byStore, setByStore] = useState([])
  const [daily, setDaily] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [stores, setStores] = useState([])
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'dark' } catch { return 'dark' }
  })
  const [topPage, setTopPage] = useState(0)
  const [autoSyncStatus, setAutoSyncStatus] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [isPolling, setIsPolling] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  async function loadAll() {
    setIsLoading(true)
    try {
      const qs = new URLSearchParams({ fromDate, toDate, storeIds }).toString()
      const recentQs = new URLSearchParams({ storeIds }).toString()
      const [ov, bs, dy, tp, rs] = await Promise.all([
        api(`/stats/overview?${qs}`),
        api(`/stats/by-store?${qs}`),
        api(`/stats/daily?${qs}`),
        api(`/stats/top-products?${qs}`),
        api(`/stats/recent-sales?${recentQs}`), // Sin filtros de fecha para mostrar las más recientes
      ])
      setOverview(ov)
      setByStore(bs.stores)
      setDaily(dy.days)
      setTopProducts(tp.products)
      setRecentSales(rs.recentSales)
    } finally {
      setIsLoading(false)
    }
  }

  // Cargar datos solo al hacer login (no automáticamente al cambiar filtros)
  useEffect(() => {
    if (logged) loadAll()
  }, [logged]) // Solo depende de logged, no de filtros

  useEffect(() => {
    try {
      localStorage.setItem('storeIds', storeIds || '')
    } catch {}
  }, [storeIds])

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-bs-theme', theme)
      localStorage.setItem('theme', theme)
    } catch {}
  }, [theme])

  useEffect(() => {
    if (!logged) return
    api('/stats/stores').then((res) => setStores(res.stores || [])).catch(() => {})
  }, [logged])

  // Cargar estado del auto-sync solo al inicio
  useEffect(() => {
    if (!logged) return
    const loadAutoSyncStatus = () => {
      console.log('📊 Loading auto-sync status...')
      api('/sync/status').then(setAutoSyncStatus).catch(() => {})
    }
    loadAutoSyncStatus() // Solo al inicio, no hay intervalo separado
    console.log('📊 Auto-sync status loaded once on login')
  }, [logged])

  // Los datos ya fueron cargados durante el build process
  useEffect(() => {
    if (!logged) return
    console.log('ℹ️ Data initialization was completed during build process')
  }, [logged])

  // Polling automático cada 30 minutos (solo cuando está logged)
  useEffect(() => {
    if (!logged) return
    
    const pollData = async () => {
      // Evitar múltiples polls simultáneos
      if (isPolling) {
        console.log('⏸️ Polling already in progress, skipping...')
        return
      }
      
      try {
        setIsPolling(true)
        console.log('🔄 Auto-polling data...')
        await api('/sync/poll', { method: 'POST' })
        await loadAll() // Recargar datos después del polling
        
        // Actualizar status después del polling
        console.log('📊 Updating auto-sync status...')
        const status = await api('/sync/status')
        setAutoSyncStatus(status)
        
        console.log('✅ Auto-polling completed')
      } catch (error) {
        console.error('Auto-polling error:', error)
      } finally {
        setIsPolling(false)
      }
    }
    
    // Polling inmediato al cargar
    pollData()
    
    // Polling cada 30 minutos (incluye status update)
    const interval = setInterval(pollData, 30 * 60 * 1000)
    console.log('🔄 Single polling interval started (every 30 minutes) - includes data + status')
    return () => {
      console.log('🛑 Single polling interval cleared')
      clearInterval(interval)
    }
  }, [logged]) // Solo depende de logged, no de fechas


  const onUpdateDashboard = async () => {
    console.log('🔄 Manual dashboard update requested')
    await loadAll()
    console.log('✅ Dashboard updated successfully')
  }

  const onDiagnoseStore = async () => {
    const storeId = prompt('ID de la tienda a diagnosticar:', '10019')
    if (!storeId) return
    
    const fromDate = prompt('Fecha de inicio (YYYY-MM-DD) - opcional:', '2025-04-01')
    const toDate = prompt('Fecha de fin (YYYY-MM-DD) - opcional:', '2025-09-01')
    
    try {
      setIsLoading(true)
      
      let url = `${API}/api/stats/store-diagnosis/${storeId}`
      if (fromDate && toDate) {
        url += `?fromDate=${fromDate}&toDate=${toDate}`
      }
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Mostrar diagnóstico en una ventana emergente
      let message = `🏪 Diagnóstico de Tienda ${storeId}\n\n`
      
      if (!data.exists) {
        message += `❌ La tienda no existe en la base de datos\n\n`
        message += `💡 Recomendaciones:\n`
        data.recommendations.forEach(rec => {
          message += `• ${rec}\n`
        })
      } else {
        message += `✅ Tienda encontrada en la base de datos\n\n`
        message += `📊 Estadísticas generales:\n`
        message += `• Total de órdenes: ${data.generalStats.totalOrders}\n`
        message += `• Monto total: ${fmt.format(data.generalStats.totalAmount)}\n`
        message += `• Primera orden: ${data.generalStats.earliestOrder}\n`
        message += `• Última orden: ${data.generalStats.latestOrder}\n\n`
        
        if (data.dateRangeStats) {
          message += `📅 Datos en el rango especificado (${fromDate} a ${toDate}):\n`
          if (data.dateRangeStats.ordersInRange > 0) {
            message += `• Órdenes: ${data.dateRangeStats.ordersInRange}\n`
            message += `• Monto: ${fmt.format(data.dateRangeStats.amountInRange)}\n`
            message += `• Primera orden en rango: ${data.dateRangeStats.earliestInRange}\n`
            message += `• Última orden en rango: ${data.dateRangeStats.latestInRange}\n`
          } else {
            message += `❌ No hay datos en el rango especificado\n`
          }
        }
        
        message += `\n📅 Fechas disponibles: ${data.totalAvailableDates}\n`
        if (data.availableDates.length > 0) {
          message += `Primeras fechas con datos:\n`
          data.availableDates.slice(0, 5).forEach(date => {
            message += `• ${date.date}: ${date.count} órdenes\n`
          })
        }
      }
      
      alert(message)
      
    } catch (error) {
      console.error('Error diagnosing store:', error)
      alert(`❌ Error al diagnosticar la tienda: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const onLoadHistorical = async () => {
    // Mostrar modal para seleccionar fechas
    const fromDate = prompt('Fecha de inicio (YYYY-MM-DD):', '2024-01-01')
    if (!fromDate) return
    
    const toDate = prompt('Fecha de fin (YYYY-MM-DD):', '2024-12-31')
    if (!toDate) return
    
    // Validar fechas
    const fromDateObj = new Date(fromDate)
    const toDateObj = new Date(toDate)
    
    if (isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
      alert('❌ Fechas inválidas. Por favor usa el formato YYYY-MM-DD')
      return
    }
    
    if (fromDateObj > toDateObj) {
      alert('❌ La fecha de inicio no puede ser mayor que la fecha de fin')
      return
    }
    
    // Confirmar carga
    const confirmLoad = confirm(`¿Cargar datos históricos del ${fromDate} al ${toDate}?\n\nEsto puede tomar varios minutos y evitará duplicados automáticamente.`)
    if (!confirmLoad) return
    
    try {
      console.log(`🔄 Loading historical data from ${fromDate} to ${toDate}...`)
      const result = await api('/sync/load-historical', { 
        method: 'POST',
        body: JSON.stringify({ fromDate, toDate })
      })
      console.log('✅ Historical data loaded:', result)
      
      // Recargar datos después de la carga histórica
      await loadAll()
      
      // Mostrar mensaje de éxito con detalles
      const successMessage = `✅ Datos históricos cargados exitosamente!\n\n` +
        `📅 Período: ${result.fromDate} a ${result.toDate}\n` +
        `🏪 Cuentas procesadas: ${result.results.length}\n` +
        `✅ Cuentas exitosas: ${result.results.filter(r => r.ok).length}\n` +
        `❌ Cuentas fallidas: ${result.results.filter(r => !r.ok).length}\n\n` +
        `📊 Detalles por cuenta:\n${result.results.map(r => 
          r.ok ? `✅ ${r.email}: ${r.counts?.sale_orders || 0} órdenes, ${r.counts?.sale_products || 0} productos` 
          : `❌ ${r.email}: ${r.error}`
        ).join('\n')}`
      
      alert(successMessage)
    } catch (error) {
      console.error('Historical load error:', error)
      alert(`❌ Error al cargar datos históricos: ${error.message}`)
    }
  }

  const onLogout = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch {}
    setLogged(false)
  }

  if (!logged) return <Login onLogged={() => setLogged(true)} />

  // paging for top products (5 per page)
  const pageSize = 5
  const totalPages = Math.max(1, Math.ceil((topProducts?.length || 0) / pageSize))
  const page = Math.min(topPage, totalPages - 1)
  const topSlice = topProducts.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <div className="container py-3">
      <nav className="navbar mb-3 rounded" style={{ boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1">Dash</span>
          <div className="d-flex align-items-center gap-2">
            {autoSyncStatus && (
              <div className="d-flex align-items-center me-2">
                <div className={`badge ${autoSyncStatus.pollingEnabled ? 'bg-success' : 'bg-secondary'} me-1`}>
                  {autoSyncStatus.pollingEnabled ? '🔄 Híbrido' : '⏸️ Manual'}
                </div>
                <div className="d-flex flex-column">
                  {autoSyncStatus.lastPoll && (
                    <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                      Poll: {formatTime(autoSyncStatus.lastPoll)}
                    </small>
                  )}
                  {autoSyncStatus.lastValidation && (
                    <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                      Valid: {formatTime(autoSyncStatus.lastValidation)}
                    </small>
                  )}
                </div>
              </div>
            )}
            <div className="form-check form-switch me-2">
              <input className="form-check-input" type="checkbox" role="switch" id="themeSwitch" checked={theme === 'dark'} onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
              <label className="form-check-label" htmlFor="themeSwitch">{theme === 'dark' ? 'Oscuro' : 'Claro'}</label>
            </div>
            <button className="btn btn-outline-secondary" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </nav>
      <Filters {...{ fromDate, toDate, setFromDate, setToDate, storeIds, setStoreIds, stores, onLoadHistorical, onUpdateDashboard, onDiagnoseStore, isLoading }} />
      
      
      {overview && (
        <div className="row g-3 my-1">
          <div className="col-12 col-sm-6 col-lg-4">
            <div className="card">
              <div className="card-body">
                <div className="text-muted" style={{ fontSize: 12 }}>Pedidos</div>
                <div className="fw-bold" style={{ fontSize: 28 }}>{overview.totalOrders}</div>
              </div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-4">
            <div className="card">
              <div className="card-body">
                <div className="text-muted" style={{ fontSize: 12 }}>Total del Período</div>
                <div className="fw-bold" style={{ fontSize: 28 }}>{fmt.format(overview.totalAmount || 0)}</div>
                {overview.totalOrders > 0 && (
                  <div className="mt-2">
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      Promedio diario: {fmt.format((overview.totalAmount || 0) / Math.max(1, daily?.length || 1))}
                    </div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      Ticket promedio: {fmt.format((overview.totalAmount || 0) / (overview.totalOrders || 1))}
                    </div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      Días con ventas: {daily?.length || 0}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-4">
            <div className="card">
              <div className="card-body">
                <div className="text-muted" style={{ fontSize: 12 }}>Formas de pago (grupos)</div>
                <ul className="mb-0 ps-3">
                  {(overview.paymentGroups || []).map((g) => (
                    <li key={g.group}>{g.group}: {fmt.format(g.total || 0)} ({g.count})</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {recentSales && recentSales.length > 0 && (
        <div className="row g-3 my-1">
          <div className="col-12">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Últimas Ventas</h5>
                <div className="row">
                  {recentSales.map((sale, index) => (
                    <div key={sale.id} className="col-12 col-md-4 mb-3">
                      <div className="card h-100" style={{ border: '1px solid #dee2e6' }}>
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <h6 className="card-title mb-0">
                              {storeNames[sale.store_id] || `Tienda ${sale.store_id}`}
                            </h6>
                            <small className="text-muted">
                              {formatDateTime(sale.created_at)}
                            </small>
                          </div>
                          <div className="mb-2">
                            <strong className="text-success" style={{ fontSize: '1.2rem' }}>
                              {fmt.format(sale.total_amount || 0)}
                            </strong>
                          </div>
                          {sale.main_product && (
                            <div className="mb-2">
                              <small className="text-muted">Producto principal:</small>
                              <div className="fw-bold">{sale.main_product}</div>
                              <small className="text-muted">
                                {sale.main_product_amount ? fmt.format(sale.main_product_amount) : 'N/A'}
                              </small>
                            </div>
                          )}
                          <div className="mt-auto">
                            <span className="badge bg-secondary">
                              {sale.payment_method || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="row g-3 my-1">
        <div className="col-12">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title">Ventas por tienda (participación)</h5>
              <div style={{ height: 420 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byStore.map((s) => ({ name: storeNames[s.store_id] || String(s.store_id), value: Number(s.total || 0) }))}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={160}
                      fill="#8884d8"
                      label={(entry) => {
                        const total = byStore.reduce((a, b) => a + Number(b.total || 0), 0)
                        const pct = total > 0 ? (entry.value / total) * 100 : 0
                        return `${entry.name} ${pct.toFixed(1)}%`
                      }}
                    >
                      {byStore.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={["#8884d8", "#82ca9d", "#ffc658", "#8dd1e1", "#a4de6c", "#d0ed57", "#ffc0cb"][i % 7]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 my-1">
        <div className="col-12">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title">Ventas diarias (monto total)</h5>
              <div style={{ height: 420 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily.map((d) => ({ day: d.day, total: Number(d.total || 0) }))}>
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" name="Total">
                      {daily.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getMonthColor(entry.day)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 my-1">
        <div className="col-12">
          <div className="card h-100">
            <div className="card-body">
              <h5 className="card-title d-flex justify-content-between align-items-center">Top productos
                <small className="text-muted">{page + 1}/{totalPages}</small>
              </h5>
              <ol className="mb-2 ps-3">
                {topSlice.map((p) => (
                  <li key={p.name}>{p.name || 'N/D'} - {fmt.format(p.total || 0)} ({p.qty})</li>
                ))}
              </ol>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setTopPage(Math.max(0, page - 1))}>Anterior</button>
                <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setTopPage(Math.min(totalPages - 1, page + 1))}>Siguiente</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


