import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardPenLine, MapPin, PackagePlus, Plus, ScrollText, Tags } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'
import { fetchAllPages, filterApprovedProducts, getApprovedCategoryList, getProductCategoryId } from '../lib/catalog'
import type { CategoryRecord, ProductRecord } from '../lib/catalog'
import '../App.css'

type LocationRecord = { id: string; code: string; name: string; kind: string; active: boolean }
type AuditRecord = { id: string; action: string; description: string | null; location_id: string | null; created_at: string }
type StockOption = { product_id: string; location_id: string; quantity: number }

function AdminPage({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div></div>{children}</section>
}

export function MasterCategoriesView() {
  const client = supabase
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!client) return
    const { data, error: loadError } = await client.from('categories').select('id, name, active').order('name')
    if (loadError) setError(loadError.message)
    else setCategories((data ?? []) as CategoryRecord[])
  }, [client])
  useEffect(() => { void load() }, [load])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!client || !name.trim()) return
    setError(''); setMessage('')
    const { error: saveError } = await client.from('categories').insert({ name: name.trim(), active: true })
    if (saveError) setError(saveError.message)
    else { setName(''); setMessage('Kategori berhasil ditambahkan.'); void load() }
  }
  async function toggle(category: CategoryRecord) {
    if (!client) return
    const { error: updateError } = await client.from('categories').update({ active: !category.active }).eq('id', category.id)
    if (updateError) setError(updateError.message)
    else void load()
  }
  return <AdminPage eyebrow="MASTER DATA" title="Kategori" subtitle="Kelola kategori produk untuk seluruh katalog."><div className="operation-grid"><form className="panel operation-form" onSubmit={save}><div className="panel-heading"><div><h2>Tambah kategori</h2><p>Nama kategori harus unik.</p></div><Tags size={20} /></div><label>Nama kategori<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Mukena" required /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button className="button button-primary" type="submit"><Plus size={16} /> Tambah kategori</button></form><div className="panel table-panel"><div className="panel-heading"><div><h2>Daftar kategori</h2><p>{categories.length} kategori</p></div></div><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td><strong>{category.name}</strong></td><td><span className={category.active ? 'status positive' : 'status negative'}>{category.active ? 'Aktif' : 'Nonaktif'}</span></td><td><button className="text-button" type="button" onClick={() => void toggle(category)}>{category.active ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>)}</tbody></table>{!categories.length && <div className="empty-state">Belum ada kategori.</div>}</div></div></div></AdminPage>
}

export function MasterLocationsView({ onLocationRenamed }: { onLocationRenamed?: (locationId: string, name: string) => void }) {
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState(supabase ? '' : 'Koneksi Supabase belum tersedia, lokasi tidak dapat dimuat.')
  const [actionError, setActionError] = useState('')
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [savingLocationId, setSavingLocationId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const loadLocations = useCallback(async () => {
    if (!supabase) return { locations: [] as LocationRecord[], error: 'Koneksi Supabase belum tersedia, lokasi tidak dapat dimuat.' }
    try {
      const { data, error: loadError } = await supabase.from('locations').select('id, code, name, kind, active').order('name')
      if (loadError) return { locations: [] as LocationRecord[], error: `Lokasi tidak dapat dimuat: ${loadError.message}` }
      return { locations: (data ?? []) as LocationRecord[], error: '' }
    } catch (loadError) {
      return { locations: [] as LocationRecord[], error: `Lokasi tidak dapat dimuat: ${loadError instanceof Error ? loadError.message : 'koneksi gagal.'}` }
    }
  }, [])

  const applyLocationLoad = useCallback((result: Awaited<ReturnType<typeof loadLocations>>) => {
    if (result.error) setError(result.error)
    else setLocations(result.locations)
    setLoading(false)
  }, [])

  useEffect(() => {
    let mounted = true
    void loadLocations().then((result) => { if (mounted) applyLocationLoad(result) })
    return () => { mounted = false }
  }, [applyLocationLoad, loadLocations])

  function retryLoadLocations() {
    setError('')
    setLoading(true)
    void loadLocations().then(applyLocationLoad)
  }

  function startEditing(location: LocationRecord) {
    setEditingLocationId(location.id)
    setDraftName(location.name)
    setActionError('')
    setMessage('')
  }

  function stopEditing() {
    setEditingLocationId(null)
    setDraftName('')
    setActionError('')
  }

  async function saveLocationName(event: FormEvent<HTMLFormElement>, location: LocationRecord) {
    event.preventDefault()
    if (!supabase || savingLocationId) return
    const name = draftName.trim().replace(/\s+/g, ' ')
    if (!name || name.length > 100) {
      setActionError('Nama lokasi wajib diisi dan maksimal 100 karakter.')
      return
    }
    if (name === location.name) {
      stopEditing()
      return
    }

    setSavingLocationId(location.id)
    setActionError('')
    setMessage('')
    let renameError: string | null = null
    try {
      const { error: rpcError } = await supabase.rpc('rename_store_location', {
        p_location_id: location.id,
        p_name: name,
      })
      renameError = rpcError?.message ?? null
    } catch (saveError) {
      renameError = saveError instanceof Error ? saveError.message : 'Koneksi gagal saat mengubah nama lokasi.'
    } finally {
      setSavingLocationId(null)
    }

    if (renameError) {
      const knownErrors: Record<string, string> = {
        PERMISSION_DENIED: 'Hanya MASTER yang dapat mengubah nama ruko.',
        INVALID_LOCATION: 'Lokasi yang dipilih tidak valid.',
        LOCATION_NOT_FOUND: 'Lokasi tidak ditemukan. Muat ulang daftar lalu coba lagi.',
        NOT_A_STORE_LOCATION: 'Nama hanya dapat diubah untuk lokasi ruko.',
        INVALID_LOCATION_NAME: 'Nama lokasi wajib diisi dan maksimal 100 karakter.',
        DUPLICATE_LOCATION_NAME: 'Nama tersebut sudah digunakan oleh lokasi lain.',
      }
      const knownError = Object.entries(knownErrors).find(([code]) => renameError?.includes(code))?.[1]
      setActionError(knownError ?? `Nama lokasi gagal diubah: ${renameError}`)
      return
    }

    const oldName = location.name
    setLocations((current) => current
      .map((item) => item.id === location.id ? { ...item, name } : item)
      .sort((left, right) => left.name.localeCompare(right.name)))
    onLocationRenamed?.(location.id, name)
    setEditingLocationId(null)
    setDraftName('')
    setMessage(`Nama ${oldName} berhasil diubah menjadi ${name}.`)
    window.dispatchEvent(new Event('faminis:data-changed'))
  }

  return <AdminPage eyebrow="MASTER DATA" title="Lokasi" subtitle="Nama ruko yang diubah akan digunakan pada seluruh tampilan dan laporan."><div className="panel table-panel"><div className="panel-heading"><div><h2>Daftar lokasi</h2><p>{locations.length} lokasi</p></div><MapPin size={20} /></div>{message && <p className="form-success" role="status">{message}</p>}{actionError && <p className="form-error" role="alert">{actionError}</p>}{error && <div className="data-error" role="alert">{error}{!loading && supabase && <button type="button" className="text-button" onClick={retryLoadLocations}>Coba lagi</button>}</div>}{loading ? <div className="empty-state" role="status">Memuat lokasi...</div> : !error && <div className="table-wrap"><table><thead><tr><th>Kode</th><th>Nama</th><th>Jenis</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{locations.map((location) => {
    const isEditing = editingLocationId === location.id
    const isSaving = savingLocationId === location.id
    return <tr key={location.id}>
      <td><strong>{location.code}</strong></td>
      <td>{isEditing ? <form className="location-rename-form" onSubmit={(event) => void saveLocationName(event, location)}><input autoFocus aria-label={`Nama baru untuk ${location.name}`} value={draftName} maxLength={100} onChange={(event) => setDraftName(event.target.value)} disabled={isSaving} required /><button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Menyimpan...' : 'Simpan'}</button></form> : location.name}</td>
      <td>{location.kind === 'STORE' ? 'Toko' : location.kind === 'WAREHOUSE' ? 'Gudang' : 'Operasional'}</td>
      <td><span className={location.active ? 'status positive' : 'status negative'}>{location.active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td>{location.kind === 'STORE' && (isEditing ? <button className="button button-secondary" type="button" onClick={stopEditing} disabled={isSaving}>Batal</button> : <button className="text-button" type="button" onClick={() => startEditing(location)} disabled={Boolean(savingLocationId)}>Ubah nama</button>)}</td>
    </tr>
  })}</tbody></table>{!locations.length && <div className="empty-state">Belum ada lokasi di database.</div>}</div>}</div></AdminPage>
}

export function MasterAuditLogsView() {
  const [logs, setLogs] = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { if (!supabase) { setLoading(false); return }; const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0); void supabase.from('audit_logs').select('id, action, description, location_id, created_at').gte('created_at', monthStart.toISOString()).order('created_at', { ascending: false }).limit(100).then(({ data, error: loadError }) => { if (loadError) setError('Audit log tidak dapat dimuat.'); else setLogs((data ?? []) as AuditRecord[]); setLoading(false) }) }, [])
  return <AdminPage eyebrow="SECURITY" title="Audit Log" subtitle="Jejak aktivitas operasional bulan berjalan. Histori lama tetap tersimpan di database."><div className="panel table-panel"><div className="panel-heading"><div><h2>Aktivitas bulan berjalan</h2><p>{logs.length} log ditampilkan</p></div><ScrollText size={20} /></div>{loading ? <div className="empty-state">Memuat audit log...</div> : error ? <div className="data-error">{error}</div> : <div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Deskripsi</th><th>Lokasi</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString('id-ID')}</td><td><strong>{log.action}</strong></td><td>{log.description ?? '-'}</td><td>{log.location_id ?? 'Global'}</td></tr>)}</tbody></table>{!logs.length && <div className="empty-state">Belum ada audit log bulan ini.</div>}</div>}</div></AdminPage>
}

export function MasterAdjustmentsView({ profile }: { profile: Profile }) {
  const client = supabase
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [stocks, setStocks] = useState<StockOption[]>([])
  const [locationId, setLocationId] = useState('')
  const [productId, setProductId] = useState('')
  const [physical, setPhysical] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!client) return
    void Promise.all([
      client.from('locations').select('id, code, name, kind, active').eq('active', true).order('name'),
      client.from('products').select('id, sku, name, unit, variant, active, category_id').eq('active', true).order('name'),
    ]).then(([locationResult, productResult]) => {
      setLocations((locationResult.data ?? []) as LocationRecord[])
      setProducts(filterApprovedProducts((productResult.data ?? []) as ProductRecord[]))
    })
  }, [client])
  useEffect(() => { if (!client || !locationId) return; void client.from('stocks').select('product_id, location_id, quantity').eq('location_id', locationId).then(({ data }) => setStocks((data ?? []) as StockOption[])) }, [client, locationId])
  const currentQuantity = stocks.find((stock) => stock.product_id === productId)?.quantity ?? 0
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!client || !productId || !locationId || !reason.trim()) { setError('Lokasi, produk, jumlah fisik, dan alasan wajib diisi.'); return }
    const quantity = Number(physical)
    if (!Number.isInteger(quantity) || quantity < 0) { setError('Jumlah fisik harus berupa angka valid.'); return }
    setError(''); setMessage('')
    const { error: adjustmentError } = await client.rpc('adjust_stock', { p_product_id: productId, p_location_id: locationId, p_physical_quantity: quantity, p_reason: reason.trim() })
    if (adjustmentError) setError(adjustmentError.message)
    else { setPhysical(''); setReason(''); setMessage('Penyesuaian stok berhasil dicatat.'); setStocks((current) => current.map((stock) => stock.product_id === productId ? { ...stock, quantity } : stock)) }
  }
  return <AdminPage eyebrow="INVENTORY CONTROL" title="Adjustment / Stock Opname" subtitle={`Koreksi stok melalui RPC audit untuk ${profile.full_name}.`}><form className="panel operation-form" onSubmit={submit}><div className="panel-heading"><div><h2>Penyesuaian stok</h2><p>Perubahan akan tercatat di stock movement dan audit log.</p></div><ClipboardPenLine size={20} /></div><div className="two-col"><label>Lokasi<select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Pilih lokasi</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Produk<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Pilih produk</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}</select></label></div><div className="two-col"><label>Stok sistem<input value={productId ? String(currentQuantity) : ''} readOnly /></label><label>Jumlah fisik<input type="number" min="0" value={physical} onChange={(event) => setPhysical(event.target.value)} placeholder="Masukkan jumlah fisik" /></label></div><label>Alasan<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Contoh: hasil stock opname" required /></label>{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}<button className="button button-primary" type="submit">Simpan penyesuaian</button></form></AdminPage>
}

export function MasterOpeningStocksView() {
  const client = supabase
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [openingStocks, setOpeningStocks] = useState<StockOption[]>([])
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [locationId, setLocationId] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [savingProductId, setSavingProductId] = useState('')
  const [editingProductId, setEditingProductId] = useState('')
  const [loading, setLoading] = useState(Boolean(client))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!client) return
    void Promise.all([
      client.from('locations').select('id, code, name, kind, active').eq('active', true).order('name'),
      fetchAllPages((from, to) => client.from('products').select('id, sku, name, unit, variant, active, category_id').eq('active', true).order('name').order('id').range(from, to)),
      client.from('categories').select('id, name, active').eq('active', true).order('name'),
    ]).then(([locationResult, productResult, categoryResult]) => {
      if (locationResult.error || productResult.error || categoryResult.error) setError('Lokasi, produk, atau kategori tidak dapat dimuat.')
      else {
        const activeLocations = (locationResult.data ?? []) as LocationRecord[]
        const activeCategories = getApprovedCategoryList((categoryResult.data ?? []) as CategoryRecord[])
        setLocations(activeLocations)
        setProducts(filterApprovedProducts((productResult.data ?? []) as ProductRecord[]))
        setCategories(activeCategories)
        setSelectedCategoryId((current) => current === 'all' || activeCategories.some((category) => category.id === current) ? current : 'all')
        setLocationId((current) => current || activeLocations[0]?.id || '')
      }
      setLoading(false)
    })
  }, [client])

  useEffect(() => {
    if (!client || !locationId) return
    let mounted = true
    void fetchAllPages((from, to) => client.from('opening_stocks').select('product_id, location_id, quantity').eq('location_id', locationId).order('product_id').range(from, to)).then(({ data, error: loadError }) => {
      if (!mounted) return
      if (loadError) setError('Stok awal tidak dapat dimuat.')
      else setOpeningStocks((data ?? []) as StockOption[])
    })
    return () => { mounted = false }
  }, [client, locationId])

  async function save(productId: string) {
    if (!client || !locationId) return
    const quantity = Number(quantities[productId] ?? 0)
    if (!Number.isInteger(quantity) || quantity < 0) { setError('Jumlah stok harus berupa bilangan bulat nol atau lebih.'); return }
    setError(''); setMessage(''); setSavingProductId(productId)
    const existingStock = openingStocks.find((stock) => stock.product_id === productId && stock.location_id === locationId)
    const { error: saveError } = await client.rpc(existingStock ? 'update_opening_stock' : 'set_opening_stock', { p_product_id: productId, p_location_id: locationId, p_quantity: quantity })
    setSavingProductId('')
    if (saveError) {
      setError(saveError.message.includes('STOCK_ALREADY_USED') ? 'Stok awal tidak dapat diubah setelah stok digunakan.' : 'Stok awal tidak dapat disimpan.')
      return
    }
    setOpeningStocks((current) => existingStock
      ? current.map((stock) => stock.product_id === productId && stock.location_id === locationId ? { ...stock, quantity } : stock)
      : [...current, { product_id: productId, location_id: locationId, quantity }])
    setEditingProductId('')
    setMessage(existingStock ? 'Stok awal berhasil diubah.' : 'Stok awal berhasil disimpan.')
    window.dispatchEvent(new Event('faminis:data-changed'))
  }

  const visibleProducts = products.filter((product) => selectedCategoryId === 'all' || getProductCategoryId(product, categories) === selectedCategoryId)

  return <AdminPage eyebrow="INVENTORY SETUP" title="Stok Awal" subtitle="Tetapkan jumlah awal produk untuk setiap lokasi. Harga modal tidak dicatat.">
    <div className="panel table-panel">
      <div className="panel-heading"><div><h2>Saldo awal per lokasi</h2><p>Setiap produk hanya dapat ditetapkan satu kali.</p></div><PackagePlus size={20} /></div>
      <label className="opening-stock-location">Lokasi<select value={locationId} onChange={(event) => { setLocationId(event.target.value); setMessage(''); setError('') }}><option value="">Pilih lokasi</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      {error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}
      <div className="category-pills compact" aria-label="Filter kategori stok awal">{[{ id: 'all', name: 'Semua' }, ...categories].map((category) => <button key={category.id} type="button" className={`category-pill ${selectedCategoryId === category.id ? 'active' : ''}`} onClick={() => setSelectedCategoryId(category.id)}>{category.name}</button>)}</div>
      {loading ? <div className="empty-state">Memuat produk, kategori, dan lokasi...</div> : !products.length ? <div className="empty-state">Belum ada produk aktif.</div> : !locationId ? <div className="empty-state">Belum ada lokasi aktif.</div> : !visibleProducts.length ? <div className="empty-state">Tidak ada produk pada kategori ini.</div> : <div className="table-wrap"><table><thead><tr><th>Produk</th><th>Stok awal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{visibleProducts.map((product) => {
        const openingStock = openingStocks.find((stock) => stock.product_id === product.id && stock.location_id === locationId)
        const isEditing = editingProductId === product.id
        return <tr key={product.id}><td><strong>{product.name}</strong><span className="table-subline">{product.sku}{product.variant ? ` · ${product.variant}` : ''}</span></td><td>{openingStock && !isEditing ? <><strong>{openingStock.quantity}</strong> <span className="table-subline">{product.unit}</span></> : <><input className="opening-stock-quantity" aria-label={`Stok awal ${product.name}`} type="number" min="0" step="1" value={quantities[product.id] ?? String(openingStock?.quantity ?? 0)} onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))} /> <span className="table-subline">{product.unit}</span></>}</td><td><span className={openingStock ? 'status positive' : 'status-off'}>{openingStock ? 'Sudah diatur' : 'Belum diatur'}</span></td><td>{openingStock && isEditing ? <><button className="text-button" type="button" disabled={savingProductId === product.id} onClick={() => void save(product.id)}>{savingProductId === product.id ? 'Menyimpan...' : 'Simpan'}</button><button className="text-button" type="button" disabled={savingProductId === product.id} onClick={() => { setQuantities((current) => ({ ...current, [product.id]: String(openingStock.quantity) })); setEditingProductId('') }}>Batal</button></> : <button className="text-button" type="button" disabled={savingProductId === product.id} onClick={() => { if (openingStock) { setQuantities((current) => ({ ...current, [product.id]: String(openingStock.quantity) })); setEditingProductId(product.id) } else void save(product.id) }}>{savingProductId === product.id ? 'Menyimpan...' : openingStock ? 'Edit' : 'Simpan'}</button>}</td></tr>
      })}</tbody></table></div>}
    </div>
  </AdminPage>
}
