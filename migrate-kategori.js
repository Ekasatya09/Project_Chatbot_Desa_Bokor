import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'db', 'desa.db');
const SQL_PATH = path.join(__dirname, 'db', 'add_kategori.sql');

console.log('🔄 Memulai migrasi kategori...\n');

try {
  // Buka koneksi database
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  
  console.log('✅ Terhubung ke database:', DB_PATH);
  
  // Cek apakah tabel kategori sudah ada
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='kategori'
  `).get();
  
  if (tableExists) {
    console.log('ℹ️  Tabel kategori sudah ada, melewati pembuatan tabel...');
  }
  
  // Cek apakah kolom kategori_id sudah ada di tabel layanan
  const columnInfo = db.pragma('table_info(layanan)');
  const kategoriIdExists = columnInfo.some(col => col.name === 'kategori_id');
  
  if (!kategoriIdExists) {
    console.log('📝 Menambahkan kolom kategori_id ke tabel layanan...');
    db.prepare('ALTER TABLE layanan ADD COLUMN kategori_id INTEGER REFERENCES kategori(id) ON DELETE SET NULL').run();
    console.log('✅ Kolom kategori_id berhasil ditambahkan');
  } else {
    console.log('ℹ️  Kolom kategori_id sudah ada di tabel layanan');
  }
  
  // Jalankan SQL migrasi
  console.log('\n📝 Menjalankan script migrasi...');
  const sql = fs.readFileSync(SQL_PATH, 'utf-8');
  
  // Split SQL menjadi statement individual (berdasarkan ;)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    try {
      db.prepare(statement).run();
    } catch (err) {
      // Abaikan error jika sudah ada (misal: unique constraint)
      if (!err.message.includes('already exists') && !err.message.includes('UNIQUE constraint')) {
        console.warn('⚠️  Warning:', err.message);
      }
    }
  }
  
  console.log('✅ Script migrasi berhasil dijalankan');
  
  // Cek hasil
  const kategoriCount = db.prepare('SELECT COUNT(*) as total FROM kategori').get();
  console.log(`\n📊 Total kategori dalam database: ${kategoriCount.total}`);
  
  const kategoriList = db.prepare('SELECT id, nama, urutan FROM kategori ORDER BY urutan, nama').all();
  console.log('\n📂 Daftar Kategori:');
  kategoriList.forEach(kat => {
    console.log(`   ${kat.urutan}. ${kat.nama} (ID: ${kat.id})`);
  });
  
  db.close();
  console.log('\n✅ Migrasi kategori selesai!');
  console.log('💡 Silakan restart server dashboard dan coba akses /kategori');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}
