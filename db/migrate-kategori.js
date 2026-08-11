/**
 * Migrasi: Tambah sistem kategori layanan (hierarki 3 level)
 * Aman dijalankan berulang — menggunakan IF NOT EXISTS dan cek kolom.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'desa.db');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

console.log('🔧 Memulai migrasi sistem kategori...\n');

db.transaction(() => {
  // ── 1. Tabel kategori ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS kategori (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nama       TEXT    NOT NULL UNIQUE,
      urutan     INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Tabel kategori siap');

  // ── 2. Kolom kategori_id pada layanan (nullable) ───────────────
  const cols = db.pragma('table_info(layanan)').map((c) => c.name);
  if (!cols.includes('kategori_id')) {
    db.exec(`ALTER TABLE layanan ADD COLUMN kategori_id INTEGER REFERENCES kategori(id) ON DELETE SET NULL;`);
    console.log('✅ Kolom kategori_id ditambahkan ke layanan');
  } else {
    console.log('ℹ️  Kolom kategori_id sudah ada, dilewati');
  }

  // ── 3. Tabel sub_opsi ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS sub_opsi (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      layanan_id INTEGER NOT NULL REFERENCES layanan(id) ON DELETE CASCADE,
      nama       TEXT    NOT NULL,
      urutan     INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Tabel sub_opsi siap');

  // ── 4. Tabel syarat_sub_opsi ──────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS syarat_sub_opsi (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sub_opsi_id INTEGER NOT NULL REFERENCES sub_opsi(id) ON DELETE CASCADE,
      deskripsi   TEXT    NOT NULL,
      urutan      INTEGER NOT NULL DEFAULT 0
    );
  `);
  console.log('✅ Tabel syarat_sub_opsi siap');

  // ── 5. Indexes ────────────────────────────────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_layanan_kategori ON layanan(kategori_id);
    CREATE INDEX IF NOT EXISTS idx_sub_opsi_layanan ON sub_opsi(layanan_id);
    CREATE INDEX IF NOT EXISTS idx_syarat_sub_opsi  ON syarat_sub_opsi(sub_opsi_id);
  `);
  console.log('✅ Index dibuat');
})();

console.log('\n🎉 Migrasi selesai! Database siap digunakan.\n');
db.close();
