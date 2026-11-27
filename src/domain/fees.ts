// Grading fee table. Shipped as a default and overridden at runtime by Remote Config,
// because graders change prices and pause tiers often (PSA did both in 2026).

export interface FeeTier {
  id: string;
  label: string;
  fee: number; // USD per card
  note?: string;
}

export interface FeeTable {
  updated: string;
  source: string;
  shippingPerCard: number;
  defaultTier: string;
  tiers: FeeTier[];
}

export const DEFAULT_FEES: FeeTable = {
  updated: '2026-02',
  source: 'https://www.psacard.com/info/submission-updates',
  shippingPerCard: 5,
  defaultTier: 'value',
  tiers: [
    { id: 'value-bulk', label: 'Value Bulk', fee: 24.99, note: 'Club members, bulk minimum' },
    { id: 'value', label: 'Value', fee: 32.99 },
    { id: 'value-plus', label: 'Value Plus', fee: 49.99 },
    { id: 'value-max', label: 'Value Max', fee: 64.99 },
    { id: 'regular', label: 'Regular', fee: 79.99 },
  ],
};

export function parseFeeTable(json: string | undefined | null): FeeTable {
  if (!json) return DEFAULT_FEES;
  try {
    const t = JSON.parse(json) as FeeTable;
    if (!Array.isArray(t.tiers) || !t.tiers.every((x) => typeof x.fee === 'number' && x.id)) return DEFAULT_FEES;
    return { ...DEFAULT_FEES, ...t };
  } catch {
    return DEFAULT_FEES;
  }
}

export function tierFee(table: FeeTable, id: string): FeeTier {
  return table.tiers.find((t) => t.id === id) ?? table.tiers.find((t) => t.id === table.defaultTier) ?? table.tiers[0];
}
