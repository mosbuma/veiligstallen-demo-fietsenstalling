export const WILMAR_PAGE_PREFS_KEY = "wilmar-analysis-range";

export type WilmarDateRange = { from: string; to: string };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type WilmarDateParts = { y: number; m: number; d: number };

const MONTH_SHORT_FMT = new Intl.DateTimeFormat("nl-NL", { month: "short" });

export function wilmarMonthShortLabel(month1to12: number): string {
  return MONTH_SHORT_FMT.format(new Date(2020, month1to12 - 1, 1)).replace(/\.$/, "");
}

export function wilmarDatePartsToString(parts: WilmarDateParts): string {
  const y = parts.y;
  const m = String(parts.m).padStart(2, "0");
  const day = String(parts.d).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatWilmarDateShort(dateStr: string): string {
  const parts = parseWilmarDateParts(dateStr);
  if (!parts) return dateStr;
  return new Date(parts.y, parts.m - 1, parts.d).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function wilmarIsoToDate(iso: string): Date | undefined {
  const parts = parseWilmarDateParts(iso);
  if (!parts) return undefined;
  return new Date(parts.y, parts.m - 1, parts.d);
}

export function dateToWilmarIso(d: Date): string {
  return wilmarDatePartsToString({
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
  });
}

function formatDateLocal(d: Date): string {
  return wilmarDatePartsToString({
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
  });
}

export function parseWilmarDateParts(dateStr: string): WilmarDateParts | null {
  const normalized = normalizeWilmarDateInput(dateStr);
  if (!normalized) return null;
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return null;
  const probe = new Date(y, m - 1, d);
  if (
    probe.getFullYear() !== y ||
    probe.getMonth() !== m - 1 ||
    probe.getDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

function parseDateParts(dateStr: string): WilmarDateParts | null {
  return parseWilmarDateParts(dateStr);
}

/** Accept `YYYY-MM-DD` or legacy `datetime-local` values from storage. */
export function normalizeWilmarDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) return trimmed;
  if (trimmed.length >= 10 && DATE_ONLY.test(trimmed.slice(0, 10))) {
    return trimmed.slice(0, 10);
  }
  return null;
}

export function defaultWilmarDateRange(): WilmarDateRange {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 7);
  return { from: formatDateLocal(from), to: formatDateLocal(to) };
}

export function readWilmarDateRange(): WilmarDateRange {
  if (typeof window === "undefined") return defaultWilmarDateRange();
  try {
    const raw = localStorage.getItem(WILMAR_PAGE_PREFS_KEY);
    if (!raw) return defaultWilmarDateRange();
    const p = JSON.parse(raw) as Partial<WilmarDateRange>;
    const from = p.from ? normalizeWilmarDateInput(p.from) : null;
    const to = p.to ? normalizeWilmarDateInput(p.to) : null;
    if (from && to && parseDateParts(from) && parseDateParts(to)) {
      return { from, to };
    }
  } catch {
    /* ignore corrupt prefs */
  }
  return defaultWilmarDateRange();
}

export function writeWilmarDateRange(range: WilmarDateRange) {
  localStorage.setItem(WILMAR_PAGE_PREFS_KEY, JSON.stringify(range));
}

/** Inclusive calendar-day bounds in local time for API queries. */
export function wilmarDateRangeToBounds(range: WilmarDateRange): { from: Date; to: Date } {
  const fromParts = parseDateParts(range.from);
  const toParts = parseDateParts(range.to);
  if (!fromParts || !toParts) {
    const def = defaultWilmarDateRange();
    return wilmarDateRangeToBounds(def);
  }
  const from = new Date(fromParts.y, fromParts.m - 1, fromParts.d, 0, 0, 0, 0);
  const to = new Date(toParts.y, toParts.m - 1, toParts.d, 23, 59, 59, 999);
  return { from, to };
}
