const express = require('express');
const compression = require('compression');
const app = express();
const port = process.env.PORT || 3000;

// Gunakan kompresi untuk mengurangi ukuran respons
app.use(compression());

// Atur header caching untuk file statis
app.use((req, res, next) => {
  // Atur Cache-Control untuk file JS dan CSS
  if (req.url.match(/\.(js|css)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache selama 1 hari
  }
  next();
});

// Menyajikan file statis dari direktori saat ini
app.use(express.static('./', {
  etag: true, // Aktifkan ETag untuk caching yang efisien
  lastModified: true // Aktifkan Last-Modified untuk caching yang efisien
}));

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  console.log('Buka browser dan akses URL di atas untuk menggunakan aplikasi deteksi objek');
}); 