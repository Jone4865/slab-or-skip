// Deterministic centering measurement. No AI: pixels in, border widths out.
// Works on a straight-on photo of a single card on a contrasting background.

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // RGBA
}

export interface Box {
  left: number;
  top: number;
  right: number; // exclusive
  bottom: number; // exclusive
}

export interface Centering {
  card: Box;
  inner: Box;
  borders: { left: number; right: number; top: number; bottom: number };
  /** Share of the larger side, e.g. 0.55 means 55/45. */
  leftRight: number;
  topBottom: number;
  /** Worst of the two axes. */
  worst: number;
  label: string; // "55/45 LR · 52/48 TB"
  /** Highest PSA-style grade the centering alone allows. */
  maxGrade: number;
  confident: boolean;
}

/** Front-of-card centering ceilings commonly published by graders (larger side share). */
export const CENTERING_LIMITS: Array<{ grade: number; maxShare: number }> = [
  { grade: 10, maxShare: 0.55 },
  { grade: 9, maxShare: 0.6 },
  { grade: 8, maxShare: 0.65 },
  { grade: 7, maxShare: 0.7 },
  { grade: 6, maxShare: 0.8 },
  { grade: 5, maxShare: 0.85 },
];

export function maxGradeForShare(share: number): number {
  for (const l of CENTERING_LIMITS) if (share <= l.maxShare + 1e-9) return l.grade;
  return 4;
}

const px = (img: RGBAImage, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]] as const;
};

const dist = (a: readonly number[], b: readonly number[]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function medianColor(samples: Array<readonly number[]>): [number, number, number] {
  return [0, 1, 2].map((k) => median(samples.map((s) => s[k]))) as [number, number, number];
}

/** Background = median of a thin frame around the photo. Card = rows/cols that mostly differ from it. */
export function findCard(img: RGBAImage, threshold = 60): Box {
  const { width: w, height: h } = img;
  const samples: Array<readonly number[]> = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 60));
  for (let x = 0; x < w; x += step) { samples.push(px(img, x, 1)); samples.push(px(img, x, h - 2)); }
  for (let y = 0; y < h; y += step) { samples.push(px(img, 1, y)); samples.push(px(img, w - 2, y)); }
  const bg = medianColor(samples);
  const colHits = new Array(w).fill(0);
  const rowHits = new Array(h).fill(0);
  const s2 = Math.max(1, Math.floor(Math.min(w, h) / 300));
  for (let y = 0; y < h; y += s2) {
    for (let x = 0; x < w; x += s2) {
      if (dist(px(img, x, y), bg) > threshold) { colHits[x]++; rowHits[y]++; }
    }
  }
  const colNeed = (h / s2) * 0.3;
  const rowNeed = (w / s2) * 0.3;
  let left = 0, right = w, top = 0, bottom = h;
  while (left < w && colHits[left] < colNeed) left++;
  while (right > left && colHits[right - 1] < colNeed) right--;
  while (top < h && rowHits[top] < rowNeed) top++;
  while (bottom > top && rowHits[bottom - 1] < rowNeed) bottom--;
  // Rows/cols were sampled every s2 px; snap outward slightly.
  return { left, top, right, bottom };
}

/** Scan inward from each card edge until the border colour ends. Median over many scanlines. */
export function measureCentering(img: RGBAImage): Centering {
  const card = findCard(img);
  const cw = card.right - card.left;
  const ch = card.bottom - card.top;
  const inset = Math.max(2, Math.round(Math.min(cw, ch) * 0.012));
  // Border colour sampled just inside each edge, mid-span.
  const borderSamples: Array<readonly number[]> = [];
  for (let t = 0.3; t <= 0.7; t += 0.05) {
    borderSamples.push(px(img, card.left + inset, Math.round(card.top + ch * t)));
    borderSamples.push(px(img, card.right - 1 - inset, Math.round(card.top + ch * t)));
    borderSamples.push(px(img, Math.round(card.left + cw * t), card.top + inset));
    borderSamples.push(px(img, Math.round(card.left + cw * t), card.bottom - 1 - inset));
  }
  const border = medianColor(borderSamples);
  const thr = 70;
  const maxScanX = Math.round(cw * 0.35);
  const maxScanY = Math.round(ch * 0.35);

  const scan = (sx: number, sy: number, dx: number, dy: number, max: number) => {
    let run = 0;
    for (let d = inset; d < max; d++) {
      const x = sx + dx * d;
      const y = sy + dy * d;
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) return d;
      if (dist(px(img, x, y), border) > thr) { run++; if (run >= 3) return d - 2; } else run = 0;
    }
    return max;
  };

  const lefts: number[] = [], rights: number[] = [], tops: number[] = [], bottoms: number[] = [];
  for (let t = 0.3; t <= 0.7001; t += 0.02) {
    const y = Math.round(card.top + ch * t);
    const x = Math.round(card.left + cw * t);
    lefts.push(scan(card.left, y, 1, 0, maxScanX));
    rights.push(scan(card.right - 1, y, -1, 0, maxScanX));
    tops.push(scan(x, card.top, 0, 1, maxScanY));
    bottoms.push(scan(x, card.bottom - 1, 0, -1, maxScanY));
  }
  const b = { left: median(lefts), right: median(rights), top: median(tops), bottom: median(bottoms) };
  const spread = (xs: number[]) => {
    const s = [...xs].sort((p, q) => p - q);
    return s[Math.floor(s.length * 0.8)] - s[Math.floor(s.length * 0.2)];
  };
  const confident =
    cw > 80 && ch > 80 &&
    [lefts, rights, tops, bottoms].every((xs) => spread(xs) <= Math.max(3, Math.min(cw, ch) * 0.02)) &&
    Object.values(b).every((v) => v > 0 && v < Math.min(cw, ch) * 0.34);

  const lr = Math.max(b.left, b.right) / Math.max(1, b.left + b.right);
  const tb = Math.max(b.top, b.bottom) / Math.max(1, b.top + b.bottom);
  const worst = Math.max(lr, tb);
  const pct = (s: number) => `${Math.round(s * 100)}/${100 - Math.round(s * 100)}`;
  return {
    card,
    inner: { left: card.left + b.left, top: card.top + b.top, right: card.right - b.right, bottom: card.bottom - b.bottom },
    borders: b,
    leftRight: lr,
    topBottom: tb,
    worst,
    label: `${pct(lr)} LR · ${pct(tb)} TB`,
    maxGrade: maxGradeForShare(worst),
    confident,
  };
}
