# Aturan Keselamatan (tidak boleh dilemahkan)

Dashboard dan cloud adalah lapisan tambahan. Keselamatan mobil ditentukan oleh firmware lokal.

## Prinsip
1. Keputusan rintangan 100% di ESP32. Mobil tetap menghindar saat Wi-Fi/cloud putus.
2. `STOP` selalu berprioritas atas perintah lain, di mode apa pun.
3. STOP dari cloud BUKAN penghentian darurat (bisa terlambat atau gagal). Penghentian darurat = switch daya fisik
   dan tombol STOP fisik. UI harus menuliskan ini.
4. Tidak ada gerak mundur (AUTO maupun MANUAL) karena tidak ada sensor belakang.

## Aturan firmware (umum)
- Boot ulang selalu kembali ke mode AUTO, state STOP, driver STBY LOW, menunggu perintah baru.
- Reconnect tidak boleh menjalankan START lama.
- `START` hanya jika mode AUTO, sensor siap, waktu valid (NTP), `exp` belum lewat, dan `seq` lebih baru.
- Ganti mode (`SET_MODE`) hanya saat state STOP.
- Data sensor tidak valid / timeout / umur data terlalu tua dianggap TIDAK aman: retry berbatas waktu, lalu STOP.
  "Unknown" tidak sama dengan "aman".
- Servo hanya memindai saat mobil berhenti (AUTO).
- Kedua sisi sempit atau data tidak valid berulang: tetap STOP dan laporkan event (`NO_PATH`).
- Konfigurasi di luar rentang ditolak. Simpan parameter terakhir yang valid.
- Reconnect Wi-Fi/MQTT non-blocking dan berbatas waktu.

## Aturan mode MANUAL (firmware)
- Sensor rintangan tetap aktif. Maju diblokir jika jarak < `stop_cm` atau data tidak valid/basi; boleh lagi hanya jika jarak > `resume_cm`.
- Hold-to-move: tanpa pesan `drive` baru dalam `ttl_ms` (maks 500 ms), mobil STOP otomatis (`MANUAL_TIMEOUT`).
- MQTT/Wi-Fi putus saat manual: STOP segera, dan tetap STOP setelah reconnect sampai ada `drive` baru yang valid.
- `drive` lama atau duplikat (cek `sid`/`seq`) dibuang. `drive` diabaikan di mode AUTO.
- PWM manual dibatasi `manual_max_pwm`. Belok hanya di tempat dan hanya jika sensor depan valid.
- Tombol STOP fisik dan switch utama tetap berlaku.

## Aturan backend
- Command tidak pernah retained. Command punya `seq` dan `exp`. Ack wajib. Tanpa ack = `expired`.
- `drive` dan `ping` tidak pernah retained dan QoS 0. Pesan drive yang tidak lolos validasi dibuang, bukan ditunda.
- Tolak `START`/`SET_MODE` ke device offline. Tolak `START` di mode MANUAL. Tolak `SET_MODE` jika tidak STOP.
- Satu pemegang kunci kendali per device. Kunci dilepas saat socket terputus atau tanpa heartbeat.
- `drive` (selain `S`) ditolak jika RTT melebihi batas, data basi, atau device tidak dalam mode MANUAL.
- Rate limit `drive` per user.
- Validasi rentang config sebelum publish.
- Jangan menganggap device aman karena tidak ada pesan error.

## Aturan frontend
- Jarak `valid=false` ditampilkan "Tidak valid", bukan angka.
- Jangan menampilkan data lama sebagai live saat socket putus atau device offline.
- Label PWM sebagai "perintah PWM", bukan kecepatan.
- Tombol Stop selalu aktif dan terlihat jelas. START dinonaktifkan jika offline atau mode MANUAL.
- Kontrol manual: hanya Maju, Kiri, Kanan, Stop. Kirim `S` saat tombol dilepas, tab kehilangan fokus, atau halaman ditutup.
- Tombol gerak manual dinonaktifkan saat RTT tinggi, data basi, bukan pemegang kunci, atau mode bukan MANUAL.
- Tampilkan peringatan: "STOP dari dashboard bukan penghentian darurat. Siapkan switch fisik."

## Integritas data uji dan analisis
- Hasil keberhasilan penghindaran hanya dari sesi mode AUTO.
- Target (mis. 18/20) selalu berlabel "target awal", tidak pernah ditampilkan sebagai hasil.
- Tabrakan tidak terdeteksi otomatis: dicatat manual oleh penguji.
- Saran ambang STOP dari analisis tidak diterapkan otomatis; harus diubah manual oleh operator lewat konfigurasi.
- Data di rentang sesi uji tidak boleh terhapus oleh retention.

## Kebersihan rahasia
- Token broker, kredensial Wi-Fi, JWT secret: hanya di `.env` / konfigurasi firmware lokal, tidak di repo publik dan tidak di laporan.