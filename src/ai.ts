import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema, type GenerativeModel } from 'firebase/ai';
import { app } from './firebase';
import type { Prices } from './domain/grading';
import type { SurfaceRead, TextRead } from './domain/assemble';

const ai = getAI(app, { backend: new GoogleAIBackend() });

// Small on-device models do best with one focused question per image. Code measures what pixels can
// (centering, corner and edge whitening); Gemini Nano answers what needs looking and reading.
const surfaceSchema = Schema.object({
  properties: {
    brightLineAcross: Schema.boolean(),
    lineCount: Schema.integer(),
    notes: Schema.string(),
  },
});
const textSchema = Schema.object({
  properties: {
    cardName: Schema.string(),
    cardNumber: Schema.string(),
    hpText: Schema.string(),
    moveTitle: Schema.string(),
  },
});

const PROMPTS = {
  surface: `Look at this trading card photo. Is there any thin, bright, straight line (a scratch or a fold)
running across the picture or the text boxes? Answer brightLineAcross true or false.
lineCount: how many such lines you can see (0 if none).
notes: one short, plain sentence about the card's surface for a collector.`,
  text: `These strips are cut from ONE trading card: the name bar on top, the move text in the middle and the footer at the bottom.
Copy text exactly as printed, letter for letter, including any spelling mistakes. Do not correct anything.
cardName: the name at the top left. hpText: the hit-point text at the top right exactly as printed (for example "HP 130").
moveTitle: the first bold move line exactly as printed. cardNumber: the collector number in the footer (like 012/180).`,
};

// In the cloud one request carries both views, so a binder stays inside free-tier per-minute limits.
const bothSchema = Schema.object({ properties: { surface: surfaceSchema, text: textSchema } });
const BOTH_PROMPT = `Image 1 is a trading card photo. Image 2 holds strips cut from the same card's text areas.
surface (from image 1): ${PROMPTS.surface}
text (from image 2): ${PROMPTS.text}`;

type Kind = keyof typeof PROMPTS | 'both';
const SCHEMAS: Record<Kind, ReturnType<typeof Schema.object>> = { surface: surfaceSchema, text: textSchema, both: bothSchema };

let cloudModelName = 'gemini-3.5-flash-lite';
export function setCloudModel(name: string) {
  if (name && name !== cloudModelName) { cloudModelName = name; models.clear(); valueModel = null; }
}

const models = new Map<string, GenerativeModel>();
/** Hybrid: on-device Gemini Nano when Chrome has it, otherwise cloud Gemini with the same prompt and schema. */
function model(kind: Kind, forceCloud: boolean): GenerativeModel {
  const key = `${kind}:${forceCloud}`;
  let m = models.get(key);
  if (!m) {
    m = getGenerativeModel(ai, {
      mode: forceCloud ? InferenceMode.ONLY_IN_CLOUD : InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: {
        model: cloudModelName,
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMAS[kind], temperature: 0 },
      },
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'image' }, { type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
        promptOptions: { responseConstraint: SCHEMAS[kind] },
      },
    });
    models.set(key, m);
  }
  return m;
}

let deviceInit: Promise<void> | null = null;
/** Must be called from a user gesture. Starts (or confirms) the on-device model download. */
export function initDeviceModel(onProgress?: (p: number) => void): Promise<void> {
  if (!deviceInit) {
    const m = model('surface', false) as GenerativeModel & { initializeDeviceModel?: (cb?: (p: number) => void) => Promise<void> };
    deviceInit = Promise.resolve(m.initializeDeviceModel?.(onProgress)).then(() => undefined).catch(() => undefined);
  }
  return deviceInit;
}

export type Source = 'on_device' | 'in_cloud';

export interface ModelReads {
  surface: SurfaceRead;
  text: TextRead;
  source: Source;
  ms: number;
}

function stripFence(t: string): string {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : t).trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (e: unknown) => /429|RESOURCE_EXHAUSTED|quota|rate/i.test(String((e as Error)?.message ?? e));

/** Free-tier cloud quotas are per minute; back off and retry instead of failing the card. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1 || !isRateLimit(e)) throw e;
      await sleep(5000 * 2 ** i); // 5s, 10s, 20s: clears a per-minute window
    }
  }
}

async function ask<T>(kind: Kind, images: string[], forceCloud: boolean): Promise<{ data: T; source: Source }> {
  const prompt = kind === 'both' ? BOTH_PROMPT : PROMPTS[kind];
  const result = await withRetry(() => model(kind, forceCloud).generateContent([
    prompt,
    ...images.map((data) => ({ type: 'inlineData' as const, inlineData: { data, mimeType: 'image/jpeg' } })),
  ]));
  const r = result.response as typeof result.response & { inferenceSource?: string };
  return { data: JSON.parse(stripFence(r.text())) as T, source: r.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud' };
}

export async function readCard(crops: { card: string; text: string }, forceCloud: boolean): Promise<ModelReads> {
  const t0 = performance.now();
  let s: { data: Partial<SurfaceRead>; source: Source };
  let t: { data: Partial<TextRead>; source: Source };
  if (forceCloud) {
    const b = await ask<{ surface?: Partial<SurfaceRead>; text?: Partial<TextRead> }>('both', [crops.card, crops.text], true);
    s = { data: b.data.surface ?? {}, source: b.source };
    t = { data: b.data.text ?? {}, source: b.source };
  } else {
    // Sequential on purpose: one on-device session at a time is fastest on a laptop GPU.
    s = await ask<Partial<SurfaceRead>>('surface', [crops.card], false);
    t = await ask<Partial<TextRead>>('text', [crops.text], false);
  }
  return {
    surface: { brightLineAcross: !!s.data.brightLineAcross, lineCount: Number(s.data.lineCount) || 0, notes: String(s.data.notes ?? '') },
    text: { cardName: String(t.data.cardName ?? ''), cardNumber: String(t.data.cardNumber ?? ''), hpText: String(t.data.hpText ?? ''), moveTitle: String(t.data.moveTitle ?? '') },
    source: s.source === 'on_device' && t.source === 'on_device' ? 'on_device' : 'in_cloud',
    ms: Math.round(performance.now() - t0),
  };
}

// ---------- Cloud only: live market prices need Google Search grounding ----------

export interface ValueLookup {
  prices: Prices;
  sources: Array<{ title: string; url: string }>;
  summary: string;
  ms: number;
}

let valueModel: GenerativeModel | null = null;

/** Only text leaves the device here: the card's name and number. Never the photo. */
export async function lookUpValue(cardQuery: string): Promise<ValueLookup> {
  valueModel ??= getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: cloudModelName, tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.2 } },
  });
  const t0 = performance.now();
  const prompt = `Find current market prices for this trading card: "${cardQuery}".
Use Google Search for recent SOLD listings or price guides (last 90 days). Report USD:
raw (ungraded, near mint), psa10, psa9, psa8. Use null when you cannot find a number; never invent one.
Answer with ONE fenced json block: {"raw":number|null,"psa10":number|null,"psa9":number|null,"psa8":number|null,"currency":"USD","summary":"one sentence on where the numbers came from"}`;
  const vm = valueModel;
  const result = await withRetry(() => vm.generateContent(prompt));
  const r = result.response;
  let parsed: Partial<Prices & { summary: string }> = {};
  try { parsed = JSON.parse(stripFence(r.text())); } catch { /* keep empty */ }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);
  const meta = r.candidates?.[0]?.groundingMetadata as { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } | undefined;
  const sources = (meta?.groundingChunks ?? [])
    .map((c) => ({ title: c.web?.title ?? '', url: c.web?.uri ?? '' }))
    .filter((s) => s.url)
    .slice(0, 5);
  return {
    prices: { raw: num(parsed.raw), psa10: num(parsed.psa10), psa9: num(parsed.psa9), psa8: num(parsed.psa8), currency: 'USD' },
    sources,
    summary: parsed.summary ?? '',
    ms: Math.round(performance.now() - t0),
  };
}

/** Chrome Prompt API status, read directly so the UI can explain what will happen. */
export async function deviceStatus(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'> {
  const LM = (globalThis as { LanguageModel?: { availability: (o?: unknown) => Promise<string> } }).LanguageModel;
  if (!LM) return 'unavailable';
  try {
    // Some browser setups never answer this call; don't let the app hang waiting for it.
    const s = await Promise.race([
      LM.availability({ expectedInputs: [{ type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }),
      new Promise<string>((r) => setTimeout(() => r('unavailable'), 4000)),
    ]);
    return (['available', 'downloadable', 'downloading'].includes(s) ? s : 'unavailable') as 'available';
  } catch {
    return 'unavailable';
  }
}
