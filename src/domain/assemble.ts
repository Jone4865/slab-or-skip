// Puts the pieces of a pre-check together: pixel measurements from code, reads from the model.
import type { CornerWear, LineEvidence } from './defects';
import type { ConditionRead, EdgeState, Risk, SurfaceState } from './grading';

export interface SurfaceRead { brightLineAcross: boolean; lineCount: number; notes: string }
export interface TextRead { cardName: string; cardNumber: string; hpText: string; moveTitle: string }

const MISSPELLINGS = /\b(atack|attak|attck|damge|dammage|energie|pokemom|trainner)\b/i;

/** Counterfeit red flags we can check from what the model read. Each flag names what was seen. */
export function counterfeitSigns(t: TextRead): string[] {
  const signs: string[] = [];
  if (/^\s*\d{2,3}\s*HP\b/i.test(t.hpText)) signs.push(`HP printed after the number ("${t.hpText.trim()}")`);
  const m = `${t.moveTitle}`.match(MISSPELLINGS);
  if (m) signs.push(`Misspelled word "${m[0]}"`);
  return signs;
}

export function riskFrom(signs: string[]): Risk {
  return signs.length >= 2 ? 'high' : signs.length === 1 ? 'medium' : 'low';
}

/**
 * Code and model must agree before a surface flaw caps the grade hard.
 * One voice alone (a holo pattern can fool the model; print can fool the detector) only marks it for a closer look.
 */
export function surfaceFrom(s: SurfaceRead, lines: LineEvidence | null): { state: SurfaceState; agreed: boolean } {
  const modelSees = s.brightLineAcross;
  const codeSees = !!lines && lines.count > 0;
  if (modelSees && codeSees) {
    const crease = lines!.count === 1 && lines!.longest > 0.15;
    return { state: crease ? 'crease_or_dent' : 'scratches', agreed: true };
  }
  if (modelSees || codeSees) return { state: 'light_scratches', agreed: false };
  return { state: 'clean', agreed: true };
}

export function assembleRead(corners: CornerWear, edges: EdgeState, surface: SurfaceRead, text: TextRead, lines: LineEvidence | null = null): ConditionRead {
  const signs = counterfeitSigns(text);
  const surf = surfaceFrom(surface, lines);
  return {
    cardName: text.cardName.trim(),
    cardNumber: text.cardNumber.trim(),
    corners: { topLeft: corners.topLeft, topRight: corners.topRight, bottomLeft: corners.bottomLeft, bottomRight: corners.bottomRight },
    edges,
    surface: surf.state,
    counterfeitRisk: riskFrom(signs),
    counterfeitSigns: signs,
    notes: surface.notes.trim(),
  };
}
