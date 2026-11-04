# Arsitektur

## Alur data
```
ESP32 (smart thing + kendali lokal)
   │  MQTT over TLS :8883
   ▼
MQTT Broker (cloud)
   │  MQTT over TLS :8883
   ▼
Backend NestJS ──► PostgreSQL
   │  REST + Socket.IO (JWT)
   ▼
Frontend React
```
Frontend TIDAK terhubung langsung ke broker. Semua lewat backend.

## Pemetaan layer IoT
| Layer | Komponen |
|---|---|
| Smart things | ESP32, HC-SR04, servo SG90, TB6612FNG, motor |
| Gateway/komunikasi | Wi-Fi 2,4 GHz, hotspot/router, MQTT broker |
| Middleware | Backend NestJS (validasi, penyimpanan, event, command/kendali, analisis) |
| Application | Dashboard React |

## Struktur modul backend (`backend/src`)
```
mqtt/        koneksi broker, publish/subscribe wrapper (provider, bukan microservice)
telemetry/   parse, validasi, sampling, simpan, REST riwayat
events/      event dari ESP32 + event server (DEVICE_ONLINE/OFFLINE)
commands/    START/STOP/SET_MODE: seq, exp, ack, timeout, status
control/     kunci kendali manual, pesan drive, ping/pong (RTT)
devices/     status online/offline (LWT + heartbeat), config
sessions/    sesi uji, percobaan, ringkasan sesi
analytics/   query agregasi (sensor, penghindaran, state, perintah, konektivitas, jarak berhenti, perbandingan config)
export/      ekspor CSV
realtime/    Socket.IO gateway, room per deviceId
auth/        login admin, JWT guard
config/      validasi env saat start
```

## Alur pesan masuk (telemetri)
1. `mqtt` menerima pesan, emit event internal (EventEmitter2) `mqtt.message` berisi topic + payload mentah.
2. `telemetry` memvalidasi payload (zod). Invalid: log ringan lalu buang.
3. Dua konsumen terpisah: penyimpan DB (dengan sampling) dan `realtime` (tanpa sampling, ke room `device:{id}`).

## Alur perintah (START/STOP/SET_MODE)
1. FE `POST /commands` → `commands` membuat baris `pending` dengan `seq` dan `exp`.
2. `mqtt` publish ke `car/{id}/cmd` (QoS 1, retain false).
3. ESP32 memproses lalu publish ke `car/{id}/cmd/ack`.
4. `commands` memperbarui status (`acked`/`rejected`). Tanpa ack sampai timeout: `expired`.
5. `realtime` mengirim `command.update` ke FE.

## Alur kendali manual
1. Operator `POST /control/acquire` → BE membuat kunci (epoch `sid` baru, kedaluwarsa jika tidak ada heartbeat).
2. Operator mengirim `SET_MODE=MANUAL` (lewat alur perintah), menunggu ack dan telemetri `mode=MANUAL`.
3. FE mengirim event Socket.IO `drive` ±5-10 Hz selama tombol ditahan (+ `control.heartbeat` saat idle).
4. `control` memvalidasi (pemegang kunci, device online, mode MANUAL, RTT, rate limit) lalu publish ke
   `car/{id}/drive` (QoS 0, TTL pendek). Pesan yang tidak lolos dibuang dan dibalas `drive.rejected`.
5. ESP32 menjalankan gerak selama pesan terus datang, memblokir maju jika ada rintangan, dan STOP otomatis
   jika tidak ada pesan dalam TTL (watchdog).
6. `control` mengirim `ping` periodik, ESP32 membalas `pong`; RTT dihitung dan dikirim ke FE (`rtt`).
7. Kunci dilepas saat release, disconnect socket, atau kedaluwarsa.

## Alur analisis
Query agregasi SQL di modul `analytics` (date_trunc, percentile_cont, window function) atas tabel
`telemetry`, `events`, `commands`, `test_sessions`, `test_trials`. Hasil dapat difilter `from/to`, `sessionId`, `mode`.

## Keputusan teknis
- **NestJS**: tim sudah familiar; modul dan event-driven cocok untuk MQTT → DB → WS.
- **mqtt.js langsung**, bukan `@nestjs/microservices`, karena butuh wildcard subscribe.
- **PostgreSQL**: disk free tier hosting sering ephemeral, SQLite berisiko hilang saat redeploy.
- **Socket.IO**: room per device dan reconnect bawaan.
- **`drive` terpisah dari `cmd`**: frekuensi tinggi, tanpa ack per pesan, data basi dalam ms sehingga lebih baik dibuang.
- **Clean session pada ESP32**: perintah yang terlewat tidak diantrikan broker.
- **Sampling penyimpanan**: telemetri tidak disimpan per pesan. Durasi state yang akurat dihitung dari event.
- **Event server** (DEVICE_ONLINE/OFFLINE) dibuat BE agar uptime dan durasi putus dapat dianalisis.
- **Analisis deskriptif**: bisa dipertanggungjawabkan di laporan; tanpa ML.
- **Deploy**: BE di layanan yang menjalankan proses terus-menerus (bukan serverless). FE di hosting statis.