/* Jana ikon PNG Pergerakan Staf (PWA) daripada SVG menggunakan Microsoft Edge tanpa kepala.
   Jalankan:  node docs/jana-ikon.js     → menulis ke folder icons/ */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), {execFileSync} = require('child_process');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const OUT = path.join(__dirname, '..', 'icons');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-ikon-'));

const DEFS = '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#0d9488"/></linearGradient></defs>';
/* Pin (Lucide, grid 24) diisi putih; lubang tengah ikut warna latar; titik emas di bawah. */
const PIN = '<g transform="translate(256 248) scale(13) translate(-12 -12)"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="#fff"/><circle cx="12" cy="10" r="3.2" fill="#15803d"/></g>' +
  '<ellipse cx="256" cy="420" rx="70" ry="14" fill="#f2b705" opacity=".9"/>';
const logo = (rx, skala) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' + DEFS + '<rect width="512" height="512" rx="' + rx + '" fill="url(#bg)"/>' +
  '<g transform="translate(256 256) scale(' + skala + ') translate(-256 -256)">' + PIN + '</g></svg>';

fs.writeFileSync(path.join(OUT, 'icon.svg'), logo(112, 1) + '\n');
const SENARAI = [
  ['icon-192.png', 192, logo(112, 1)], ['icon-512.png', 512, logo(112, 1)],
  ['icon-maskable-512.png', 512, logo(0, .8)], ['apple-touch-icon.png', 180, logo(0, .88)], ['favicon-32.png', 32, logo(112, 1.1)]
];
for (const [nama, px, svg] of SENARAI) {
  const html = path.join(TMP, nama + '.html'), out = path.join(OUT, nama);
  fs.writeFileSync(html, '<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:' + px + 'px;height:' + px + 'px}</style></head><body>' + svg + '</body></html>');
  if (fs.existsSync(out)) fs.unlinkSync(out);
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=00000000',
    '--user-data-dir=' + path.join(TMP, 'profil'), '--window-size=' + px + ',' + px, '--screenshot=' + out, 'file:///' + html.replace(/\\/g, '/')], {stdio: 'ignore'});
  let size = -1;   // Edge menulis selepas pelancar tamat — tunggu fail stabil
  for (let i = 0; i < 60; i++) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); const n = fs.existsSync(out) ? fs.statSync(out).size : -1; if (n > 0 && n === size) break; size = n; }
  console.log(nama, size > 0 ? size + ' bait' : 'GAGAL');
}
try { fs.rmSync(TMP, {recursive: true, force: true, maxRetries: 10, retryDelay: 500}); } catch (e) {}
