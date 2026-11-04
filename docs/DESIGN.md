# DESIGN.md: Panduan Tampilan Dashboard

Acuan visual: desain referensi "Weekly Reports" (bersih, terang, dominan biru, kartu KPI, sidebar).
Dokumen ini menggantikan penilaian selera. Jika ragu, ikuti referensi dan aturan di sini, jangan menambah hiasan.

## 1. Prinsip
1. Fungsi lebih penting dari hiasan. Setiap elemen harus menampilkan data atau menjalankan aksi.
2. Datar dan bersih: kartu putih, border tipis, ruang kosong yang lega, tanpa efek.
3. Biru adalah warna merek dan data. Hijau/kuning/merah HANYA untuk status (bagian 3).
4. Status tidak boleh bergantung pada warna saja: selalu sertakan teks atau ikon.
5. Keselamatan terlihat: tombol STOP selalu ada, jelas, dan tidak pernah ikut nonaktif.
6. Teks UI berbahasa Indonesia, lugas, faktual.

## 2. Larangan (anti "AI slop")
- DILARANG emoji di mana pun: UI, label, toast, placeholder, komentar kode, dokumen. Ikon hanya dari `lucide-react`.
- DILARANG gradient: background, tombol, kartu, teks, isi chart (area chart pakai warna datar atau tanpa isi).
- DILARANG glassmorphism/blur, glow, neon, bayangan tebal, border berwarna di satu sisi kartu, ilustrasi dekoratif,
  pola/background gambar, animasi masuk yang mencolok.
- DILARANG warna ungu/pink/oranye dekoratif. Palet hanya token di bagian 3.
- DILARANG ikon di dalam lingkaran berwarna sebagai hiasan di setiap kartu.
- DILARANG teks pemasaran, sapaan, atau seruan ("Hebat!", "Selamat datang kembali!"), tanda seru, data contoh palsu di produksi.
- DILARANG karakter simbol sebagai ikon (panah teks, centang teks). Pakai komponen ikon.
- DILARANG menyalin elemen referensi yang tidak relevan: badge Pro, tombol Upgrade, Leaderboard, Recommended Courses,
  AI Assistant, notifikasi lonceng, kotak pencarian, bingkai luar membulat dengan bayangan (itu hanya tampilan mockup).
- DILARANG hex/warna ad-hoc di komponen. Semua warna lewat token.

## 3. Token
Definisikan sekali di `frontend/src/index.css` dan petakan ke token shadcn (`--primary`, `--destructive`, dst).

```css
:root {
  /* Permukaan */
  --background: #F3F6FB;        /* latar halaman */
  --surface: #FFFFFF;           /* kartu, sidebar, header */
  --surface-muted: #F7F8FA;     /* footer kartu, wadah seksi, sel kosong */
  --border: #E5E8EE;

  /* Teks */
  --foreground: #0F172A;
  --muted-foreground: #64748B;

  /* Biru (merek dan data) */
  --primary: #2563EB;
  --primary-hover: #1D4ED8;
  --primary-strong: #1E40AF;    /* seri data tergelap */
  --primary-soft: #7FA3F0;      /* seri data sedang */
  --primary-subtle: #E3EBFB;    /* seri data terlemah, sel heatmap tidak aktif */
  --primary-foreground: #FFFFFF;

  /* Status (hanya untuk status) */
  --success: #16A34A;  --success-subtle: #E7F6EE;  --success-text: #15803D;
  --warning: #D97706;  --warning-subtle: #FEF3C7;  --warning-text: #92400E;
  --danger:  #DC2626;  --danger-subtle:  #FDECEC;  --danger-text:  #B91C1C;
  --danger-hover: #B91C1C;
  --neutral-subtle: #F1F3F6;    /* chip netral, item nav aktif */

  --ring: #2563EB;

  /* Bentuk */
  --radius-card: 12px;
  --radius-control: 8px;
  --radius-chip: 6px;
  --shadow-popover: 0 4px 16px rgba(15, 23, 42, 0.08); /* hanya tooltip, dropdown, dialog */
}
```

Urutan warna seri chart: `primary` → `primary-soft` → `primary-strong` → `primary-subtle`.
Garis bantu dan sumbu: `border` dan `muted-foreground`.

## 4. Tipografi
- Font: Inter (fallback: system-ui, sans-serif). Bobot hanya 400, 500, 600.
- Skala: judul halaman 18/24 semibold; judul seksi 15/20 semibold; judul kartu 13/18 medium;
  isi 14/20; keterangan dan label 12/16 `muted-foreground`; angka KPI 36/40 semibold.
- Semua angka yang berubah realtime memakai `font-variant-numeric: tabular-nums`.
- Format angka lokal Indonesia: `38,5 cm`, `1.042`. Satuan selalu ditulis (`cm`, `ms`, `dBm`, `PWM`).
- Waktu ditampilkan 24 jam, zona WIB (UTC+7). Data tersimpan UTC.

## 5. Bentuk, jarak, ikon
- Kelipatan 4 px. Padding halaman 24 px (16 px di mobile). Jarak antarkartu 16 px. Jarak antarseksi 24 px.
- Kartu: latar `surface`, border 1 px `border`, radius 12 px, tanpa bayangan.
- Tombol dan input: radius 8 px, tinggi 36 px (44 px untuk kontrol manual). Chip: radius 6 px.
- Ikon: `lucide-react`, outline, 16 px (tombol) atau 18 px (navigasi), `strokeWidth={1.75}`.
- Fokus keyboard: ring 2 px `ring`. Semua kontrol dapat dijangkau keyboard.
- Gerak: transisi 150 ms hanya untuk warna/opasitas. Satu-satunya animasi berulang: titik "live" berdenyut
  (opasitas), dimatikan oleh `prefers-reduced-motion`.

## 6. Kerangka aplikasi
```
+-----------+--------------------------------------------------------------+
| Sidebar   | Header: [judul halaman]      [chip koneksi] [Ekspor] [STOP]  |
| 256 px    +--------------------------------------------------------------+
|           | Konten (latar --background, padding 24 px)                   |
|           |                                                              |
+-----------+--------------------------------------------------------------+
```
- Tanpa bingkai luar membulat. Sidebar putih dengan border kanan 1 px. Header putih dengan border bawah 1 px, tinggi 56 px.
- Header: tombol kembali (ikon panah) hanya di halaman detail; judul; kanan: chip koneksi, tombol aksi halaman (outline, mis. Ekspor),
  dan **tombol STOP global** (merah solid, selalu terlihat dan aktif di semua halaman).
- Sidebar (atas ke bawah):
  1. Profil: avatar inisial (lingkaran `primary`), username, peran "Admin", menu titik tiga berisi "Keluar".
  2. Navigasi: Dashboard, Kendali, Riwayat, Sesi Uji, Analisis, Konfigurasi. Item aktif: latar `neutral-subtle`, teks dan ikon `primary`.
  3. Seksi "Perangkat" dengan badge jumlah: daftar device (nama + titik status).
  4. Seksi "Sesi Terbaru": maksimal 4 sesi uji, ikon garis netral dalam kotak `primary-subtle` (satu warna untuk semua).
  5. Bawah: kotak catatan keselamatan (latar `surface-muted`, border, tanpa tombol):
     "STOP dari dashboard bukan penghentian darurat. Siapkan switch fisik."
- Responsif:
  - ≥1280 px: sidebar penuh, grid KPI 4 kolom.
  - 768 sampai 1279 px: sidebar menjadi rel ikon 72 px, grid KPI 2 kolom.
  - <768 px: sidebar menjadi drawer (tombol menu di header), grid 1 kolom, tombol STOP tetap di header.

## 7. Pola komponen

### Judul seksi
Teks 15 semibold di kiri. Kanan: kontrol filter (tombol outline dengan ikon filter, dropdown rentang waktu).

### Kartu KPI
- Judul kartu (13 medium) di kiri atas. Angka besar di bawahnya. Baris kecil "dibanding periode lalu" + chip delta.
- Visual mini di kanan (sparkline garis 1,5 px `primary`, tanpa isi; atau bar mini; atau donut kecil).
- Footer: strip tinggi 40 px, latar `surface-muted`, teks tengah "Lihat detail" + ikon panah, menuju halaman detail.
- Data tidak valid: angka diganti teks "Tidak valid" (warna `warning-text`), sparkline berhenti, bukan angka palsu.

### Chip delta (hanya pada metrik dengan arah jelas)
| Metrik | Naik berarti | Warna naik | Warna turun |
|---|---|---|---|
| Tingkat keberhasilan, uptime | baik | success | danger |
| Persentase data invalid, latensi ack, jumlah putus | buruk | danger | success |
| Jumlah penghindaran, jumlah sampel, durasi per state | netral | neutral (abu, tanpa warna status) | neutral |

Chip: latar `*-subtle`, teks `*-text`, ikon panah kecil, radius 6 px.

### Panel dan wadah seksi
Panel grafik: kartu putih dengan judul, menu titik tiga/filter di kanan, isi, dan footer opsional.
Wadah seksi (untuk mengelompokkan beberapa panel di halaman Analisis): latar `surface-muted`, padding 8 px,
radius 12 px, berisi kartu putih.

### Chip status dan badge
Bentuk sama (radius 6 px, teks 12 medium, ikon kecil di kiri). Pemetaan:
| Makna | Teks | Warna |
|---|---|---|
| Perangkat online | Online | success |
| Perangkat offline | Offline | danger |
| Data basi (>5 detik) atau socket putus | Data tidak mutakhir | warning |
| Pembacaan tidak valid | Tidak valid | warning |
| Mode AUTO | AUTO | netral (outline) |
| Mode MANUAL | MANUAL | warning (perlu perhatian operator) |
| State MAJU / BELOK / PINDAI | teks state | biru (`primary`, `primary-strong`, `primary-soft`) |
| State STOP | STOP | netral gelap (`foreground` pada `neutral-subtle`) |
| Perintah pending | Menunggu | netral |
| Perintah acked | Diterima | success |
| Perintah rejected | Ditolak | danger |
| Perintah expired | Kedaluwarsa | warning |
| Sesi running / ended | Berjalan / Selesai | primary / netral |
Pemetaan ada di satu berkas (`src/lib/status-style.ts`). Komponen tidak boleh memilih warna status sendiri.

### Tombol
| Varian | Pakai untuk | Gaya |
|---|---|---|
| Primary | aksi utama (START, Simpan, Sesi Baru) | latar `primary`, teks putih, hover `primary-hover` |
| Outline | aksi sekunder (Ekspor, Filter, Akhiri Sesi) | latar putih, border `border`, teks `foreground` |
| Destructive | STOP | latar `danger`, teks putih, hover `danger-hover` |
| Ghost | aksi tersier, ikon | tanpa latar, hover `neutral-subtle` |
Tombol nonaktif: opasitas 50%, dan alasan nonaktif WAJIB terlihat (teks bantu atau tooltip), kecuali STOP yang tidak pernah nonaktif.

### Tooltip chart
Kartu putih, radius 8 px, `shadow-popover`, judul tebal (mis. rentang waktu), baris "label di kiri, nilai di kanan" dengan penanda warna seri.

### Chart (Recharts, semua datar)
- Garis/sparkline: 1,5 px, tanpa isi area. Bar: radius ujung atas 4 px, warna datar. Donut: celah antarsegmen 2 px.
- Gauge keberhasilan: setengah lingkaran; bagian tercapai `primary`, sisa `primary-soft`; angka persen 36 semibold di tengah;
  keterangan kecil "dari N percobaan"; penanda tipis untuk "target awal". Tanpa data: kondisi kosong, bukan 0%.
- Heatmap (opsional, tahap akhir): grid kotak radius 8 px; aktif `primary`, tidak aktif `primary-subtle`; dibuat dengan div grid.
- Legenda: kotak 8 px berwarna + label 12 px, di atas kanan panel.
- Sumbu: label 12 px `muted-foreground`, garis bantu horizontal `border`.

### Tabel
Header lengket, latar `surface-muted`, teks 12 medium `muted-foreground`; baris tinggi 44 px, pemisah `border`; angka rata kanan, tabular.
Paginasi memakai kursor (sesuai API).

### Banner dan pemberitahuan
- Banner halaman (komponen Alert, datar, border + latar `*-subtle`, ikon + teks): "Koneksi dashboard terputus",
  "Perangkat offline", "Data tidak mutakhir (12 dtk)".
- Toast hanya untuk hasil aksi singkat ("Konfigurasi disimpan, versi 4"). Teks pendek, tanpa seruan.

### Kondisi kosong, memuat, galat
- Memuat: skeleton dengan bentuk komponen (bukan spinner penuh halaman).
- Kosong: satu kalimat penjelas + (jika ada) satu tombol aksi. Contoh: "Belum ada percobaan. Mulai sesi uji untuk melihat hasil."
- Galat: pesan dari `error.message` API + tombol "Coba lagi". Tidak menampilkan stack trace.

## 8. Halaman

### 8.1 Dashboard
1. Banner status (jika offline/basi/socket putus).
2. Seksi "Ringkasan Langsung": 4 kartu KPI.
   - Jarak Depan: `38,5 cm`, sparkline 60 detik terakhir, chip "Valid"/"Tidak valid". Footer: Lihat riwayat.
   - Mode dan State: state sebagai angka besar (teks), badge mode di sampingnya. Footer: Buka kendali.
   - Penghindaran: jumlah sejak boot, bar mini per 5 menit. Footer: Lihat analisis.
   - Konektivitas: Online/Offline dengan titik live, baris kecil RSSI (dBm), RTT (ms), umur data (dtk). Footer: Detail koneksi.
3. Seksi "Grafik Langsung": panel lebar (2/3) grafik jarak dan PWM terhadap waktu, dropdown rentang (5 menit, 15 menit, 1 jam);
   panel kanan (1/3) "Perintah Cepat": mode saat ini, START, STOP, tautan ke halaman Kendali.
4. Seksi "Event Terbaru": tabel 10 baris (waktu, tipe, mode, detail ringkas).

### 8.2 Kendali
1. Panel "Mode": kontrol segmen AUTO | MANUAL. Nonaktif jika state bukan STOP (teks bantu: "Berhenti dulu untuk mengganti mode").
2. Panel "Perintah": START (primary) dan STOP (merah, lebih besar). START nonaktif jika offline atau mode MANUAL, dengan alasan terlihat.
3. Panel "Kendali Manual" (aktif hanya saat mode MANUAL; selain itu tampil redup dengan penjelasan):
   ```
            [  Maju  ]
   [ Kiri ] [  Stop  ] [ Kanan ]
   ```
   - Tombol minimal 64 x 64 px, TIDAK ada tombol mundur. Penggeser kecepatan 0-100 dengan keterangan batas `manual_max_pwm`.
   - Perilaku: tahan untuk bergerak. Kirim `S` saat tombol dilepas, pointer keluar/dibatalkan, tab kehilangan fokus, atau halaman ditutup.
   - Keyboard: panah atas/kiri/kanan selagi ditahan, Spasi = STOP (tidak aktif saat fokus di input).
   - Info: pemegang kunci kendali, RTT (ms), umur data. Tombol gerak nonaktif (dengan alasan) jika bukan pemegang kunci,
     mode bukan MANUAL, offline, data basi >5 detik, atau RTT melebihi batas. Tombol Stop tetap aktif.
   - Mobile: bilah STOP lengket di bawah layar, lebar penuh.
4. Panel "Riwayat Perintah": tabel waktu, perintah, status (chip), alasan, latensi (ms).
5. Catatan keselamatan (Alert netral): "STOP dari dashboard bukan penghentian darurat. Siapkan switch fisik."

### 8.3 Riwayat
Tab: Telemetri, Event, Perintah. Baris filter (rentang waktu, mode, tipe). Tabel + grafik ringkas di tab Telemetri. Tombol Ekspor CSV di header.

### 8.4 Sesi Uji
- Daftar: tabel (nama, jenis, mode, status, mulai, jumlah percobaan, hasil singkat) + tombol primary "Sesi Baru".
- Detail (ada tombol kembali): kartu metadata dan snapshot konfigurasi; panel input percobaan sesuai jenis
  (PENGHINDARAN: dua tombol "Berhasil" / "Tabrakan"; SENSOR: input jarak referensi + "Ambil pembacaan"; JARAK_BERHENTI: PWM dan jarak berhenti;
  STOP: latensi ms); tabel percobaan; kartu ringkasan; tombol outline "Akhiri Sesi" (dengan dialog konfirmasi) dan "Ekspor CSV".
- Target (mis. 18/20) selalu berlabel "target awal".

### 8.5 Analisis
1. Baris filter: rentang waktu, sesi uji, mode.
2. Seksi "Ringkasan": 4 kartu KPI (Data invalid, Keberhasilan penghindaran, Latensi ack rata-rata, Uptime) dengan chip delta sesuai tabel arah.
3. Wadah "Penghindaran": gauge keberhasilan (hanya mode AUTO) + bar durasi siklus.
4. Wadah "Sensor": bar galat per titik jarak + tabel (n, valid, invalid, galat rata-rata, maksimum).
5. Wadah "Perintah dan Konektivitas": donut status perintah, tabel outage; heatmap per jam bila waktu cukup.
6. Wadah "Jarak Berhenti": grafik jarak berhenti per PWM + kartu saran ambang
   ("Saran dari data uji, tidak diterapkan otomatis").
7. Tabel "Perbandingan Konfigurasi".
8. Kartu "Keterbatasan Data" SELALU tampil: tabrakan tidak terdeteksi otomatis; kecepatan tidak terukur; telemetri disampling sekitar 2 detik.

### 8.6 Konfigurasi
Satu kartu formulir: `stop_cm`, `resume_cm`, `max_pwm`, `manual_max_pwm`. Tiap input menampilkan rentang valid di bawahnya dan galat validasi inline.
Tampilkan versi saat ini dan waktu pembaruan. Tombol primary "Simpan". Saran ambang dari analisis hanya ditampilkan sebagai teks, tidak mengisi otomatis.

## 9. Teks UI (contoh)
Boleh: "Jarak depan", "Tidak valid", "Data tidak mutakhir (12 dtk)", "Perangkat offline", "Menunggu konfirmasi perangkat",
"Perintah ditolak: mode bukan AUTO", "Konfigurasi disimpan, versi 4", "Belum ada data uji".
Tidak boleh: seruan, sapaan, pujian, bahasa pemasaran, emoji, istilah "kecepatan" untuk PWM (pakai "perintah PWM").

## 10. Aksesibilitas
- Kontras teks minimal 4,5:1. Gunakan varian `*-text` pada latar `*-subtle`.
- Perubahan status penting memakai `aria-live="polite"`. Banner galat memakai `role="alert"`.
- Target sentuh minimal 44 px untuk kontrol manual. Semua tombol ikon punya `aria-label`.
- Status tidak bergantung warna saja (ikon + teks).

## 11. Implementasi
- Tailwind + shadcn/ui: Card, Button, Badge, Tabs, Select, Input, Table, Tooltip, Sheet (drawer mobile), Dialog, Skeleton, Alert, Sonner, ToggleGroup (segmen mode).
- Grafik di `src/components/charts/` (Recharts), konfigurasi warna dari token, bukan literal.
- Status di `src/lib/status-style.ts`. Format angka/waktu di `src/lib/format.ts` (id-ID, WIB).
- Urutan kerja: kerangka aplikasi + token + kartu KPI (Tahap 6), panel kendali (Tahap 7 dan 10), halaman sesi (Tahap 8), chart analisis (Tahap 11).

## 12. Daftar periksa tinjauan (jalankan sebelum merge UI)
- [ ] Tidak ada gradient: `grep -rniE "gradient|\bfrom-|\bvia-|\bto-[a-z]+-[0-9]" frontend/src` kosong (perhatikan hasil palsu pada kata lain).
- [ ] Tidak ada emoji: `grep -rP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" frontend/src` kosong.
- [ ] Tidak ada hex/warna literal di komponen (hanya di `index.css`).
- [ ] STOP terlihat dan aktif di semua halaman, termasuk mobile.
- [ ] Tidak ada kontrol mundur.
- [ ] `valid=false` tampil "Tidak valid", bukan angka.
- [ ] Data basi/socket putus ditandai, tidak tampil sebagai live.
- [ ] Setiap tombol nonaktif menampilkan alasan.
- [ ] Target uji berlabel "target awal"; gauge keberhasilan hanya dari mode AUTO; kondisi kosong ditangani.
- [ ] Halaman Analisis menampilkan kartu keterbatasan data.
- [ ] Tampilan diuji di lebar 375, 768, 1280 px.