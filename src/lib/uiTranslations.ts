const UI_TRANSLATIONS: Record<string, string> = {
  'All locations': 'Semua lokasi',
  'Revenue overview': 'Ringkasan omzet',
  'Monthly performance across all locations': 'Performa bulanan semua lokasi',
  Revenue: 'Omzet',
  Orders: 'Pesanan',
  'Recent sales': 'Penjualan terbaru',
  'Latest transactions from Supabase': 'Transaksi terbaru dari Supabase',
  Activity: 'Aktivitas',
  'Latest stock movements': 'Pergerakan stok terbaru',
  'View all': 'Lihat semua',
  'View full report': 'Buka laporan lengkap',
  'Revenue by location': 'Omzet berdasarkan lokasi',
  'View activity log': 'Lihat log aktivitas',
  'New sale': 'Transaksi baru',
  'POINT OF SALE': 'KASIR',
  'Loading products...': 'Memuat produk...',
  'No products found.': 'Produk tidak ditemukan.',
  Cart: 'Keranjang',
  'product line': 'baris produk',
  'product lines': 'baris produk',
  'Selling price': 'Harga jual',
  'Payment method': 'Metode pembayaran',
  'Paid amount': 'Nominal dibayar',
  'Pay and save sale': 'Bayar dan simpan transaksi',
  'Saving...': 'Menyimpan...',
  'PRODUCT CATALOG': 'KATALOG PRODUK',
  'INVENTORY': 'PERSEDIAAN',
  'STOCK TRANSFERS': 'TRANSFER STOK',
  'PURCHASES': 'PEMBELIAN',
  'Receive stock': 'Penerimaan stok',
  'TEAM ACCESS': 'AKSES TIM',
  'SETTINGS': 'PENGATURAN',
  'REPORTS': 'LAPORAN',
  'Sales report': 'Laporan penjualan',
  'Sales transactions': 'Transaksi penjualan',
  'rows returned': 'baris ditemukan',
  Supplier: 'Pemasok',
  Product: 'Produk',
  Quantity: 'Jumlah',
  'Save purchase': 'Simpan pembelian',
  'Saving purchase...': 'Menyimpan pembelian...',
  'Low stock': 'Stok menipis',
  'Low stock threshold': 'Batas stok menipis',
  Currency: 'Mata uang',
  'Default unit': 'Satuan default',
  Location: 'Lokasi',
  Online: 'Online',
  Workspace: 'Ruang kerja',
  'Unknown': 'Tidak diketahui',
  'Tanpa kategori': 'Tanpa kategori',
  'Detail belum tersedia': 'Detail belum tersedia',
  'No data': 'Tidak ada data',
  'Select product': 'Pilih produk',
  'Select location': 'Pilih lokasi',
  Source: 'Sumber',
  Destination: 'Tujuan',
  Cash: 'Tunai',
  Credit: 'Kredit',
  Paid: 'Lunas',
  Received: 'Selesai',
  DRAFT: 'DRAF',
  REQUESTED: 'DIMINTA',
  APPROVED: 'DISETUJUI',
  SHIPPED: 'DIKIRIM',
  RECEIVED: 'DITERIMA',
  COMPLETED: 'SELESAI',
  'Available': 'Tersedia',
  'units available': 'unit tersedia',
}

function translateValue(value: string) {
  return UI_TRANSLATIONS[value] ?? value
}

export function translateVisibleUi(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let current: Node | null = walker.nextNode()
  while (current) {
    textNodes.push(current as Text)
    current = walker.nextNode()
  }

  for (const node of textNodes) {
    const value = node.nodeValue ?? ''
    const trimmed = value.trim()
    if (!trimmed) continue
    const translated = translateValue(trimmed)
    if (translated !== trimmed) node.nodeValue = value.replace(trimmed, translated)
  }

  if (!(root instanceof Element || root instanceof Document)) return
  root.querySelectorAll<HTMLElement>('[placeholder], [aria-label], [title]').forEach((element) => {
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
      const value = element.getAttribute(attribute)
      if (value) element.setAttribute(attribute, translateValue(value))
    }
  })
}
