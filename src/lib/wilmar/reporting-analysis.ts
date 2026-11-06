import { prisma } from "@/lib/db";
import { reportingCredentialsFromSettings, reportingFetch } from "@/lib/fms/client";
import { getSettings } from "@/lib/settings";
import { activeStallingScope } from "@/lib/stalling-scope";

export type TypeCount = { type: string; count: number };

export type ReportingTxSummary = {
  ok: boolean;
  status: number;
  count: number;
  byCheckInType: TypeCount[];
  byCheckOutType: TypeCount[];
  nonUserSamples: Record<string, unknown>[];
  error?: string;
};

function aggregateTypes(rows: Record<string, unknown>[], field: "checkintype" | "checkouttype"): TypeCount[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const raw = row[field];
    const t = raw != null && String(raw).trim() ? String(raw).trim().toLowerCase() : "(default/user)";
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function reportingErrorHint(raw: string): string {
  if (raw.includes("externaltransactionid") && raw.includes("does not exist")) {
    return `${raw.slice(0, 400)} — Voer op VeiligStallen acc_docker migratie 20261027210000_transacties_archief_external_tx uit (zie reference/veiligstallen-acc-docker.md).`;
  }
  return raw.slice(0, 500);
}

function parseReportingData(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const body = json as { data?: unknown };
  if (!Array.isArray(body.data)) return [];
  return body.data as Record<string, unknown>[];
}

async function fetchReportingType(
  creds: ReturnType<typeof reportingCredentialsFromSettings>,
  path: string
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const res = await reportingFetch(creds, path);
  return { ok: res.ok, status: res.status, json: res.json, text: res.text };
}

export async function summarizeReportingTransactions(
  from: Date,
  to: Date
): Promise<{ checkin: ReportingTxSummary; checkout: ReportingTxSummary }> {
  const settings = await getSettings();
  const creds = reportingCredentialsFromSettings(settings);
  const fromStr = from.toISOString().slice(0, 19);
  const toStr = to.toISOString().slice(0, 19);
  const base =
    `/api/reporting/v4/citycodes/${encodeURIComponent(settings.citycode)}` +
    `/locations/${encodeURIComponent(settings.locationId)}/transactions`;

  const [checkinRes, checkoutRes] = await Promise.all([
    fetchReportingType(creds, `${base}?type=checkin&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`),
    fetchReportingType(creds, `${base}?type=checkout&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`),
  ]);

  function build(res: { ok: boolean; status: number; json: unknown; text: string }, kind: "checkin" | "checkout"): ReportingTxSummary {
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        count: 0,
        byCheckInType: [],
        byCheckOutType: [],
        nonUserSamples: [],
        error: reportingErrorHint(
          typeof res.json === "object" && res.json && "message" in (res.json as object)
            ? String((res.json as { message: unknown }).message)
            : res.text || `HTTP ${res.status}`
        ),
      };
    }
    const rows = parseReportingData(res.json);
    const byCheckInType = aggregateTypes(rows, "checkintype");
    const byCheckOutType = aggregateTypes(rows, "checkouttype");
    const nonUserSamples = rows
      .filter((r) => {
        const ci = String(r.checkintype ?? "").toLowerCase();
        const co = String(r.checkouttype ?? "").toLowerCase();
        return (ci && ci !== "user") || (co && co !== "user");
      })
      .slice(0, 15);
    return {
      ok: true,
      status: res.status,
      count: rows.length,
      byCheckInType,
      byCheckOutType,
      nonUserSamples,
    };
  }

  return {
    checkin: build(checkinRes, "checkin"),
    checkout: build(checkoutRes, "checkout"),
  };
}

export async function summarizeLocalVisits(from: Date, to: Date) {
  const scope = await activeStallingScope();
  const visits = await prisma.visit.findMany({
    where: {
      ...scope,
      OR: [
        { checkInDate: { gte: from, lte: to } },
        { checkOutDate: { gte: from, lte: to } },
      ],
    },
    select: {
      id: true,
      externalTransactionId: true,
      checkInType: true,
      checkOutType: true,
      checkInDate: true,
      checkOutDate: true,
      status: true,
      stallingskosten: true,
      fmsSyncStatus: true,
      paymentMethod: true,
    },
    orderBy: { checkInDate: "desc" },
    take: 500,
  });

  const byCheckIn = new Map<string, number>();
  const byCheckOut = new Map<string, number>();
  for (const v of visits) {
    const ci = v.checkInType?.trim().toLowerCase() || "user";
    byCheckIn.set(ci, (byCheckIn.get(ci) ?? 0) + 1);
    if (v.checkOutType) {
      const co = v.checkOutType.trim().toLowerCase();
      byCheckOut.set(co, (byCheckOut.get(co) ?? 0) + 1);
    }
  }

  const toCounts = (m: Map<string, number>): TypeCount[] =>
    [...m.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

  return {
    total: visits.length,
    byCheckInType: toCounts(byCheckIn),
    byCheckOutType: toCounts(byCheckOut),
    pendingFms: visits.filter((v) => v.fmsSyncStatus === "pending").length,
    samples: visits.slice(0, 20).map((v) => ({
      externalTransactionId: v.externalTransactionId,
      checkInType: v.checkInType,
      checkOutType: v.checkOutType,
      status: v.status,
      stallingskosten: v.stallingskosten != null ? Number(v.stallingskosten) : null,
      fmsSyncStatus: v.fmsSyncStatus,
      paymentMethod: v.paymentMethod,
    })),
  };
}
