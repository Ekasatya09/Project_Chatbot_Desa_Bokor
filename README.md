# Chatbot WhatsApp Administrasi Desa v2

Chatbot WhatsApp rule-based (tanpa AI/LLM) untuk membantu warga dan pengurus desa mendapatkan informasi tentang syarat dan prosedur pembuatan surat administrasi desa.

**✨ Versi 2 (dengan Database & Dashboard Admin)**

## 📋 Fitur

### Bot WhatsApp
- ✅ Menu berbasis angka (rule-based, bukan AI)
- ✅ **Input typo-tolerant** - User bisa ketik "akta lahir" atau "akte kelahiran" dan tetap dikenali
- ✅ Informasi 6 layanan administrasi desa (dapat ditambah via dashboard)
- ✅ Auto-reconnect jika koneksi terputus
- ✅ Logging semua percakapan ke database

### Dashboard Admin Web
- ✅ **CRUD Layanan** - Tambah, edit, hapus layanan dan syarat
- ✅ **Riwayat Chat** - Log semua percakapan dengan filter tanggal dan pagination
- ✅ **Statistik** - Top layanan, aktivitas harian, insight penggunaan
- ✅ Authentication dengan bcrypt
- ✅ Responsive design untuk mobile dan desktop

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Library WhatsApp**: @whiskeysockets/baileys
- **Database**: SQLite (better-sqlite3)
- **Web Framework**: Express.js + EJS
- **String Matching**: string-similarity (untuk typo tolerance)
- **Security**: bcrypt (password hashing)

## 📦 Layanan yang Tersedia (Default)

1. Perbaharui Kartu Keluarga (KK)
2. KK dan KTP Hilang
3. Akta Kematian
4. Akta Kelahiran
5. Pindah Domisili
6. Kartu Identitas Anak (KIA)

_Layanan dapat ditambah/edit melalui dashboard admin_

## 🚀 Cara Instalasi

### 1. Prasyarat

Pastikan Anda sudah menginstal:
- **Node.js** versi 16 atau lebih baru ([Download di sini](https://nodejs.org/))

Cek versi Node.js Anda:
```bash
node --version
```

### 2. Install Dependencies

Buka terminal/command prompt di folder project ini, lalu jalankan:

```bash
npm install
```

Perintah ini akan menginstal semua library yang dibutuhkan (Baileys, SQLite, Express, dll).

### 3. Migrasi Database

**PENTING**: Sebelum menjalankan bot atau dashboard, Anda harus migrasi data ke database dulu!

```bash
npm run migrate
```

Script ini akan:
- Membuat file database `db/desa.db`
- Migrasi semua layanan dari `layanan.json` ke database
- Membuat akun admin default (username: `admin`, password: `admin123`)

Output yang berhasil:
```
✅ Migrasi selesai: 6 layanan, 32 syarat
✅ Akun admin berhasil dibuat
```

## ▶️ Cara Menjalankan

### Menjalankan Bot WhatsApp

Di terminal, jalankan:

```bash
npm start
```

Atau langsung:

```bash
node bot.js
```

**Setelah bot berjalan:**

1. QR Code akan muncul di terminal
2. Buka WhatsApp di HP Anda
3. Tap **titik tiga (⋮)** di pojok kanan atas
4. Pilih **Linked Devices** / **Perangkat Tertaut**
5. Tap **Link a Device** / **Tautkan Perangkat**
6. Scan QR Code yang muncul di terminal

Bot siap menerima pesan setelah berhasil scan!

### Menjalankan Dashboard Admin

**Di terminal TERPISAH** (biarkan bot tetap jalan), jalankan:

```bash
npm run dashboard
```

**Akses dashboard:**
1. Buka browser
2. Kunjungi: **http://localhost:3000**
3. Login dengan:
   - **Username**: `admin`
   - **Password**: `admin123`

⚠️ **PENTING**: Ganti password default setelah login pertama kali!

### Menjalankan Bot + Dashboard Bersamaan

Buka **2 terminal terpisah**:

**Terminal 1** (Bot):
```bash
npm start
```

**Terminal 2** (Dashboard):
```bash
npm run dashboard
```

## 💬 Cara Menggunakan Chatbot

### Dari Sisi Warga/User

1. **Kirim pesan pertama atau ketik "menu"** ke nomor WhatsApp yang terhubung dengan bot
2. Bot akan menampilkan **daftar layanan bernomor**
3. **Pilih dengan 3 cara**:
   - Ketik angka (contoh: `4`)
   - Ketik nama layanan (contoh: `Akta Kelahiran`)
   - Ketik dengan typo (contoh: `akte lahir` atau `akta klahiran`) ✨ **BARU!**
4. Bot akan mengirim **detail syarat lengkap**
5. Ketik **"menu"** kapan saja untuk kembali ke daftar layanan

### Contoh Percakapan

```
User: menu

Bot: 
📋 LAYANAN ADMINISTRASI DESA

Silakan pilih layanan yang Anda butuhkan dengan mengetik nomornya:

1. Perbaharui Kartu Keluarga (KK)
2. KK dan KTP Hilang
3. Akta Kematian
4. Akta Kelahiran
5. Pindah Domisili
6. Kartu Identitas Anak (KIA)

💡 Ketik "menu" kapan saja untuk kembali ke daftar ini
💡 Atau ketik nama layanan langsung (contoh: "akta kelahiran")

---

User: akta lahir

Bot:
💡 Mungkin maksud Anda: "Akta Kelahiran"

📄 AKTA KELAHIRAN

✅ Syarat yang diperlukan:

1. Surat keterangan kelahiran dari dokter/bidan/rumah sakit
2. KTP asli dan fotocopy kedua orang tua
3. Kartu Keluarga (KK) asli dan fotocopy
...
```

## 🎛️ Menggunakan Dashboard Admin

### 1. Kelola Layanan

**Menambah Layanan Baru:**
1. Login ke dashboard
2. Klik **Layanan** di navbar
3. Klik **+ Tambah Layanan**
4. Isi nama layanan
5. Tambahkan syarat-syarat (klik "+ Tambah Syarat" untuk baris baru)
6. Klik **Simpan Layanan**

**Mengedit Layanan:**
1. Di halaman Layanan, klik **Edit** pada layanan yang ingin diubah
2. Ubah nama atau syarat
3. Klik **Update Layanan**

**Menghapus Layanan:**
1. Klik **Hapus** pada layanan yang ingin dihapus
2. Konfirmasi penghapusan

⚠️ **Perubahan langsung berlaku** di bot tanpa perlu restart!

### 2. Melihat Riwayat Chat

**Fitur:**
- Log semua percakapan antara warga dan bot
- Filter berdasarkan rentang tanggal
- Pagination untuk navigasi data banyak
- Info layanan yang ditanyakan

**Cara Menggunakan:**
1. Klik **Riwayat Chat** di navbar
2. (Opsional) Set filter tanggal mulai dan selesai
3. Klik **Filter** atau **Reset**

### 3. Melihat Statistik

**Data yang ditampilkan:**
- Total unique users (nomor WA berbeda)
- Top layanan paling banyak ditanya
- Statistik per layanan (jumlah, pertama/terakhir ditanya)
- Aktivitas 7 hari terakhir
- Insight otomatis

**Cara Menggunakan:**
1. Klik **Statistik** di navbar
2. Lihat grafik dan tabel statistik

## 🗂️ Struktur Project

```
chatbot-administrasi-desa/
├── bot.js                          # Bot WhatsApp (utama)
├── layanan.json                    # Data awal (arsip, sudah di-migrate)
├── package.json                    # Dependencies & scripts
├── db/
│   ├── desa.db                     # Database SQLite (auto-generated)
│   ├── schema.sql                  # Definisi struktur tabel
│   └── migrate-from-json.js        # Script migrasi sekali jalan
├── dashboard/
│   ├── server.js                   # Express server
│   ├── views/                      # Template EJS
│   │   ├── login.ejs
│   │   ├── index.ejs               # Dashboard utama
│   │   ├── layanan/
│   │   │   ├── index.ejs           # List layanan
│   │   │   └── form.ejs            # Form tambah/edit
│   │   ├── riwayat.ejs             # Log chat
│   │   └── statistik.ejs           # Statistik
│   └── public/                     # Static assets
│       ├── css/
│       │   └── style.css
│       └── js/
│           └── script.js
└── auth_info/                      # Data autentikasi WA (auto-generated)
```

## 📊 Struktur Database

### Tabel: `layanan`
- `id` (primary key)
- `nama` (nama layanan)
- `created_at`, `updated_at`

### Tabel: `syarat`
- `id` (primary key)
- `layanan_id` (foreign key → layanan.id)
- `deskripsi` (teks syarat)
- `urutan` (urutan tampil)

### Tabel: `log_chat`
- `id` (primary key)
- `nomor_wa` (nomor WhatsApp user)
- `pesan_masuk` (pesan dari user)
- `balasan_bot` (balasan dari bot)
- `layanan_id` (foreign key, nullable)
- `waktu` (timestamp)

### Tabel: `admin`
- `id` (primary key)
- `username`
- `password_hash` (bcrypt)
- `nama_lengkap`
- `created_at`, `last_login`

## 🔧 Troubleshooting

### Bot: QR Code Tidak Muncul atau Terlalu Besar

- Pastikan terminal cukup lebar
- Perkecil font terminal (Ctrl + -)
- Atau screenshot QR code lalu scan dari foto

### Bot: Error "Database not found"

```bash
npm run migrate
```

Database belum dibuat. Jalankan migrasi dulu.

### Bot: Logout Sendiri

Jika bot logout (connection closed dengan reason `loggedOut`):
1. Hapus folder **`auth_info`**
2. Jalankan ulang bot dengan `npm start`
3. Scan QR code lagi

### Dashboard: Error "Cannot GET /"

Pastikan Anda sudah:
1. Install dependencies: `npm install`
2. Migrasi database: `npm run migrate`
3. Jalankan dashboard: `npm run dashboard`

### Dashboard: Lupa Password

1. Stop dashboard (Ctrl+C)
2. Hapus database: `db/desa.db`
3. Jalankan ulang migrasi: `npm run migrate`
4. Login dengan default: admin/admin123

### Error: Module not found

```bash
npm install
```

Dependencies belum terinstall atau tidak lengkap.

### Bot Tidak Merespon

- Pastikan bot masih berjalan di terminal (tidak ada error)
- Cek apakah Anda mengirim ke nomor yang benar
- Bot **hanya merespon chat personal**, tidak di grup WhatsApp

## 💡 Tips & Best Practices

### Keamanan
- ⚠️ **Ganti password admin default** setelah login pertama kali
- Folder **`auth_info/`** berisi data login WhatsApp, **JANGAN** dibagikan
- File `.gitignore` sudah dikonfigurasi untuk melindungi data sensitif

### Backup Database
```bash
copy db\desa.db db\desa.db.backup
```

Backup berkala untuk menghindari kehilangan data.

### Performance
- Bot dan dashboard bisa jalan di komputer yang sama
- Untuk traffic tinggi, pertimbangkan hosting di VPS/server
- Database SQLite cocok untuk 100-1000 users, untuk lebih besar gunakan PostgreSQL/MySQL

### Pengembangan Lanjutan
- Tambah fitur broadcast message
- Integrasi dengan sistem e-government
- Multi-desa/multi-tenant support
- Export statistik ke Excel/PDF

## 🔄 Cara Update Data Layanan

Ada 2 cara:

### 1. Via Dashboard (Recommended)
- Login ke http://localhost:3000
- Kelola melalui menu Layanan
- Perubahan langsung berlaku tanpa restart

### 2. Via Database Langsung
- Edit file `db/desa.db` dengan SQLite browser
- Atau jalankan query SQL manual
- Restart bot untuk memastikan cache ter-refresh

## 📝 Catatan Penting

### Tentang WhatsApp API
- Bot ini **TIDAK menggunakan API resmi WhatsApp Business** (tidak perlu approval Meta)
- Bot menggunakan **WhatsApp Web protocol** melalui library Baileys
- Bot **hanya merespon chat personal**, tidak di grup WhatsApp
- Koneksi bisa putus jika HP atau laptop mati/tidak terkoneksi internet

### Tentang AI/LLM
- Bot ini **100% rule-based**, tidak ada AI/LLM/NLP
- Validasi input "pintar" menggunakan **algoritma Levenshtein distance** (string similarity)
- Semua balasan diambil dari **database statis**, bukan digenerate oleh AI

### Skalabilitas
- SQLite cocok untuk kantor desa skala kecil-menengah (< 1000 users/day)
- Untuk skala lebih besar, migrasi ke PostgreSQL/MySQL
- Mudah di-deploy ke VPS (DigitalOcean, AWS, dll)

## 🎯 Roadmap (Fitur Masa Depan)

- [ ] Export statistik ke Excel/PDF
- [ ] Broadcast message ke semua user
- [ ] Multi-admin dengan role permissions
- [ ] Integrasi notifikasi email
- [ ] Multi-desa support
- [ ] API endpoint untuk integrasi eksternal

## 📞 Support

Jika ada pertanyaan atau kendala, silakan hubungi admin teknis desa atau buat issue di repository project ini.

---

**Dibuat untuk Kantor Desa** 🏛️  
**Version 2.0** - Database, Dashboard, & Typo-Tolerant Input

© 2026 Chatbot Administrasi Desa. All rights reserved.
