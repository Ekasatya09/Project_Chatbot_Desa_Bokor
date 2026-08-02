/**
 * bot-core.js
 * Inti logika bot WhatsApp — dapat diimport oleh server.js maupun dijalankan standalone.
 *
 * Ekspor:
 *   startBot(dbInstance, onStatusChange)  — mulai bot
 *   stopBot()                             — hentikan bot (tutup socket)
 *   resetBot(onStatusChange)              — hapus auth_info & restart
 *   getBotStatus()                        — status saat ini
 *   getQrString()                         — QR string terbaru
 *   getWaNomor()                          — nomor WA yang terhubung
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import stringSimilarity from 'string-similarity';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== KONFIGURASI =====
const FOLDER_AUTH = path.join(__dirname, 'auth_info');
const SIMILARITY_THRESHOLD = 0.6;
const LIVE_CHAT_EXPIRE_HOURS = 24;

// ===== STATE INTERNAL =====
let db = null;
let sock = null;
let _status = 'disconnected';   // 'disconnected' | 'connecting' | 'connected'
let _qrString = null;
let _waNomor = null;
let _onStatusChange = null;     // callback(status, qrString, waNomor)
let _expireInterval = null;
let _manualStop = false;        // true jika dihentikan manual (jangan reconnect)

const sesiUser = new Map();

// ===== STATUS HELPERS =====
export function getBotStatus() { return _status; }
export function getQrString()  { return _qrString; }
export function getWaNomor()   { return _waNomor; }

function setStatus(status, qr = null, nomor = null) {
  _status = status;
  _qrString = qr;
  if (nomor) _waNomor = nomor;
  if (_onStatusChange) _onStatusChange(status, qr, nomor);
  updateBotStatusDb(status, qr, nomor);
}

function updateBotStatusDb(status, qr, nomor) {
  if (!db) return;
  try {
    db.prepare(`
      INSERT OR REPLACE INTO bot_status (id, status, qr_string, wa_nomor, updated_at)
      VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(status, qr || null, nomor || null);
  } catch { /* tabel mungkin belum ada, abaikan */ }
}

// ===== DATABASE FUNCTIONS =====

function bacaDataKategori() {
  try {
    const kategoriList = db.prepare(
      'SELECT id, nama FROM kategori ORDER BY urutan, nama'
    ).all();
    const stmtLayanan = db.prepare(
      'SELECT id, nama FROM layanan WHERE kategori_id = ? ORDER BY nama'
    );
    return kategoriList.map(k => ({
      id: k.id, nama: k.nama,
      layananList: stmtLayanan.all(k.id)
    }));
  } catch { return []; }
}

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
      id: so.id, nama: so.nama,
      syarat: stmtSyaratSub.all(so.id).map(s => s.deskripsi)
    }));
    return { id: layanan.id, nama: layanan.nama, syarat, subOpsi };
  } catch { return null; }
}

function bacaDataLayanan() {
  try {
    return db.prepare('SELECT id, nama FROM layanan ORDER BY nama').all().map(l => {
      const syarat = db.prepare(
        'SELECT deskripsi FROM syarat WHERE layanan_id = ? ORDER BY urutan'
      ).all(l.id).map(s => s.deskripsi);
      return { id: l.id, nama: l.nama, syarat };
    });
  } catch { return []; }
}

function simpanLogChat(nomorWa, pesanMasuk, balasanBot, layananId = null) {
  try {
    db.prepare(
      'INSERT INTO log_chat (nomor_wa, pesan_masuk, balasan_bot, layanan_id) VALUES (?, ?, ?, ?)'
    ).run(nomorWa, pesanMasuk, balasanBot, layananId);
  } catch { /* abaikan */ }
}

// ===== LIVE CHAT DB FUNCTIONS =====

function getAdminNomor() {
  try {
    const admin = db.prepare('SELECT nomor_wa FROM admin WHERE nomor_wa IS NOT NULL AND nomor_wa != "" LIMIT 1').get();
    if (!admin) return null;
    let nomor = admin.nomor_wa.replace(/\D/g, '');
    if (!nomor.startsWith('62')) nomor = '62' + nomor.replace(/^0/, '');
    return nomor + '@s.whatsapp.net';
  } catch { return null; }
}

function cekSesiAktif(nomorWa) {
  try {
    return db.prepare("SELECT * FROM sesi_live_chat WHERE nomor_wa = ? AND status = 'aktif'").get(nomorWa);
  } catch { return null; }
}

function buatSesiLiveChat(nomorWa) {
  db.prepare("DELETE FROM sesi_live_chat WHERE nomor_wa = ? AND status != 'aktif'").run(nomorWa);
  const result = db.prepare(`
    INSERT OR REPLACE INTO sesi_live_chat (nomor_wa, status, mulai_at, expired_at)
    VALUES (?, 'aktif', CURRENT_TIMESTAMP, datetime('now', '+${LIVE_CHAT_EXPIRE_HOURS} hours'))
  `).run(nomorWa);
  return result.lastInsertRowid;
}

function akhiriSesiLiveChat(nomorWa) {
  db.prepare(`
    UPDATE sesi_live_chat SET status = 'selesai', selesai_at = CURRENT_TIMESTAMP
    WHERE nomor_wa = ? AND status = 'aktif'
  `).run(nomorWa);
}

function simpanPesanLive(sesiId, arah, isi) {
  try {
    db.prepare('INSERT INTO pesan_live_chat (sesi_id, arah, isi) VALUES (?, ?, ?)').run(sesiId, arah, isi);
  } catch { /* abaikan */ }
}

function getSesiAktifList() {
  try {
    return db.prepare("SELECT nomor_wa FROM sesi_live_chat WHERE status = 'aktif'").all().map(r => r.nomor_wa);
  } catch { return []; }
}

function getUserLiveChatTerakhir() {
  try {
    const row = db.prepare(`
      SELECT s.nomor_wa FROM sesi_live_chat s
      JOIN pesan_live_chat p ON p.sesi_id = s.id
      WHERE s.status = 'aktif' AND p.arah = 'masuk'
      ORDER BY p.waktu DESC LIMIT 1
    `).get();
    return row ? row.nomor_wa : null;
  } catch { return null; }
}

// ===== UTILITY =====

function bersihkanNomor(nomor) {
  if (!nomor) return '';
  return nomor
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@lid$/, '')
    .replace(/@c\.us$/, '');
}

function normalisasiTeks(teks) {
  return teks.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cariLayananByNama(inputUser, daftarLayanan) {
  const inputNorm = normalisasiTeks(inputUser);
  if (inputNorm.length < 3) return null;
  const namaList = daftarLayanan.map(l => normalisasiTeks(l.nama));
  const matches = stringSimilarity.findBestMatch(inputNorm, namaList);
  if (matches.bestMatch.rating >= SIMILARITY_THRESHOLD) {
    return { layanan: daftarLayanan[matches.bestMatchIndex], score: matches.bestMatch.rating };
  }
  for (let i = 0; i < daftarLayanan.length; i++) {
    const nama = namaList[i];
    if (nama.includes(inputNorm) || inputNorm.includes(nama)) {
      return { layanan: daftarLayanan[i], score: 0.7 };
    }
  }
  return null;
}

// ===== TEKS MENU =====

function buatTeksMenuKategori(kategoriList) {
  let teks = '🏛️ *LAYANAN ADMINISTRASI DESA*\n\n';
  teks += 'Silakan pilih *kategori* layanan dengan mengetik nomornya:\n\n';
  kategoriList.forEach((k, i) => { teks += `${i + 1}. ${k.nama} (${k.layananList.length} layanan)\n`; });
  teks += '\n────────────────────────────';
  teks += '\n9️⃣8️⃣  Chat langsung dengan admin';
  teks += '\n────────────────────────────';
  teks += '\n💡 _Ketik "menu" kapan saja untuk kembali ke sini_';
  return teks;
}

function buatTeksMenuLayanan(kategori, layananList) {
  let teks = `📂 *${kategori.nama.toUpperCase()}*\n\nPilih layanan yang Anda butuhkan:\n\n`;
  layananList.forEach((l, i) => { teks += `${i + 1}. ${l.nama}\n`; });
  teks += '\n────────────────────────────';
  teks += '\n0️⃣  Kembali ke daftar kategori';
  teks += '\n💡 _Ketik "menu" untuk ke menu utama_';
  return teks;
}

function buatTeksMenuSubOpsi(layanan, subOpsi) {
  let teks = `📄 *${layanan.nama.toUpperCase()}*\n\nLayanan ini memiliki beberapa jenis. Pilih yang sesuai:\n\n`;
  subOpsi.forEach((so, i) => { teks += `${i + 1}. ${so.nama}\n`; });
  teks += '\n────────────────────────────';
  teks += '\n0️⃣  Kembali ke daftar layanan';
  teks += '\n💡 _Ketik "menu" untuk ke menu utama_';
  return teks;
}

function buatTeksDetailLayanan(layanan, subOpsi = null) {
  let teks = `📄 *${layanan.nama.toUpperCase()}`;
  if (subOpsi) teks += ` — ${subOpsi.nama}`;
  teks += '*\n\n';
  const syaratUmum = layanan.syarat || [];
  const syaratKhusus = subOpsi ? (subOpsi.syarat || []) : [];
  if (syaratUmum.length > 0 && syaratKhusus.length > 0) {
    teks += '✅ *Syarat Umum:*\n';
    syaratUmum.forEach((s, i) => { teks += `${i + 1}. ${s}\n`; });
    teks += '\n✅ *Syarat Tambahan:*\n';
    syaratKhusus.forEach((s, i) => { teks += `${i + 1}. ${s}\n`; });
  } else {
    const semua = [...syaratUmum, ...syaratKhusus];
    if (semua.length > 0) {
      teks += '✅ *Syarat yang diperlukan:*\n';
      semua.forEach((s, i) => { teks += `${i + 1}. ${s}\n`; });
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

// ===== ADMIN MESSAGE HANDLER =====

async function prosesAdminMessage(currentSock, nomorAdmin, isiPesan) {
  const pesanTrim = isiPesan.trim();

  if (pesanTrim.toLowerCase().startsWith('!selesai')) {
    const parts = pesanTrim.split(' ');
    let targetNomor = parts[1] ? parts[1].replace(/\D/g, '') : null;
    let sesiList;
    if (targetNomor) {
      if (!targetNomor.startsWith('62')) targetNomor = '62' + targetNomor.replace(/^0/, '');
      sesiList = [{ nomor_wa: targetNomor + '@s.whatsapp.net' }];
    } else {
      sesiList = getSesiAktifList().map(n => ({ nomor_wa: n }));
    }
    if (sesiList.length === 0) {
      await currentSock.sendMessage(nomorAdmin, { text: '⚠️ Tidak ada sesi live chat yang aktif.' });
      return;
    }
    for (const { nomor_wa } of sesiList) {
      akhiriSesiLiveChat(nomor_wa);
      sesiUser.delete(nomor_wa);
      await currentSock.sendMessage(nomor_wa, {
        text: '✅ Sesi chat dengan admin telah selesai. Terima kasih!\n\n💡 Ketik *menu* untuk kembali ke menu utama.'
      });
      console.log(`🔴 Sesi live chat ${nomor_wa} diakhiri oleh admin`);
    }
    await currentSock.sendMessage(nomorAdmin, { text: `✅ ${sesiList.length} sesi live chat telah diakhiri.` });
    return;
  }

  let targetUser = getUserLiveChatTerakhir();
  if (!targetUser) {
    const aktif = getSesiAktifList();
    if (aktif.length > 0) targetUser = aktif[0];
  }
  if (!targetUser) {
    await currentSock.sendMessage(nomorAdmin, { text: '⚠️ Tidak ada sesi live chat aktif. Pesan tidak diteruskan.' });
    return;
  }
  await currentSock.sendMessage(targetUser, { text: `👤 *Admin:* ${isiPesan}` });
  const sesi = cekSesiAktif(targetUser);
  if (sesi) simpanPesanLive(sesi.id, 'keluar', isiPesan);
  console.log(`📤 Pesan admin diteruskan ke ${targetUser}`);
}

// ===== CEKSI EXPIRED =====

async function cekSesiExpired(currentSock) {
  try {
    const expiredList = db.prepare(`
      SELECT nomor_wa FROM sesi_live_chat
      WHERE status = 'aktif' AND expired_at <= datetime('now')
    `).all();
    for (const { nomor_wa } of expiredList) {
      akhiriSesiLiveChat(nomor_wa);
      sesiUser.delete(nomor_wa);
      await currentSock.sendMessage(nomor_wa, {
        text: '⏰ Sesi chat dengan admin telah berakhir (batas waktu 24 jam).\n\n💡 Ketik *menu* untuk kembali ke menu utama.'
      });
      console.log(`⏰ Sesi live chat ${nomor_wa} expired otomatis`);
    }
    if (expiredList.length > 0) {
      const adminNomor = getAdminNomor();
      if (adminNomor) {
        await currentSock.sendMessage(adminNomor, {
          text: `⏰ ${expiredList.length} sesi live chat telah berakhir otomatis (timeout 24 jam).`
        });
      }
    }
  } catch (e) { console.error('❌ Error cek sesi expired:', e.message); }
}

// ===== PROSES PESAN =====

async function prosesPesan(currentSock, pesan) {
  try {
    const nomorPengirim = pesan.key.remoteJid;
    if (pesan.key.remoteJid.endsWith('@g.us')) return;

    const isiPesan = pesan.message?.conversation ||
      pesan.message?.extendedTextMessage?.text || '';
    if (!isiPesan) return;

    await currentSock.sendPresenceUpdate('composing', nomorPengirim);
    await currentSock.readMessages([pesan.key]);

    const pesanLowerCase = isiPesan.trim().toLowerCase();

    // Deteksi pesan dari Admin WA
    const adminNomor = getAdminNomor();
    if (adminNomor && nomorPengirim === adminNomor) {
      await prosesAdminMessage(currentSock, nomorPengirim, isiPesan);
      await currentSock.sendPresenceUpdate('paused', nomorPengirim);
      return;
    }

    const kategoriList = bacaDataKategori();
    const pakaiKategori = kategoriList.length > 0;
    const daftarLayananFlat = !pakaiKategori ? bacaDataLayanan() : [];

    if (pakaiKategori && kategoriList.every(k => k.layananList.length === 0)) {
      const balasan = '⚠️ Maaf, data layanan belum tersedia. Silakan hubungi admin.';
      await currentSock.sendMessage(nomorPengirim, { text: balasan });
      await currentSock.sendPresenceUpdate('paused', nomorPengirim);
      simpanLogChat(nomorPengirim, isiPesan, balasan, null);
      return;
    }

    // Reset / menu utama
    const isFirstMessage = !sesiUser.has(nomorPengirim);
    const sesiLive = cekSesiAktif(nomorPengirim);
    if (sesiLive) {
      if (!sesiUser.has(nomorPengirim) || sesiUser.get(nomorPengirim).state !== 'live_chat') {
        sesiUser.set(nomorPengirim, { state: 'live_chat' });
      }
    }

    const sesi = sesiUser.get(nomorPengirim);
    const pilihanAngka = parseInt(isiPesan.trim());
    const kirimBalasan = async (teks, layananId = null) => {
      await currentSock.sendMessage(nomorPengirim, { text: teks });
      await currentSock.sendPresenceUpdate('paused', nomorPengirim);
      simpanLogChat(nomorPengirim, isiPesan, teks, layananId);
    };

    if (pesanLowerCase === 'menu' || isFirstMessage) {
      // Jika sedang live chat dan ketik menu, akhiri live chat terlebih dahulu
      if (sesiLive && pesanLowerCase === 'menu') {
        akhiriSesiLiveChat(nomorPengirim);
        const adminWA = getAdminNomor();
        if (adminWA) {
          await currentSock.sendMessage(adminWA, {
            text: `ℹ️ Pengguna +${bersihkanNomor(nomorPengirim)} telah keluar dari sesi live chat.`
          });
        }
      }
      let teksMenu;
      if (pakaiKategori) {
        teksMenu = buatTeksMenuKategori(kategoriList);
        sesiUser.set(nomorPengirim, { state: 'pilih_kategori', kategoriList });
      } else {
        teksMenu = buatTeksMenuKategori(kategoriList);
        sesiUser.set(nomorPengirim, { state: 'menu', layananList: daftarLayananFlat });
      }
      await currentSock.sendMessage(nomorPengirim, { text: teksMenu });
      await currentSock.sendPresenceUpdate('paused', nomorPengirim);
      simpanLogChat(nomorPengirim, isiPesan, teksMenu, null);
      return;
    }

    // Pilihan 98: Live Chat
    if (pesanLowerCase === '98') {
      const sesiAktifAda = cekSesiAktif(nomorPengirim);
      if (sesiAktifAda) {
        await kirimBalasan('💬 Anda sudah dalam sesi chat dengan admin. Silakan lanjutkan percakapan, atau ketik *menu* jika ingin keluar.');
      } else {
        const sesiId = buatSesiLiveChat(nomorPengirim);
        sesiUser.set(nomorPengirim, { state: 'live_chat' });
        await kirimBalasan(
          '✅ Permintaan Anda telah diterima.\n\n' +
          '👤 Admin akan segera merespons. Silakan ketik pesan Anda sekarang.\n\n' +
          '💡 Sesi ini aktif selama *24 jam*. Ketik *menu* jika ingin membatalkan.'
        );
        const adminWA = getAdminNomor();
        if (adminWA) {
          const nomorBersih = bersihkanNomor(nomorPengirim);
          await currentSock.sendMessage(adminWA, {
            text: `🔔 *Permintaan Live Chat Masuk*\n\n👤 Nomor: +${nomorBersih}\n🕐 Waktu: ${new Date().toLocaleString('id-ID')}\n\nBalas pesan ini untuk merespons pengguna.\nKetik *!selesai* untuk mengakhiri sesi.`
          });
          console.log(`🔔 Notifikasi live chat dikirim ke admin`);
        } else {
          console.warn('⚠️ Nomor WA admin belum dikonfigurasi! Set di dashboard: /live-chat');
        }
        simpanPesanLive(sesiId, 'masuk', '[Mulai sesi live chat]');
        console.log(`💬 Sesi live chat baru: ${nomorPengirim}`);
      }
      await currentSock.sendPresenceUpdate('paused', nomorPengirim);
      return;
    }

    // State: live_chat
    if (sesi && sesi.state === 'live_chat') {
      const sesiLiveAktif = cekSesiAktif(nomorPengirim);
      if (sesiLiveAktif) {
        const adminWA = getAdminNomor();
        if (adminWA) {
          const nomorBersih = bersihkanNomor(nomorPengirim);
          await currentSock.sendMessage(adminWA, { text: `💬 *[${nomorBersih}]:* ${isiPesan}` });
        }
        simpanPesanLive(sesiLiveAktif.id, 'masuk', isiPesan);
        await currentSock.sendPresenceUpdate('paused', nomorPengirim);
        console.log(`💬 Pesan user ${nomorPengirim} diteruskan ke admin`);
        return;
      } else {
        sesiUser.delete(nomorPengirim);
        await kirimBalasan('⏰ Sesi live chat Anda telah berakhir.\n\n💡 Ketik *menu* untuk kembali ke menu utama.');
        await currentSock.sendPresenceUpdate('paused', nomorPengirim);
        return;
      }
    }

    // State: pilih_kategori
    if (sesi && sesi.state === 'pilih_kategori') {
      const list = sesi.kategoriList;
      if (!isNaN(pilihanAngka) && pilihanAngka >= 1 && pilihanAngka <= list.length) {
        const k = list[pilihanAngka - 1];
        const teks = buatTeksMenuLayanan(k, k.layananList);
        sesiUser.set(nomorPengirim, { state: 'pilih_layanan', kategoriList, kategoriDipilih: k, layananList: k.layananList });
        await kirimBalasan(teks);
        console.log(`📂 Kategori "${k.nama}" dipilih oleh ${nomorPengirim}`);
      } else {
        const namaList = list.map(k => normalisasiTeks(k.nama));
        const match = stringSimilarity.findBestMatch(normalisasiTeks(isiPesan), namaList);
        if (match.bestMatch.rating >= SIMILARITY_THRESHOLD) {
          const k = list[match.bestMatchIndex];
          const teks = buatTeksMenuLayanan(k, k.layananList);
          sesiUser.set(nomorPengirim, { state: 'pilih_layanan', kategoriList, kategoriDipilih: k, layananList: k.layananList });
          await kirimBalasan(teks);
        } else {
          await kirimBalasan(`❌ Pilihan tidak dikenali.\n\n` + buatTeksMenuKategori(list));
        }
      }
      return;
    }

    // State: pilih_layanan
    if (sesi && sesi.state === 'pilih_layanan') {
      const list = sesi.layananList;
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
        if (match.bestMatch.rating >= SIMILARITY_THRESHOLD) layananDipilihRaw = list[match.bestMatchIndex];
      }
      if (!layananDipilihRaw) {
        await kirimBalasan(`❌ Pilihan tidak dikenali.\n\n` + buatTeksMenuLayanan(sesi.kategoriDipilih, list));
        return;
      }
      const layananDetail = bacaDetailLayanan(layananDipilihRaw.id);
      if (!layananDetail) { await kirimBalasan('⚠️ Layanan tidak ditemukan. Ketik "menu" untuk kembali.'); return; }
      if (layananDetail.subOpsi.length > 0) {
        const teks = buatTeksMenuSubOpsi(layananDetail, layananDetail.subOpsi);
        sesiUser.set(nomorPengirim, { state: 'pilih_sub_opsi', kategoriList, kategoriDipilih: sesi.kategoriDipilih, layananList: list, layananDipilih: layananDetail });
        await kirimBalasan(teks, layananDetail.id);
      } else {
        const teks = buatTeksDetailLayanan(layananDetail);
        sesiUser.set(nomorPengirim, { state: 'lihat_syarat', kategoriList, kategoriDipilih: sesi.kategoriDipilih, layananList: list, layananDipilih: layananDetail });
        await kirimBalasan(teks, layananDetail.id);
        console.log(`✅ Syarat "${layananDetail.nama}" dikirim ke ${nomorPengirim}`);
      }
      return;
    }

    // State: pilih_sub_opsi
    if (sesi && sesi.state === 'pilih_sub_opsi') {
      const layanan = sesi.layananDipilih;
      const subOpsiList = layanan.subOpsi;
      if (pilihanAngka === 0) {
        const teks = buatTeksMenuLayanan(sesi.kategoriDipilih, sesi.layananList);
        sesiUser.set(nomorPengirim, { state: 'pilih_layanan', kategoriList, kategoriDipilih: sesi.kategoriDipilih, layananList: sesi.layananList });
        await kirimBalasan(teks);
        return;
      }
      let subOpsiDipilih = null;
      if (!isNaN(pilihanAngka) && pilihanAngka >= 1 && pilihanAngka <= subOpsiList.length) {
        subOpsiDipilih = subOpsiList[pilihanAngka - 1];
      } else {
        const namaList = subOpsiList.map(so => normalisasiTeks(so.nama));
        const match = stringSimilarity.findBestMatch(normalisasiTeks(isiPesan), namaList);
        if (match.bestMatch.rating >= SIMILARITY_THRESHOLD) subOpsiDipilih = subOpsiList[match.bestMatchIndex];
      }
      if (!subOpsiDipilih) {
        await kirimBalasan(`❌ Pilihan tidak dikenali.\n\n` + buatTeksMenuSubOpsi(layanan, subOpsiList), layanan.id);
        return;
      }
      const teks = buatTeksDetailLayanan(layanan, subOpsiDipilih);
      sesiUser.set(nomorPengirim, { state: 'lihat_syarat', kategoriList, kategoriDipilih: sesi.kategoriDipilih, layananList: sesi.layananList, layananDipilih: layanan });
      await kirimBalasan(teks, layanan.id);
      return;
    }

    // State: lihat_syarat
    if (sesi && sesi.state === 'lihat_syarat') {
      if (pilihanAngka === 0) {
        const teks = buatTeksMenuLayanan(sesi.kategoriDipilih, sesi.layananList);
        sesiUser.set(nomorPengirim, { state: 'pilih_layanan', kategoriList, kategoriDipilih: sesi.kategoriDipilih, layananList: sesi.layananList });
        await kirimBalasan(teks);
        return;
      }
      await kirimBalasan('💡 Ketik *0* untuk kembali ke daftar layanan, atau ketik *"menu"* untuk ke menu utama.');
      return;
    }

    // Fallback: flat menu
    if (sesi && sesi.state === 'menu') {
      const list = sesi.layananList || daftarLayananFlat;
      if (!isNaN(pilihanAngka) && pilihanAngka >= 1 && pilihanAngka <= list.length) {
        const l = list[pilihanAngka - 1];
        const detail = bacaDetailLayanan(l.id) || l;
        await kirimBalasan(buatTeksDetailLayanan(detail), l.id);
        return;
      }
      const hasil = cariLayananByNama(isiPesan, list);
      if (hasil) {
        const detail = bacaDetailLayanan(hasil.layanan.id) || hasil.layanan;
        let balasan = buatTeksDetailLayanan(detail);
        if (hasil.score < 1.0) balasan = `💡 _Mungkin maksud Anda: "${hasil.layanan.nama}"_\n\n` + balasan;
        await kirimBalasan(balasan, hasil.layanan.id);
      } else {
        await kirimBalasan(`❌ Pilihan tidak dikenali: "${isiPesan}"\n\n💡 Silakan ketik nomornya.`);
      }
    }

  } catch (error) {
    console.error('❌ Error saat memproses pesan:', error);
  }
}

// ===== BOT LIFECYCLE =====

async function jalankanBot() {
  setStatus('connecting');
  const { state, saveCreds } = await useMultiFileAuthState(FOLDER_AUTH);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Chatbot Desa', 'Chrome', '1.0.0']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 QR Code tersedia — buka /bot-status di dashboard untuk scan\n');
      setStatus('connecting', qr);
    }

    if (connection === 'close') {
      const isLoggedOut = (lastDisconnect?.error instanceof Boom) &&
        lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;

      console.log('❌ Koneksi terputus. Reason:', lastDisconnect?.error?.message);
      setStatus('disconnected');

      if (_manualStop || isLoggedOut) {
        console.log('🛑 Bot dihentikan manual atau logged out.');
        return;
      }
      console.log('🔄 Mencoba reconnect dalam 5 detik...');
      setTimeout(() => jalankanBot(), 5000);
    } else if (connection === 'open') {
      const nomor = sock.user?.id ? bersihkanNomor(sock.user.id) : null;
      _waNomor = nomor;
      setStatus('connected', null, nomor);
      console.log(`✅ Bot terhubung sebagai: ${nomor}`);
      console.log('🤖 Chatbot Administrasi Desa siap menerima pesan...\n');

      // Interval cek sesi expired
      if (_expireInterval) clearInterval(_expireInterval);
      _expireInterval = setInterval(() => cekSesiExpired(sock), 60 * 1000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const pesan of messages) {
      if (pesan.key.fromMe) continue;
      await prosesPesan(sock, pesan);
    }
  });
}

// ===== PUBLIC API =====

/**
 * Mulai bot WhatsApp
 * @param {Database} dbInstance - Instance database SQLite
 * @param {Function} onStatusChange - Callback(status, qrString, waNomor)
 */
export async function startBot(dbInstance, onStatusChange = null) {
  db = dbInstance;
  _onStatusChange = onStatusChange;
  _manualStop = false;
  console.log('🚀 Memulai Chatbot Administrasi Desa...');
  await jalankanBot();
}

/**
 * Hentikan bot
 */
export async function stopBot() {
  _manualStop = true;
  if (_expireInterval) { clearInterval(_expireInterval); _expireInterval = null; }
  if (sock) {
    try { await sock.logout(); } catch { /* abaikan */ }
    try { sock.end(); } catch { /* abaikan */ }
    sock = null;
  }
  setStatus('disconnected');
  console.log('🛑 Bot dihentikan.');
}

/**
 * Reset koneksi: hapus auth_info dan restart
 */
export async function resetBot(onStatusChange = null) {
  if (onStatusChange) _onStatusChange = onStatusChange;
  await stopBot();
  // Hapus folder auth_info
  if (fs.existsSync(FOLDER_AUTH)) {
    fs.rmSync(FOLDER_AUTH, { recursive: true, force: true });
    console.log('🗑️ auth_info dihapus.');
  }
  _manualStop = false;
  _waNomor = null;
  await jalankanBot();
}
