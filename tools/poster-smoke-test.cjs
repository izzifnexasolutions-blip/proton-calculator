/* ============================================================
   Ujian render poster — jalan tanpa pelayar.
   Guna ctx canvas palsu untuk mengesan ralat runtime (typo,
   rujukan undefined, layout tidak masuk canvas).
   Jalankan:  node tools/poster-smoke-test.cjs
   ============================================================ */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'poster.js');

let code = fs.readFileSync(file, 'utf8');
const marker = /\n\}\)\(\);\s*$/;
if (!marker.test(code)) { console.error('MARKER NOT FOUND — struktur poster.js berubah?'); process.exit(2); }
code = code.replace(marker,
  "\n  globalThis.__pg = { renderPoster: renderPoster, buildCaption: buildCaption, currentData: currentData, profile: profile, setAgent: function (a, t) { Object.assign(profile, a); if (t) profile.theme = t; } };\n})();\n");

const grad = { addColorStop() {} };
const ctx = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return (s) => ({ width: String(s).length * 22 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; }
});
const makeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });

global.document = { readyState: 'complete', querySelector: () => null, addEventListener: () => {}, createElement: () => makeCanvas() };
global.window = {};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.MutationObserver = class { observe() {} };
global.navigator = {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.fetch = () => Promise.reject(new Error('offline'));
global.Image = class {
  set src(v) { this._src = v; if (this.onload) this.onload(); }
  get width() { return 1600; }
  get height() { return 900; }
};

(0, eval)(code);
if (!globalThis.__pg) { console.error('MODUL TIDAK DEDAH DALAMAN'); process.exit(2); }

const MODEL = { id: 'saga', name: 'PROTON SAGA', image: 'images/saga.jpg', variants: [{ name: 'Premium 1.5 i-GT CVT', otr: 51710, ins: 1720 }] };
global.window.getModel = () => MODEL;
global.window.state = { modelId: 'saga', variantIdx: 0, loanYears: 9, interestPct: 2.28, ncdPct: 0 };
global.window.calc = () => ({ selling: 49990, insurance: 1720, otr: 51710, dp: 5171, loan: 46539, monthly: 522.34 });
global.window._getRebate = () => 0;

const d = globalThis.__pg.currentData();
if (!d) { console.error('currentData() pulang null'); process.exit(2); }
console.log('currentData ->', JSON.stringify({ model: d.model, variant: d.variant, months: d.months, monthly: Math.round(d.monthly), otr: d.otr, carUrl: d.carUrl }));

const failures = [];
for (const theme of ['red', 'dark', 'gold']) {
  for (const tpl of ['classic', 'bold', 'ringkas']) {
    for (const size of ['feed', 'story', 'square']) {
      globalThis.__pg.setAgent({ name: 'Fariz Proton', phone: '012-345 6789', agency: 'Proton Cawangan Ampang', tagline: 'Test drive percuma', logo: '' }, theme);
      const c = makeCanvas();
      const data = Object.assign({}, d, { photo: null, logo: null, agent: globalThis.__pg.profile, months: 108 });
      try {
        globalThis.__pg.renderPoster(c, data, tpl, size);
        if (!c.width || !c.height) throw new Error('saiz canvas tidak ditetapkan');
        if (c.width < 1000) throw new Error('resolusi rendah: ' + c.width);
      } catch (e) { failures.push(tpl + '/' + size + '/' + theme + ' -> ' + e.message); }
    }
  }
}

try {
  globalThis.__pg.setAgent({ name: '', phone: '', agency: '', tagline: '', logo: '' });
  const c = makeCanvas();
  globalThis.__pg.renderPoster(c, Object.assign({}, d, { photo: { width: 1600, height: 900 }, logo: { width: 300, height: 300 }, agent: globalThis.__pg.profile }), 'classic', 'feed');
  console.log('kes tepi (profil kosong + ada gambar) ok');
  console.log(globalThis.__pg.buildCaption(Object.assign({}, d, { months: 108 })).split('\n').map((l) => '   ' + l).join('\n'));
} catch (e) { failures.push('kes tepi -> ' + e.message); }

console.log('\nrenderPoster diuji: 27 kombinasi (3 template x 3 saiz x 3 tema)');
if (failures.length) { console.error('GAGAL:\n' + failures.join('\n')); process.exit(1); }
console.log('SEMUA LULUS');
