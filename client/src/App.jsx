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

function Filters({ fromDate, toDate, setFromDate, setToDate, storeIds, setStoreIds, stores }) {
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
        <button onClick={onLoadHistorical} className="btn btn-primary" title="Cargar datos históricos del año completo">
          📊 Cargar Histórico
        </button>
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

  async function loadAll() {
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
  }

  useEffect(() => {
    if (logged) loadAll()
  }, [logged, fromDate, toDate, storeIds])

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

  // Cargar estado del auto-sync
  useEffect(() => {
    if (!logged) return
    const loadAutoSyncStatus = () => {
      api('/sync/status').then(setAutoSyncStatus).catch(() => {})
    }
    loadAutoSyncStatus()
    const interval = setInterval(loadAutoSyncStatus, 30000) // Cada 30 segundos
    return () => clearInterval(interval)
  }, [logged])

  // Los datos ya fueron cargados durante el build process
  useEffect(() => {
    if (!logged) return
    console.log('ℹ️ Data initialization was completed during build process')
  }, [logged])

  // Polling automático cada 5 minutos
  useEffect(() => {
    if (!logged) return
    
    const pollData = async () => {
      try {
        console.log('🔄 Auto-polling data...')
        await api('/sync/poll', { method: 'POST' })
        await loadAll() // Recargar datos después del polling
        console.log('✅ Auto-polling completed')
      } catch (error) {
        console.error('Auto-polling error:', error)
      }
    }
    
    // Polling inmediato al cargar
    pollData()
    
    // Polling cada 5 minutos
    const interval = setInterval(pollData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [logged, fromDate, toDate, storeIds])


  const onLoadHistorical = async () => {
    try {
      console.log('🔄 Loading historical data...')
      const result = await api('/sync/load-historical', { method: 'POST' })
      console.log('✅ Historical data loaded:', result)
      
      // Recargar datos después de la carga histórica
      await loadAll()
      
      // Mostrar mensaje de éxito
      alert(`Datos históricos cargados exitosamente!\nPeríodo: ${result.fromDate} a ${result.toDate}\nResultado: ${JSON.stringify(result, null, 2)}`)
    } catch (error) {
      console.error('Historical load error:', error)
      alert(`Error al cargar datos históricos: ${error.message}`)
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
      <Filters {...{ fromDate, toDate, setFromDate, setToDate, storeIds, setStoreIds, stores }} />
      
      
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
                <div className="text-muted" style={{ fontSize: 12 }}>Total</div>
                <div className="fw-bold" style={{ fontSize: 28 }}>{fmt.format(overview.totalAmount || 0)}</div>
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


