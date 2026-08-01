import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

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

// ===== MIDDLEWARE AUTHENTICATION =====
function requireAuth(req, res, next) {
  if (req.session.adminId) {
    next();
  } else {
    res.redirect('/login');
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
    SELECT l.*, COUNT(s.id) as jumlah_syarat
    FROM layanan l
    LEFT JOIN syarat s ON l.id = s.layanan_id
    GROUP BY l.id
    ORDER BY l.id
  `).all();
  
  res.render('layanan/index', {
    admin: req.session,
    layananList
  });
});

// Form tambah layanan
app.get('/layanan/tambah', requireAuth, (req, res) => {
  res.render('layanan/form', {
    admin: req.session,
    layanan: null,
    syaratList: [],
    mode: 'tambah'
  });
});

// Proses tambah layanan
app.post('/layanan/tambah', requireAuth, (req, res) => {
  const { nama, syarat } = req.body;
  
  try {
    // Start transaction
    const insertLayanan = db.prepare('INSERT INTO layanan (nama) VALUES (?)');
    const result = insertLayanan.run(nama);
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
  
  res.render('layanan/form', {
    admin: req.session,
    layanan,
    syaratList,
    mode: 'edit'
  });
});

// Proses edit layanan
app.post('/layanan/edit/:id', requireAuth, (req, res) => {
  const { nama, syarat, syarat_id } = req.body;
  const layananId = req.params.id;
  
  try {
    // Update nama layanan
    db.prepare('UPDATE layanan SET nama = ? WHERE id = ?').run(nama, layananId);
    
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

// ===== ERROR HANDLING =====
app.use((req, res) => {
  res.status(404).send('Halaman tidak ditemukan');
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`\n🌐 Dashboard Admin Chatbot Desa`);
  console.log(`📍 Buka browser: http://localhost:${PORT}`);
  console.log(`👤 Login dengan username: admin, password: admin123\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Menutup dashboard...');
  if (db) db.close();
  process.exit(0);
});
