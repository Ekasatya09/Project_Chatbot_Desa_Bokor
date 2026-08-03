@echo off
title Chatbot Desa Bokor - Dashboard & WhatsApp Bot
color 0A
echo ==============================================
echo    Chatbot Desa Bokor - Start Program
echo ==============================================
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

cd /d "%~dp0"
npm start
pause
