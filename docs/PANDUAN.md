# Panduan — Papan Pergerakan Staf JTMK

App sendiri yang menggantikan papan putih: siapa **ada** di pejabat, **HBH**, atau **tiada** (kursus, bengkel, cuti…).

## Seni bina

| Bahagian | Di mana | Fungsi |
|---|---|---|
| Laman (app) | **GitHub Pages** | `index.html`, `app.js`, `app.css`, `config.js`, PWA (boleh dipasang di telefon) |
| Jambatan | **Google Apps Script** (projek berasingan) | `apps-script/Code.gs`: log masuk emel + OTP, simpan rekod, tulis ke Google Sheet |
| Data staf & papan bulanan | Google Sheet **PERGERAKAN STAFF** | tab `Maklumat Staff` (senarai staf) + tab bulanan `NOV2026`, `DIS2026`… |
| Data sistem (private) | Google Sheet **PERGERAKAN STAF JTMK — DATA SISTEM** | rekod penuh, cuti umum, tetapan, sesi, log (dicipta oleh `setup()`) |

GitHub Pages hanya menghidangkan laman. Semua penyimpanan dibuat melalui jambatan Apps Script.

## Langkah 1 — Jambatan Apps Script (sekali sahaja)

1. Buka https://script.google.com.
   - Projek kosong **"Keberadaan Staf JTMK"** sudah ada. Buka projek itu dan namakan semula kepada **Pergerakan Staf JTMK**, atau cipta projek baharu.
2. Tampal seluruh kandungan `apps-script/Code.gs` ke dalam `Code.gs`, kemudian tekan **Ctrl+S**.
3. Pilih fungsi **setup** dan tekan **Run**. Benarkan akses: Sheets, hantar emel, pencetus dan sambungan luar.
   - Log akan menunjukkan: *Siap … staf dari Maklumat Staff: 56 · tab dikemas kini: NOV2026*.
4. Deploy sebagai Web app: pergi ke **Deploy → New deployment → Web app**.
   - **Execute as:** Me
   - **Who has access:** **Anyone**
   - Salin URL yang berakhir dengan `/exec`.
5. Buka `config.js` dan tampal URL itu: `window.PERGERAKAN_API = 'https://script.google.com/macros/s/…/exec';`

**Syarat:** akaun yang deploy mesti ada akses **edit** pada sheet PERGERAKAN STAFF.

**Jika pilihan "Anyone" tiada** (disekat oleh pentadbir MyGovUC), deploy dari akaun Gmail peribadi. Kongsi sheet PERGERAKAN STAFF (akses edit) dengan akaun itu terlebih dahulu.

**Mengemas kini kod kemudian:** pergi ke **Deploy → Manage deployments**, tekan ✏️, pilih **New version**. URL `/exec` kekal sama.

## Langkah 2 — GitHub Pages

1. Cipta repo **awam** baharu di GitHub, cth. `pergerakan-staf`.
2. Muat naik semua fail dalam folder ini: **Add file → Upload files**, seret semua fail dan folder, kemudian tekan Commit.
   - Fail `apps-script/dev/.dev-*.json` jangan dimuat naik. Fail ini sudah tersenarai dalam `.gitignore`.
3. Pergi ke **Settings → Pages → Branch: main / (root) → Save**.
   - Selepas 1–2 minit, app tersedia di `https://<nama-akaun>.github.io/pergerakan-staf/`.
4. Dalam eBOARD (`eboard-jtmk/index.html`), isi `const PERGERAKAN_URL = 'https://<nama-akaun>.github.io/pergerakan-staf/';`.
   - Bina semula dengan `node docs/bina-satu-fail.js` dan tampal ke projek Apps Script eBOARD.

**Kemas kini app kemudian:** ubah fail, naikkan `VERSI` dalam `sw.js`, dan muat naik semula. Pengguna akan nampak mesej "Versi baharu tersedia — Muat semula".

## Pasang di telefon

- **Android (Chrome):** buka URL app, tekan **Pasang App**, kemudian **Pasang**.
- **iPhone (Safari):** tekan **Kongsi**, kemudian **Tambah ke Skrin Utama**.

## Peraturan sistem

- **Log masuk:** emel sahaja, kemudian kod 6 digit dihantar ke emel.
  - Kod sah selama 10 minit; paling banyak 5 cubaan dan 3 permintaan kod dalam 15 minit.
  - Sesi diingati selama 30 hari.
  - Hanya emel dalam tab **Maklumat Staff** boleh masuk.
- **Lajur Maklumat Staff** dikenal pasti mengikut tajuk:
  - **NAMA** dan **EMEL** wajib.
  - **GRED**, **JAWATAN** dan **TREK** pilihan.
  - Susunan lajur boleh berubah tanpa menjejaskan sistem.
- **Corak lalai:** Isnin, Rabu dan Jumaat **Di Pejabat**; Selasa dan Khamis **HBH**.
  - Hari cuti umum ditandakan **Cuti Umum**.
  - Keutamaan: rekod individu, kemudian cuti umum, kemudian corak minggu.
- **Tab bulanan:**
  - Setiap simpan atau batal menulis status ke tab bulan berkenaan.
  - Tab bulan baharu (cth. DIS2026) dicipta automatik.
  - Pencetus harian 6 pagi mengemas kini tab bulan semasa, dan mencipta tab bulan depan mulai 25 hb.
  - Jenis cuti ditulis sebagai **CUTI** sahaja, kerana sheet ini boleh dilihat orang lain.
- **Admin** (`farizahhazain@pbu.edu.my`): boleh mengemas kini semua staf, membuat rekod pukal, mengurus cuti umum, corak minggu, nama paparan dan jenis status, melihat log, membuat eksport CSV, dan menekan butang **Kemas kini Sheet sekarang**.
- **Staf:** hanya boleh mengemas kini status sendiri, untuk hari ini dan tarikh akan datang.

## Ujian tempatan

```
node apps-script/dev/test.js      # 22 ujian jambatan
node apps-script/dev/server.js    # API ujian di http://localhost:8787/exec
```

Selepas pelayan ujian berjalan, buka http://localhost/pergerakan-staf/ dan log masuk dengan `ujian.admin@eboard.test`. Kod dipaparkan terus pada skrin.

Pelayan ujian **tidak** mengubah sheet sebenar; tab bulanan ditiru dalam memori.

Padam fail `apps-script/dev/.dev-*.json` selepas selesai menguji.
