import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import stringSimilarity from 'string-similarity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== KONFIGURASI =====
const FOLDER_AUTH = './auth_info';
const DB_PATH = path.join(__dirname, 'db', 'desa.db');
const SIMILARITY_THRESHOLD = 0.6; // Ambang batas similarity (0-1), di atas ini dianggap cocok

// Penyimpanan sesi user (di memori)
// Key: nomor WA, Value: { state: 'menu' }
const sesiUser = new Map();

// Koneksi database
let db;

// ===== FUNGSI DATABASE =====

/**
 * Inisialisasi koneksi database
 */
function initDatabase() {
  try {
    db = new Database(DB_PATH);
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    console.log('✅ Koneksi database berhasil');
    return true;
  } catch (error) {
    console.error('❌ Gagal koneksi database:', error.message);
    console.error('💡 Jalankan migrasi dulu: npm run migrate');
    return false;
  }
}

/**
 * Membaca semua layanan dari database
 * @returns {Array} Array objek layanan dengan syarat
 */
function bacaDataLayanan() {
  try {
    // Ambil semua layanan
    const layananList = db.prepare('SELECT id, nama FROM layanan ORDER BY id').all();

    // Untuk setiap layanan, ambil syarat-syaratnya
    const stmtSyarat = db.prepare(
      'SELECT deskripsi FROM syarat WHERE layanan_id = ? ORDER BY urutan'
    );

    const hasil = layananList.map(layanan => ({
      id: layanan.id,
      nama: layanan.nama,
      syarat: stmtSyarat.all(layanan.id).map(s => s.deskripsi)
    }));

    return hasil;
  } catch (error) {
    console.error('❌ Gagal membaca data layanan:', error.message);
    return [];
  }
}

/**
 * Mencari layanan berdasarkan ID
 * @param {number} id - ID layanan
 * @returns {Object|null} Objek layanan dengan syarat
 */
function cariLayananById(id) {
  try {
    const layanan = db.prepare('SELECT id, nama FROM layanan WHERE id = ?').get(id);
    if (!layanan) return null;

    const syaratList = db.prepare(
      'SELECT deskripsi FROM syarat WHERE layanan_id = ? ORDER BY urutan'
    ).all(id);

    return {
      id: layanan.id,
      nama: layanan.nama,
      syarat: syaratList.map(s => s.deskripsi)
    };
  } catch (error) {
    console.error('❌ Gagal mencari layanan:', error.message);
    return null;
  }
}

/**
 * Simpan log percakapan ke database
 * @param {string} nomorWa - Nomor WhatsApp
 * @param {string} pesanMasuk - Pesan dari user
 * @param {string} balasanBot - Balasan dari bot
 * @param {number|null} layananId - ID layanan (jika relevan)
 */
function simpanLogChat(nomorWa, pesanMasuk, balasanBot, layananId = null) {
  try {
    const stmt = db.prepare(
      'INSERT INTO log_chat (nomor_wa, pesan_masuk, balasan_bot, layanan_id) VALUES (?, ?, ?, ?)'
    );
    stmt.run(nomorWa, pesanMasuk, balasanBot, layananId);
  } catch (error) {
    console.error('❌ Gagal simpan log chat:', error.message);
  }
}

/**
 * Normalisasi teks untuk pencocokan
 * Menghapus karakter spesial, spasi berlebih, dan lowercase
 * @param {string} teks - Teks yang akan dinormalisasi
 * @returns {string} Teks yang sudah dinormalisasi
 */
function normalisasiTeks(teks) {
  return teks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Hapus karakter spesial
    .replace(/\s+/g, ' ') // Ganti multiple spaces jadi satu
    .trim();
}

/**
 * Cari layanan berdasarkan kesamaan nama (typo-tolerant)
 * Menggunakan algoritma string similarity (Levenshtein distance)
 * @param {string} inputUser - Input dari user
 * @param {Array} daftarLayanan - Array objek layanan
 * @returns {Object|null} Objek { layanan, score } atau null jika tidak ada yang cocok
 */
function cariLayananByNama(inputUser, daftarLayanan) {
  const inputNormalisasi = normalisasiTeks(inputUser);

  // Jika input kosong atau terlalu pendek, return null
  if (inputNormalisasi.length < 3) {
    return null;
  }

  // Buat array nama layanan yang sudah dinormalisasi
  const namaLayananList = daftarLayanan.map(l => normalisasiTeks(l.nama));

  // Cari yang paling mirip menggunakan string-similarity
  const matches = stringSimilarity.findBestMatch(inputNormalisasi, namaLayananList);
  const bestMatch = matches.bestMatch;

  // Jika similarity score di atas threshold, return layanan tersebut
  if (bestMatch.rating >= SIMILARITY_THRESHOLD) {
    const layananIndex = matches.bestMatchIndex;
    return {
      layanan: daftarLayanan[layananIndex],
      score: bestMatch.rating
    };
  }

  // Coba cari juga dengan partial match (apakah input user ada di nama layanan)
  for (let i = 0; i < daftarLayanan.length; i++) {
    const namaLayanan = namaLayananList[i];

    // Cek apakah input ada dalam nama layanan atau sebaliknya
    if (namaLayanan.includes(inputNormalisasi) || inputNormalisasi.includes(namaLayanan)) {
      return {
        layanan: daftarLayanan[i],
        score: 0.7 // Score default untuk partial match
      };
    }
  }

  return null;
}

// ===== FUNGSI UTILITY =====

/**
 * Membuat teks daftar menu layanan
 * @param {Array} layanan - Array objek layanan
 * @returns {string} Teks menu bernomor
 */
function buatTeksMenu(layanan) {
  let teks = '📋 *LAYANAN ADMINISTRASI DESA*\n\n';
  teks += 'Silakan pilih layanan yang Anda butuhkan dengan mengetik nomornya:\n\n';

  layanan.forEach((item, index) => {
    teks += `${index + 1}. ${item.nama}\n`;
  });

  teks += '\n💡 _Ketik "menu" kapan saja untuk kembali ke daftar ini_';
  teks += '\n💡 _Atau ketik nama layanan langsung (contoh: "akta kelahiran")_';
  return teks;
}

/**
 * Membuat teks detail syarat layanan
 * @param {Object} layanan - Objek layanan terpilih
 * @returns {string} Teks detail syarat
 */
function buatTeksDetailLayanan(layanan) {
  let teks = `📄 *${layanan.nama.toUpperCase()}*\n\n`;
  teks += '✅ *Syarat yang diperlukan:*\n\n';

  layanan.syarat.forEach((syarat, index) => {
    teks += `${index + 1}. ${syarat}\n`;
  });

  teks += '\n📍 Silakan datang ke kantor desa dengan membawa dokumen di atas.\n';
  teks += '\n💡 _Ketik "menu" untuk kembali ke daftar layanan_';
  return teks;
}

/**
 * Memproses pesan yang masuk dari user
 * @param {Object} sock - Socket koneksi Baileys
 * @param {Object} pesan - Objek pesan dari Baileys
 */
async function prosesPesan(sock, pesan) {
  try {
    // Ambil informasi pesan
    const nomorPengirim = pesan.key.remoteJid;
    const tipeChat = pesan.key.remoteJid.endsWith('@g.us') ? 'grup' : 'personal';

    // Abaikan pesan dari grup
    if (tipeChat === 'grup') {
      return;
    }

    // Ambil teks pesan
    const isiPesan = pesan.message?.conversation ||
      pesan.message?.extendedTextMessage?.text ||
      '';

    if (!isiPesan) {
      return; // Abaikan jika bukan pesan teks
    }

    // Kirim status "sedang mengetik..."
    await sock.sendPresenceUpdate('composing', nomorPengirim);

    // Tandai pesan sebagai sudah dibaca (centang biru)
    await sock.readMessages([pesan.key]);

    const pesanLowerCase = isiPesan.trim().toLowerCase();

    // Baca data layanan dari database
    const daftarLayanan = bacaDataLayanan();

    if (daftarLayanan.length === 0) {
      const balasan = '⚠️ Maaf, data layanan belum tersedia. Silakan hubungi admin.';
      await sock.sendMessage(nomorPengirim, { text: balasan });
      await sock.sendPresenceUpdate('paused', nomorPengirim);
      simpanLogChat(nomorPengirim, isiPesan, balasan, null);
      return;
    }

    // Cek apakah user meminta menu atau ini pesan pertama
    if (pesanLowerCase === 'menu' || !sesiUser.has(nomorPengirim)) {
      // Kirim menu dan set state
      const teksMenu = buatTeksMenu(daftarLayanan);
      await sock.sendMessage(nomorPengirim, { text: teksMenu });

      // Kirim status "tidak sedang mengetik" setelah pesan terkirim
      await sock.sendPresenceUpdate('paused', nomorPengirim);

      sesiUser.set(nomorPengirim, { state: 'menu' });
      simpanLogChat(nomorPengirim, isiPesan, teksMenu, null);
      console.log(`📨 Menu dikirim ke ${nomorPengirim}`);
      return;
    }

    // Ambil sesi user
    const sesi = sesiUser.get(nomorPengirim);

    // Proses berdasarkan state
    if (sesi.state === 'menu') {
      // User sedang di menu, cek apakah pilihan valid
      const pilihanAngka = parseInt(isiPesan.trim());

      // Coba parsing angka dulu
      if (!isNaN(pilihanAngka) && pilihanAngka >= 1 && pilihanAngka <= daftarLayanan.length) {
        // Pilihan angka valid, kirim detail layanan
        const layananDipilih = daftarLayanan[pilihanAngka - 1];
        const teksDetail = buatTeksDetailLayanan(layananDipilih);
        await sock.sendMessage(nomorPengirim, { text: teksDetail });

        // Kirim status "tidak sedang mengetik" setelah pesan terkirim
        await sock.sendPresenceUpdate('paused', nomorPengirim);

        simpanLogChat(nomorPengirim, isiPesan, teksDetail, layananDipilih.id);
        console.log(`✅ Detail layanan "${layananDipilih.nama}" dikirim ke ${nomorPengirim}`);
        return;
      }

      // Jika bukan angka valid, coba cocokkan dengan nama layanan (typo-tolerant)
      const hasil = cariLayananByNama(isiPesan, daftarLayanan);

      if (hasil) {
        // Ada layanan yang cocok!
        const layananDipilih = hasil.layanan;
        const teksDetail = buatTeksDetailLayanan(layananDipilih);

        // Tambahkan info jika pencocokan otomatis
        let balasan = teksDetail;
        if (hasil.score < 1.0) {
          balasan = `💡 _Mungkin maksud Anda: "${layananDipilih.nama}"_\n\n` + teksDetail;
        }

        await sock.sendMessage(nomorPengirim, { text: balasan });

        // Kirim status "tidak sedang mengetik" setelah pesan terkirim
        await sock.sendPresenceUpdate('paused', nomorPengirim);

        simpanLogChat(nomorPengirim, isiPesan, balasan, layananDipilih.id);
        console.log(`✅ Detail layanan "${layananDipilih.nama}" dikirim ke ${nomorPengirim} (typo-tolerant, score: ${hasil.score.toFixed(2)})`);
      } else {
        // Tidak ada yang cocok, tampilkan error
        const teksError = `❌ Pilihan tidak dikenali: "${isiPesan}"\n\n`;
        const teksHint = `💡 Silakan ketik nomor layanan (1-${daftarLayanan.length}) atau nama layanan.\n\n`;
        const teksMenu = buatTeksMenu(daftarLayanan);
        const balasan = teksError + teksHint + teksMenu;

        await sock.sendMessage(nomorPengirim, { text: balasan });

        // Kirim status "tidak sedang mengetik" setelah pesan terkirim
        await sock.sendPresenceUpdate('paused', nomorPengirim);

        simpanLogChat(nomorPengirim, isiPesan, balasan, null);
        console.log(`⚠️ Pilihan tidak dikenali dari ${nomorPengirim}: "${isiPesan}"`);
      }
    }

  } catch (error) {
    console.error('❌ Error saat memproses pesan:', error);
  }
}

/**
 * Fungsi utama untuk memulai bot
 */
async function jalankanBot() {
  // Setup autentikasi
  const { state, saveCreds } = await useMultiFileAuthState(FOLDER_AUTH);

  // Ambil versi Baileys terbaru
  const { version } = await fetchLatestBaileysVersion();

  // Buat koneksi socket
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }), // Matikan log verbose
    browser: ['Chatbot Desa', 'Chrome', '1.0.0']
  });

  // Event: update koneksi
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Tampilkan QR code jika ada (ukuran kecil)
    if (qr) {
      console.log('\n📱 Scan QR Code di bawah ini dengan WhatsApp Anda:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n💡 Jika QR code terlalu besar, perkecil font terminal atau perbesar jendela terminal\n');
    }

    // Handle koneksi
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom) &&
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('❌ Koneksi terputus. Reason:', lastDisconnect?.error);

      if (shouldReconnect) {
        console.log('🔄 Mencoba reconnect...');
        setTimeout(() => jalankanBot(), 3000);
      } else {
        console.log('🚪 Logged out. Hapus folder auth_info dan jalankan ulang untuk login kembali.');
        // Tutup database saat logout
        if (db) db.close();
      }
    } else if (connection === 'open') {
      console.log('✅ Bot berhasil terhubung ke WhatsApp!');
      console.log('🤖 Chatbot Administrasi Desa siap menerima pesan...\n');
    }
  });

  // Event: update kredensial (simpan otomatis)
  sock.ev.on('creds.update', saveCreds);

  // Event: pesan masuk
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const pesan of messages) {
      // Abaikan pesan dari diri sendiri
      if (pesan.key.fromMe) continue;

      // Proses pesan
      await prosesPesan(sock, pesan);
    }
  });
}

// ===== JALANKAN BOT =====
console.log('🚀 Memulai Chatbot Administrasi Desa v2 (dengan Database)...\n');

// Inisialisasi database terlebih dahulu
if (!initDatabase()) {
  console.error('❌ Bot tidak bisa jalan tanpa database!');
  process.exit(1);
}

jalankanBot().catch(err => {
  console.error('❌ Error fatal:', err);
  if (db) db.close();
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Menutup bot...');
  if (db) db.close();
  process.exit(0);
});
