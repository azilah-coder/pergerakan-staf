/* =====================================================================
   PAPAN PERGERAKAN STAF JTMK — app (GitHub Pages)
   Ganti papan putih: siapa ADA di pejabat, HBH atau TIADA hari ini.
   Backend: jambatan Google Apps Script (apps-script/Code.gs) — URL /exec dalam config.js.
   Log masuk: emel + kod OTP (tiada kata laluan).
   ===================================================================== */
(function () {
'use strict';

const LOKAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const API = (() => {
  let o = null; try { o = localStorage.getItem('pg-api'); } catch (e) {}
  if (o) return o;                                                     // ganti sementara (ujian)
  if (LOKAL) return 'http://localhost:8787/exec';                      // pelayan ujian: node apps-script/dev/server.js
  return String(window.PERGERAKAN_API || '').trim();                   // config.js
})();
const ADA = () => !!API;
const DEV = LOKAL && /localhost:8787/.test(API);

const GRP = {
  ADA: {l: 'Ada', p: 'Di pejabat / kampus', c: '#16a34a', ic: 'building'},
  HBH: {l: 'HBH', p: 'Bekerja hibrid', c: '#2563eb', ic: 'home'},
  TIADA: {l: 'Tiada', p: 'Luar pejabat / cuti', c: '#dc2626', ic: 'plane'},
  LAIN: {l: 'Cuti umum / hujung minggu', p: '', c: '#7c3aed', ic: 'flag'}
};
const PENDEK = {PEJABAT: 'Pejabat', HADIR_HBH: 'Hadir', KAMPUS: 'Kampus', HBH: 'HBH', KURSUS: 'Kursus', BENGKEL: 'Bengkel',
  SEMINAR: 'Seminar', MESYUARAT_LUAR: 'Mesyuarat', PENYELIAAN_LI: 'Selia LI', LAWATAN: 'Lawatan', PERTANDINGAN: 'Pertandingan',
  URUSAN_RASMI: 'Urusan', CR: 'CR', CS: 'CS', CUTI: 'Cuti', CUTI_UMUM: 'Cuti umum', HUJUNG: '—', KELUAR: 'Keluar',
  CUTI_KECEMASAN: 'Kecemasan', CUTI_BERSALIN: 'Bersalin', CUTI_ISTERI_BERSALIN: 'Paterniti', CUTI_HAJI: 'Haji',
  CUTI_TANPA_REKOD: 'CTR', CUTI_BELAJAR: 'Belajar', CUTI_LAIN: 'Cuti'};

const S = {
  init: false, token: null, emelLogin: '', step: 'emel', mask: '', devOtp: '', busy: false, msg: '',
  boot: null, J: {}, staf: [], today: null, tarikh: null,
  mem: {}, rekodSaya: [], loading: false, err: null, offline: 0,
  tapis: 'SEMUA', trek: '', cari: '', susun: 'status',
  adm: {tab: 'rekod', d: {}, dari: null, hingga: null, emel: ''}
};
let SUB = '';

/* ---------- utiliti ---------- */
const g = (k, d) => (typeof store !== 'undefined' ? store.get(k, d) : d);
const s = (k, v) => { if (typeof store !== 'undefined') store.set(k, v); };
const rm = k => { try { localStorage.removeItem(k); } catch (e) {} };
const pad = n => String(n).padStart(2, '0');
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
const isnin = iso => addDays(iso, -((dow(iso) + 6) % 7));
const tglP = iso => { const d = new Date(iso + 'T00:00:00Z'); return HARI[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BLN[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const tglS = iso => { const d = new Date(iso + 'T00:00:00Z'); return d.getUTCDate() + ' ' + BLN[d.getUTCMonth()]; };
const localISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const tc = x => String(x || '').toLowerCase().replace(/(^|[\s(\/-])\S/g, c => c.toUpperCase());
const hm = () => { const n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()); };
const key = (a, b) => a + '_' + (b || a);
const root = () => document.getElementById('kbRoot');

function namaPendek(st) {
  if (!st) return '';
  if (st.papar) return st.papar;
  let n = String(st.nama).replace(/\s+/g, ' ').trim().split(/\s+(?:BIN|BINTI|BT\.?|B\.|A\/L|A\/P|ANAK)\s+/i)[0];
  const w = n.split(' ');
  return tc(w.slice(0, w.length > 3 ? 2 : 3).join(' '));
}
function inisial(st) {
  const w = namaPendek(st).replace(/\b(Ts|Dr|Hj|Hjh|Pn|En|Cik|Prof)\.?\s+/gi, '').split(/\s+/).filter(Boolean);
  return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
}
const AVC = ['#5b3fd1', '#0e7490', '#b45309', '#be185d', '#047857', '#4338ca', '#9333ea', '#0369a1'];
const avColor = e => { let h = 0; for (const c of e) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVC[h % AVC.length]; };
const trekL = t => /PERISIAN/i.test(t) ? 'Perisian & Aplikasi' : /RANGKAIAN/i.test(t) ? 'Rangkaian' : 'Bukan akademik';
const J = k => S.J[k] || {kod: k, label: k || '—', kumpulan: 'TIADA', warna: '#64748b', ikon: 'info'};
const pendek = k => PENDEK[k] || String(J(k).label).split(/\s[(/–-]/)[0];
const grpOf = k => { const x = J(k).kumpulan; return GRP[x] ? x : 'LAIN'; };
const sesiL = u => u.ses === 'MASA' ? u.md + '–' + u.mh : u.ses === 'PAGI' ? 'Pagi' : u.ses === 'PETANG' ? 'Petang' : '';
const stafBy = e => S.staf.find(x => x.emel === e);
const boleh = e => S.boot && (S.boot.admin || e === S.boot.saya.emel);

/* Status yang dipaparkan bagi satu sel pada tarikh t (ambil kira separuh hari & masa sekarang). */
function papar(cell, t) {
  let u = cell.a, nota = '';
  if (cell.p) {
    const p = cell.p;
    const aktif = t !== S.today ? true : p.ses === 'PAGI' ? hm() < '13:00' : p.ses === 'PETANG' ? hm() >= '13:00' : p.ses === 'MASA' ? (hm() >= p.md && hm() < p.mh) : true;
    if (aktif) { u = p; nota = (p.ses === 'PAGI' ? 'Petang' : p.ses === 'PETANG' ? 'Pagi' : 'Selain itu') + ': ' + J(cell.a.k).label; }
    else nota = sesiL(p) + ': ' + J(p.k).label + (p.lok ? ' (' + p.lok + ')' : '');
  }
  return {u, j: J(u.k), grp: grpOf(u.k), nota};
}
function butiran(u) {
  const b = [];
  if (sesiL(u)) b.push(sesiL(u));
  if (u.lok) b.push(u.lok);
  if (u.hg) b.push('hingga ' + tglS(u.hg));
  return b.join(' · ');
}

/* ---------- API ---------- */
const ralat = (msg, kod) => { const x = new Error(msg); x.kod = kod; return x; };
/* Panggil jambatan Apps Script: POST text/plain (tiada CORS preflight) — Apps Script membalas JSON. */
async function api(action, data) {
  if (!API) throw ralat('Sistem belum disambung ke pelayan (isi URL /exec dalam config.js).', 'CONFIG');
  let r, j;
  try {
    r = await fetch(API, {method: 'POST', redirect: 'follow', headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(Object.assign({action, token: S.token}, data || {}))});
  } catch (e) { throw ralat(DEV ? 'Pelayan ujian tempatan tidak berjalan (node apps-script/dev/server.js).' : 'Tiada sambungan internet atau pelayan tidak dapat dihubungi.', 'NET'); }
  try { j = await r.json(); } catch (e) { throw ralat('Respons pelayan tidak sah (' + r.status + ').', 'NET'); }
  if (!j || !j.ok) {
    if (j && j.kod === 'AUTH' && S.token) { buangSesi(); S.msg = j.ralat; }
    throw ralat((j && j.ralat) || 'Ralat tidak diketahui.', j && j.kod);
  }
  return j;
}
function buangSesi() {
  S.token = null; S.boot = null; S.mem = {}; S.rekodSaya = []; S.staf = []; S.J = {}; S.adm.d = {};
  rm('pg-token'); rm('kb-cache-boot'); rm('kb-cache-papan');
}

/* ---------- muat data ---------- */
async function pastikanBoot() {
  if (S.boot) return;
  try { setBoot(await api('saya')); s('kb-cache-boot', S.boot); }
  catch (e) {
    const c = e.kod === 'NET' && g('kb-cache-boot', null);
    if (c && c.saya) { setBoot(c); S.offline = S.offline || 1; } else throw e;
  }
}
function setBoot(b) {
  S.boot = b; S.staf = b.staf || []; S.today = b.hariIni || localISO();
  S.J = {};
  (b.jenis || []).forEach(j => { S.J[j.kod] = j; });
  Object.keys(b.sistem || {}).forEach(k => { S.J[k] = b.sistem[k]; });
  if (!S.tarikh) S.tarikh = S.today;
}
async function muatPapan(dari, hingga) {
  const k = key(dari, hingga);
  try {
    const p = await api('papan', {dari, hingga});
    S.mem[k] = {p, at: Date.now()}; S.rekodSaya = p.rekodSaya || []; S.today = p.hariIni;
    if (dari === hingga && dari === p.hariIni) s('kb-cache-papan', {k, p, at: Date.now()});
    S.offline = 0;
  } catch (e) {
    const c = e.kod === 'NET' && g('kb-cache-papan', null);
    if (c && c.k === k) { S.mem[k] = {p: c.p, at: c.at}; S.offline = c.at; return; }
    throw e;
  }
}
function julatSemasa() {
  if (SUB === 'minggu') { const m = isnin(S.tarikh); return [m, addDays(m, 4)]; }
  if (SUB === 'tv' || SUB === 'saya') return [S.today, S.today];
  return [S.tarikh, S.tarikh];
}
async function muat(senyap) {
  if (!ADA() || !S.token) return paint();
  if (!senyap) { S.loading = true; S.err = null; paint(); }
  try {
    await pastikanBoot();
    if (SUB === 'admin' && S.boot.admin) await muatAdmin();
    else { const [a, b] = julatSemasa(); await muatPapan(a, b); }
    S.err = null;
  } catch (e) { S.err = e; }
  S.loading = false;
  paint();
}

/* ---------- lukis ---------- */
function paint() {
  const r = root(); if (!r) return;
  const y = window.scrollY;
  r.innerHTML = dalam();
  window.scrollTo(0, y);
  document.documentElement.classList.toggle('tv-on', SUB === 'tv' && !!S.boot);
}
function dalam() {
  if (!ADA()) return tiadaApi();
  if (!S.token) return logMasuk();
  if (!S.boot) return S.err ? kadRalat(S.err) : '<div class="kb-load"><div class="spin"></div>Memuatkan papan pergerakan…</div>';
  if (SUB === 'tv') return paparTv();
  let h = kepala();
  if (S.offline) h += '<div class="kb-banner warn">' + ic('wifioff') + 'Luar talian — memaparkan data terakhir' + (S.offline > 1 ? ' (dimuat ' + new Date(S.offline).toLocaleTimeString('ms-MY', {hour: '2-digit', minute: '2-digit'}) + ')' : '') + '.</div>';
  if (S.err && S.err.kod !== 'NET') h += '<div class="kb-banner bad">' + ic('alert') + esc(S.err.message) + '</div>';
  if (SUB === 'minggu') h += paparMinggu();
  else if (SUB === 'saya') h += paparSaya();
  else if (SUB === 'admin') h += S.boot.admin ? paparAdmin() : '<div class="kb-empty">' + ic('lock') + 'Halaman ini untuk admin sahaja.</div>';
  else h += paparHari();
  return h;
}
function tiadaApi() {
  return '<div class="kb-login"><div class="kb-lg-card"><span class="kb-lg-ic">' + ic('pin') + '</span><h1>Papan Pergerakan Staf</h1>' +
    '<p>Sistem belum disambungkan ke pelayan.</p><p class="kb-small">Admin: tampal URL <b>/exec</b> Apps Script ke dalam <b>config.js</b>.</p></div></div>';
}
function logMasuk() {
  const kod = S.step === 'kod';
  return '<div class="kb-login"><div class="kb-lg-card">' +
    '<span class="kb-lg-ic">' + ic('pin') + '</span><h1>Papan Pergerakan Staf</h1>' +
    '<p>Siapa ada di pejabat, HBH atau di luar hari ini — khas untuk warga JTMK, Politeknik Balik Pulau.</p>' +
    (S.msg ? '<div class="kb-banner bad">' + ic('alert') + esc(S.msg) + '</div>' : '') +
    (!kod
      ? '<form class="kb-lg-form" data-kbform="emel"><label for="kbEmel">Emel rasmi anda</label>' +
        '<input id="kbEmel" type="email" inputmode="email" autocomplete="email" required placeholder="nama@pbu.edu.my" value="' + esc(S.emelLogin) + '">' +
        '<button class="kb-btn pri big" type="submit"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? '<span class="kb-spin"></span>Menghantar…' : ic('send') + 'Hantar kod ke emel') + '</button>' +
        '<small>' + ic('lock') + 'Tiada kata laluan. Kod 6 digit dihantar ke emel anda. Hanya emel dalam senarai staf JTMK boleh masuk.</small></form>'
      : '<form class="kb-lg-form" data-kbform="kod"><label for="kbKod">Masukkan kod 6 digit</label>' +
        '<p class="kb-small">Kod dihantar ke <b>' + esc(S.mask) + '</b>. Semak peti masuk dan folder Spam.</p>' +
        '<input id="kbKod" class="kb-otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required placeholder="••••••">' +
        '<button class="kb-btn pri big" type="submit"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? '<span class="kb-spin"></span>Menyemak…' : ic('check') + 'Sahkan &amp; masuk') + '</button>' +
        '<div class="kb-lg-links"><button type="button" data-kb="hantarSemula">Hantar semula kod</button><span>·</span><button type="button" data-kb="tukarEmel">Tukar emel</button></div></form>') +
    (S.devOtp ? '<div class="kb-dev">MOD UJIAN · kod: <b>' + esc(S.devOtp) + '</b></div>' : '') +
    (DEV && !kod ? '<div class="kb-dev">Pelayan ujian tempatan · akaun ujian: <b>ujian.admin@eboard.test</b> (admin), <b>ujian.staf@eboard.test</b></div>' : '') +
    '</div></div>';
}
function kadRalat(e) {
  return '<div class="kb-empty">' + ic(e.kod === 'NET' ? 'wifioff' : 'alert') + '<b>' + esc(e.message) + '</b>' +
    '<button class="kb-btn" data-kb="cubaLagi">' + ic('refresh') + 'Cuba lagi</button></div>';
}

function kepala() {
  const me = S.boot.saya, st = stafBy(me.emel) || me;
  const tabs = [['', 'cal', 'Hari'], ['minggu', 'sheet', 'Minggu'], ['saya', 'user', 'Rekod saya']];
  if (S.boot.admin) tabs.push(['admin', 'gear', 'Admin']);
  tabs.push(['tv', 'tv', 'Mod TV']);
  return '<div class="kb-head"><div class="kb-title"><span class="kb-ic">' + ic('pin') + '</span><div><h1>Papan Pergerakan Staf</h1>' +
    '<p>' + esc(namaPendek(st)) + (S.boot.admin ? ' <span class="kb-tag">Admin</span>' : '') + (S.boot.ujian ? ' <span class="kb-tag warn">Mod ujian</span>' : '') +
    ' · <button class="kb-link" data-kb="logKeluar">' + ic('logout') + 'Log keluar</button></p></div></div>' +
    '<nav class="kb-tabs" aria-label="Paparan">' + tabs.map(t => '<button class="kb-tab' + (SUB === t[0] ? ' on' : '') + '" data-kbgo="pergerakan' + (t[0] ? '/' + t[0] : '') + '">' + ic(t[1]) + '<span>' + t[2] + '</span></button>').join('') + '</nav></div>';
}

function bariTarikh(minggu) {
  const t = S.tarikh, [a, b] = julatSemasa();
  const k = S.mem[key(a, b)], hari = k && k.p.hari.find(x => x.t === t);
  const lencana = !minggu && hari ? (hari.jenis === 'CUTI_UMUM' ? '<span class="kb-pill" style="--sc:#7c3aed">' + ic('flag') + esc(hari.cuti) + '</span>'
    : hari.jenis === 'HUJUNG' ? '<span class="kb-pill" style="--sc:#64748b">Hujung minggu</span>'
    : '<span class="kb-pill" style="--sc:' + J(hari.corak).warna + '">' + ic(J(hari.corak).ikon) + 'Hari ' + esc(J(hari.corak).label) + '</span>') : '';
  const label = minggu ? 'Minggu ' + tglS(a) + ' – ' + tglS(b) + ' ' + b.slice(0, 4) : tglP(t);
  const kini = minggu ? isnin(S.today) === a : t === S.today;
  return '<div class="kb-datebar">' +
    '<button class="tbtn" data-kb="geser" data-n="' + (minggu ? -7 : -1) + '" aria-label="Sebelum">' + ic('back') + '</button>' +
    '<div class="kb-date"><b>' + esc(label) + '</b>' + (kini ? '<span class="kb-now">' + (minggu ? 'Minggu ini' : 'Hari ini') + '</span>' : '') + lencana + '</div>' +
    '<button class="tbtn" data-kb="geser" data-n="' + (minggu ? 7 : 1) + '" aria-label="Selepas">' + ic('right') + '</button>' +
    '<div class="kb-dtools">' + (kini ? '' : '<button class="kb-btn" data-kb="kini">' + (minggu ? 'Minggu ini' : 'Hari ini') + '</button>') +
    '<label class="kb-btn kb-pick" title="Pilih tarikh">' + ic('cal') + '<input type="date" data-kbin="tarikh" value="' + t + '" aria-label="Pilih tarikh"></label>' +
    '<button class="kb-btn" data-kb="muatSemula" title="Muat semula">' + (S.loading ? '<span class="kb-spin"></span>' : ic('refresh')) + '</button>' +
    (minggu ? '' : '<button class="kb-btn kb-hide-m" data-kb="cetak" title="Cetak papan">' + ic('printer') + '</button>') + '</div></div>';
}

/* ---------- paparan HARI ---------- */
function senaraiTapis(p) {
  const q = norm(S.cari.trim());
  return S.staf.filter(st => p.sel[st.emel] && (!S.trek || trekL(st.trek) === S.trek) && (!q || norm(st.nama + ' ' + (st.papar || '') + ' ' + st.jawatan).includes(q)));
}
function paparHari() {
  const k = S.mem[key(S.tarikh)];
  let h = bariTarikh(false);
  if (!k) return h + (S.err ? kadRalat(S.err) : rangka());
  const p = k.p, t = S.tarikh, hari = p.hari[0];
  if (hari.jenis !== 'KERJA') h += '<div class="kb-banner info">' + ic(hari.jenis === 'CUTI_UMUM' ? 'flag' : 'moon') +
    (hari.jenis === 'CUTI_UMUM' ? 'Cuti Umum: <b>' + esc(hari.cuti) + '</b>' : 'Hujung minggu') + ' — hanya staf yang ada rekod khas dipaparkan berasingan.</div>';
  h += kadSaya(p, t);
  const list = senaraiTapis(p).map(st => Object.assign({st}, papar(p.sel[st.emel][0], t)));
  const n = {ADA: 0, HBH: 0, TIADA: 0, LAIN: 0}, pecah = {};
  list.forEach(x => { n[x.grp]++; if (x.grp === 'TIADA') { const l = x.j.subkumpulan === 'Cuti' ? 'Cuti' : pendek(x.u.k); pecah[l] = (pecah[l] || 0) + 1; } });
  h += '<div class="kb-sum">' + ['ADA', 'HBH', 'TIADA'].map(gk => '<button class="kb-stat' + (S.tapis === gk ? ' on' : '') + '" style="--sc:' + GRP[gk].c + '" data-kb="tapis" data-v="' + gk + '">' +
      '<span class="kb-stat-ic">' + ic(GRP[gk].ic) + '</span><span><b>' + n[gk] + '</b><small>' + GRP[gk].l + '</small></span></button>').join('') +
    '<div class="kb-pecah">' + (Object.keys(pecah).length ? Object.entries(pecah).sort((a, b) => b[1] - a[1]).map(e => '<span>' + esc(e[0]) + ' <b>' + e[1] + '</b></span>').join('') : '<span>Tiada staf di luar pejabat</span>') + '</div></div>';
  const treks = S.staf.some(st => st.trek) ? [...new Set(S.staf.map(st => trekL(st.trek)))] : [];
  h += '<div class="kb-filters"><div class="kb-search">' + ic('search') + '<input type="search" data-kbin="cari" placeholder="Cari nama staf…" value="' + esc(S.cari) + '" aria-label="Cari nama staf"></div>' +
    (treks.length < 2 ? '' : '<select data-kbin="trek" aria-label="Tapis program"><option value="">Semua program</option>' + treks.map(x => '<option' + (S.trek === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>') +
    '<div class="kb-seg" role="group" aria-label="Susunan"><button class="' + (S.susun === 'status' ? 'on' : '') + '" data-kb="susun" data-v="status">' + ic('layers') + 'Ikut status</button>' +
    '<button class="' + (S.susun === 'nama' ? 'on' : '') + '" data-kb="susun" data-v="nama">' + ic('grid') + 'A–Z</button></div>' +
    (S.tapis !== 'SEMUA' ? '<button class="kb-btn" data-kb="tapis" data-v="SEMUA">' + ic('x') + 'Semua status</button>' : '') + '</div>';
  const tunjuk = list.filter(x => S.tapis === 'SEMUA' || x.grp === S.tapis);
  if (!tunjuk.length) return h + '<div class="kb-empty">' + ic('users') + 'Tiada staf sepadan.</div>';
  if (S.susun === 'nama') return h + '<div class="kb-grid">' + tunjuk.map(x => kad(x, t)).join('') + '</div>' + nota(p);
  const kol = ['ADA', 'HBH', 'TIADA', 'LAIN'].filter(gk => (S.tapis === 'SEMUA' || S.tapis === gk) && (gk !== 'LAIN' || n.LAIN));
  return h + '<div class="kb-cols c' + kol.length + '">' + kol.map(gk => {
    const xs = tunjuk.filter(x => x.grp === gk);
    return '<details class="kb-col" open style="--gc:' + GRP[gk].c + '"><summary><span class="kb-col-ic">' + ic(GRP[gk].ic) + '</span><b>' + GRP[gk].l + '</b><span class="kb-col-n">' + xs.length + '</span>' + ic('chev').replace('class="ic"', 'class="ic kb-chev"') + '</summary>' +
      '<div class="kb-col-b">' + (xs.length ? xs.map(x => kad(x, t)).join('') : '<div class="kb-col-e">Tiada</div>') + '</div></details>';
  }).join('') + '</div>' + nota(p);
}
function nota(p) {
  return '<p class="kb-foot">' + ic('info') + 'Status lalai: Isnin, Rabu, Jumaat di pejabat · Selasa, Khamis HBH. Dikemas kini ' + esc((p.masa || '').slice(11, 16)) + ' · muat semula automatik setiap minit.</p>';
}
function kad(x, t) {
  const st = x.st, me = st.emel === S.boot.saya.emel, klik = boleh(st.emel) && t >= (S.boot.admin ? '0000' : S.today);
  const b = butiran(x.u);
  return '<div class="kb-card' + (me ? ' me' : '') + (klik ? ' clk' : '') + '" style="--sc:' + x.j.warna + '"' + (klik ? ' role="button" tabindex="0" data-kb="kad" data-emel="' + esc(st.emel) + '" data-t="' + t + '"' : '') + '>' +
    '<span class="kb-av" style="background:' + avColor(st.emel) + '">' + esc(inisial(st)) + '</span>' +
    '<div class="kb-cm"><b title="' + esc(tc(st.nama)) + '">' + esc(namaPendek(st)) + (me ? '<span class="kb-anda">Anda</span>' : '') + '</b>' +
    '<span class="kb-jw">' + esc(tc(st.jawatan)) + '</span>' +
    '<span class="kb-st">' + ic(x.j.ikon) + esc(x.j.label) + '</span>' +
    (b ? '<span class="kb-dt">' + esc(b) + '</span>' : '') +
    (x.nota ? '<span class="kb-nota">' + esc(x.nota) + '</span>' : '') +
    (x.u.cat ? '<span class="kb-cat">“' + esc(x.u.cat) + '”</span>' : '') +
    (x.u.olh && me ? '<span class="kb-olh">' + ic('shield') + 'Ditetapkan admin</span>' : '') +
    '</div>' + (klik ? '<span class="kb-edit">' + ic('edit') + '</span>' : '') + '</div>';
}
function rangka() {
  return '<div class="kb-grid">' + Array.from({length: 9}, () => '<div class="kb-card sk"><span class="kb-av"></span><div class="kb-cm"><i></i><i></i><i></i></div></div>').join('') + '</div>';
}
function kadSaya(p, t) {
  const me = S.boot.saya.emel, cell = p.sel[me];
  if (!cell) return '';
  const x = papar(cell[0], t), hari = p.hari[0], lepas = t < S.today, kini = t === S.today;
  const ownId = (cell[0].p && cell[0].p.id) || cell[0].a.id;
  const bil = kini ? 'hari ini' : 'pada ' + tglS(t);
  let act = '';
  if (lepas) act = '<span class="kb-small">' + ic('lock') + 'Tarikh sudah lepas — hubungi admin untuk pembetulan.</span>';
  else {
    if (hari.jenis === 'KERJA' && cell[0].a.s === 'c' && J(cell[0].a.k).kumpulan === 'HBH') act += '<button class="kb-btn pri" data-kb="hadir">' + ic('building') + 'Saya ke pejabat ' + bil + '</button>';
    act += '<button class="kb-btn" data-kb="borang" data-g="TIADA">' + ic('plane') + 'Saya tiada ' + bil + '…</button>';
    act += '<button class="kb-btn" data-kb="borang">' + ic('plus') + 'Kemas kini lain</button>';
    if (ownId) act += '<button class="kb-btn ghost" data-kb="ubah" data-id="' + esc(ownId) + '">' + ic('edit') + 'Ubah</button><button class="kb-btn ghost bad" data-kb="batal" data-id="' + esc(ownId) + '">' + ic('trash') + 'Batal</button>';
  }
  const b = butiran(x.u);
  return '<section class="kb-me" style="--sc:' + x.j.warna + '"><div class="kb-me-l"><span class="kb-me-ic">' + ic(x.j.ikon) + '</span><div>' +
    '<small>Status anda ' + (kini ? 'hari ini' : esc(tglS(t))) + '</small><b>' + esc(x.j.label) + '</b>' +
    (b ? '<span>' + esc(b) + '</span>' : '') + (x.nota ? '<span>' + esc(x.nota) + '</span>' : '') +
    (x.u.s === 'c' ? '<span class="kb-small">Mengikut corak mingguan</span>' : '') + '</div></div>' +
    '<div class="kb-me-act">' + act + '</div></section>';
}

/* ---------- paparan MINGGU ---------- */
function paparMinggu() {
  const [a, b] = julatSemasa(), k = S.mem[key(a, b)];
  let h = bariTarikh(true);
  if (!k) return h + (S.err ? kadRalat(S.err) : '<div class="kb-load"><div class="spin"></div>Memuatkan minggu…</div>');
  const p = k.p, list = senaraiTapis(p);
  const kira = p.hari.map((d, i) => { const n = {ADA: 0, HBH: 0, TIADA: 0}; list.forEach(st => { const g0 = papar(p.sel[st.emel][i], d.t).grp; if (n[g0] !== undefined) n[g0]++; }); return n; });
  h += '<div class="kb-filters"><div class="kb-search">' + ic('search') + '<input type="search" data-kbin="cari" placeholder="Cari nama staf…" value="' + esc(S.cari) + '" aria-label="Cari nama staf"></div>' +
    '<div class="kb-legend">' + ['ADA', 'HBH', 'TIADA'].map(gk => '<span><i style="background:' + GRP[gk].c + '"></i>' + GRP[gk].l + '</span>').join('') + '<span><i style="background:#7c3aed"></i>Cuti umum</span></div></div>';
  h += '<div class="kb-week-wrap"><table class="kb-week"><thead><tr><th class="kb-wn">Staf (' + list.length + ')</th>' +
    p.hari.map(d => '<th class="' + (d.t === S.today ? 'tdy' : '') + '"><span>' + HARI[d.dow].slice(0, 3) + '</span><b>' + tglS(d.t) + '</b>' +
      (d.jenis === 'CUTI_UMUM' ? '<em title="' + esc(d.cuti) + '">' + esc(d.cuti) + '</em>' : d.jenis === 'KERJA' ? '<em>' + esc(J(d.corak).label) + '</em>' : '') + '</th>').join('') + '</tr>' +
    '<tr class="kb-wsum"><th class="kb-wn">Ada · HBH · Tiada</th>' + kira.map(n => '<td><span style="color:' + GRP.ADA.c + '">' + n.ADA + '</span> · <span style="color:' + GRP.HBH.c + '">' + n.HBH + '</span> · <span style="color:' + GRP.TIADA.c + '">' + n.TIADA + '</span></td>').join('') + '</tr></thead><tbody>' +
    list.map(st => '<tr' + (st.emel === S.boot.saya.emel ? ' class="me"' : '') + '><th class="kb-wn"><span class="kb-av sm" style="background:' + avColor(st.emel) + '">' + esc(inisial(st)) + '</span><span title="' + esc(tc(st.nama)) + '">' + esc(namaPendek(st)) + '</span></th>' +
      p.hari.map((d, i) => {
        const x = papar(p.sel[st.emel][i], d.t), klik = boleh(st.emel) && (S.boot.admin || d.t >= S.today);
        const tip = x.j.label + (butiran(x.u) ? ' · ' + butiran(x.u) : '') + (x.nota ? ' · ' + x.nota : '');
        return '<td><span class="kb-wc' + (klik ? ' clk' : '') + (x.u.s === 'c' ? ' def' : '') + '" style="--sc:' + x.j.warna + '" title="' + esc(tip) + '"' + (klik ? ' role="button" tabindex="0" data-kb="kad" data-emel="' + esc(st.emel) + '" data-t="' + d.t + '"' : '') + '>' +
          ic(x.j.ikon) + esc(pendek(x.u.k)) + (x.u.ses ? '<sup>½</sup>' : '') + (p.sel[st.emel][i].p && x.u === p.sel[st.emel][i].a ? '<sup>+</sup>' : '') + '</span></td>';
      }).join('') + '</tr>').join('') + '</tbody></table></div>' +
    '<p class="kb-foot">' + ic('info') + '½ = separuh hari / ikut masa · + = ada rekod separuh hari · Klik sel anda untuk kemas kini.</p>';
  return h;
}

/* ---------- REKOD SAYA ---------- */
function paparSaya() {
  const list = S.rekodSaya || [];
  let h = '<div class="kb-sec-h"><div><h2>Rekod pergerakan saya</h2><p>Rekod 14 hari lepas hingga akan datang. Hari tanpa rekod mengikut corak mingguan.</p></div>' +
    '<button class="kb-btn pri" data-kb="borang">' + ic('plus') + 'Rekod baharu</button></div>';
  if (!S.mem[key(S.today)] && S.loading) return h + '<div class="kb-load"><div class="spin"></div>Memuatkan…</div>';
  if (!list.length) return h + '<div class="kb-empty">' + ic('cal') + 'Tiada rekod. Anda mengikut corak mingguan (Isnin/Rabu/Jumaat di pejabat, Selasa/Khamis HBH).</div>';
  return h + '<div class="kb-list">' + list.map(r => baris(r, r.tamat >= S.today)).join('') + '</div>';
}
function baris(r, bolehUbah, nama) {
  const j = J(r.kod), tarikh = r.mula === r.tamat ? tglP(r.mula) : tglS(r.mula) + ' – ' + tglP(r.tamat);
  const ses = r.sesi === 'MASA' ? r.masa_dari + '–' + r.masa_hingga : r.sesi === 'PAGI' ? 'Pagi' : r.sesi === 'PETANG' ? 'Petang' : '';
  return '<div class="kb-row" style="--sc:' + j.warna + '"><span class="kb-row-ic">' + ic(j.ikon) + '</span><div class="kb-row-m">' +
    (nama ? '<small>' + esc(nama) + '</small>' : '') + '<b>' + esc(j.label) + (ses ? ' · ' + ses : '') + '</b><span>' + esc(tarikh) + (r.lokasi ? ' · ' + esc(r.lokasi) : '') + '</span>' +
    (r.catatan ? '<em>“' + esc(r.catatan) + '”</em>' : '') + (r.oleh && r.oleh !== r.emel ? '<span class="kb-small">Oleh ' + esc(r.oleh) + '</span>' : '') + '</div>' +
    (bolehUbah ? '<div class="kb-row-a"><button class="kb-btn ghost" data-kb="ubah" data-id="' + esc(r.id) + '" aria-label="Ubah">' + ic('edit') + '<span>Ubah</span></button>' +
      '<button class="kb-btn ghost bad" data-kb="batal" data-id="' + esc(r.id) + '" aria-label="Batal">' + ic('trash') + '<span>Batal</span></button></div>' : '<span class="kb-small">Lepas</span>') + '</div>';
}

/* ---------- MOD TV ---------- */
function paparTv() {
  const k = S.mem[key(S.today)];
  if (!k) return '<div class="kb-tv"><div class="kb-load"><div class="spin"></div>Memuatkan…</div></div>';
  const p = k.p, t = S.today, hari = p.hari[0];
  const list = S.staf.filter(st => p.sel[st.emel]).map(st => Object.assign({st}, papar(p.sel[st.emel][0], t)));
  const kol = ['ADA', 'HBH', 'TIADA'].concat(list.some(x => x.grp === 'LAIN') ? ['LAIN'] : []);
  const lebar = kol.map(gk => 'minmax(clamp(210px,17vw,340px),' + Math.max(list.filter(x => x.grp === gk).length, 8) + 'fr)').join(' ');   // lajur ramai = lebih lebar
  const d = new Date();
  return '<div class="kb-tv"><header><div class="kb-tv-b"><span class="logo">J</span><div><b>eBOARD<span>@</span>JTMK</b><small>Papan Pergerakan Staf</small></div></div>' +
    '<div class="kb-tv-d"><b id="kbTvJam">' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</b><span>' + esc(tglP(t)) + '</span>' +
    (hari.jenis === 'CUTI_UMUM' ? '<em>' + esc(hari.cuti) + '</em>' : hari.jenis === 'KERJA' ? '<em>Hari ' + esc(J(hari.corak).label) + '</em>' : '<em>Hujung minggu</em>') + '</div>' +
    '<div class="kb-tv-x"><button class="kb-btn" data-kb="skrinPenuh">' + ic('maximize') + 'Skrin penuh</button><button class="kb-btn" data-kbgo="pergerakan">' + ic('x') + 'Keluar</button></div></header>' +
    '<div class="kb-tv-cols c' + kol.length + '" style="--tvc:' + lebar + '">' + kol.map(gk => {
      const xs = list.filter(x => x.grp === gk);
      return '<section style="--gc:' + GRP[gk].c + '"><h2>' + ic(GRP[gk].ic) + GRP[gk].l + '<span>' + xs.length + '</span></h2><ul>' +
        xs.map(x => '<li style="--sc:' + x.j.warna + '"><b>' + esc(namaPendek(x.st)) + '</b>' + (gk === 'TIADA' || gk === 'LAIN' || x.u.k !== (gk === 'ADA' ? 'PEJABAT' : 'HBH') || x.nota
          ? '<span>' + esc(x.j.label) + (butiran(x.u) ? ' · ' + esc(butiran(x.u)) : '') + (x.nota ? ' · ' + esc(x.nota) : '') + '</span>' : '') + '</li>').join('') + '</ul></section>';
    }).join('') + '</div><footer>Dikemas kini ' + esc((p.masa || '').slice(11, 16)) + ' · dimuat semula setiap minit' + (S.offline ? ' · LUAR TALIAN' : '') + '</footer></div>';
}

/* ---------- ADMIN ---------- */
const ADM_TABS = [['rekod', 'list', 'Rekod'], ['cuti', 'flag', 'Cuti umum'], ['tetapan', 'gear', 'Tetapan'], ['jenis', 'layers', 'Jenis status'], ['log', 'history', 'Log audit'], ['eksport', 'down', 'Eksport']];
async function muatAdmin() {
  const A = S.adm, t = A.tab;
  if (!A.dari) { A.dari = addDays(S.today, -7); A.hingga = addDays(S.today, 60); }
  if (t === 'rekod') A.d.rekod = (await api('admRekod', {dari: A.dari, hingga: A.hingga, emel: A.emel})).rekod;
  else if (t === 'cuti') A.d.cuti = (await api('admCuti')).cuti;
  else if (t === 'tetapan' || t === 'jenis') { const r = await api('admTetapan'); A.d.tetapan = r; r.jenis.forEach(j => { S.J[j.kod] = j; }); }
  else if (t === 'log') A.d.log = (await api('admLog', {had: 300})).log;
}
function paparAdmin() {
  const A = S.adm;
  let h = '<nav class="kb-subtabs">' + ADM_TABS.map(x => '<button class="' + (A.tab === x[0] ? 'on' : '') + '" data-kb="admTab" data-v="' + x[0] + '">' + ic(x[1]) + x[2] + '</button>').join('') + '</nav>';
  if (S.loading) return h + '<div class="kb-load"><div class="spin"></div>Memuatkan…</div>';
  if (A.tab === 'rekod') {
    const list = A.d.rekod || [];
    h += '<div class="kb-sec-h"><div><h2>Semua rekod</h2><p>' + list.length + ' rekod aktif dalam julat.</p></div><div class="kb-btns">' +
      '<button class="kb-btn" data-kb="borang" data-pukal="1">' + ic('users') + 'Rekod pukal</button><button class="kb-btn pri" data-kb="borang" data-adm="1">' + ic('plus') + 'Rekod baharu</button></div></div>' +
      '<form class="kb-filters" data-kbform="admRekod"><label>Dari <input type="date" name="dari" value="' + A.dari + '"></label><label>Hingga <input type="date" name="hingga" value="' + A.hingga + '"></label>' +
      '<select name="emel"><option value="">Semua staf</option>' + S.staf.map(st => '<option value="' + esc(st.emel) + '"' + (A.emel === st.emel ? ' selected' : '') + '>' + esc(tc(st.nama)) + '</option>').join('') + '</select>' +
      '<button class="kb-btn" type="submit">' + ic('filter') + 'Tapis</button></form>';
    return h + (list.length ? '<div class="kb-list">' + list.map(r => baris(r, true, r.nama ? tc(r.nama) : r.emel)).join('') + '</div>' : '<div class="kb-empty">' + ic('list') + 'Tiada rekod dalam julat ini.</div>');
  }
  if (A.tab === 'cuti') {
    const list = A.d.cuti || [], blm = list.filter(c => !c.disahkan && c.tarikh >= S.today).length;
    return h + '<div class="kb-sec-h"><div><h2>Cuti umum &amp; cuti peristiwa</h2><p>Semua staf dipaparkan "Cuti Umum" pada tarikh ini.' + (blm ? ' <b class="kb-warn">' + blm + ' tarikh perlu disahkan.</b>' : '') + '</p></div>' +
      '<button class="kb-btn pri" data-kb="cutiBaru">' + ic('plus') + 'Tambah cuti</button></div>' +
      '<div class="kb-tbl-wrap"><table class="kb-tbl"><thead><tr><th>Tarikh</th><th>Nama</th><th>Skop</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(c => '<tr class="' + (c.tarikh < S.today ? 'past' : '') + '"><td>' + esc(tglP(c.tarikh)) + '</td><td>' + esc(c.nama) + '</td><td>' + esc(c.skop) + '</td>' +
        '<td>' + (c.disahkan ? '<span class="st good">' + ic('check') + 'Disahkan</span>' : '<span class="st warn">' + ic('alert') + 'Perlu disahkan</span>') + '</td>' +
        '<td class="kb-ta"><button class="kb-btn ghost" data-kb="cutiUbah" data-t="' + c.tarikh + '">' + ic('edit') + '</button><button class="kb-btn ghost bad" data-kb="cutiPadam" data-t="' + c.tarikh + '">' + ic('trash') + '</button></td></tr>').join('') +
      '</tbody></table></div><p class="kb-foot">' + ic('info') + 'Senarai awal 2027 daripada pengumuman rasmi Kabinet (BKPAK, JPM). Tarikh bertanda * bergantung pada anak bulan.</p>';
  }
  if (A.tab === 'tetapan') {
    const T = A.d.tetapan; if (!T) return h;
    const hariK = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat'], pilihan = (T.jenis || []).filter(j => j.aktif);
    const nm = {}; (T.nama || []).forEach(x => { nm[x.emel] = x.nama; });
    return h + '<div class="kb-panel"><h3>' + ic('sheet') + 'Google Sheet PERGERAKAN STAFF</h3>' +
      '<p class="kb-small">Senarai staf dibaca dari tab <b>Maklumat Staff</b>. Status ditulis ke tab bulanan (cth. NOV2026); tab bulan baharu dicipta automatik setiap pagi. Jenis cuti ditulis sebagai "CUTI" sahaja.</p>' +
      '<div class="kb-row2">' + (T.sheetUrl ? '<a class="kb-btn" href="' + esc(T.sheetUrl) + '" target="_blank" rel="noopener">' + ic('ext') + 'Buka Sheet</a>' : '') +
      '<button class="kb-btn" data-kb="segerakSheet">' + ic('refresh') + 'Kemas kini Sheet sekarang</button></div></div>' +
      '<form class="kb-panel" data-kbform="tetapan"><h3>' + ic('shield') + 'Admin</h3><p class="kb-small">Admin boleh mengemas kini status semua staf, cuti umum dan tetapan.</p>' +
      '<div class="kb-chips" id="kbAdmChips">' + T.admin.map(e => '<span class="kb-chipx">' + esc(tc((stafBy(e) || {nama: e}).nama)) + '<input type="hidden" name="admin" value="' + esc(e) + '"><button type="button" data-kb="buangAdmin" aria-label="Buang">' + ic('x') + '</button></span>').join('') + '</div>' +
      '<div class="kb-row2"><select id="kbAdmAdd"><option value="">+ Tambah admin…</option>' + S.staf.filter(st => T.admin.indexOf(st.emel) < 0).map(st => '<option value="' + esc(st.emel) + '">' + esc(tc(st.nama)) + '</option>').join('') + '</select></div>' +
      '<h3>' + ic('cal') + 'Corak minggu (status lalai)</h3><div class="kb-corak">' + hariK.map((hk, i) => '<label><span>' + hk + '</span><select name="corak">' +
        pilihan.map(j => '<option value="' + j.kod + '"' + (T.corak[i] === j.kod ? ' selected' : '') + '>' + esc(j.label) + '</option>').join('') + '</select></label>').join('') + '</div>' +
      '<button class="kb-btn pri" type="submit">' + ic('check') + 'Simpan tetapan</button></form>' +
      '<div class="kb-panel"><h3>' + ic('user') + 'Nama paparan (pilihan)</h3><p class="kb-small">Nama pendek di papan, cth. "Pn. Farizah". Biarkan kosong untuk nama automatik.</p>' +
      '<div class="kb-names">' + S.staf.map(st => '<label><span title="' + esc(tc(st.nama)) + '">' + esc(tc(st.nama)) + '</span><input data-kbnama="' + esc(st.emel) + '" maxlength="40" placeholder="' + esc(namaPendek(Object.assign({}, st, {papar: ''}))) + '" value="' + esc(nm[st.emel] || '') + '"></label>').join('') + '</div></div>';
  }
  if (A.tab === 'jenis') {
    const T = A.d.tetapan; if (!T) return h;
    return h + '<div class="kb-sec-h"><div><h2>Jenis status</h2><p>Pilihan dalam borang. Jenis "peribadi" dipaparkan sebagai "Cuti" kepada staf lain.</p></div>' +
      '<button class="kb-btn pri" data-kb="jenisUbah">' + ic('plus') + 'Jenis baharu</button></div>' +
      '<div class="kb-tbl-wrap"><table class="kb-tbl"><thead><tr><th>Label</th><th>Kumpulan</th><th>Subkumpulan</th><th>Peribadi</th><th>Aktif</th><th></th></tr></thead><tbody>' +
      T.jenis.map(j => '<tr class="' + (j.aktif ? '' : 'past') + '"><td><span class="kb-pill" style="--sc:' + j.warna + '">' + ic(j.ikon) + esc(j.label) + '</span><small class="kb-kod">' + esc(j.kod) + '</small></td><td>' + esc(j.kumpulan) + '</td><td>' + esc(j.subkumpulan || '—') + '</td>' +
        '<td>' + (j.peribadi ? 'Ya' : '—') + '</td><td>' + (j.aktif ? 'Ya' : 'Tidak') + '</td><td class="kb-ta"><button class="kb-btn ghost" data-kb="jenisUbah" data-kod="' + j.kod + '">' + ic('edit') + '</button></td></tr>').join('') + '</tbody></table></div>';
  }
  if (A.tab === 'log') {
    const L = A.d.log || [];
    const NAMA = {LOG_MASUK: 'Log masuk', TAMBAH: 'Tambah rekod', TAMBAH_PUKAL: 'Rekod pukal', UBAH: 'Ubah rekod', BATAL: 'Batal rekod', TETAPAN: 'Tetapan', CUTI_UMUM: 'Cuti umum', CUTI_UMUM_PADAM: 'Padam cuti umum', NAMA_PAPARAN: 'Nama paparan', JENIS_STATUS: 'Jenis status'};
    return h + '<div class="kb-sec-h"><div><h2>Log audit</h2><p>300 tindakan terkini.</p></div></div><div class="kb-tbl-wrap"><table class="kb-tbl"><thead><tr><th>Masa</th><th>Oleh</th><th>Tindakan</th><th>Sasaran</th><th>Butiran</th></tr></thead><tbody>' +
      L.map(l => { const b = l.butiran || {}; const d = [b.kod && J(b.kod).label, b.mula && (b.mula === b.tamat ? b.mula : b.mula + ' → ' + b.tamat), b.lokasi, b.hasil, b.nama, b.peranti].filter(Boolean).join(' · ');
        return '<tr><td class="kb-nw">' + esc(l.masa) + '</td><td>' + esc(namaPendek(stafBy(l.oleh)) || l.oleh) + '</td><td>' + esc(NAMA[l.tindakan] || l.tindakan) + '</td><td>' + esc(namaPendek(stafBy(l.sasaran)) || l.sasaran) + '</td><td>' + esc(d) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  if (A.tab === 'eksport') {
    const bln = S.today.slice(0, 7);
    return h + '<form class="kb-panel" data-kbform="eksport"><h3>' + ic('down') + 'Eksport pergerakan bulanan (CSV / Excel)</h3>' +
      '<p class="kb-small">Satu baris bagi setiap staf, satu lajur bagi setiap hari. Fail boleh dibuka terus dalam Excel.</p>' +
      '<div class="kb-row2"><input type="month" name="bulan" value="' + bln + '" required><button class="kb-btn pri" type="submit">' + ic('down') + 'Muat turun CSV</button></div></form>' +
      '<div class="kb-panel"><h3>' + ic('printer') + 'Cetak papan</h3><p class="kb-small">Cetak papan harian (A4 landskap) untuk ditampal.</p><button class="kb-btn" data-kbgo="pergerakan" data-cetak="1">' + ic('printer') + 'Buka papan hari ini &amp; cetak</button></div>';
  }
  return h;
}

/* ---------- BORANG STATUS ---------- */
function bukaBorang(o) {
  o = o || {};
  const adm = S.boot.admin, me = S.boot.saya.emel, r = o.rekod || null;
  const emel = r ? r.emel : (o.emel || me), t = r ? r.mula : (o.t && o.t >= (adm ? '0000' : S.today) ? o.t : (S.tarikh >= S.today ? S.tarikh : S.today));
  const jenis = Object.values(S.J).filter(j => j.aktif && j.kumpulan !== 'CUTI_UMUM' && j.kumpulan !== 'HUJUNG' && j.kod !== 'CUTI');
  const kumpul = {};
  jenis.forEach(j => { const nm = j.kumpulan === 'TIADA' ? (j.subkumpulan || 'Lain-lain') : 'Di pejabat / HBH'; (kumpul[nm] = kumpul[nm] || []).push(j); });
  const pilih = r ? r.kod : o.kod || '';
  const pukal = !!o.pukal && adm;
  const html = '<form class="kb-form" data-kbform="status" novalidate><div class="kb-form-h"><h2>' + (r ? 'Ubah rekod' : pukal ? 'Rekod pukal' : 'Kemas kini status') + '</h2>' +
    '<button type="button" class="tbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="kb-form-b">' +
    (r ? '<input type="hidden" name="id" value="' + esc(r.id) + '">' : '') +
    (pukal
      ? '<fieldset><legend>Staf <span id="kbPukalN">0</span> dipilih</legend><div class="kb-search">' + ic('search') + '<input type="search" id="kbPukalQ" placeholder="Cari staf…"></div>' +
        '<label class="kb-chk all"><input type="checkbox" id="kbPukalAll"> Pilih semua yang dipaparkan</label><div class="kb-pukal">' +
        S.staf.map(st => '<label class="kb-chk" data-n="' + esc(norm(st.nama)) + '"><input type="checkbox" name="emels" value="' + esc(st.emel) + '">' + esc(tc(st.nama)) + '</label>').join('') + '</div></fieldset>'
      : adm && !r
        ? '<label class="kb-f"><span>Staf</span><select name="emel">' + S.staf.map(st => '<option value="' + esc(st.emel) + '"' + (st.emel === emel ? ' selected' : '') + '>' + esc(tc(st.nama)) + '</option>').join('') + '</select></label>'
        : '<input type="hidden" name="emel" value="' + esc(emel) + '"><div class="kb-who"><span class="kb-av sm" style="background:' + avColor(emel) + '">' + esc(inisial(stafBy(emel))) + '</span>' + esc(tc((stafBy(emel) || {}).nama || emel)) + '</div>') +
    '<fieldset><legend>Jenis status</legend>' + Object.keys(kumpul).map(nm => '<div class="kb-jg' + (o.g === 'TIADA' && nm === 'Di pejabat / HBH' ? ' dim' : '') + '"><small>' + esc(nm) + '</small><div class="kb-jopts">' +
      kumpul[nm].map(j => '<label class="kb-jopt" style="--sc:' + j.warna + '"><input type="radio" name="kod" value="' + j.kod + '"' + (pilih === j.kod ? ' checked' : '') + ' required>' + ic(j.ikon) + '<span>' + esc(j.label) + '</span></label>').join('') + '</div></div>').join('') + '</fieldset>' +
    '<div class="kb-two"><label class="kb-f"><span>Tarikh mula</span><input type="date" name="mula" value="' + t + '"' + (adm ? '' : ' min="' + (r && r.mula < S.today ? r.mula : S.today) + '"') + ' required></label>' +
    '<label class="kb-f"><span>Tarikh tamat</span><input type="date" name="tamat" value="' + (r ? r.tamat : t) + '"' + (adm ? '' : ' min="' + S.today + '"') + ' required></label></div>' +
    '<fieldset><legend>Sesi</legend><div class="kb-seg wide">' + [['SEHARI', 'Sehari'], ['PAGI', 'Pagi'], ['PETANG', 'Petang'], ['MASA', 'Ikut masa']].map(x =>
      '<label><input type="radio" name="sesi" value="' + x[0] + '"' + (((r && r.sesi) || (pilih === 'KELUAR' ? 'MASA' : 'SEHARI')) === x[0] ? ' checked' : '') + '><span>' + x[1] + '</span></label>').join('') + '</div>' +
    '<div class="kb-two kb-masa"><label class="kb-f"><span>Masa keluar</span><input type="time" name="masa_dari" value="' + esc((r && r.masa_dari) || '') + '"></label>' +
    '<label class="kb-f"><span>Jangka balik</span><input type="time" name="masa_hingga" value="' + esc((r && r.masa_hingga) || '') + '"></label></div></fieldset>' +
    '<label class="kb-f"><span>Lokasi / tempat <em>(pilihan)</em></span><input name="lokasi" maxlength="120" placeholder="cth. JPPKK Putrajaya" value="' + esc((r && r.lokasi) || '') + '"></label>' +
    '<label class="kb-f"><span>Catatan <em>(hanya anda &amp; admin boleh lihat)</em></span><textarea name="catatan" rows="2" maxlength="300">' + esc((r && r.catatan) || '') + '</textarea></label>' +
    '<p class="kb-small">' + ic('info') + 'Hujung minggu dan cuti umum dalam julat tarikh dilangkau secara automatik. Jenis cuti dipaparkan sebagai "Cuti" sahaja kepada staf lain.</p>' +
    '<div class="kb-banner bad" id="kbFormErr" hidden></div></div>' +
    '<div class="kb-form-f">' + (r ? '<button type="button" class="kb-btn ghost bad" data-kb="batal" data-id="' + esc(r.id) + '">' + ic('trash') + 'Batal rekod</button>' : '') +
    '<span class="kb-sp"></span><button type="button" class="kb-btn" data-close>Tutup</button><button type="submit" class="kb-btn pri">' + ic('check') + 'Simpan</button></div></form>';
  const m = openModal(html, 'kb-mdl');
  const f = m.querySelector('form');
  const syncSesi = () => { f.querySelector('.kb-masa').hidden = !(f.sesi && f.querySelector('[name=sesi]:checked') && f.querySelector('[name=sesi]:checked').value === 'MASA'); };
  f.addEventListener('change', e => {
    if (e.target.name === 'kod' && e.target.value === 'KELUAR' && !r) { const ms = f.querySelector('[name=sesi][value=MASA]'); ms.checked = true; }
    if (e.target.name === 'mula') { const tm = f.querySelector('[name=tamat]'); if (tm.value < e.target.value) tm.value = e.target.value; }
    syncSesi(); if (pukal) kiraPukal();
  });
  syncSesi();
  if (pukal) {
    const q = m.querySelector('#kbPukalQ');
    q.oninput = () => { const v = norm(q.value.trim()); m.querySelectorAll('.kb-pukal .kb-chk').forEach(l => { l.hidden = v && !l.dataset.n.includes(v); }); };
    m.querySelector('#kbPukalAll').onchange = e => { m.querySelectorAll('.kb-pukal .kb-chk:not([hidden]) input').forEach(c => { c.checked = e.target.checked; }); kiraPukal(); };
    if (o.emel) { const c = m.querySelector('.kb-pukal input[value="' + o.emel + '"]'); if (c) c.checked = true; }
    kiraPukal();
  }
  function kiraPukal() { m.querySelector('#kbPukalN').textContent = m.querySelectorAll('.kb-pukal input:checked').length; }
  f.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(f), err = m.querySelector('#kbFormErr');
    const rec = {id: fd.get('id') || undefined, kod: fd.get('kod'), mula: fd.get('mula'), tamat: fd.get('tamat') || fd.get('mula'), sesi: fd.get('sesi') || 'SEHARI',
      masa_dari: fd.get('masa_dari'), masa_hingga: fd.get('masa_hingga'), lokasi: fd.get('lokasi'), catatan: fd.get('catatan')};
    if (pukal) rec.emels = fd.getAll('emels'); else rec.emel = fd.get('emel');
    const salah = !rec.kod ? 'Pilih jenis status.' : !rec.mula ? 'Pilih tarikh mula.' : rec.tamat < rec.mula ? 'Tarikh tamat mesti sama atau selepas tarikh mula.'
      : pukal && !rec.emels.length ? 'Pilih sekurang-kurangnya seorang staf.'
      : rec.sesi === 'MASA' && (!rec.masa_dari || !rec.masa_hingga || rec.masa_hingga <= rec.masa_dari) ? 'Masukkan masa keluar dan masa balik yang sah.' : '';
    if (salah) { err.hidden = false; err.innerHTML = ic('alert') + esc(salah); return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.innerHTML = '<span class="kb-spin"></span>Menyimpan…';
    try {
      const out = await api('simpan', {rekod: rec});
      closeModal(); toast(out.bil > 1 ? '✓ ' + out.bil + ' rekod disimpan' : '✓ Status disimpan'); amaran(out);
      lepasUbah();
    } catch (x) { err.hidden = false; err.innerHTML = ic('alert') + esc(x.message); btn.disabled = false; btn.innerHTML = ic('check') + 'Simpan'; }
  };
  m.addEventListener('click', e => { const b = e.target.closest('[data-kb="batal"]'); if (b) { e.preventDefault(); batalRekod(b.dataset.id); } });
}
function cariRekod(id) {
  return (S.rekodSaya || []).find(r => r.id === id) || (S.adm.d.rekod || []).find(r => r.id === id) || null;
}
async function batalRekod(id) {
  const r = cariRekod(id), j = r ? J(r.kod) : null;
  if (!confirm('Batalkan rekod ini?' + (j ? '\n\n' + j.label + ' · ' + (r.mula === r.tamat ? r.mula : r.mula + ' hingga ' + r.tamat) : ''))) return;
  try {
    const out = await api('batal', {id});
    closeModal(); toast(out.hasil === 'DIPENDEKKAN' ? '✓ Rekod ditamatkan mulai hari ini' : '✓ Rekod dibatalkan'); amaran(out);
    lepasUbah();
  } catch (e) { alert(e.message); }
}
async function ubahRekod(id) {
  let r = cariRekod(id);
  if (!r && S.boot.admin) { try { await muatRekodAdmin(); r = cariRekod(id); } catch (e) {} }
  if (!r) { toast('Rekod tidak dijumpai — muat semula'); return; }
  bukaBorang({rekod: r});
}
async function muatRekodAdmin() {
  const A = S.adm; if (!A.dari) { A.dari = addDays(S.today, -7); A.hingga = addDays(S.today, 60); }
  A.d.rekod = (await api('admRekod', {dari: addDays(S.today, -60), hingga: addDays(S.today, 120)})).rekod;
}
function lepasUbah() { S.mem = {}; muat(true); if (route().v === 'utama') KB.homeFill(); }

/* Klik kad staf: rekod sedia ada -> ubah; jika tiada -> borang baharu untuk staf & tarikh itu. */
async function klikKad(emel, t) {
  const k = Object.values(S.mem).find(m => m.p.hari.some(h => h.t === t) && m.p.sel[emel]);
  const cell = k ? k.p.sel[emel][k.p.hari.findIndex(h => h.t === t)] : null;
  const id = cell && ((cell.p && cell.p.id) || cell.a.id);
  if (id) { await ubahRekod(id); return; }
  bukaBorang({emel, t});
}

/* ---------- admin: cuti, jenis, eksport ---------- */
function borangCuti(c) {
  const html = '<form class="kb-form" data-kbform="cuti"><div class="kb-form-h"><h2>' + (c ? 'Ubah cuti' : 'Tambah cuti umum / peristiwa') + '</h2><button type="button" class="tbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="kb-form-b">' +
    (c ? '<input type="hidden" name="asal" value="' + c.tarikh + '">' : '') +
    '<label class="kb-f"><span>Tarikh</span><input type="date" name="tarikh" required value="' + (c ? c.tarikh : '') + '"></label>' +
    '<label class="kb-f"><span>Nama cuti</span><input name="nama" maxlength="100" required value="' + esc(c ? c.nama : '') + '" placeholder="cth. Cuti Peristiwa Hari Raya"></label>' +
    '<label class="kb-f"><span>Skop</span><select name="skop">' + ['Persekutuan', 'Pulau Pinang', 'Cuti Peristiwa', 'Lain-lain'].map(x => '<option' + (c && c.skop === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '<label class="kb-chk"><input type="checkbox" name="disahkan"' + (!c || c.disahkan ? ' checked' : '') + '> Tarikh telah disahkan</label><div class="kb-banner bad" hidden></div></div>' +
    '<div class="kb-form-f"><span class="kb-sp"></span><button type="button" class="kb-btn" data-close>Tutup</button><button class="kb-btn pri" type="submit">' + ic('check') + 'Simpan</button></div></form>';
  const m = openModal(html, 'kb-mdl'), f = m.querySelector('form');
  f.onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(f);
    try {
      const rr = await api('admCutiSimpan', {tarikh: fd.get('tarikh'), asal: fd.get('asal') || '', nama: fd.get('nama'), skop: fd.get('skop'), disahkan: !!fd.get('disahkan')}); S.adm.d.cuti = rr.cuti; amaran(rr);
      closeModal(); toast('✓ Cuti disimpan'); S.mem = {}; paint();
    } catch (x) { const b = f.querySelector('.kb-banner'); b.hidden = false; b.textContent = x.message; }
  };
}
const IKON_PILIH = ['building', 'home', 'map', 'cap', 'tool', 'mic', 'users', 'brief', 'bus', 'award', 'plane', 'sun', 'alert', 'thermo', 'baby', 'moon', 'cal', 'book', 'clock', 'clip', 'flag', 'laptop'];
function borangJenis(j) {
  const html = '<form class="kb-form" data-kbform="jenis"><div class="kb-form-h"><h2>' + (j ? 'Ubah jenis status' : 'Jenis status baharu') + '</h2><button type="button" class="tbtn" data-close aria-label="Tutup">' + ic('x') + '</button></div><div class="kb-form-b">' +
    '<div class="kb-two"><label class="kb-f"><span>Kod</span><input name="kod" required pattern="[A-Za-z0-9_]{2,30}" value="' + esc(j ? j.kod : '') + '"' + (j ? ' readonly' : '') + ' placeholder="cth. TUGAS_PEP"></label>' +
    '<label class="kb-f"><span>Label</span><input name="label" required maxlength="60" value="' + esc(j ? j.label : '') + '"></label></div>' +
    '<div class="kb-two"><label class="kb-f"><span>Kumpulan</span><select name="kumpulan">' + ['ADA', 'HBH', 'TIADA'].map(x => '<option' + ((j ? j.kumpulan : 'TIADA') === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '<label class="kb-f"><span>Subkumpulan</span><input name="subkumpulan" maxlength="40" list="kbSub" value="' + esc(j ? j.subkumpulan : '') + '"><datalist id="kbSub"><option>Tugas Rasmi Luar</option><option>Cuti</option><option>Keluar Sementara</option></datalist></label></div>' +
    '<div class="kb-two"><label class="kb-f"><span>Warna</span><input type="color" name="warna" value="' + (j ? j.warna : '#ea580c') + '"></label>' +
    '<label class="kb-f"><span>Ikon</span><select name="ikon">' + IKON_PILIH.map(x => '<option' + ((j ? j.ikon : 'cal') === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label></div>' +
    '<label class="kb-chk"><input type="checkbox" name="peribadi"' + (j && j.peribadi ? ' checked' : '') + '> Peribadi — staf lain hanya nampak "Cuti"</label>' +
    '<label class="kb-chk"><input type="checkbox" name="aktif"' + (!j || j.aktif ? ' checked' : '') + '> Aktif (dipaparkan dalam borang)</label><div class="kb-banner bad" hidden></div></div>' +
    '<div class="kb-form-f"><span class="kb-sp"></span><button type="button" class="kb-btn" data-close>Tutup</button><button class="kb-btn pri" type="submit">' + ic('check') + 'Simpan</button></div></form>';
  const m = openModal(html, 'kb-mdl'), f = m.querySelector('form');
  f.onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(f);
    try {
      const r = await api('admJenisSimpan', {jenis: {kod: fd.get('kod'), label: fd.get('label'), kumpulan: fd.get('kumpulan'), subkumpulan: fd.get('subkumpulan'), warna: fd.get('warna'), ikon: fd.get('ikon'), peribadi: !!fd.get('peribadi'), aktif: !!fd.get('aktif')}});
      amaran(r); r.jenis.forEach(x => { S.J[x.kod] = x; }); if (S.adm.d.tetapan) S.adm.d.tetapan.jenis = r.jenis;
      closeModal(); toast('✓ Jenis status disimpan'); S.boot = null; muat(true);
    } catch (x) { const b = f.querySelector('.kb-banner'); b.hidden = false; b.textContent = x.message; }
  };
}
async function eksport(bulan) {
  const [y, mo] = bulan.split('-').map(Number), dari = bulan + '-01', akhir = new Date(Date.UTC(y, mo, 0)).getUTCDate(), hingga = bulan + '-' + pad(akhir);
  toast('Menyediakan fail…');
  try {
    const p = await api('papan', {dari, hingga});
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Nama', 'Jawatan', 'Program'].concat(p.hari.map(d => HARI[d.dow].slice(0, 3) + ' ' + d.t))];
    S.staf.filter(st => p.sel[st.emel]).forEach(st => rows.push([tc(st.nama), tc(st.jawatan), trekL(st.trek)].concat(p.sel[st.emel].map((c, i) => {
      const u = c.a, t = J(u.k).label + (u.lok ? ' (' + u.lok + ')' : '');
      return c.p ? t + ' + ' + sesiL(c.p) + ': ' + J(c.p.k).label : (p.hari[i].jenis === 'HUJUNG' && u.s === 'h' ? '' : t);
    }))));
    const csv = '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    a.download = 'Pergerakan_Staf_JTMK_' + bulan + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch (e) { alert(e.message); }
}

/* ---------- tindakan ---------- */
async function tindakan(a, el) {
  switch (a) {
    case 'cubaLagi': S.err = null; S.mem = {}; return muat();
    case 'muatSemula': S.mem = {}; return muat();
    case 'hantarSemula': S.step = 'emel'; return hantarKod(S.emelLogin);
    case 'tukarEmel': S.step = 'emel'; S.devOtp = ''; S.msg = ''; return paint();
    case 'logKeluar':
      if (!confirm('Log keluar dari Papan Pergerakan pada peranti ini?')) return;
      try { await api('logKeluar'); } catch (e) {}
      buangSesi(); S.msg = ''; toast('Anda telah log keluar'); return paint();
    case 'geser': S.tarikh = addDays(S.tarikh, +el.dataset.n); return muat();
    case 'kini': S.tarikh = S.today; return muat();
    case 'tapis': S.tapis = S.tapis === el.dataset.v ? 'SEMUA' : el.dataset.v; return paint();
    case 'susun': S.susun = el.dataset.v; s('kb-susun', S.susun); return paint();
    case 'cetak': return window.print();
    case 'hadir': {
      el.disabled = true;
      try { amaran(await api('simpan', {rekod: {mula: S.tarikh, tamat: S.tarikh, kod: 'HADIR_HBH', sesi: 'SEHARI'}})); toast('✓ Direkod: hadir ke pejabat'); lepasUbah(); }
      catch (e) { el.disabled = false; alert(e.message); }
      return;
    }
    case 'borang': {
      const o = {g: el.dataset.g || '', pukal: !!el.dataset.pukal};
      if (el.dataset.g === 'TIADA') o.kod = '';
      if (el.dataset.adm) o.emel = S.boot.saya.emel;
      return bukaBorang(o);
    }
    case 'ubah': return ubahRekod(el.dataset.id);
    case 'batal': return batalRekod(el.dataset.id);
    case 'kad': return klikKad(el.dataset.emel, el.dataset.t);
    case 'admTab': S.adm.tab = el.dataset.v; return muat();
    case 'cutiBaru': return borangCuti(null);
    case 'cutiUbah': return borangCuti((S.adm.d.cuti || []).find(c => c.tarikh === el.dataset.t));
    case 'cutiPadam':
      if (!confirm('Padam cuti ' + el.dataset.t + '?')) return;
      try { const rr = await api('admCutiPadam', {tarikh: el.dataset.t}); S.adm.d.cuti = rr.cuti; amaran(rr); S.mem = {}; toast('✓ Cuti dipadam'); paint(); } catch (e) { alert(e.message); }
      return;
    case 'jenisUbah': return borangJenis(el.dataset.kod ? S.J[el.dataset.kod] : null);
    case 'buangAdmin': el.closest('.kb-chipx').remove(); return;
    case 'skrinPenuh': { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {}); else if (document.exitFullscreen) document.exitFullscreen().catch(() => {}); return; }
    case 'segerakSheet': {
      el.disabled = true;
      try { const r = await api('admSegerak'); toast('✓ Sheet dikemas kini: ' + (r.tab || []).join(', ')); } catch (e) { alert(e.message); }
      el.disabled = false; return;
    }
  }
}
async function hantarKod(emel) {
  emel = String(emel || '').trim().toLowerCase();
  S.emelLogin = emel; S.busy = true; S.msg = ''; paint();
  try {
    const r = await api('mintaOtp', {emel});
    s('pg-emel', emel); S.mask = r.emel; S.devOtp = r.devOtp || ''; S.step = 'kod';
  } catch (e) { S.msg = e.message; }
  S.busy = false; paint();
  const k = document.getElementById(S.step === 'kod' ? 'kbKod' : 'kbEmel'); if (k) k.focus();
}
function peranti() {
  const u = navigator.userAgent;
  const os = /Android/i.test(u) ? 'Android' : /iPhone|iPad/i.test(u) ? 'iOS' : /Windows/i.test(u) ? 'Windows' : /Mac/i.test(u) ? 'Mac' : 'Lain';
  const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : /Firefox\//.test(u) ? 'Firefox' : 'Pelayar';
  return os + ' · ' + br + (matchMedia('(display-mode: standalone)').matches ? ' · App' : '');
}
async function sahKod(kod) {
  S.busy = true; S.msg = ''; paint();
  try {
    const r = await api('sahOtp', {emel: S.emelLogin, kod: String(kod).replace(/\D/g, ''), peranti: peranti()});
    S.token = r.token; s('pg-token', r.token); S.step = 'emel'; S.devOtp = ''; S.busy = false;
    toast('✓ Log masuk berjaya');
    return muat();
  } catch (e) { S.msg = e.message; }
  S.busy = false; paint();
  const k = document.getElementById('kbKod'); if (k) { k.value = ''; k.focus(); }
}
/* Amaran daripada jambatan (cth. tab bulanan Sheet tidak dapat dikemas kini). */
function amaran(r) { if (r && r.amaran) setTimeout(() => alert(r.amaran), 300); }
/* ---------- ikatan peristiwa (delegasi) ---------- */
function ikat() {
  const r = root(); if (!r || r._kb) return; r._kb = 1;
  r.addEventListener('click', e => {
    const go1 = e.target.closest('[data-kbgo]');
    if (go1) { e.preventDefault(); if (go1.dataset.cetak) S.cetak = 1; S.tarikh = go1.dataset.cetak ? S.today : S.tarikh; go(go1.dataset.kbgo); return; }
    const b = e.target.closest('[data-kb]');
    if (b && !b.disabled) { e.preventDefault(); tindakan(b.dataset.kb, b); }
  });
  r.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-kb="kad"]')) { e.preventDefault(); tindakan('kad', e.target); } });
  r.addEventListener('input', e => {
    const k = e.target.dataset.kbin;
    if (k === 'cari') { S.cari = e.target.value; clearTimeout(r._t); r._t = setTimeout(() => { paint(); const i = root().querySelector('[data-kbin="cari"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 180); }
  });
  r.addEventListener('change', e => {
    const k = e.target.dataset.kbin;
    if (k === 'trek') { S.trek = e.target.value; paint(); }
    if (k === 'tarikh' && e.target.value) { S.tarikh = e.target.value; muat(); }
    if (e.target.id === 'kbAdmAdd' && e.target.value) {
      const v = e.target.value, st = stafBy(v), wrap = document.getElementById('kbAdmChips');
      wrap.insertAdjacentHTML('beforeend', '<span class="kb-chipx">' + esc(tc(st.nama)) + '<input type="hidden" name="admin" value="' + esc(v) + '"><button type="button" data-kb="buangAdmin" aria-label="Buang">' + ic('x') + '</button></span>');
      e.target.querySelector('option[value="' + v + '"]').remove(); e.target.value = '';
    }
    if (e.target.dataset.kbnama !== undefined) {
      const em = e.target.dataset.kbnama, v = e.target.value.trim();
      api('admNamaSimpan', {emel: em, nama: v}).then(() => { const st = stafBy(em); if (st) st.papar = v; toast('✓ Nama paparan disimpan'); }).catch(x => alert(x.message));
    }
  });
  r.addEventListener('submit', async e => {
    const f = e.target, k = f.dataset.kbform; if (!k) return;
    e.preventDefault();
    if (k === 'emel') return hantarKod(f.querySelector('#kbEmel').value);
    if (k === 'kod') return sahKod(f.querySelector('#kbKod').value);
    if (k === 'admRekod') { const fd = new FormData(f); Object.assign(S.adm, {dari: fd.get('dari'), hingga: fd.get('hingga'), emel: fd.get('emel')}); return muat(); }
    if (k === 'eksport') return eksport(new FormData(f).get('bulan'));
    if (k === 'tetapan') {
      const fd = new FormData(f);
      try { S.adm.d.tetapan = await api('admTetapanSimpan', {admin: fd.getAll('admin'), corak: fd.getAll('corak')}); toast('✓ Tetapan disimpan'); amaran(S.adm.d.tetapan); S.boot = null; S.mem = {}; muat(true); }
      catch (x) { alert(x.message); }
    }
  });
}

/* ---------- pemasa: muat semula setiap minit, jam TV ---------- */
setInterval(() => {
  if (typeof route !== 'function' || route().v !== 'pergerakan' || document.visibilityState !== 'visible' || !S.boot) return;
  if (document.getElementById('mdl') || SUB === 'admin' || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) return;
  muat(true);
}, 60000);
setInterval(() => { const j = document.getElementById('kbTvJam'); if (j) { const d = new Date(); j.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); } }, 10000);

/* Baca pilihan tersimpan sekali sahaja (token sesi, emel terakhir, susunan papan). */
function mulaKali() {
  if (S.init) return;
  S.init = true;
  S.token = g('pg-token', null);
  S.emelLogin = g('pg-emel', '');
  S.susun = g('kb-susun', 'status');
}

/* ---------- antara muka awam ---------- */
const KB = window.KB = {
  ada: ADA,
  view(sub) {
    SUB = ['minggu', 'saya', 'admin', 'tv'].includes(sub) ? sub : '';
    mulaKali();
    if (!S.today) S.today = localISO();
    if (!S.tarikh) S.tarikh = S.today;
    return '<div class="view kb" id="kbRoot">' + dalam() + '</div>';
  },
  bind() {
    ikat();
    document.documentElement.classList.toggle('tv-on', SUB === 'tv' && !!S.boot);
    let pr = Promise.resolve();
    if (ADA() && S.token) {
      const [a, b] = S.boot ? julatSemasa() : [0, 0];
      const segar = S.boot && SUB !== 'admin' && S.mem[key(a, b)] && Date.now() - S.mem[key(a, b)].at < 30000;
      if (!segar) pr = muat(!!(S.boot && S.mem[key(a, b)]));
    }
    if (S.cetak) { S.cetak = 0; pr.then(() => setTimeout(() => window.print(), 400)); }
  },
  title: () => ({minggu: 'Paparan minggu', saya: 'Rekod saya', admin: 'Admin', tv: 'Mod TV'}[SUB] || 'Hari ini')
};
})();
