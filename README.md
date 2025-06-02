# Aplikasi Deteksi Objek Realtime dengan AI

Aplikasi web untuk deteksi objek secara realtime menggunakan kamera dan teknologi AI. Aplikasi ini menggunakan TensorFlow.js dengan model COCO-SSD untuk deteksi objek lokal di browser, dan Gemini API untuk analisis lanjutan objek yang terdeteksi.

## Fitur Utama

- 🎥 Deteksi objek realtime menggunakan kamera perangkat
- 🔍 Mengenali puluhan objek umum secara otomatis
- 📊 Tampilan daftar objek yang terdeteksi dengan persentase keyakinan
- 🆕 Notifikasi saat objek baru terdeteksi
- 🤖 Analisis lanjutan objek menggunakan Gemini API
- 📱 Responsif di berbagai perangkat (desktop, tablet, mobile)

## Cara Menggunakan

1. Buka aplikasi di browser modern (Chrome, Firefox, Edge, Safari)
2. Berikan izin akses kamera saat diminta
3. Arahkan kamera ke objek yang ingin dideteksi
4. Aplikasi akan menampilkan kotak di sekitar objek yang terdeteksi dengan labelnya
5. Objek baru yang terdeteksi akan ditambahkan ke daftar dan dianalisis lebih lanjut

## Optimasi Kinerja

Aplikasi ini telah dioptimalkan untuk kinerja:

- Menggunakan model TensorFlow.js yang ringan (lite version)
- Caching model di IndexedDB untuk mempercepat pemuatan berikutnya
- Kompresi data transmisi untuk API Gemini
- Preloading dan loading asinkron untuk aset JavaScript
- Optimasi server dengan kompresi dan caching

## Teknologi yang Digunakan

- TensorFlow.js - Framework machine learning untuk browser
- COCO-SSD - Model deteksi objek pre-trained
- Gemini API - API untuk analisis gambar lanjutan
- Express.js - Web server
- HTML5, CSS3, JavaScript - Front-end

## Instalasi dan Menjalankan Lokal

```bash
# Clone repositori (jika menggunakan git)
git clone <url-repositori>

# Pindah ke direktori proyek
cd aplikasi-deteksi-objek-ai

# Install dependensi
npm install

# Jalankan server
npm start

# Buka browser dan akses
http://localhost:3000
```

## Pemecahan Masalah

Jika model AI memuat terlalu lama:
1. Pastikan koneksi internet stabil untuk mengunduh model (hanya dibutuhkan saat pertama kali)
2. Gunakan browser modern yang mendukung WebGL
3. Jika menggunakan perangkat mobile, pastikan memiliki RAM yang cukup
4. Coba refresh halaman jika model gagal dimuat

## Catatan

- Deteksi objek dilakukan sepenuhnya di browser menggunakan TensorFlow.js
- Gambar objek baru dikirim ke Gemini API untuk analisis lanjutan
- Aplikasi membutuhkan akses kamera untuk berfungsi 