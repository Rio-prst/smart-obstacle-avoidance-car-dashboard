# PRD: Dashboard Smart Obstacle-Avoidance Car

## 1. Tujuan
Dashboard web yang menampilkan data mobil secara realtime melalui internet (MQTT), menyimpan
riwayat, mengirim perintah/konfigurasi dengan aman, menyediakan mode manual terbatas, serta
menghasilkan bukti pengujian dan analisis untuk laporan.

## 2. Ruang lingkup
- 1 mobil (`car01`), kode mendukung lebih dari satu device.
- Arena indoor, lantai datar.
- Pengguna: admin (anggota kelompok) dengan login.
- Mode: AUTO (otonom) dan MANUAL (hold-to-move, terbatas).

## 3. Di luar lingkup (non-goals)
- Streaming video/kamera.
- Gerak mundur (tidak ada sensor belakang), baik AUTO maupun MANUAL.
- Kendali manual oleh lebih dari satu operator pada waktu bersamaan.
- Model prediksi/ML. Analisis hanya statistik deskriptif.
- Multi-tenant, billing, notifikasi push.
- Dashboard sebagai penentu keselamatan.

## 4. Fitur

### F1. Monitoring realtime
- Status koneksi online/offline, mode (AUTO/MANUAL), state (STOP/MAJU/PINDAI/BELOK).
- Jarak depan (cm). Jika `valid=false` tampilkan "Tidak valid", bukan angka.
- Perintah PWM (bukan "kecepatan"), jumlah penghindaran, RSSI.
- Grafik jarak dan PWM terhadap waktu.
- Indikator kesegaran: timestamp dan umur data ("3 detik lalu"). Jika data lebih tua dari 5 detik
  atau socket terputus, tandai "data tidak mutakhir" dan jangan tampilkan sebagai live.

### F2. Riwayat
- Tabel dan grafik telemetri berdasarkan rentang waktu.
- Daftar event, termasuk DEVICE_ONLINE/DEVICE_OFFLINE.

### F3. Perintah dan mode
- START, STOP, dan ganti mode (AUTO/MANUAL).
- START hanya berlaku di mode AUTO. Ganti mode hanya saat mobil berhenti.
- STOP selalu tersedia dan berprioritas.
- Status perintah: pending, acked, rejected, expired, beserta latensi ack (ms).
- Peringatan: STOP dari cloud bukan penghentian darurat.

### F4. Konfigurasi
- Ambang STOP, ambang lanjut (hysteresis), batas PWM otomatis, batas PWM manual.
- Validasi rentang di FE, BE, dan ESP32. Parameter terakhir yang valid disimpan.

### F5. Autentikasi
- Login admin (JWT). Semua endpoint dan WebSocket butuh token, kecuali `/health` dan `/auth/login`.

### F6. Mode manual
- Kontrol: Maju, Belok Kiri, Belok Kanan, Stop. Tidak ada Mundur.
- Hold-to-move: mobil bergerak hanya selama tombol ditahan dan perintah terus dikirim.
- Sensor rintangan tetap aktif. Maju diblokir jika jarak depan di bawah ambang STOP atau data tidak valid.
- Hanya satu operator (kunci kendali). Operator lain melihat siapa yang memegang kendali.
- Indikator latensi (RTT). Tombol gerak dinonaktifkan jika RTT melebihi batas, tombol Stop tetap aktif.
- Kecepatan manual dibatasi `manual_max_pwm`.
- Manual dikerjakan setelah mode AUTO dan perintah dasar stabil.

### F7. Sesi uji dan bukti
- Buat sesi uji: jenis (SENSOR, PENGHINDARAN, JARAK_BERHENTI, DAYA, KONEKSI_PUTUS, STOP) dan metadata:
  jenis/ukuran rintangan, permukaan lantai, lebar lintasan, level baterai, setelan PWM.
- Snapshot konfigurasi (stop_cm, resume_cm, max_pwm, manual_max_pwm) dan mode tersimpan di sesi.
- Catat percobaan secara manual: Berhasil/Tabrakan, atau nilai ukur (jarak referensi, jarak berhenti, latensi STOP).
  Untuk uji sensor, pembacaan diambil otomatis dari telemetri terbaru.
- Ringkasan per sesi otomatis: tingkat keberhasilan (tanpa tabrakan ÷ percobaan × 100%), galat sensor
  (rata-rata, maksimum, jumlah invalid per titik), jarak berhenti per PWM.
- Target (mis. 18/20) selalu berlabel "target awal".
- Hasil keberhasilan penghindaran hanya dari sesi mode AUTO.

### F8. Analisis (statistik deskriptif)
- Ringkasan sensor (rata-rata/min/maks, persentase invalid).
- Performa penghindaran (jumlah siklus, durasi siklus, jarak saat STOP terpicu, STOP permanen).
- Distribusi waktu per state.
- Kinerja perintah (latensi ack rata-rata/p95/maks, rasio acked/rejected/expired, alasan penolakan).
- Konektivitas (uptime %, jumlah dan durasi putus, RSSI sebelum putus).
- Jarak berhenti vs PWM dan **saran** ambang STOP (tidak diterapkan otomatis).
- Perbandingan konfigurasi (keberhasilan per kombinasi parameter).
- Semua dapat difilter berdasarkan rentang waktu, sesi uji, dan mode.
- Batasan ditampilkan di UI: tabrakan tidak terdeteksi otomatis, kecepatan tidak terukur,
  telemetri disampling ±2 detik.

### F9. Ekspor
- Ekspor CSV: telemetri, event, perintah, dan hasil sesi uji.

### Definisi `avoid_count`
Bertambah 1 setiap siklus STOP karena rintangan → PINDAI → BELOK → kembali MAJU selesai
(event `AVOID_DONE`). Siklus yang berakhir STOP permanen tidak dihitung. Hanya dihitung di mode AUTO.

### Opsional (di luar lingkup awal)
- Telemetri tegangan baterai (butuh pembagi tegangan ke ADC). Sementara dicatat manual di metadata sesi.

## 5. Kriteria penerimaan
- [ ] Data telemetri tampil di dashboard dari jaringan berbeda dengan mobil (bukti akses internet).
- [ ] START/STOP/SET_MODE diproses mobil dan ack tercatat beserta latensinya.
- [ ] Hotspot dimatikan saat AUTO berjalan: mobil tetap menghindar, dashboard menjadi offline.
- [ ] Setelah hotspot menyala kembali, mobil TIDAK auto-start dari perintah lama.
- [ ] Perintah kedaluwarsa ditolak.
- [ ] Payload rusak tidak membuat BE crash.
- [ ] Mode manual: mobil berhenti sendiri maksimal ±500 ms setelah perintah berhenti datang atau koneksi putus.
- [ ] Mode manual: maju diblokir saat ada rintangan di depan walau tombol ditahan.
- [ ] Hanya satu operator yang dapat mengendalikan manual pada satu waktu.
- [ ] Sesi uji menghasilkan ringkasan (keberhasilan, galat sensor, jarak berhenti) dan dapat diekspor.
- [ ] Halaman analisis tampil dengan data nyata dan keterbatasannya dicantumkan.

## 6. Risiko
- Hotspot tidak stabil saat demo: siapkan cadangan jaringan.
- Free tier broker/DB membatasi: cek kuota sebelum demo (1 pesan/detik ≈ 86.400 pesan/hari/device).
- Jam ESP32 belum sinkron (NTP): lihat aturan di `SAFETY_RULES.md`.
- Latensi cloud tidak pasti: mode manual dibuat aman secara desain, bukan bergantung pada koneksi bagus.