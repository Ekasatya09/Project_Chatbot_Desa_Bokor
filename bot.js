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
const LIVE_CHAT_EXPIRE_HOURS = 24; // Durasi sesi live chat (jam)

// Penyimpanan sesi user (di memori)
// Key: nomor WA, Value: { state, kategoriList, layananList, layananDipilih }
const sesiUser = new Map();

// Referensi socket global (untuk kiriman balasan dari interval)
let sockGlobal = null;

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
 * Membaca semua kategori dari database
 * @returns {Array} Array { id, nama, layananList[] }
 */
function bacaDataKategori() {
  try {
    const kategoriList = db.prepare(
      'SELECT id, nama FROM kategori ORDER BY urutan, nama'
    ).all();

    const stmtLayanan = db.prepare(
      'SELECT id, nama FROM layanan WHERE kategori_id = ? ORDER BY nama'
    );

    return kategoriList.map(k => ({
      id: k.id,
      nama: k.nama,
      layananList: stmtLayanan.all(k.id)
    }));
  } catch (error) {
    console.error('❌ Gagal membaca kategori:', error.message);
    return [];
  }
}

/**
 * Membaca detail layanan (syarat + sub-opsi)
 * @param {number} id - ID layanan
 * @returns {Object|null}
 */
function bacaDetailLayanan(id) {
  try {
    const layanan = db.prepare('SELECT id, nama FROM layanan WHERE id = ?').get(id);
    if (!layanan) return null;

    const syarat = db.prepare(
      'SELECT deskripsi FROM syarat WHERE layanan_id = ? ORDER BY urutan'
    ).all(id).map(s => s.deskripsi);

    const subOpsiRows = db.prepare(
      'SELECT id, nama FROM sub_opsi WHERE layanan_id = ? ORDER BY urutan'
    ).all(id);

    const stmtSyaratSub = db.prepare(
      'SELECT deskripsi FROM syarat_sub_opsi WHERE sub_opsi_id = ? ORDER BY urutan'
    );

    const subOpsi = subOpsiRows.map(so => ({
      id: so.id,
      nama: so.nama,
      syarat: stmtSyaratSub.all(so.id).map(s => s.deskripsi)
    }));

    return { id: layanan.id, nama: layanan.nama, syarat, subOpsi };
  } catch (error) {
    console.error('❌ Gagal membaca detail layanan:', error.message);
    return null;
  }
}

/**
 * Membaca semua layanan (tanpa kategori) — backward compat
 */
function bacaDataLayanan() {
  try {
    return db.prepare('SELECT id, nama FROM layanan ORDER BY nama').all().map(l => {
      const syarat = db.prepare(
        'SELECT deskripsi FROM syarat WHERE layanan_id = ? ORDER BY urutan'
      ).all(l.id).map(s => s.deskripsi);
      return { id: l.id, nama: l.nama, syarat };
    });
  } catch (error) {
    console.error('❌ Gagal membaca data layanan:', error.message);
    return [];
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

// ===== FUNGSI LIVE CHAT =====

/**
 * Ambil nomor WA admin dari database
 * @returns {string|null}
 */
function getAdminNomor() {
  try {
    const admin = db.prepare('SELECT nomor_wa FROM admin WHERE nomor_wa IS NOT NULL AND nomor_wa != \'\' LIMIT 1').get();
    if (!admin) return null;
    // Format ke format Baileys: 628xxx@s.whatsapp.net
    let nomor = admin.nomor_wa.replace(/\D/g, '');
    if (!nomor.startsWith('62')) nomor = '62' + nomor.replace(/^0/, '');
    return nomor + '@s.whatsapp.net';
  } catch { return null; }
}

/**
 * Cek sesi live chat aktif milik user
 * @param {string} nomorWa
 * @returns {Object|null}
 */
function cekSesiAktif(nomorWa) {
  try {
    return db.prepare(
      "SELECT * FROM sesi_live_chat WHERE nomor_wa = ? AND status = 'aktif'"
    ).get(nomorWa);
  } catch { return null; }
}

/**
 * Buat sesi live chat baru
 * @param {string} nomorWa
 * @returns {number} ID sesi
 */
function buatSesiLiveChat(nomorWa) {
  // Hapus sesi lama yang mungkin sudah expired
  db.prepare("DELETE FROM sesi_live_chat WHERE nomor_wa = ? AND status != 'aktif'").run(nomorWa);
  const result = db.prepare(`
    INSERT OR REPLACE INTO sesi_live_chat (nomor_wa, status, mulai_at, expired_at)
    VALUES (?, 'aktif', CURRENT_TIMESTAMP, datetime('now', '+${LIVE_CHAT_EXPIRE_HOURS} hours'))
  `).run(nomorWa);
  return result.lastInsertRowid;
}

/**
 * Akhiri sesi live chat
 * @param {string} nomorWa
 */
function akhiriSesiLiveChat(nomorWa) {
  db.prepare(`
    UPDATE sesi_live_chat
    SET status = 'selesai', selesai_at = CURRENT_TIMESTAMP
    WHERE nomor_wa = ? AND status = 'aktif'
  `).run(nomorWa);
}

/**
 * Simpan log pesan live chat
 * @param {number} sesiId
 * @param {'masuk'|'keluar'} arah
 * @param {string} isi
 */
function simpanPesanLive(sesiId, arah, isi) {
  try {
    db.prepare(
      'INSERT INTO pesan_live_chat (sesi_id, arah, isi) VALUES (?, ?, ?)'
    ).run(sesiId, arah, isi);
  } catch (e) {
    console.error('❌ Gagal simpan pesan live chat:', e.message);
  }
}

/**
 * Ambil semua nomor user yang punya sesi live chat aktif
 * @returns {Array<string>}
 */
function getSesiAktifList() {
  try {
    return db.prepare("SELECT nomor_wa FROM sesi_live_chat WHERE status = 'aktif'").all().map(r => r.nomor_wa);
  } catch { return []; }
}

/**
 * Ambil user yang paling terakhir mengirim pesan dalam sesi aktif
 * @returns {string|null} nomor_wa user
 */
function getUserLiveChatTerakhir() {
  try {
    const row = db.prepare(`
      SELECT s.nomor_wa
      FROM sesi_live_chat s
      JOIN pesan_live_chat p ON p.sesi_id = s.id
      WHERE s.status = 'aktif' AND p.arah = 'masuk'
      ORDER BY p.waktu DESC
      LIMIT 1
    `).get();
    return row ? row.nomor_wa : null;
  } catch { return null; }
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
 * Bersihkan nomor WA dari suffix Baileys (@s.whatsapp.net, @lid, dll)
 * Baileys v6+ kadang menyimpan nomor dengan format @lid (Linked ID)
 * @param {string} nomor
 * @returns {string}
 */
function bersihkanNomor(nomor) {
  if (!nomor) return '';
  return nomor
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@lid$/, '')
    .replace(/@c\.us$/, '');
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
 * Membuat teks menu kategori
 */
function buatTeksMenuKategori(kategoriList) {
  let teks = '🏛️ *LAYANAN ADMINISTRASI DESA*\n\n';
  teks += 'Silakan pilih *kategori* layanan dengan mengetik nomornya:\n\n';
  kategoriList.forEach((k, i) => {
    teks += `${i + 1}. ${k.nama} (${k.layananList.length} layanan)\n`;
  });
  teks += '\n────────────────────────────';
  teks += '\n9️⃣8️⃣  Chat langsung dengan admin';
  teks += '\n────────────────────────────';
  teks += '\n💡 _Ketik "menu" kapan saja untuk kembali ke sini_';
  return teks;
}


/**
 * Membuat teks menu layanan dalam satu kategori
 */
function buatTeksMenuLayanan(kategori, layananList) {
  let teks = `📂 *${kategori.nama.toUpperCase()}*\n\n`;
  teks += 'Pilih layanan yang Anda butuhkan:\n\n';
  layananList.forEach((l, i) => {
    teks += `${i + 1}. ${l.nama}\n`;
  });
  teks += '\n────────────────────────────';
  teks += '\n0️⃣  Kembali ke daftar kategori';
  teks += '\n💡 _Ketik "menu" untuk ke menu utama_';
  return teks;
}

/**
 * Membuat teks menu sub-opsi
 */
function buatTeksMenuSubOpsi(layanan, subOpsi) {
  let teks = `📄 *${layanan.nama.toUpperCase()}*\n\n`;
  teks += 'Layanan ini memiliki beberapa jenis. Pilih yang sesuai:\n\n';
  subOpsi.forEach((so, i) => {
    teks += `${i + 1}. ${so.nama}\n`;
  });
  teks += '\n────────────────────────────';
  teks += '\n0️⃣  Kembali ke daftar layanan';
  teks += '\n💡 _Ketik "menu" untuk ke menu utama_';
  return teks;
}

/**
 * Membuat teks detail syarat layanan
 */
function buatTeksDetailLayanan(layanan, subOpsi = null) {
  let teks = `📄 *${layanan.nama.toUpperCase()}`;
  if (subOpsi) teks += ` — ${subOpsi.nama}`;
  teks += '*\n\n';

  // Syarat umum
  const syaratUmum = layanan.syarat || [];
  const syaratKhusus = subOpsi ? (subOpsi.syarat || []) : [];

  if (syaratUmum.length > 0 && syaratKhusus.length > 0) {
    teks += '✅ *Syarat Umum:*\n';
    syaratUmum.forEach((s, i) => { teks += `${i + 1}. ${s}\n`; });
    teks += '\n✅ *Syarat Tambahan:*\n';
    syaratKhusus.forEach((s, i) => { teks += `${i + 1}. ${s}\n`; });
  } else {
    const semuaSyarat = [...syaratUmum, ...syaratKhusus];
    if (semuaSyarat.length > 0) {
      teks += '✅ *Syarat yang diperlukan:*\n';
      semuaSyarat.forEach((s, i) => { teks += `${i + 1}. ${s}\n`; });
    } else {
      teks += '_Tidak ada syarat khusus. Silakan tanya ke kantor desa._\n';
    }
  }

  teks += '\n📍 Silakan datang ke kantor desa dengan membawa dokumen di atas.\n';
  teks += '\n────────────────────────────';
  teks += '\n0️⃣  Kembali ke pilihan sebelumnya';
  teks += '\n💡 _Ketik "menu" untuk kembali ke menu utama_';
  return teks;
}

/**
 * Memproses pesan yang masuk dari user
 * @param {Object} sock - Socket koneksi Baileys
 * @param {Object} pesan - Objek pesan dari Baileys
 */
/**
 * Proses pesan dari admin WA (relay ke user / akhiri sesi)
 */
async function prosesAdminMessage(sock, nomorAdmin, isiPesan) {
  const pesanTrim = isiPesan.trim();

  // ── Perintah: !selesai [opsional: nomor user] ─────────────────
  if (pesanTrim.toLowerCase().startsWith('!selesai')) {
    const parts = pesanTrim.split(' ');
    let targetNomor = parts[1] ? parts[1].replace(/\D/g, '') : null;

    let sesiList;
    if (targetNomor) {
      // Akhiri sesi nomor tertentu
      if (!targetNomor.startsWith('62')) targetNomor = '62' + targetNomor.replace(/^0/, '');
      targetNomor = targetNomor + '@s.whatsapp.net';
      sesiList = [{ nomor_wa: targetNomor }];
    } else {
      // Akhiri semua sesi aktif
      sesiList = getSesiAktifList().map(n => ({ nomor_wa: n }));
    }

    if (sesiList.length === 0) {
      await sock.sendMessage(nomorAdmin, { text: '⚠️ Tidak ada sesi live chat yang aktif.' });
      return;
    }

    for (const { nomor_wa } of sesiList) {
      akhiriSesiLiveChat(nomor_wa);
      // Hanya hapus state user jika masih dalam live chat — jangan rusak
      // navigasi menu yang sedang berjalan.
      if (sesiUser.get(nomor_wa)?.state === 'live_chat') {
        sesiUser.delete(nomor_wa);
      }
      console.log(`🔴 Sesi live chat ${nomor_wa} diakhiri oleh admin`);
    }
    await sock.sendMessage(nomorAdmin, { text: `✅ ${sesiList.length} sesi live chat telah diakhiri.` });
    return;
  }

  // ── Forward pesan admin ke user ───────────────────────────────
  // Cari user yang terakhir mengirim pesan
  let targetUser = getUserLiveChatTerakhir();

  // Jika tidak ada pesan masuk sama sekali, ambil sesi pertama yang ada
  if (!targetUser) {
    const sesiAktif = getSesiAktifList();
    if (sesiAktif.length > 0) targetUser = sesiAktif[0];
  }

  if (!targetUser) {
    await sock.sendMessage(nomorAdmin, { text: '⚠️ Tidak ada sesi live chat aktif. Pesan tidak diteruskan.' });
    return;
  }

  // Kirim ke user
  await sock.sendMessage(targetUser, { text: `👤 *Admin:* ${isiPesan}` });

  // Simpan log
  const sesi = cekSesiAktif(targetUser);
  if (sesi) simpanPesanLive(sesi.id, 'keluar', isiPesan);

  console.log(`📤 Pesan admin diteruskan ke ${targetUser}`);
}

/**
 * Cek & akhiri sesi live chat yang sudah expired (dipanggil via setInterval)
 */
async function cekSesiExpired(sock) {
  try {
    const expiredList = db.prepare(`
      SELECT nomor_wa FROM sesi_live_chat
      WHERE status = 'aktif' AND expired_at <= datetime('now')
    `).all();

    for (const { nomor_wa } of expiredList) {
      akhiriSesiLiveChat(nomor_wa);
      // Hanya hapus state user jika masih dalam live chat — jangan rusak
      // navigasi menu yang sedang berjalan.
      if (sesiUser.get(nomor_wa)?.state === 'live_chat') {
        sesiUser.delete(nomor_wa);
      }
      console.log(`⏰ Sesi live chat ${nomor_wa} expired otomatis`);
    }

    if (expiredList.length > 0) {
      const adminNomor = getAdminNomor();
      if (adminNomor) {
        await sock.sendMessage(adminNomor, {
          text: `⏰ ${expiredList.length} sesi live chat telah berakhir otomatis (timeout 24 jam).`
        });
      }
    }
  } catch (e) {
    console.error('❌ Error cek sesi expired:', e.message);
  }
}

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

    // ── Deteksi pesan dari Admin WA ──────────────────────────────
    const adminNomor = getAdminNomor();
    if (adminNomor && nomorPengirim === adminNomor) {
      await prosesAdminMessage(sock, nomorPengirim, isiPesan);
      await sock.sendPresenceUpdate('paused', nomorPengirim);
      return;
    }

    // Baca kategori
    const kategoriList = bacaDataKategori();
    const pakaiKategori = kategoriList.length > 0;

    // Jika tidak ada kategori sama sekali, fallback ke mode lama (flat list)
    const daftarLayananFlat = !pakaiKategori ? bacaDataLayanan() : [];

    if (pakaiKategori && kategoriList.every(k => k.layananList.length === 0)) {
      const balasan = '⚠️ Maaf, data layanan belum tersedia. Silakan hubungi admin.';
      await sock.sendMessage(nomorPengirim, { text: balasan });
      await sock.sendPresenceUpdate('paused', nomorPengirim);
      simpanLogChat(nomorPengirim, isiPesan, balasan, null);
      return;
    }

    // ── Reset / menu utama ────────────────────────────────────────
    const isFirstMessage = !sesiUser.has(nomorPengirim);
    if (pesanLowerCase === 'menu' || isFirstMessage) {
      let teksMenu;
      if (pakaiKategori) {
        teksMenu = buatTeksMenuKategori(kategoriList);
        sesiUser.set(nomorPengirim, { state: 'pilih_kategori', kategoriList });
      } else {
        teksMenu = buatTeksMenu(daftarLayananFlat);
        sesiUser.set(nomorPengirim, { state: 'menu', layananList: daftarLayananFlat });
      }
      await sock.sendMessage(nomorPengirim, { text: teksMenu });
      await sock.sendPresenceUpdate('paused', nomorPengirim);
      simpanLogChat(nomorPengirim, isiPesan, teksMenu, null);
      console.log(`📨 Menu dikirim ke ${nomorPengirim}`);
      return;
    }

    // ── Cek sesi live chat aktif (user yang sudah dalam sesi) ───
    const sesiLive = cekSesiAktif(nomorPengirim);
    if (sesiLive) {
      // Pastikan state di memori juga live_chat
      if (!sesiUser.has(nomorPengirim) || sesiUser.get(nomorPengirim).state !== 'live_chat') {
        sesiUser.set(nomorPengirim, { state: 'live_chat' });
      }
    }

    // Ambil sesi user
    const sesi = sesiUser.get(nomorPengirim);
    const pilihanAngka = parseInt(isiPesan.trim());
    const kirimBalasan = async (teks, layananId = null) => {
      await sock.sendMessage(nomorPengirim, { text: teks });
      await sock.sendPresenceUpdate('paused', nomorPengirim);
      simpanLogChat(nomorPengirim, isiPesan, teks, layananId);
    };

    // ── Pilihan 98: Minta live chat dengan admin (semua state) ──
    if (pesanLowerCase === '98') {
      const sesiAktifAda = cekSesiAktif(nomorPengirim);
      if (sesiAktifAda) {
        await kirimBalasan('💬 Anda sudah dalam sesi chat dengan admin. Silakan lanjutkan percakapan, atau ketik *menu* jika ingin keluar.');
      } else {
        // Buat sesi baru
        const sesiId = buatSesiLiveChat(nomorPengirim);
        sesiUser.set(nomorPengirim, { state: 'live_chat' });

        // Beritahu user
        await kirimBalasan(
          '✨ *✅ PERMINTAAN ANDA TELAH DITERIMA!* ✨\n\n' +
          '🎉 Permintaan Anda sudah masuk ke admin desa.\n' +
          '👤 Admin akan segera merespons percakapan Anda.\n\n' +
          '📝 Silakan ketik pesan Anda sekarang.\n\n' +
          '⏳ Sesi ini aktif selama *24 jam*.\n' +
          '💡 Ketik *menu* jika ingin membatalkan.'
        );

        // Notifikasi ke admin WA
        const adminWA = getAdminNomor();
        if (adminWA) {
          const nomorBersih = bersihkanNomor(nomorPengirim);
          await sock.sendMessage(adminWA, {
            text:
              `🔔 *Permintaan Live Chat Masuk*\n\n` +
              `👤 Nomor: +${nomorBersih}\n` +
              `🕐 Waktu: ${new Date().toLocaleString('id-ID')}\n\n` +
              `Balas pesan ini untuk merespons pengguna.\n` +
              `Ketik *!selesai* untuk mengakhiri sesi.`
          });
          console.log(`🔔 Notifikasi live chat dikirim ke admin (${adminWA})`);
        } else {
          console.warn('⚠️ Nomor WA admin belum dikonfigurasi! Set di dashboard: /live-chat');
        }

        simpanPesanLive(sesiId, 'masuk', '[Mulai sesi live chat]');
        console.log(`💬 Sesi live chat baru: ${nomorPengirim}`);
      }
      await sock.sendPresenceUpdate('paused', nomorPengirim);
      return;
    }

    // ── State: live_chat ───────────────────────────────────────────
    if (sesi && sesi.state === 'live_chat') {
      const sesiLiveAktif = cekSesiAktif(nomorPengirim);

      // Jika user ketik "menu" → keluar dari live chat
      if (pesanLowerCase === 'menu') {
        akhiriSesiLiveChat(nomorPengirim);
        sesiUser.delete(nomorPengirim);
        // Beritahu admin
        const adminWA = getAdminNomor();
        if (adminWA) {
          const nomorBersih = bersihkanNomor(nomorPengirim);
          await sock.sendMessage(adminWA, {
            text: `ℹ️ Pengguna +${nomorBersih} telah keluar dari sesi live chat.`
          });
        }
        // Lanjut ke handler menu (jangan return, biarkan jatuh ke handler menu di bawah)
      } else if (sesiLiveAktif) {
        // Forward pesan user ke admin
        const adminWA = getAdminNomor();
        if (adminWA) {
          const nomorBersih = bersihkanNomor(nomorPengirim);
          await sock.sendMessage(adminWA, {
            text: `💬 *[${nomorBersih}]:* ${isiPesan}`
          });
        }
        simpanPesanLive(sesiLiveAktif.id, 'masuk', isiPesan);
        // Kirim konfirmasi terima ke user (opsional, bisa dinonaktifkan)
        await sock.sendPresenceUpdate('paused', nomorPengirim);
        console.log(`💬 Pesan user ${nomorPengirim} diteruskan ke admin`);
        return;
      } else {
        // Sesi sudah tidak aktif tapi state masih live_chat (misal: expired)
        sesiUser.delete(nomorPengirim);
        await sock.sendPresenceUpdate('paused', nomorPengirim);
        return;
      }
    }

    // ── State: pilih_kategori ──────────────────────────────────────
    if (sesi && sesi.state === 'pilih_kategori') {
      const list = sesi.kategoriList;
      if (!isNaN(pilihanAngka) && pilihanAngka >= 1 && pilihanAngka <= list.length) {
        const kategoriDipilih = list[pilihanAngka - 1];
        const teks = buatTeksMenuLayanan(kategoriDipilih, kategoriDipilih.layananList);
        sesiUser.set(nomorPengirim, {
          state: 'pilih_layanan',
          kategoriList,
          kategoriDipilih,
          layananList: kategoriDipilih.layananList
        });
        await kirimBalasan(teks);
        console.log(`📂 Kategori "${kategoriDipilih.nama}" dipilih oleh ${nomorPengirim}`);
      } else {
        // Coba fuzzy match nama kategori
        const namaList = list.map(k => normalisasiTeks(k.nama));
        const match = stringSimilarity.findBestMatch(normalisasiTeks(isiPesan), namaList);
        if (match.bestMatch.rating >= SIMILARITY_THRESHOLD) {
          const kategoriDipilih = list[match.bestMatchIndex];
          const teks = buatTeksMenuLayanan(kategoriDipilih, kategoriDipilih.layananList);
          sesiUser.set(nomorPengirim, {
            state: 'pilih_layanan', kategoriList,
            kategoriDipilih, layananList: kategoriDipilih.layananList
          });
          await kirimBalasan(teks);
        } else {
          const balasan = `❌ Pilihan tidak dikenali.\n\n` + buatTeksMenuKategori(list);
          await kirimBalasan(balasan);
        }
      }
      return;
    }

    // ── State: pilih_layanan ───────────────────────────────────────
    if (sesi && sesi.state === 'pilih_layanan') {
      const list = sesi.layananList;

      // Ketik 0 → kembali ke kategori
      if (pilihanAngka === 0) {
        const teks = buatTeksMenuKategori(kategoriList);
        sesiUser.set(nomorPengirim, { state: 'pilih_kategori', kategoriList });
        await kirimBalasan(teks);
        return;
      }

      let layananDipilihRaw = null;
      if (!isNaN(pilihanAngka) && pilihanAngka >= 1 && pilihanAngka <= list.length) {
        layananDipilihRaw = list[pilihanAngka - 1];
      } else {
        const namaList = list.map(l => normalisasiTeks(l.nama));
        const match = stringSimilarity.findBestMatch(normalisasiTeks(isiPesan), namaList);
        if (match.bestMatch.rating >= SIMILARITY_THRESHOLD) {
          layananDipilihRaw = list[match.bestMatchIndex];
        }
      }

      if (!layananDipilihRaw) {
        const balasan = `❌ Pilihan tidak dikenali.\n\n` +
          buatTeksMenuLayanan(sesi.kategoriDipilih, list);
        await kirimBalasan(balasan);
        return;
      }

      // Load detail layanan (syarat + sub-opsi)
      const layananDetail = bacaDetailLayanan(layananDipilihRaw.id);
      if (!layananDetail) {
        await kirimBalasan('⚠️ Layanan tidak ditemukan. Ketik "menu" untuk kembali.');
        return;
      }

      if (layananDetail.subOpsi.length > 0) {
        // Ada sub-opsi → tanya dulu
        const teks = buatTeksMenuSubOpsi(layananDetail, layananDetail.subOpsi);
        sesiUser.set(nomorPengirim, {
          state: 'pilih_sub_opsi', kategoriList,
          kategoriDipilih: sesi.kategoriDipilih,
          layananList: list,
          layananDipilih: layananDetail
        });
        await kirimBalasan(teks, layananDetail.id);
        console.log(`🔀 Sub-opsi "${layananDetail.nama}" ditampilkan ke ${nomorPengirim}`);
      } else {
        // Langsung tampilkan syarat
        const teks = buatTeksDetailLayanan(layananDetail);
        sesiUser.set(nomorPengirim, {
          state: 'lihat_syarat',
          kategoriList,
          kategoriDipilih: sesi.kategoriDipilih,
          layananList: list,
          layananDipilih: layananDetail
        });
        await kirimBalasan(teks, layananDetail.id);
        console.log(`✅ Syarat "${layananDetail.nama}" dikirim ke ${nomorPengirim}`);
      }
      return;
    }

    // ── State: pilih_sub_opsi ──────────────────────────────────────
    if (sesi && sesi.state === 'pilih_sub_opsi') {
      const layanan = sesi.layananDipilih;
      const subOpsiList = layanan.subOpsi;

      // Ketik 0 → kembali ke daftar layanan
      if (pilihanAngka === 0) {
        const teks = buatTeksMenuLayanan(sesi.kategoriDipilih, sesi.layananList);
        sesiUser.set(nomorPengirim, {
          state: 'pilih_layanan', kategoriList,
          kategoriDipilih: sesi.kategoriDipilih,
          layananList: sesi.layananList
        });
        await kirimBalasan(teks);
        return;
      }

      let subOpsiDipilih = null;
      if (!isNaN(pilihanAngka) && pilihanAngka >= 1 && pilihanAngka <= subOpsiList.length) {
        subOpsiDipilih = subOpsiList[pilihanAngka - 1];
      } else {
        const namaList = subOpsiList.map(so => normalisasiTeks(so.nama));
        const match = stringSimilarity.findBestMatch(normalisasiTeks(isiPesan), namaList);
        if (match.bestMatch.rating >= SIMILARITY_THRESHOLD) {
          subOpsiDipilih = subOpsiList[match.bestMatchIndex];
        }
      }

      if (!subOpsiDipilih) {
        const balasan = `❌ Pilihan tidak dikenali.\n\n` + buatTeksMenuSubOpsi(layanan, subOpsiList);
        await kirimBalasan(balasan, layanan.id);
        return;
      }

      const teks = buatTeksDetailLayanan(layanan, subOpsiDipilih);
      sesiUser.set(nomorPengirim, {
        state: 'lihat_syarat',
        kategoriList,
        kategoriDipilih: sesi.kategoriDipilih,
        layananList: sesi.layananList,
        layananDipilih: layanan
      });
      await kirimBalasan(teks, layanan.id);
      console.log(`✅ Syarat sub-opsi "${subOpsiDipilih.nama}" dari "${layanan.nama}" dikirim ke ${nomorPengirim}`);
      return;
    }

    // ── State: lihat_syarat ────────────────────────────────────────
    if (sesi && sesi.state === 'lihat_syarat') {
      // Ketik 0 → kembali ke daftar layanan
      if (pilihanAngka === 0) {
        const teks = buatTeksMenuLayanan(sesi.kategoriDipilih, sesi.layananList);
        sesiUser.set(nomorPengirim, {
          state: 'pilih_layanan',
          kategoriList,
          kategoriDipilih: sesi.kategoriDipilih,
          layananList: sesi.layananList
        });
        await kirimBalasan(teks);
        return;
      }
      // Input lain → ingatkan user untuk ketik 0 atau menu
      const balasan = `💡 Ketik *0* untuk kembali ke daftar layanan, atau ketik *"menu"* untuk ke menu utama.`;
      await kirimBalasan(balasan);
      return;
    }

    // ── Fallback: flat menu (jika tidak ada kategori) ─────────────
    if (sesi && sesi.state === 'menu') {
      const list = sesi.layananList || daftarLayananFlat;
      if (!isNaN(pilihanAngka) && pilihanAngka >= 1 && pilihanAngka <= list.length) {
        const layananDipilih = list[pilihanAngka - 1];
        const detail = bacaDetailLayanan(layananDipilih.id) || layananDipilih;
        const teks = buatTeksDetailLayanan(detail);
        await kirimBalasan(teks, layananDipilih.id);
        console.log(`✅ Detail layanan "${layananDipilih.nama}" dikirim ke ${nomorPengirim}`);
        return;
      }
      const hasil = cariLayananByNama(isiPesan, list);
      if (hasil) {
        const detail = bacaDetailLayanan(hasil.layanan.id) || hasil.layanan;
        let balasan = buatTeksDetailLayanan(detail);
        if (hasil.score < 1.0) balasan = `💡 _Mungkin maksud Anda: "${hasil.layanan.nama}"_\n\n` + balasan;
        await kirimBalasan(balasan, hasil.layanan.id);
        console.log(`✅ Detail layanan "${hasil.layanan.nama}" dikirim (typo, score: ${hasil.score.toFixed(2)})`);
      } else {
        const balasan = `❌ Pilihan tidak dikenali: "${isiPesan}"\n\n💡 Silakan ketik nomornya.\n\n` + buatTeksMenu(list);
        await kirimBalasan(balasan);
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
      // Simpan referensi socket global untuk fitur live chat
      sockGlobal = sock;
      // Mulai interval cek sesi expired (setiap 60 detik)
      setInterval(() => cekSesiExpired(sock), 60 * 1000);
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
