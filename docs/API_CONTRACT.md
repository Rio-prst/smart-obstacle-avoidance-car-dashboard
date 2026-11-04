# API Contract (Backend ↔ Frontend)

Base URL REST: `/api`. Format: JSON. Waktu: ISO 8601 UTC. Semua pesan response API berbahasa Inggris. Perubahan file ini wajib SEBELUM kode.

## Auth
Semua endpoint kecuali `/health` dan `/auth/login` butuh header `Authorization: Bearer <jwt>`.

### POST `/auth/login`
Request: `{"username":"admin","password":"..."}`
Response 200: `{"accessToken":"<jwt>","expiresIn":3600}`
Error: 401 `INVALID_CREDENTIALS`.

## Format error (semua endpoint)
```json
{"error":{"code":"VALIDATION_ERROR","message":"stop_cm is out of range","details":[{"field":"stop_cm","issue":"min 15"}]}}
```
Kode: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `CONTROL_REQUIRED` (403), `NOT_FOUND` (404),
`DEVICE_OFFLINE` (409), `WRONG_MODE` (409), `NOT_STOPPED` (409), `CONTROL_TAKEN` (409),
`SESSION_ENDED` (409), `CONFLICT` (409), `INTERNAL` (500).

## Health
### GET `/health`
```json
{"status":"ok","mqtt":"connected","db":"connected"}
```

## Devices
### GET `/devices`
```json
{"data":[{"id":"car01","name":"Mobil 1","online":true,"mode":"AUTO","state":"MAJU","lastSeen":"2026-11-04T08:00:00Z","fw":"0.1.0"}]}
```
### GET `/devices/:id`
Item di atas ditambah `"avoidCount":7` dan `"controller":null` atau `{"username":"admin","until":"2026-11-04T08:00:10Z"}`.

## Telemetri
### GET `/devices/:id/telemetry/latest`
```json
{"data":{"ts":"2026-11-04T08:00:00Z","mode":"AUTO","distCm":38.5,"valid":true,"state":"MAJU","pwm":180,"avoidCount":7,"rssi":-61}}
```
Belum ada data: 200 dengan `"data":null`.

### GET `/devices/:id/telemetry`
Query: `from`, `to` (ISO), `limit` (default 500, maks 2000), `interval` (opsional `1s|5s|30s|1m`, agregasi), `mode` (opsional).
```json
{"data":[{"ts":"...","mode":"AUTO","distCm":38.5,"valid":true,"state":"MAJU","pwm":180,"avoidCount":7}],"meta":{"count":1,"from":"...","to":"..."}}
```
`distCm` = `null` jika `valid=false`.

## Event
### GET `/devices/:id/events`
Query: `type`, `mode`, `from`, `to`, `limit` (default 50, maks 200), `cursor`.
```json
{"data":[{"id":"812","ts":"...","mode":"AUTO","source":"DEVICE","type":"STOP","detail":{"dist_cm":24.1,"reason":"OBSTACLE"}}],"meta":{"nextCursor":"811"}}
```
`source`: `DEVICE | SERVER`.

## Perintah dan mode
### POST `/devices/:id/commands`
Request: `{"cmd":"START"}`, `{"cmd":"STOP"}`, atau `{"cmd":"SET_MODE","mode":"MANUAL"}`.
Response 202:
```json
{"data":{"id":"90","seq":55,"cmd":"START","payload":null,"status":"pending","exp":"2026-11-04T08:00:30Z"}}
```
Aturan BE (berdasarkan status terakhir yang diketahui; ESP32 tetap otoritas akhir):
- `START`/`SET_MODE` saat device offline: 409 `DEVICE_OFFLINE`.
- `START` saat mode bukan AUTO: 409 `WRONG_MODE`.
- `SET_MODE` saat state bukan STOP: 409 `NOT_STOPPED`.
- `STOP` selalu dikirim (best effort) dan tetap 202 walau offline.

### GET `/devices/:id/commands`
Query: `limit` (default 20). Item: `{id, seq, cmd, payload, status, reason, latencyMs, createdAt, ackedAt}`.
`status`: `pending | acked | rejected | expired`. `latencyMs` = ackedAt − createdAt.

## Konfigurasi
### GET `/devices/:id/config`
```json
{"data":{"ver":4,"stopCm":25,"resumeCm":30,"maxPwm":200,"manualMaxPwm":150,"updatedAt":"..."}}
```
### PUT `/devices/:id/config`
Request: `{"stopCm":25,"resumeCm":30,"maxPwm":200,"manualMaxPwm":150}`
Rentang sama seperti `MQTT_SPEC.md`. Response 200 berisi config baru dengan `ver` naik; BE publish ke topic `config`.
Error 400 `VALIDATION_ERROR` jika di luar rentang.

## Kendali manual
### GET `/devices/:id/control`
```json
{"data":{"mode":"MANUAL","state":"STOP","controller":{"username":"admin","until":"2026-11-04T08:00:10Z"},"sid":4,"rttMs":180}}
```
### POST `/devices/:id/control/acquire`
Mengambil kunci kendali (butuh device online). Response 200: `{"data":{"sid":4,"expiresAt":"..."}}`.
Error 409 `CONTROL_TAKEN` jika dipegang user lain (berisi data pemegang).
### POST `/devices/:id/control/release`
Melepas kunci. Response 204. Saat dilepas BE mengirim `drive` `S` sebagai best effort.

Kunci kedaluwarsa otomatis `CONTROL_LOCK_TTL_SECONDS` setelah tidak ada `drive`/`control.heartbeat`, atau saat socket pemegang terputus.

## Sesi uji
### POST `/devices/:id/sessions`
```json
{"type":"PENGHINDARAN","name":"Rintangan depan balok 20cm","obstacleType":"balok","obstacleSize":"20x20 cm","floorSurface":"keramik","laneWidthCm":60,"batteryLevel":"penuh","pwmSetting":180,"notes":""}
```
`type`: `SENSOR | PENGHINDARAN | JARAK_BERHENTI | DAYA | KONEKSI_PUTUS | STOP`.
BE mengisi `mode` (dari mode saat ini), `configSnapshot` (config saat ini), dan `startedAt`. Response 201 berisi sesi.
Satu device hanya boleh punya satu sesi `running`; jika ada, 409 `CONFLICT`.

### GET `/devices/:id/sessions`
Query: `type`, `status` (`running|ended`), `limit`, `cursor`.
### GET `/sessions/:sid`
Detail sesi (metadata, `configSnapshot`, `startedAt`, `endedAt`, `status`).
### PATCH `/sessions/:sid`
Request: `{"status":"ended"}` atau perubahan `notes`/metadata. Mengakhiri sesi mengisi `endedAt`.

### POST `/sessions/:sid/trials`
Sesi harus `running` (jika tidak: 409 `SESSION_ENDED`). Body bergantung jenis sesi:
- PENGHINDARAN: `{"result":"SUCCESS"}` atau `{"result":"COLLISION"}`
- SENSOR: `{"refDistanceCm":50,"captureSensor":true}` → BE mengisi `measuredCm` dan `valid` dari telemetri terbaru (umur < 3 detik; jika tidak, 409 `CONFLICT`).
- JARAK_BERHENTI: `{"pwm":150,"stoppingDistanceCm":14.5}`
- STOP: `{"stopLatencyMs":320}` (opsional `note`)
- DAYA / KONEKSI_PUTUS: `{"result":"SUCCESS|FAIL","note":"tegangan 7.6V"}`
Response 201 berisi percobaan.
### GET `/sessions/:sid/trials`
### DELETE `/sessions/:sid/trials/:tid`

### GET `/sessions/:sid/summary`
Contoh PENGHINDARAN:
```json
{"data":{"type":"PENGHINDARAN","mode":"AUTO","trials":20,"success":18,"collision":2,"successRatePct":90.0,"target":{"success":18,"trials":20,"label":"initial target"}}}
```
SENSOR:
```json
{"data":{"type":"SENSOR","byPoint":[{"refCm":50,"n":10,"validN":9,"invalidN":1,"errorAvgCm":0.8,"errorMaxCm":1.6}]}}
```
JARAK_BERHENTI:
```json
{"data":{"type":"JARAK_BERHENTI","byPwm":[{"pwm":150,"n":5,"stoppingDistanceCm":{"avg":14.2,"max":17.0}}]}}
```
STOP: `{"latencyMs":{"avg":310,"max":420},"n":5}`. DAYA/KONEKSI_PUTUS: jumlah percobaan sukses/gagal, jumlah event `BOOT` dan outage selama rentang sesi.
Galat sensor = |measuredCm − refDistanceCm|. Data invalid dihitung terpisah, tidak masuk rata-rata galat.

## Analisis
Query bersama: `from`, `to` (default 24 jam terakhir), `sessionId` (jika diisi, menggantikan from/to dengan rentang sesi), `mode` (`AUTO|MANUAL`, opsional).
Semua dihitung dengan query agregasi SQL.

### GET `/devices/:id/analytics/sensor`
```json
{"data":{"total":1200,"valid":1150,"invalidCount":50,"invalidPct":4.17,"distCm":{"avg":42.3,"min":5.1,"max":212.0}}}
```
### GET `/devices/:id/analytics/state-distribution`
Dihitung dari urutan event transisi state, tidak termasuk periode offline.
```json
{"data":{"windowSeconds":3600,"observedSeconds":3400,"excludedOfflineSeconds":200,"byState":[{"state":"MAJU","seconds":2100,"pct":61.8},{"state":"STOP","seconds":900,"pct":26.5},{"state":"PINDAI","seconds":250,"pct":7.4},{"state":"BELOK","seconds":150,"pct":4.4}]}}
```
### GET `/devices/:id/analytics/avoidance`
Hanya mode AUTO (parameter `mode=MANUAL` ditolak 400).
```json
{"data":{"cycles":18,"permanentStops":2,"cycleDurationSec":{"avg":4.2,"min":3.1,"max":7.9},"stopTriggerDistCm":{"avg":24.6,"min":21.0,"max":27.3}}}
```
Durasi siklus = ts `AVOID_DONE` − ts `STOP` (reason `OBSTACLE`) sebelumnya.
### GET `/devices/:id/analytics/commands`
```json
{"data":{"byStatus":{"acked":40,"rejected":3,"expired":2},"byCmd":{"START":20,"STOP":18,"SET_MODE":7},"latencyMs":{"avg":180,"p95":420,"max":610},"rejectReasons":{"WRONG_MODE":2,"EXPIRED":1}}}
```
### GET `/devices/:id/analytics/connectivity`
```json
{"data":{"uptimePct":97.5,"disconnectCount":3,"outages":[{"from":"...","to":"...","durationSec":42,"source":"TIMEOUT","rssiBefore":-78}],"rssi":{"avg":-62,"min":-80,"max":-48}}}
```
### GET `/devices/:id/analytics/stop-distance`
Dari sesi `JARAK_BERHENTI`. Query tambahan: `marginCm` (default `ANALYTICS_STOP_MARGIN_CM`).
```json
{"data":{"byPwm":[{"pwm":150,"trials":5,"stoppingDistanceCm":{"avg":14.2,"max":17.0}}],"worstStoppingDistanceCm":19.5,"marginCm":10,"recommendedStopCm":30,"note":"Suggestion from test data, not applied automatically."}}
```
`recommendedStopCm` = ceil(worstStoppingDistanceCm + marginCm). Tanpa data uji: `"data":null`.
### GET `/devices/:id/analytics/config-comparison`
Dari sesi PENGHINDARAN mode AUTO yang sudah selesai, dikelompokkan berdasarkan snapshot config.
```json
{"data":[{"stopCm":25,"resumeCm":30,"maxPwm":200,"sessions":2,"trials":40,"success":37,"successRatePct":92.5}]}
```
### GET `/devices/:id/analytics/overview`
Ringkasan per mode: jumlah sampel telemetri, jumlah event per tipe, total detik per state.
```json
{"data":{"AUTO":{"samples":900,"events":{"STOP":30,"AVOID_DONE":18},"stateSeconds":{"MAJU":2100,"STOP":900}},"MANUAL":{"samples":300,"events":{"MANUAL_BLOCKED":4,"MANUAL_TIMEOUT":1},"stateSeconds":{"MAJU":120,"STOP":180}}}}
```
Semua respons analisis memuat `"meta":{"from","to","mode","sessionId"}` dan, di UI, catatan batasan
(tabrakan tidak terdeteksi otomatis, tidak ada kecepatan terukur, telemetri disampling ±2 detik).

## Ekspor CSV
Respons `text/csv`, waktu ISO 8601 UTC, header baris pertama.
- GET `/devices/:id/export/telemetry.csv?from&to&mode`
- GET `/devices/:id/export/events.csv?from&to&type`
- GET `/devices/:id/export/commands.csv?from&to`
- GET `/sessions/:sid/export.csv` (metadata sesi, percobaan, ringkasan)
Maksimum rentang 7 hari per ekspor; lebih dari itu: 400 `VALIDATION_ERROR`.

## WebSocket (Socket.IO)
Namespace `/realtime`. Autentikasi: `auth: { token: "<jwt>" }` saat handshake. Token invalid: koneksi ditolak.

Client → server:
| Event | Payload | Keterangan |
|---|---|---|
| `subscribe` | `{"deviceId":"car01"}` | Join room `device:car01` |
| `unsubscribe` | `{"deviceId":"car01"}` | Keluar room |
| `drive` | `{"deviceId":"car01","dir":"F","spd":60}` | Hanya pemegang kunci; ±5-10 Hz; maks 10/detik per user |
| `control.heartbeat` | `{"deviceId":"car01"}` | Dikirim tiap 3 detik saat memegang kunci tapi idle |

`dir`: `F | L | R | S`. `spd` 0-100. BE menambahkan `sid`, `seq`, dan `ttl_ms` (default 500) saat publish.

Server → client (hanya ke room yang di-join):
| Event | Payload |
|---|---|
| `telemetry` | `{"deviceId","ts","mode","distCm","valid","state","pwm","avoidCount","rssi"}` |
| `status` | `{"deviceId","online","lastSeen"}` |
| `event` | `{"deviceId","id","ts","mode","source","type","detail"}` |
| `command.update` | `{"deviceId","id","seq","cmd","status","reason","latencyMs"}` |
| `config.update` | `{"deviceId","ver","stopCm","resumeCm","maxPwm","manualMaxPwm"}` |
| `control.update` | `{"deviceId","controller":{"username","until"}\|null,"sid"}` |
| `rtt` | `{"deviceId","rttMs","ts"}` |
| `drive.rejected` | `{"deviceId","reason"}` dengan reason `NOT_HOLDER \| DEVICE_OFFLINE \| NOT_MANUAL \| STALE_DATA \| RTT_TOO_HIGH \| RATE_LIMITED \| INVALID` (dikirim hanya ke pengirim) |

Catatan FE:
- Jika `valid=false` tampilkan "Tidak valid", bukan angka.
- Saat socket terputus tampilkan banner "Koneksi dashboard terputus"; jangan tampilkan data lama sebagai live.
- Tampilkan umur data terakhir. Tombol gerak manual dinonaktifkan jika: bukan pemegang kunci, mode bukan MANUAL,
  device offline, data basi (> 5 detik), atau `rttMs` melebihi batas. Tombol Stop tetap aktif.
- Kirim `drive` `S` saat tombol dilepas, saat tab kehilangan fokus (`blur`/`visibilitychange`), dan saat halaman ditutup.
- Tombol START dinonaktifkan jika mode MANUAL atau device offline. Tampilkan "STOP cloud bukan penghentian darurat".