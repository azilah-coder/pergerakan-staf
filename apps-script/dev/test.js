/* Ujian automatik jambatan Pergerakan Staf.  Jalankan:  node apps-script/dev/test.js
   Semua data rekaan (dalam memori) — tiada akaun sebenar digunakan untuk log masuk. */
'use strict';
const assert = require('assert');
const {createEnv, maklumatStaf, tabBulanan} = require('./harness');

const STAF = [
  {nama: 'NUR FARIZAH BINTI HAZAIN', emel: 'farizahhazain@pbu.edu.my', jawatan: 'PEMBANTU OPERASI', gred: 'H 1'},
  {nama: 'ALI BIN ABU', emel: 'ali@pbu.edu.my', jawatan: 'PENSYARAH', gred: 'DH9'},
  {nama: 'CHE SITI BINTI DAUD', emel: 'Siti@PBU.edu.my', jawatan: 'KETUA PROGRAM', gred: 'DH12'},
  {nama: 'DEVI A/P RAMU', emel: 'devi@pbu.edu.my', jawatan: 'PENSYARAH KANAN', gred: 'DH10'},
  {nama: 'TAK SAH', emel: 'bukan-emel', jawatan: 'PENSYARAH'},
  {nama: 'ALI PENDUA', emel: 'ali@pbu.edu.my', jawatan: 'PENSYARAH'}
];
const SAH = STAF.slice(0, 4).map(s => Object.assign({}, s, {emel: s.emel.toLowerCase()}));

let lulus = 0, gagal = 0;
function t(nama, fn) { try { fn(); lulus++; console.log('  ✓ ' + nama); } catch (e) { gagal++; console.log('  ✗ ' + nama + '\n      ' + (e && e.message)); } }
const ok = r => { assert.ok(r.ok, 'dijangka ok tetapi: ' + JSON.stringify(r)); return r; };
const err = (r, kod) => { assert.ok(!r.ok, 'dijangka gagal tetapi ok'); if (kod) assert.strictEqual(r.kod, kod, r.ralat); return r; };

function baru(o = {}) {
  const env = createEnv(Object.assign({stafRows: maklumatStaf(STAF), tabs: {NOV2026: tabBulanan(SAH, '2026-11-13', '2026-11-30')}, quietErrors: true}, o));
  env.setNow(o.now || '2026-11-17T09:00:00+08:00');   // Selasa
  env.setup();
  return env;
}
function login(env, emel) {
  ok(env.call('mintaOtp', {emel}));
  const kod = env.mails[env.mails.length - 1].subject.slice(0, 6);
  return ok(env.call('sahOtp', {emel, kod})).token;
}
const sel = (p, emel, d) => p.sel[emel][p.hari.findIndex(h => h.t === d)];
/* Sel tab bulanan: baris staf (1-based dalam tab) & tarikh dd/MM/yyyy. */
function selTab(env, tab, emel, ddmm) {
  const rows = env.tabRows(tab), col = rows[1].indexOf(ddmm), row = rows.findIndex(r => r[2] === emel);
  assert.ok(col >= 3 && row >= 2, 'sel tiada: ' + tab + ' ' + emel + ' ' + ddmm);
  return {teks: rows[row][col], warna: env.tabBg(tab, row + 1, col + 1)};
}

console.log('Ujian jambatan Papan Pergerakan Staf');
const env = baru();

t('setup: data sistem, pencetus harian & tab bulan semasa disegerak', () => {
  const s = env.state.books[env.state.props.DB_ID].sheets;
  ['REKOD', 'CUTI_UMUM', 'TETAPAN', 'JENIS_STATUS', 'NAMA_PAPARAN', 'SESI', 'OTP', 'LOG'].forEach(n => assert.ok(s[n], 'tab ' + n));
  assert.strictEqual(env.triggers.length, 1); assert.strictEqual(env.triggers[0].getHandlerFunction(), 'harian');
  env.setup(); assert.strictEqual(env.triggers.length, 1, 'pencetus tidak berganda');
  assert.strictEqual(selTab(env, 'NOV2026', 'ali@pbu.edu.my', '17/11/2026').teks, 'HBH');
  assert.strictEqual(selTab(env, 'NOV2026', 'ali@pbu.edu.my', '18/11/2026').teks, 'PEJABAT');
});

t('Maklumat Staff: lajur ikut tajuk; buang emel tak sah & pendua; susunan sheet dikekalkan', () => {
  const biasa = x => JSON.parse(JSON.stringify(x));   // tatasusunan dari konteks VM → tatasusunan biasa
  assert.deepStrictEqual(biasa(env.ctx.senaraiStaf().map(s => s.emel)), SAH.map(s => s.emel));
  const e2 = createEnv({stafRows: [['JAWATAN', 'EMEL', 'X', 'NAMA'], ['PENSYARAH', 'a@pbu.edu.my', '1', 'AMIN']], quietErrors: true}); e2.setup();
  assert.deepStrictEqual(biasa(e2.ctx.senaraiStaf().map(s => [s.nama, s.emel, s.jawatan])), [['AMIN', 'a@pbu.edu.my', 'PENSYARAH']]);
});

t('tab tanpa lajur NAMA/EMEL memberi ralat jelas', () => {
  const e2 = createEnv({stafRows: [['A', 'B'], ['x', 'y']], quietErrors: true});
  assert.throws(() => e2.ctx.bacaDataStaf(), /NAMA dan EMEL/);
});

t('OTP: emel bukan staf ditolak; kod salah dikira; kod betul beri token', () => {
  err(env.call('mintaOtp', {emel: 'orang@luar.com'}), 'TIADA');
  ok(env.call('mintaOtp', {emel: 'ALI@pbu.edu.my '}));
  const m = env.mails[env.mails.length - 1], kod = m.subject.slice(0, 6);
  assert.strictEqual(m.to, 'ali@pbu.edu.my'); assert.ok(m.htmlBody.includes(kod));
  assert.match(err(env.call('sahOtp', {emel: 'ali@pbu.edu.my', kod: kod === '111111' ? '222222' : '111111'}), 'OTP').ralat, /Baki 4/);
  assert.ok(ok(env.call('sahOtp', {emel: 'ali@pbu.edu.my', kod})).token.length >= 64);
  err(env.call('sahOtp', {emel: 'ali@pbu.edu.my', kod}), 'OTP');
});

t('OTP: had permintaan, tamat tempoh & kuota emel', () => {
  const e2 = baru();
  for (let i = 0; i < 3; i++) ok(e2.call('mintaOtp', {emel: 'devi@pbu.edu.my'}));
  err(e2.call('mintaOtp', {emel: 'devi@pbu.edu.my'}), 'HAD');
  e2.setNow('2026-11-17T09:20:00+08:00');
  err(e2.call('sahOtp', {emel: 'devi@pbu.edu.my', kod: e2.mails[2].subject.slice(0, 6)}), 'OTP');
  err(baru({mailQuota: 0}).call('mintaOtp', {emel: 'devi@pbu.edu.my'}), 'EMEL');
});

const ALI = login(env, 'ali@pbu.edu.my'), FAR = login(env, 'farizahhazain@pbu.edu.my'), SITI = login(env, 'siti@pbu.edu.my');

t('peranan: Farizah admin, staf lain bukan; KP di atas; token salah ditolak', () => {
  assert.strictEqual(ok(env.call('saya', {token: FAR})).admin, true);
  const a = ok(env.call('saya', {token: ALI}));
  assert.strictEqual(a.admin, false); assert.strictEqual(a.staf[0].jawatan, 'KETUA PROGRAM');
  assert.ok(/1BPcd62G/.test(a.sheetUrl));
  err(env.call('saya', {token: 'x'.repeat(64)}), 'AUTH');
});

t('corak lalai & cuti umum pada papan', () => {
  const p = ok(env.call('papan', {token: ALI, dari: '2026-11-16', hingga: '2026-11-22'}));
  assert.deepStrictEqual(p.sel['ali@pbu.edu.my'].map(c => c.a.k), ['PEJABAT', 'HBH', 'PEJABAT', 'HBH', 'PEJABAT', 'HUJUNG', 'HUJUNG']);
  assert.strictEqual(sel(ok(env.call('papan', {token: ALI, dari: '2026-12-25'})), 'ali@pbu.edu.my', '2026-12-25').a.k, 'CUTI_UMUM');
});

t('simpan → tab NOV2026 dikemas kini (hadir pada hari HBH)', () => {
  const r = ok(env.call('simpan', {token: ALI, rekod: {mula: '2026-11-17', kod: 'HADIR_HBH'}}));
  assert.deepStrictEqual(r.tab, ['NOV2026']); assert.ok(!r.amaran);
  const c = selTab(env, 'NOV2026', 'ali@pbu.edu.my', '17/11/2026');
  assert.strictEqual(c.teks, 'PEJABAT'); assert.strictEqual(c.warna, '#dcfce7');
  assert.strictEqual(selTab(env, 'NOV2026', 'siti@pbu.edu.my', '17/11/2026').teks, 'HBH');
});

t('tab bulanan: hujung minggu kosong (kelabu), kursus dengan lokasi, julat merentas minggu', () => {
  ok(env.call('simpan', {token: ALI, rekod: {mula: '2026-11-20', tamat: '2026-11-23', kod: 'KURSUS', lokasi: 'Ipoh'}}));
  assert.strictEqual(selTab(env, 'NOV2026', 'ali@pbu.edu.my', '20/11/2026').teks, 'KURSUS – Ipoh');
  assert.strictEqual(selTab(env, 'NOV2026', 'ali@pbu.edu.my', '20/11/2026').warna, '#ffedd5');
  const s = selTab(env, 'NOV2026', 'ali@pbu.edu.my', '21/11/2026');
  assert.strictEqual(s.teks, ''); assert.strictEqual(s.warna, '#e2e8f0');
  assert.strictEqual(selTab(env, 'NOV2026', 'ali@pbu.edu.my', '23/11/2026').teks, 'KURSUS – Ipoh');
});

t('privasi: jenis cuti disorok di papan staf lain DAN dalam tab bulanan', () => {
  ok(env.call('simpan', {token: SITI, rekod: {mula: '2026-11-19', kod: 'CS', catatan: 'demam', lokasi: 'rumah'}}));
  assert.deepStrictEqual(sel(ok(env.call('papan', {token: ALI, dari: '2026-11-19'})), 'siti@pbu.edu.my', '2026-11-19').a, {k: 'CUTI', s: 'r'});
  assert.strictEqual(sel(ok(env.call('papan', {token: FAR, dari: '2026-11-19'})), 'siti@pbu.edu.my', '2026-11-19').a.cat, 'demam');
  const c = selTab(env, 'NOV2026', 'siti@pbu.edu.my', '19/11/2026');
  assert.strictEqual(c.teks, 'CUTI'); assert.strictEqual(c.warna, '#fee2e2');
  assert.ok(!JSON.stringify(env.tabRows('NOV2026')).includes('demam'));
});

t('separuh hari & keluar sekejap ditulis ringkas', () => {
  ok(env.call('simpan', {token: ALI, rekod: {mula: '2026-11-25', kod: 'CR', sesi: 'PAGI'}}));
  assert.strictEqual(selTab(env, 'NOV2026', 'ali@pbu.edu.my', '25/11/2026').teks, 'PEJABAT / CUTI (PAGI)');
  ok(env.call('simpan', {token: ALI, rekod: {mula: '2026-11-26', kod: 'KELUAR', sesi: 'MASA', masa_dari: '10:00', masa_hingga: '11:30', lokasi: 'Bank'}}));
  assert.strictEqual(selTab(env, 'NOV2026', 'ali@pbu.edu.my', '26/11/2026').teks, 'HBH / KELUAR (10:00–11:30) – Bank');
});

t('rekod Disember → tab DIS2026 dicipta (1–31 Dis, tajuk tarikh, staf ikut Maklumat Staff)', () => {
  assert.strictEqual(env.tabRows('DIS2026'), null);
  const r = ok(env.call('simpan', {token: FAR, rekod: {emels: ['ali@pbu.edu.my', 'devi@pbu.edu.my'], mula: '2026-12-01', tamat: '2026-12-02', kod: 'BENGKEL', lokasi: 'Langkawi'}}));
  assert.deepStrictEqual(r.tab, ['DIS2026']);
  const rows = env.tabRows('DIS2026');
  assert.deepStrictEqual(rows[0].slice(0, 3), ['', 'NAMA', 'EMEL']);
  assert.strictEqual(rows[1][3], '01/12/2026'); assert.strictEqual(rows[1][33], '31/12/2026');
  assert.deepStrictEqual(rows.slice(2).map(x => x[2]), SAH.map(s => s.emel));
  assert.strictEqual(selTab(env, 'DIS2026', 'devi@pbu.edu.my', '01/12/2026').teks, 'BENGKEL – Langkawi');
  assert.strictEqual(selTab(env, 'DIS2026', 'ali@pbu.edu.my', '25/12/2026').teks, 'CUTI UMUM');
  assert.strictEqual(selTab(env, 'DIS2026', 'ali@pbu.edu.my', '25/12/2026').warna, '#ede9fe');
});

t('tab NOV2026 sedia ada: lajur tarikh asal (13–30 Nov) dikekalkan', () => {
  const rows = env.tabRows('NOV2026');
  assert.strictEqual(rows[1][3], '13/11/2026'); assert.strictEqual(rows[1].filter(Boolean).length, 18);
});

t('batal → tab dikemas kini semula; rekod lepas tidak mencipta tab bulan lepas', () => {
  const id = ok(env.call('papan', {token: ALI})).rekodSaya.find(r => r.kod === 'HADIR_HBH').id;
  ok(env.call('batal', {token: ALI, id}));
  assert.strictEqual(selTab(env, 'NOV2026', 'ali@pbu.edu.my', '17/11/2026').teks, 'HBH');
  ok(env.call('simpan', {token: FAR, rekod: {emel: 'ali@pbu.edu.my', mula: '2026-10-20', kod: 'CR'}}));
  assert.strictEqual(env.tabRows('OKT2026'), null);
});

t('staf tidak boleh ubah orang lain / tarikh lepas; admin boleh', () => {
  err(env.call('simpan', {token: ALI, rekod: {emel: 'siti@pbu.edu.my', mula: '2026-11-18', kod: 'CR'}}), 'FORBIDDEN');
  err(env.call('simpan', {token: ALI, rekod: {emels: ['siti@pbu.edu.my'], mula: '2026-11-18', kod: 'CR'}}), 'FORBIDDEN');
  err(env.call('simpan', {token: ALI, rekod: {mula: '2026-11-16', kod: 'CR'}}), 'LEPAS');
  ok(env.call('simpan', {token: FAR, rekod: {emel: 'siti@pbu.edu.my', mula: '2026-11-16', kod: 'MESYUARAT_LUAR'}}));
  ['admRekod', 'admCuti', 'admTetapan', 'admLog', 'admSegerak'].forEach(a => err(env.call(a, {token: ALI}), 'FORBIDDEN'));
});

t('admin ubah corak & cuti peristiwa → tab bulanan ikut berubah', () => {
  ok(env.call('admTetapanSimpan', {token: FAR, admin: ['farizahhazain@pbu.edu.my'], corak: ['PEJABAT', 'PEJABAT', 'PEJABAT', 'PEJABAT', 'PEJABAT']}));
  assert.strictEqual(selTab(env, 'NOV2026', 'devi@pbu.edu.my', '24/11/2026').teks, 'PEJABAT');
  ok(env.call('admTetapanSimpan', {token: FAR, admin: ['farizahhazain@pbu.edu.my'], corak: ['PEJABAT', 'HBH', 'PEJABAT', 'HBH', 'PEJABAT']}));
  ok(env.call('admCutiSimpan', {token: FAR, tarikh: '2026-11-27', nama: 'Cuti Peristiwa', skop: 'Cuti Peristiwa', disahkan: true}));
  assert.strictEqual(selTab(env, 'NOV2026', 'devi@pbu.edu.my', '27/11/2026').teks, 'CUTI UMUM');
  ok(env.call('admCutiPadam', {token: FAR, tarikh: '2026-11-27'}));
  assert.strictEqual(selTab(env, 'NOV2026', 'devi@pbu.edu.my', '27/11/2026').teks, 'PEJABAT');
});

t('tiada akses edit pada sheet: status tetap disimpan + amaran', () => {
  const e2 = baru(); const tok = login(e2, 'devi@pbu.edu.my');
  e2.setOpt('stafReadOnly', true);
  const r = ok(e2.call('simpan', {token: tok, rekod: {mula: '2026-11-18', kod: 'CR'}}));
  assert.match(r.amaran, /akses edit/);
  assert.strictEqual(sel(ok(e2.call('papan', {token: tok, dari: '2026-11-18'})), 'devi@pbu.edu.my', '2026-11-18').a.k, 'CR');
});

t('harian: cipta tab bulan depan mulai 25 hb; akaun ujian tidak masuk tab', () => {
  const e2 = baru({now: '2026-11-26T06:00:00+08:00'});
  e2.setProp('TEST_MODE', '1'); e2.clearCache();
  e2.ctx.harian();
  assert.ok(e2.tabRows('DIS2026'), 'DIS2026 dicipta');
  assert.ok(!JSON.stringify(e2.tabRows('NOV2026')).includes('eboard.test'));
});

t('admin segerak manual', () => {
  assert.ok(ok(env.call('admSegerak', {token: FAR})).tab.includes('NOV2026'));
});

t('sandaran gviz bila tiada akses terus ke Maklumat Staff', () => {
  const csv = '"","NAMA","GRED","EMEL","KELAYAKAN PROFESIONAL ","JAWATAN"\n"1","ALI BIN ABU","DH9","ali@pbu.edu.my","","PENSYARAH"\n';
  const e2 = createEnv({stafFail: true, stafCsv: csv, quietErrors: true});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(e2.ctx.bacaDataStaf().map(s => s.emel))), ['ali@pbu.edu.my']);
});

t('mod ujian: akaun ujian dapat kod terus (tiada emel)', () => {
  env.setProp('TEST_MODE', '1'); env.clearCache();
  const n = env.mails.length, r = ok(env.call('mintaOtp', {emel: 'ujian.admin@eboard.test'}));
  assert.ok(/^\d{6}$/.test(r.devOtp)); assert.strictEqual(env.mails.length, n);
  assert.strictEqual(ok(env.call('saya', {token: ok(env.call('sahOtp', {emel: 'ujian.admin@eboard.test', kod: r.devOtp})).token})).admin, true);
  env.setProp('TEST_MODE', null); env.clearCache();
});

t('log keluar membatalkan token', () => {
  const tok = login(env, 'devi@pbu.edu.my');
  ok(env.call('logKeluar', {token: tok})); err(env.call('saya', {token: tok}), 'AUTH');
});

console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
