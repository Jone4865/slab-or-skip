import type { CardItem } from '../App';

export const BAND_TEXT: Record<string, string> = {
  gem: 'Worth a closer look',
  maybe: 'Borderline',
  skip: 'Skip grading',
  check: 'Check authenticity',
};

const LIMIT_TEXT: Record<string, string> = { centering: 'Centering', corners: 'Corner whitening', edges: 'Edge chips', surface: 'Surface lines' };

export function limitLine(card: CardItem): string {
  const v = card.verdict;
  if (!v) return '';
  if (v.band === 'check') return card.read?.counterfeitSigns.join('; ') ?? 'Print tells of a counterfeit';
  if (!v.limitedBy.length) return 'Nothing visible in the photo';
  return v.limitedBy.map((l) => (l === 'centering' && card.prepared.centering ? `Centering ${worstAxis(card)}` : LIMIT_TEXT[l] ?? l)).join(', ');
}

function worstAxis(card: CardItem): string {
  const c = card.prepared.centering!;
  const pct = (s: number) => `${Math.round(s * 100)}/${100 - Math.round(s * 100)}`;
  return c.leftRight >= c.topBottom ? `${pct(c.leftRight)} left-right` : `${pct(c.topBottom)} top-bottom`;
}

export function CardRow({ card, selected, onOpen }: { card: CardItem; selected: boolean; onOpen: () => void }) {
  const r = card.read;
  const name = r?.cardName || card.label;
  return (
    <div className="row" role="button" tabIndex={0} aria-selected={selected} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      aria-label={`${name}${card.verdict ? `: ${BAND_TEXT[card.verdict.band]}` : ''}`}>
      <div className="thumb">
        <img src={card.prepared.url} alt="" loading="lazy" />
        {card.status === 'checking' && <span className="scan" />}
      </div>
      <div className="ident">
        <b>{name}</b>
        <span className="num">{r?.cardNumber || (card.status === 'checking' ? 'Reading…' : '')}</span>
      </div>
      {card.status === 'done' && card.verdict
        ? <span className={`pill ${card.verdict.band}`}>{BAND_TEXT[card.verdict.band]}</span>
        : card.status === 'checking' ? <span className="bar-skel" aria-label="Checking" />
          : card.status === 'error' ? <span className="err">Couldn’t read</span>
            : <span className="pill pending">Not checked</span>}
      <span className="grade">{card.verdict ? <><small>≤</small>{card.verdict.ceiling}</> : <span className="muted">–</span>}</span>
      <span className="why col-why">{limitLine(card)}</span>
      <span className="src col-src">{card.source ? `${card.source === 'on_device' ? 'This laptop' : 'Cloud'} · ${((card.ms ?? 0) / 1000).toFixed(1)} s` : ''}</span>
    </div>
  );
}
