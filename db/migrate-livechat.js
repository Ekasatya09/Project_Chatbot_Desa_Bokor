/**
 * Migrasi: Tambah fitur Live Chat Admin (Pilihan 98)
 *
 * Perubahan:
 * 1. Tambah kolom `nomor_wa` di tabel admin
 * 2. Buat tabel `sesi_live_chat`
 * 3. Buat tabel `pesan_live_chat`
 *
 * Jalankan: node db/migrate-livechat.js
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

  console.log('🔄 Menjalankan migrasi live chat...\n');

  // ── 1. Tambah kolom nomor_wa ke tabel admin (jika belum ada) ──────────────
  const koloms = db.prepare("PRAGMA table_info(admin)").all();
  const sudahAdaNomorWa = koloms.some(c => c.name === 'nomor_wa');

  if (!sudahAdaNomorWa) {
    db.prepare('ALTER TABLE admin ADD COLUMN nomor_wa TEXT').run();
    console.log('✅ Kolom nomor_wa ditambahkan ke tabel admin');
  } else {
    console.log('⏭️  Kolom nomor_wa sudah ada di tabel admin, dilewati');
  }

  // ── 2. Buat tabel sesi_live_chat ──────────────────────────────────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sesi_live_chat (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nomor_wa   TEXT    NOT NULL UNIQUE,
      status     TEXT    NOT NULL DEFAULT 'aktif',
      mulai_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      expired_at DATETIME,
      selesai_at DATETIME
    )
  `).run();
  console.log('✅ Tabel sesi_live_chat siap');

  // ── 3. Buat tabel pesan_live_chat ─────────────────────────────────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pesan_live_chat (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      sesi_id  INTEGER NOT NULL,
      arah     TEXT    NOT NULL,
      isi      TEXT    NOT NULL,
      waktu    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sesi_id) REFERENCES sesi_live_chat(id) ON DELETE CASCADE
    )
  `).run();
  console.log('✅ Tabel pesan_live_chat siap');

  // ── 4. Index untuk performa ───────────────────────────────────────────────
  db.prepare('CREATE INDEX IF NOT EXISTS idx_sesi_nomor  ON sesi_live_chat(nomor_wa)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_sesi_status ON sesi_live_chat(status)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_pesan_sesi  ON pesan_live_chat(sesi_id)').run();
  console.log('✅ Index dibuat');

  // ── 5. Buat tabel bot_status (satu baris, status koneksi bot) ─────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS bot_status (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      status     TEXT    NOT NULL DEFAULT 'disconnected',
      qr_string  TEXT,
      wa_nomor   TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  db.prepare("INSERT OR IGNORE INTO bot_status (id, status) VALUES (1, 'disconnected')").run();
  console.log('✅ Tabel bot_status siap');


  db.close();
  console.log('\n🎉 Migrasi live chat selesai!');
  console.log('💡 Sekarang set nomor WA admin melalui dashboard: /live-chat');

} catch (error) {
  console.error('❌ Migrasi gagal:', error.message);
  process.exit(1);
}
