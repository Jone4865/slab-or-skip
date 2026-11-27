import { measureCentering, type Box, type Centering } from './domain/centering';
import { cornerWear, edgeWear, lineEvidence, type CornerWear, type LineEvidence } from './domain/defects';
import type { EdgeState } from './domain/grading';

export interface Crops {
  card: string; // tight crop of the whole card
  text: string; // stacked strips of the name bar, move text and footer
}

export interface Wear {
  corners: CornerWear;
  edges: EdgeState;
  edgeShare: number;
  lines: LineEvidence;
  measurable: boolean;
}

export interface Prepared {
  url: string; // object URL for display
  jpegBase64: string; // whole photo, downscaled (cloud fallback path)
  crops: Crops; // focused views for the small on-device model
  centering: Centering | null;
  wear: Wear | null; // measured from pixels, no model involved
  width: number;
  height: number;
}

const toB64 = (c: HTMLCanvasElement, q = 0.88) => c.toDataURL('image/jpeg', q).split(',')[1];

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** The code finds the card; these crops let Gemini Nano look closely at one thing at a time. */
function makeCrops(src: HTMLCanvasElement, box: Box): Crops {
  const bw = box.right - box.left;
  const bh = box.bottom - box.top;

  const card = canvas(Math.min(640, bw), Math.min(640, bw) * (bh / bw));
  card.getContext('2d')!.drawImage(src, box.left, box.top, bw, bh, 0, 0, card.width, card.height);

  const gap = 8;
  const strips: Array<[number, number]> = [[0.0, 0.12], [0.5, 0.8], [0.9, 1.0]];
  const outW = 640;
  const scale = outW / bw;
  const heights = strips.map(([a, b]) => (b - a) * bh * scale);
  const text = canvas(outW, heights.reduce((p, h) => p + h, 0) + gap * (strips.length - 1));
  const tx = text.getContext('2d')!;
  tx.fillStyle = '#ffffff';
  tx.fillRect(0, 0, text.width, text.height);
  let y = 0;
  strips.forEach(([a, b], i) => {
    tx.drawImage(src, box.left, box.top + a * bh, bw, (b - a) * bh, 0, y, outW, heights[i]);
    y += heights[i] + gap;
  });

  return { card: toB64(card), text: toB64(text) };
}

/** Downscale once, measure centering on pixels, and build crops. Nothing is uploaded here. */
export async function prepareImage(file: Blob, maxSide = 1024): Promise<Prepared> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  let centering: Centering | null = null;
  let wear: Wear | null = null;
  try {
    const img = { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
    centering = measureCentering(img);
    if (centering.confident) {
      const corners = cornerWear(img, centering.card);
      const e = edgeWear(img, centering.card);
      wear = { corners, edges: e.state, edgeShare: e.share, lines: lineEvidence(img, centering.card), measurable: corners.measurable && e.measurable };
    }
  } catch {
    centering = null;
  }
  const box = centering && centering.card.right - centering.card.left > w * 0.3 ? centering.card : { left: 0, top: 0, right: w, bottom: h };
  const crops = makeCrops(c, box);
  const small = canvas(Math.round(w * Math.min(1, 768 / Math.max(w, h))), Math.round(h * Math.min(1, 768 / Math.max(w, h))));
  small.getContext('2d')!.drawImage(c, 0, 0, small.width, small.height);
  return { url: URL.createObjectURL(file), jpegBase64: toB64(small, 0.86), crops, centering, wear, width: w, height: h };
}

export async function fetchAsBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  return r.blob();
}
