# 📂 Fitur Manajemen Kategori

## Deskripsi
Fitur kategori memungkinkan Anda mengelompokkan layanan administrasi desa ke dalam kategori-kategori tertentu seperti:
- Kartu Keluarga (KK)
- KTP
- Akta Kelahiran
- Surat Keterangan
- dll.

## Instalasi

### 1. Jalankan Migrasi Database
Sebelum menggunakan fitur kategori, jalankan script migrasi untuk menambahkan tabel dan data kategori:

```bash
node migrate-kategori.js
```

Script ini akan:
- Membuat tabel `kategori` jika belum ada
- Menambahkan kolom `kategori_id` ke tabel `layanan`
- Menambahkan beberapa kategori default
- Membuat index untuk performa query

### 2. Restart Server Dashboard
Setelah migrasi selesai, restart server dashboard:

```bash
# Tekan Ctrl+C untuk stop server yang sedang berjalan
# Kemudian jalankan ulang:
npm start
# atau
node dashboard/server.js
```

## Cara Menggunakan

### Mengakses Halaman Kategori
1. Login ke dashboard admin
2. Klik menu **Kategori** di navbar
3. URL: `http://localhost:3000/kategori`

### Menambah Kategori Baru
1. Klik tombol **➕ Tambah Kategori**
2. Isi formulir:
   - **Nama Kategori**: Nama kategori (contoh: "Kartu Keluarga")
   - **Urutan Tampilan**: Angka untuk menentukan urutan (0 = pertama)
3. Klik **Simpan**

### Mengedit Kategori
1. Klik tombol **✏️ Edit** pada kategori yang ingin diubah
2. Ubah data yang diperlukan
3. Klik **Simpan**

### Menghapus Kategori
1. Klik tombol **🗑️ Hapus** pada kategori yang ingin dihapus
2. Konfirmasi penghapusan
3. **Catatan**: Layanan dalam kategori ini tidak akan terhapus, hanya kategorinya yang akan diset ke NULL

### Menggunakan Kategori di Layanan
Saat menambah atau mengedit layanan:
1. Buka form tambah/edit layanan
2. Pilih kategori dari dropdown **Kategori**
3. Kategori ini opsional (boleh dikosongkan)

## Fitur-Fitur

### ✅ Create (Tambah)
- Tambah kategori baru dengan nama dan urutan
- Validasi nama kategori tidak boleh kosong
- Nama kategori bersifat unik (tidak boleh duplikat)

### ✅ Read (Lihat)
- Daftar semua kategori diurutkan berdasarkan urutan
- Menampilkan jumlah layanan per kategori
- Tampilan card yang rapi dengan badge urutan

### ✅ Update (Edit)
- Edit nama dan urutan kategori
- Modal popup untuk editing yang cepat
- Validasi data sebelum disimpan

### ✅ Delete (Hapus)
- Hapus kategori yang tidak diperlukan
- Konfirmasi sebelum menghapus
- Layanan tetap aman (kategori diset NULL)

## Struktur Database

### Tabel: kategori
```sql
CREATE TABLE kategori (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL UNIQUE,
  urutan INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Relasi dengan Layanan
```sql
ALTER TABLE layanan 
ADD COLUMN kategori_id INTEGER 
REFERENCES kategori(id) ON DELETE SET NULL;
```

## API Endpoints

### Web Routes (EJS)
- `GET /kategori` - Halaman daftar kategori
- `POST /kategori/tambah` - Proses tambah kategori
- `POST /kategori/edit/:id` - Proses edit kategori
- `POST /kategori/hapus/:id` - Proses hapus kategori

### API Routes (JSON)
- `GET /api/kategori` - List kategori (JSON)
- `POST /api/kategori` - Tambah kategori (JSON)
- `PUT /api/kategori/:id` - Edit kategori (JSON)
- `DELETE /api/kategori/:id` - Hapus kategori (JSON)

## Kategori Default
Setelah migrasi, kategori berikut akan otomatis ditambahkan:
1. Kartu Keluarga (urutan: 1)
2. KTP (urutan: 2)
3. Akta (urutan: 3)
4. Surat Keterangan (urutan: 4)
5. Lainnya (urutan: 99)

Anda bisa mengedit atau menghapus kategori ini sesuai kebutuhan.

## Tips Penggunaan

### Urutan Tampilan
- Gunakan angka urutan untuk mengurutkan kategori
- Angka lebih kecil = tampil lebih dulu
- Contoh: 0, 1, 2, 3, dst.
- Gunakan angka besar (misal: 99) untuk kategori "Lainnya"

### Penamaan Kategori
- Gunakan nama yang singkat dan jelas
- Hindari nama yang terlalu panjang
- Contoh baik: "KK", "KTP", "Akta Kelahiran"
- Contoh kurang baik: "Kategori untuk Layanan Kartu Keluarga dan Sejenisnya"

### Pengelompokan Layanan
- Kelompokkan layanan berdasarkan dokumen yang dihasilkan
- Contoh:
  - Kategori "KK": KK Baru, KK Hilang, KK Rusak
  - Kategori "Akta": Akta Kelahiran, Akta Kematian, Akta Nikah

## Troubleshooting

### Error: "Table kategori already exists"
Ini normal jika Anda menjalankan migrasi lebih dari sekali. Script akan skip pembuatan tabel yang sudah ada.

### Kategori tidak muncul di dropdown layanan
1. Pastikan migrasi sudah dijalankan
2. Restart server dashboard
3. Clear cache browser (Ctrl+F5)
4. Cek console browser untuk error

### Error saat hapus kategori
Jika ada error saat menghapus kategori, kemungkinan:
- Foreign key constraint issue
- Pastikan `PRAGMA foreign_keys = ON` sudah diset di database connection

## Keamanan

### Validasi Input
- Nama kategori wajib diisi (required)
- Nama kategori di-trim (hapus spasi awal/akhir)
- Urutan dikonversi ke integer

### Authentication
Semua endpoint kategori memerlukan autentikasi:
- Web routes: menggunakan middleware `requireAuth`
- API routes: menggunakan middleware `apiAuth`

## Update Mendatang (Roadmap)
- [ ] Drag & drop untuk mengatur urutan kategori
- [ ] Bulk import kategori dari CSV/Excel
- [ ] Icon/emoji custom per kategori
- [ ] Filter layanan berdasarkan kategori di halaman layanan
- [ ] Statistik per kategori

## Dukungan
Jika mengalami masalah atau punya saran fitur, silakan hubungi administrator sistem.
