# Smart Obstacle-Avoidance Car: Dashboard IoT

Proyek akhir IoT. Mobil ESP32 menghindari rintangan secara **otonom di kendaraan**.
Dashboard ini untuk telemetri, riwayat, perintah (START/STOP/ganti mode), mode manual terbatas,
konfigurasi, sesi uji, analisis, dan ekspor data. Blynk tidak dipakai.
Dashboard TIDAK PERNAH menjadi syarat agar mobil aman: keselamatan ditentukan firmware lokal.

## Stack (gunakan ini, jangan ganti library tanpa konfirmasi)

### Backend (`backend`)
- Node.js LTS, TypeScript (strict), NestJS
- MQTT: `mqtt` (mqtt.js), dibungkus provider sendiri (BUKAN `@nestjs/microservices`)
- Realtime: `@nestjs/websockets` + `@nestjs/platform-socket.io` (Socket.IO)
- Event internal: `@nestjs/event-emitter`
- Job terjadwal: `@nestjs/schedule` (offline detection, retention, kunci kendali kedaluwarsa)
- Config: `@nestjs/config` + validasi env saat start
- Validasi: `zod` untuk payload MQTT, `class-validator`/`class-transformer` untuk DTO REST
- Auth: `@nestjs/jwt`, `@nestjs/passport` + `passport-jwt`, hashing `argon2` (atau `bcrypt`)
- ORM/DB: Prisma + PostgreSQL
- Testing: Jest (unit), Supertest (e2e). Lint/format: ESLint + Prettier

### Frontend (`frontend`)
- React + Vite + TypeScript (strict)
- Tailwind CSS + shadcn/ui, ikon `lucide-react`
- TanStack Query, `socket.io-client`, Recharts, React Router
- React Hook Form + zod, `date-fns`
- Testing: Vitest + Testing Library

### Infrastruktur
- Broker: MQTT cloud (HiveMQ Cloud / EMQX Cloud), TLS port 8883
- Database: PostgreSQL (lokal via Docker, produksi di Neon/Supabase)
- Deploy: BE di layanan yang menjalankan proses terus-menerus (Railway/Render/VPS, bukan serverless), FE di Vercel/Netlify
- Tes broker: MQTTX

### Firmware (`firmware`)
- ESP32 klasik/WROOM, PlatformIO atau Arduino IDE
- `PubSubClient`, `ArduinoJson`, `WiFiClientSecure` (CA cert broker), NTP via `configTime`

## Dokumen wajib dibaca (jangan duplikasi isinya di sini)
- Soal MQTT atau firmware: `docs/MQTT_SPEC.md`
- Soal endpoint REST/WebSocket: `docs/API_CONTRACT.md`
- Soal DB/migrasi: `docs/DB_SCHEMA.md`
- Soal perintah, mode manual, STOP, reconnect: `docs/SAFETY_RULES.md`
- Struktur dan keputusan teknis: `docs/ARCHITECTURE.md`
- Fitur dan kriteria penerimaan: `docs/PRD.md`
- Skenario uji: `docs/TESTING.md`
- Urutan kerja: `docs/TASK.md` (kerjakan satu tahap per sesi)
- Soal tampilan/UI: `docs/DESIGN.md` (ikuti token dan larangan di sana, termasuk tanpa emoji dan gradient)

## Perintah
- Package manager: `pnpm` (jangan pakai npm/yarn)
- Backend dev: `cd backend && pnpm run start:dev`
- Backend test: `cd backend && pnpm run test`
- Migrasi: `cd backend && pnpm exec prisma migrate dev`
- Frontend dev: `cd frontend && pnpm run dev`
- Lint/format: `pnpm run lint` di tiap app

## Aturan koding
- TypeScript strict. Dilarang `any` kecuali ada komentar alasan.
- Semua payload dari MQTT dan semua body request divalidasi. Payload MQTT dianggap TIDAK TERPERCAYA.
- Handler pesan MQTT harus ringan dan tidak memblokir event loop. Tidak ada query berat di dalamnya.
- Satu modul NestJS = satu tanggung jawab. Jangan akses repository modul lain langsung, lewat service.
- Analisis dihitung dengan query agregasi SQL di modul `analytics`, bukan dengan memuat ribuan baris ke memori.
- Secret hanya dari environment variable. Jangan hardcode, jangan log, jangan taruh di `.md`.
- Env var backend didefinisikan di `backend/.env.example`, frontend di `frontend/.env.example`.
  Setiap env var baru wajib ditambahkan ke file example yang sesuai, dan backend wajib memvalidasinya saat start.
- Frontend: variabel `VITE_*` terekspos ke browser, jadi tidak boleh berisi secret.
- Skema DB yang berlaku adalah migrasi Prisma. Setiap migrasi baru wajib update `docs/DB_SCHEMA.md` (termasuk ERD).
- Setiap perubahan topic/payload wajib update `docs/MQTT_SPEC.md` DULU, baru kode.
- Setiap perubahan endpoint/event WebSocket wajib update `docs/API_CONTRACT.md` DULU, baru kode.
- Commit kecil, satu perubahan logis per commit.

## Larangan
- Jangan mengubah atau melemahkan aturan di `docs/SAFETY_RULES.md` demi "menyederhanakan".
- Jangan set `retain: true` pada topic `cmd`, `drive`, dan `ping`.
- Jangan menambah perintah mundur di mode manual atau otomatis.
- Jangan menampilkan jarak jika `valid=false`.
- Jangan menyebut PWM sebagai "kecepatan" (tidak ada encoder). Pakai "perintah PWM".
- Jangan menyajikan target (mis. 18/20) sebagai hasil. Hasil hanya dari data tercatat; target diberi label "target awal".
- Jangan menghitung keberhasilan penghindaran dari data mode MANUAL.
- Jangan menambah fitur di luar `docs/PRD.md` tanpa konfirmasi.
- Jangan menyimpan setiap pesan telemetri ke DB (ikuti sampling di `docs/DB_SCHEMA.md`).
- Jangan menghapus (retention) data yang berada di rentang waktu sesi uji.
- Jangan menambah model prediksi/ML. Analisis = statistik deskriptif.
- Jangan menambah emoji, gradient, efek dekoratif, atau warna di luar token di `docs/DESIGN.md`.

## Konvensi
- deviceId default: `car01`
- Waktu: epoch detik UTC di payload MQTT, ISO 8601 UTC di REST/WebSocket
- Bahasa UI: Indonesia. Bahasa kode, nama variabel, dan commit: Inggris.
- Bahasa pesan response API: Inggris. Prefix REST: `/api` (tanpa versi).
- `.gitignore` wajib berisi: `.env`, `.env.local`, `firmware/secrets.h`