# Rencana Pengujian

Catat hasil nyata (angka, foto, video). Target di bawah adalah target awal, BUKAN hasil yang sudah tercapai.

## Uji backend (otomatis)
- Validasi payload telemetry/event/ack/pong: rusak, field hilang, tipe salah → tidak crash, tidak tersimpan.
- Sampling: 1 baris per 2 detik, dan selalu simpan saat state/mode/valid berubah.
- `seq` perintah atomik (dua request bersamaan).
- Perintah tanpa ack > 10 detik → `expired`. Latensi ack terhitung benar.
- Validasi rentang config (termasuk `manual_max_pwm ≤ max_pwm`).
- Offline detection 15 detik: event `DEVICE_OFFLINE` dan `DEVICE_ONLINE` terbentuk.
- Guard JWT di REST dan WebSocket.
- Aturan BE: START di mode MANUAL → 409 `WRONG_MODE`; SET_MODE saat tidak STOP → 409 `NOT_STOPPED`.
- Kunci kendali: dua user acquire bersamaan (satu `CONTROL_TAKEN`), kedaluwarsa tanpa heartbeat, lepas saat socket putus.
- `drive` ditolak: bukan pemegang kunci, mode bukan MANUAL, RTT tinggi, data basi, rate limit. `drive S` tetap lolos.
- `sid` tidak reset setelah BE restart.
- Sesi: hanya satu `running` per device; trial ke sesi `ended` ditolak; `captureSensor` menolak telemetri basi.
- Ringkasan sesi dan semua endpoint analisis dihitung benar pada dataset dummy yang diketahui jawabannya.
- Retention tidak menghapus data di rentang sesi uji.
- Ekspor CSV: header, format waktu ISO, batas 7 hari.

## Uji integrasi (manual, broker nyata)
| Skenario | Cara | Hasil yang diharapkan |
|---|---|---|
| Telemetri sampai dashboard | Nyalakan mobil, buka dashboard dari jaringan lain | Data live tampil, bukti lewat internet |
| START/STOP | Tombol di dashboard (mode AUTO) | Mobil bergerak/berhenti, ack dan latensi tercatat |
| Perintah kedaluwarsa | Kirim START, putus Wi-Fi mobil > 30 s, sambungkan lagi | START tidak dijalankan |
| Koneksi putus (AUTO) | Matikan hotspot saat AUTO berjalan, nyalakan lagi | Mobil tetap menghindar, dashboard offline lalu online, TIDAK auto-start |
| Boot ulang | Reset ESP32 saat berjalan | Kembali AUTO+STOP, tunggu perintah |
| Sensor gangguan | Cabut/tutup sensor | `valid=false`, retry berbatas, lalu STOP, event `SENSOR_FAIL` |
| Config tidak valid | `stop_cm=5` via API dan via MQTT manual | Ditolak BE dan ESP32 |
| Payload rusak | Publish JSON rusak dengan MQTTX | BE tetap hidup |
| Broker putus | Matikan internet BE | BE reconnect otomatis, tidak crash |
| STOP fisik | Tombol STOP dan switch utama | Mobil berhenti, catat latensi |
| Ganti mode | SET_MODE saat mobil bergerak | Ditolak `NOT_STOPPED` |
| START di manual | Mode MANUAL lalu START | Ditolak `WRONG_MODE` |
| Manual: tahan lalu lepas | Tahan Maju, lepas tombol | Mobil berhenti ≤ ±500 ms |
| Manual: tab ditutup / blur | Tahan Maju, pindah tab atau tutup tab | Mobil berhenti |
| Manual: koneksi putus | Tahan Maju lalu putuskan Wi-Fi mobil | Mobil STOP segera, tidak jalan lagi setelah reconnect sebelum ada drive baru |
| Manual: rintangan | Tahan Maju menuju penghalang | Mobil berhenti sebelum `stop_cm`, event `MANUAL_BLOCKED`, tidak jalan lagi sampai jarak > `resume_cm` |
| Manual: sensor invalid | Tutup sensor saat manual | Maju/belok tidak bergerak |
| Manual: dua operator | Dua browser acquire | Yang kedua `CONTROL_TAKEN` |
| Manual: RTT tinggi | Batasi jaringan (throttle) | Tombol gerak nonaktif, Stop tetap aktif |
| Manual: tidak ada mundur | Cek UI dan firmware | Tidak ada kontrol dan `dir` mundur |
| Drive lama | Replay pesan `drive` lama dengan MQTTX | Dibuang (sid/seq lama) |

## Uji mobil (dari panduan proyek), dicatat lewat fitur sesi uji
- Sensor jarak: 10/20/30/50/100 cm, 10 kali per titik. Laporkan galat rata-rata, maksimum, jumlah invalid.
- Penghindaran (mode AUTO): rintangan depan, sisi kiri/kanan, sudut, lorong; 20 kali. Target awal minimal 18/20 tanpa kontak.
- Jarak berhenti: beberapa PWM, ukur jarak hingga berhenti. Ambang harus lebih besar dari jarak berhenti terburuk + margin.
- Daya: motor + servo + Wi-Fi aktif ± 10 menit, tidak reset.
- STOP: tombol STOP dan switch utama pada kecepatan rendah, catat latensi.

Tingkat keberhasilan = percobaan tanpa tabrakan / total percobaan × 100%.
Catat: jenis dan ukuran rintangan, permukaan lantai, lebar lintasan, level baterai, setelan PWM.

## Uji halaman analisis
- Bandingkan angka di dashboard dengan hitungan manual dari ekspor CSV pada sampel kecil.
- Keterbatasan data tampil di UI.
- Filter `mode`, `sessionId`, dan rentang waktu mengubah hasil sesuai yang diharapkan.