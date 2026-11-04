import { prisma } from "@/lib/db";
import { testFmsDataproviderLogin, testReportingLogin } from "@/lib/aansluiten-login";
import { reportingCredentialsFromSettings, reportingFetch } from "@/lib/fms/client";
import { getSettings } from "@/lib/settings";
import { activeStallingScope } from "@/lib/stalling-scope";

export type LoginCheck = { ok: boolean; status: number; message: string };

export async function checkDataproviderLogin(): Promise<LoginCheck> {
  const settings = await getSettings();
  const r = await testFmsDataproviderLogin(settings);
  return { ok: r.ok, status: r.status, message: r.message };
}

export async function checkReportingLogin(): Promise<LoginCheck> {
  const settings = await getSettings();
  const r = await testReportingLogin(settings);
  return { ok: r.ok, status: r.status, message: r.message };
}

function mergeTransactionRow(
  row: Record<string, unknown>,
  defaults: Record<string, unknown>
): Record<string, unknown> {
  return { ...defaults, ...row };
}

export async function runRoundTrip(from: Date, to: Date) {
  const settings = await getSettings();
  const creds = reportingCredentialsFromSettings(settings);
  const fromStr = from.toISOString().slice(0, 19);
  const toStr = to.toISOString().slice(0, 19);

  const txPath =
    `/api/reporting/v4/citycodes/${encodeURIComponent(settings.citycode)}` +
    `/locations/${encodeURIComponent(settings.locationId)}/transactions` +
    `?type=checkout&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;
  const txRes = await reportingFetch(creds, txPath);

  const dynPath =
    `/api/reporting/v4/occupation/dynamic?staticSectionId=${encodeURIComponent(settings.locationId)}` +
    `&startDate=${encodeURIComponent(fromStr)}&endDate=${encodeURIComponent(toStr)}&depth=2`;
  const dynRes = await reportingFetch(creds, dynPath);

  const scope = await activeStallingScope();
  const localVisits = await prisma.visit.findMany({
    where: {
      ...scope,
      status: "closed",
      checkOutDate: { gte: from, lte: to },
    },
    orderBy: { checkOutDate: "asc" },
  });

  const localSum = localVisits.reduce((s, v) => s + Number(v.stallingskosten ?? 0), 0);
  const localCount = localVisits.length;

  let remoteRows: Record<string, unknown>[] = [];
  let remoteSum = 0;
  if (txRes.ok && typeof txRes.json === "object" && txRes.json) {
    const body = txRes.json as { data?: Record<string, unknown>[]; defaults?: Record<string, unknown> };
    const defaults = body.defaults ?? {};
    remoteRows = (body.data ?? []).map((r) => mergeTransactionRow(r, defaults));
    remoteSum = remoteRows.reduce((s, r) => s + Number(r.price ?? 0), 0);
  }

  const matches = localVisits.map((lv) => {
    const match = remoteRows.find((r) => {
      const checkin = String(r.checkindate ?? "").slice(0, 19);
      const checkout = String(r.checkoutdate ?? "").slice(0, 19);
      const localIn = lv.checkInDate.toISOString().slice(0, 19);
      const localOut = lv.checkOutDate?.toISOString().slice(0, 19) ?? "";
      return (
        String(r.sectionid ?? "") === lv.sectionId &&
        checkin === localIn &&
        checkout === localOut &&
        Number(r.biketypeid ?? 0) === lv.biketypeId &&
        Math.abs(Number(r.price ?? 0) - Number(lv.stallingskosten ?? 0)) < 0.01
      );
    });
    return {
      visitId: lv.id,
      externalTransactionId: lv.externalTransactionId,
      localCost: Number(lv.stallingskosten ?? 0),
      matched: Boolean(match),
    };
  });

  const { countOpenVisits } = await import("@/lib/visits");
  const openLocal = await countOpenVisits();
  let remoteOccupation: number | null = null;
  if (dynRes.ok && typeof dynRes.json === "object") {
    const dyn = dynRes.json as { result?: Array<{ dynamic?: Array<{ occupation?: number }> }> };
    const last = dyn.result?.[0]?.dynamic?.slice(-1)[0];
    if (last && typeof last.occupation === "number") remoteOccupation = last.occupation;
  }

  const allMatched = localCount > 0 && matches.every((m) => m.matched);
  const sumMatched = Math.abs(localSum - remoteSum) < 0.01;
  const notInReportYet = localCount > 0 && remoteRows.length === 0 && txRes.ok;

  let overall: "login_failed" | "pending" | "match" | "mismatch" = "mismatch";
  if (!txRes.ok && txRes.status === 401) overall = "login_failed";
  else if (notInReportYet) overall = "pending";
  else if (allMatched && sumMatched) overall = "match";

  const reportBase = settings.fmsBaseUrl.replace(/\/$/, "");
  const inkomstenUrl = `${reportBase}/beheer/rapportages`;

  return {
    overall,
    localCount,
    localSum,
    remoteCount: remoteRows.length,
    remoteSum,
    openLocal,
    remoteOccupation,
    matches,
    txStatus: txRes.status,
    dynStatus: dynRes.status,
    inkomstenUrl,
    period: { from: fromStr, to: toStr },
  };
}
