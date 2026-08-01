-- ===== SCHEMA DATABASE CHATBOT ADMINISTRASI DESA =====
-- SQLite Database Schema

-- Tabel: layanan
-- Menyimpan jenis-jenis layanan/surat administrasi desa
CREATE TABLE IF NOT EXISTS layanan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel: syarat
-- Menyimpan syarat-syarat yang dibutuhkan untuk setiap layanan
CREATE TABLE IF NOT EXISTS syarat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layanan_id INTEGER NOT NULL,
  deskripsi TEXT NOT NULL,
  urutan INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (layanan_id) REFERENCES layanan(id) ON DELETE CASCADE
);

-- Tabel: log_chat
-- Menyimpan riwayat percakapan antara user dan bot
CREATE TABLE IF NOT EXISTS log_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomor_wa TEXT NOT NULL,
  pesan_masuk TEXT NOT NULL,
  balasan_bot TEXT NOT NULL,
  layanan_id INTEGER,
  waktu DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (layanan_id) REFERENCES layanan(id) ON DELETE SET NULL
);

-- Tabel: admin
-- Menyimpan kredensial admin untuk dashboard
CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama_lengkap TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_syarat_layanan ON syarat(layanan_id);
CREATE INDEX IF NOT EXISTS idx_syarat_urutan ON syarat(layanan_id, urutan);
CREATE INDEX IF NOT EXISTS idx_log_waktu ON log_chat(waktu DESC);
CREATE INDEX IF NOT EXISTS idx_log_nomor ON log_chat(nomor_wa);
CREATE INDEX IF NOT EXISTS idx_log_layanan ON log_chat(layanan_id);

-- Trigger untuk auto-update updated_at pada layanan
CREATE TRIGGER IF NOT EXISTS update_layanan_timestamp 
AFTER UPDATE ON layanan
BEGIN
  UPDATE layanan SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Insert admin default (username: admin, password: admin123)
-- Password hash dibuat dengan bcrypt, rounds=10
-- PENTING: Ganti password ini setelah login pertama kali!
INSERT OR IGNORE INTO admin (username, password_hash, nama_lengkap) 
VALUES ('admin', '$2b$10$rH5n5qG5x5Y8Z6X8Z6X8Z.X8Z6X8Z6X8Z6X8Z6X8Z6X8Z6X8Z6X8Z6', 'Administrator Desa');

-- Note: Password hash di atas adalah placeholder
-- Hash yang benar akan dibuat saat migrasi pertama kali
