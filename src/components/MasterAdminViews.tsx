import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardPenLine, MapPin, Plus, ScrollText, Tags } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'
import { filterApprovedProducts } from '../lib/catalog'
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

export function MasterLocationsView() {
  const [locations, setLocations] = useState<LocationRecord[]>([])
  useEffect(() => { if (!supabase) return; void supabase.from('locations').select('id, code, name, kind, active').order('name').then(({ data }) => setLocations((data ?? []) as LocationRecord[])) }, [])
  return <AdminPage eyebrow="MASTER DATA" title="Lokasi" subtitle="Daftar lokasi aktif yang digunakan dalam operasional."><div className="panel table-panel"><div className="panel-heading"><div><h2>Daftar lokasi</h2><p>{locations.length} lokasi</p></div><MapPin size={20} /></div><div className="table-wrap"><table><thead><tr><th>Kode</th><th>Nama</th><th>Jenis</th><th>Status</th></tr></thead><tbody>{locations.map((location) => <tr key={location.id}><td><strong>{location.code}</strong></td><td>{location.name}</td><td>{location.kind === 'STORE' ? 'Toko' : location.kind === 'WAREHOUSE' ? 'Gudang' : 'Operasional'}</td><td><span className={location.active ? 'status positive' : 'status negative'}>{location.active ? 'Aktif' : 'Nonaktif'}</span></td></tr>)}</tbody></table>{!locations.length && <div className="empty-state">Belum ada lokasi.</div>}</div></div></AdminPage>
}

export function MasterAuditLogsView() {
  const [logs, setLogs] = useState<AuditRecord[]>([])
  useEffect(() => { if (!supabase) return; void supabase.from('audit_logs').select('id, action, description, location_id, created_at').order('created_at', { ascending: false }).limit(100).then(({ data }) => setLogs((data ?? []) as AuditRecord[])) }, [])
  return <AdminPage eyebrow="SECURITY" title="Audit Log" subtitle="Jejak aktivitas operasional yang tercatat di database."><div className="panel table-panel"><div className="panel-heading"><div><h2>Aktivitas terbaru</h2><p>{logs.length} log ditampilkan</p></div><ScrollText size={20} /></div><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Aksi</th><th>Deskripsi</th><th>Lokasi</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString('id-ID')}</td><td><strong>{log.action}</strong></td><td>{log.description ?? '-'}</td><td>{log.location_id ?? 'Global'}</td></tr>)}</tbody></table>{!logs.length && <div className="empty-state">Belum ada audit log.</div>}</div></div></AdminPage>
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
