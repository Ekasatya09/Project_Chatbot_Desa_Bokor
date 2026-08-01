import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== KONFIGURASI =====
const DB_PATH = path.join(__dirname, 'desa.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const JSON_PATH = path.join(__dirname, '..', 'layanan.json');

// Password default admin
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const DEFAULT_ADMIN_NAMA = 'Administrator Desa';

console.log('🚀 Memulai migrasi database...\n');

// ===== LANGKAH 1: Buat database dan tabel =====
console.log('📋 Langkah 1: Membuat struktur database...');

// Hapus database lama jika ada (untuk migrasi fresh)
if (fs.existsSync(DB_PATH)) {
  console.log('⚠️  Database lama ditemukan, akan di-backup...');
  const backupPath = `${DB_PATH}.backup.${Date.now()}`;
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`✅ Backup disimpan ke: ${backupPath}`);
  fs.unlinkSync(DB_PATH);
}

// Buat koneksi database
const db = new Database(DB_PATH);
console.log(`✅ Database baru dibuat: ${DB_PATH}`);

// Jalankan schema SQL
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

// Eksekusi langsung keseluruhan schema (better-sqlite3 bisa handle multiple statements)
try {
  db.exec(schema);
  console.log('✅ Struktur tabel berhasil dibuat\n');
} catch (error) {
  console.error('❌ Error membuat tabel:', error.message);
  process.exit(1);
}

// ===== LANGKAH 2: Migrasi data dari layanan.json =====
console.log('📋 Langkah 2: Migrasi data dari layanan.json...');

if (!fs.existsSync(JSON_PATH)) {
  console.error(`❌ File ${JSON_PATH} tidak ditemukan!`);
  process.exit(1);
}

const layananData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
console.log(`📄 Ditemukan ${layananData.length} layanan di file JSON`);

// Prepared statements untuk insert
const insertLayanan = db.prepare('INSERT INTO layanan (nama) VALUES (?)');
const insertSyarat = db.prepare(
  'INSERT INTO syarat (layanan_id, deskripsi, urutan) VALUES (?, ?, ?)'
);

// Mulai transaksi untuk performa
const migrateAll = db.transaction(() => {
  let totalSyarat = 0;

  for (const layanan of layananData) {
    // Insert layanan
    const result = insertLayanan.run(layanan.nama);
    const layananId = result.lastInsertRowid;

    console.log(`  ✅ Layanan: "${layanan.nama}" (ID: ${layananId})`);

    // Insert semua syarat untuk layanan ini
    if (Array.isArray(layanan.syarat)) {
      layanan.syarat.forEach((syarat, index) => {
        insertSyarat.run(layananId, syarat, index + 1);
        totalSyarat++;
      });
      console.log(`     └─ ${layanan.syarat.length} syarat ditambahkan`);
    }
  }

  return totalSyarat;
});

const totalSyarat = migrateAll();
console.log(`\n✅ Migrasi selesai: ${layananData.length} layanan, ${totalSyarat} syarat\n`);

// ===== LANGKAH 3: Buat akun admin default =====
console.log('📋 Langkah 3: Membuat akun admin default...');

// Hapus entry admin placeholder dari schema
db.prepare('DELETE FROM admin WHERE username = ?').run(DEFAULT_ADMIN_USERNAME);

// Hash password dengan bcrypt
const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);

// Insert admin baru
db.prepare(
  'INSERT INTO admin (username, password_hash, nama_lengkap) VALUES (?, ?, ?)'
).run(DEFAULT_ADMIN_USERNAME, passwordHash, DEFAULT_ADMIN_NAMA);

console.log('✅ Akun admin berhasil dibuat');
console.log(`   Username: ${DEFAULT_ADMIN_USERNAME}`);
console.log(`   Password: ${DEFAULT_ADMIN_PASSWORD}`);
console.log('   ⚠️  PENTING: Ganti password ini setelah login pertama kali!\n');

// ===== LANGKAH 4: Verifikasi data =====
console.log('📋 Langkah 4: Verifikasi data...');

const countLayanan = db.prepare('SELECT COUNT(*) as total FROM layanan').get();
const countSyarat = db.prepare('SELECT COUNT(*) as total FROM syarat').get();
const countAdmin = db.prepare('SELECT COUNT(*) as total FROM admin').get();

console.log(`✅ Total layanan: ${countLayanan.total}`);
console.log(`✅ Total syarat: ${countSyarat.total}`);
console.log(`✅ Total admin: ${countAdmin.total}`);

// Tutup koneksi
db.close();

console.log('\n🎉 Migrasi database berhasil!');
console.log('📂 File database: ' + DB_PATH);
console.log('\n💡 Langkah selanjutnya:');
console.log('   1. Jalankan bot: npm start');
console.log('   2. Jalankan dashboard: npm run dashboard');
console.log('   3. Buka browser: http://localhost:3000');
console.log('   4. Login dengan username "admin" dan password "admin123"\n');
