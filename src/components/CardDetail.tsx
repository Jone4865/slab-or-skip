import { useEffect, useState } from 'react';
import type { CardItem } from '../App';
import type { Economics } from '../domain/grading';
import type { FeeTier } from '../domain/fees';
import { CenteringOverlay } from './CenteringOverlay';
import { BAND_TEXT } from './CardRow';

const pretty = (s: string) => s.replace(/_/g, ' ');
const money = (n: number) => `$${n.toFixed(2)}`;

export function CardDetail({ card, fee, shipping, onClose, onCheckValue, economics }: {
  card: CardItem;
  fee: FeeTier;
  shipping: number;
  onClose: () => void;
  onCheckValue: (query: string) => void;
  economics: Economics | null;
}) {
  const r = card.read;
  const c = card.prepared.centering;
  const wear = card.prepared.wear;
  const suggested = [r?.cardName || card.label, r?.cardNumber].filter(Boolean).join(' ');
  const [query, setQuery] = useState(card.valueQuery ?? suggested);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setQuery(card.valueQuery ?? suggested); setBusy(false); }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (card.value) setBusy(false); }, [card.value]);
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

            {card.value && (
              <>
                <table className="prices">
                  <thead><tr><th>Sold prices</th><th>Raw</th><th>PSA 10</th><th>PSA 9</th><th>PSA 8</th></tr></thead>
                  <tbody><tr><td className="muted" style={{ fontSize: 13, fontWeight: 400 }}>USD</td>{[card.value.prices.raw, card.value.prices.psa10, card.value.prices.psa9, card.value.prices.psa8].map((p, i) => <td key={i}>{p === null ? <span className="muted">–</span> : money(p)}</td>)}</tr></tbody>
                </table>
                {economics && economics.decision !== 'UNKNOWN' ? (
                  <div className={`decision ${economics.decision.toLowerCase()}`}>
                    <span className="verdict">{economics.decision === 'SLAB' ? 'Send it to the grader' : 'Keep it raw'}</span>
                    <span className="num">Expected after grading {money(economics.expectedGraded)} − fee {money(fee.fee)} − shipping {money(shipping)} vs raw {money(economics.rawValue)}</span>
                    <span className={`net num ${economics.netGain > 0 ? 'pos' : 'neg'}`}>{economics.netGain >= 0 ? '+' : '−'}{money(Math.abs(economics.netGain))} a card</span>
                    <span className="muted small">Odds from the photo’s best grade: {economics.breakdown.map((b) => `${b.grade}: ${Math.round(b.odds * 100)}%`).join(' · ')}. A rule of thumb, not a grader’s model.</span>
                  </div>
                ) : (
                  <p className="note">Not enough sold prices to decide. Add the set name and number and search again.</p>
                )}
                {card.value.summary && <p className="note small">{card.value.summary}</p>}
                {card.value.sources.length > 0 && (
                  <ul className="sources">{card.value.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title || new URL(s.url).hostname}</a></li>)}</ul>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
