import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { startBot, stopBot, resetBot, getBotStatus, getQrString, getWaNomor, bersihkanNomor } from '../bot-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== KONFIGURASI =====
const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, '..', 'db', 'desa.db');
const SESSION_SECRET = 'desa-chatbot-secret-key-2024'; // Ganti dengan random string di production

// ===== MIDDLEWARE =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session untuk authentication
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 jam
}));

// CORS untuk frontend React Native Web (dev server terpisah)
const DEV_ORIGIN = process.env.DASHBOARD_DEV_ORIGIN || 'http://localhost:8081';
app.use(cors({
  origin: DEV_ORIGIN.split(',').map((o) => o.trim()),
  credentials: true
}));

// ===== ROUTES: STATIC REACT NATIVE WEB (fallback) =====
// Build web dari mobile/ disajikan HANYA untuk route yang tidak ditangani
// dashboard EJS (mis. deep link SPA mobile). Dashboard admin EJS tetap menjadi
// halaman utama agar fitur (termasuk reset WhatsApp) selalu tampil.
const MOBILE_WEB_DIST = path.join(__dirname, '..', 'mobile', 'dist');
let MOBILE_WEB_AVAILABLE = false;

// ===== INISIALISASI DATABASE =====
let db;
try {
  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  console.log('✅ Dashboard terhubung ke database');
} catch (error) {
  console.error('❌ Gagal koneksi database:', error.message);
  console.error('💡 Jalankan migrasi dulu: npm run migrate');
  process.exit(1);
}

// Cek ketersediaan build React Native Web (untuk SPA fallback di akhir)
MOBILE_WEB_AVAILABLE = fs.existsSync(MOBILE_WEB_DIST);
if (MOBILE_WEB_AVAILABLE) {
  console.log('📱 Build React Native Web ditemukan (mobile/dist) — dipakai untuk route yang tidak ada di dashboard EJS');
}

// bersihkanNomor diimport dari bot-core.js (sudah bisa resolve LID ke nomor asli)

// ===== MIDDLEWARE AUTHENTICATION =====
function requireAuth(req, res, next) {
  if (req.session.adminId) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Auth untuk API JSON (mengembalikan 401, bukan redirect)
function apiAuth(req, res, next) {
  if (req.session.adminId) {
    next();
  } else {
    res.status(401).json({ error: 'Tidak terautentikasi. Silakan login.' });
  }
}

// ===== ROUTES: AUTHENTICATION =====

// Halaman login
app.get('/login', (req, res) => {
  if (req.session.adminId) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// Proses login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
  
  if (!admin) {
    return res.render('login', { error: 'Username tidak ditemukan' });
  }
  
  const passwordValid = bcrypt.compareSync(password, admin.password_hash);
  
  if (!passwordValid) {
    return res.render('login', { error: 'Password salah' });
  }
  
  // Set session
  req.session.adminId = admin.id;
  req.session.adminUsername = admin.username;
  req.session.adminNama = admin.nama_lengkap;
  
  // Update last login
  db.prepare('UPDATE admin SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(admin.id);
  
  // Jika WA belum terhubung, arahkan ke bot-status untuk scan QR
  const botRow = db.prepare('SELECT status FROM bot_status WHERE id = 1').get();
  if (!botRow || botRow.status !== 'connected') {
    return res.redirect('/bot-status?autoconnect=1');
  }

  res.redirect('/');
});


// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ===== ROUTES: DASHBOARD =====

// Halaman utama (statistik)
app.get('/', requireAuth, (req, res) => {
  // Statistik umum
  const totalLayanan = db.prepare('SELECT COUNT(*) as total FROM layanan').get().total;
  const totalChat = db.prepare('SELECT COUNT(*) as total FROM log_chat').get().total;
  const totalChatHariIni = db.prepare(
    "SELECT COUNT(*) as total FROM log_chat WHERE DATE(waktu) = DATE('now')"
  ).get().total;
  
  // Top 5 layanan paling banyak ditanya
  const topLayanan = db.prepare(`
    SELECT l.nama, COUNT(lc.id) as jumlah
    FROM layanan l
    LEFT JOIN log_chat lc ON l.id = lc.layanan_id
    WHERE lc.layanan_id IS NOT NULL
    GROUP BY l.id
    ORDER BY jumlah DESC
    LIMIT 5
  `).all();
  
  // Chat terbaru (10 terakhir)
  const chatTerbaru = db.prepare(`
    SELECT 
      lc.id,
      lc.nomor_wa,
      lc.pesan_masuk,
      lc.waktu,
      l.nama as layanan_nama
    FROM log_chat lc
    LEFT JOIN layanan l ON lc.layanan_id = l.id
    ORDER BY lc.waktu DESC
    LIMIT 10
  `).all();
  
  res.render('index', {
    admin: req.session,
    stats: {
      totalLayanan,
      totalChat,
      totalChatHariIni,
      topLayanan,
      chatTerbaru
    }
  });
});

// ===== ROUTES: LAYANAN =====

// Daftar layanan
app.get('/layanan', requireAuth, (req, res) => {
  const layananList = db.prepare(`
    SELECT
      l.*,
      COUNT(DISTINCT s.id)  AS jumlah_syarat,
      COUNT(DISTINCT so.id) AS jumlah_sub_opsi,
      k.nama                AS kategori_nama
    FROM layanan l
    LEFT JOIN syarat   s  ON l.id = s.layanan_id
    LEFT JOIN sub_opsi so ON l.id = so.layanan_id
    LEFT JOIN kategori k  ON l.kategori_id = k.id
    GROUP BY l.id
    ORDER BY k.urutan, k.nama, l.nama
  `).all();
  
  res.render('layanan/index', {
    admin: req.session,
    layananList
  });
});

// Form tambah layanan
app.get('/layanan/tambah', requireAuth, (req, res) => {
  const kategoriList = db.prepare('SELECT id, nama FROM kategori ORDER BY urutan, nama').all();
  res.render('layanan/form', {
    admin: req.session,
    layanan: null,
    syaratList: [],
    subOpsiList: [],
    kategoriList,
    mode: 'tambah'
  });
});

// Proses tambah layanan
app.post('/layanan/tambah', requireAuth, (req, res) => {
  const { nama, kategori_id, syarat, sub_opsi_nama, sub_opsi_syarat } = req.body;
  
  try {
    // Start transaction
    const insertLayanan = db.prepare('INSERT INTO layanan (nama, kategori_id) VALUES (?, ?)');
    const result = insertLayanan.run(nama, kategori_id || null);
    const layananId = result.lastInsertRowid;
    
    // Insert syarat (jika ada)
    if (Array.isArray(syarat) && syarat.length > 0) {
      const insertSyarat = db.prepare(
        'INSERT INTO syarat (layanan_id, deskripsi, urutan) VALUES (?, ?, ?)'
      );
      
      syarat.forEach((desc, index) => {
        if (desc && desc.trim()) {
          insertSyarat.run(layananId, desc.trim(), index + 1);
        }
      });
    }
    
    // Insert sub-opsi (jika ada)
    if (Array.isArray(sub_opsi_nama)) {
      const insertSO = db.prepare(
        'INSERT INTO sub_opsi (layanan_id, nama, urutan) VALUES (?, ?, ?)'
      );
      const insertSS = db.prepare(
        'INSERT INTO syarat_sub_opsi (sub_opsi_id, deskripsi, urutan) VALUES (?, ?, ?)'
      );
      
      sub_opsi_nama.forEach((soNama, soIndex) => {
        if (!soNama || !soNama.trim()) return;
        const soId = insertSO.run(layananId, soNama.trim(), soIndex + 1).lastInsertRowid;
        
        const syaratSo = (sub_opsi_syarat && sub_opsi_syarat[soIndex]) || [];
        if (Array.isArray(syaratSo)) {
          syaratSo.forEach((desc, sIdx) => {
            if (desc && desc.trim()) {
              insertSS.run(soId, desc.trim(), sIdx + 1);
            }
          });
        }
      });
    }
    
    res.redirect('/layanan?success=tambah');
  } catch (error) {
    console.error('Error tambah layanan:', error);
    res.redirect('/layanan?error=tambah');
  }
});

// Form edit layanan
app.get('/layanan/edit/:id', requireAuth, (req, res) => {
  const layanan = db.prepare('SELECT * FROM layanan WHERE id = ?').get(req.params.id);
  
  if (!layanan) {
    return res.redirect('/layanan?error=notfound');
  }
  
  const syaratList = db.prepare(
    'SELECT * FROM syarat WHERE layanan_id = ? ORDER BY urutan'
  ).all(req.params.id);
  
  const subOpsiRows = db.prepare(
    'SELECT * FROM sub_opsi WHERE layanan_id = ? ORDER BY urutan'
  ).all(req.params.id);
  
  // Ambil syarat per sub-opsi
  const stmtSyaratSub = db.prepare(
    'SELECT * FROM syarat_sub_opsi WHERE sub_opsi_id = ? ORDER BY urutan'
  );
  const subOpsiList = subOpsiRows.map(so => ({
    ...so,
    syaratList: stmtSyaratSub.all(so.id)
  }));
  
  const kategoriList = db.prepare('SELECT id, nama FROM kategori ORDER BY urutan, nama').all();
  
  res.render('layanan/form', {
    admin: req.session,
    layanan,
    syaratList,
    subOpsiList,
    kategoriList,
    mode: 'edit'
  });
});

// Proses edit layanan
app.post('/layanan/edit/:id', requireAuth, (req, res) => {
  const { nama, kategori_id, syarat, syarat_id, sub_opsi_nama, sub_opsi_syarat } = req.body;
  const layananId = req.params.id;
  
  try {
    // Update nama layanan + kategori
    db.prepare('UPDATE layanan SET nama = ?, kategori_id = ? WHERE id = ?').run(nama, kategori_id || null, layananId);
    
    // Hapus semua syarat lama
    db.prepare('DELETE FROM syarat WHERE layanan_id = ?').run(layananId);
    
    // Insert syarat baru
    if (Array.isArray(syarat) && syarat.length > 0) {
      const insertSyarat = db.prepare(
        'INSERT INTO syarat (layanan_id, deskripsi, urutan) VALUES (?, ?, ?)'
      );
      
      syarat.forEach((desc, index) => {
        if (desc && desc.trim()) {
          insertSyarat.run(layananId, desc.trim(), index + 1);
        }
      });
    }
    
    // Hapus semua sub-opsi lama (dan syarat_sub_opsi via CASCADE)
    db.prepare('DELETE FROM sub_opsi WHERE layanan_id = ?').run(layananId);
    
    // Insert sub-opsi baru (jika ada)
    if (Array.isArray(sub_opsi_nama)) {
      const insertSO = db.prepare(
        'INSERT INTO sub_opsi (layanan_id, nama, urutan) VALUES (?, ?, ?)'
      );
      const insertSS = db.prepare(
        'INSERT INTO syarat_sub_opsi (sub_opsi_id, deskripsi, urutan) VALUES (?, ?, ?)'
      );
      
      sub_opsi_nama.forEach((soNama, soIndex) => {
        if (!soNama || !soNama.trim()) return;
        const soId = insertSO.run(layananId, soNama.trim(), soIndex + 1).lastInsertRowid;
        
        const syaratSo = (sub_opsi_syarat && sub_opsi_syarat[soIndex]) || [];
        if (Array.isArray(syaratSo)) {
          syaratSo.forEach((desc, sIdx) => {
            if (desc && desc.trim()) {
              insertSS.run(soId, desc.trim(), sIdx + 1);
            }
          });
        }
      });
    }
    
    res.redirect('/layanan?success=edit');
  } catch (error) {
    console.error('Error edit layanan:', error);
    res.redirect(`/layanan/edit/${layananId}?error=edit`);
  }
});

// Hapus layanan
app.post('/layanan/hapus/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM layanan WHERE id = ?').run(req.params.id);
    res.redirect('/layanan?success=hapus');
  } catch (error) {
    console.error('Error hapus layanan:', error);
    res.redirect('/layanan?error=hapus');
  }
});

// ===== ROUTES: RIWAYAT CHAT =====

app.get('/riwayat', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  
  // Filter tanggal
  const tanggalMulai = req.query.tanggal_mulai || '';
  const tanggalSelesai = req.query.tanggal_selesai || '';
  
  let whereClause = '';
  let params = [];
  
  if (tanggalMulai && tanggalSelesai) {
    whereClause = 'WHERE DATE(lc.waktu) BETWEEN ? AND ?';
    params = [tanggalMulai, tanggalSelesai];
  } else if (tanggalMulai) {
    whereClause = 'WHERE DATE(lc.waktu) >= ?';
    params = [tanggalMulai];
  } else if (tanggalSelesai) {
    whereClause = 'WHERE DATE(lc.waktu) <= ?';
    params = [tanggalSelesai];
  }
  
  // Query total untuk pagination
  const totalQuery = `SELECT COUNT(*) as total FROM log_chat lc ${whereClause}`;
  const total = db.prepare(totalQuery).get(...params).total;
  const totalPages = Math.ceil(total / limit);
  
  // Query data
  const dataQuery = `
    SELECT 
      lc.id,
      lc.nomor_wa,
      lc.pesan_masuk,
      lc.balasan_bot,
      lc.waktu,
      l.nama as layanan_nama
    FROM log_chat lc
    LEFT JOIN layanan l ON lc.layanan_id = l.id
    ${whereClause}
    ORDER BY lc.waktu DESC
    LIMIT ? OFFSET ?
  `;
  
  const riwayatList = db.prepare(dataQuery).all(...params, limit, offset);
  
  res.render('riwayat', {
    admin: req.session,
    riwayatList,
    pagination: {
      page,
      totalPages,
      total
    },
    filter: {
      tanggalMulai,
      tanggalSelesai
    }
  });
});

// ===== ROUTES: STATISTIK =====

app.get('/statistik', requireAuth, (req, res) => {
  // Statistik per layanan
  const statsPerLayanan = db.prepare(`
    SELECT 
      l.nama,
      COUNT(lc.id) as jumlah_pertanyaan,
      DATE(MIN(lc.waktu)) as pertama_ditanya,
      DATE(MAX(lc.waktu)) as terakhir_ditanya
    FROM layanan l
    LEFT JOIN log_chat lc ON l.id = lc.layanan_id
    GROUP BY l.id
    ORDER BY jumlah_pertanyaan DESC
  `).all();
  
  // Statistik per hari (7 hari terakhir)
  const statsPerHari = db.prepare(`
    SELECT 
      DATE(waktu) as tanggal,
      COUNT(*) as jumlah
    FROM log_chat
    WHERE DATE(waktu) >= DATE('now', '-7 days')
    GROUP BY DATE(waktu)
    ORDER BY tanggal DESC
  `).all();
  
  // Total unik nomor WA
  const totalUnikWA = db.prepare(
    'SELECT COUNT(DISTINCT nomor_wa) as total FROM log_chat'
  ).get().total;
  
  res.render('statistik', {
    admin: req.session,
    statsPerLayanan,
    statsPerHari,
    totalUnikWA
  });
});

// ===== ROUTES: API JSON (untuk React Native Web) =====

// Login API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);

  if (!admin) {
    return res.status(401).json({ error: 'Username tidak ditemukan' });
  }

  const passwordValid = bcrypt.compareSync(password || '', admin.password_hash);

  if (!passwordValid) {
    return res.status(401).json({ error: 'Password salah' });
  }

  // Set session
  req.session.adminId = admin.id;
  req.session.adminUsername = admin.username;
  req.session.adminNama = admin.nama_lengkap;

  // Update last login
  db.prepare('UPDATE admin SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(admin.id);

  res.json({
    admin: {
      id: admin.id,
      username: admin.username,
      nama_lengkap: admin.nama_lengkap
    }
  });
});

// Logout API
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Info admin saat ini
app.get('/api/me', apiAuth, (req, res) => {
  res.json({
    admin: {
      id: req.session.adminId,
      username: req.session.adminUsername,
      nama_lengkap: req.session.adminNama
    }
  });
});

// Statistik dashboard utama
app.get('/api/stats', apiAuth, (req, res) => {
  const totalLayanan = db.prepare('SELECT COUNT(*) as total FROM layanan').get().total;
  const totalChat = db.prepare('SELECT COUNT(*) as total FROM log_chat').get().total;
  const totalChatHariIni = db.prepare(
    "SELECT COUNT(*) as total FROM log_chat WHERE DATE(waktu) = DATE('now')"
  ).get().total;

  const topLayanan = db.prepare(`
    SELECT l.nama, COUNT(lc.id) as jumlah
    FROM layanan l
    LEFT JOIN log_chat lc ON l.id = lc.layanan_id
    WHERE lc.layanan_id IS NOT NULL
    GROUP BY l.id
    ORDER BY jumlah DESC
    LIMIT 5
  `).all();

  const chatTerbaru = db.prepare(`
    SELECT
      lc.id,
      lc.nomor_wa,
      lc.pesan_masuk,
      lc.waktu,
      l.nama as layanan_nama
    FROM log_chat lc
    LEFT JOIN layanan l ON lc.layanan_id = l.id
    ORDER BY lc.waktu DESC
    LIMIT 10
  `).all().map((chat) => ({
    ...chat,
    nomor_wa: bersihkanNomor(chat.nomor_wa)
  }));

  res.json({
    totalLayanan,
    totalChat,
    totalChatHariIni,
    topLayanan,
    chatTerbaru
  });
});

// ── Kategori ─────────────────────────────────────────────────────────────────

// Daftar semua kategori + jumlah layanan
app.get('/api/kategori', apiAuth, (req, res) => {
  const list = db.prepare(`
    SELECT k.*, COUNT(l.id) as jumlah_layanan
    FROM kategori k
    LEFT JOIN layanan l ON l.kategori_id = k.id
    GROUP BY k.id
    ORDER BY k.urutan, k.nama
  `).all();
  res.json({ kategoriList: list });
});

// Tambah kategori
app.post('/api/kategori', apiAuth, (req, res) => {
  const { nama, urutan } = req.body || {};
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama kategori wajib diisi' });
  try {
    const result = db.prepare('INSERT INTO kategori (nama, urutan) VALUES (?, ?)').run(nama.trim(), urutan ?? 0);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error tambah kategori:', error);
    res.status(500).json({ error: 'Gagal menambah kategori' });
  }
});

// Edit kategori
app.put('/api/kategori/:id', apiAuth, (req, res) => {
  const { nama, urutan } = req.body || {};
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama kategori wajib diisi' });
  try {
    db.prepare('UPDATE kategori SET nama = ?, urutan = ? WHERE id = ?').run(nama.trim(), urutan ?? 0, req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error edit kategori:', error);
    res.status(500).json({ error: 'Gagal mengedit kategori' });
  }
});

// Hapus kategori
app.delete('/api/kategori/:id', apiAuth, (req, res) => {
  try {
    // Null-kan kategori_id pada layanan yang ada
    db.prepare('UPDATE layanan SET kategori_id = NULL WHERE kategori_id = ?').run(req.params.id);
    db.prepare('DELETE FROM kategori WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error hapus kategori:', error);
    res.status(500).json({ error: 'Gagal menghapus kategori' });
  }
});

// ── Layanan ───────────────────────────────────────────────────────────────────

// Daftar layanan (dengan kategori + jumlah sub_opsi)
app.get('/api/layanan', apiAuth, (req, res) => {
  const layananList = db.prepare(`
    SELECT
      l.*,
      COUNT(DISTINCT s.id)  AS jumlah_syarat,
      COUNT(DISTINCT so.id) AS jumlah_sub_opsi,
      k.nama                AS kategori_nama
    FROM layanan l
    LEFT JOIN syarat   s  ON l.id = s.layanan_id
    LEFT JOIN sub_opsi so ON l.id = so.layanan_id
    LEFT JOIN kategori k  ON l.kategori_id = k.id
    GROUP BY l.id
    ORDER BY k.urutan, k.nama, l.nama
  `).all();
  res.json({ layananList });
});

// Detail layanan + syarat + sub_opsi beserta syaratnya
app.get('/api/layanan/:id', apiAuth, (req, res) => {
  const layanan = db.prepare('SELECT * FROM layanan WHERE id = ?').get(req.params.id);
  if (!layanan) return res.status(404).json({ error: 'Layanan tidak ditemukan' });

  const syaratList = db.prepare(
    'SELECT * FROM syarat WHERE layanan_id = ? ORDER BY urutan'
  ).all(req.params.id);

  const subOpsiList = db.prepare(
    'SELECT * FROM sub_opsi WHERE layanan_id = ? ORDER BY urutan'
  ).all(req.params.id);

  const stmtSyaratSub = db.prepare(
    'SELECT * FROM syarat_sub_opsi WHERE sub_opsi_id = ? ORDER BY urutan'
  );

  const subOpsiWithSyarat = subOpsiList.map((so) => ({
    ...so,
    syaratList: stmtSyaratSub.all(so.id),
  }));

  res.json({ layanan, syaratList, subOpsiList: subOpsiWithSyarat });
});

// Tambah layanan
app.post('/api/layanan', apiAuth, (req, res) => {
  const { nama, kategori_id, syarat, sub_opsi } = req.body || {};
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama layanan wajib diisi' });

  try {
    db.transaction(() => {
      const layananId = db.prepare(
        'INSERT INTO layanan (nama, kategori_id) VALUES (?, ?)'
      ).run(nama.trim(), kategori_id || null).lastInsertRowid;

      // Syarat umum
      if (Array.isArray(syarat)) {
        const ins = db.prepare('INSERT INTO syarat (layanan_id, deskripsi, urutan) VALUES (?, ?, ?)');
        syarat.forEach((d, i) => { if (d && d.trim()) ins.run(layananId, d.trim(), i + 1); });
      }

      // Sub-opsi
      if (Array.isArray(sub_opsi)) {
        const insSO = db.prepare('INSERT INTO sub_opsi (layanan_id, nama, urutan) VALUES (?, ?, ?)');
        const insSS = db.prepare('INSERT INTO syarat_sub_opsi (sub_opsi_id, deskripsi, urutan) VALUES (?, ?, ?)');
        sub_opsi.forEach((so, i) => {
          if (!so.nama || !so.nama.trim()) return;
          const soId = insSO.run(layananId, so.nama.trim(), i + 1).lastInsertRowid;
          if (Array.isArray(so.syaratList)) {
            so.syaratList.forEach((d, j) => { if (d && d.trim()) insSS.run(soId, d.trim(), j + 1); });
          }
        });
      }

      res.status(201).json({ id: layananId });
    })();
  } catch (error) {
    console.error('Error tambah layanan:', error);
    res.status(500).json({ error: 'Gagal menambah layanan' });
  }
});

// Edit layanan
app.put('/api/layanan/:id', apiAuth, (req, res) => {
  const { nama, kategori_id, syarat, sub_opsi } = req.body || {};
  const layananId = req.params.id;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama layanan wajib diisi' });

  try {
    db.transaction(() => {
      db.prepare('UPDATE layanan SET nama = ?, kategori_id = ? WHERE id = ?').run(nama.trim(), kategori_id || null, layananId);

      // Syarat umum — replace
      db.prepare('DELETE FROM syarat WHERE layanan_id = ?').run(layananId);
      if (Array.isArray(syarat)) {
        const ins = db.prepare('INSERT INTO syarat (layanan_id, deskripsi, urutan) VALUES (?, ?, ?)');
        syarat.forEach((d, i) => { if (d && d.trim()) ins.run(layananId, d.trim(), i + 1); });
      }

      // Sub-opsi — replace all
      db.prepare('DELETE FROM sub_opsi WHERE layanan_id = ?').run(layananId);
      if (Array.isArray(sub_opsi)) {
        const insSO = db.prepare('INSERT INTO sub_opsi (layanan_id, nama, urutan) VALUES (?, ?, ?)');
        const insSS = db.prepare('INSERT INTO syarat_sub_opsi (sub_opsi_id, deskripsi, urutan) VALUES (?, ?, ?)');
        sub_opsi.forEach((so, i) => {
          if (!so.nama || !so.nama.trim()) return;
          const soId = insSO.run(layananId, so.nama.trim(), i + 1).lastInsertRowid;
          if (Array.isArray(so.syaratList)) {
            so.syaratList.forEach((d, j) => { if (d && d.trim()) insSS.run(soId, d.trim(), j + 1); });
          }
        });
      }
    })();
    res.json({ ok: true });
  } catch (error) {
    console.error('Error edit layanan:', error);
    res.status(500).json({ error: 'Gagal mengedit layanan' });
  }
});

// Hapus layanan
app.delete('/api/layanan/:id', apiAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM layanan WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error hapus layanan:', error);
    res.status(500).json({ error: 'Gagal menghapus layanan' });
  }
});

// Riwayat chat dengan filter tanggal + pagination
app.get('/api/riwayat', apiAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const tanggalMulai = req.query.tanggal_mulai || '';
  const tanggalSelesai = req.query.tanggal_selesai || '';

  let whereClause = '';
  let params = [];

  if (tanggalMulai && tanggalSelesai) {
    whereClause = 'WHERE DATE(lc.waktu) BETWEEN ? AND ?';
    params = [tanggalMulai, tanggalSelesai];
  } else if (tanggalMulai) {
    whereClause = 'WHERE DATE(lc.waktu) >= ?';
    params = [tanggalMulai];
  } else if (tanggalSelesai) {
    whereClause = 'WHERE DATE(lc.waktu) <= ?';
    params = [tanggalSelesai];
  }

  const totalQuery = `SELECT COUNT(*) as total FROM log_chat lc ${whereClause}`;
  const total = db.prepare(totalQuery).get(...params).total;
  const totalPages = Math.ceil(total / limit);

  const dataQuery = `
    SELECT
      lc.id,
      lc.nomor_wa,
      lc.pesan_masuk,
      lc.balasan_bot,
      lc.waktu,
      l.nama as layanan_nama
    FROM log_chat lc
    LEFT JOIN layanan l ON lc.layanan_id = l.id
    ${whereClause}
    ORDER BY lc.waktu DESC
    LIMIT ? OFFSET ?
  `;

  const riwayatList = db.prepare(dataQuery).all(...params, limit, offset).map((chat) => ({
    ...chat,
    nomor_wa: bersihkanNomor(chat.nomor_wa)
  }));

  res.json({
    riwayatList,
    pagination: { page, totalPages, total },
    filter: { tanggalMulai, tanggalSelesai }
  });
});

// Statistik penggunaan bot
app.get('/api/statistik', apiAuth, (req, res) => {
  const statsPerLayanan = db.prepare(`
    SELECT
      l.nama,
      COUNT(lc.id) as jumlah_pertanyaan,
      DATE(MIN(lc.waktu)) as pertama_ditanya,
      DATE(MAX(lc.waktu)) as terakhir_ditanya
    FROM layanan l
    LEFT JOIN log_chat lc ON l.id = lc.layanan_id
    GROUP BY l.id
    ORDER BY jumlah_pertanyaan DESC
  `).all();

  const statsPerHari = db.prepare(`
    SELECT
      DATE(waktu) as tanggal,
      COUNT(*) as jumlah
    FROM log_chat
    WHERE DATE(waktu) >= DATE('now', '-7 days')
    GROUP BY DATE(waktu)
    ORDER BY tanggal DESC
  `).all();

  const totalUnikWA = db.prepare(
    'SELECT COUNT(DISTINCT nomor_wa) as total FROM log_chat'
  ).get().total;

  res.json({
    statsPerLayanan,
    statsPerHari,
    totalUnikWA
  });
});

// ===== ROUTES: LIVE CHAT ADMIN =====

// Halaman Live Chat (EJS)
app.get('/live-chat', requireAuth, (req, res) => {
  const sesiList = db.prepare(`
    SELECT id, nomor_wa, status, mulai_at, expired_at, selesai_at
    FROM sesi_live_chat
    ORDER BY mulai_at DESC
    LIMIT 50
  `).all().map(s => ({
    ...s,
    nomor_wa_bersih: bersihkanNomor(s.nomor_wa)
  }));

  const adminWa = db.prepare(
    'SELECT nomor_wa FROM admin WHERE nomor_wa IS NOT NULL AND nomor_wa != \'\' LIMIT 1'
  ).get();

  res.render('live-chat', {
    admin: req.session,
    sesiList,
    adminWa: adminWa ? adminWa.nomor_wa : ''
  });
});

// API: Daftar sesi live chat
app.get('/api/live-chat', apiAuth, (req, res) => {
  const sesiList = db.prepare(`
    SELECT id, nomor_wa, status, mulai_at, expired_at, selesai_at
    FROM sesi_live_chat
    ORDER BY mulai_at DESC
    LIMIT 50
  `).all().map(s => ({
    ...s,
    nomor_wa_bersih: bersihkanNomor(s.nomor_wa)
  }));
  res.json({ sesiList });
});

// API: Riwayat pesan dalam sesi
app.get('/api/live-chat/:id/pesan', apiAuth, (req, res) => {
  const sesi = db.prepare('SELECT * FROM sesi_live_chat WHERE id = ?').get(req.params.id);
  if (!sesi) return res.status(404).json({ error: 'Sesi tidak ditemukan' });

  const pesanList = db.prepare(
    'SELECT id, arah, isi, waktu FROM pesan_live_chat WHERE sesi_id = ? ORDER BY waktu ASC'
  ).all(req.params.id);

  res.json({
    sesi: { ...sesi, nomor_wa_bersih: bersihkanNomor(sesi.nomor_wa) },
    pesanList
  });
});

// API: Akhiri sesi (dari dashboard)
app.post('/api/live-chat/:id/akhiri', apiAuth, (req, res) => {
  const sesi = db.prepare('SELECT * FROM sesi_live_chat WHERE id = ?').get(req.params.id);
  if (!sesi) return res.status(404).json({ error: 'Sesi tidak ditemukan' });

  if (sesi.status !== 'aktif') {
    return res.status(400).json({ error: 'Sesi sudah tidak aktif' });
  }

  db.prepare(`
    UPDATE sesi_live_chat
    SET status = 'selesai', selesai_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.params.id);

  // Tandai sesi ini untuk di-pickup oleh bot (via DB flag)
  // Bot akan mendeteksi & mengirim notif ke user & admin saat cekSesiExpired berjalan
  // atau kita simpan flag di tabel khusus untuk pickup cepat

  console.log(`🔴 Sesi #${req.params.id} (${sesi.nomor_wa}) diakhiri dari dashboard`);
  res.json({ ok: true, nomor_wa: sesi.nomor_wa });
});

// API: Set / update nomor WA admin
app.put('/api/admin/nomor-wa', apiAuth, (req, res) => {
  const { nomor_wa } = req.body || {};
  if (!nomor_wa && nomor_wa !== '') {
    return res.status(400).json({ error: 'nomor_wa wajib diisi' });
  }

  db.prepare('UPDATE admin SET nomor_wa = ? WHERE id = ?')
    .run(nomor_wa.trim(), req.session.adminId);

  res.json({ ok: true });
});

// API: Ambil nomor WA admin saat ini
app.get('/api/admin/nomor-wa', apiAuth, (req, res) => {
  const admin = db.prepare('SELECT nomor_wa FROM admin WHERE id = ?').get(req.session.adminId);
  res.json({ nomor_wa: admin ? (admin.nomor_wa || '') : '' });
});

// ===== BOT MANAGEMENT ROUTES =====

// Halaman Bot Status
app.get('/bot-status', requireAuth, async (req, res) => {
  const botRow = db.prepare('SELECT * FROM bot_status WHERE id = 1').get();
  res.render('bot-status', {
    admin: req.session,
    botStatus: botRow?.status || 'disconnected',
    waNomor: botRow?.wa_nomor || null,
    autoconnect: req.query.autoconnect === '1'
  });
});

// API: Status bot (polling)
app.get('/api/bot/status', apiAuth, (req, res) => {
  const botRow = db.prepare('SELECT * FROM bot_status WHERE id = 1').get();
  res.json({
    status: botRow?.status || 'disconnected',
    wa_nomor: botRow?.wa_nomor || null,
    updated_at: botRow?.updated_at || null
  });
});

// API: QR Code sebagai data URL (base64 PNG)
app.get('/api/bot/qr', apiAuth, async (req, res) => {
  const botRow = db.prepare('SELECT qr_string, status FROM bot_status WHERE id = 1').get();
  if (!botRow?.qr_string || botRow.status !== 'connecting') {
    return res.json({ qr: null, status: botRow?.status || 'disconnected' });
  }
  try {
    const qrDataUrl = await QRCode.toDataURL(botRow.qr_string, {
      width: 300, margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' }
    });
    res.json({ qr: qrDataUrl, status: 'connecting' });
  } catch (e) {
    res.status(500).json({ error: 'Gagal generate QR' });
  }
});

// API: Reset koneksi WhatsApp
app.post('/api/bot/reset', apiAuth, async (req, res) => {
  try {
    console.log('🔄 Reset WhatsApp diminta dari dashboard...');
    await resetBot();
    res.json({ ok: true, message: 'Reset berhasil. QR code baru sedang digenerate.' });
  } catch (e) {
    console.error('❌ Reset gagal:', e.message);
    res.status(500).json({ error: 'Reset gagal: ' + e.message });
  }
});

// API: Hubungkan WhatsApp (dari status disconnected, tanpa hapus sesi)
app.post('/api/bot/connect', apiAuth, async (req, res) => {
  try {
    const botRow = db.prepare('SELECT status FROM bot_status WHERE id = 1').get();
    if (botRow && (botRow.status === 'connected' || botRow.status === 'connecting')) {
      return res.json({ ok: false, error: 'Bot sudah terhubung atau sedang menghubungkan.' });
    }
    console.log('📲 Menghubungkan WhatsApp dari dashboard...');
    await startBot(db);
    res.json({ ok: true, message: 'Proses koneksi dimulai. Menunggu QR code.' });
  } catch (e) {
    console.error('❌ Connect gagal:', e.message);
    res.status(500).json({ error: 'Gagal memulai koneksi: ' + e.message });
  }
});

// API: Putuskan / Hapus koneksi WhatsApp
app.post('/api/bot/disconnect', apiAuth, async (req, res) => {
  try {
    console.log('🗑️ Putus koneksi WhatsApp diminta dari dashboard...');
    await stopBot();
    // CATATAN: auth_info TIDAK dihapus agar bisa reconnect tanpa scan QR ulang
    // Untuk ganti akun / reset total, gunakan endpoint /api/bot/reset
    db.prepare(`UPDATE bot_status SET status='disconnected', qr_string=NULL, wa_nomor=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=1`).run();
    res.json({ ok: true, message: 'WhatsApp berhasil diputuskan. Klik Hubungkan untuk menyambung kembali.' });
  } catch (e) {
    console.error('❌ Disconnect gagal:', e.message);
    res.status(500).json({ error: 'Gagal memutuskan koneksi: ' + e.message });
  }
});

// ===== SPA FALLBACK (React Native Web) =====
// Hanya melayani route yang TIDAK ditangani dashboard EJS / API di atas.
// Static asset (js/css/gambar) dari build mobile juga dilayani di sini.
if (MOBILE_WEB_AVAILABLE) {
  // Static asset build mobile (hanya jika tidak bertabrakan dengan /public EJS)
  const assetDir = path.join(MOBILE_WEB_DIST, '_expo');
  if (fs.existsSync(assetDir)) {
    app.use('/_expo', express.static(assetDir));
  }
  app.use('/assets', express.static(path.join(MOBILE_WEB_DIST, 'assets')));

  // Route milik build mobile yang tidak ada di dashboard EJS
  const staticHtml = {
    '/qr-connect': 'qr-connect.html'
  };

  app.get('*', (req, res, next) => {
    // /api dan route dashboard (yang tak dikenal) → 404 biasa
    if (req.path.startsWith('/api')) return next();

    // Dynamic route /layanan/:id → layanan/[id].html
    const layananMatch = req.path.match(/^\/layanan\/(\d+)$/);
    if (layananMatch) {
      return res.sendFile(path.join(MOBILE_WEB_DIST, 'layanan', '[id].html'));
    }

    const htmlFile = staticHtml[req.path];
    if (htmlFile) {
      return res.sendFile(path.join(MOBILE_WEB_DIST, htmlFile));
    }

    next();
  });
}

// ===== ERROR HANDLING =====

app.use((req, res) => {
  res.status(404).send('Halaman tidak ditemukan');
});

// ===== START SERVER =====
app.listen(PORT, async () => {
  console.log(`\n🌐 Dashboard Admin Chatbot Desa`);
  console.log(`📍 Buka browser: http://localhost:${PORT}`);
  console.log(`👤 Login: admin / admin123`);
  console.log(`📱 Status Bot: http://localhost:${PORT}/bot-status\n`);

  // Reset status DB ke disconnected saat server start
  // Ini penting untuk handle kasus server mati mendadak (tanpa graceful shutdown)
  // sehingga status tidak tersisa 'connected' dari sesi lama
  try {
    db.prepare(`UPDATE bot_status SET status='disconnected', qr_string=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=1`).run();
    console.log('🔄 Status bot direset ke disconnected (startup)');
  } catch { /* tabel belum ada, abaikan */ }

  // Mulai bot WhatsApp
  try {
    await startBot(db);
  } catch (err) {
    console.error('❌ Gagal memulai bot:', err.message);
  }
});


// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Menutup dashboard...');
  if (db) db.close();
  process.exit(0);
});
