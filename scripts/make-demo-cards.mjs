// Renders a binder of fictional trading cards ("Mythic Menagerie") as photo-like JPEGs,
// each with a known condition, so the app's checks can be measured against ground truth.
// All art is original (CSS/SVG shapes). No real-world card artwork or trademarks.
//
// Usage: PW=<path to playwright-core> node scripts/make-demo-cards.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright-core');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'demo');
mkdirSync(out, { recursive: true });

const CARDS = [
  { id: 'c01', name: 'Emberfox', num: '012/180', hue: 18, b: [26, 26, 26, 26], defects: [], truth: { ceiling: 10, counterfeit: false } },
  { id: 'c02', name: 'Tidepup', num: '034/180', hue: 200, b: [29, 23, 26, 26], defects: [], truth: { ceiling: 9, counterfeit: false } },
  { id: 'c03', name: 'Thornback', num: '051/180', hue: 110, b: [38, 16, 26, 26], defects: [], truth: { ceiling: 7, counterfeit: false } },
  { id: 'c04', name: 'Voltwing', num: '067/180', hue: 52, b: [26, 26, 26, 26], defects: ['corners'], truth: { ceiling: 8, counterfeit: false } },
  { id: 'c05', name: 'Glimmerkoi', num: '088/180', hue: 300, b: [26, 26, 26, 26], defects: ['scratches'], truth: { ceiling: 7, counterfeit: false } },
  { id: 'c06', name: 'Stonebrow', num: '095/180', hue: 30, b: [26, 26, 26, 26], defects: ['crease'], truth: { ceiling: 5, counterfeit: false } },
  { id: 'c07', name: 'Frostling', num: '103/180', hue: 190, b: [26, 26, 26, 26], defects: ['fake'], truth: { ceiling: 10, counterfeit: true } },
  { id: 'c08', name: 'Mossmaw', num: '117/180', hue: 140, b: [26, 26, 26, 26], defects: ['holo'], truth: { ceiling: 10, counterfeit: false } },
  { id: 'c09', name: 'Sparkfin', num: '126/180', hue: 175, b: [26, 26, 26, 26], defects: ['edges'], truth: { ceiling: 7, counterfeit: false } },
  { id: 'c10', name: 'Duskowl', num: '139/180', hue: 260, b: [26, 26, 30, 22], defects: [], truth: { ceiling: 9, counterfeit: false } },
  { id: 'c11', name: 'Cindermole', num: '152/180', hue: 8, b: [26, 26, 26, 26], defects: ['lightcorner'], truth: { ceiling: 9, counterfeit: false } },
  { id: 'c12', name: 'Brambleboar', num: '171/180', hue: 90, b: [26, 26, 26, 26], defects: [], truth: { ceiling: 10, counterfeit: false } },
];

const html = (c) => {
  const [L, R, T, B] = c.b;
  const fake = c.defects.includes('fake');
  const font = fake ? '"Comic Sans MS", "Chalkboard SE", cursive' : '"Avenir Next", "Helvetica Neue", Arial, sans-serif';
  const attack = fake ? 'Atack' : 'Attack';
  const corner = (pos, size) => `<div class="wh ${pos}" style="width:${size}px;height:${size}px"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:760px;height:980px;overflow:hidden}
  body{background:radial-gradient(ellipse at 40% 35%, #2c3a33 0%, #18211d 60%, #0f1512 100%);display:grid;place-items:center}
  body::before{content:"";position:fixed;inset:0;background-image:repeating-radial-gradient(circle at 13% 27%, rgba(255,255,255,.025) 0 1px, transparent 1px 3px);mix-blend-mode:screen}
  .card{position:relative;width:600px;height:840px;transform-origin:center;border-radius:18px;background:#d8dce2;box-shadow:0 22px 40px rgba(0,0,0,.55),0 2px 0 rgba(255,255,255,.4) inset;}
  .inner{position:absolute;left:${L}px;right:${R}px;top:${T}px;bottom:${B}px;border-radius:8px;background:hsl(${c.hue} 45% 32%);
    box-shadow:0 0 0 3px #1d2430;display:flex;flex-direction:column;overflow:hidden;font-family:${font};${fake ? 'filter:saturate(1.9) contrast(1.15);' : ''}}
  .top{display:flex;justify-content:space-between;align-items:baseline;padding:12px 16px 6px;color:#fff;${fake ? 'filter:blur(.7px);' : ''}}
  .name{font-size:30px;font-weight:800;letter-spacing:.3px}
  .hp{font-size:20px;font-weight:700}
  .art{margin:4px 14px;height:290px;border-radius:6px;position:relative;overflow:hidden;
    background:linear-gradient(160deg,hsl(${c.hue} 80% 70%),hsl(${(c.hue + 40) % 360} 70% 45%));box-shadow:0 0 0 3px #f2e9c9 inset}
  .art .sun{position:absolute;width:160px;height:160px;border-radius:50%;left:150px;top:40px;background:radial-gradient(circle,hsl(${(c.hue + 20) % 360} 95% 85%),hsl(${c.hue} 85% 60%) 70%,transparent 72%)}
  .art .body{position:absolute;width:210px;height:150px;left:110px;top:120px;border-radius:50% 50% 40% 40%;background:hsl(${c.hue} 55% 28%)}
  .art .eye{position:absolute;width:20px;height:20px;border-radius:50%;background:#fff;top:160px}
  .art .eye.l{left:175px}.art .eye.r{left:245px}
  .holo .art::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,0) 0 18px,rgba(255,255,255,.28) 22px,rgba(160,220,255,.18) 30px,rgba(255,255,255,0) 40px)}
  .type{margin:8px 16px 0;color:#f6f0dc;font-size:14px;letter-spacing:.5px;opacity:.9}
  .move{margin:10px 16px;padding:10px 12px;border-radius:6px;background:rgba(0,0,0,.25);color:#fff;${fake ? 'filter:blur(.6px);' : ''}}
  .move b{font-size:20px}.move p{margin:4px 0 0;font-size:14px;line-height:1.35;opacity:.9}
  .foot{margin-top:auto;display:flex;justify-content:space-between;padding:8px 16px 10px;color:#e9e3cf;font-size:13px}
  .wh{position:absolute;background:radial-gradient(circle at 30% 30%,#fff 0 35%,rgba(255,255,255,.85) 50%,rgba(255,255,255,0) 72%);filter:blur(.4px)}
  .tl{left:-2px;top:-2px}.tr{right:-2px;top:-2px}.bl{left:-2px;bottom:-2px}.br{right:-2px;bottom:-2px}
  .scr{position:absolute;height:3px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.95) 20%,rgba(255,255,255,.95) 80%,transparent);transform-origin:left center;box-shadow:0 0 3px rgba(255,255,255,.7)}
  .crease{position:absolute;left:-10px;width:650px;top:390px;height:3px;transform:rotate(-24deg);transform-origin:left center;
    background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(0,0,0,.55));box-shadow:0 0 6px rgba(255,255,255,.6)}
  .chip{position:absolute;top:-1px;height:5px;background:#fff;border-radius:2px}
  </style></head><body><div class="card ${c.defects.includes('holo') ? 'holo' : ''}">
    <div class="inner">
      <div class="top"><span class="name">${c.name}</span><span class="hp">${fake ? '130 HP' : 'HP 130'}</span></div>
      <div class="art"><div class="sun"></div><div class="body"></div><div class="eye l"></div><div class="eye r"></div></div>
      <div class="type">MYTHIC MENAGERIE · Basic creature</div>
      <div class="move"><b>${attack}: Flare Rush</b><p>Flip a coin. If heads, this ${attack.toLowerCase()} does 30 more damage.</p></div>
      <div class="move"><b>Burrow Guard</b><p>Prevent all effects of attacks done to this creature during your opponent's next turn.</p></div>
      <div class="foot"><span>Illus. Studio Demo</span><span>${c.num}</span></div>
    </div>
    ${c.defects.includes('corners') ? corner('tl', 54) + corner('tr', 46) + corner('br', 50) : ''}
    ${c.defects.includes('lightcorner') ? corner('bl', 22) : ''}
    ${c.defects.includes('scratches') ? [[50, 160, 470, 18], [80, 330, 420, -16], [110, 470, 380, 24], [70, 640, 430, -21]].map(([x, y, w, r]) => `<div class="scr" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${r}deg)"></div>`).join('') : ''}
    ${c.defects.includes('crease') ? '<div class="crease"></div>' : ''}
    ${c.defects.includes('edges') ? [30, 90, 150, 215, 280, 350, 420, 490, 550].map((x, i) => `<div class="chip" style="left:${x}px;width:${14 + (i % 3) * 8}px;height:${7 + (i % 2) * 3}px"></div>`).join('') + [110, 240, 380, 520, 660].map((y) => `<div class="chip" style="top:${y}px;left:-1px;width:7px;height:${18 + (y % 9)}px"></div>`) + [150, 330, 600].map((y) => `<div class="chip" style="top:${y}px;left:auto;right:-1px;width:7px;height:${16 + (y % 7)}px"></div>`).join('') : ''}
  </div></body></html>`;
};

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 760, height: 980 }, deviceScaleFactor: 1 });
const DEFECT_MAX = { corners: 8, scratches: 7, crease: 5, edges: 7, lightcorner: 9, holo: 10, fake: 10 };
const LIMITS = [[10, .55], [9, .6], [8, .65], [7, .7], [6, .8], [5, .85]];
const gradeFor = (share) => (LIMITS.find(([, m]) => share <= m + 1e-9) ?? [4])[0];
const manifest = [];
for (const c of CARDS) {
  await page.setContent(html(c), { waitUntil: 'load' });
  // Fonts and one painted frame first: the very first capture otherwise catches a half-laid-out page.
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const file = `${c.id}-${c.name.toLowerCase()}.jpg`;
  await page.screenshot({ path: join(out, file), type: 'jpeg', quality: 88 });
  const [L, R, T, B] = c.b.map((v) => v - 3);
  const share = Math.max(L / (L + R), T / (T + B), R / (L + R), B / (T + B));
  const ceiling = Math.min(gradeFor(share), ...c.defects.map((d) => DEFECT_MAX[d] ?? 10));
  c.truth = { ceiling, counterfeit: c.defects.includes('fake') };
  manifest.push({
    id: c.id, file, name: c.name, number: c.num, defects: c.defects,
    truth: { ...c.truth, borders: { left: L, right: R, top: T, bottom: B } },
  });
  process.stdout.write('.');
}
await browser.close();
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ set: 'Mythic Menagerie (fictional demo set)', cards: manifest }, null, 2));
console.log(`\n${manifest.length} demo cards → public/demo`);
