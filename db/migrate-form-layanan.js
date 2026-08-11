/**
 * Migrasi: Tambah kolom form_url di tabel layanan
 *
 * Perubahan:
 * 1. Tambah kolom `form_url` di tabel layanan (link form online per layanan)
 *
 * Jalankan: node db/migrate-form-layanan.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'desa.db');

try {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  console.log('🔄 Menjalankan migrasi form layanan...\n');

  // ── 1. Tambah kolom form_url ke tabel layanan (jika belum ada) ────────────
  const koloms = db.prepare('PRAGMA table_info(layanan)').all();
  const sudahAdaFormUrl = koloms.some(c => c.name === 'form_url');

  if (!sudahAdaFormUrl) {
    db.prepare('ALTER TABLE layanan ADD COLUMN form_url TEXT').run();
    console.log('✅ Kolom form_url ditambahkan ke tabel layanan');
  } else {
    console.log('⏭️  Kolom form_url sudah ada di tabel layanan, dilewati');
  }

  db.close();
  console.log('\n🎉 Migrasi form layanan selesai!');

} catch (error) {
  console.error('❌ Migrasi gagal:', error.message);
  process.exit(1);
}
