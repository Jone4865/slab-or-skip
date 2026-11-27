import { useEffect, useMemo, useRef, useState } from 'react';
import { deviceStatus, initDeviceModel, lookUpValue, readCard, setCloudModel, type ModelReads, type Source, type ValueLookup } from './ai';
import { assembleRead } from './domain/assemble';
import type { CornerWear } from './domain/defects';
import { loadRuntimeConfig, type RuntimeConfig } from './firebase';
import { verdict, type Band, type ConditionRead, type Verdict } from './domain/grading';
import { DEFAULT_FEES, tierFee } from './domain/fees';
import { fetchAsBlob, prepareImage, type Prepared } from './image';
import { CardRow } from './components/CardRow';
import { CardDetail } from './components/CardDetail';

export interface Truth { ceiling: number; counterfeit: boolean }

export interface CardItem {
  id: string;
  label: string;
  prepared: Prepared;
  status: 'queued' | 'checking' | 'done' | 'error';
  read?: ConditionRead;
  verdict?: Verdict;
  source?: Source;
  ms?: number;
  reads?: ModelReads;
  error?: string;
  truth?: Truth;
  value?: ValueLookup;
  valueQuery?: string;
}

type DeviceState = Awaited<ReturnType<typeof deviceStatus>> | 'checking';
type Tab = 'all' | Band;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'all', label: 'All cards' },
  { id: 'gem', label: 'Worth a closer look' },
  { id: 'maybe', label: 'Borderline' },
  { id: 'skip', label: 'Skip' },
  { id: 'check', label: 'Check authenticity' },
];

const UNMEASURED_CORNERS: CornerWear = { topLeft: 'clean', topRight: 'clean', bottomLeft: 'clean', bottomRight: 'clean', shares: [], measurable: false };

export default function App() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [device, setDevice] = useState<DeviceState>('checking');
  const [forceCloud, setForceCloud] = useState(false);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [cfg, setCfg] = useState<RuntimeConfig>({ fees: DEFAULT_FEES, cloudModel: 'gemini-3.5-flash-lite', source: 'default' });
  const [tier, setTier] = useState(DEFAULT_FEES.defaultTier);
  const [loading, setLoading] = useState(false);
  const [binder, setBinder] = useState('Your binder');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void deviceStatus().then(setDevice);
    void loadRuntimeConfig().then((c) => { setCfg(c); setTier(c.fees.defaultTier); setCloudModel(c.cloudModel); });
  }, []);

  const update = (id: string, patch: Partial<CardItem>) =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  async function addFiles(files: FileList | File[]) {
    setLoading(true);
    const items: CardItem[] = [];
    for (const f of Array.from(files)) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) continue;
      items.push({ id: crypto.randomUUID(), label: f.name.replace(/\.[a-z]+$/i, ''), prepared: await prepareImage(f), status: 'queued' });
    }
    if (!cards.length) setBinder('Your binder');
    setCards((cs) => [...cs, ...items]);
    setLoading(false);
  }

  async function loadDemo() {
    setLoading(true);
    const base = import.meta.env.BASE_URL;
    const m = (await (await fetch(`${base}demo/manifest.json`)).json()) as { cards: Array<{ id: string; file: string; name: string; truth: Truth }> };
    const items: CardItem[] = [];
    for (const c of m.cards) {
      const blob = await fetchAsBlob(`${base}demo/${c.file}`);
      items.push({ id: c.id, label: c.name, prepared: await prepareImage(blob), status: 'queued', truth: c.truth });
    }
    setBinder('Demo binder');
    setCards(items);
    setSelected(null);
    setTab('all');
    setLoading(false);
  }

  async function runChecks() {
    if (running) return;
    setRunning(true);
    // User gesture: confirms or starts the Gemini Nano download. Never awaited: while it downloads,
    // each request goes to the cloud instead of making the user wait for gigabytes.
    if (!forceCloud) void initDeviceModel();
    // The hybrid on-device path only when Chrome reports the model ready; otherwise straight to the cloud.
    const useCloud = forceCloud || device !== 'available';
    const queue = cards.filter((c) => c.status !== 'done');
    for (const c of queue) {
      update(c.id, { status: 'checking', error: undefined });
      try {
        const r = await readCard(c.prepared.crops, useCloud);
        const centerMax = c.prepared.centering?.confident ? c.prepared.centering.maxGrade : null;
        const wear = c.prepared.wear;
        const read = assembleRead(wear?.corners ?? UNMEASURED_CORNERS, wear?.edges ?? 'clean', r.surface, r.text, wear?.lines ?? null);
        update(c.id, { status: 'done', read, reads: r, source: r.source, ms: r.ms, verdict: verdict(read, centerMax) });
      } catch (e) {
        update(c.id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }
    setRunning(false);
  }

  function resetChecks() {
    setCards((cs) => cs.map((c) => ({ ...c, status: 'queued', read: undefined, verdict: undefined, source: undefined, ms: undefined, reads: undefined, error: undefined, value: undefined })));
  }

  async function checkValue(id: string, query: string) {
    update(id, { valueQuery: query, value: undefined });
    try {
      update(id, { value: await lookUpValue(query) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A project without a paid Gemini plan has no Google Search grounding quota: say so and let the collector type prices.
      const unavailable = /429|quota|RESOURCE_EXHAUSTED/i.test(msg);
      update(id, { value: { prices: { raw: null, psa10: null, psa9: null, psa8: null, currency: 'USD' }, sources: [], summary: unavailable ? '' : 'The price search didn’t answer. Try again, or type the prices in.', ms: 0, unavailable } });
    }
  }

  useEffect(() => {
    // Dev-only hook for the evaluation script; stripped from production builds.
    if (import.meta.env.DEV) (window as unknown as { __slab?: unknown }).__slab = cards.map((c) => ({ label: c.label, error: c.error, truth: c.truth, read: c.read, reads: c.reads, verdict: c.verdict, wear: c.prepared.wear && { corners: c.prepared.wear.corners.shares, edge: c.prepared.wear.edgeShare, lines: c.prepared.wear.lines, measurable: c.prepared.wear.measurable } }));
  }, [cards]);

  const fee = tierFee(cfg.fees, tier);
  const perCard = fee.fee + cfg.fees.shippingPerCard;
  const stats = useMemo(() => {
    const done = cards.filter((c) => c.status === 'done');
    const by = (b: Band) => done.filter((c) => c.verdict?.band === b).length;
    const onDevice = done.filter((c) => c.source === 'on_device').length;
    const avgMs = done.length ? done.reduce((s, c) => s + (c.ms ?? 0), 0) / done.length : 0;
    const bytes = done.filter((c) => c.source === 'in_cloud').reduce((s, c) => s + Math.round((c.prepared.crops.card.length + c.prepared.crops.text.length) * 0.75), 0);
    const keyed = done.filter((c) => c.truth && c.verdict);
    const agree = keyed.filter((c) => {
      const t = c.truth!;
      const want: Band = t.counterfeit ? 'check' : t.ceiling >= 9 ? 'gem' : t.ceiling === 8 ? 'maybe' : 'skip';
      return c.verdict!.band === want;
    }).length;
    return { total: cards.length, done: done.length, gem: by('gem'), maybe: by('maybe'), skip: by('skip'), check: by('check'), queued: cards.length - done.length, onDevice, cloud: done.length - onDevice, avgMs, bytes, agree, keyed: keyed.length };
  }, [cards]);

  const counts: Record<Tab, number> = { all: stats.total, gem: stats.gem, maybe: stats.maybe, skip: stats.skip, check: stats.check };
  const visible = cards.filter((c) => tab === 'all' || c.verdict?.band === tab);
  const sel = cards.find((c) => c.id === selected) ?? null;
  const notSpent = (stats.skip + stats.check) * perCard;
  const usingCloud = forceCloud || (device !== 'available' && device !== 'checking');
  const pick = () => fileRef.current?.click();

  return (
    <>
      <header className="bar">
        <div className="brand"><SlabMark /> Slab or Skip</div>
        {cards.length > 0 && <div className="scope">{binder} · {stats.total} cards</div>}
        <div className="bar-right">
          <span className="model" aria-live="polite">
            <span className={`dot ${usingCloud ? 'cloud' : device === 'available' ? 'on' : ''}`} />
            <span className="long">{forceCloud ? 'Cloud Gemini (simulating a laptop without Gemini Nano)'
              : device === 'checking' ? 'Looking for Gemini Nano…'
                : device === 'available' ? 'Gemini Nano on this laptop'
                  : device === 'unavailable' ? 'No on-device model here: cloud Gemini'
                    : 'Gemini Nano is downloading: cloud Gemini until it’s ready'}</span>
            <span className="short">{usingCloud ? 'Cloud Gemini' : device === 'available' ? 'Gemini Nano' : 'Looking…'}</span>
          </span>
          <label className="switch" title="See the cloud fallback a laptop without Gemini Nano gets">
            <input type="checkbox" checked={forceCloud} onChange={(e) => setForceCloud(e.target.checked)} disabled={running} />
            <span>Simulate no Gemini Nano</span>
          </label>
        </div>
      </header>

      <main className="canvas">
        <div className="title-row">
          <div>
            <h1>{cards.length ? binder : 'Which of your cards are worth grading?'}</h1>
            <p className="finding">
              {!cards.length && 'Graders charge per card and most cards don’t come back a 10. Check a whole binder first. The photos stay on this laptop.'}
              {cards.length > 0 && stats.done === 0 && `${stats.total} card${stats.total === 1 ? '' : 's'} ready. Each one is measured from its pixels and read by Gemini Nano on this laptop.`}
              {stats.done > 0 && (
                <>
                  <b>{stats.gem} of {stats.done}</b> {stats.gem === 1 ? 'is' : 'are'} worth a closer look. <b>{stats.skip}</b> {stats.skip === 1 ? 'isn’t' : 'aren’t'} worth the ${fee.fee.toFixed(2)} {fee.label} fee
                  {stats.check > 0 && <>, and <b>{stats.check}</b> should be checked for authenticity first</>}.
                </>
              )}
            </p>
          </div>
          {cards.length > 0 && (
            <div className="actions">
              <select className="control" value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Grading tier">
                {cfg.fees.tiers.map((t) => <option key={t.id} value={t.id}>{t.label} · ${t.fee.toFixed(2)}</option>)}
              </select>
              <button className="btn" onClick={pick} disabled={running}>Add photos</button>
              {stats.done > 0 && !running && stats.queued === 0
                ? <button className="btn" onClick={resetChecks}>Check again</button>
                : <button className="btn primary" onClick={runChecks} disabled={running || loading || stats.queued === 0}>
                    {running ? `Checking ${Math.min(stats.done + 1, stats.total)} of ${stats.total}…` : `Check ${stats.queued} card${stats.queued === 1 ? '' : 's'}`}
                  </button>}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>

        {cards.length === 0 ? (
          <section className="first" aria-labelledby="first-h">
            <div>
              <h2 id="first-h">Start with a binder</h2>
              <p>Add straight-on photos of card fronts on a dark surface, or try twelve fictional demo cards with known flaws.</p>
              <div className="pair">
                <button className="btn primary" onClick={loadDemo} disabled={loading}>{loading ? 'Loading…' : 'Load the demo binder'}</button>
                <button className="btn" onClick={pick} disabled={loading}>Add card photos</button>
              </div>
              <ol>
                <li>Code measures centering, corner whitening and edge chips from the pixels.</li>
                <li>Gemini Nano reads each card on this laptop: lines across the surface, the name, the number and the print tells of a fake.</li>
                <li>For the few worth it, cloud Gemini looks up sold prices with Google Search. Only the card’s name leaves the laptop.</li>
              </ol>
            </div>
            <figure aria-hidden="true">
              <img src={`${import.meta.env.BASE_URL}demo/c01-emberfox.jpg`} alt="" />
              <img src={`${import.meta.env.BASE_URL}demo/c03-thornback.jpg`} alt="" />
            </figure>
          </section>
        ) : (
          <>
            <section className="strip" aria-label="Binder summary">
              <div className="kpi lead"><span className="label">Worth a closer look</span><span className="value num">{stats.done ? stats.gem : '–'}</span><span className="sub">best grade 9 or 10 from the photo</span></div>
              <div className="kpi"><span className="label">Skip grading</span><span className="value num">{stats.done ? stats.skip : '–'}</span><span className="sub">{stats.maybe ? `plus ${stats.maybe} borderline` : 'best grade 7 or lower'}</span></div>
              <div className="kpi"><span className="label">Check authenticity</span><span className="value num">{stats.done ? stats.check : '–'}</span><span className="sub">print tells of a counterfeit</span></div>
              <div className="kpi money"><span className="label">Fees you won’t pay</span><span className="value num">{stats.done ? `$${notSpent.toFixed(2)}` : '–'}</span><span className="sub num">{stats.skip + stats.check} × ${perCard.toFixed(2)} ({fee.label} fee + shipping)</span></div>
            </section>
            {stats.done > 0 && (
              <p className="proof">
                <span><span className={`dot ${stats.cloud ? 'cloud' : 'on'}`} />{stats.onDevice} read on this laptop{stats.cloud ? `, ${stats.cloud} in the cloud` : ''}</span>
                <span className="num">{(stats.avgMs / 1000).toFixed(1)} s a card</span>
                <span className="num">{stats.bytes ? `${Math.round(stats.bytes / 1000)} KB of photos sent` : '0 bytes of photos sent'}</span>
                {stats.keyed > 0 && <span className="num">{stats.agree} of {stats.keyed} match the demo’s answer key</span>}
              </p>
            )}

            <div className="tabs" role="tablist" aria-label="Filter cards">
              {TABS.map((t) => (
                <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}<span className="n num">{counts[t.id]}</span>
                </button>
              ))}
            </div>

            <div className={`work${sel ? ' open' : ''}`}>
              <section className="list" aria-label="Cards">
                <div className="list-head" aria-hidden="true">
                  <span />
                  <span>Card</span>
                  <span>Pre-check</span>
                  <span className="r">Best</span>
                  <span className="col-why">What limits it</span>
                  <span className="col-src r">Read by</span>
                </div>
                {visible.map((c) => (
                  <CardRow key={c.id} card={c} selected={c.id === selected} onOpen={() => setSelected(c.id === selected ? null : c.id)} />
                ))}
                {visible.length === 0 && <p className="empty">{stats.done ? 'No cards landed here.' : 'Run the check to sort the binder.'}</p>}
              </section>
              {sel && (
                <CardDetail
                  card={sel}
                  fee={fee}
                  shipping={cfg.fees.shippingPerCard}
                  onClose={() => setSelected(null)}
                  onCheckValue={(q) => checkValue(sel.id, q)}
                />
              )}
            </div>
          </>
        )}
      </main>

      <footer className="foot">
        <span>Grading fees from Firebase Remote Config ({cfg.source === 'remote' ? 'live' : 'built-in default'}, {cfg.fees.updated}) · <a href={cfg.fees.source} target="_blank" rel="noreferrer">grader’s price page</a></span>
        <span>A pre-check is not a grade. Demo cards are fictional originals.</span>
      </footer>
    </>
  );
}

function SlabMark() {
  // A grading slab: the label on top, the card window below.
  return (
    <svg className="mark" viewBox="0 0 22 28" aria-hidden="true">
      <rect x="1" y="1" width="20" height="26" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="3.5" width="15" height="5" rx="1" fill="var(--hue)" />
      <rect x="5" y="11" width="12" height="13.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
