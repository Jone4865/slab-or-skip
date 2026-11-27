// Drives the app in desktop Chrome that has Gemini Nano, reports the results and (optionally) takes screenshots.
// Usage: PW=<playwright-core> PROFILE=<chrome profile with the model> URL=http://localhost:5290/ node scripts/run-in-chrome.cjs [--cloud] [--detail] [--shots dir]
const { chromium } = require(process.env.PW);
const IGN = ['--disable-field-trial-config','--disable-background-networking','--disable-component-update','--disable-features=ImprovedCookieControls,LazyFrameLoading,GlobalMediaControls,DestroyProfileOnBrowserClose,MediaRouter,DialMediaRouteProvider,AcceptCHFrame,AutoExpandDetailsElement,CertificateTransparencyComponentUpdater,AvoidUnnecessaryBeforeUnloadCheckSync,Translate,HttpsUpgrades,PaintHolding,ThirdPartyStoragePartitioning,LensOverlay,PlzDedicatedWorker','--disable-component-extensions-with-background-pages'];
(async () => {
  const cloud = process.argv.includes('--cloud');
  const shotsIdx = process.argv.indexOf('--shots');
  const shots = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
  const ctx = await chromium.launchPersistentContext(process.env.PROFILE, {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--no-first-run', '--no-default-browser-check'], ignoreDefaultArgs: IGN, viewport: { width: 1440, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message.slice(0, 300)));
  const bad = [];
  page.on('response', async (r) => { if (r.status() >= 400) { let b = ''; try { b = (await r.text()).slice(0, 220); } catch {} bad.push(`${r.status()} ${r.url().split('?')[0].slice(0, 110)} ${b.replace(/\s+/g, ' ')}`); } });
  await page.goto(process.env.URL || 'http://localhost:5290/');
  await page.waitForFunction(() => !document.querySelector('.model')?.textContent?.includes('Looking'), null, { timeout: 15000 });
  const model = await page.textContent('.model .long');
  if (shots) await page.screenshot({ path: `${shots}/01-first.png` });
  await page.click('text=Load the demo binder');
  await page.waitForFunction(() => document.querySelectorAll('.row').length === 12);
  if (cloud) await page.check('.switch input');
  if (shots) await page.screenshot({ path: `${shots}/02-loaded.png`, fullPage: true });
  const t0 = Date.now();
  await page.click('button:has-text("Check 12 cards")');
  if (shots) { await page.waitForSelector('.row .scan'); await page.screenshot({ path: `${shots}/03-checking.png` }); }
  await page.waitForFunction(() => document.querySelectorAll('.row .pill:not(.pending), .row .err').length === 12, null, { timeout: 240000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  await page.waitForTimeout(300);
  const finding = await page.textContent('.finding');
  const kpis = await page.$$eval('.kpi', (s) => s.map((x) => x.innerText.replace(/\n/g, ' ')));
  const proof = await page.textContent('.proof');
  const detail = await page.evaluate(() => (window.__slab || []).map((c) => `${c.label.padEnd(12)} truth=${c.truth?.ceiling}${c.truth?.counterfeit ? 'F' : ''} got=${c.verdict?.ceiling}/${c.verdict?.band} ${c.error ?? ''}| surf=${JSON.stringify(c.reads?.surface)} | text=${JSON.stringify(c.reads?.text)} | edge=${c.wear?.edge?.toFixed?.(3)} m=${c.wear?.measurable}`));
  if (shots) {
    await page.screenshot({ path: `${shots}/04-done-1440.png`, fullPage: true });
    await page.click('.row:has-text("Tidepup")');
    await page.waitForSelector('.pane');
    await page.screenshot({ path: `${shots}/05-detail-1440.png` });
    await page.click('.row:has-text("Frostling")');
    await page.screenshot({ path: `${shots}/06-fake-1440.png` });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.click('.pane .btn.quiet');
    await page.screenshot({ path: `${shots}/07-list-768.png`, fullPage: true });
    await page.click('.row:has-text("Thornback")');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}/08-detail-768.png`, fullPage: true });
    await page.click('.pane .btn.quiet');
    const overflow = {};
    overflow[768] = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    overflow[390] = await page.evaluate(() => document.documentElement.scrollWidth);
    for (const [i, y] of [0, 700, 1400].entries()) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(150); await page.screenshot({ path: `${shots}/09-list-390-${i}.png` }); }
    await page.click('.row:has-text("Emberfox")');
    await page.waitForTimeout(300);
    const paneY = await page.evaluate(() => document.querySelector('.pane').getBoundingClientRect().top + window.scrollY);
    for (const [i, y] of [paneY - 80, paneY + 620].entries()) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(150); await page.screenshot({ path: `${shots}/10-detail-390-${i}.png` }); }
    console.log('scrollWidth', JSON.stringify(overflow));
  }
  console.log(JSON.stringify({ model, mode: cloud ? 'cloud' : 'hybrid', secs, finding, kpis, proof, errors: logs.slice(0, 5), bad: bad.slice(0, 12), rowErrors: await page.$$eval('.row', (rs) => rs.filter((r) => r.querySelector('.err')).map((r) => r.querySelector('.ident b').textContent)) }, null, 1));
  if (process.argv.includes('--detail')) console.log(detail.join('\n'));
  await ctx.close();
  process.exit(0);
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
