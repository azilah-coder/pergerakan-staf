/* Pelayan ujian tempatan: meniru Web app Apps Script (POST /exec) dengan Code.gs sebenar.
   Jalankan:  node apps-script/dev/server.js      (port 8787)
   - Senarai staf dibaca dari tab "Maklumat Staff" sebenar (gviz, baca sahaja) dan dicache dalam .dev-staf.json.
   - Tab bulanan ditiru dalam memori (NOV2026 bermula 13/11 seperti sheet sebenar) — sheet sebenar TIDAK diubah.
   - Mod ujian hidup: log masuk dengan ujian.admin@eboard.test / ujian.staf@eboard.test; kod OTP dipaparkan terus.
   Pilihan: --reset, --refresh-staf, PORT=xxxx, DEV_LATENCY=ms */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const {createEnv, tabBulanan, STAF_ID} = require('./harness');

const PORT = +process.env.PORT || 8787;
const LATENCY = process.env.DEV_LATENCY === undefined ? 250 : +process.env.DEV_LATENCY;
const DB_FILE = path.join(__dirname, '.dev-db.json');
const STAF_FILE = path.join(__dirname, '.dev-staf.json');

async function jadualStaf() {
  if (fs.existsSync(STAF_FILE) && !process.argv.includes('--refresh-staf')) return JSON.parse(fs.readFileSync(STAF_FILE, 'utf8'));
  const url = 'https://docs.google.com/spreadsheets/d/' + STAF_ID + '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent('Maklumat Staff');
  try {
    const rows = createEnv({}).ctx.Utilities.parseCsv(await (await fetch(url)).text());
    fs.writeFileSync(STAF_FILE, JSON.stringify(rows));
    console.log('Maklumat Staff dimuat:', rows.length - 1, 'baris');
    return rows;
  } catch (e) { console.warn('Tidak dapat baca Maklumat Staff (' + e.message + ') — akaun ujian sahaja.'); return [['', 'NAMA', 'EMEL']]; }
}

(async () => {
  if (process.argv.includes('--reset') && fs.existsSync(DB_FILE)) { fs.unlinkSync(DB_FILE); console.log('Data ujian dipadam.'); }
  const rows = await jadualStaf();
  const env = createEnv({dbFile: DB_FILE, stafRows: rows, logMail: true});
  if (!env.state.props.DB_ID) {
    const h = rows[0].map(x => String(x).trim().toUpperCase()), iN = h.indexOf('NAMA'), iE = h.indexOf('EMEL');
    env.staf().sheets.NOV2026 = tabBulanan(rows.slice(1).map(r => ({nama: r[iN], emel: r[iE]})), '2026-11-13', '2026-11-30');
    env.setProp('TEST_MODE', '1');
    env.setup();
    console.log('setup() dijalankan — data ujian dicipta.');
  }
  env.setProp('TEST_MODE', '1');
  http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (!req.url.startsWith('/exec')) { res.writeHead(404, {'Content-Type': 'text/plain'}); return res.end('Gunakan /exec'); }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => setTimeout(() => {
      let out;
      try {
        out = req.method === 'POST' ? env.ctx.doPost({postData: {contents: body, type: 'text/plain'}}).getContent() : env.ctx.doGet({}).getContent();
        env.save();
      } catch (e) { out = JSON.stringify({ok: false, kod: 'RALAT', ralat: e.message}); }
      try { const j = JSON.parse(body || '{}'); console.log(new Date().toLocaleTimeString(), j.action || 'GET', '→', out.length > 120 ? out.slice(0, 120) + '…' : out); } catch (e) {}
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(out);
    }, LATENCY));
  }).listen(PORT, () => console.log('API Pergerakan (ujian) di http://localhost:' + PORT + '/exec'));
})();
