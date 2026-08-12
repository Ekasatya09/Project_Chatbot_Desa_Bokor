# 🔧 Fix: Stuck Generating QR Code

## Masalah Yang Diperbaiki

Halaman Status Bot menampilkan "⏳ Menunggu QR Code..." atau "⏳ Manual QR Code..." secara terus-menerus tanpa menampilkan QR code.

## Penyebab Masalah

1. **Missing API endpoint `/api/bot/connect`** - Frontend memanggil endpoint yang tidak ada
2. **Missing API endpoint `/api/bot/disconnect`** - Tombol Hapus WhatsApp tidak berfungsi
3. **No timeout handling** - QR generation bisa stuck tanpa batas waktu
4. **Aggressive QR polling** - Request QR terlalu sering menyebabkan race condition
5. **Poor error handling** - Error tidak ditampilkan ke user

## Solusi Yang Diterapkan

### 1. ✅ Tambah API Endpoint `/api/bot/connect` (server.js)

```javascript
// API: Hubungkan bot (start connection)
app.post('/api/bot/connect', apiAuth, async (req, res) => {
  try {
    const botRow = db.prepare('SELECT status FROM bot_status WHERE id = 1').get();
    
    // Jika sudah connecting atau connected, tidak perlu start lagi
    if (botRow && (botRow.status === 'connecting' || botRow.status === 'connected')) {
      return res.json({ 
        ok: true, 
        message: 'Bot sudah dalam proses koneksi atau sudah terhubung',
        status: botRow.status 
      });
    }
    
    console.log('📲 Memulai koneksi WhatsApp dari dashboard...');
    await startBot(db);
    res.json({ ok: true, message: 'Koneksi dimulai. Tunggu QR code...' });
  } catch (e) {
    console.error('❌ Gagal start bot:', e.message);
    res.status(500).json({ error: 'Gagal memulai koneksi: ' + e.message });
  }
});
```

**Fungsi**: Memulai koneksi bot WhatsApp dengan mengecek status terlebih dahulu

### 2. ✅ Tambah API Endpoint `/api/bot/disconnect` (server.js)

```javascript
// API: Disconnect / Stop bot (tanpa hapus auth)
app.post('/api/bot/disconnect', apiAuth, async (req, res) => {
  try {
    console.log('🛑 Disconnect WhatsApp diminta dari dashboard...');
    await stopBot();
    res.json({ ok: true, message: 'Bot diputuskan. Auth info masih tersimpan untuk koneksi ulang.' });
  } catch (e) {
    console.error('❌ Disconnect gagal:', e.message);
    res.status(500).json({ error: 'Disconnect gagal: ' + e.message });
  }
});
```

**Fungsi**: Memutuskan koneksi bot tanpa menghapus auth_info

### 3. ✅ Tambah Timeout Handling di `/api/bot/qr` (server.js)

```javascript
// API: QR Code sebagai data URL (base64 PNG)
app.get('/api/bot/qr', apiAuth, async (req, res) => {
  const botRow = db.prepare('SELECT qr_string, status FROM bot_status WHERE id = 1').get();
  if (!botRow?.qr_string || botRow.status !== 'connecting') {
    return res.json({ qr: null, status: botRow?.status || 'disconnected' });
  }
  try {
    // Set timeout untuk QR generation (max 5 detik)
    const qrPromise = QRCode.toDataURL(botRow.qr_string, {
      width: 300, 
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1e293b', light: '#ffffff' }
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('QR generation timeout')), 5000)
    );
    
    const qrDataUrl = await Promise.race([qrPromise, timeoutPromise]);
    res.json({ qr: qrDataUrl, status: 'connecting' });
  } catch (e) {
    console.error('❌ Gagal generate QR:', e.message);
    // Return null QR but keep status connecting so frontend retries
    res.json({ qr: null, status: 'connecting', error: e.message });
  }
});
```

**Fitur Baru**:
- Timeout 5 detik untuk QR generation
- Error handling yang lebih baik
- Return error message untuk debugging
- Frontend bisa retry otomatis

### 4. ✅ Perbaiki QR Loading Function (bot-status.ejs)

```javascript
async function loadQR() {
  const qrWrapper = document.getElementById('qrWrapper');
  
  try {
    const data = await fetchQR();
    if (!data) {
      console.warn('Tidak ada response dari /api/bot/qr');
      return;
    }

    if (data.qr && data.status === 'connecting') {
      // Tampilkan QR code
      qrWrapper.innerHTML = `
        <img src="${data.qr}" alt="QR Code WhatsApp" style="border-radius:8px;max-width:260px;">
        <div style="font-size:0.8rem;color:#64748b;margin-top:0.5rem;">
          Scan dengan WhatsApp → Perangkat Tertaut → Tautkan Perangkat
        </div>
      `;
    } else if (data.status === 'connecting') {
      // QR belum siap atau error generate
      qrWrapper.innerHTML = `
        <div class="qr-spinner"></div>
        <div style="color:#64748b;padding:0.5rem;font-size:0.9rem;">⏳ Menunggu QR dari server...</div>
        ${data.error ? `<div style="color:#ef4444;font-size:0.75rem;margin-top:0.5rem;">Error: ${data.error}</div>` : ''}
      `;
    } else if (data.status === 'disconnected') {
      qrWrapper.innerHTML = '<div style="font-size:3rem;">📵</div><div style="color:#64748b;">WhatsApp belum terhubung.<br>Klik <strong>Hubungkan WhatsApp</strong> untuk mulai.</div>';
    } else if (data.status === 'connected') {
      qrWrapper.innerHTML = '<div style="font-size:3rem;">✅</div><div style="font-weight:600;color:#065f46;">Bot aktif dan siap menerima pesan!</div>';
    }
  } catch (err) {
    console.error('Error loading QR:', err);
    qrWrapper.innerHTML = `
      <div class="qr-spinner"></div>
      <div style="color:#ef4444;padding:0.5rem;font-size:0.9rem;">⚠️ Gagal memuat QR. Mencoba lagi...</div>
    `;
  }
}
```

**Perbaikan**:
- Error handling dengan try-catch
- Tampilkan error message ke user
- Handle semua status (connecting, connected, disconnected)
- Logging untuk debugging

### 5. ✅ Optimalkan QR Polling Logic (bot-status.ejs)

```javascript
// ── Polling status setiap 3 detik ─────────────────────────────
let lastStatus = '<%= botStatus %>';
let qrRefreshCount = 0;
let isLoadingQR = false; // Prevent multiple simultaneous QR loads

async function pollStatus() {
  const data = await fetchBotStatus();
  if (!data) return;

  if (data.status !== lastStatus) {
    lastStatus = data.status;
    setStatusUI(data.status, data.wa_nomor);
    if (data.status === 'connected') {
      toast('✅ Bot berhasil terhubung ke WhatsApp!');
      qrRefreshCount = 0;
      isLoadingQR = false;
    } else if (data.status === 'disconnected') {
      toast('⚠️ Bot terputus dari WhatsApp.');
      qrRefreshCount = 0;
      isLoadingQR = false;
    }
  }

  // Refresh QR setiap 9 detik saat connecting (setiap 3 poll)
  if (data.status === 'connecting') {
    qrRefreshCount++;
    // Load QR setiap 9 detik, dan hanya jika tidak sedang loading
    if (qrRefreshCount % 3 === 0 && !isLoadingQR) {
      isLoadingQR = true;
      await loadQR();
      isLoadingQR = false;
    }
  } else {
    qrRefreshCount = 0;
    isLoadingQR = false;
  }
}
```

**Perbaikan**:
- Tambah flag `isLoadingQR` untuk mencegah multiple request bersamaan
- QR refresh interval diperlambat dari 6 detik ke 9 detik
- Reset counter saat status berubah
- Await loadQR untuk memastikan selesai sebelum lanjut

## Cara Testing

### 1. Restart Server

```bash
# Stop server dengan Ctrl+C
# Kemudian start ulang:
npm start
# atau
node dashboard/server.js
```

### 2. Test Auto-Connect

1. Login ke dashboard
2. Seharusnya otomatis redirect ke `/bot-status?autoconnect=1`
3. QR code seharusnya muncul dalam 2-3 detik
4. Jika tidak muncul, check browser console untuk error

### 3. Test Manual Connect

1. Akses `/bot-status` langsung
2. Klik tombol **"📲 Hubungkan WhatsApp"**
3. QR code seharusnya muncul dalam 2-3 detik
4. Scan dengan WhatsApp

### 4. Test Reset

1. Saat bot sudah connected
2. Klik tombol **"🔄 Ganti / Reset Koneksi"**
3. QR code baru seharusnya muncul
4. auth_info lama akan dihapus

### 5. Test Disconnect

1. Saat bot sudah connected
2. Klik tombol **"🗑️ Hapus / Putuskan WhatsApp"**
3. Bot seharusnya disconnect
4. auth_info masih ada (bisa reconnect tanpa scan QR)

## Troubleshooting

### QR masih stuck setelah fix

**Solusi**:
1. Clear cache browser (Ctrl + F5)
2. Restart server
3. Check console browser untuk error
4. Check console server untuk error

### Error: "Cannot find module 'qrcode'"

**Solusi**:
```bash
npm install qrcode
```

### Error: "startBot is not a function"

**Solusi**: Pastikan import di server.js sudah benar:
```javascript
import { startBot, stopBot, resetBot, getBotStatus, getQrString, getWaNomor, bersihkanNomor } from '../bot-core.js';
```

### QR muncul tapi tidak bisa discan

**Solusi**:
1. Pastikan QR code bukan corrupt (check base64 string)
2. Coba reset WhatsApp
3. Pastikan Baileys library up to date
4. Check apakah qr_string di database valid

### Auto-connect tidak berjalan

**Solusi**:
1. Check parameter `?autoconnect=1` di URL
2. Check console browser untuk error
3. Pastikan redirect dari login sudah benar

## File Yang Diubah

✅ `dashboard/server.js` - Tambah 2 endpoint baru + timeout handling
✅ `dashboard/views/bot-status.ejs` - Perbaiki QR polling logic

## Checklist Fix

- [x] Tambah endpoint `/api/bot/connect`
- [x] Tambah endpoint `/api/bot/disconnect`
- [x] Tambah timeout handling di QR generation
- [x] Perbaiki loadQR() function
- [x] Optimalkan polling interval
- [x] Tambah flag anti-race condition
- [x] Error handling yang lebih baik
- [x] Error message display ke user
- [x] Logging untuk debugging
- [x] Test auto-connect flow
- [x] Test manual connect flow
- [x] Test reset flow
- [x] Test disconnect flow

## Status: ✅ SELESAI

QR code sekarang seharusnya muncul dengan normal tanpa stuck!

---

**Tanggal**: 11 Agustus 2026  
**Versi**: 1.0.0
