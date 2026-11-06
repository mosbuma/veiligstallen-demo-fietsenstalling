import { idcodeForFmsApi } from "@/lib/pass-display";

function balanceIdcodeKeys(code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed) return [];
  const fms = idcodeForFmsApi(trimmed);
  return fms === trimmed ? [trimmed] : [trimmed, fms];
}

/** Parse GET …/balances payload (cached or live). Absent rows are null; the list omits zero balances. */
export function fmsBalanceForIdcode(balancesJson: unknown, idcode: string, idtype?: number): number | null {
  const keys = new Set(balanceIdcodeKeys(idcode));
  if (keys.size === 0) return null;

  const rows: unknown[] = Array.isArray(balancesJson)
    ? balancesJson
    : balancesJson && typeof balancesJson === "object" && Array.isArray((balancesJson as { data?: unknown }).data)
      ? ((balancesJson as { data: unknown[] }).data ?? [])
      : [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rowCode = String(r.idcode ?? r.passID ?? r.pasID ?? r.PasID ?? "").trim();
    const rowKeys = balanceIdcodeKeys(rowCode);
    if (!rowKeys.some((k) => keys.has(k))) continue;
    if (idtype != null && r.idtype != null && r.idtype !== "" && Number(r.idtype) !== idtype) continue;
    const raw = r.balance ?? r.saldo ?? r.amount ?? r.Balance;
    if (raw == null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
