/**
 * wa-notif.js
 * Notifikasi live chat (mode 98) di dashboard.
 * - Polling /api/live-chat setiap 5 detik
 * - Menampilkan banner + OS notification saat ada pengguna memilih mode 98
 * - Notifikasi memberi arahan untuk membuka WhatsApp (bukan ke halaman live-chat)
 */

(function () {
  'use strict';

  // ── Kunci localStorage ──────────────────────────────────────────
  const KEY_DISMISSED = 'wanotifDismissedIds';

  // ── State ───────────────────────────────────────────────────────
  let dismissed = new Set();
  let shownBannerId = null;
  let lastNotifId = null; // ID sesi terakhir yang sudah di-notif OS

  try {
    dismissed = new Set(JSON.parse(localStorage.getItem(KEY_DISMISSED) || '[]'));
  } catch { dismissed = new Set(); }

  // ── Expose helper global (dipakai tombol di banner) ─────────────
  window.waNotifDismiss = function (id) {
    dismissed.add(String(id));
    try { localStorage.setItem(KEY_DISMISSED, JSON.stringify([...dismissed])); } catch { }
    shownBannerId = null;
    const el = document.getElementById('waNotifContainer');
    if (el) el.innerHTML = '';
  };

  // ── Request permission OS notification ─────────────────────────
  function mintaIzinNotif() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    const requestOnce = () => {
      Notification.requestPermission();
      document.removeEventListener('click', requestOnce);
    };
    document.addEventListener('click', requestOnce, { once: true });
    setTimeout(() => {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, 2000);
  }

  // ── Tampilkan OS notification ───────────────────────────────────
  function tampilkanOsNotif(nomor, sesiId) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (lastNotifId === sesiId) return; // Jangan notif ulang sesi yang sama

    lastNotifId = sesiId;

    const notif = new Notification('🔔 Ada yang ingin bicara langsung!', {
      body: `Buka WhatsApp untuk merespons pengguna +${nomor}.`,
      tag: 'wanotif-' + sesiId, // Cegah duplikat — sesi ID unik
      requireInteraction: true,
      vibrate: [200, 100, 200],
    });

    notif.onclick = function () {
      window.focus();
      notif.close();
    };
  }

  // ── Tampilkan banner in-page ────────────────────────────────────
  function tampilkanBanner(sesi) {
    const container = document.getElementById('waNotifContainer');
    if (!container) return;
    if (shownBannerId === sesi.id) return;

    shownBannerId = sesi.id;
    container.innerHTML = `
      <div class="wa-notif" id="waBanner_${sesi.id}">
        <div class="wa-notif-icon">🔔</div>
        <div class="wa-notif-body">
          <div class="wa-notif-title">Ada yang ingin bicara langsung!</div>
          <div class="wa-notif-text">
            Pengguna <strong>+${sesi.nomor_wa_bersih}</strong> memilih chat langsung (98).
            Buka <strong>WhatsApp</strong> untuk merespons.
          </div>
        </div>
        <div class="wa-notif-actions">
          <button class="wa-notif-tutup" title="Tutup"
            onclick="waNotifDismiss(${sesi.id})">✕</button>
        </div>
      </div>
    `;
  }

  // ── Polling API ─────────────────────────────────────────────────
  async function cekSesiBaru() {
    try {
      const res = await fetch('/api/live-chat', { credentials: 'include' });
      if (res.status === 401) return; // Belum login

      const data = await res.json();
      const aktif = (data.sesiList || []).filter(s => s.status === 'aktif');

      // Cari sesi yang belum di-dismiss
      const baru = aktif.find(s => !dismissed.has(String(s.id)));

      if (baru) {
        tampilkanBanner(baru);
        tampilkanOsNotif(baru.nomor_wa_bersih, baru.id);
      } else {
        // Tidak ada sesi aktif yang belum di-dismiss → sembunyikan banner
        if (aktif.length === 0 && shownBannerId !== null) {
          shownBannerId = null;
          const container = document.getElementById('waNotifContainer');
          if (container) container.innerHTML = '';
        }
      }
    } catch { /* Abaikan error jaringan */ }
  }

  // ── Inisialisasi ────────────────────────────────────────────────
  mintaIzinNotif();
  cekSesiBaru();
  setInterval(cekSesiBaru, 5000);
})();
