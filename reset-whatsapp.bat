@echo off
echo ======================================
echo Reset Koneksi WhatsApp - Chatbot Desa
echo ======================================
echo.

REM Cek apakah folder auth_info ada
if exist auth_info (
    echo [1/3] Menghapus data autentikasi lama...
    rmdir /s /q auth_info
    echo       ✓ Folder auth_info berhasil dihapus
) else (
    echo [1/3] Folder auth_info tidak ditemukan (sudah bersih)
)

echo.
echo [2/3] Koneksi WhatsApp lama berhasil direset!
echo.
echo [3/3] Langkah selanjutnya:
echo       1. Jalankan: npm start
echo       2. Scan QR code baru dengan WhatsApp yang ingin dihubungkan
echo.
echo ======================================
echo Selesai!
echo ======================================
pause
