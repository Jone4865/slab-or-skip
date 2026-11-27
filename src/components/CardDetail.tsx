import { useEffect, useState } from 'react';
import type { CardItem } from '../App';
import { gradingEconomics, type Prices } from '../domain/grading';
import type { FeeTier } from '../domain/fees';
import { CenteringOverlay } from './CenteringOverlay';
import { BAND_TEXT } from './CardRow';

const pretty = (s: string) => s.replace(/_/g, ' ');
const money = (n: number) => `$${n.toFixed(2)}`;

type PriceKey = 'raw' | 'psa10' | 'psa9' | 'psa8';
const PRICE_KEYS: Array<[PriceKey, string]> = [['raw', 'Raw'], ['psa10', 'PSA 10'], ['psa9', 'PSA 9'], ['psa8', 'PSA 8']];
const EMPTY: Record<PriceKey, string> = { raw: '', psa10: '', psa9: '', psa8: '' };

export function CardDetail({ card, fee, shipping, onClose, onCheckValue }: {
  card: CardItem;
  fee: FeeTier;
  shipping: number;
  onClose: () => void;
  onCheckValue: (query: string) => void;
}) {
  const r = card.read;
  const c = card.prepared.centering;
  const wear = card.prepared.wear;
  const suggested = [r?.cardName || card.label, r?.cardNumber].filter(Boolean).join(' ');
  const [query, setQuery] = useState(card.valueQuery ?? suggested);
  const [busy, setBusy] = useState(false);
  // Sold prices are editable: filled in by the search when it finds them, typed in by the collector otherwise.
  const [prices, setPrices] = useState<Record<PriceKey, string>>(EMPTY);
  useEffect(() => { setQuery(card.valueQuery ?? suggested); setBusy(false); setPrices(EMPTY); }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!card.value) return;
    setBusy(false);
    const found = card.value.prices;
    setPrices((p) => Object.fromEntries(PRICE_KEYS.map(([k]) => [k, found[k] !== null ? String(found[k]) : p[k]])) as Record<PriceKey, string>);
  }, [card.value]);
  const parsed: Prices = { ...(Object.fromEntries(PRICE_KEYS.map(([k]) => {
    const n = Number(prices[k].replace(/[$,\s]/g, ''));
    return [k, prices[k].trim() && Number.isFinite(n) && n > 0 ? n : null];
  })) as Record<PriceKey, number | null>), currency: 'USD' };
  const economics = card.verdict ? gradingEconomics(card.verdict.ceiling, parsed, fee.fee, shipping) : null;
  const searchOff = !!card.value?.unavailable;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const corners = wear?.corners;
  const cornerText = corners && corners.measurable
    ? (['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).filter((k) => corners[k] !== 'clean').map((k) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${pretty(corners[k])}`).join(', ') || 'All four clean'
    : 'Can’t tell on a white border';
  const pct = (s: number) => `${Math.round(s * 100)}/${100 - Math.round(s * 100)}`;
  const reader = card.source === 'on_device' ? 'Gemini Nano' : 'Cloud Gemini';

  return (
    <aside className="pane" aria-label={`Details for ${r?.cardName || card.label}`}>
      <div className="pane-head">
        <div>
          <h2>{r?.cardName || card.label}</h2>
          <p className="num">{r?.cardNumber || 'Not checked yet'}{card.verdict ? ` · ${BAND_TEXT[card.verdict.band]}` : ''}</p>
        </div>
        <button className="btn quiet" onClick={onClose} aria-label="Close details">Close</button>
      </div>

      <div className="pane-body">
        <div className="photo">
          <img src={card.prepared.url} alt={`Photo of ${r?.cardName || card.label}, with its measured borders drawn on top`} />
          {c?.confident && <CenteringOverlay c={c} w={card.prepared.width} h={card.prepared.height} />}
        </div>

        {card.status === 'error' && <p className="err-note">Couldn’t read this card: {card.error?.slice(0, 160)}. Try “Check” again.</p>}
        {card.status !== 'done' && card.status !== 'error' && <p className="muted" style={{ margin: 0 }}>Run the check to see this card’s condition. The blue lines are its measured borders.</p>}

        {r && card.verdict && (
          <section className="sec" aria-labelledby="cond-h">
            <h3 id="cond-h">Condition from the photo</h3>
            <table className="kv">
              <tbody>
                <tr><th>Centering</th><td className="num">{c?.confident ? <>{pct(c.leftRight)} left-right, {pct(c.topBottom)} top-bottom. Allows up to {c.maxGrade}.</> : 'Couldn’t measure: take the photo straight on'}</td><td className="by">Measured</td></tr>
                <tr><th>Corners</th><td>{cornerText}</td><td className="by">Measured</td></tr>
                <tr><th>Edges</th><td>{wear?.measurable === false ? 'Can’t tell on a white border' : pretty(r.edges) === 'clean' ? 'Clean' : pretty(r.edges)}</td><td className="by">Measured</td></tr>
                <tr><th>Surface</th><td>{r.surface === 'clean' ? 'No lines across the card' : r.surface === 'light_scratches' ? 'A possible faint line. Look at it under a lamp' : r.surface === 'scratches' ? 'Several scratches across the card' : 'A fold line across the card'}</td><td className="by">{reader} + code</td></tr>
                <tr><th>Print</th><td>{r.counterfeitSigns.length ? r.counterfeitSigns.join('; ') : 'No tells of a counterfeit'}</td><td className="by">{reader}</td></tr>
              </tbody>
            </table>
            <div className="ceiling">
              <span className="big"><small className="muted">≤</small>{card.verdict.ceiling}</span>
              <span>best grade this photo supports{card.verdict.limitedBy.length ? `, limited by ${card.verdict.limitedBy.join(' and ')}` : ''}</span>
            </div>
            {r.notes && <p className="note">{reader}: “{r.notes}”</p>}
            {card.truth && <p className="note small">Demo answer key: best grade {card.truth.ceiling}{card.truth.counterfeit ? ', counterfeit' : ''}.</p>}
          </section>
        )}

        {r && card.verdict && (
          <section className="sec" aria-labelledby="value-h">
            <h3 id="value-h">Is grading worth it?</h3>
            <p className="leaves">Cloud Gemini searches recent sales. Only this text leaves the laptop: <code>{query || '…'}</code></p>
            <form className="value-form" onSubmit={(e) => { e.preventDefault(); if (!query.trim()) return; setBusy(true); onCheckValue(query.trim()); }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Card name, number and set to look up" placeholder="Card name, number and set" />
              <button className="btn primary" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Check prices'}</button>
            </form>

            {searchOff && <p className="note">Live price search isn’t switched on for this deployment (Google Search grounding needs a paid Gemini plan). Type the sold prices you see on recent listings instead.</p>}
            {card.value && !searchOff && card.value.summary && <p className="note small">{card.value.summary}</p>}

            <fieldset className="price-grid">
              <legend>Recent sold prices, USD</legend>
              {PRICE_KEYS.map(([k, label]) => (
                <label key={k}>
                  <span>{label}</span>
                  <input inputMode="decimal" value={prices[k]} placeholder="–" onChange={(e) => setPrices((p) => ({ ...p, [k]: e.target.value }))} />
                </label>
              ))}
            </fieldset>

            {economics && economics.decision !== 'UNKNOWN' ? (
              <div className={`decision ${economics.decision.toLowerCase()}`}>
                <span className="verdict">{economics.decision === 'SLAB' ? 'Send it to the grader' : 'Keep it raw'}</span>
                <span className="num">Expected after grading {money(economics.expectedGraded)} − fee {money(fee.fee)} − shipping {money(shipping)} vs raw {money(economics.rawValue)}</span>
                <span className={`net num ${economics.netGain > 0 ? 'pos' : 'neg'}`}>{economics.netGain >= 0 ? '+' : '−'}{money(Math.abs(economics.netGain))} a card</span>
                <span className="muted small">Odds from the photo’s best grade: {economics.breakdown.map((b) => `${b.grade}: ${Math.round(b.odds * 100)}%`).join(' · ')}. A rule of thumb, not a grader’s model.</span>
              </div>
            ) : (
              <p className="note small">Needs the raw price and a PSA 10 or PSA 9 price to decide.</p>
            )}
            {card.value && card.value.sources.length > 0 && (
              <ul className="sources">{card.value.sources.map((src) => <li key={src.url}><a href={src.url} target="_blank" rel="noreferrer">{src.title || new URL(src.url).hostname}</a></li>)}</ul>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
