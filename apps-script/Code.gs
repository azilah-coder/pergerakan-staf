/* ==========================================================================
   PAPAN PERGERAKAN STAF JTMK - jambatan Google Apps Script
   App (laman) dihoskan di GitHub Pages; skrip ini hanya API + penyimpanan:
   - log masuk emel + kod OTP (tiada kata laluan, tak perlu akaun Google PBU)
   - senarai staf dibaca dari Google Sheet "PERGERAKAN STAFF", tab "Maklumat Staff"
   - status ditulis ke tab bulanan sheet yang sama (cth. NOV2026, DIS2026);
     tab bulan baharu dicipta automatik
   - rekod penuh, sesi & log disimpan dalam sheet private "PERGERAKAN STAF JTMK - DATA SISTEM"
   --------------------------------------------------------------------------
   PASANG (sekali sahaja)
   1. script.google.com > Projek baharu "Pergerakan Staf JTMK" > tampal fail ini sebagai Code.gs.
   2. Pilih fungsi setup > Run > benarkan akses (Sheets, hantar emel, pencetus, sambungan luar).
   3. Deploy > New deployment > Web app:  Execute as = Me,  Who has access = Anyone.
      Salin URL /exec dan tampal ke API_URL dalam app.js (repo GitHub).
   Kemas kini kod: Deploy > Manage deployments > Edit > Version: New version (URL kekal).
   Akaun pemilik skrip perlu akses EDIT pada sheet "PERGERAKAN STAFF".
   ========================================================================== */

var VERSI = '3.0.0';

var CFG = {
  STAF_SHEET_ID: '1BPcd62GABr84udcCxBSIY4vZegWtZYeBOj7BXYcu9bU',   // Google Sheet "PERGERAKAN STAFF"
  STAF_TAB: 'Maklumat Staff',
  DB_NAMA: 'PERGERAKAN STAF JTMK \u2014 DATA SISTEM',
  TZ: 'Asia/Kuala_Lumpur',
  ADMIN_AWAL: 'farizahhazain@pbu.edu.my',
  CORAK_AWAL: 'PEJABAT,HBH,PEJABAT,HBH,PEJABAT',   // Isnin, Selasa, Rabu, Khamis, Jumaat
  OTP_MINIT: 10, OTP_MAKS_CUBA: 5, OTP_MAKS_MINTA: 3, OTP_TETINGKAP_MINIT: 15,
  SESI_HARI: 30,
  JULAT_MAKS_HARI: 120,
  PAPAN_MAKS_HARI: 42,
  CACHE_STAF_SAAT: 600,
  BULAN_KE_DEPAN: 12          // tab bulanan dicipta paling jauh 12 bulan ke depan
};

/* Akaun ujian - hanya wujud bila Script Property TEST_MODE = 1 (modUjianHidup). Kod OTP dipaparkan terus. */
var AKAUN_UJIAN = [
  {emel: 'ujian.admin@eboard.test', nama: 'ADMIN UJIAN', jawatan: 'PEMBANTU OPERASI', gred: 'H1', trek: '', admin: true},
  {emel: 'ujian.staf@eboard.test', nama: 'STAF UJIAN SATU', jawatan: 'PENSYARAH', gred: 'DH9', trek: ''},
  {emel: 'ujian.staf2@eboard.test', nama: 'STAF UJIAN DUA', jawatan: 'PENSYARAH', gred: 'DH10', trek: ''}
];

var SKEMA = {
  REKOD: ['id', 'emel', 'mula', 'tamat', 'kod', 'sesi', 'masa_dari', 'masa_hingga', 'lokasi', 'catatan',
          'dibuat_oleh', 'dibuat_pada', 'dikemaskini_oleh', 'dikemaskini_pada', 'status'],
  CUTI_UMUM: ['tarikh', 'nama', 'skop', 'disahkan'],
  TETAPAN: ['kunci', 'nilai', 'keterangan'],
  JENIS_STATUS: ['kod', 'label', 'kumpulan', 'subkumpulan', 'warna', 'ikon', 'peribadi', 'aktif', 'susunan'],
  NAMA_PAPARAN: ['emel', 'nama_paparan'],
  SESI: ['token_hash', 'emel', 'dibuat', 'tamat', 'peranti'],
  OTP: ['emel', 'kod_hash', 'dibuat', 'tamat', 'cubaan'],
  LOG: ['masa', 'oleh', 'tindakan', 'sasaran', 'butiran']
};

/* kod, label, kumpulan (ADA/HBH/TIADA), subkumpulan, warna, ikon, peribadi (YA = orang lain nampak "Cuti" sahaja) */
var JENIS_AWAL = [
  ['PEJABAT', 'Di Pejabat', 'ADA', '', '#16a34a', 'building', 'TIDAK'],
  ['HADIR_HBH', 'Hadir ke Pejabat', 'ADA', '', '#16a34a', 'building', 'TIDAK'],
  ['KAMPUS', 'Dalam Kampus \u2013 Mesyuarat / Program / Kelas', 'ADA', '', '#0d9488', 'map', 'TIDAK'],
  ['HBH', 'HBH', 'HBH', '', '#2563eb', 'home', 'TIDAK'],
  ['KURSUS', 'Kursus / Latihan', 'TIADA', 'Tugas Rasmi Luar', '#ea580c', 'cap', 'TIDAK'],
  ['BENGKEL', 'Bengkel', 'TIADA', 'Tugas Rasmi Luar', '#ea580c', 'tool', 'TIDAK'],
  ['SEMINAR', 'Seminar / Persidangan / Konvensyen', 'TIADA', 'Tugas Rasmi Luar', '#ea580c', 'mic', 'TIDAK'],
  ['MESYUARAT_LUAR', 'Mesyuarat Luar', 'TIADA', 'Tugas Rasmi Luar', '#ea580c', 'users', 'TIDAK'],
  ['PENYELIAAN_LI', 'Lawatan Penyeliaan Latihan Industri (LI)', 'TIADA', 'Tugas Rasmi Luar', '#ea580c', 'brief', 'TIDAK'],
  ['LAWATAN', 'Lawatan Industri / Program Luar bersama Pelajar', 'TIADA', 'Tugas Rasmi Luar', '#ea580c', 'bus', 'TIDAK'],
  ['PERTANDINGAN', 'Pertandingan / Pameran', 'TIADA', 'Tugas Rasmi Luar', '#ea580c', 'award', 'TIDAK'],
  ['URUSAN_RASMI', 'Urusan Rasmi Luar (lain-lain)', 'TIADA', 'Tugas Rasmi Luar', '#ea580c', 'plane', 'TIDAK'],
  ['CR', 'Cuti Rehat (CR)', 'TIADA', 'Cuti', '#dc2626', 'sun', 'YA'],
  ['CUTI_KECEMASAN', 'Cuti Kecemasan', 'TIADA', 'Cuti', '#dc2626', 'alert', 'YA'],
  ['CS', 'Cuti Sakit (CS/MC)', 'TIADA', 'Cuti', '#dc2626', 'thermo', 'YA'],
  ['CUTI_BERSALIN', 'Cuti Bersalin', 'TIADA', 'Cuti', '#dc2626', 'baby', 'YA'],
  ['CUTI_ISTERI_BERSALIN', 'Cuti Isteri Bersalin', 'TIADA', 'Cuti', '#dc2626', 'baby', 'YA'],
  ['CUTI_HAJI', 'Cuti Haji', 'TIADA', 'Cuti', '#dc2626', 'moon', 'YA'],
  ['CUTI_TANPA_REKOD', 'Cuti Tanpa Rekod', 'TIADA', 'Cuti', '#dc2626', 'cal', 'YA'],
  ['CUTI_BELAJAR', 'Cuti Belajar / Tanpa Gaji', 'TIADA', 'Cuti', '#dc2626', 'book', 'YA'],
  ['CUTI_LAIN', 'Cuti Lain-lain', 'TIADA', 'Cuti', '#dc2626', 'cal', 'YA'],
  ['KELUAR', 'Keluar Sekejap', 'TIADA', 'Keluar Sementara', '#d97706', 'clock', 'TIDAK']
];

var KOD_SISTEM = {
  CUTI_UMUM: {kod: 'CUTI_UMUM', label: 'Cuti Umum', kumpulan: 'CUTI_UMUM', subkumpulan: '', warna: '#7c3aed', ikon: 'flag'},
  HUJUNG: {kod: 'HUJUNG', label: 'Hujung Minggu', kumpulan: 'HUJUNG', subkumpulan: '', warna: '#94a3b8', ikon: 'moon'},
  CUTI: {kod: 'CUTI', label: 'Cuti', kumpulan: 'TIADA', subkumpulan: 'Cuti', warna: '#dc2626', ikon: 'cal'}
};

/* Teks ringkas dalam tab bulanan (huruf besar, macam papan putih). */
var SINGKAT = {PEJABAT: 'PEJABAT', HADIR_HBH: 'PEJABAT', KAMPUS: 'DALAM KAMPUS', HBH: 'HBH', KURSUS: 'KURSUS', BENGKEL: 'BENGKEL',
  SEMINAR: 'SEMINAR', MESYUARAT_LUAR: 'MESYUARAT LUAR', PENYELIAAN_LI: 'PENYELIAAN LI', LAWATAN: 'LAWATAN', PERTANDINGAN: 'PERTANDINGAN',
  URUSAN_RASMI: 'URUSAN RASMI', CUTI: 'CUTI', KELUAR: 'KELUAR', CUTI_UMUM: 'CUTI UMUM', HUJUNG: ''};
var BLN_KOD = ['JAN', 'FEB', 'MAC', 'APR', 'MEI', 'JUN', 'JUL', 'OGO', 'SEP', 'OKT', 'NOV', 'DIS'];

/* Cuti umum Persekutuan + Pulau Pinang. 2027: senarai rasmi Kabinet (BKPAK, JPM) via FMM GI/15/2026.
   Tarikh bertanda * bergantung pada anak bulan - admin perlu sahkan. */
var CUTI_AWAL = [
  ['2026-11-08', 'Deepavali', 'Persekutuan'], ['2026-11-09', 'Cuti ganti Deepavali', 'Persekutuan'],
  ['2026-12-25', 'Hari Krismas', 'Persekutuan'], ['2027-01-01', 'Tahun Baharu', 'Pulau Pinang'],
  ['2027-01-22', 'Thaipusam', 'Pulau Pinang'], ['2027-02-06', 'Tahun Baharu Cina', 'Persekutuan'],
  ['2027-02-07', 'Tahun Baharu Cina (hari kedua)', 'Persekutuan'], ['2027-02-08', 'Cuti ganti Tahun Baharu Cina', 'Persekutuan'],
  ['2027-02-24', 'Nuzul Al-Quran', 'Pulau Pinang'], ['2027-03-10', 'Hari Raya Aidilfitri *', 'Persekutuan'],
  ['2027-03-11', 'Hari Raya Aidilfitri (hari kedua) *', 'Persekutuan'], ['2027-05-01', 'Hari Pekerja', 'Persekutuan'],
  ['2027-05-17', 'Hari Raya Aidiladha *', 'Persekutuan'], ['2027-05-20', 'Hari Wesak', 'Persekutuan'],
  ['2027-06-06', 'Awal Muharam', 'Persekutuan'], ['2027-06-07', 'Hari Keputeraan Yang di-Pertuan Agong', 'Persekutuan'],
  ['2027-06-08', 'Cuti ganti Awal Muharam', 'Persekutuan'], ['2027-07-07', 'Ulang Tahun Pengisytiharan Tapak Warisan Dunia George Town', 'Pulau Pinang'],
  ['2027-07-10', 'Hari Jadi Yang di-Pertua Negeri Pulau Pinang', 'Pulau Pinang'], ['2027-08-15', 'Maulidur Rasul', 'Persekutuan'],
  ['2027-08-16', 'Cuti ganti Maulidur Rasul', 'Persekutuan'], ['2027-08-31', 'Hari Kebangsaan', 'Persekutuan'],
  ['2027-09-16', 'Hari Malaysia', 'Persekutuan'], ['2027-10-28', 'Deepavali *', 'Persekutuan'],
  ['2027-12-25', 'Hari Krismas', 'Persekutuan']
];

var _C = {};   // cache bagi satu permintaan sahaja
var AWAM = {emel: '', admin: false};   // "penonton awam" untuk tab bulanan: jenis cuti disorok

/* ============================== PINTU MASUK ============================== */
function doGet() { return jawab({ok: true, sistem: 'API Papan Pergerakan Staf JTMK', versi: VERSI}); }

function doPost(e) {
  _C = {};
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { return jawab({ok: false, kod: 'INPUT', ralat: 'Permintaan tidak sah.'}); }
  try { return jawab(urus(req)); }
  catch (err) {
    var kod = (err && err.kod) || 'RALAT';
    if (kod === 'RALAT') console.error(err && err.stack ? err.stack : err);
    return jawab({ok: false, kod: kod, ralat: kod === 'RALAT' ? 'Ralat pelayan: ' + (err && err.message) : err.message});
  }
}

function urus(req) {
  var a = String(req.action || '');
  var awam = {ping: apiPing, mintaOtp: apiMintaOtp, sahOtp: apiSahOtp};
  if (awam.hasOwnProperty(a)) return awam[a](req);
  var u = sahToken(req.token);
  var staf = {saya: apiSaya, papan: apiPapan, simpan: apiSimpan, batal: apiBatal, logKeluar: apiLogKeluar};
  if (staf.hasOwnProperty(a)) return staf[a](req, u);
  var adm = {admRekod: admRekod, admCuti: admCuti, admCutiSimpan: admCutiSimpan, admCutiPadam: admCutiPadam,
             admTetapan: admTetapan, admTetapanSimpan: admTetapanSimpan, admNamaSimpan: admNamaSimpan,
             admJenisSimpan: admJenisSimpan, admLog: admLog, admSegerak: admSegerak};
  if (adm.hasOwnProperty(a)) {
    if (!u.admin) gagal('FORBIDDEN', 'Hanya admin boleh membuat tindakan ini.');
    return adm[a](req, u);
  }
  gagal('INPUT', 'Tindakan tidak dikenali.');
}

/* ================================ AWAM ================================ */
function apiPing() { return {ok: true, versi: VERSI, ujian: ujian(), hariIni: hariIni()}; }

function apiMintaOtp(req) {
  var emel = lc(req.emel);
  if (!emelSah(emel)) gagal('INPUT', 'Masukkan alamat emel yang sah.');
  var st = cariStaf(emel);
  if (!st) gagal('TIADA', 'Emel ini tiada dalam senarai staf (tab Maklumat Staff). Hubungi admin.');
  var akaunUjian = ujian() && /@eboard\.test$/.test(emel);
  if (!akaunUjian && MailApp.getRemainingDailyQuota() < 1) gagal('EMEL', 'Kuota emel harian sistem sudah habis. Cuba lagi esok atau hubungi admin.');
  var kod, lock = kunci();
  try {
    var now = Date.now(), semua = baca('OTP');
    var simpan = semua.filter(function (r) { return Number(r.dibuat) > now - 864e5; });
    var baru = simpan.filter(function (r) { return r.emel === emel && Number(r.dibuat) > now - CFG.OTP_TETINGKAP_MINIT * 60000; });
    if (baru.length >= CFG.OTP_MAKS_MINTA) {
      var awal = Math.min.apply(null, baru.map(function (r) { return Number(r.dibuat); }));
      gagal('HAD', 'Terlalu banyak permintaan kod. Cuba lagi dalam ' + Math.max(1, Math.ceil((awal + CFG.OTP_TETINGKAP_MINIT * 60000 - now) / 60000)) + ' minit.');
    }
    kod = kodRawak();
    simpan.push({emel: emel, kod_hash: hashK('o|' + emel + '|' + kod), dibuat: now, tamat: now + CFG.OTP_MINIT * 60000, cubaan: 0});
    tulisSemula('OTP', simpan);
  } finally { lock.releaseLock(); }
  var out = {ok: true, emel: topeng(emel), minit: CFG.OTP_MINIT};
  if (akaunUjian) out.devOtp = kod; else hantarOtp(emel, st, kod);
  return out;
}

function apiSahOtp(req) {
  var emel = lc(req.emel), kod = String(req.kod || '').replace(/\D/g, '');
  if (!emelSah(emel)) gagal('INPUT', 'Masukkan alamat emel yang sah.');
  if (kod.length !== 6) gagal('INPUT', 'Masukkan kod 6 digit daripada emel anda.');
  if (!cariStaf(emel)) gagal('TIADA', 'Emel ini tiada dalam senarai staf.');
  var token, tamat, lock = kunci();
  try {
    var now = Date.now(), semua = baca('OTP');
    var r = semua.filter(function (x) { return x.emel === emel; }).sort(function (a, b) { return Number(b.dibuat) - Number(a.dibuat); })[0];
    if (!r || Number(r.tamat) < now) gagal('OTP', 'Kod sudah tamat tempoh. Minta kod baharu.');
    if (Number(r.cubaan) >= CFG.OTP_MAKS_CUBA) gagal('OTP', 'Terlalu banyak cubaan salah. Minta kod baharu.');
    if (r.kod_hash !== hashK('o|' + emel + '|' + kod)) {
      r.cubaan = Number(r.cubaan) + 1; kemas('OTP', r._r, r);
      var baki = CFG.OTP_MAKS_CUBA - r.cubaan;
      gagal('OTP', baki > 0 ? 'Kod salah. Baki ' + baki + ' cubaan.' : 'Terlalu banyak cubaan salah. Minta kod baharu.');
    }
    tulisSemula('OTP', semua.filter(function (x) { return x.emel !== emel; }));
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    tamat = now + CFG.SESI_HARI * 864e5;
    var peranti = teks(req.peranti, 80);
    var sesi = baca('SESI').filter(function (x) { return Number(x.tamat) > now; });
    sesi.push({token_hash: hashK('t|' + token), emel: emel, dibuat: now, tamat: tamat, peranti: peranti});
    tulisSemula('SESI', sesi);
    log(emel, 'LOG_MASUK', emel, {peranti: peranti});
  } finally { lock.releaseLock(); }
  return {ok: true, token: token, tamat: tamat};
}

/* ================================ STAF ================================ */
function apiLogKeluar(req, u) {
  var lock = kunci();
  try { tulisSemula('SESI', baca('SESI').filter(function (x) { return x.token_hash !== u.hash && Number(x.tamat) > Date.now(); })); }
  finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('ss_' + u.hash);
  return {ok: true};
}

function apiSaya(req, u) {
  return {ok: true, versi: VERSI, ujian: ujian(), hariIni: hariIni(),
          saya: {emel: u.emel, nama: u.staf.nama, jawatan: u.staf.jawatan, gred: u.staf.gred, trek: u.staf.trek},
          admin: u.admin, jenis: senaraiJenis(), sistem: KOD_SISTEM, corak: corakMinggu(), staf: stafPapar(),
          sheetUrl: 'https://docs.google.com/spreadsheets/d/' + CFG.STAF_SHEET_ID + '/edit'};
}

function apiPapan(req, u) {
  var dari = req.dari || hariIni(), hingga = req.hingga || dari;
  if (!tarikhSah(dari) || !tarikhSah(hingga) || hingga < dari) gagal('INPUT', 'Julat tarikh tidak sah.');
  if (bezaHari(dari, hingga) >= CFG.PAPAN_MAKS_HARI) gagal('INPUT', 'Julat paparan paling panjang ' + CFG.PAPAN_MAKS_HARI + ' hari.');
  var p = kiraPapan(dari, hingga, u);
  p.ok = true; p.hariIni = hariIni(); p.masa = sekarang();
  p.rekodSaya = rekodPengguna(u.emel, tambahHari(hariIni(), -14));
  return p;
}

function apiSimpan(req, u) {
  var r = req.rekod || {}, today = hariIni(), jm = jenisMap();
  var sasaran = (Array.isArray(r.emels) && r.emels.length) ? r.emels.map(lc) : [lc(r.emel || u.emel)];
  sasaran = sasaran.filter(function (e, i) { return sasaran.indexOf(e) === i; });
  if (sasaran.length > 80) gagal('INPUT', 'Terlalu ramai staf dipilih.');
  sasaran.forEach(function (e) {
    if (!u.admin && e !== u.emel) gagal('FORBIDDEN', 'Anda hanya boleh mengemas kini status diri sendiri.');
    if (!cariStaf(e)) gagal('INPUT', 'Staf tidak dijumpai dalam senarai: ' + e);
  });
  if (r.id && sasaran.length > 1) gagal('INPUT', 'Rekod sedia ada hanya boleh diubah untuk seorang staf.');
  var mula = String(r.mula || ''), tamat = String(r.tamat || r.mula || '');
  if (!tarikhSah(mula) || !tarikhSah(tamat)) gagal('INPUT', 'Pilih tarikh mula dan tarikh tamat.');
  if (tamat < mula) gagal('INPUT', 'Tarikh tamat mesti sama atau selepas tarikh mula.');
  if (bezaHari(mula, tamat) >= CFG.JULAT_MAKS_HARI) gagal('INPUT', 'Satu rekod paling panjang ' + CFG.JULAT_MAKS_HARI + ' hari.');
  var j = jm[r.kod];
  if (!j || !j.aktif) gagal('INPUT', 'Pilih jenis status yang sah.');
  var sesi = ['SEHARI', 'PAGI', 'PETANG', 'MASA'].indexOf(r.sesi) >= 0 ? r.sesi : 'SEHARI';
  var md = '', mh = '';
  if (sesi === 'MASA') {
    md = String(r.masa_dari || ''); mh = String(r.masa_hingga || '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(md) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(mh) || mh <= md) gagal('INPUT', 'Masukkan masa keluar dan masa balik yang sah.');
  }
  var lokasi = teks(r.lokasi, 120), catatan = teks(r.catatan, 300);
  var ids = [], segMula = mula, segTamat = tamat, lock = kunci();
  try {
    var semua = baca('REKOD'), asal = null, now = isoKini();
    if (r.id) {
      asal = semua.filter(function (x) { return x.id === String(r.id) && x.status !== 'BATAL'; })[0];
      if (!asal) gagal('INPUT', 'Rekod tidak dijumpai.');
      if (!u.admin && asal.emel !== u.emel) gagal('FORBIDDEN', 'Anda hanya boleh mengubah rekod sendiri.');
      if (asal.emel !== sasaran[0]) gagal('INPUT', 'Rekod tidak boleh dipindahkan kepada staf lain.');
      if (!u.admin && asal.tamat < today) gagal('LEPAS', 'Rekod yang sudah lepas tidak boleh diubah. Hubungi admin.');
      if (asal.mula < segMula) segMula = asal.mula;
      if (asal.tamat > segTamat) segTamat = asal.tamat;
    }
    if (!u.admin) {
      if (mula < today && !(asal && mula === asal.mula)) gagal('LEPAS', 'Tarikh yang sudah lepas tidak boleh dipilih. Hubungi admin untuk pembetulan.');
      if (tamat < today) gagal('LEPAS', 'Tarikh tamat sudah lepas. Hubungi admin untuk pembetulan.');
    }
    var medan = {mula: mula, tamat: tamat, kod: j.kod, sesi: sesi, masa_dari: md, masa_hingga: mh, lokasi: lokasi, catatan: catatan};
    if (asal) {
      Object.keys(medan).forEach(function (k) { asal[k] = medan[k]; });
      asal.dikemaskini_oleh = u.emel; asal.dikemaskini_pada = now;
      kemas('REKOD', asal._r, asal);
      ids.push(asal.id);
      log(u.emel, 'UBAH', asal.emel, medan);
    } else {
      var baru = sasaran.map(function (e) {
        var o = {id: idBaru(), emel: e, dibuat_oleh: u.emel, dibuat_pada: now, dikemaskini_oleh: u.emel, dikemaskini_pada: now, status: 'AKTIF'};
        Object.keys(medan).forEach(function (k) { o[k] = medan[k]; });
        ids.push(o.id);
        return o;
      });
      tambahBanyak('REKOD', baru);
      log(u.emel, baru.length > 1 ? 'TAMBAH_PUKAL' : 'TAMBAH', baru.length > 1 ? baru.length + ' staf' : baru[0].emel, medan);
    }
  } finally { lock.releaseLock(); }
  var s = cubaSegerak(function () { return segerakJulat(segMula, segTamat); });
  return {ok: true, ids: ids, bil: ids.length, tab: s.tab, amaran: s.amaran};
}

function apiBatal(req, u) {
  var today = hariIni(), hasil, segMula, segTamat, lock = kunci();
  try {
    var r = baca('REKOD').filter(function (x) { return x.id === String(req.id || '') && x.status !== 'BATAL'; })[0];
    if (!r) gagal('INPUT', 'Rekod tidak dijumpai.');
    if (!u.admin && r.emel !== u.emel) gagal('FORBIDDEN', 'Anda hanya boleh membatalkan rekod sendiri.');
    if (!u.admin && r.tamat < today) gagal('LEPAS', 'Rekod yang sudah lepas tidak boleh dibatalkan. Hubungi admin.');
    segMula = r.mula; segTamat = r.tamat;
    if (!u.admin && r.mula < today) { r.tamat = tambahHari(today, -1); hasil = 'DIPENDEKKAN'; }   // simpan hari yang sudah berlalu
    else { r.status = 'BATAL'; hasil = 'DIBATALKAN'; }
    r.dikemaskini_oleh = u.emel; r.dikemaskini_pada = isoKini();
    kemas('REKOD', r._r, r);
    log(u.emel, 'BATAL', r.emel, {id: r.id, kod: r.kod, mula: r.mula, tamat: r.tamat, hasil: hasil});
  } finally { lock.releaseLock(); }
  var s = cubaSegerak(function () { return segerakJulat(segMula, segTamat); });
  return {ok: true, hasil: hasil, tab: s.tab, amaran: s.amaran};
}

/* =============================== ADMIN =============================== */
function admRekod(req) {
  var dari = req.dari || tambahHari(hariIni(), -31), hingga = req.hingga || tambahHari(hariIni(), 62);
  if (!tarikhSah(dari) || !tarikhSah(hingga)) gagal('INPUT', 'Julat tarikh tidak sah.');
  var nama = {};
  senaraiStaf().forEach(function (s) { nama[s.emel] = s.nama; });
  var emel = req.emel ? lc(req.emel) : '';
  var list = baca('REKOD').filter(function (r) { return r.status !== 'BATAL' && r.tamat >= dari && r.mula <= hingga && (!emel || r.emel === emel); })
    .map(function (r) { var o = rekodPenuh(r); o.nama = nama[r.emel] || r.emel; return o; })
    .sort(function (a, b) { return a.mula < b.mula ? 1 : a.mula > b.mula ? -1 : 0; });
  return {ok: true, dari: dari, hingga: hingga, rekod: list};
}

function admCuti() {
  var list = baca('CUTI_UMUM').map(function (r) { return {tarikh: r.tarikh, nama: r.nama, skop: r.skop, disahkan: r.disahkan === 'YA'}; })
    .sort(function (a, b) { return a.tarikh < b.tarikh ? -1 : 1; });
  return {ok: true, cuti: list};
}

function admCutiSimpan(req, u) {
  var t = String(req.tarikh || ''), asal = String(req.asal || ''), nama = teks(req.nama, 100);
  if (!tarikhSah(t)) gagal('INPUT', 'Tarikh tidak sah.');
  if (!nama) gagal('INPUT', 'Masukkan nama cuti.');
  var skop = ['Persekutuan', 'Pulau Pinang', 'Cuti Peristiwa', 'Lain-lain'].indexOf(req.skop) >= 0 ? req.skop : 'Lain-lain';
  var lock = kunci();
  try {
    var list = baca('CUTI_UMUM').filter(function (r) { return r.tarikh !== t && r.tarikh !== asal; });
    list.push({tarikh: t, nama: nama, skop: skop, disahkan: req.disahkan ? 'YA' : 'TIDAK'});
    list.sort(function (a, b) { return a.tarikh < b.tarikh ? -1 : 1; });
    tulisSemula('CUTI_UMUM', list);
    log(u.emel, 'CUTI_UMUM', t, {nama: nama, skop: skop, disahkan: !!req.disahkan});
  } finally { lock.releaseLock(); }
  var out = admCuti(), s = cubaSegerak(function () { return segerakJulat(t, t).concat(tarikhSah(asal) && asal !== t ? segerakJulat(asal, asal) : []); });
  out.amaran = s.amaran;
  return out;
}

function admCutiPadam(req, u) {
  var t = String(req.tarikh || ''), lock = kunci();
  try {
    tulisSemula('CUTI_UMUM', baca('CUTI_UMUM').filter(function (r) { return r.tarikh !== t; }));
    log(u.emel, 'CUTI_UMUM_PADAM', t, {});
  } finally { lock.releaseLock(); }
  var out = admCuti();
  if (tarikhSah(t)) out.amaran = cubaSegerak(function () { return segerakJulat(t, t); }).amaran;
  return out;
}

function admTetapan() {
  var nama = baca('NAMA_PAPARAN').map(function (r) { return {emel: lc(r.emel), nama: r.nama_paparan}; });
  return {ok: true, admin: senaraiAdminTetapan(), corak: corakMinggu(), nama: nama, jenis: senaraiJenis(),
          sheetUrl: 'https://docs.google.com/spreadsheets/d/' + CFG.STAF_SHEET_ID + '/edit'};
}

function admTetapanSimpan(req, u) {
  var admin = (Array.isArray(req.admin) ? req.admin : []).map(lc).filter(function (e, i, a) { return emelSah(e) && a.indexOf(e) === i; });
  if (!admin.length) gagal('INPUT', 'Sekurang-kurangnya seorang admin diperlukan.');
  admin.forEach(function (e) { if (!cariStaf(e) && !/@eboard\.test$/.test(e)) gagal('INPUT', 'Admin mesti staf dalam tab Maklumat Staff: ' + e); });
  var jm = jenisMap(), corak = (Array.isArray(req.corak) ? req.corak : []).slice(0, 5).map(String);
  if (corak.length !== 5) gagal('INPUT', 'Corak minggu perlu 5 hari (Isnin hingga Jumaat).');
  corak.forEach(function (k) { if (!jm[k] || !jm[k].aktif) gagal('INPUT', 'Jenis status corak tidak sah: ' + k); });
  var lock = kunci();
  try {
    setTetapan('ADMIN', admin.join(','), 'Emel admin (pisahkan dengan koma)');
    setTetapan('CORAK_MINGGU', corak.join(','), 'Status lalai Isnin..Jumaat (kod JENIS_STATUS)');
    log(u.emel, 'TETAPAN', '', {admin: admin, corak: corak});
  } finally { lock.releaseLock(); }
  _C = {};
  var out = admTetapan();
  out.amaran = cubaSegerak(segerakSemasa).amaran;
  return out;
}

function admNamaSimpan(req, u) {
  var emel = lc(req.emel), nama = teks(req.nama, 40);
  if (!cariStaf(emel)) gagal('INPUT', 'Staf tidak dijumpai.');
  var lock = kunci();
  try {
    var list = baca('NAMA_PAPARAN').filter(function (r) { return lc(r.emel) !== emel; });
    if (nama) list.push({emel: emel, nama_paparan: nama});
    tulisSemula('NAMA_PAPARAN', list);
    log(u.emel, 'NAMA_PAPARAN', emel, {nama: nama});
  } finally { lock.releaseLock(); }
  return {ok: true};
}

function admJenisSimpan(req, u) {
  var j = req.jenis || {}, kod = String(j.kod || '').toUpperCase().trim();
  if (!/^[A-Z0-9_]{2,30}$/.test(kod)) gagal('INPUT', 'Kod hanya huruf besar, nombor dan _ (2\u201330 aksara).');
  if (KOD_SISTEM[kod]) gagal('INPUT', 'Kod ini dikhaskan untuk sistem.');
  var label = teks(j.label, 60);
  if (!label) gagal('INPUT', 'Masukkan label.');
  var kumpulan = ['ADA', 'HBH', 'TIADA'].indexOf(j.kumpulan) >= 0 ? j.kumpulan : 'TIADA';
  var warna = /^#[0-9a-fA-F]{6}$/.test(j.warna || '') ? j.warna : '#64748b';
  var lock = kunci();
  try {
    var list = baca('JENIS_STATUS'), ada = list.filter(function (r) { return r.kod === kod; })[0];
    var o = {kod: kod, label: label, kumpulan: kumpulan, subkumpulan: teks(j.subkumpulan, 40), warna: warna,
             ikon: /^[a-z]{2,12}$/.test(j.ikon || '') ? j.ikon : 'cal', peribadi: j.peribadi ? 'YA' : 'TIDAK',
             aktif: j.aktif === false ? 'TIDAK' : 'YA', susunan: ada ? ada.susunan : String(list.length + 1)};
    if (o.aktif === 'TIDAK' && corakMinggu().indexOf(kod) >= 0) gagal('INPUT', 'Jenis ini sedang digunakan dalam corak minggu. Tukar corak dahulu.');
    if (ada) kemas('JENIS_STATUS', ada._r, o); else tambah('JENIS_STATUS', o);
    log(u.emel, 'JENIS_STATUS', kod, o);
  } finally { lock.releaseLock(); }
  _C = {};
  return {ok: true, jenis: senaraiJenis(), amaran: cubaSegerak(segerakSemasa).amaran};
}

function admLog(req) {
  var had = Math.min(Math.max(Number(req.had) || 200, 10), 1000);
  var list = baca('LOG').slice(-had).reverse().map(function (r) {
    var b = {}; try { b = JSON.parse(r.butiran || '{}'); } catch (e) { b = {teks: r.butiran}; }
    return {masa: r.masa, oleh: r.oleh, tindakan: r.tindakan, sasaran: r.sasaran, butiran: b};
  });
  return {ok: true, log: list};
}

/* Admin: segerak semula tab bulanan (bulan semasa + tab akan datang yang wujud). */
function admSegerak(req, u) {
  CacheService.getScriptCache().remove('staf_v1'); _C = {};
  var s = cubaSegerak(segerakSemasa);
  if (s.amaran) gagal('SHEET', s.amaran);
  log(u.emel, 'SEGERAK_SHEET', '', {tab: s.tab});
  return {ok: true, tab: s.tab};
}

/* ======================= TAB BULANAN (Sheet PERGERAKAN STAFF) ======================= */
function namaTabBulan(ym) { return BLN_KOD[Number(ym.slice(5, 7)) - 1] + ym.slice(0, 4); }
function bulanSeterusnya(ym) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) + 1; if (m > 12) { m = 1; y++; } return y + '-' + pad2(m); }
function hariAkhirBulan(ym) { return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate(); }
function bulanDalamJulat(mula, tamat) { var out = [], ym = mula.slice(0, 7); while (ym <= tamat.slice(0, 7)) { out.push(ym); ym = bulanSeterusnya(ym); } return out; }
function hadBulan() { var ym = hariIni().slice(0, 7); for (var i = 0; i < CFG.BULAN_KE_DEPAN; i++) ym = bulanSeterusnya(ym); return ym; }

function cubaSegerak(fn) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(20000)) return {tab: [], amaran: 'Status disimpan, tetapi tab bulanan sedang dikemas kini oleh proses lain. Ia akan dikemas kini semula esok pagi.'};
    return {tab: fn() || []};
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    return {tab: [], amaran: 'Status disimpan, tetapi tab bulanan dalam Sheet PERGERAKAN STAFF tidak dapat dikemas kini (' + e.message + '). Pastikan akaun pemilik skrip ada akses edit.'};
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

/* Bulan dalam julat rekod: bulan semasa & akan datang dicipta jika tiada; bulan lepas hanya jika tab sudah wujud. */
function segerakJulat(mula, tamat) {
  var kini = hariIni().slice(0, 7), had = hadBulan();
  return bulanDalamJulat(mula, tamat).filter(function (ym) { return ym <= had; })
    .map(function (ym) { return segerakBulan(ym, ym >= kini); }).filter(Boolean);
}

/* Bulan semasa (dicipta jika tiada) + tab bulan akan datang yang wujud; mulai 25 hb, tab bulan depan turut dicipta. */
function segerakSemasa() {
  var kini = hariIni().slice(0, 7), out = [segerakBulan(kini, true)], ss = sheetStaf(), ym = bulanSeterusnya(kini);
  for (var i = 0; i < CFG.BULAN_KE_DEPAN; i++, ym = bulanSeterusnya(ym)) {
    var cipta = i === 0 && Number(hariIni().slice(8, 10)) >= 25;
    if (cipta || ss.getSheetByName(namaTabBulan(ym))) out.push(segerakBulan(ym, cipta));
  }
  return out.filter(Boolean);
}

function sheetStaf() { return _C.ssStaf || (_C.ssStaf = SpreadsheetApp.openById(CFG.STAF_SHEET_ID)); }

/* Tulis status setiap staf x tarikh ke tab bulan `ym` (cth. 2026-11 -> NOV2026). Pulangkan nama tab, atau '' jika tiada & tidak dicipta.
   Susun atur: baris 1 = ['', NAMA, EMEL], baris 2 = tarikh (dd/MM/yyyy) mulai lajur D, baris 3+ = staf (ikut tab Maklumat Staff).
   Tab sedia ada: lajur tarikh yang sudah ada dikekalkan (cth. NOV2026 bermula 13/11). */
function segerakBulan(ym, cipta) {
  var ss = sheetStaf(), nama = namaTabBulan(ym), sh = ss.getSheetByName(nama), tarikh = sh ? bacaTarikhTab(sh) : [];
  if (!sh && !cipta) return '';
  if (!sh || !tarikh.some(Boolean)) {
    if (!sh) sh = ss.insertSheet(nama);
    tarikh = [];
    for (var d = 1; d <= hariAkhirBulan(ym); d++) tarikh.push(ym + '-' + pad2(d));
    sh.getRange(1, 1, 2, 3 + tarikh.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, 3).setValues([['', 'NAMA', 'EMEL']]);
    sh.getRange(2, 4, 1, tarikh.length).setValues([tarikh.map(paparTarikh)]);
    sh.getRange(1, 1, 2, 3 + tarikh.length).setFontWeight('bold');
    sh.setFrozenRows(2);
    sh.setFrozenColumns(3);
  }
  var sah = tarikh.filter(Boolean).sort();
  if (!sah.length) return nama;
  var p = kiraPapan(sah[0], sah[sah.length - 1], AWAM), idx = {}, jm = jenisMap();
  p.hari.forEach(function (h, i) { idx[h.t] = i; });
  var staf = senaraiStaf().filter(function (s) { return !/@eboard\.test$/.test(s.emel); });
  var nilai = [], latar = [];
  staf.forEach(function (s, i) {
    var sel = p.sel[s.emel] || [], v = [String(i + 1), s.nama, s.emel], b = [];
    tarikh.forEach(function (t) {
      var x = t && idx.hasOwnProperty(t) ? teksSel(sel[idx[t]], jm) : {teks: '', warna: '#ffffff'};
      v.push(x.teks); b.push(x.warna);
    });
    nilai.push(v); latar.push(b);
  });
  var lebar = 3 + tarikh.length;
  if (nilai.length) {
    sh.getRange(3, 1, nilai.length, lebar).setNumberFormat('@').setValues(nilai);
    sh.getRange(3, 4, nilai.length, tarikh.length).setBackgrounds(latar);
  }
  var akhir = sh.getLastRow();
  if (akhir > 2 + nilai.length) sh.getRange(3 + nilai.length, 1, akhir - 2 - nilai.length, lebar).clearContent();
  sh.getRange(2, 4, 1, tarikh.length).setBackgrounds([tarikh.map(function (t) {
    var h = t && idx.hasOwnProperty(t) ? p.hari[idx[t]] : null;
    return !h ? '#ffffff' : h.jenis === 'HUJUNG' ? '#e2e8f0' : h.jenis === 'CUTI_UMUM' ? '#ede9fe' : '#f8fafc';
  })]);
  return nama;
}

/* Tarikh pada baris 2 (mulai lajur D) -> ['yyyy-MM-dd' | '']; lajur kosong di hujung dibuang. */
function bacaTarikhTab(sh) {
  var lc = sh.getLastColumn();
  if (lc < 4) return [];
  var rg = sh.getRange(2, 4, 1, lc - 3), raw = rg.getValues()[0], disp = rg.getDisplayValues()[0];
  var out = raw.map(function (v, i) {
    if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
    var m = String(disp[i] || v || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (!m) return '';
    var iso = m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    return tarikhSah(iso) ? iso : '';
  });
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

function paparTarikh(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }

/* Teks & warna satu sel tab bulanan. Penonton awam: jenis cuti -> "CUTI". */
function teksSel(c, jm) {
  if (!c) return {teks: '', warna: '#ffffff'};
  var a = c.a, ja = infoKod(a.k, jm);
  if (a.s === 'h') return {teks: '', warna: '#e2e8f0'};
  var teks = singkat(a.k, ja) + (a.lok ? ' \u2013 ' + a.lok : ''), warna = warnaLatar(ja);
  if (c.p) {
    var jp = infoKod(c.p.k, jm), ses = c.p.ses === 'MASA' ? c.p.md + '\u2013' + c.p.mh : c.p.ses === 'PAGI' ? 'PAGI' : 'PETANG';
    teks += ' / ' + singkat(c.p.k, jp) + ' (' + ses + ')' + (c.p.lok ? ' \u2013 ' + c.p.lok : '');
    warna = warnaLatar(jp);
  }
  return {teks: teks, warna: warna};
}
function infoKod(k, jm) { return jm[k] || KOD_SISTEM[k] || {kod: k, label: k, kumpulan: 'TIADA', subkumpulan: ''}; }
function singkat(k, j) { return SINGKAT.hasOwnProperty(k) ? SINGKAT[k] : String(j.label || k).toUpperCase(); }
function warnaLatar(j) {
  if (j.kumpulan === 'ADA') return '#dcfce7';
  if (j.kumpulan === 'HBH') return '#dbeafe';
  if (j.kumpulan === 'CUTI_UMUM') return '#ede9fe';
  if (j.kumpulan === 'HUJUNG') return '#e2e8f0';
  if (j.subkumpulan === 'Cuti') return '#fee2e2';
  if (j.subkumpulan === 'Keluar Sementara') return '#fef3c7';
  return '#ffedd5';
}

/* ============================ PENGIRAAN PAPAN ============================ */
function kiraPapan(dari, hingga, u) {
  var staf = stafPapar(), cuti = petaCuti(), corak = corakMinggu(), jm = jenisMap(), hari = [];
  for (var d = dari; d <= hingga; d = tambahHari(d, 1)) {
    var dow = hariMinggu(d), c = cuti[d];
    hari.push({t: d, dow: dow, jenis: c ? 'CUTI_UMUM' : (dow === 0 || dow === 6) ? 'HUJUNG' : 'KERJA',
               cuti: c ? c.nama : '', corak: dow >= 1 && dow <= 5 ? corak[dow - 1] : ''});
  }
  var by = {};
  baca('REKOD').forEach(function (r) { if (r.status !== 'BATAL' && r.tamat >= dari && r.mula <= hingga) (by[r.emel] = by[r.emel] || []).push(r); });
  var sel = {};
  staf.forEach(function (s) {
    var rs = by[s.emel] || [];
    sel[s.emel] = hari.map(function (h) {
      var asas = h.jenis === 'KERJA' ? {k: h.corak, s: 'c'} : h.jenis === 'CUTI_UMUM' ? {k: 'CUTI_UMUM', s: 'u'} : {k: 'HUJUNG', s: 'h'};
      // Rekod dikira pada hari bekerja; hari cuti/hujung minggu hanya jika dipilih tepat sebagai tarikh mula/tamat.
      var kena = rs.filter(function (r) { return r.mula <= h.t && r.tamat >= h.t && (h.jenis === 'KERJA' || r.mula === h.t || r.tamat === h.t); });
      var penuh = terkini(kena.filter(function (r) { return !r.sesi || r.sesi === 'SEHARI'; }));
      var separa = terkini(kena.filter(function (r) { return r.sesi && r.sesi !== 'SEHARI'; }));
      var o = {a: penuh ? selRekod(penuh, h.t, u, jm) : asas};
      if (separa) o.p = selRekod(separa, h.t, u, jm);
      return o;
    });
  });
  return {dari: dari, hingga: hingga, hari: hari, sel: sel};
}

function terkini(list) {
  return list.sort(function (a, b) {
    var x = a.dikemaskini_pada || a.dibuat_pada, y = b.dikemaskini_pada || b.dibuat_pada;
    return x < y ? 1 : x > y ? -1 : b._r - a._r;
  })[0] || null;
}

function selRekod(r, t, u, jm) {
  var j = jm[r.kod] || {peribadi: false};
  var boleh = (u.emel && r.emel === u.emel) || u.admin, sorok = j.peribadi && !boleh;
  var o = {k: sorok ? 'CUTI' : r.kod, s: 'r'};
  if (r.lokasi && !sorok) o.lok = r.lokasi;
  if (r.sesi && r.sesi !== 'SEHARI') { o.ses = r.sesi; if (r.sesi === 'MASA') { o.md = r.masa_dari; o.mh = r.masa_hingga; } }
  if (r.tamat > t) o.hg = r.tamat;
  if (r.mula < t) o.dr = r.mula;
  if (boleh) {
    o.id = r.id;
    if (r.catatan) o.cat = r.catatan;
    var oleh = r.dikemaskini_oleh || r.dibuat_oleh;
    if (oleh && oleh !== r.emel) o.olh = oleh;
  }
  return o;
}

function rekodPenuh(r) {
  return {id: r.id, emel: r.emel, mula: r.mula, tamat: r.tamat, kod: r.kod, sesi: r.sesi || 'SEHARI',
          masa_dari: r.masa_dari, masa_hingga: r.masa_hingga, lokasi: r.lokasi, catatan: r.catatan,
          oleh: r.dikemaskini_oleh || r.dibuat_oleh, pada: r.dikemaskini_pada || r.dibuat_pada};
}

function rekodPengguna(emel, sejak) {
  return baca('REKOD').filter(function (r) { return r.emel === emel && r.status !== 'BATAL' && r.tamat >= sejak; })
    .map(rekodPenuh).sort(function (a, b) { return a.mula < b.mula ? -1 : a.mula > b.mula ? 1 : 0; });
}

/* ============================== STAF & SESI ============================== */
function senaraiStaf() {
  if (_C.staf) return _C.staf;
  var cache = CacheService.getScriptCache(), hit = cache.get('staf_v1'), list;
  if (hit) list = JSON.parse(hit);
  else { list = bacaDataStaf(); cache.put('staf_v1', JSON.stringify(list), CFG.CACHE_STAF_SAAT); }
  if (ujian()) list = list.concat(AKAUN_UJIAN.map(function (a) { return {emel: a.emel, nama: a.nama, jawatan: a.jawatan, gred: a.gred, trek: a.trek}; }));
  return (_C.staf = list);
}

/* Baca tab "Maklumat Staff". Lajur dicari ikut TAJUK di baris 1 (NAMA, EMEL wajib; GRED, JAWATAN, TREK,
   PERJAWATAN pilihan) - susunan lajur boleh berubah. Susunan baris dikekalkan. */
function bacaDataStaf() {
  var jadual;
  try {
    var sh = sheetStaf().getSheetByName(CFG.STAF_TAB);
    if (!sh) throw new Error('Tab ' + CFG.STAF_TAB + ' tiada');
    jadual = sh.getDataRange().getDisplayValues();
  } catch (e) {
    jadual = bacaDataStafGviz();   // sandaran jika akaun pemilik skrip tiada akses terus
  }
  var seen = {};
  return petaLajurStaf(jadual).map(function (r) {
    return {emel: lc(r.emel), nama: String(r.nama || '').trim(), gred: String(r.gred || '').replace(/\s+/g, ''),
            trek: String(r.trek || '').trim(), jawatan: String(r.jawatan || '').trim(), pj: String(r.perjawatan || '').trim().toUpperCase()};
  }).filter(function (r) {
    if (!emelSah(r.emel) || !r.nama || r.pj === 'KEKOSONGAN' || seen[r.emel]) return false;
    seen[r.emel] = 1;
    return true;
  }).map(function (r) { return {emel: r.emel, nama: r.nama, gred: r.gred, trek: r.trek, jawatan: r.jawatan}; });
}

function petaLajurStaf(jadual) {
  if (!jadual || !jadual.length) return [];
  var tajuk = jadual[0].map(function (h) { return String(h || '').trim().toUpperCase(); });
  var cari = function (n) { return tajuk.indexOf(n); };
  var iNama = cari('NAMA'), iEmel = cari('EMEL');
  if (iNama < 0 || iEmel < 0) gagal('STAF', 'Lajur NAMA dan EMEL tidak dijumpai dalam tab ' + CFG.STAF_TAB + '.');
  var iGred = cari('GRED'), iJaw = cari('JAWATAN'), iTrek = cari('TREK'), iPj = cari('PERJAWATAN');
  var ambil = function (r, i) { return i >= 0 ? r[i] : ''; };
  return jadual.slice(1).map(function (r) {
    return {nama: r[iNama], emel: r[iEmel], gred: ambil(r, iGred), jawatan: ambil(r, iJaw), trek: ambil(r, iTrek), perjawatan: ambil(r, iPj)};
  });
}

function bacaDataStafGviz() {
  var url = 'https://docs.google.com/spreadsheets/d/' + CFG.STAF_SHEET_ID + '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(CFG.STAF_TAB);
  var res = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  if (res.getResponseCode() !== 200) gagal('STAF', 'Tidak dapat membaca senarai staf daripada tab ' + CFG.STAF_TAB + '.');
  return Utilities.parseCsv(res.getContentText());
}

function cariStaf(emel) {
  emel = lc(emel);
  var list = senaraiStaf();
  for (var i = 0; i < list.length; i++) if (list[i].emel === emel) return list[i];
  return null;
}

function stafPapar() {
  var nama = {};
  baca('NAMA_PAPARAN').forEach(function (r) { if (r.nama_paparan) nama[lc(r.emel)] = r.nama_paparan; });
  var pangkat = function (j) { j = String(j).toUpperCase(); return j === 'KETUA JABATAN' ? 0 : j === 'KETUA PROGRAM' ? 1 : 2; };
  return senaraiStaf().map(function (s) { return {emel: s.emel, nama: s.nama, papar: nama[s.emel] || '', jawatan: s.jawatan, gred: s.gred, trek: s.trek}; })
    .sort(function (a, b) { return pangkat(a.jawatan) - pangkat(b.jawatan) || (a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0); });
}

function sahToken(token) {
  if (!token || typeof token !== 'string' || token.length < 32) gagal('AUTH', 'Sila log masuk.');
  var h = hashK('t|' + token), cache = CacheService.getScriptCache(), ck = 'ss_' + h, hit = cache.get(ck), emel, tamat;
  if (hit) { var p = hit.split('|'); emel = p[0]; tamat = Number(p[1]); }
  else {
    var row = baca('SESI').filter(function (r) { return r.token_hash === h; })[0];
    if (!row) gagal('AUTH', 'Sesi anda sudah tamat. Sila log masuk semula.');
    emel = row.emel; tamat = Number(row.tamat);
    cache.put(ck, emel + '|' + tamat, 21600);
  }
  if (!(tamat > Date.now())) gagal('AUTH', 'Sesi anda sudah tamat. Sila log masuk semula.');
  var st = cariStaf(emel);
  if (!st) gagal('AUTH', 'Emel anda tiada lagi dalam senarai staf.');
  return {emel: emel, staf: st, admin: senaraiAdmin().indexOf(emel) >= 0, hash: h};
}

function senaraiAdminTetapan() { return String(tetapan().ADMIN || CFG.ADMIN_AWAL).split(/[,;\s]+/).map(lc).filter(emelSah); }
function senaraiAdmin() {
  var s = senaraiAdminTetapan();
  if (ujian()) s = s.concat(AKAUN_UJIAN.filter(function (a) { return a.admin; }).map(function (a) { return a.emel; }));
  return s;
}

function hantarOtp(emel, st, kod) {
  var nama = String(st.nama || '').toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a">' +
    '<div style="font-weight:800;font-size:18px;color:#15803d">Pergerakan Staf JTMK</div>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:18px">Politeknik Balik Pulau</div>' +
    '<p style="margin:0 0 10px">Salam ' + escHtml(nama) + ',</p><p style="margin:0 0 14px">Kod log masuk anda:</p>' +
    '<div style="font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;padding:14px;border-radius:12px;background:#dcfce7;color:#14532d">' + kod + '</div>' +
    '<p style="font-size:13px;color:#64748b;margin:16px 0 0">Kod sah selama ' + CFG.OTP_MINIT + ' minit. Jangan kongsi kod ini dengan sesiapa. Jika anda tidak meminta kod ini, abaikan emel ini.</p></div>';
  MailApp.sendEmail({to: emel, subject: kod + ' ialah kod log masuk Pergerakan Staf JTMK', htmlBody: html,
    body: 'Kod log masuk Pergerakan Staf JTMK: ' + kod + ' (sah ' + CFG.OTP_MINIT + ' minit). Jangan kongsi kod ini.', name: 'Pergerakan Staf JTMK'});
}

/* =============================== TETAPAN =============================== */
function tetapan() {
  if (_C.tetapan) return _C.tetapan;
  var t = {};
  baca('TETAPAN').forEach(function (r) { t[r.kunci] = r.nilai; });
  return (_C.tetapan = t);
}
function setTetapan(kunci, nilai, ket) {
  var ada = baca('TETAPAN').filter(function (r) { return r.kunci === kunci; })[0];
  var o = {kunci: kunci, nilai: nilai, keterangan: ket || (ada && ada.keterangan) || ''};
  if (ada) kemas('TETAPAN', ada._r, o); else tambah('TETAPAN', o);
  _C.tetapan = null;
}
function corakMinggu() {
  var c = String(tetapan().CORAK_MINGGU || CFG.CORAK_AWAL).split(',').map(function (x) { return x.trim(); });
  while (c.length < 5) c.push('PEJABAT');
  return c.slice(0, 5);
}
function senaraiJenis() {
  if (_C.jenis) return _C.jenis;
  return (_C.jenis = baca('JENIS_STATUS').map(function (r) {
    return {kod: r.kod, label: r.label, kumpulan: r.kumpulan, subkumpulan: r.subkumpulan, warna: r.warna, ikon: r.ikon,
            peribadi: r.peribadi === 'YA', aktif: r.aktif !== 'TIDAK', susunan: Number(r.susunan) || 0};
  }).sort(function (a, b) { return a.susunan - b.susunan; }));
}
function jenisMap() { var m = {}; senaraiJenis().forEach(function (j) { m[j.kod] = j; }); return m; }
function petaCuti() {
  var m = {};
  baca('CUTI_UMUM').forEach(function (r) { if (tarikhSah(r.tarikh)) m[r.tarikh] = {nama: r.nama, skop: r.skop}; });
  return m;
}

/* ============================ PASANG & PENCETUS ============================ */
function setup() {
  var sp = PropertiesService.getScriptProperties(), id = sp.getProperty('DB_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create(CFG.DB_NAMA); sp.setProperty('DB_ID', ss.getId()); }
  ss.setSpreadsheetTimeZone(CFG.TZ);
  Object.keys(SKEMA).forEach(function (nama) {
    var sh = ss.getSheetByName(nama) || ss.insertSheet(nama), w = SKEMA[nama].length;
    sh.getRange(1, 1, sh.getMaxRows(), w).setNumberFormat('@');
    sh.getRange(1, 1, 1, w).setValues([SKEMA[nama]]).setFontWeight('bold').setBackground('#dcfce7');
    sh.setFrozenRows(1);
  });
  ['Sheet1', 'Helaian1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1) ss.deleteSheet(s); });
  _C = {};
  if (!baca('TETAPAN').length) tambahBanyak('TETAPAN', [
    {kunci: 'ADMIN', nilai: CFG.ADMIN_AWAL, keterangan: 'Emel admin (pisahkan dengan koma)'},
    {kunci: 'CORAK_MINGGU', nilai: CFG.CORAK_AWAL, keterangan: 'Status lalai Isnin..Jumaat (kod JENIS_STATUS)'}]);
  if (!baca('JENIS_STATUS').length) tambahBanyak('JENIS_STATUS', JENIS_AWAL.map(function (j, i) {
    return {kod: j[0], label: j[1], kumpulan: j[2], subkumpulan: j[3], warna: j[4], ikon: j[5], peribadi: j[6], aktif: 'YA', susunan: String(i + 1)};
  }));
  var ada = petaCuti();
  tambahBanyak('CUTI_UMUM', CUTI_AWAL.filter(function (c) { return !ada[c[0]]; }).map(function (c) { return {tarikh: c[0], nama: c[1], skop: c[2], disahkan: 'TIDAK'}; }));
  garam();
  pasangPencetus();
  _C = {};
  var n = bacaDataStaf().length, tab = segerakSemasa();
  console.log('Siap. Data sistem: ' + ss.getUrl() + ' \u00b7 staf dari Maklumat Staff: ' + n + ' \u00b7 tab dikemas kini: ' + tab.join(', '));
  return ss.getUrl();
}

/* Pencetus harian 6 pagi: cipta/kemas kini tab bulan semasa (dan bulan depan mulai 25 hb). */
function harian() {
  _C = {};
  CacheService.getScriptCache().remove('staf_v1');
  var s = cubaSegerak(segerakSemasa);
  if (s.amaran) console.error(s.amaran); else console.log('Tab dikemas kini: ' + s.tab.join(', '));
}
function pasangPencetus() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'harian') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('harian').timeBased().everyDays(1).atHour(6).inTimezone(CFG.TZ).create();
}
/* Jalankan dari editor untuk mengemas kini semua tab bulanan serta-merta. */
function segerakSekarang() { _C = {}; CacheService.getScriptCache().remove('staf_v1'); console.log(segerakSemasa().join(', ')); }

function modUjianHidup() { PropertiesService.getScriptProperties().setProperty('TEST_MODE', '1'); CacheService.getScriptCache().remove('staf_v1'); }
function modUjianMati() { PropertiesService.getScriptProperties().deleteProperty('TEST_MODE'); CacheService.getScriptCache().remove('staf_v1'); }

/* ============================ PANGKALAN DATA ============================ */
function db() {
  if (_C.ss) return _C.ss;
  var id = prop('DB_ID');
  if (!id) gagal('SETUP', 'Sistem belum disediakan. Pemilik perlu jalankan setup() dahulu.');
  return (_C.ss = SpreadsheetApp.openById(id));
}
function tab(nama) { var sh = db().getSheetByName(nama); if (!sh) gagal('SETUP', 'Tab ' + nama + ' tiada. Jalankan setup() semula.'); return sh; }
function baca(nama) {
  var sh = tab(nama), n = sh.getLastRow(), cols = SKEMA[nama];
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, cols.length).getValues().map(function (row, i) {
    var o = {_r: i + 2};
    cols.forEach(function (c, j) { o[c] = sel(row[j]); });
    return o;
  }).filter(function (o) { return cols.some(function (c) { return o[c] !== ''; }); });
}
function sel(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, CFG.TZ, v.getFullYear() < 1901 ? 'HH:mm' : 'yyyy-MM-dd');
  return String(v).trim();
}
function baris(nama, o) { return SKEMA[nama].map(function (c) { return selamat(o[c]); }); }
function tambah(nama, o) { tab(nama).appendRow(baris(nama, o)); }
function tambahBanyak(nama, list) {
  if (!list.length) return;
  var sh = tab(nama);
  sh.getRange(sh.getLastRow() + 1, 1, list.length, SKEMA[nama].length).setValues(list.map(function (o) { return baris(nama, o); }));
}
function kemas(nama, r, o) { tab(nama).getRange(r, 1, 1, SKEMA[nama].length).setValues([baris(nama, o)]); }
function tulisSemula(nama, list) {
  var sh = tab(nama), n = sh.getLastRow(), w = SKEMA[nama].length;
  if (n > 1) sh.getRange(2, 1, n - 1, w).clearContent();
  if (list.length) sh.getRange(2, 1, list.length, w).setValues(list.map(function (o) { return baris(nama, o); }));
}
function log(oleh, tindakan, sasaran, butiran) {
  tambah('LOG', {masa: sekarang(), oleh: oleh, tindakan: tindakan, sasaran: sasaran || '', butiran: JSON.stringify(butiran || {})});
}

/* ================================ UTILITI ================================ */
function jawab(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function gagal(kod, mesej) { var e = new Error(mesej); e.kod = kod; throw e; }
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function ujian() { return prop('TEST_MODE') === '1'; }
function kunci() { var l = LockService.getScriptLock(); if (!l.tryLock(20000)) gagal('SIBUK', 'Sistem sedang sibuk. Cuba lagi sebentar.'); return l; }
function lc(s) { return String(s || '').trim().toLowerCase(); }
function emelSah(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '')); }
function teks(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function selamat(v) { v = v === null || v === undefined ? '' : String(v); return /^[=+@]/.test(v) ? "'" + v : v; }
function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
function topeng(emel) { var p = emel.split('@'), n = p[0]; return (n.length <= 2 ? n.charAt(0) : n.slice(0, 2)) + '*****@' + p[1]; }
function kodRawak() { var h = Utilities.getUuid().replace(/-/g, '').slice(0, 12); return String(100000 + (parseInt(h, 16) % 900000)); }
function idBaru() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function garam() {
  var g = prop('GARAM');
  if (!g) { g = Utilities.getUuid() + Utilities.getUuid(); PropertiesService.getScriptProperties().setProperty('GARAM', g); }
  return g;
}
function hashK(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, garam() + '|' + s, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(b).replace(/=+$/, '');
}
function pad2(n) { return ('0' + Number(n)).slice(-2); }
function hariIni() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
function sekarang() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function isoKini() { return new Date().toISOString(); }
function tarikhSah(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function tambahHari(s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function hariMinggu(s) { return new Date(s + 'T00:00:00Z').getUTCDay(); }
function bezaHari(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }
