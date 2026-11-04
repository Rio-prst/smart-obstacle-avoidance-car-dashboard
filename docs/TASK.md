# Tugas (kerjakan satu tahap per sesi; review dan commit sebelum lanjut)

## Tahap 0: Persiapan
- [ ] Buat repo, struktur folder, `.env.example` backend dan frontend, `.gitignore`
- [ ] Buat akun broker cloud, user terpisah untuk ESP32 dan BE (+ ACL jika ada)
- [ ] Tes broker dengan MQTTX: subscribe `car/#`, publish manual, TLS jalan
- [ ] Siapkan PostgreSQL (lokal Docker dan/atau cloud)

## Tahap 1: Backend dasar
- [ ] Scaffold NestJS, `config` dengan validasi env
- [ ] Prisma + migrasi awal (users, devices, telemetry, events, commands, device_config)
- [ ] Endpoint `/health`, modul `auth` (login + JWT guard), seed admin dan device `car01`

## Tahap 2: MQTT masuk
- [ ] Modul `mqtt`: connect TLS, reconnect, subscribe `car/+/telemetry|status|event|cmd/ack|pong`
- [ ] Validasi payload (zod), buang payload rusak tanpa crash
- [ ] Tes dengan MQTTX (publish dummy)

## Tahap 3: Firmware publish dummy
- [ ] ESP32 connect Wi-Fi + MQTT TLS, non-blocking reconnect, NTP sync
- [ ] Publish telemetry dummy (termasuk `mode`), status online + LWT
- [ ] Pastikan muncul di BE

## Tahap 4: Penyimpanan
- [ ] `telemetry`: sampling lalu simpan
- [ ] `events`: simpan semua, plus event server `DEVICE_ONLINE/OFFLINE` dan job offline detection
- [ ] Job retention (dengan pengecualian rentang sesi uji, aktifkan penuh setelah Tahap 8)
- [ ] Endpoint REST: devices, telemetry (latest + riwayat), events

## Tahap 5: Realtime
- [ ] Socket.IO gateway `/realtime` + JWT + room per device
- [ ] Dorong `telemetry`, `status`, `event` ke FE

## Tahap 6: Frontend dasar
- [ ] Scaffold React + Vite + Tailwind + shadcn/ui; terapkan token, kerangka aplikasi, dan komponen dasar sesuai `docs/DESIGN.md`; halaman login
- [ ] Dashboard: kartu status (online, mode, state), jarak, PWM, grafik realtime
- [ ] Banner socket putus, umur data terakhir
- [ ] Halaman riwayat (filter waktu) dan event

## Tahap 7: Perintah, mode, dan config
- [ ] `commands`: seq atomik, exp, publish QoS 1, ack, timeout `expired`, latensi
- [ ] START/STOP/SET_MODE dengan aturan `WRONG_MODE`/`NOT_STOPPED`
- [ ] Firmware: proses cmd + ack sesuai `MQTT_SPEC.md`
- [ ] FE: tombol START/STOP, ganti mode, status perintah + latensi, peringatan "bukan e-stop"
- [ ] Config: GET/PUT (termasuk `manual_max_pwm`), publish retained, ack, validasi rentang di FE/BE/ESP32

## Tahap 8: Sesi uji dan ekspor
- [ ] Migrasi `test_sessions`, `test_trials`; aktifkan pengecualian retention
- [ ] Endpoint sesi, percobaan (termasuk `captureSensor`), ringkasan per jenis
- [ ] FE: halaman sesi uji (buat, catat percobaan, ringkasan)
- [ ] Ekspor CSV (telemetri, event, perintah, sesi)

## Tahap 9: Integrasi dengan mobil (AUTO)
- [ ] Ganti data dummy dengan data sensor/state machine asli (event transisi state, `AVOID_DONE`, `avoid_count`)
- [ ] Uji sesuai `TESTING.md` untuk AUTO, catat lewat sesi uji
- [ ] Perbaiki temuan, simpan bukti (foto/video/tabel)

## Tahap 10: Mode manual (setelah AUTO dan perintah stabil)
- [ ] BE: modul `control` (kunci kendali, `sid`, rate limit), publish `drive`, `ping`/`pong` dan RTT
- [ ] Socket.IO: event `drive`, `control.heartbeat`, `control.update`, `rtt`, `drive.rejected`
- [ ] Firmware: `drive`, watchdog TTL, blokir maju, STOP saat putus, reset sid/seq saat masuk MANUAL
- [ ] FE: panel kontrol manual (Maju/Kiri/Kanan/Stop, hold-to-move), indikator RTT dan pemegang kunci, kirim `S` saat blur/lepas
- [ ] Uji skenario manual di `TESTING.md` pada kecepatan rendah, area aman

## Tahap 11: Analisis
- [ ] Modul `analytics`: sensor, state-distribution, avoidance, commands, connectivity, stop-distance, config-comparison, overview
- [ ] FE: halaman Analisis dengan filter (rentang, sesi, mode) dan catatan keterbatasan
- [ ] Verifikasi angka dengan hitungan manual dari ekspor CSV

## Tahap 12: Finalisasi
- [ ] Deploy BE dan FE, uji dari jaringan berbeda
- [ ] Rapikan dokumen, ERD, dan diagram untuk laporan
- [ ] Latihan demo dan siapkan rencana cadangan jaringan