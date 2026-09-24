import { Component, useCallback, useEffect, useState } from 'react'
import type { ErrorInfo, FormEvent, ReactNode } from 'react'
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

type DashboardData = {
  transactions: Array<{ id: string; invoice_no: string; location_id: string; grand_total: number; created_at: string }>
  transactionItems: Array<{ transaction_id: string; product_id: string; quantity: number }>
  products: Array<{ id: string; name: string }>
  stock: Array<{ product_id: string; location_id: string; quantity: number }>
  movements: Array<{ id: string; movement_type: string; quantity: number; location_id: string; created_at: string }>
  locations: Array<{ id: string; name: string }>
  transfers: Array<{ id: string; source_location_id: string; destination_location_id: string; status: string; notes: string | null; created_at: string; requested_by: string | null }>
  transferItems: Array<{ id: string; transfer_id: string; product_id: string; shipped_quantity: number; received_quantity: number | null; discrepancy_reason: string | null }>
  purchases: Array<{ id: string; supplier_name: string | null; location_id: string; created_at: string; created_by: string | null }>
  purchaseItems: Array<{ id: string; receipt_id: string; product_id: string; quantity: number; purchase_cost: number | null }>
}

type PosProduct = { id: string; sku: string; name: string; unit: string; stock: number; category_id?: string | null; category_name?: string | null }
type CartItem = PosProduct & { quantity: number; unitPrice: number }
type LocationOption = { id: string; name: string }
type CategoryRecord = { id: string; name: string; active: boolean }
type ProductRecord = { id: string; sku: string; name: string; unit: string; variant: string | null; active: boolean; category_id: string | null; category_name?: string | null }
type StockRecord = { product_id: string; location_id: string; quantity: number }
type StockRow = StockRecord & { product?: ProductRecord }
type TransferRecord = { id: string; source_location_id: string; destination_location_id: string; status: string; notes: string | null; created_at: string; requested_by: string | null }
type TransferItemRecord = { id: string; transfer_id: string; product_id: string; shipped_quantity: number; received_quantity: number | null; discrepancy_reason: string | null }

const PRODUCT_CATEGORY_PREFIXES: Record<string, string> = {
  Mukena: 'MKN',
  Sarung: 'SRG',
  Sajadah: 'SJD',
  Daster: 'DST',
  'Busana Wanita': 'BSW',
  'Busana Pria': 'BSP',
}

const APPROVED_CATEGORY_NAMES = Object.keys(PRODUCT_CATEGORY_PREFIXES) as Array<keyof typeof PRODUCT_CATEGORY_PREFIXES>

function normalizeCategoryName(name: string | null | undefined): string {
  const value = (name ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const aliasMap: Record<string, string> = {
    mukena: 'Mukena',
    sarung: 'Sarung',
    sajadah: 'Sajadah',
    daster: 'Daster',
    'busana wanita': 'Busana Wanita',
    'busanawanita': 'Busana Wanita',
    'busana pria': 'Busana Pria',
    'busanapria': 'Busana Pria',
  }
  return aliasMap[value] ?? APPROVED_CATEGORY_NAMES.find((approved) => normalizeCategoryName(approved).toLowerCase() === value) ?? ''
}

function getCategoryPrefix(categoryName: string | null | undefined) {
  const canonical = normalizeCategoryName(categoryName)
  if (!canonical) return ''
  return PRODUCT_CATEGORY_PREFIXES[canonical] ?? ''
}

function isApprovedSku(sku: string | null | undefined) {
  const normalizedSku = (sku ?? '').trim().toUpperCase()
  if (!normalizedSku) return false
  const prefix = normalizedSku.split('-')[0]
  return Object.values(PRODUCT_CATEGORY_PREFIXES).includes(prefix)
}

function filterApprovedProducts<T extends { sku?: string | null }>(products: T[]) {
  return products.filter((product) => isApprovedSku(product.sku ?? null))
}

function getApprovedCategoryList(categories: CategoryRecord[]) {
  const normalized = categories
    .map((category) => {
      const canonicalName = normalizeCategoryName(category.name)
      return canonicalName ? { ...category, name: canonicalName } : null
    })
    .filter((category): category is CategoryRecord => Boolean(category))

  return Array.from(new Map(normalized.map((category) => [category.id, category])).values())
}

function isValidCategorySku(sku: string, categoryName: string | null | undefined) {
  const normalizedSku = sku.trim().toUpperCase()
  const prefix = getCategoryPrefix(categoryName)
  if (!normalizedSku || !prefix) return true
  return new RegExp(`^${prefix}-[A-Z0-9]+$`).test(normalizedSku)
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render error', error, info)
  }

  render() {
    if (this.state.hasError) {
      return <div className="auth-state"><div className="login-card"><div className="brand login-brand"><span className="brand-mark">F</span><span>faminis<span className="brand-dot">.</span></span></div><h1>Kasir perlu dimuat ulang.</h1><p className="subtitle">Data produk tidak dapat ditampilkan. Muat ulang halaman lalu coba lagi.</p><button className="button button-primary" type="button" onClick={() => window.location.reload()}>Muat ulang</button></div></div>
    }
    return this.props.children
  }
}

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

  return <AppErrorBoundary><Dashboard profile={profile} onLogout={() => { void client.auth.signOut() }} /></AppErrorBoundary>
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
  const [dashboard, setDashboard] = useState<DashboardData>({
    transactions: [],
    transactionItems: [],
    products: [],
    stock: [],
    movements: [],
    locations: [],
    transfers: [],
    transferItems: [],
    purchases: [],
    purchaseItems: [],
  })
  const [dashboardState, setDashboardState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let mounted = true
    async function loadDashboard() {
      setDashboardState('loading')
      const [
        transactionsResult,
        transactionItemsResult,
        productsResult,
        stockResult,
        movementsResult,
        availableLocationsResult,
        transfersResult,
        transferItemsResult,
        purchasesResult,
        purchaseItemsResult,
      ] = await Promise.allSettled([
        client.from('transactions').select('id, invoice_no, location_id, grand_total, created_at').order('created_at', { ascending: false }).limit(100),
        client.from('transaction_items').select('transaction_id, product_id, quantity').order('transaction_id'),
        client.from('products').select('id, name').eq('active', true).order('name'),
        client.from('stocks').select('product_id, location_id, quantity'),
        client.from('stock_movements').select('id, movement_type, quantity, location_id, created_at').order('created_at', { ascending: false }).limit(8),
        client.from('locations').select('id, name').eq('active', true).order('name'),
        client.from('stock_transfers').select('id, source_location_id, destination_location_id, status, notes, created_at, requested_by').order('created_at', { ascending: false }).limit(100),
        client.from('stock_transfer_items').select('id, transfer_id, product_id, shipped_quantity, received_quantity, discrepancy_reason'),
        client.from('purchase_receipts').select('id, supplier_name, location_id, created_at, created_by').order('created_at', { ascending: false }).limit(100),
        client.from('purchase_receipt_items').select('id, receipt_id, product_id, quantity, purchase_cost'),
      ])
      if (!mounted) return

      const transactions = transactionsResult.status === 'fulfilled' ? (transactionsResult.value.data ?? []) : []
      const transactionItems = transactionItemsResult.status === 'fulfilled' ? (transactionItemsResult.value.data ?? []) : []
      const products = productsResult.status === 'fulfilled' ? (productsResult.value.data ?? []) : []
      const stock = stockResult.status === 'fulfilled' ? (stockResult.value.data ?? []) : []
      const movements = movementsResult.status === 'fulfilled' ? (movementsResult.value.data ?? []) : []
      const availableLocations = availableLocationsResult.status === 'fulfilled' ? (availableLocationsResult.value.data ?? []) : []
      const transfers = transfersResult.status === 'fulfilled' ? (transfersResult.value.data ?? []) : []
      const transferItems = transferItemsResult.status === 'fulfilled' ? (transferItemsResult.value.data ?? []) : []
      const purchases = purchasesResult.status === 'fulfilled' ? (purchasesResult.value.data ?? []) : []
      const purchaseItems = purchaseItemsResult.status === 'fulfilled' ? (purchaseItemsResult.value.data ?? []) : []

      const hasCriticalData = transactions.length || products.length || availableLocations.length || stock.length
      const hadAnyError = [
        transactionsResult,
        transactionItemsResult,
        productsResult,
        stockResult,
        movementsResult,
        availableLocationsResult,
        transfersResult,
        transferItemsResult,
        purchasesResult,
        purchaseItemsResult,
      ].some((result) => result.status === 'rejected' || (result.status === 'fulfilled' && result.value?.error))

      if (!mounted) return
      if (!hasCriticalData && hadAnyError) {
        setDashboardState('error')
        return
      }

      setDashboard({
        transactions,
        transactionItems,
        products,
        stock,
        movements,
        locations: availableLocations,
        transfers,
        transferItems,
        purchases,
        purchaseItems,
      })
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
  const overviewLocations = [{ id: 'all', name: 'All locations' }, ...dashboard.locations]
  const locationRevenue = overviewLocations
    .filter((item) => item.id !== 'all')
    .map((item) => {
      const total = dashboard.transactions.filter((entry) => entry.location_id === item.id).reduce((sum, entry) => sum + Number(entry.grand_total), 0)
      return { ...item, total }
    })
    .sort((left, right) => right.total - left.total)
  const maxLocationRevenue = Math.max(...locationRevenue.map((item) => item.total), 1)
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const key = date.toISOString().slice(0, 10)
    const total = dashboard.transactions
      .filter((entry) => new Date(entry.created_at).toISOString().slice(0, 10) === key)
      .reduce((sum, entry) => sum + Number(entry.grand_total), 0)
    return {
      label: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }).replace('.', '').replace('.', ''),
      total,
    }
  })
  const maxChartRevenue = Math.max(...lastSevenDays.map((item) => item.total), 1)
  const chartPoints = lastSevenDays.map((item, index) => {
    const x = 18 + (index / Math.max(lastSevenDays.length - 1, 1)) * 660
    const y = 165 - (item.total / maxChartRevenue) * 115
    return `${index === 0 ? 'M' : 'L'}${x},${y}`
  }).join(' ')
  const chartFill = `${chartPoints} L660,190 L18,190 Z`

  function getOperationalReportData(scope: 'all' | 'selected' = 'all') {
    const allLocationIds = dashboard.locations.map((item) => item.id)
    const selectedScopeLocationIds = location === 'All locations'
      ? allLocationIds
      : [dashboard.locations.find((item) => item.name === location)?.id].filter(Boolean) as string[]
    const scopeLocationIds = (profile.role === 'MASTER' || profile.role === 'OWNER')
      ? (scope === 'selected' ? selectedScopeLocationIds : allLocationIds)
      : [profile.location_id].filter(Boolean) as string[]
    const productName = (productId: string) => dashboard.products.find((product) => product.id === productId)?.name ?? 'Produk'
    const locationName = (locationId: string | null | undefined) => dashboard.locations.find((item) => item.id === locationId)?.name ?? 'Unknown'
    const formatTransferId = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase()

    const salesRows = dashboard.transactions
      .filter((item) => scopeLocationIds.includes(item.location_id))
      .flatMap((item) => {
        const details = dashboard.transactionItems.filter((entry) => entry.transaction_id === item.id)
        if (!details.length) {
          return [{
            invoice_no: item.invoice_no,
            location: locationName(item.location_id),
            product_name: 'Produk',
            quantity: 0,
            grand_total: Number(item.grand_total),
            created_at: new Date(item.created_at).toISOString(),
            payment_status: 'PAID',
          }]
        }
        return details.map((entry) => ({
          invoice_no: item.invoice_no,
          location: locationName(item.location_id),
          product_name: productName(entry.product_id),
          quantity: Number(entry.quantity),
          grand_total: Number(item.grand_total),
          created_at: new Date(item.created_at).toISOString(),
          payment_status: 'PAID',
        }))
      })

    const transferRows = dashboard.transfers
      .filter((item) => scopeLocationIds.includes(item.source_location_id) || scopeLocationIds.includes(item.destination_location_id))
      .flatMap((item) => {
        const details = dashboard.transferItems.filter((entry) => entry.transfer_id === item.id)
        if (!details.length) {
          return [{
            transfer_id: formatTransferId(item.id),
            source: locationName(item.source_location_id),
            destination: locationName(item.destination_location_id),
            status: item.status,
            product_name: 'Produk',
            shipped_quantity: 0,
            received_quantity: 0,
            notes: item.notes ?? '',
            created_at: new Date(item.created_at).toISOString(),
          }]
        }
        return details.map((entry) => ({
          transfer_id: formatTransferId(item.id),
          source: locationName(item.source_location_id),
          destination: locationName(item.destination_location_id),
          status: item.status,
          product_name: productName(entry.product_id),
          shipped_quantity: Number(entry.shipped_quantity ?? 0),
          received_quantity: Number(entry.received_quantity ?? 0),
          notes: item.notes ?? '',
          created_at: new Date(item.created_at).toISOString(),
        }))
      })

    const purchaseRows = dashboard.purchases
      .filter((item) => scopeLocationIds.includes(item.location_id))
      .flatMap((item) => {
        const details = dashboard.purchaseItems.filter((entry) => entry.receipt_id === item.id)
        if (!details.length) {
          return [{
            supplier: item.supplier_name ?? 'Unknown',
            location: locationName(item.location_id),
            product_name: 'Produk',
            quantity: 0,
            created_at: new Date(item.created_at).toISOString(),
          }]
        }
        return details.map((entry) => ({
          supplier: item.supplier_name ?? 'Unknown',
          location: locationName(item.location_id),
          product_name: productName(entry.product_id),
          quantity: Number(entry.quantity),
          created_at: new Date(item.created_at).toISOString(),
        }))
      })

    const stockMap = new Map<string, number>()
    for (const item of dashboard.stock.filter((entry) => scopeLocationIds.includes(entry.location_id))) {
      stockMap.set(`${item.location_id}:${item.product_id}`, Number(item.quantity))
    }
    const stockRows = scopeLocationIds.flatMap((locationId) => dashboard.products.map((product) => ({
      product: productName(product.id),
      location: locationName(locationId),
      quantity: Number(stockMap.get(`${locationId}:${product.id}`) ?? 0),
    })))
      .sort((left, right) => left.location.localeCompare(right.location) || left.product.localeCompare(right.product))

    const movementRows = dashboard.movements
      .filter((item) => scopeLocationIds.includes(item.location_id))
      .map((item) => ({
        movement_type: item.movement_type,
        location: locationName(item.location_id),
        quantity: Number(item.quantity),
        created_at: new Date(item.created_at).toISOString(),
      }))

    return {
      scopeLocationIds,
      locationName,
      salesRows,
      transferRows,
      purchaseRows,
      stockRows,
      movementRows,
      summary: {
        role: profile.role,
        locationScope: scopeLocationIds.length ? scopeLocationIds.map((id) => locationName(id)).join(' | ') : 'Tidak ada lokasi',
        totalRevenue: salesRows.reduce((sum, item) => sum + Number(item.grand_total), 0),
        totalTransactions: salesRows.length,
        totalTransfers: transferRows.length,
        totalPurchases: purchaseRows.length,
        lowStockCount: stockRows.filter((item) => item.quantity <= 5).length,
        totalStock: stockRows.reduce((sum, item) => sum + item.quantity, 0),
      },
    }
  }

  function downloadCsvReport(scope: 'all' | 'selected' = 'all') {
    const report = getOperationalReportData(scope)
    const csvData = [
      ['Laporan', 'Operasional Faminis'],
      ['Role user', report.summary.role],
      ['Batas lokasi', report.summary.locationScope],
      ['Total omzet', formatCurrency(report.summary.totalRevenue)],
      ['Jumlah transaksi', String(report.summary.totalTransactions)],
      ['Jumlah transfer', String(report.summary.totalTransfers)],
      ['Jumlah pembelian', String(report.summary.totalPurchases)],
      ['Jumlah stok menipis', String(report.summary.lowStockCount)],
      ['Total stok tersedia', String(report.summary.totalStock)],
      ['Tanggal export', new Date().toLocaleString('id-ID')],
      [],
      ['SALES'],
      ['invoice_no', 'location', 'product_name', 'quantity', 'grand_total', 'created_at', 'payment_status'],
      ...report.salesRows.map((row) => [row.invoice_no, row.location, row.product_name, row.quantity, row.grand_total, row.created_at, row.payment_status]),
      [],
      ['TRANSFERS'],
      ['transfer_id', 'source', 'destination', 'status', 'product_name', 'shipped_quantity', 'received_quantity', 'notes', 'created_at'],
      ...report.transferRows.map((row) => [row.transfer_id, row.source, row.destination, row.status, row.product_name, row.shipped_quantity, row.received_quantity, row.notes, row.created_at]),
      [],
      ['PURCHASES'],
      ['supplier', 'location', 'product_name', 'quantity', 'created_at'],
      ...report.purchaseRows.map((row) => [row.supplier, row.location, row.product_name, row.quantity, row.created_at]),
      [],
      ['STOCK'],
      ['location', 'product', 'quantity'],
      ...report.stockRows.map((row) => [row.location, row.product, row.quantity]),
      [],
      ['MOVEMENTS'],
      ['movement_type', 'location', 'quantity', 'created_at'],
      ...report.movementRows.map((row) => [row.movement_type, row.location, row.quantity, row.created_at]),
    ]

    const csvRows = csvData
      .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    if (!csvRows.trim()) return

    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `laporan-operasional-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function downloadPdfReport(scope: 'all' | 'selected' = 'all') {
    const report = getOperationalReportData(scope)
    const tableRows = (rows: Array<{ [key: string]: string | number }>, headers: string[]) => `
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${headers.map((header) => `<td>${row[header] ?? '-'}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `

    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) return

    const locationChartRows = locationRevenue.length
      ? locationRevenue.slice(0, 6).map((item) => {
        const percent = Math.max(8, (item.total / Math.max(...locationRevenue.map((entry) => entry.total), 1)) * 100)
        return `
          <div class="chart-row">
            <div class="chart-meta"><span>${item.name}</span><strong>${formatCurrency(item.total)}</strong></div>
            <div class="chart-track"><i style="width:${percent}%"></i></div>
          </div>
        `
      }).join('')
      : '<div class="empty-note">Belum ada data untuk chart lokasi.</div>'

    const summaryHtml = `
      <div class="summary-shell">
        <div class="summary-box">
          <div><strong>Role</strong><span>${report.summary.role}</span></div>
          <div><strong>Lokasi</strong><span>${report.summary.locationScope}</span></div>
          <div><strong>Omzet</strong><span>${formatCurrency(report.summary.totalRevenue)}</span></div>
          <div><strong>Transaksi</strong><span>${report.summary.totalTransactions}</span></div>
          <div><strong>Transfer</strong><span>${report.summary.totalTransfers}</span></div>
          <div><strong>Pembelian</strong><span>${report.summary.totalPurchases}</span></div>
        </div>
        <div class="chart-card">
          <div class="card-title">
            <span>Revenue by location</span>
            <strong>${formatCurrency(Math.max(...locationRevenue.map((item) => item.total), 0))}</strong>
          </div>
          ${locationChartRows}
        </div>
      </div>
    `

    const stockSections = Object.entries(report.stockRows.reduce((groups, row) => {
      const key = row.location
      groups[key] ??= []
      groups[key].push(row)
      return groups
    }, {} as Record<string, typeof report.stockRows>)).map(([location, rows]) => `
      <div class="location-group">
        <h3>${location}</h3>
        <table>
          <thead>
            <tr><th>Produk</th><th>Qty</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr><td>${row.product}</td><td>${row.quantity}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `).join('') || '<div class="empty-note">Belum ada data stok.</div>'

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Laporan Operasional Faminis</title>
        <style>
          :root {
            --bg: #f7f1ee;
            --panel: #fffaf7;
            --border: #e7d8cf;
            --brand: #5d3423;
            --brand-soft: #f0e1d9;
            --text: #231a17;
            --muted: #665752;
            --accent: #8d5b45;
            --success: #2d6b4f;
          }
          * { box-sizing: border-box; }
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            margin: 32px;
            background: linear-gradient(180deg, #f8f3f0 0%, #fff 100%);
            color: var(--text);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: end;
            border-bottom: 2px solid var(--brand-soft);
            padding-bottom: 18px;
            margin-bottom: 18px;
          }
          .brand-mark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            border-radius: 12px;
            background: var(--brand);
            color: white;
            font-weight: 700;
            margin-right: 12px;
          }
          h1 {
            margin: 0;
            font-size: 30px;
            letter-spacing: 0.02em;
          }
          .subtitle {
            color: var(--muted);
            margin-top: 8px;
            font-size: 13px;
          }
          .date-badge {
            background: var(--brand-soft);
            color: var(--brand);
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 600;
          }
          .summary-shell {
            display: grid;
            grid-template-columns: 1.6fr 1fr;
            gap: 18px;
            margin: 24px 0 28px;
          }
          .summary-box {
            display: grid;
            grid-template-columns: repeat(3, minmax(120px, 1fr));
            gap: 12px;
          }
          .summary-box div {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 12px 14px;
            box-shadow: 0 8px 18px rgba(93, 52, 35, 0.04);
          }
          .summary-box strong {
            display: block;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
            margin-bottom: 6px;
          }
          .summary-box span {
            font-size: 15px;
            font-weight: 700;
            color: var(--brand);
          }
          .chart-card {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 14px 16px;
            box-shadow: 0 8px 18px rgba(93, 52, 35, 0.04);
          }
          .card-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: var(--muted);
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .card-title strong {
            color: var(--brand);
            font-size: 15px;
            letter-spacing: 0;
            text-transform: none;
          }
          .chart-row {
            margin-top: 10px;
          }
          .chart-meta {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 11px;
            margin-bottom: 5px;
            color: var(--text);
          }
          .chart-track {
            width: 100%;
            height: 10px;
            border-radius: 999px;
            background: #f4e8e2;
            overflow: hidden;
          }
          .chart-track i {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #7d4a38, #b57d5f);
          }
          section {
            margin-top: 22px;
            page-break-inside: avoid;
          }
          h2 {
            font-size: 18px;
            margin: 0 0 10px;
            color: var(--brand);
          }
          .location-group {
            margin-top: 12px;
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
            background: white;
          }
          .location-group h3 {
            background: var(--brand-soft);
            color: var(--brand);
            margin: 0;
            padding: 10px 12px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 12px;
            background: white;
            border: 1px solid var(--border);
            border-radius: 10px;
            overflow: hidden;
          }
          th, td {
            border-bottom: 1px solid var(--border);
            padding: 9px 10px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: var(--brand-soft);
            color: var(--brand);
            font-weight: 700;
          }
          tbody tr:nth-child(even) {
            background: #fcf5f2;
          }
          .empty-note {
            padding: 12px 0;
            color: var(--muted);
          }
          @media print {
            body { margin: 16px; }
            section { margin-top: 18px; }
            .summary-shell { grid-template-columns: 1.5fr 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display:flex; align-items:center;">
            <div class="brand-mark">F</div>
            <div>
              <h1>Laporan Operasional</h1>
              <div class="subtitle">Faminis Barokah</div>
            </div>
          </div>
          <div class="date-badge">${new Date().toLocaleString('id-ID')}</div>
        </div>
        ${summaryHtml}
        <section>
          <h2>Penjualan</h2>
          ${tableRows(report.salesRows.map((row) => ({
            invoice_no: row.invoice_no,
            location: row.location,
            product_name: row.product_name,
            quantity: row.quantity,
            grand_total: formatCurrency(Number(row.grand_total)),
            created_at: new Date(row.created_at).toLocaleString('id-ID'),
          })), ['invoice_no', 'location', 'product_name', 'quantity', 'grand_total', 'created_at'])}
        </section>
        <section>
          <h2>Transfer</h2>
          ${tableRows(report.transferRows.map((row) => ({
            transfer_id: row.transfer_id,
            source: row.source,
            destination: row.destination,
            status: row.status,
            product_name: row.product_name,
            shipped_quantity: row.shipped_quantity,
            received_quantity: row.received_quantity,
            created_at: new Date(row.created_at).toLocaleString('id-ID'),
          })), ['transfer_id', 'source', 'destination', 'status', 'product_name', 'shipped_quantity', 'received_quantity', 'created_at'])}
        </section>
        <section>
          <h2>Pembelian</h2>
          ${tableRows(report.purchaseRows.map((row) => ({
            supplier: row.supplier,
            location: row.location,
            product_name: row.product_name,
            quantity: row.quantity,
            created_at: new Date(row.created_at).toLocaleString('id-ID'),
          })), ['supplier', 'location', 'product_name', 'quantity', 'created_at'])}
        </section>
        <section>
          <h2>Stok per lokasi</h2>
          ${stockSections}
        </section>
        <section>
          <h2>Pergerakan stok</h2>
          ${tableRows(report.movementRows.map((row) => ({
            movement_type: row.movement_type,
            location: row.location,
            quantity: row.quantity,
            created_at: new Date(row.created_at).toLocaleString('id-ID'),
          })), ['movement_type', 'location', 'quantity', 'created_at'])}
        </section>
      </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    printWindow.close()
  }

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
          {active === 'Kasir' ? <PosView profile={profile} locations={dashboard.locations} /> : active === 'Produk' ? <ProductsView profile={profile} /> : active === 'Stok' ? <StockView profile={profile} locations={dashboard.locations} /> : active === 'Transfer' ? <TransfersView profile={profile} locations={dashboard.locations} /> : active === 'Laporan' ? <ReportsView data={dashboard} onDownloadCsv={() => downloadCsvReport('all')} onDownloadPdf={() => downloadPdfReport('all')} /> : active === 'Pembelian' ? <PurchasesView profile={profile} locations={dashboard.locations} /> : <>
          <section className="page-heading"><div><p className="eyebrow">SELASA, 22 SEPTEMBER 2026</p><h1>{pageTitle}</h1><p className="subtitle">Berikut kondisi usaha Anda hari ini.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => downloadCsvReport('all')}><ArrowDownToLine size={16} /> CSV</button><button className="button button-secondary" onClick={() => downloadPdfReport('all')}><ArrowDownToLine size={16} /> PDF</button><button className="button button-primary" onClick={() => setActive('Kasir')}><Plus size={17} /> Transaksi baru</button></div></section>
          <section className="filter-bar"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari produk atau transaksi..." /></div><div className="filter-divider"></div><label className="select-wrap"><span>Lokasi</span><select value={location} onChange={(event) => setLocation(event.target.value)}>{overviewLocations.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><ChevronDown size={15} /></label><span className="date-chip">{dashboard.transactions.length ? `${new Date(Math.min(...dashboard.transactions.map((entry) => new Date(entry.created_at).getTime()))).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} - ${new Date(Math.max(...dashboard.transactions.map((entry) => new Date(entry.created_at).getTime()))).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}` : 'Belum ada data'} <ChevronDown size={15} /></span></section>
          {dashboardState === 'error' && <div className="data-error">Data dashboard tidak dapat dimuat dari Supabase. Periksa policy RLS dan coba refresh.</div>}
          <section className="metrics-grid"><MetricCard label="Total omzet" value={dashboardState === 'loading' ? 'Memuat...' : formatCurrency(revenue)} change="Data terbaru" tone="brown" icon={CircleDollarSign} /><MetricCard label="Jumlah transaksi" value={dashboardState === 'loading' ? 'Memuat...' : String(visibleTransactions.length)} change="Data terbaru" tone="green" icon={ShoppingCart} /><MetricCard label="Barang terjual" value={dashboardState === 'loading' ? 'Memuat...' : formatNumber(itemsSold)} change="Data terbaru" tone="orange" icon={Package} /><MetricCard label="Stok menipis" value={dashboardState === 'loading' ? 'Memuat...' : String(lowStock)} change={lowStock ? 'Perlu diperiksa' : 'Stok aman'} tone={lowStock ? 'red' : 'green'} icon={Boxes} /></section>
          <section className="dashboard-grid"><div className="panel chart-panel"><div className="panel-heading"><div><h2>Revenue overview</h2><p>Monthly performance across all locations</p></div><div className="legend"><span><i className="legend-dot revenue"></i>Revenue</span><span><i className="legend-dot orders"></i>Orders</span></div></div><div className="chart dynamic-chart"><div className="chart-y"><span>{formatCurrency(maxChartRevenue)}</span><span>{formatCurrency(maxChartRevenue * .66)}</span><span>{formatCurrency(maxChartRevenue * .33)}</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i></i><i></i><i></i><i></i></div><svg viewBox="0 0 700 190" preserveAspectRatio="none" aria-label="Revenue chart"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9c603c" stopOpacity=".22" /><stop offset="100%" stopColor="#9c603c" stopOpacity="0" /></linearGradient></defs><path d={chartFill} fill="url(#fill)" /><path d={chartPoints} fill="none" stroke="#9c603c" strokeWidth="3" strokeLinecap="round" /></svg><div className="chart-x">{lastSevenDays.map((item) => <span key={item.label}>{item.label}</span>)}</div></div></div><div className="chart" style={{ display: 'none' }}><div className="chart-y"><span>15m</span><span>10m</span><span>5m</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i></i><i></i><i></i><i></i></div><svg viewBox="0 0 700 190" preserveAspectRatio="none" aria-label="Revenue chart"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9c603c" stopOpacity=".22" /><stop offset="100%" stopColor="#9c603c" stopOpacity="0" /></linearGradient></defs><path d="M0,151 C35,144 40,120 72,130 S110,102 145,114 S178,75 215,100 S248,113 286,83 S322,93 356,66 S397,78 431,52 S468,69 504,42 S540,54 574,34 S618,47 650,20 S678,29 700,12 V190 H0Z" fill="url(#fill)" /><path d="M0,151 C35,144 40,120 72,130 S110,102 145,114 S178,75 215,100 S248,113 286,83 S322,93 356,66 S397,78 431,52 S468,69 504,42 S540,54 574,34 S618,47 650,20 S678,29 700,12" fill="none" stroke="#9c603c" strokeWidth="3" strokeLinecap="round" /></svg><div className="chart-x"><span>01 Sep</span><span>05 Sep</span><span>10 Sep</span><span>15 Sep</span><span>20 Sep</span><span>22 Sep</span></div></div></div></div><div className="panel performance-panel"><div className="panel-heading"><div><h2>Location performance</h2><p>Revenue by location</p></div><button className="more-button">•••</button></div><div className="location-list dynamic-location-list">{locationRevenue.map((item, index) => <LocationBar key={item.id} name={item.name} value={formatCurrency(item.total)} percent={`${Math.max(18, (item.total / maxLocationRevenue) * 100)}%`} color={index % 2 === 0 ? 'brown' : index % 3 === 0 ? 'orange' : 'green'} />)}</div><div className="location-list" style={{ display: 'none' }}><LocationBar name="Ruko 3" value="Rp 12.8m" percent="82%" color="brown" /><LocationBar name="Live" value="Rp 10.4m" percent="68%" color="orange" /><LocationBar name="Ruko 1" value="Rp 8.9m" percent="58%" color="blue" /><LocationBar name="Ruko 2" value="Rp 7.6m" percent="50%" color="green" /><LocationBar name="Ruko 4" value="Rp 5.2m" percent="34%" color="purple" /></div><button className="text-button">View full report <ArrowUpRight size={14} /></button></div></section>
          <section className="lower-grid"><div className="panel table-panel"><div className="panel-heading"><div><h2>Recent sales</h2><p>Latest transactions from Supabase</p></div><button className="text-button" onClick={() => setActive('Laporan')}>View all <ArrowUpRight size={14} /></button></div><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Location</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>{visibleTransactions.filter((sale) => sale.invoice_no.toLowerCase().includes(query.toLowerCase())).slice(0, 6).map((sale) => <tr key={sale.id}><td><strong>{sale.invoice_no}</strong></td><td>{dashboard.locations.find((item) => item.id === sale.location_id)?.name ?? 'Location'}</td><td><strong>{formatCurrency(Number(sale.grand_total))}</strong></td><td>{new Date(sale.created_at).toLocaleDateString('id-ID')}</td><td><span className="status"><i></i>Paid</span></td></tr>)}</tbody></table>{dashboardState === 'ready' && visibleTransactions.length === 0 && <div className="empty-state">Belum ada transaksi pada scope Anda.</div>}</div></div><div className="panel activity-panel"><div className="panel-heading"><div><h2>Activity</h2><p>Latest stock movements</p></div><button className="more-button" onClick={() => setActive('Stok')}>•••</button></div><div className="activity-list">{visibleMovements.slice(0, 3).map((movement) => <div className="activity-item" key={movement.id}><div className="activity-icon green"><ArrowDownToLine size={16} /></div><div><strong>{movement.movement_type.replace('_', ' ')}</strong><p>{movement.quantity > 0 ? '+' : ''}{movement.quantity} units</p><small>{new Date(movement.created_at).toLocaleString('id-ID')}</small></div></div>)}</div>{dashboardState === 'ready' && visibleMovements.length === 0 && <div className="empty-state">Belum ada activity.</div>}<button className="text-button" onClick={() => setActive('Stok')}>View activity log <ArrowUpRight size={14} /></button></div></section>
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

  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')

  useEffect(() => {
    if (!locationId && locations[0]?.id) setLocationId(locations[0].id)
  }, [locationId, locations])

  useEffect(() => {
    if (!client) return
    let mounted = true
    void client.from('categories').select('id, name, active').eq('active', true).order('name').then(({ data, error }) => {
      if (!mounted) return
      if (!error) {
        const approvedCategories = getApprovedCategoryList((data ?? []) as CategoryRecord[])
        setCategories(approvedCategories)
      }
    })
    return () => { mounted = false }
  }, [client])

  useEffect(() => {
    if (!client || !locationId) return
    let mounted = true
    setLoading(true)
    void client.from('products').select('id, sku, name, unit, category_id').eq('active', true).order('name').limit(100).then(async ({ data, error: productError }) => {
      if (!mounted) return
      if (productError) { setError('Produk tidak dapat dimuat dari Supabase.'); setLoading(false); return }
      const productIds = (data ?? []).map((product) => product.id)
      const { data: stocks, error: stockError } = productIds.length ? await client.from('stocks').select('product_id, quantity').eq('location_id', locationId).in('product_id', productIds) : { data: [], error: null }
      if (!mounted) return
      if (stockError) setError('Stok tidak dapat dimuat dari Supabase.')
      const stockMap = new Map((stocks ?? []).map((stock) => [stock.product_id, stock.quantity]))
      const categoryNameMap = new Map((categories ?? []).map((category) => [category.id, category.name]))
      const approvedProducts = filterApprovedProducts(data ?? [])
      setProducts(approvedProducts.map((product) => ({ ...product, stock: stockMap.get(product.id) ?? 0, category_name: categoryNameMap.get(product.category_id ?? '') ?? null })))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [categories, client, locationId])

  const total = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategoryId === 'all' || product.category_id === selectedCategoryId
    const matchesText = `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesText
  })
  const canChooseLocation = profile.role === 'MASTER' || profile.role === 'OWNER'

  function addProduct(product: PosProduct) {
    if (!product.id || !Number.isFinite(product.stock) || product.stock <= 0) {
      setError('Produk ini tidak memiliki stok yang valid pada lokasi yang dipilih.')
      return
    }
    setError('')
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (existing) {
        return current.map((item) => item.id === product.id
          ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
          : item)
      }
      return [...current, {
        id: product.id,
        sku: product.sku ?? '',
        name: product.name ?? 'Produk tanpa nama',
        unit: product.unit ?? 'pcs',
        stock: product.stock,
        quantity: 1,
        unitPrice: 0,
      }]
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

  return <section className="pos-page"><div className="pos-toolbar"><div><p className="eyebrow">POINT OF SALE</p><h1>New sale</h1><p className="subtitle">Harga jual dimasukkan manual saat checkout.</p></div><label className="pos-location">Location<select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={!canChooseLocation}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div><div className="pos-layout"><div className="panel product-picker"><div className="filter-search pos-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari SKU atau produk..." /></div><div className="category-pills" aria-label="Filter kategori produk">{[{ id: 'all', name: 'Semua' }, ...categories].map((category) => <button key={category.id} type="button" className={`category-pill ${selectedCategoryId === category.id ? 'active' : ''}`} onClick={() => setSelectedCategoryId(category.id)}>{category.name}</button>)}</div>{loading ? <div className="empty-state">Loading products...</div> : <div className="product-grid">{filteredProducts.map((product) => <button type="button" className="product-tile" key={product.id} onClick={() => addProduct(product)} disabled={!product.stock}><span className="product-tile-icon"><Package size={18} /></span><strong>{product.name}</strong><small>{product.sku} · {product.category_name ?? 'Tanpa kategori'} · {product.stock} {product.unit} tersedia</small></button>)}{!filteredProducts.length && <div className="empty-state">No products found.</div>}</div>}</div><div className="panel cart-panel"><div className="panel-heading"><div><h2>Cart</h2><p>{cart.length} product line{cart.length === 1 ? '' : 's'}</p></div></div><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.id}><div><strong>{item.name}</strong><small><label className="cart-field">Qty<input aria-label={`Quantity for ${item.name}`} type="number" min="1" max={item.stock} value={item.quantity} onChange={(event) => { const nextQuantity = Math.max(1, Math.min(item.stock, Number(event.target.value) || 1)); setCart((current) => current.map((line) => line.id === item.id ? { ...line, quantity: nextQuantity } : line)) }} /></label><span>x</span><input aria-label={`Price for ${item.name}`} type="number" min="0" value={item.unitPrice || ''} onChange={(event) => setCart((current) => current.map((line) => line.id === item.id ? { ...line, unitPrice: Number(event.target.value) } : line))} placeholder="Selling price" /></small></div><button type="button" className="remove-line" onClick={() => setCart((current) => current.filter((line) => line.id !== item.id))}>×</button></div>)}{!cart.length && <div className="empty-state">Cart is empty. Select a product to begin.</div>}</div><div className="checkout-box"><div className="total-row"><span>Total</span><strong>{formatCurrency(total)}</strong></div><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>{['CASH', 'QRIS', 'TRANSFER', 'DEBIT', 'CREDIT'].map((method) => <option key={method}>{method}</option>)}</select></label><label>Paid amount<input type="number" min="0" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder="0" /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button type="button" className="button button-primary login-submit" onClick={() => void checkout()} disabled={checkoutLoading || !cart.length}>{checkoutLoading ? 'Saving...' : 'Pay and save sale'}</button></div></div></div></section>
}

function ProductsView({ profile }: { profile: Profile }) {
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [query, setQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [variant, setVariant] = useState('')
  const [unit, setUnit] = useState('pcs')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const client = supabase
  const canManage = profile.role === 'MASTER'

  async function loadCategories() {
    if (!client) return
    const { data, error: categoryError } = await client.from('categories').select('id, name, active').eq('active', true).order('name')
    if (!categoryError) {
      const nextCategories = getApprovedCategoryList((data ?? []) as CategoryRecord[])
      setCategories(nextCategories)
      setSelectedCategoryId((current) => {
        if (current && nextCategories.some((category) => category.id === current)) return current
        return nextCategories[0]?.id ?? ''
      })
    }
  }

  async function loadProducts() {
    if (!client) return
    setLoading(true)
    const { data, error: loadError } = await client.from('products').select('id, sku, name, unit, variant, active, category_id').order('name')
    if (loadError) setError('Produk tidak dapat dimuat dari Supabase.')
    else setProducts(filterApprovedProducts((data ?? []) as ProductRecord[]))
    setLoading(false)
  }

  useEffect(() => { void loadCategories(); void loadProducts() }, [client])

  async function saveProduct(event: FormEvent) {
    event.preventDefault()
    if (!client || !canManage) return
    if (!selectedCategoryId) { setError('Pilih kategori produk terlebih dahulu.'); return }
    const selectedCategory = categories.find((category) => category.id === selectedCategoryId)
    if (!sku.trim() || !name.trim() || !unit.trim()) { setError('SKU, nama, dan unit wajib diisi.'); return }
    const normalizedSku = sku.trim().toUpperCase()
    if (!isValidCategorySku(normalizedSku, selectedCategory?.name ?? null)) { setError(`SKU harus diawali dengan ${getCategoryPrefix(selectedCategory?.name ?? null)}- dan memakai format baru yang benar.`); return }
    setSaving(true); setError(''); setMessage('')
    const { error: saveError } = await client.from('products').insert({ sku: normalizedSku, name: name.trim(), category_id: selectedCategoryId, variant: variant.trim() || null, unit: unit.trim() })
    setSaving(false)
    if (saveError) { setError(saveError.message.includes('duplicate') ? 'SKU sudah digunakan.' : 'Produk gagal disimpan.'); return }
    setSku(''); setName(''); setVariant(''); setUnit('pcs'); setMessage('Produk berhasil dibuat.'); void loadProducts()
  }

  async function toggleProduct(product: ProductRecord) {
    if (!client || !canManage) return
    const { error: updateError } = await client.from('products').update({ active: !product.active }).eq('id', product.id)
    if (updateError) setError('Status produk gagal diubah.')
    else void loadProducts()
  }

  const filtered = products.filter((product) => {
    const matchesCategory = !selectedCategoryId || product.category_id === selectedCategoryId
    const matchesQuery = `${product.sku} ${product.name} ${product.variant ?? ''}`.toLowerCase().includes(query.toLowerCase())
    return matchesCategory && matchesQuery
  })
  if (!canManage) return <AccessRestricted title="Produk" message="Hanya MASTER yang dapat mengelola katalog produk." />
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">PRODUCT CATALOG</p><h1>Produk</h1><p className="subtitle">Kelola katalog tanpa menyimpan harga jual permanen.</p></div></div><div className="operation-grid"><form className="panel operation-form" onSubmit={saveProduct}><div className="panel-heading"><div><h2>Tambah produk</h2><p>Harga dimasukkan saat transaksi kasir.</p></div></div><label>Kategori<select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>SKU<input value={sku} onChange={(event) => setSku(event.target.value.toUpperCase())} placeholder="MKN-PRM" /></label><label>Nama produk<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mukena Premium" /></label><label>Varian<input value={variant} onChange={(event) => setVariant(event.target.value)} placeholder="Premium / Polos / Batik" /></label><label>Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="pcs" /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan produk'}</button></form><div className="panel table-panel"><div className="panel-heading"><div><h2>Daftar produk</h2><p>{products.length} produk terdaftar</p></div><input className="table-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari SKU atau nama" /></div><div className="category-pills compact" aria-label="Filter daftar produk">{categories.map((category) => <button key={category.id} type="button" className={`category-pill ${selectedCategoryId === category.id ? 'active' : ''}`} onClick={() => setSelectedCategoryId((current) => current === category.id ? '' : category.id)}>{category.name}</button>)}</div>{loading ? <div className="empty-state">Memuat produk...</div> : <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Nama</th><th>Kategori</th><th>Varian</th><th>Unit</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map((product) => <tr key={product.id}><td><strong>{product.sku}</strong></td><td>{product.name}</td><td>{categories.find((category) => category.id === product.category_id)?.name ?? 'Tanpa kategori'}</td><td>{product.variant ?? '-'}</td><td>{product.unit}</td><td><span className={`status ${product.active ? '' : 'status-off'}`}><i></i>{product.active ? 'Aktif' : 'Nonaktif'}</span></td><td><button className="text-button" type="button" onClick={() => void toggleProduct(product)}>{product.active ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty-state">Produk tidak ditemukan.</div>}</div>}</div></div></section>
}

function StockView({ profile, locations }: { profile: Profile; locations: LocationOption[] }) {
  const [locationId, setLocationId] = useState(profile.location_id ?? locations[0]?.id ?? '')
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [stocks, setStocks] = useState<StockRecord[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<StockRow | null>(null)
  const [physical, setPhysical] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const client = supabase
  const canAdjust = profile.role === 'MASTER' || profile.role === 'WAREHOUSE'
  const allowedLocations = profile.role === 'MASTER' || profile.role === 'OWNER' ? locations : locations.filter((location) => location.id === profile.location_id)

  async function loadStock() {
    if (!client || !locationId) return
    setLoading(true)
    const [productResult, stockResult] = await Promise.all([
      client.from('products').select('id, sku, name, unit, variant, active, category_id').eq('active', true).order('name'),
      client.from('stocks').select('product_id, location_id, quantity').eq('location_id', locationId),
    ])
    if (productResult.error || stockResult.error) setError('Stok tidak dapat dimuat dari Supabase.')
    else {
      setProducts(filterApprovedProducts((productResult.data ?? []) as ProductRecord[]))
      setStocks((stockResult.data ?? []) as StockRecord[])
    }
    setLoading(false)
  }

  useEffect(() => { void loadStock() }, [client, locationId])
  useEffect(() => { if (!locationId && allowedLocations[0]?.id) setLocationId(allowedLocations[0].id) }, [locationId, allowedLocations])

  async function adjustStock(event: FormEvent) {
    event.preventDefault()
    if (!client || !selected || !canAdjust) return
    const quantity = Number(physical)
    if (!Number.isInteger(quantity) || quantity < 0 || !reason.trim()) { setError('Jumlah fisik dan alasan wajib diisi.'); return }
    setSaving(true); setError(''); setMessage('')
    const { error: adjustmentError } = await client.rpc('adjust_stock', { p_product_id: selected.product_id, p_location_id: selected.location_id, p_physical_quantity: quantity, p_reason: reason.trim() })
    setSaving(false)
    if (adjustmentError) { setError(adjustmentError.message); return }
    setMessage('Adjustment stok berhasil disimpan.'); setSelected(null); setPhysical(''); setReason(''); void loadStock(); window.dispatchEvent(new Event('faminis:data-changed'))
  }

  async function resetLocationStock() {
    if (!client || !locationId || !canAdjust) return
    setResetting(true); setError(''); setMessage('')
    const { error: resetError } = await client.rpc('reset_location_stock', { p_location_id: locationId })
    setResetting(false)
    if (resetError) { setError(resetError.message); return }
    setMessage('Semua stok di lokasi ini berhasil diatur ke 0.')
    void loadStock()
    window.dispatchEvent(new Event('faminis:data-changed'))
  }

  const rows: StockRow[] = products
    .map((product) => {
      const stockValue = stocks.find((stock) => stock.product_id === product.id && stock.location_id === locationId)
      return {
        product_id: product.id,
        location_id: locationId,
        quantity: Number(stockValue?.quantity ?? 0),
        product,
      }
    })
    .filter((row) => `${row.product?.sku ?? ''} ${row.product?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))

  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">INVENTORY</p><h1>Stok</h1><p className="subtitle">Saldo per lokasi dan penyesuaian stok tercatat di audit log.</p></div><label className="pos-location">Lokasi<select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={allowedLocations.length < 2}>{allowedLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div><div className="filter-bar"><div className="filter-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari SKU atau produk..." /></div>{canAdjust && <button className="button button-secondary" type="button" disabled={resetting} onClick={() => { void resetLocationStock() }}>{resetting ? 'Mereset...' : 'Reset stok ke 0'}</button>}</div>{error && <div className="data-error">{error}</div>}{message && <div className="form-success operation-message">{message}</div>}<div className="panel table-panel">{loading ? <div className="empty-state">Memuat stok...</div> : <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Produk</th><th>Unit</th><th>Saldo</th><th>Aksi</th></tr></thead><tbody>{rows.map((row) => <tr key={row.product_id}><td><strong>{row.product?.sku}</strong></td><td>{row.product?.name}</td><td>{row.product?.unit}</td><td><strong className={row.quantity <= 5 ? 'stock-low' : ''}>{formatNumber(row.quantity)}</strong></td><td><button className="text-button" type="button" disabled={!canAdjust} onClick={() => { setSelected(row); setPhysical(String(row.quantity)); setReason('') }}>Adjustment</button></td></tr>)}</tbody></table>{!rows.length && <div className="empty-state">Belum ada saldo stok di lokasi ini.</div>}</div>}</div>{selected && <div className="operation-dialog"><form className="panel operation-form" onSubmit={adjustStock}><div className="panel-heading"><div><h2>Adjustment stok</h2><p>{selected.product?.sku} · Sistem {selected.quantity} unit</p></div><button className="more-button" type="button" onClick={() => setSelected(null)} aria-label="Tutup">×</button></div><label>Jumlah fisik<input type="number" min="0" value={physical} onChange={(event) => setPhysical(event.target.value)} /></label><label>Alasan<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Stock opname, rusak, atau koreksi lainnya" /></label><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan adjustment'}</button></form></div>}</section>
}

function TransfersView({ profile, locations }: { profile: Profile; locations: LocationOption[] }) {
  const [transfers, setTransfers] = useState<TransferRecord[]>([])
  const [transferItems, setTransferItems] = useState<TransferItemRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [source, setSource] = useState(profile.location_id ?? locations[0]?.id ?? '')
  const [destination, setDestination] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [receiptDrafts, setReceiptDrafts] = useState<Record<string, { quantity: string; note: string }>>({})
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null)
  const [draftEditor, setDraftEditor] = useState<{ productId: string; quantity: string; note: string }>({ productId: '', quantity: '1', note: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const client = supabase
  const canChooseSource = profile.role === 'MASTER' || profile.role === 'OWNER'
  const allowedSources = canChooseSource ? locations : locations.filter((location) => location.id === profile.location_id)

  const loadTransfers = useCallback(async () => {
    if (!client) return
    setLoading(true)
    const [transferResult, productResult, itemResult] = await Promise.all([
      client.from('stock_transfers').select('id, source_location_id, destination_location_id, status, notes, created_at, requested_by').order('created_at', { ascending: false }).limit(50),
      client.from('products').select('id, sku, name, unit, variant, active, category_id').eq('active', true).order('name'),
      client.from('stock_transfer_items').select('id, transfer_id, product_id, shipped_quantity, received_quantity, discrepancy_reason'),
    ])
    if (transferResult.error || productResult.error || itemResult.error) setError('Data transfer tidak dapat dimuat dari Supabase.')
    else {
      const nextItems = (itemResult.data ?? []) as TransferItemRecord[]
      setTransfers((transferResult.data ?? []) as TransferRecord[])
      setProducts(filterApprovedProducts((productResult.data ?? []) as ProductRecord[]))
      setTransferItems(nextItems)
      setReceiptDrafts((current) => {
        const nextDrafts = { ...current }
        for (const item of nextItems) {
          nextDrafts[item.id] = nextDrafts[item.id] ?? {
            quantity: String(item.received_quantity ?? item.shipped_quantity),
            note: item.discrepancy_reason ?? '',
          }
        }
        return nextDrafts
      })
    }
    setLoading(false)
  }, [client])

  useEffect(() => { void loadTransfers() }, [loadTransfers])

  useEffect(() => {
    if (!client) return
    const channel = client.channel('transfer-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transfers' }, () => {
        void loadTransfers()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transfer_items' }, () => {
        void loadTransfers()
      })
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [client, loadTransfers])
  useEffect(() => { if (!destination) setDestination(locations.find((location) => location.id !== source)?.id ?? '') }, [destination, locations, source])

  async function createTransfer(event: FormEvent) {
    event.preventDefault()
    if (!client) return
    const amount = Number(quantity)
    if (!source || !destination || source === destination || !productId || !Number.isInteger(amount) || amount <= 0) { setError('Source, tujuan, produk, dan quantity wajib diisi.'); return }
    setSaving(true); setError(''); setMessage('')
    const { error: createError } = await client.rpc('create_transfer', { p_source_location_id: source, p_destination_location_id: destination, p_items: [{ product_id: productId, quantity: amount }], p_notes: note.trim() || null })
    setSaving(false)
    if (createError) { setError(createError.message); return }
    setMessage('Transfer DRAFT berhasil dibuat.'); setQuantity('1'); setNote(''); void loadTransfers()
  }

  async function transition(transfer: TransferRecord, nextStatus: string) {
    if (!client) return
    setSaving(true); setError(''); setMessage('')
    const { error: transitionError } = await client.rpc('transition_transfer', { p_transfer_id: transfer.id, p_next_status: nextStatus, p_note: note.trim() || null })
    setSaving(false)
    if (transitionError) { setError(transitionError.message); return }
    setMessage(`Transfer berhasil menjadi ${nextStatus}.`); setNote(''); void loadTransfers(); window.dispatchEvent(new Event('faminis:data-changed'))
  }

  async function receiveTransfer(transfer: TransferRecord) {
    if (!client) return
    const items = transferItems.filter((item) => item.transfer_id === transfer.id)
    if (!items.length) { setError('Detail transfer tidak tersedia untuk penerimaan.'); return }
    const payload: Array<{ product_id: string; received_quantity: number; discrepancy_reason?: string | null }> = []

    for (const item of items) {
      const draft = receiptDrafts[item.id] ?? { quantity: String(item.received_quantity ?? item.shipped_quantity), note: item.discrepancy_reason ?? '' }
      const receivedQuantity = Number(draft.quantity)
      if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0 || receivedQuantity > item.shipped_quantity) {
        setError(`Jumlah terima untuk ${products.find((product) => product.id === item.product_id)?.name ?? 'produk'} harus antara 0 dan ${item.shipped_quantity}.`)
        return
      }
      if (receivedQuantity < item.shipped_quantity && !draft.note.trim()) {
        setError('Wajib isi alasan ketika jumlah yang diterima kurang dari kiriman.')
        return
      }
      payload.push({
        product_id: item.product_id,
        received_quantity: receivedQuantity,
        discrepancy_reason: receivedQuantity < item.shipped_quantity ? draft.note.trim() || null : null,
      })
    }

    setSaving(true); setError(''); setMessage('')
    const { error: receiveError } = await client.rpc('receive_transfer', {
      p_transfer_id: transfer.id,
      p_items: payload,
      p_note: payload.some((item) => item.discrepancy_reason) ? payload.map((item) => item.discrepancy_reason ?? '').filter(Boolean).join('; ') : null,
    })
    setSaving(false)
    if (receiveError) { setError(receiveError.message); return }

    setMessage('Penerimaan transfer berhasil dicatat.')
    void loadTransfers()
    window.dispatchEvent(new Event('faminis:data-changed'))
  }

  const locationName = (id: string) => locations.find((location) => location.id === id)?.name ?? 'Lokasi'
  const actionFor = (transfer: TransferRecord) => {
    if (transfer.status === 'DRAFT') return 'REQUESTED'
    if (transfer.status === 'REQUESTED' && (profile.role === 'MASTER' || profile.role === 'OWNER' || profile.role === 'WAREHOUSE')) return 'APPROVED'
    if (transfer.status === 'APPROVED' && (profile.role === 'MASTER' || profile.role === 'WAREHOUSE')) return 'SHIPPED'
    if (transfer.status === 'SHIPPED' && transfer.destination_location_id === profile.location_id) return 'RECEIVED'
    if (transfer.status === 'RECEIVED' && (profile.role === 'MASTER' || profile.role === 'OWNER' || profile.role === 'WAREHOUSE')) return 'COMPLETED'
    return null
  }
  async function updateDraftTransfer(transfer: TransferRecord) {
    if (!client || transfer.status !== 'DRAFT') return
    const productIdValue = draftEditor.productId || transferItems.find((item) => item.transfer_id === transfer.id)?.product_id
    const quantityValue = Number(draftEditor.quantity)
    if (!productIdValue || !Number.isInteger(quantityValue) || quantityValue <= 0) {
      setError('Pilih produk dan jumlah transfer yang valid sebelum menyimpan draft.')
      return
    }
    setSaving(true); setError(''); setMessage('')
    const { error: updateError } = await client.rpc('update_transfer_draft', {
      p_transfer_id: transfer.id,
      p_product_id: productIdValue,
      p_quantity: quantityValue,
      p_notes: draftEditor.note.trim() || null,
    })
    setSaving(false)
    if (updateError) { setError(updateError.message); return }
    setEditingTransferId(null)
    setDraftEditor({ productId: '', quantity: '1', note: '' })
    setMessage('Draft transfer berhasil diperbarui.')
    void loadTransfers()
  }

  async function deleteDraftTransfer(transfer: TransferRecord) {
    if (!client || transfer.status !== 'DRAFT') return
    if (!window.confirm('Apakah Anda yakin ingin membatalkan draft transfer ini?')) return
    setSaving(true); setError(''); setMessage('')
    const { error: deleteError } = await client.rpc('delete_transfer_draft', { p_transfer_id: transfer.id })
    setSaving(false)
    if (deleteError) { setError(deleteError.message); return }
    setEditingTransferId(null)
    setDraftEditor({ productId: '', quantity: '1', note: '' })
    setMessage('Draft transfer berhasil dibatalkan.')
    void loadTransfers()
  }

  const startDraftEdit = (transfer: TransferRecord) => {
    const item = transferItems.find((entry) => entry.transfer_id === transfer.id)
    const product = item ? products.find((candidate) => candidate.id === item.product_id) : undefined
    setEditingTransferId(transfer.id)
    setDraftEditor({
      productId: item?.product_id ?? product?.id ?? '',
      quantity: String(item?.shipped_quantity ?? 1),
      note: transfer.notes ?? '',
    })
  }

  const canManageDraft = (transfer: TransferRecord) => {
    if (transfer.status !== 'DRAFT') return false
    return profile.id === transfer.requested_by || profile.location_id === transfer.source_location_id || profile.role === 'MASTER' || profile.role === 'OWNER' || profile.role === 'WAREHOUSE'
  }

  const renderDraftControls = (transfer: TransferRecord) => {
    if (transfer.status !== 'DRAFT') return <span className="muted-text">-</span>
    if (!canManageDraft(transfer)) return <span className="muted-text">-</span>
    if (editingTransferId === transfer.id) {
      return <div style={{ display: 'grid', gap: 8, minWidth: 190 }}><label style={{ display: 'grid', gap: 5, fontSize: 10, color: '#7f736b', fontWeight: 600 }}>Produk<select value={draftEditor.productId} onChange={(event) => setDraftEditor((current) => ({ ...current, productId: event.target.value }))}>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}</select></label><label style={{ display: 'grid', gap: 5, fontSize: 10, color: '#7f736b', fontWeight: 600 }}>Qty<input type="number" min="1" value={draftEditor.quantity} onChange={(event) => setDraftEditor((current) => ({ ...current, quantity: event.target.value }))} /></label><label style={{ display: 'grid', gap: 5, fontSize: 10, color: '#7f736b', fontWeight: 600 }}>Catatan<input value={draftEditor.note} onChange={(event) => setDraftEditor((current) => ({ ...current, note: event.target.value }))} placeholder="Opsional" /></label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="text-button" type="button" disabled={saving} onClick={() => void updateDraftTransfer(transfer)}>Simpan</button><button className="text-button" type="button" disabled={saving} onClick={() => setEditingTransferId(null)}>Batal</button></div></div>
    }
    return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="text-button" type="button" disabled={saving} onClick={() => startDraftEdit(transfer)}>Edit</button><button className="text-button" type="button" disabled={saving} onClick={() => void deleteDraftTransfer(transfer)}>Hapus</button></div>
  }

  const renderTransferAction = (transfer: TransferRecord) => {
    const nextAction = actionFor(transfer)
    if (!nextAction) return <span className="muted-text">Menunggu tahap lanjut</span>
    if (transfer.status === 'DRAFT') {
      return <button className="text-button" type="button" disabled={saving} onClick={() => void transition(transfer, nextAction)}>{nextAction}</button>
    }
    const buttonAction = nextAction === 'RECEIVED'
      ? <button className="text-button" type="button" disabled={saving} onClick={() => void receiveTransfer(transfer)}>{nextAction}</button>
      : <button className="text-button" type="button" disabled={saving} onClick={() => void transition(transfer, nextAction)}>{nextAction}</button>
    return buttonAction
  }
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">STOCK TRANSFERS</p><h1>Transfer</h1><p className="subtitle">Pindahkan stok melalui status DRAFT sampai COMPLETED.</p></div></div><div className="operation-grid"><form className="panel operation-form" onSubmit={createTransfer}><div className="panel-heading"><div><h2>Buat transfer</h2><p>Stok belum berubah sampai tahap SHIPPED.</p></div></div><label>Dari<select value={source} onChange={(event) => setSource(event.target.value)} disabled={!canChooseSource}>{allowedSources.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Ke<select value={destination} onChange={(event) => setDestination(event.target.value)}>{locations.filter((location) => location.id !== source).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Produk<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Pilih produk</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}</select></label><label>Quantity<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Catatan<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opsional, wajib untuk selisih saat menerima" /></label><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Buat transfer'}</button></form><div className="panel table-panel"><div className="panel-heading"><div><h2>Daftar transfer</h2><p>{transfers.length} transfer terlihat sesuai akses Anda</p></div></div>{loading ? <div className="empty-state">Memuat transfer...</div> : <div className="table-wrap"><table><thead><tr><th>Rute</th><th>Produk & Qty</th><th>Status</th><th>Tanggal</th><th>Kelola Draft</th><th>Aksi</th></tr></thead><tbody>{transfers.map((transfer) => { const items = transferItems.filter((item) => item.transfer_id === transfer.id); return <tr key={transfer.id}><td><strong>{locationName(transfer.source_location_id)} → {locationName(transfer.destination_location_id)}</strong><small className="table-subline">{transfer.notes ?? 'Tanpa catatan'}</small></td><td>{!items.length ? '—' : <div style={{ display: 'grid', gap: 4 }}>{items.map((item) => { const product = products.find((candidate) => candidate.id === item.product_id); return <div key={item.id}><strong>{product?.name ?? 'Produk'} </strong><span className="table-subline">{item.shipped_quantity} {product?.unit ?? 'unit'}</span></div> })}</div>}</td><td><span className="transfer-status">{transfer.status}</span></td><td>{new Date(transfer.created_at).toLocaleDateString('id-ID')}</td><td>{renderDraftControls(transfer)}</td><td>{renderTransferAction(transfer)}</td></tr> })}</tbody></table>{!transfers.length && <div className="empty-state">Belum ada transfer.</div>}</div>}</div></div>{error && <div className="data-error">{error}</div>}{message && <div className="form-success operation-message">{message}</div>}</section>
}

function AccessRestricted({ title, message }: { title: string; message: string }) {
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h1>{title}</h1><p className="subtitle">{message}</p></div></div></section>
}

function ReportsView({ data, onDownloadCsv, onDownloadPdf }: { data: DashboardData; onDownloadCsv: () => void; onDownloadPdf: () => void }) {
  const [location, setLocation] = useState('all')
  const locationName = (id: string) => data.locations.find((item) => item.id === id)?.name ?? 'Unknown'
  const transactions = data.transactions.filter((item) => location === 'all' || item.location_id === location)
  const revenue = transactions.reduce((sum, item) => sum + Number(item.grand_total), 0)
  const productName = (productId: string) => data.products.find((product) => product.id === productId)?.name ?? 'Produk'
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">REPORTS</p><h1>Sales report</h1><p className="subtitle">Data langsung dari transaksi Supabase.</p></div><div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><label className="pos-location">Location<select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">All locations</option>{data.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button button-secondary" type="button" onClick={onDownloadCsv}><ArrowDownToLine size={16} /> CSV</button><button className="button button-secondary" type="button" onClick={onDownloadPdf}><ArrowDownToLine size={16} /> PDF</button></div></div><div className="report-cards"><MetricCard label="Revenue" value={formatCurrency(revenue)} change="Live data" tone="brown" icon={CircleDollarSign} /><MetricCard label="Transactions" value={formatNumber(transactions.length)} change="Live data" tone="green" icon={ShoppingCart} /><MetricCard label="Average sale" value={formatCurrency(transactions.length ? revenue / transactions.length : 0)} change="Calculated" tone="orange" icon={CircleDollarSign} /></div><div className="panel table-panel"><div className="panel-heading"><div><h2>Sales transactions</h2><p>{transactions.length} rows returned</p></div></div><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Produk & Qty</th><th>Location</th><th>Total</th><th>Created</th></tr></thead><tbody>{transactions.map((item) => { const details = data.transactionItems.filter((entry) => entry.transaction_id === item.id); return <tr key={item.id}><td><strong>{item.invoice_no}</strong></td><td>{!details.length ? <span className="muted-text">—</span> : <div className="invoice-detail-list">{details.map((entry) => <span key={`${item.id}-${entry.product_id}`} className="invoice-detail-item"><span className="invoice-detail-name">{productName(entry.product_id)}</span><span className="invoice-detail-qty">Qty {entry.quantity}</span></span>)}</div>}</td><td>{locationName(item.location_id)}</td><td><strong>{formatCurrency(Number(item.grand_total))}</strong></td><td>{new Date(item.created_at).toLocaleString('id-ID')}</td></tr> })}</tbody></table>{!transactions.length && <div className="empty-state">Belum ada transaksi untuk filter ini.</div>}</div></div></section>
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
    void client.from('products').select('id, sku, name, category_id').eq('active', true).order('name').then(({ data }) => setProducts(filterApprovedProducts((data ?? []) as Array<{ id: string; sku: string; name: string; category_id?: string | null }>)))
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
