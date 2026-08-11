@echo off
title Chatbot Desa Bokor - Dashboard & WhatsApp Bot
color 0A
echo ==============================================
echo    Chatbot Desa Bokor - Start Program
echo ==============================================
echo.

cd /d "%~dp0"

REM Matikan proses node lama yang masih memakai port 3000 (jika ada).
REM Ini penting: saat jendela cmd sebelumnya ditutup, node child kadang
REM tidak ikut mati dan tetap menguasai port, sehingga bot baru gagal start.
echo [1/2] Membersihkan proses lama di port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo       Menghentikan proses PID %%a
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo       Selesai.
echo.

echo  Dashboard : http://localhost:3000
echo  Login     : admin / admin123
echo.
echo  QR Code akan muncul di halaman Status Bot
echo  jika WhatsApp belum terhubung.
echo.
echo  Tekan Ctrl+C untuk menghentikan program.
echo ==============================================
echo.

echo [2/2] Menjalankan dashboard & bot...
npm start
pause
