# Dashboard Chatbot Desa — React Native Web

Frontend admin dashboard (migrasi dari EJS ke **React Native Web**) untuk chatbot WhatsApp administrasi desa.

> Web-only: aplikasi ini dikembangkan dan dijalankan khusus untuk browser (React Native Web).
> Tidak ada dukungan iOS/Android native.

## Tech Stack

- **Expo SDK 57** + **expo-router** (file-based routing)
- **React Native Web** (berjalan di browser)
- **TypeScript**

## Struktur

```
mobile/
├── app.json                     # Konfigurasi Expo (web)
├── .env                         # EXPO_PUBLIC_API_URL (dev → http://localhost:3000)
├── src/
│   ├── api/
│   │   ├── client.ts            # Fetch wrapper (credentials: 'include', error handling)
│   │   └── types.ts             # Tipe data API
│   ├── app/
│   │   ├── _layout.tsx          # AuthProvider + gate redirect ke /login
│   │   ├── login.tsx            # Halaman login
│   │   ├── layanan/[id].tsx     # Form tambah/edit layanan (id="baru" = tambah)
│   │   └── (tabs)/
│   │       ├── _layout.tsx      # Tab bar
│   │       ├── index.tsx        # Dashboard (statistik)
│   │       ├── layanan.tsx      # Kelola layanan
│   │       ├── riwayat.tsx      # Riwayat chat + filter tanggal + pagination
│   │       └── statistik.tsx    # Statistik penggunaan bot
│   ├── components/              # UI reusable (Button, DataTable, StatCard, dll)
│   ├── hooks/useAuth.tsx        # Auth context
│   ├── theme.ts                 # Design system (warna dari style.css lama)
│   └── utils/format.ts          # Format tanggal id-ID
```

## Menjalankan (Development)

Backend API (port 3000):

```bash
# di root project
npm run dashboard
```

Frontend (port 8081):

```bash
cd mobile
npm install
npm run web
```

Buka `http://localhost:8081`. Login: `admin` / `admin123`.

> `.env` sudah berisi `EXPO_PUBLIC_API_URL=http://localhost:3000` agar app memanggil API dev.
> CORS di `dashboard/server.js` mengizinkan origin `http://localhost:8081` (bisa diubah via env `DASHBOARD_DEV_ORIGIN`).

## Build Production

```bash
cd mobile
npm run build:web      # menghasilkan mobile/dist
```

`dashboard/server.js` otomatis mendeteksi `mobile/dist` dan menyajikannya sebagai
dashboard (same-origin, tanpa CORS). Jika build tidak ada, dashboard EJS lama tetap
berfungsi sebagai fallback.

## Catatan

- Autentikasi memakai cookie session (sama seperti dashboard EJS lama), cocok untuk web.
- Web-only: script `start`/`web` selalu menjalankan `expo start --web`; tidak ada target native.
