import { describe, expect, it } from 'vitest';
import { maxGradeForShare, measureCentering, type RGBAImage } from './centering';
import { conditionCeiling, gradeOdds, gradingEconomics, verdict, type ConditionRead } from './grading';
import { DEFAULT_FEES, parseFeeTable, tierFee } from './fees';

/** Dark mat, light card border, dark art window offset by (dx, dy). */
function synthCard(opts: { w?: number; h?: number; left: number; right: number; top: number; bottom: number }): RGBAImage {
  const W = 600, H = 800;
  const data = new Uint8ClampedArray(W * H * 4);
  const cardW = opts.w ?? 400, cardH = opts.h ?? 560;
  const cx = 100, cy = 120;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let c = [20, 24, 30];
    const inCard = x >= cx && x < cx + cardW && y >= cy && y < cy + cardH;
    if (inCard) {
      c = [210, 214, 220];
      const inArt = x >= cx + opts.left && x < cx + cardW - opts.right && y >= cy + opts.top && y < cy + cardH - opts.bottom;
      if (inArt) c = [40, 90, 150];
    }
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { width: W, height: H, data };
}

const clean: ConditionRead = {
  cardName: 'Emberfox', cardNumber: '012/180',
  corners: { topLeft: 'clean', topRight: 'clean', bottomLeft: 'clean', bottomRight: 'clean' },
  edges: 'clean', surface: 'clean', counterfeitRisk: 'low', counterfeitSigns: [], notes: '',
};

describe('centering', () => {
  it('finds the card and measures a centered border as 50/50', () => {
    const c = measureCentering(synthCard({ left: 30, right: 30, top: 30, bottom: 30 }));
    expect(c.card.left).toBeGreaterThanOrEqual(98);
    expect(c.card.left).toBeLessThanOrEqual(102);
    expect(c.leftRight).toBeCloseTo(0.5, 1);
    expect(c.topBottom).toBeCloseTo(0.5, 1);
    expect(c.maxGrade).toBe(10);
    expect(c.confident).toBe(true);
  });

  it('measures an off-center card (40 vs 20 px = 67/33) and caps the grade', () => {
    const c = measureCentering(synthCard({ left: 40, right: 20, top: 30, bottom: 30 }));
    expect(c.leftRight).toBeGreaterThan(0.63);
    expect(c.leftRight).toBeLessThan(0.7);
    expect(c.maxGrade).toBe(7);
  });

  it('maps shares to published centering ceilings', () => {
    expect(maxGradeForShare(0.55)).toBe(10);
    expect(maxGradeForShare(0.58)).toBe(9);
    expect(maxGradeForShare(0.64)).toBe(8);
    expect(maxGradeForShare(0.9)).toBe(4);
  });
});

describe('grading', () => {
  it('a clean, centered card is a gem candidate', () => {
    expect(verdict(clean, 10).band).toBe('gem');
  });
  it('centering caps the ceiling and is reported', () => {
    const v = verdict(clean, 7);
    expect(v.ceiling).toBe(7);
    expect(v.band).toBe('skip');
    expect(v.limitedBy).toEqual(['centering']);
  });
  it('worst flaw wins: a crease caps at 5', () => {
    expect(conditionCeiling({ ...clean, surface: 'crease_or_dent' }).ceiling).toBe(5);
  });
  it('any counterfeit red flag stops the submission', () => {
    expect(verdict({ ...clean, counterfeitRisk: 'high' }, 10).band).toBe('check');
    expect(verdict({ ...clean, counterfeitRisk: 'medium' }, 10).band).toBe('check');
  });
  it('odds sum to 1', () => {
    for (const c of [10, 9, 8, 7, 5]) {
      const s = Object.values(gradeOdds(c)).reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1, 5);
    }
  });
  it('grading pays when a PSA 10 is worth far more than raw', () => {
    const e = gradingEconomics(10, { raw: 60, psa10: 300, psa9: 110, psa8: 70, currency: 'USD' }, 32.99, 5);
    expect(e.decision).toBe('SLAB');
    expect(e.netGain).toBeGreaterThan(0);
  });
  it('grading a cheap card loses money', () => {
    const e = gradingEconomics(9, { raw: 8, psa10: 40, psa9: 15, psa8: 10, currency: 'USD' }, 32.99, 5);
    expect(e.decision).toBe('SKIP');
  });
  it('missing prices give UNKNOWN instead of a guess', () => {
    expect(gradingEconomics(10, { raw: null, psa10: null, psa9: null, psa8: null, currency: 'USD' }, 30, 5).decision).toBe('UNKNOWN');
  });
});

describe('fees', () => {
  it('falls back to defaults on bad Remote Config JSON', () => {
    expect(parseFeeTable('{nope')).toBe(DEFAULT_FEES);
    expect(parseFeeTable('{"tiers":[{"id":"x"}]}')).toBe(DEFAULT_FEES);
  });
  it('accepts a valid override and finds tiers', () => {
    const t = parseFeeTable(JSON.stringify({ ...DEFAULT_FEES, tiers: [{ id: 'value', label: 'Value', fee: 39.99 }] }));
    expect(tierFee(t, 'value').fee).toBe(39.99);
    expect(tierFee(t, 'missing').id).toBe('value');
  });
});

import { counterfeitSigns, surfaceFrom } from './assemble';

describe('assemble', () => {
  const text = { cardName: 'Frostling', cardNumber: '103/180', hpText: 'HP 130', moveTitle: 'Attack: Flare Rush' };
  it('flags HP printed after the number and misspellings', () => {
    expect(counterfeitSigns(text)).toEqual([]);
    expect(counterfeitSigns({ ...text, hpText: '130 HP' })).toHaveLength(1);
    expect(counterfeitSigns({ ...text, hpText: '130 HP', moveTitle: 'Atack: Flare Rush' })).toHaveLength(2);
  });
  it('needs code and model to agree before a surface flaw caps hard', () => {
    const none = { count: 0, longest: 0, angles: [] };
    const one = { count: 1, longest: 0.8, angles: [24] };
    const many = { count: 3, longest: 0.5, angles: [18, 160, 24] };
    expect(surfaceFrom({ brightLineAcross: true, lineCount: 1, notes: '' }, none).state).toBe('light_scratches');
    expect(surfaceFrom({ brightLineAcross: false, lineCount: 0, notes: '' }, one).state).toBe('light_scratches');
    expect(surfaceFrom({ brightLineAcross: true, lineCount: 1, notes: '' }, one).state).toBe('crease_or_dent');
    expect(surfaceFrom({ brightLineAcross: true, lineCount: 3, notes: '' }, many).state).toBe('scratches');
    expect(surfaceFrom({ brightLineAcross: false, lineCount: 0, notes: '' }, none).state).toBe('clean');
  });
});
