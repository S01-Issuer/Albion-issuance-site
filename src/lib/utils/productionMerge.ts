// Utility to merge historicalProduction with receiptsData into a single production history
// Adds console logging for debugging the merge process

export interface HistoricalRecord {
  month: string;
  production: number;
}
export interface ReceiptsRecord {
  month: string;
  assetData?: {
    production?: number;
    revenue?: number;
    expenses?: number;
    netIncome?: number;
  };
  production?: number;
  revenue?: number;
  expenses?: number;
  netIncome?: number;
}
export interface PayoutRecord {
  month: string;
  tokenPayout?: { payoutPerToken?: number };
}

export interface MergedReport {
  month: string;
  production: number;
  revenue: number;
  expenses: number;
  netIncome: number;
  payoutPerToken: number;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^-\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return 0;
}

type RevenueLike = Pick<ReceiptsRecord, "revenue" | "expenses" | "netIncome"> | ReceiptsRecord["assetData"];

function normalizeRevenue(entry: RevenueLike): { revenue: number; expenses: number; netIncome: number } {
  const revenue = toNumber(entry?.revenue);
  const expenses = toNumber(entry?.expenses);
  const netIncomeRaw = toNumber(entry?.netIncome);
  const netIncome = netIncomeRaw > 0 ? netIncomeRaw : revenue - expenses;

  return {
    revenue,
    expenses,
    netIncome,
  };
}

export function mergeProductionHistory(
  historicalProduction: HistoricalRecord[] | undefined,
  receiptsData: ReceiptsRecord[] | undefined,
  payoutData: PayoutRecord[] | undefined,
): MergedReport[] {
  const payoutByMonth = new Map<string, number>();
  if (Array.isArray(payoutData)) {
    for (const p of payoutData) {
      if (p?.month)
        payoutByMonth.set(p.month, p.tokenPayout?.payoutPerToken || 0);
    }
  }

  const historical: MergedReport[] = Array.isArray(historicalProduction)
    ? historicalProduction.map((record) => ({
        month: record?.month || "",
        production: record?.production || 0,
        revenue: 0,
        expenses: 0,
        netIncome: 0,
        payoutPerToken: payoutByMonth.get(record?.month || "") || 0,
      }))
    : [];

  const maxHistMonth = historical.length
    ? [...historical]
        .map((r) => r.month)
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0]
    : "";

  const receiptsTail: MergedReport[] = Array.isArray(receiptsData)
    ? receiptsData
        .filter((r) => !maxHistMonth || (r?.month && r.month > maxHistMonth))
        .map((report) => ({
          month: report?.month || "",
          production: toNumber(report?.assetData?.production ?? report?.production),
          ...normalizeRevenue(report?.assetData ?? report),
          payoutPerToken: payoutByMonth.get(report?.month || "") || 0,
        }))
    : [];

  const merged = [...historical, ...receiptsTail].filter((r) => r.month);
  merged.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  return merged;
}
