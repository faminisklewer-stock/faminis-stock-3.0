# Panduan Admin Faminis POS

## Login

Gunakan akun Supabase Auth pribadi. Jangan berbagi akun dan jangan memasukkan password ke tabel `profiles`.

## Role dan lokasi

Role diberikan administrator melalui `profiles`:

- `MASTER`: administrasi penuh
- `OWNER`: pemantauan bisnis
- `WAREHOUSE`: operasi Gudang
- `LIVE`: operasi Live
- `RUKO`: operasi lokasi pada `location_id`

Setiap user operasional hanya boleh memiliki satu lokasi aktif.

## Produk dan stok

Produk terpusat di `products`. Stok dipisahkan berdasarkan kombinasi `product_id` dan `location_id`. Jangan membuat salinan produk per ruko.

Semua perubahan stok harus melalui penjualan, pembelian, transfer, atau adjustment yang menghasilkan `stock_movements`.

## Kasir

Pilih produk, ubah jumlah pada kartu, masukkan harga jual manual, pilih metode pembayaran, lalu simpan. Server memeriksa stok dan menggunakan transaksi database atomic.

Jangan mengulangi pembayaran jika layar masih memproses. Periksa invoice dan laporan setelah koneksi kembali.

## Pembelian

Hanya MASTER dan WAREHOUSE yang dapat mencatat penerimaan. Isi supplier, lokasi, produk, dan jumlah. RPC akan menambah stok dan mencatat movement/audit.

## Laporan

Laporan mengambil transaksi dari Supabase dan harus dibaca sesuai lokasi user. Jangan menggunakan angka dashboard sebagai sumber pencatatan manual.

## Keamanan akun

Deaktivasi pegawai dengan `profiles.active = false`. Jangan menghapus histori transaksi, movement, transfer, atau audit log.
