# 🎁 Giveaway Picker

Sistem pengambil pemenang giveaway berbasis Google Sheets dan Discord.

## 🔧 Teknologi
- Google Apps Script (GAS) sebagai backend
- Google Spreadsheet sebagai database
- Vercel sebagai frontend host + API proxy
- Discord Webhook untuk input peserta

## 🚀 Deploy

### 1. Konfigurasi Google Apps Script
- Salin `Kode.gs` ke Google Apps Script
- Simpan Sheet ID di Script Properties:
  - `SHEET_ID=1Abc123xyz...`
- Publish → Deploy as Web App

### 2. Vercel `.env`
