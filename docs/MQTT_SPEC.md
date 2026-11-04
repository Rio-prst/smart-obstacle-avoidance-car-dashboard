# Spesifikasi MQTT (kontrak firmware ↔ backend)

Perubahan file ini wajib dilakukan SEBELUM mengubah kode firmware atau backend.

## Koneksi
- MQTT 3.1.1 over TLS, port 8883. Broker: lihat `.env`.
- Client ID: `car01` (ESP32), `backend-<random>` (BE). Tidak boleh sama.
- Kredensial terpisah untuk ESP32 dan BE. ACL (jika tersedia):
  - ESP32 publish: `car/car01/telemetry|status|event|cmd/ack|pong`
  - ESP32 subscribe: `car/car01/cmd|config|drive|ping`
  - BE publish: `car/+/cmd|config|drive|ping`
  - BE subscribe: `car/+/telemetry|status|event|cmd/ack|pong`
- ESP32: `clean_session = true`, keepalive 30 s, LWT ke `car/car01/status`.

## Topic
| Topic | Publisher | Subscriber | QoS | Retain |
|---|---|---|---|---|
| `car/{id}/telemetry` | ESP32 | BE | 0 | false |
| `car/{id}/status` | ESP32 (+LWT) | BE | 1 | **true** |
| `car/{id}/event` | ESP32 | BE | 1 | false |
| `car/{id}/cmd` | BE | ESP32 | 1 | **false (dilarang true)** |
| `car/{id}/cmd/ack` | ESP32 | BE | 1 | false |
| `car/{id}/config` | BE | ESP32 | 1 | true |
| `car/{id}/drive` | BE | ESP32 | 0 | **false (dilarang true)** |
| `car/{id}/ping` | BE | ESP32 | 0 | **false** |
| `car/{id}/pong` | ESP32 | BE | 0 | false |

## Payload (JSON, UTF-8, semua field wajib kecuali ditandai opsional)

### telemetry
```json
{"seq":1042,"ts":1730700000,"mode":"AUTO","dist_cm":38.5,"valid":true,"state":"MAJU","pwm":180,"avoid_count":7,"rssi":-61}
```
- `seq`: integer naik, reset saat boot.
- `ts`: epoch detik UTC (NTP). Jika NTP belum sinkron kirim `0`; BE memakai waktu terima.
- `mode`: `AUTO | MANUAL`.
- `dist_cm`: float 2 s.d. 400, atau `null` jika `valid=false`.
- `state`: `STOP | MAJU | PINDAI | BELOK` (`PINDAI` hanya di AUTO).
- `pwm`: integer 0 s.d. 255 (perintah PWM, bukan kecepatan terukur).
- `avoid_count`: integer ≥ 0 (hanya bertambah di AUTO).
- `rssi`: integer negatif (dBm).
- Frekuensi: maksimum 1 pesan/detik, ditambah 1 pesan segera saat `state` atau `mode` berubah.

### status (retained)
```json
{"online":true,"fw":"0.1.0","boot_ts":1730699900}
```
LWT: `{"online":false}`. ESP32 mempublikasikan `online:true` (retained) setiap berhasil connect.

### event
```json
{"seq":311,"ts":1730700005,"mode":"AUTO","type":"STOP","detail":{"dist_cm":24.1,"reason":"OBSTACLE"}}
```
`type` dari ESP32:
- Transisi state (state yang BARU dimasuki): `STOP | MAJU | PINDAI | BELOK`
- `BOOT`, `AVOID_DONE`, `SENSOR_FAIL`, `STOP_BUTTON`, `CMD_REJECTED`
- `MODE_CHANGE` (detail: `{"from":"AUTO","to":"MANUAL"}`)
- `MANUAL_BLOCKED` (maju diblokir karena rintangan/data tidak valid; maksimum 1 per 2 detik)
- `MANUAL_TIMEOUT` (watchdog menghentikan mobil)

`detail.reason` untuk `STOP`: `OBSTACLE | NO_PATH | CMD | SENSOR_FAIL | BUTTON | BOOT | MANUAL_IDLE`.
(`NO_PATH` = kedua sisi sempit/data tidak valid, STOP permanen.)

Event yang dibuat **backend** (tidak lewat MQTT): `DEVICE_ONLINE`, `DEVICE_OFFLINE` (detail: `{"source":"LWT|TIMEOUT"}`).

### cmd
```json
{"seq":55,"cmd":"START","exp":1730700030}
{"seq":56,"cmd":"SET_MODE","mode":"MANUAL","exp":1730700030}
```
- `cmd`: `START | STOP | SET_MODE`. `mode` wajib untuk `SET_MODE`: `AUTO | MANUAL`.
- `seq`: integer unik naik per device, dibuat BE.
- `exp`: epoch detik UTC kedaluwarsa (default: waktu kirim + 30 s).

### cmd/ack
```json
{"seq":55,"ok":true,"reason":null,"ts":1730700001}
```
`reason` bila `ok=false`: `EXPIRED | SENSOR_NOT_READY | TIME_NOT_SYNCED | INVALID | DUPLICATE | WRONG_MODE | NOT_STOPPED`.
Ack config: `{"seq":0,"ok":true,"reason":null,"cfg_ver":4,"ts":...}`.

### config (retained)
```json
{"ver":4,"stop_cm":25,"resume_cm":30,"max_pwm":200,"manual_max_pwm":150}
```
Rentang valid (ESP32 menolak di luar rentang, BE juga menolak):
- `stop_cm`: 15 s.d. 100
- `resume_cm`: `stop_cm + 3` s.d. 150
- `max_pwm`: 80 s.d. 255
- `manual_max_pwm`: 80 s.d. 180 dan ≤ `max_pwm`
- `ver`: integer naik. Parameter terakhir yang valid disimpan di ESP32.

### drive (hanya berlaku di mode MANUAL)
```json
{"sid":4,"seq":120,"dir":"F","spd":60,"ttl_ms":500}
```
- `dir`: `F` (maju), `L` (belok kiri di tempat), `R` (belok kanan di tempat), `S` (stop). **Tidak ada mundur.**
- `spd`: 0 s.d. 100. PWM = `spd/100 × manual_max_pwm`.
- `ttl_ms`: 100 s.d. 500. Di luar rentang: pesan dibuang.
- `sid`: id sesi kendali (naik tiap kunci baru diambil). `seq`: naik dalam satu `sid`.

### ping / pong
```json
{"seq":9,"t":1730700000123}
```
BE mengirim `ping` (`t` = epoch ms BE). ESP32 membalas `pong` dengan isi yang sama, segera, tanpa mengubah state.
RTT dihitung BE = waktu terima pong − `t`.

## Aturan perilaku ESP32

### Umum
1. Saat boot: mode AUTO, state STOP, motor STOP, driver STBY LOW, tunggu perintah baru. Tidak pernah auto-start.
2. `STOP` (cmd) selalu diterima dan dijalankan segera di mode apa pun, tanpa cek `exp`/waktu.
3. `START` ditolak jika: mode bukan AUTO (`WRONG_MODE`), `exp` lewat, waktu belum sinkron NTP, sensor belum siap, atau `seq` ≤ seq terakhir.
4. `SET_MODE` ditolak jika state bukan STOP (`NOT_STOPPED`), atau gagal validasi `exp`/waktu/`seq` seperti START (sensor tidak perlu siap).
   Saat berhasil: kirim ack ok, event `MODE_CHANGE`, dan reset pelacakan `sid/seq` drive.
5. Reconnect tidak boleh menjalankan START lama (clean session + cek `exp` + cek `seq`).
6. Reconnect Wi-Fi/MQTT berbatas waktu dan non-blocking (coba tiap 5 s), tidak boleh menahan loop kendali.
7. Setiap `cmd` yang diterima WAJIB dijawab ack (ok atau tidak).
8. Tombol STOP fisik berlaku di mode apa pun (event `STOP_BUTTON`, mode tidak berubah).

### Mode MANUAL
1. `drive` diabaikan jika mode AUTO.
2. Terima `drive` hanya jika `sid` > sid terakhir, atau `sid` sama dan `seq` > seq terakhir. Selain itu dibuang.
3. `dir=S`: STOP segera (reason `MANUAL_IDLE`).
4. `dir=F`: hanya jalan jika sensor depan valid dan tidak basi, dan jarak > `stop_cm`.
   Setelah diblokir, baru boleh jalan lagi jika jarak > `resume_cm`. Jika diblokir: motor STOP + event `MANUAL_BLOCKED`.
5. `dir=L|R`: hanya jika sensor depan valid dan tidak basi. Servo tidak memindai (tetap menghadap depan).
6. Setiap `drive` yang diterima menetapkan batas waktu = sekarang + `ttl_ms`. Jika batas lewat tanpa `drive` baru:
   STOP + event `MANUAL_TIMEOUT`.
7. Jika MQTT/Wi-Fi putus saat MANUAL: STOP segera. Setelah reconnect tetap STOP sampai ada `drive` baru yang valid.
8. Data sensor tidak valid/timeout dianggap TIDAK aman: tidak bergerak maju/belok.
9. Perlambatan/pembatasan PWM manual memakai `manual_max_pwm` saja, bukan `max_pwm`.

### Mode AUTO
- Logika penghindaran sepenuhnya lokal (lihat panduan proyek dan `SAFETY_RULES.md`).
- `avoid_count` +1 saat siklus STOP(OBSTACLE) → PINDAI → BELOK → MAJU selesai; emit `AVOID_DONE`.

## Aturan perilaku backend
1. Validasi semua payload masuk. Rusak: log ringan dan abaikan, jangan crash.
2. `seq` perintah dibuat atomik di DB per device.
3. Tandai device offline jika tidak ada pesan (telemetry/status) lebih dari 15 detik, selain dari LWT. Buat event `DEVICE_OFFLINE`; saat kembali, `DEVICE_ONLINE`.
4. Tidak ada retained pada `cmd`, `drive`, `ping`.
5. Ack tidak datang dalam 10 detik: status perintah `expired`.
6. `drive` hanya dipublish jika: pemegang kunci valid, device online, telemetri terakhir `mode=MANUAL` dan umurnya < 5 s,
   RTT ≤ batas (kecuali `dir=S`), dan di bawah rate limit. Selain itu dibuang dan dibalas `drive.rejected`.
7. `ping` dikirim tiap 2 detik selama ada kunci kendali aktif, dan tiap 10 detik jika tidak.
8. `sid` bertambah setiap kunci kendali baru diambil (disimpan di DB, tidak reset saat BE restart).