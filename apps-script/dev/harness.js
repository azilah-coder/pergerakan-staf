/* Menjalankan Code.gs dalam Node dengan tiruan perkhidmatan Google Apps Script
   (SpreadsheetApp, CacheService, PropertiesService, LockService, MailApp, ScriptApp, Utilities…).
   Sheet "PERGERAKAN STAFF" (tab Maklumat Staff + tab bulanan) turut ditiru supaya segerak boleh diuji. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const KOD_GS = path.join(__dirname, '..', 'Code.gs');
const STAF_ID = '1BPcd62GABr84udcCxBSIY4vZegWtZYeBOj7BXYcu9bU';

function createEnv(opts = {}) {
  const state = opts.dbFile && fs.existsSync(opts.dbFile) ? JSON.parse(fs.readFileSync(opts.dbFile, 'utf8')) : {props: {}, books: {}};
  if (!state.books[STAF_ID]) state.books[STAF_ID] = {name: 'PERGERAKAN STAFF', sheets: Object.assign({'Maklumat Staff': opts.stafRows || []}, opts.tabs || {}), bg: {}};
  if (opts.stafRows) state.books[STAF_ID].sheets['Maklumat Staff'] = opts.stafRows;
  const mails = [], triggers = [];
  let nowOffset = 0;
  const save = () => { if (opts.dbFile) fs.writeFileSync(opts.dbFile, JSON.stringify(state)); };

  /* ---------- Spreadsheet tiruan ---------- */
  const clean = v => { if (v === null || v === undefined) return ''; if (typeof v === 'string' && v.startsWith("'")) return v.slice(1); return v; };
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, {sh, r, c, nr, nc}); }
    each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r - 1 + i, this.c - 1 + j, i, j); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i] || [], o = []; for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined || v === null ? '' : v); } out.push(o); }
      return out;
    }
    getDisplayValues() { return this.getValues().map(r => r.map(v => String(v))); }
    setValues(v) {
      this.sh.cekTulis();
      if (v.length !== this.nr || v.some(r => r.length !== this.nc)) throw new Error('Saiz julat tidak sepadan: ' + v.length + 'x' + (v[0] || []).length + ' vs ' + this.nr + 'x' + this.nc);
      this.each((R, C, i, j) => { this.sh.rows[R] = this.sh.rows[R] || []; this.sh.rows[R][C] = clean(v[i][j]); });
      for (let i = 0; i < this.sh.rows.length; i++) if (!this.sh.rows[i]) this.sh.rows[i] = [];
      return this;
    }
    clearContent() { this.sh.cekTulis(); this.each((R, C) => { if (this.sh.rows[R]) this.sh.rows[R][C] = ''; }); return this; }
    setBackgrounds(b) { this.sh.cekTulis(); this.each((R, C, i, j) => { this.sh.bg[R + ',' + C] = b[i][j]; }); return this; }
    setBackground(c) { this.sh.cekTulis(); this.each((R, C) => { this.sh.bg[R + ',' + C] = c; }); return this; }
    setNumberFormat() { return this; } setFontWeight() { return this; }
  }
  class Sheet {
    constructor(book, name) { this.book = book; this.name = name; if (!book.sheets[name]) book.sheets[name] = []; book.bg = book.bg || {}; book.bg[name] = book.bg[name] || {}; }
    get rows() { return this.book.sheets[this.name]; }
    get bg() { return this.book.bg[this.name]; }
    cekTulis() { if (this.book.readOnly) throw new Error('Anda tiada akses edit pada sheet ini'); }
    getName() { return this.name; }
    getLastRow() { const r = this.rows; for (let i = r.length - 1; i >= 0; i--) if (r[i] && r[i].some(v => v !== '' && v !== null && v !== undefined)) return i + 1; return 0; }
    getLastColumn() { let m = 0; this.rows.forEach(r => { if (r) for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] !== null && r[j] !== undefined) { m = Math.max(m, j + 1); break; } }); return m; }
    getMaxRows() { return Math.max(1000, this.rows.length); }
    getRange(r, c, nr = 1, nc = 1) { if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Julat tidak sah ' + [r, c, nr, nc]); return new Range(this, r, c, nr, nc); }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    appendRow(vals) { this.cekTulis(); this.rows[this.getLastRow()] = vals.map(clean); return this; }
    setFrozenRows() { return this; } setFrozenColumns() { return this; }
  }
  class Book {
    constructor(id) { this.id = id; }
    get data() { return id2book(this.id); }
    getId() { return this.id; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
    setSpreadsheetTimeZone() { return this; }
    getSheetByName(n) { return this.data.sheets[n] ? new Sheet(this.data, n) : null; }
    insertSheet(n) { if (this.data.readOnly) throw new Error('Anda tiada akses edit pada sheet ini'); this.data.sheets[n] = []; return new Sheet(this.data, n); }
    getSheets() { return Object.keys(this.data.sheets).map(n => new Sheet(this.data, n)); }
    deleteSheet(s) { delete this.data.sheets[s.getName()]; }
  }
  function id2book(id) {
    if (id === STAF_ID && opts.stafFail) throw new Error('Tiada akses');
    const b = state.books[id]; if (!b) throw new Error('Spreadsheet tidak dijumpai: ' + id);
    if (id === STAF_ID) b.readOnly = !!opts.stafReadOnly;
    return b;
  }
  const SpreadsheetApp = {
    create(name) { const id = 'dev-' + crypto.randomBytes(6).toString('hex'); state.books[id] = {name, sheets: {Sheet1: []}, bg: {}}; return new Book(id); },
    openById(id) { id2book(id); return new Book(id); }
  };

  /* ---------- Perkhidmatan lain ---------- */
  const cacheMap = new Map();
  const CacheService = {getScriptCache: () => ({
    get(k) { const x = cacheMap.get(k); if (!x) return null; if (x.exp < Date.now() + nowOffset) { cacheMap.delete(k); return null; } return x.v; },
    put(k, v, s = 600) { cacheMap.set(k, {v: String(v), exp: Date.now() + nowOffset + s * 1000}); },
    remove(k) { cacheMap.delete(k); }
  })};
  const PropertiesService = {getScriptProperties: () => ({
    getProperty: k => (k in state.props ? state.props[k] : null),
    setProperty(k, v) { state.props[k] = String(v); return this; },
    deleteProperty(k) { delete state.props[k]; return this; }
  })};
  const LockService = {getScriptLock: () => ({tryLock: () => true, waitLock() {}, releaseLock() {}})};
  const MailApp = {
    sendEmail(o) { mails.push(o); if (opts.logMail) console.log('[MailApp] kepada', o.to, '—', o.subject); },
    getRemainingDailyQuota: () => (opts.mailQuota === undefined ? 100 : opts.mailQuota)
  };
  const ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: fn => { const b = {timeBased: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b,
      create: () => { const t = {getHandlerFunction: () => fn}; triggers.push(t); return t; }}; return b; }
  };
  const fmtParts = (d, tz) => {
    const p = {}; new Intl.DateTimeFormat('en-GB', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'})
      .formatToParts(d).forEach(x => { p[x.type] = x.value; }); return p;
  };
  const Utilities = {
    DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'},
    getUuid: () => crypto.randomUUID(),
    computeDigest: (alg, s) => [...crypto.createHash(alg).update(String(s), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
    base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => b & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    formatDate(d, tz, f) { const p = fmtParts(d, tz); return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second); },
    parseCsv(t) {
      const rows = []; let row = [], cur = '', q = false;
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch;
      }
      if (cur || row.length) { row.push(cur); rows.push(row); }
      return rows;
    },
    sleep() {}
  };
  const UrlFetchApp = {fetch: () => ({getResponseCode: () => (opts.stafCsv ? 200 : 404), getContentText: () => opts.stafCsv || ''})};
  const ContentService = {MimeType: {JSON: 'application/json'}, createTextOutput: s => ({setMimeType() { return this; }, getContent: () => s})};

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + nowOffset); }
    static now() { return RealDate.now() + nowOffset; }
  }
  const ctx = vm.createContext({
    SpreadsheetApp, CacheService, PropertiesService, LockService, MailApp, ScriptApp, Utilities, UrlFetchApp, ContentService,
    Logger: {log: (...a) => opts.verbose && console.log(...a)},
    console: {log: (...a) => opts.verbose && console.log(...a), error: (...a) => opts.quietErrors || console.error('[Code.gs]', ...a)},
    Date: FakeDate
  });
  vm.runInContext(fs.readFileSync(KOD_GS, 'utf8'), ctx, {filename: 'Code.gs'});

  function call(action, body = {}) {
    const out = ctx.doPost({postData: {contents: JSON.stringify(Object.assign({action}, body)), type: 'text/plain'}});
    save();
    return JSON.parse(out.getContent());
  }
  return {
    ctx, call, mails, state, save, triggers,
    staf: () => state.books[STAF_ID],
    tabRows: n => (state.books[STAF_ID].sheets[n] || null),
    tabBg: (n, r, c) => (state.books[STAF_ID].bg[n] || {})[(r - 1) + ',' + (c - 1)],
    setup() { const u = ctx.setup(); save(); return u; },
    setNow(iso) { nowOffset = iso ? new RealDate(iso).getTime() - RealDate.now() : 0; },
    clearCache() { cacheMap.clear(); },
    setProp(k, v) { if (v === null) delete state.props[k]; else state.props[k] = String(v); save(); },
    setOpt(k, v) { opts[k] = v; }
  };
}

/* Bina tab "Maklumat Staff" seperti sheet sebenar: ['', NAMA, GRED, EMEL, KELAYAKAN PROFESIONAL, JAWATAN]. */
function maklumatStaf(list) {
  return [['', 'NAMA', 'GRED', 'EMEL', 'KELAYAKAN PROFESIONAL ', 'JAWATAN']]
    .concat(list.map((s, i) => [String(i + 1), s.nama, s.gred || '', s.emel || '', '', s.jawatan || '']));
}
/* Bina tab bulanan seperti NOV2026 sebenar: tarikh mula..tamat di baris 2 (mulai lajur D). */
function tabBulanan(list, mula, tamat) {
  const t = []; for (let d = new Date(mula + 'T00:00:00Z'); d <= new Date(tamat + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10); t.push(iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)); }
  return [['', 'NAMA', 'EMEL'].concat(t.map(() => '')), ['', '', ''].concat(t)]
    .concat(list.map((s, i) => [String(i + 1), s.nama, s.emel].concat(t.map(() => ''))));
}

module.exports = {createEnv, maklumatStaf, tabBulanan, STAF_ID};
