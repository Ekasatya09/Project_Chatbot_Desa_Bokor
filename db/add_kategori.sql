-- ===== MIGRASI: TAMBAH TABEL KATEGORI =====
-- Menambahkan fitur kategori untuk mengelompokkan layanan

-- Tabel: kategori
-- Menyimpan kategori layanan (misal: KK, KTP, Akta, dll)
CREATE TABLE IF NOT EXISTS kategori (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL UNIQUE,
  urutan INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tambah kolom kategori_id ke tabel layanan (jika belum ada)
-- SQLite tidak support ALTER TABLE ADD COLUMN IF NOT EXISTS, jadi kita check dulu
-- Jalankan ini secara manual atau lewat kode

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_kategori_urutan ON kategori(urutan);
CREATE INDEX IF NOT EXISTS idx_layanan_kategori ON layanan(kategori_id);

-- Trigger untuk auto-update updated_at pada kategori
CREATE TRIGGER IF NOT EXISTS update_kategori_timestamp 
AFTER UPDATE ON kategori
BEGIN
  UPDATE kategori SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Insert kategori default (contoh)
INSERT OR IGNORE INTO kategori (nama, urutan) VALUES ('Kartu Keluarga', 1);
INSERT OR IGNORE INTO kategori (nama, urutan) VALUES ('KTP', 2);
INSERT OR IGNORE INTO kategori (nama, urutan) VALUES ('Akta', 3);
INSERT OR IGNORE INTO kategori (nama, urutan) VALUES ('Surat Keterangan', 4);
INSERT OR IGNORE INTO kategori (nama, urutan) VALUES ('Lainnya', 99);
