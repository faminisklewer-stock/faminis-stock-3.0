import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Grid2X2,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  UserRound,
  Users,
  Wifi,
} from 'lucide-react'
import './App.css'
import { supabase } from './lib/supabase'
import type { Profile } from './lib/supabase'

const navItems = [
  { label: 'Ringkasan', icon: LayoutDashboard },
  { label: 'Kasir', icon: ShoppingCart },
  { label: 'Produk', icon: Package },
  { label: 'Stok', icon: Boxes },
  { label: 'Transfer', icon: Truck, badge: '4' },
  { label: 'Pembelian', icon: ClipboardList },
  { label: 'Laporan', icon: Grid2X2 },
]

const locations = ['Semua lokasi', 'Gudang', 'Live', 'Ruko 1', 'Ruko 2', 'Ruko 3', 'Ruko 4']

type DashboardData = {
  transactions: Array<{ id: string; invoice_no: string; location_id: string; grand_total: number; created_at: string }>
  stock: Array<{ product_id: string; location_id: string; quantity: number }>
  movements: Array<{ id: string; movement_type: string; quantity: number; location_id: string; created_at: string }>
  locations: Array<{ id: string; name: string }>
}

type PosProduct = { id: string; sku: string; name: string; unit: string; stock: number }
type CartItem = PosProduct & { quantity: number; unitPrice: number }

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value)
}

function App() {
  const [sessionReady, setSessionReady] = useState(!supabase)
  const [session, setSession] = useState<{ user: { id: string; email?: string } } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client) return
    let mounted = true
    void client.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      if (data.session) {
        setSession({ user: { id: data.session.user.id, email: data.session.user.email } })
        const { data: userProfile, error } = await client.from('profiles').select('id, full_name, role, location_id, active').eq('id', data.session.user.id).maybeSingle()
        if (mounted && error) setProfileError(`Profile tidak dapat dibaca: ${error.message}`)
        else if (mounted && !userProfile) setProfileError('Login berhasil, tetapi profile user belum dibuat di tabel public.profiles.')
        else if (mounted && userProfile?.active) setProfile(userProfile as Profile)
        else if (mounted) setProfileError('User tidak aktif. Hubungi administrator.')
      }
      setSessionReady(true)
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ? { user: { id: nextSession.user.id, email: nextSession.user.email } } : null)
      if (!nextSession) { setProfile(null); setProfileError('') }
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  if (!sessionReady) return <div className="auth-state"><div className="brand-mark">F</div><p>Memeriksa sesi login...</p></div>
  const client = supabase
  if (!client) return <ConfigurationState />
  if (!session || !profile) return profileError
    ? <ProfileErrorScreen message={profileError} onRetry={() => { window.location.reload() }} onLogout={() => { void client.auth.signOut() }} />
    : <LoginScreen onLogin={async (nextSession) => {
      setSession(nextSession)
      const { data: userProfile, error } = await client.from('profiles').select('id, full_name, role, location_id, active').eq('id', nextSession.user.id).maybeSingle()
      if (error) setProfileError(`Profile tidak dapat dibaca: ${error.message}`)
      else if (!userProfile) setProfileError('Login berhasil, tetapi profile user belum dibuat di tabel public.profiles.')
      else if (!userProfile.active) setProfileError('User tidak aktif. Hubungi administrator.')
      else setProfile(userProfile as Profile)
    }} />

  return <Dashboard profile={profile} onLogout={() => { void client.auth.signOut() }} />
}

function LoginScreen({ onLogin }: { onLogin: (session: { user: { id: string; email?: string } }) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setLoading(true)
    setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !data.session) setError('Login gagal. Periksa email dan password Anda.')
    else onLogin({ user: { id: data.session.user.id, email: data.session.user.email } })
    setLoading(false)
  }

  return <div className="auth-state"><div className="login-card"><div className="brand login-brand"><span className="brand-mark">F</span><span>faminis<span className="brand-dot">.</span></span></div><p className="eyebrow">FAMINIS BAROKAH</p><h1>Selamat datang.</h1><p className="subtitle">Masuk untuk mengelola operasional toko dengan aman.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Kata sandi<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="form-error">{error}</p>}<button className="button button-primary login-submit" disabled={loading}>{loading ? 'Sedang masuk...' : 'Masuk'}</button></form></div></div>
}

function ProfileErrorScreen({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return <div className="auth-state"><div className="login-card"><div className="brand login-brand"><span className="brand-mark">F</span><span>faminis<span className="brand-dot">.</span></span></div><p className="eyebrow">SESI DITEMUKAN</p><h1>Profil belum siap.</h1><p className="subtitle">{message}</p><div className="profile-help"><code>public.profiles</code> harus memiliki row dengan <code>id</code> yang sama dengan user Supabase.</div><div className="login-actions"><button className="button button-primary" onClick={onRetry}>Coba lagi</button><button className="button button-secondary" onClick={onLogout}>Keluar</button></div></div></div>
}

function ConfigurationState() {
  return <div className="auth-state"><div className="login-card"><div className="brand login-brand"><span className="brand-mark">F</span><span>faminis<span className="brand-dot">.</span></span></div><h1>Hubungkan Supabase.</h1><p className="subtitle">Tambahkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY ke .env.local, lalu jalankan ulang server.</p></div></div>
}

function Dashboard({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  const [active, setActive] = useState('Overview')
  const [location, setLocation] = useState('All locations')
  const [query, setQuery] = useState('')
  const [dashboard, setDashboard] = useState<DashboardData>({ transactions: [], stock: [], movements: [], locations: [] })
  const [dashboardState, setDashboardState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let mounted = true
    async function loadDashboard() {
      setDashboardState('loading')
      const [transactions, stock, movements, availableLocations] = await Promise.all([
        client.from('transactions').select('id, invoice_no, location_id, grand_total, created_at').order('created_at', { ascending: false }).limit(100),
        client.from('stocks').select('product_id, location_id, quantity'),
        client.from('stock_movements').select('id, movement_type, quantity, location_id, created_at').order('created_at', { ascending: false }).limit(8),
        client.from('locations').select('id, name').eq('active', true).order('name'),
      ])
      if (!mounted) return
      if (transactions.error || stock.error || movements.error || availableLocations.error) {
        setDashboardState('error')
        return
      }
      setDashboard({ transactions: transactions.data ?? [], stock: stock.data ?? [], movements: movements.data ?? [], locations: availableLocations.data ?? [] })
      setDashboardState('ready')
    }
    void loadDashboard()
    const refresh = () => { void loadDashboard() }
    window.addEventListener('faminis:data-changed', refresh)
    return () => { mounted = false; window.removeEventListener('faminis:data-changed', refresh) }
  }, [profile.id, active])

  const locationId = dashboard.locations.find((item) => item.name === location)?.id
  const visibleTransactions = dashboard.transactions.filter((item) => !locationId || item.location_id === locationId)
  const visibleStock = dashboard.stock.filter((item) => !locationId || item.location_id === locationId)
  const visibleMovements = dashboard.movements.filter((item) => !locationId || item.location_id === locationId)
  const revenue = visibleTransactions.reduce((sum, item) => sum + Number(item.grand_total), 0)
  const itemsSold = visibleMovements.filter((item) => item.movement_type === 'SALE').reduce((sum, item) => sum + Math.abs(item.quantity), 0)
  const lowStock = visibleStock.filter((item) => item.quantity <= 5).length

  const pageTitle = active === 'Ringkasan' ? `Selamat pagi, ${profile.full_name.split(' ')[0]}.` : active

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span><span>faminis<span className="brand-dot">.</span></span></div>
        <div className="workspace-switcher"><span className="workspace-icon"><Store size={16} /></span><span><small>Ruang kerja</small><strong>Faminis Barokah</strong></span><ChevronDown size={15} /></div>
        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">Menu utama</p>
          {navItems.map(({ label, icon: Icon, badge }) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => setActive(label)}><Icon size={18} /><span>{label}</span>{badge && <em>{badge}</em>}</button>)}
          <p className="nav-label nav-label-spaced">Pengaturan</p>
          <button className={`nav-item ${active === 'Pelanggan' ? 'active' : ''}`} onClick={() => setActive('Pelanggan')}><Users size={18} /><span>Pelanggan</span></button>
          <button className={`nav-item ${active === 'Akses tim' ? 'active' : ''}`} onClick={() => setActive('Akses tim')}><UserRound size={18} /><span>Akses tim</span></button>
        </nav>
        <div className="sidebar-bottom"><button className="nav-item"><Settings size={18} /><span>Pengaturan</span></button><div className="sync-card"><div className="sync-line"><span className="live-dot"></span><strong>Sesi aman</strong></div><span>Terhubung ke Supabase</span></div><button className="profile-row" onClick={onLogout}><div className="avatar avatar-brown">{profile.full_name.slice(0, 2).toUpperCase()}</div><span><strong>{profile.full_name}</strong><small>{profile.role}</small></span><ChevronDown size={15} /></button></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Ruang kerja</span><b>/</b><strong>{active}</strong></div><div className="top-actions"><div className="connection"><Wifi size={15} /><span>Online</span></div><button className="icon-button notification" aria-label="Notifikasi"><Bell size={19} /><i></i></button><div className="top-avatar avatar avatar-brown">{profile.full_name.slice(0, 2).toUpperCase()}</div></div></header>
        <div className="page-content">
          {active === 'Kasir' ? <PosView profile={profile} locations={dashboard.locations} /> : active === 'Laporan' ? <ReportsView data={dashboard} /> : active === 'Pembelian' ? <PurchasesView profile={profile} locations={dashboard.locations} /> : <>
          <section className="page-heading"><div><p className="eyebrow">SELASA, 22 SEPTEMBER 2026</p><h1>{pageTitle}</h1><p className="subtitle">Berikut kondisi usaha Anda hari ini.</p></div><div className="heading-actions"><button className="button button-secondary"><ArrowDownToLine size={16} /> Unduh laporan</button><button className="button button-primary"><Plus size={17} /> Transaksi baru</button></div></section>
          <section className="filter-bar"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari produk atau transaksi..." /></div><div className="filter-divider"></div><label className="select-wrap"><span>Lokasi</span><select value={location} onChange={(event) => setLocation(event.target.value)}>{locations.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></label><span className="date-chip">01 Sep - 22 Sep 2026 <ChevronDown size={15} /></span></section>
          {dashboardState === 'error' && <div className="data-error">Data dashboard tidak dapat dimuat dari Supabase. Periksa policy RLS dan coba refresh.</div>}
          <section className="metrics-grid"><MetricCard label="Total omzet" value={dashboardState === 'loading' ? 'Memuat...' : formatCurrency(revenue)} change="Data terbaru" tone="brown" icon={CircleDollarSign} /><MetricCard label="Jumlah transaksi" value={dashboardState === 'loading' ? 'Memuat...' : String(visibleTransactions.length)} change="Data terbaru" tone="green" icon={ShoppingCart} /><MetricCard label="Barang terjual" value={dashboardState === 'loading' ? 'Memuat...' : formatNumber(itemsSold)} change="Data terbaru" tone="orange" icon={Package} /><MetricCard label="Stok menipis" value={dashboardState === 'loading' ? 'Memuat...' : String(lowStock)} change={lowStock ? 'Perlu diperiksa' : 'Stok aman'} tone={lowStock ? 'red' : 'green'} icon={Boxes} /></section>
          <section className="dashboard-grid"><div className="panel chart-panel"><div className="panel-heading"><div><h2>Revenue overview</h2><p>Monthly performance across all locations</p></div><div className="legend"><span><i className="legend-dot revenue"></i>Revenue</span><span><i className="legend-dot orders"></i>Orders</span></div></div><div className="chart"><div className="chart-y"><span>15m</span><span>10m</span><span>5m</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i></i><i></i><i></i><i></i></div><svg viewBox="0 0 700 190" preserveAspectRatio="none" aria-label="Revenue chart"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9c603c" stopOpacity=".22" /><stop offset="100%" stopColor="#9c603c" stopOpacity="0" /></linearGradient></defs><path d="M0,151 C35,144 40,120 72,130 S110,102 145,114 S178,75 215,100 S248,113 286,83 S322,93 356,66 S397,78 431,52 S468,69 504,42 S540,54 574,34 S618,47 650,20 S678,29 700,12 V190 H0Z" fill="url(#fill)" /><path d="M0,151 C35,144 40,120 72,130 S110,102 145,114 S178,75 215,100 S248,113 286,83 S322,93 356,66 S397,78 431,52 S468,69 504,42 S540,54 574,34 S618,47 650,20 S678,29 700,12" fill="none" stroke="#9c603c" strokeWidth="3" strokeLinecap="round" /></svg><div className="chart-x"><span>01 Sep</span><span>05 Sep</span><span>10 Sep</span><span>15 Sep</span><span>20 Sep</span><span>22 Sep</span></div></div></div></div><div className="panel performance-panel"><div className="panel-heading"><div><h2>Location performance</h2><p>Revenue by location</p></div><button className="more-button">•••</button></div><div className="location-list"><LocationBar name="Ruko 3" value="Rp 12.8m" percent="82%" color="brown" /><LocationBar name="Live" value="Rp 10.4m" percent="68%" color="orange" /><LocationBar name="Ruko 1" value="Rp 8.9m" percent="58%" color="blue" /><LocationBar name="Ruko 2" value="Rp 7.6m" percent="50%" color="green" /><LocationBar name="Ruko 4" value="Rp 5.2m" percent="34%" color="purple" /></div><button className="text-button">View full report <ArrowUpRight size={14} /></button></div></section>
          <section className="lower-grid"><div className="panel table-panel"><div className="panel-heading"><div><h2>Recent sales</h2><p>Latest transactions from Supabase</p></div><button className="text-button">View all <ArrowUpRight size={14} /></button></div><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Location</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>{visibleTransactions.filter((sale) => sale.invoice_no.toLowerCase().includes(query.toLowerCase())).slice(0, 6).map((sale) => <tr key={sale.id}><td><strong>{sale.invoice_no}</strong></td><td>{dashboard.locations.find((item) => item.id === sale.location_id)?.name ?? 'Location'}</td><td><strong>{formatCurrency(Number(sale.grand_total))}</strong></td><td>{new Date(sale.created_at).toLocaleDateString('id-ID')}</td><td><span className="status"><i></i>Paid</span></td></tr>)}</tbody></table>{dashboardState === 'ready' && visibleTransactions.length === 0 && <div className="empty-state">Belum ada transaksi pada scope Anda.</div>}</div></div><div className="panel activity-panel"><div className="panel-heading"><div><h2>Activity</h2><p>Latest stock movements</p></div><button className="more-button">•••</button></div><div className="activity-list">{visibleMovements.slice(0, 3).map((movement) => <div className="activity-item" key={movement.id}><div className="activity-icon green"><ArrowDownToLine size={16} /></div><div><strong>{movement.movement_type.replace('_', ' ')}</strong><p>{movement.quantity > 0 ? '+' : ''}{movement.quantity} units</p><small>{new Date(movement.created_at).toLocaleString('id-ID')}</small></div></div>)}</div>{dashboardState === 'ready' && visibleMovements.length === 0 && <div className="empty-state">Belum ada activity.</div>}<button className="text-button">View activity log <ArrowUpRight size={14} /></button></div></section>
          </>}
        </div>
      </main>
    </div>
  )
}

function PosView({ profile, locations }: { profile: Profile; locations: Array<{ id: string; name: string }> }) {
  const [locationId, setLocationId] = useState(profile.location_id ?? locations[0]?.id ?? '')
  const [products, setProducts] = useState<PosProduct[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QRIS' | 'TRANSFER' | 'DEBIT' | 'CREDIT'>('CASH')
  const [paidAmount, setPaidAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const client = supabase

  useEffect(() => {
    if (!locationId && locations[0]?.id) setLocationId(locations[0].id)
  }, [locationId, locations])

  useEffect(() => {
    if (!client || !locationId) return
    let mounted = true
    setLoading(true)
    void client.from('products').select('id, sku, name, unit').eq('active', true).order('name').limit(100).then(async ({ data, error: productError }) => {
      if (!mounted) return
      if (productError) { setError('Produk tidak dapat dimuat dari Supabase.'); setLoading(false); return }
      const productIds = (data ?? []).map((product) => product.id)
      const { data: stocks, error: stockError } = productIds.length ? await client.from('stocks').select('product_id, quantity').eq('location_id', locationId).in('product_id', productIds) : { data: [], error: null }
      if (!mounted) return
      if (stockError) setError('Stok tidak dapat dimuat dari Supabase.')
      const stockMap = new Map((stocks ?? []).map((stock) => [stock.product_id, stock.quantity]))
      setProducts((data ?? []).map((product) => ({ ...product, stock: stockMap.get(product.id) ?? 0 })))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [client, locationId])

  const total = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const filteredProducts = products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase()))
  const canChooseLocation = profile.role === 'MASTER' || profile.role === 'OWNER'

  function addProduct(product: PosProduct) {
    setError('')
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (existing) return current.map((item) => item.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item)
      return [...current, { ...product, quantity: 1, unitPrice: 0 }]
    })
  }

  async function checkout() {
    if (!client || !locationId || !cart.length) return
    const amount = Number(paidAmount)
    if (cart.some((item) => item.unitPrice <= 0)) { setError('Masukkan harga manual untuk setiap produk.'); return }
    if (!Number.isFinite(amount) || amount < total) { setError('Nominal pembayaran belum mencukupi.'); return }
    setCheckoutLoading(true); setError(''); setMessage('')
    const { error: rpcError } = await client.rpc('record_sale', { p_location_id: locationId, p_items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity, unit_price: item.unitPrice })), p_discount: 0, p_method: paymentMethod, p_paid_amount: amount, p_idempotency_key: crypto.randomUUID() })
    setCheckoutLoading(false)
    if (rpcError) { setError(rpcError.message.includes('INSUFFICIENT_STOCK') ? 'Stok tidak mencukupi.' : 'Transaksi gagal disimpan. Periksa koneksi dan coba lagi.'); return }
    setCart([]); setPaidAmount(''); setMessage('Transaksi berhasil disimpan ke Supabase.');
    window.dispatchEvent(new Event('faminis:data-changed'))
  }

  return <section className="pos-page"><div className="pos-toolbar"><div><p className="eyebrow">POINT OF SALE</p><h1>New sale</h1><p className="subtitle">Harga jual dimasukkan manual saat checkout.</p></div><label className="pos-location">Location<select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={!canChooseLocation}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div><div className="pos-layout"><div className="panel product-picker"><div className="filter-search pos-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SKU or product..." /></div>{loading ? <div className="empty-state">Loading products...</div> : <div className="product-grid">{filteredProducts.map((product) => <button className="product-tile" key={product.id} onClick={() => addProduct(product)} disabled={!product.stock}><span className="product-tile-icon"><Package size={18} /></span><strong>{product.name}</strong><small>{product.sku} · {product.stock} {product.unit} available</small></button>)}{!filteredProducts.length && <div className="empty-state">No products found.</div>}</div>}</div><div className="panel cart-panel"><div className="panel-heading"><div><h2>Cart</h2><p>{cart.length} product line{cart.length === 1 ? '' : 's'}</p></div></div><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.id}><div><strong>{item.name}</strong><small><label className="cart-field">Qty<input aria-label={`Quantity for ${item.name}`} type="number" min="1" max={item.stock} value={item.quantity} onChange={(event) => { const nextQuantity = Math.max(1, Math.min(item.stock, Number(event.target.value) || 1)); setCart((current) => current.map((line) => line.id === item.id ? { ...line, quantity: nextQuantity } : line)) }} /></label><span>x</span><input aria-label={`Price for ${item.name}`} type="number" min="0" value={item.unitPrice || ''} onChange={(event) => setCart((current) => current.map((line) => line.id === item.id ? { ...line, unitPrice: Number(event.target.value) } : line))} placeholder="Selling price" /></small></div><button className="remove-line" onClick={() => setCart((current) => current.filter((line) => line.id !== item.id))}>×</button></div>)}{!cart.length && <div className="empty-state">Cart is empty. Select a product to begin.</div>}</div><div className="checkout-box"><div className="total-row"><span>Total</span><strong>{formatCurrency(total)}</strong></div><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>{['CASH', 'QRIS', 'TRANSFER', 'DEBIT', 'CREDIT'].map((method) => <option key={method}>{method}</option>)}</select></label><label>Paid amount<input type="number" min="0" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder="0" /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button className="button button-primary login-submit" onClick={() => void checkout()} disabled={checkoutLoading || !cart.length}>{checkoutLoading ? 'Saving...' : 'Pay and save sale'}</button></div></div></div></section>
}

function ReportsView({ data }: { data: DashboardData }) {
  const [location, setLocation] = useState('all')
  const locationName = (id: string) => data.locations.find((item) => item.id === id)?.name ?? 'Unknown'
  const transactions = data.transactions.filter((item) => location === 'all' || item.location_id === location)
  const revenue = transactions.reduce((sum, item) => sum + Number(item.grand_total), 0)
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">REPORTS</p><h1>Sales report</h1><p className="subtitle">Data langsung dari transaksi Supabase.</p></div><label className="pos-location">Location<select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">All locations</option>{data.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="report-cards"><MetricCard label="Revenue" value={formatCurrency(revenue)} change="Live data" tone="brown" icon={CircleDollarSign} /><MetricCard label="Transactions" value={formatNumber(transactions.length)} change="Live data" tone="green" icon={ShoppingCart} /><MetricCard label="Average sale" value={formatCurrency(transactions.length ? revenue / transactions.length : 0)} change="Calculated" tone="orange" icon={CircleDollarSign} /></div><div className="panel table-panel"><div className="panel-heading"><div><h2>Sales transactions</h2><p>{transactions.length} rows returned</p></div></div><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Location</th><th>Total</th><th>Created</th></tr></thead><tbody>{transactions.map((item) => <tr key={item.id}><td><strong>{item.invoice_no}</strong></td><td>{locationName(item.location_id)}</td><td><strong>{formatCurrency(Number(item.grand_total))}</strong></td><td>{new Date(item.created_at).toLocaleString('id-ID')}</td></tr>)}</tbody></table>{!transactions.length && <div className="empty-state">Belum ada transaksi untuk filter ini.</div>}</div></div></section>
}

function PurchasesView({ profile, locations }: { profile: Profile; locations: Array<{ id: string; name: string }> }) {
  const [locationId, setLocationId] = useState(profile.location_id ?? locations[0]?.id ?? '')
  const [supplier, setSupplier] = useState('')
  const [sku, setSku] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [productId, setProductId] = useState('')
  const [products, setProducts] = useState<Array<{ id: string; sku: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const client = supabase
  const canPurchase = profile.role === 'MASTER' || profile.role === 'WAREHOUSE'

  useEffect(() => {
    if (!client) return
    void client.from('products').select('id, sku, name').eq('active', true).order('name').then(({ data }) => setProducts(data ?? []))
  }, [client])
  useEffect(() => { if (!locationId && locations[0]?.id) setLocationId(locations[0].id) }, [locationId, locations])
  const selectedProduct = products.find((product) => product.id === productId)
  const matches = products.filter((product) => `${product.sku} ${product.name}`.toLowerCase().includes(sku.toLowerCase())).slice(0, 6)

  async function savePurchase() {
    if (!client || !canPurchase) return
    if (!supplier.trim() || !productId || Number(quantity) <= 0) { setError('Supplier, produk, dan quantity wajib diisi.'); return }
    setLoading(true); setError(''); setMessage('')
    const { error: rpcError } = await client.rpc('record_purchase', { p_location_id: locationId, p_supplier: supplier.trim(), p_items: [{ product_id: productId, quantity: Number(quantity) }] })
    setLoading(false)
    if (rpcError) { setError('Purchase gagal disimpan. Pastikan role Anda WAREHOUSE atau MASTER.'); return }
    setMessage('Purchase berhasil disimpan dan stok bertambah.'); setSupplier(''); setSku(''); setProductId(''); setQuantity('1')
  }
  if (!canPurchase) return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">PURCHASES</p><h1>Akses terbatas</h1><p className="subtitle">Hanya MASTER dan WAREHOUSE yang dapat mencatat penerimaan barang.</p></div></div></section>
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">PURCHASES</p><h1>Receive stock</h1><p className="subtitle">Catat barang masuk melalui transaksi database atomic.</p></div><label className="pos-location">Location<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="panel purchase-form"><label>Supplier<input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Nama supplier" /></label><label>Product<input value={selectedProduct ? `${selectedProduct.sku} - ${selectedProduct.name}` : sku} onChange={(event) => { setSku(event.target.value); setProductId('') }} placeholder="Cari SKU atau nama produk" />{sku && !selectedProduct && <div className="suggestions">{matches.map((product) => <button key={product.id} onClick={() => { setProductId(product.id); setSku(product.sku) }}>{product.sku} - {product.name}</button>)}</div>}</label><label>Quantity<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button className="button button-primary" onClick={() => void savePurchase()} disabled={loading}>{loading ? 'Saving...' : 'Save purchase'}</button></div></section>
}

function MetricCard({ label, value, change, tone, icon: Icon }: { label: string; value: string; change: string; tone: string; icon: typeof CircleDollarSign }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><p>{label}</p><strong>{value}</strong><span className={`metric-change ${tone === 'red' ? 'attention' : ''}`}>{tone !== 'red' && <ArrowUpRight size={13} />}{change}</span></article>
}

function LocationBar({ name, value, percent, color }: { name: string; value: string; percent: string; color: string }) {
  return <div className="location-bar"><div><span>{name}</span><strong>{value}</strong></div><div className="progress"><i className={color} style={{ width: percent }}></i></div></div>
}

export default App
