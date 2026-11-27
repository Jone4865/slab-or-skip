// Pixel measurements for wear that a small on-device model can't see reliably at photo scale.
// Heuristics: tuned on straight-on photos against a dark background; they flag, they don't grade.
import type { Box, RGBAImage } from './centering';
import type { CornerState, EdgeState } from './grading';

const WHITE = 242;
const isWhite = (img: RGBAImage, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return img.data[i] >= WHITE && img.data[i + 1] >= WHITE && img.data[i + 2] >= WHITE;
};

function whiteShare(img: RGBAImage, x0: number, y0: number, w: number, h: number): number {
  let n = 0, hit = 0;
  const xs = Math.max(0, Math.floor(x0)), ys = Math.max(0, Math.floor(y0));
  const xe = Math.min(img.width, Math.floor(x0 + w)), ye = Math.min(img.height, Math.floor(y0 + h));
  for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) { n++; if (isWhite(img, x, y)) hit++; }
  return n ? hit / n : 0;
}

export interface CornerWear {
  topLeft: CornerState; topRight: CornerState; bottomLeft: CornerState; bottomRight: CornerState;
  shares: number[];
  /** False when the card's own border is near-white, so white wear can't be told apart from it. */
  measurable: boolean;
}

/** Median colour of the card border, sampled just inside each edge. */
export function borderIsNearWhite(img: RGBAImage, card: Box): boolean {
  const cw = card.right - card.left, ch = card.bottom - card.top;
  const inset = Math.max(3, Math.round(cw * 0.02));
  const mins: number[] = [];
  for (let t = 0.3; t <= 0.7; t += 0.05) {
    for (const [x, y] of [[card.left + inset, card.top + ch * t], [card.right - 1 - inset, card.top + ch * t], [card.left + cw * t, card.top + inset], [card.left + cw * t, card.bottom - 1 - inset]]) {
      const i = (Math.round(y) * img.width + Math.round(x)) * 4;
      mins.push(Math.min(img.data[i], img.data[i + 1], img.data[i + 2]));
    }
  }
  mins.sort((a, b) => a - b);
  return mins[Math.floor(mins.length / 2)] >= 228;
}

/** Share of pure-white pixels in a small square at each corner tip of the card. */
export function cornerWear(img: RGBAImage, card: Box): CornerWear {
  const cw = card.right - card.left;
  const s = Math.max(8, Math.round(cw * 0.09));
  const shares = [
    whiteShare(img, card.left, card.top, s, s),
    whiteShare(img, card.right - s, card.top, s, s),
    whiteShare(img, card.left, card.bottom - s, s, s),
    whiteShare(img, card.right - s, card.bottom - s, s, s),
  ];
  const measurable = !borderIsNearWhite(img, card);
  const state = (v: number): CornerState => (!measurable ? 'clean' : v > 0.25 ? 'whitening' : v > 0.07 ? 'light_wear' : 'clean');
  return { topLeft: state(shares[0]), topRight: state(shares[1]), bottomLeft: state(shares[2]), bottomRight: state(shares[3]), shares, measurable };
}

/** White flecks in a thin strip along each edge, ignoring the corners. */
export function edgeWear(img: RGBAImage, card: Box): { state: EdgeState; share: number; measurable: boolean } {
  if (borderIsNearWhite(img, card)) return { state: 'clean', share: 0, measurable: false };
  const cw = card.right - card.left;
  const ch = card.bottom - card.top;
  const t = Math.max(3, Math.round(cw * 0.014));
  const mx = cw * 0.12, my = ch * 0.1;
  const share = Math.max(
    whiteShare(img, card.left + mx, card.top, cw - 2 * mx, t),
    whiteShare(img, card.left + mx, card.bottom - t, cw - 2 * mx, t),
    whiteShare(img, card.left, card.top + my, t, ch - 2 * my),
    whiteShare(img, card.right - t, card.top + my, t, ch - 2 * my),
  );
  return { state: share > 0.05 ? 'chipping' : share > 0.015 ? 'light_wear' : 'clean', share, measurable: true };
}

/** Variance of the Laplacian on a region: low values mean soft, reprinted-looking text. */
export function sharpness(img: RGBAImage, x0: number, y0: number, w: number, h: number): number {
  const g = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  };
  const xs = Math.max(1, Math.floor(x0)), ys = Math.max(1, Math.floor(y0));
  const xe = Math.min(img.width - 1, Math.floor(x0 + w)), ye = Math.min(img.height - 1, Math.floor(y0 + h));
  let n = 0, sum = 0, sum2 = 0;
  for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) {
    const l = 4 * g(x, y) - g(x - 1, y) - g(x + 1, y) - g(x, y - 1) - g(x, y + 1);
    sum += l; sum2 += l * l; n++;
  }
  if (!n) return 0;
  const m = sum / n;
  return sum2 / n - m * m;
}

/** Text sharpness of the name bar, normalised by the card's pixel width so photo size matters less. */
export function nameBarSharpness(img: RGBAImage, card: Box): number {
  const cw = card.right - card.left;
  const ch = card.bottom - card.top;
  return sharpness(img, card.left + cw * 0.08, card.top + ch * 0.04, cw * 0.84, ch * 0.07);
}

export interface LineEvidence {
  count: number; // distinct long thin bright lines found
  longest: number; // longest line as a share of the card diagonal
  angles: number[];
}

/**
 * Long, thin, bright straight lines across the card (scratches, fold lines).
 * Ridge pixels (brighter than their neighbours 3px away) vote in a Hough transform.
 * Near-horizontal and near-vertical lines are ignored: those are print frames and text rows.
 */
export function lineEvidence(img: RGBAImage, card: Box): LineEvidence {
  const cw = card.right - card.left, ch = card.bottom - card.top;
  const step = Math.max(1, Math.round(cw / 320));
  const W = Math.floor(cw / step), H = Math.floor(ch / step);
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = ((card.top + y * step) * img.width + (card.left + x * step)) * 4;
    g[y * W + x] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  }
  const d = 3, margin = Math.round(Math.min(W, H) * 0.04);
  const pts: Array<[number, number]> = [];
  for (let y = margin + d; y < H - margin - d; y++) for (let x = margin + d; x < W - margin - d; x++) {
    const v = g[y * W + x];
    const ring = (g[y * W + x - d] + g[y * W + x + d] + g[(y - d) * W + x] + g[(y + d) * W + x]) / 4;
    if (v - ring > 38 && v > 180) pts.push([x, y]);
  }
  const angles: number[] = [];
  for (let a = 8; a <= 172; a++) if (a < 82 || a > 98) angles.push(a);
  const diag = Math.hypot(W, H);
  const R = Math.ceil(diag);
  const acc = new Uint16Array(angles.length * (2 * R + 1));
  const cs = angles.map((a) => Math.cos((a * Math.PI) / 180));
  const sn = angles.map((a) => Math.sin((a * Math.PI) / 180));
  for (const [x, y] of pts) {
    for (let k = 0; k < angles.length; k++) {
      const r = Math.round(x * cs[k] + y * sn[k]) + R;
      acc[k * (2 * R + 1) + r]++;
    }
  }
  const need = Math.max(25, Math.round(Math.min(W, H) * 0.3));
  const peaks: Array<{ k: number; r: number; v: number }> = [];
  for (let k = 0; k < angles.length; k++) for (let r = 0; r < 2 * R + 1; r++) {
    const v = acc[k * (2 * R + 1) + r];
    if (v >= need) peaks.push({ k, r, v });
  }
  peaks.sort((a, b) => b.v - a.v);
  const kept: typeof peaks = [];
  for (const p of peaks) {
    if (kept.every((q) => Math.abs(angles[q.k] - angles[p.k]) > 6 || Math.abs(q.r - p.r) > 12)) kept.push(p);
    if (kept.length >= 6) break;
  }
  return { count: kept.length, longest: kept.length ? kept[0].v / diag : 0, angles: kept.map((p) => angles[p.k]) };
}
