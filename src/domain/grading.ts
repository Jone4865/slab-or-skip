// Pure scoring: combine the on-device condition read with measured centering,
// then decide whether paying a grading fee is worth it.

export type CornerState = 'clean' | 'light_wear' | 'whitening' | 'damaged';
export type EdgeState = 'clean' | 'light_wear' | 'chipping';
export type SurfaceState = 'clean' | 'light_scratches' | 'scratches' | 'crease_or_dent';
export type Risk = 'low' | 'medium' | 'high';

export interface ConditionRead {
  cardName: string;
  cardNumber: string;
  corners: { topLeft: CornerState; topRight: CornerState; bottomLeft: CornerState; bottomRight: CornerState };
  edges: EdgeState;
  surface: SurfaceState;
  counterfeitRisk: Risk;
  counterfeitSigns: string[];
  notes: string;
}

export type Band = 'gem' | 'maybe' | 'skip' | 'check';

const CORNER_MAX: Record<CornerState, number> = { clean: 10, light_wear: 9, whitening: 8, damaged: 6 };
const EDGE_MAX: Record<EdgeState, number> = { clean: 10, light_wear: 9, chipping: 7 };
const SURFACE_MAX: Record<SurfaceState, number> = { clean: 10, light_scratches: 9, scratches: 7, crease_or_dent: 5 };

export interface Verdict {
  ceiling: number; // highest grade the evidence allows
  limitedBy: string[]; // what capped it
  band: Band;
  headline: string;
}

export function conditionCeiling(c: ConditionRead): { ceiling: number; limitedBy: string[] } {
  const parts: Array<[string, number]> = [
    ['corners', Math.min(...Object.values(c.corners).map((s) => CORNER_MAX[s] ?? 8))],
    ['edges', EDGE_MAX[c.edges] ?? 8],
    ['surface', SURFACE_MAX[c.surface] ?? 8],
  ];
  const ceiling = Math.min(...parts.map((p) => p[1]));
  return { ceiling, limitedBy: parts.filter((p) => p[1] === ceiling && ceiling < 10).map((p) => p[0]) };
}

export function verdict(c: ConditionRead, centeringMax: number | null): Verdict {
  const cond = conditionCeiling(c);
  let ceiling = cond.ceiling;
  const limitedBy = [...cond.limitedBy];
  if (centeringMax !== null) {
    if (centeringMax < ceiling) { ceiling = centeringMax; limitedBy.splice(0, limitedBy.length, 'centering'); }
    else if (centeringMax === ceiling && ceiling < 10) limitedBy.push('centering');
  }
  if (c.counterfeitRisk !== 'low') {
    // A fake comes back from a grader ungraded, fee still paid. Any red flag stops the submission.
    return { ceiling, limitedBy, band: 'check', headline: 'Stop. Check authenticity before you pay' };
  }
  const band: Band = ceiling >= 9 ? 'gem' : ceiling === 8 ? 'maybe' : 'skip';
  const headline =
    band === 'gem' ? 'Gem candidate, worth a closer look'
      : band === 'maybe' ? 'Borderline, only if the card is valuable'
        : 'Skip grading, the fee likely costs more than it adds';
  return { ceiling, limitedBy, band, headline };
}

/**
 * Rough grade distribution given an evidence ceiling. Heuristic, not a model of any grader:
 * a photo cannot see everything, so the real grade is usually at or below the ceiling.
 */
export function gradeOdds(ceiling: number): Record<number, number> {
  if (ceiling >= 10) return { 10: 0.45, 9: 0.4, 8: 0.15 };
  if (ceiling === 9) return { 10: 0.08, 9: 0.55, 8: 0.37 };
  if (ceiling === 8) return { 9: 0.12, 8: 0.55, 7: 0.33 };
  return { [ceiling]: 0.6, [Math.max(1, ceiling - 1)]: 0.4 };
}

export interface Prices {
  raw: number | null;
  psa10: number | null;
  psa9: number | null;
  psa8: number | null;
  currency: string;
}

export interface Economics {
  expectedGraded: number;
  cost: number;
  rawValue: number;
  netGain: number;
  decision: 'SLAB' | 'SKIP' | 'UNKNOWN';
  breakdown: Array<{ grade: number; odds: number; price: number }>;
}

/** Expected value of grading vs selling/keeping raw. Missing grade prices fall back conservatively. */
export function gradingEconomics(ceiling: number, prices: Prices, fee: number, shipping: number): Economics {
  const raw = prices.raw;
  if (raw === null || (prices.psa10 === null && prices.psa9 === null)) {
    return { expectedGraded: 0, cost: fee + shipping, rawValue: raw ?? 0, netGain: 0, decision: 'UNKNOWN', breakdown: [] };
  }
  const priceFor = (g: number): number => {
    if (g >= 10 && prices.psa10 !== null) return prices.psa10;
    if (g === 9 && prices.psa9 !== null) return prices.psa9;
    if (g === 8 && prices.psa8 !== null) return prices.psa8;
    if (g >= 9 && prices.psa9 !== null) return prices.psa9;
    // Low grades rarely beat raw; assume they sell below raw.
    return raw * 0.9;
  };
  const odds = gradeOdds(ceiling);
  const breakdown = Object.entries(odds)
    .map(([g, p]) => ({ grade: Number(g), odds: p, price: priceFor(Number(g)) }))
    .sort((a, b) => b.grade - a.grade);
  const expectedGraded = breakdown.reduce((s, r) => s + r.odds * r.price, 0);
  const cost = fee + shipping;
  const netGain = expectedGraded - cost - raw;
  return { expectedGraded, cost, rawValue: raw, netGain, decision: netGain > 0 ? 'SLAB' : 'SKIP', breakdown };
}
