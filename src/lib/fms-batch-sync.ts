import { prisma } from "@/lib/db";
import {
  credentialsFromSettings,
  fmsFullUrl,
  fmsResultErrorMessage,
  FMS_MANAGED_TRANSACTIONS_BATCH_MAX,
  postManagedTransaction,
  postManagedTransactionsBatchForSection,
  postSaldo,
  type FmsCallResult,
  type FmsCredentials,
} from "@/lib/fms/client";
import { toFmsCheckType } from "@/lib/fms/check-types";
import { listFmsLogEntries } from "@/lib/fms-log-query";
import type { FmsLogEntry } from "@/lib/fms-log-view";
import type { AppSettingsDto } from "@/lib/settings";
import type { Bicycle, Visit } from "@prisma/client";
import { getMetadataBundle, parseSections } from "@/lib/fms/metadata-cache";
import { fmsSectionIdForVisit } from "@/lib/parking";
import { isSyntheticPassCode } from "@/lib/pass-display";
import { inventarisBarcode } from "@/lib/stalling-inventory";
import { fmsSectionForFloor, postFloorOccupation } from "@/lib/real-world";
import { appNow, getSettings } from "@/lib/settings";
import { activeStallingScope } from "@/lib/stalling-scope";
import {
  markVisitFmsFailed,
  markVisitFmsSynced,
  markVisitsFmsSynced,
} from "@/lib/visit-fms-sync-state";

async function lastFmsBatchAt(): Promise<Date> {
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return row?.lastFmsBatchAt ?? new Date(0);
}

/** Visits waiting to be pushed to VeiligStallen. */
export async function countVisitsPendingFmsSync(): Promise<number> {
  const scope = await activeStallingScope();
  return prisma.visit.count({ where: { ...scope, fmsSyncStatus: "pending" } });
}

export async function countFloorPendingFmsSync(): Promise<number> {
  const since = await lastFmsBatchAt();
  const scope = await activeStallingScope();
  return prisma.bicycle.count({ where: { ...scope, updatedAt: { gt: since } } });
}

export async function listVisitsPendingFmsSync() {
  const scope = await activeStallingScope();
  const visits = await prisma.visit.findMany({
    where: {
      ...scope,
      OR: [{ fmsSyncStatus: "pending" }, { fmsSyncStatus: { in: ["synced", "failed"] } }],
    },
    include: { bicycle: { select: { barcode: true } } },
    orderBy: [{ fmsSyncAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 200,
  });
  return visits.map((v) => ({
    id: v.id,
    externalTransactionId: v.externalTransactionId,
    status: v.status,
    idcode: v.idcode,
    barcode: inventarisBarcode(v),
    checkInDate: v.checkInDate.toISOString(),
    checkOutDate: v.checkOutDate?.toISOString() ?? null,
    checkInType: v.checkInType,
    checkOutType: v.checkOutType,
    sectionId: v.sectionId,
    stallPlace: v.stallPlace,
    stallingskosten: v.stallingskosten != null ? Number(v.stallingskosten) : null,
    paymentMethod: v.paymentMethod,
    updatedAt: v.updatedAt.toISOString(),
    fmsSyncStatus: v.fmsSyncStatus,
    fmsSyncAt: v.fmsSyncAt?.toISOString() ?? null,
    fmsSyncMessage: v.fmsSyncMessage,
    needsSync: v.fmsSyncStatus === "pending",
  }));
}

export async function getFmsBatchStatus() {
  const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const [pendingTransactions, pendingFloorChanges, pendingVisits] = await Promise.all([
    countVisitsPendingFmsSync(),
    countFloorPendingFmsSync(),
    listVisitsPendingFmsSync(),
  ]);
  return {
    pendingTransactions,
    pendingFloorChanges,
    pendingVisits,
    lastFmsBatchAt: row?.lastFmsBatchAt?.toISOString() ?? null,
    lastFmsBatchOk: row?.lastFmsBatchOk ?? null,
    lastFmsBatchMessage: row?.lastFmsBatchMessage ?? "",
  };
}

export type FmsCallTrace = {
  step: string;
  method: string;
  path: string;
  url: string;
  requestBody: unknown;
  statusCode: number;
  responseBody: unknown;
  responseText: string;
  ok: boolean;
  error: string | null;
  createdAt?: string;
};

type VisitWithBike = Visit & {
  bicycle: Bicycle | null;
  pass?: { passCode: string } | null;
};

function fmsIdcodeForVisit(visit: VisitWithBike): string {
  for (const raw of [visit.idcode, visit.pass?.passCode]) {
    const code = (raw ?? "").trim();
    if (code && !isSyntheticPassCode(code)) return code;
  }
  return "";
}

function traceCall(
  step: string,
  creds: FmsCredentials,
  method: string,
  path: string,
  requestBody: unknown,
  result: FmsCallResult
): FmsCallTrace {
  const err = result.ok
    ? null
    : typeof result.json === "object" && result.json && "message" in result.json
      ? String((result.json as { message?: string }).message)
      : result.text.slice(0, 500);
  return {
    step,
    method,
    path,
    url: fmsFullUrl(creds.baseUrl, path),
    requestBody,
    statusCode: result.status,
    responseBody: result.json,
    responseText: result.text,
    ok: result.ok,
    error: err,
  };
}

function buildManagedTransactionForVisit(visit: VisitWithBike): {
  managed: Record<string, unknown>;
  fmsSection: string;
} | { error: string } {
  const fmsSection = fmsSectionIdForVisit(visit);
  if (!fmsSection) {
    return { error: `Geen FMS-sector voor bezoek ${visit.id}` };
  }
  const idcode = fmsIdcodeForVisit(visit);
  if (!idcode) {
    return { error: `Geen idcode (pas) voor MT ${visit.externalTransactionId}` };
  }
  const barcode = inventarisBarcode(visit);
  const managed: Record<string, unknown> = {
    externaltransactionid: visit.externalTransactionId,
    idcode,
    idtype: visit.idType,
    checkindate: visit.checkInDate.toISOString(),
    checkintype: toFmsCheckType(visit.checkInType),
    bikeid_in: barcode,
    biketypeid: visit.biketypeId,
    sectionid: fmsSection,
    sectionid_checkin: fmsSection,
  };
  if (visit.status === "closed" && visit.checkOutDate) {
    managed.checkoutdate = visit.checkOutDate.toISOString();
    managed.checkouttype = toFmsCheckType(visit.checkOutType, "user");
    managed.stallingsduur = visit.stallingsduur ?? 0;
    managed.stallingskosten = visit.stallingskosten != null ? Number(visit.stallingskosten) : 0;
    managed.bikeid_out = barcode;
  }
  return { managed, fmsSection };
}

async function postSaldoForVisitIfNeeded(
  visit: VisitWithBike,
  settings: AppSettingsDto,
  creds: FmsCredentials,
  calls: FmsCallTrace[]
): Promise<string | null> {
  if (
    visit.status !== "closed" ||
    !visit.checkOutDate ||
    visit.paymentMethod !== "saldo" ||
    visit.stallingskosten == null ||
    Number(visit.stallingskosten) <= 0 ||
    visit.subscriptionWaived
  ) {
    return null;
  }
  const saldoPayload = {
    amount: -Number(visit.stallingskosten),
    paymenttypeid: 1,
    transactiondate: visit.checkOutDate.toISOString(),
  };
  const idcode = fmsIdcodeForVisit(visit);
  if (!idcode) return `Saldo: geen idcode voor ${visit.externalTransactionId}`;
  const saldo = await postSaldo(
    creds,
    settings.citycode,
    settings.locationId,
    visit.idType,
    idcode,
    saldoPayload,
    visit.id
  );
  calls.push(
    traceCall(
      "addJsonSaldo",
      creds,
      "POST",
      `/api/fms/v4/citycodes/${encodeURIComponent(settings.citycode)}/locations/${encodeURIComponent(settings.locationId)}/idcodes/${visit.idType}/${encodeURIComponent(visit.idcode)}/balance`,
      saldoPayload,
      saldo
    )
  );
  if (!saldo.ok) return `Saldo ${idcode}: HTTP ${saldo.status}`;
  return null;
}

/** Push one visit to FMS (optional saldo, single managed transaction). */
export async function syncOneVisitToFms(
  visit: VisitWithBike,
  settings: AppSettingsDto,
  creds: FmsCredentials
): Promise<{ ok: boolean; errors: string[]; calls: FmsCallTrace[] }> {
  const errors: string[] = [];
  const calls: FmsCallTrace[] = [];
  const built = buildManagedTransactionForVisit(visit);
  if ("error" in built) {
    return { ok: false, errors: [built.error], calls };
  }
  const saldoErr = await postSaldoForVisitIfNeeded(visit, settings, creds, calls);
  if (saldoErr) errors.push(saldoErr);

  const { managed, fmsSection } = built;
  const mtBody = { managedtransaction: managed };
  const mtPath = `/api/fms/v4/citycodes/${encodeURIComponent(settings.citycode)}/locations/${encodeURIComponent(settings.locationId)}/sections/${encodeURIComponent(fmsSection)}/managedtransactions`;
  const mt = await postManagedTransaction(
    creds,
    settings.citycode,
    settings.locationId,
    fmsSection,
    managed,
    visit.id
  );
  calls.push(traceCall("uploadJsonTransaction", creds, "POST", mtPath, mtBody, mt));
  if (!mt.ok) {
    errors.push(`MT ${visit.externalTransactionId}: HTTP ${mt.status}`);
    return { ok: false, errors, calls };
  }

  return { ok: errors.length === 0, errors, calls };
}

function visitToDetailJson(
  v: VisitWithBike & {
    pass?: { passCode: string } | null;
    fmsLogs?: Array<{
      id: string;
      method: string;
      path: string;
      requestBody: unknown;
      statusCode: number | null;
      responseBody: unknown;
      error: string | null;
      createdAt: Date;
    }>;
  }
) {
  return {
    id: v.id,
    externalTransactionId: v.externalTransactionId,
    status: v.status,
    idcode: v.idcode,
    idType: v.idType,
    passCode: v.pass?.passCode ?? null,
    barcode: inventarisBarcode(v),
    inventoryBarcode: v.inventoryBarcode,
    biketypeId: v.biketypeId,
    sectionId: v.sectionId,
    stallPlace: v.stallPlace,
    placementKind: v.placementKind,
    fmsSectionId: v.fmsSectionId,
    physicallyPresent: v.physicallyPresent,
    checkInDate: v.checkInDate.toISOString(),
    checkInType: v.checkInType,
    checkOutDate: v.checkOutDate?.toISOString() ?? null,
    checkOutType: v.checkOutType,
    stallingsduur: v.stallingsduur,
    stallingskosten: v.stallingskosten != null ? Number(v.stallingskosten) : null,
    paymentMethod: v.paymentMethod,
    subscriptionWaived: v.subscriptionWaived,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    fmsSyncStatus: v.fmsSyncStatus,
    fmsSyncAt: v.fmsSyncAt?.toISOString() ?? null,
    fmsSyncMessage: v.fmsSyncMessage,
  };
}

export async function getVisitFmsDetailByExternalTransactionId(externalTransactionId: string) {
  const visit = await prisma.visit.findFirst({
    where: { externalTransactionId },
    select: { id: true },
  });
  if (!visit) return null;
  return getVisitFmsDetail(visit.id);
}

export async function getVisitFmsDetail(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      bicycle: true,
      pass: { select: { passCode: true } },
    },
  });
  if (!visit) return null;

  const logEntries: FmsLogEntry[] = await listFmsLogEntries({ visitId });

  return { visit: visitToDetailJson(visit), logEntries };
}

export async function resendVisitToFms(visitId: string) {
  const settings = await getSettings();
  const creds = credentialsFromSettings(settings);
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { bicycle: true, pass: { select: { passCode: true } } },
  });
  if (!visit) {
    return { ok: false, message: "Bezoek niet gevonden", calls: [] as FmsCallTrace[] };
  }
  const result = await syncOneVisitToFms(visit, settings, creds);
  const at = appNow(settings);
  if (result.ok) {
    await markVisitFmsSynced(visitId, at, "Handmatig opnieuw verstuurd");
  } else {
    await markVisitFmsFailed(
      visitId,
      at,
      result.errors.join(" · ") || "Versturen mislukt"
    );
  }
  return {
    ok: result.ok,
    message: result.ok
      ? "Transactie opnieuw verstuurd."
      : result.errors.join(" · ") || "Versturen mislukt",
    calls: result.calls,
    errors: result.errors,
  };
}

async function runFloorOccupationSync(): Promise<void> {
  const bundle = await getMetadataBundle();
  const sections = parseSections(bundle.sections.json);
  const sectionIds = new Set<string>();
  for (const s of sections) {
    const id = String(s.sectionid ?? s.id ?? "").trim();
    if (id) sectionIds.add(id);
  }
  const scope = await activeStallingScope();
  const onFloor = await prisma.bicycle.findMany({
    where: { ...scope, floorPresent: true },
    select: {
      floorPresent: true,
      floorFmsSectionId: true,
      floorSectionId: true,
      floorStallPlace: true,
      floorPlacementKind: true,
    },
  });
  for (const b of onFloor) {
    const sid = fmsSectionForFloor(b);
    if (sid) sectionIds.add(sid);
  }
  for (const sectionId of sectionIds) {
    await postFloorOccupation(sectionId);
  }
}

export async function runVeiligstallenBatchSync(): Promise<{
  ok: boolean;
  message: string;
  syncedVisits: number;
  errors: string[];
  mode: "batch";
}> {
  const settings = await getSettings();
  const creds = credentialsFromSettings(settings);
  const now = appNow(settings);
  const since = await lastFmsBatchAt();
  const prepErrors: string[] = [];
  const syncErrors: string[] = [];
  let syncedVisits = 0;

  const scope = await activeStallingScope();
  const pendingVisits = await prisma.visit.findMany({
    where: { ...scope, fmsSyncStatus: "pending" },
    include: { bicycle: true, pass: { select: { passCode: true } } },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });

  const floorChanged = await prisma.bicycle.count({
    where: { ...scope, updatedAt: { gt: since } },
  });

  const prepared: { visit: VisitWithBike; managed: Record<string, unknown>; fmsSection: string }[] =
    [];
  for (const visit of pendingVisits) {
    const built = buildManagedTransactionForVisit(visit);
    if ("error" in built) {
      prepErrors.push(built.error);
      if (built.error.includes("idcode")) {
        await markVisitFmsFailed(visit.id, now, built.error);
      }
      continue;
    }
    prepared.push({ visit, managed: built.managed, fmsSection: built.fmsSection });
  }

  let batchVisitIds: string[] = [];
  if (prepared.length > 0) {
    for (const { visit } of prepared) {
      const saldoErr = await postSaldoForVisitIfNeeded(visit, settings, creds, []);
      if (saldoErr) syncErrors.push(saldoErr);
    }
  }

  if (prepared.length > 0 && syncErrors.length === 0) {
    const bySection = new Map<string, { managed: Record<string, unknown>; visitId: string }[]>();
    for (const p of prepared) {
      const list = bySection.get(p.fmsSection) ?? [];
      list.push({ managed: p.managed, visitId: p.visit.id });
      bySection.set(p.fmsSection, list);
    }

    outer: for (const [fmsSection, items] of bySection) {
      for (let i = 0; i < items.length; i += FMS_MANAGED_TRANSACTIONS_BATCH_MAX) {
        const chunk = items.slice(i, i + FMS_MANAGED_TRANSACTIONS_BATCH_MAX);
        const chunkManaged = chunk.map((c) => c.managed);
        const batch = await postManagedTransactionsBatchForSection(
          creds,
          settings.citycode,
          settings.locationId,
          fmsSection,
          chunkManaged
        );
        if (!batch.ok) {
          const detail = fmsResultErrorMessage(batch);
          syncErrors.push(
            chunk.length === 1
              ? `MT batch sectie ${fmsSection}: HTTP ${batch.status} — ${detail}`
              : `MT batch sectie ${fmsSection} (${chunk.length} transacties): HTTP ${batch.status} — ${detail}`
          );
          syncedVisits = 0;
          batchVisitIds = [];
          break outer;
        }
        syncedVisits += chunk.length;
        batchVisitIds.push(...chunk.map((c) => c.visitId));
      }
    }
  }

  if (pendingVisits.length > 0 || floorChanged > 0) {
    try {
      await runFloorOccupationSync();
    } catch (e) {
      syncErrors.push(e instanceof Error ? e.message : "Occupation sync mislukt");
    }
  }

  const errors = [...prepErrors, ...syncErrors];
  const ok = errors.length === 0;
  const message =
    errors.length === 0
      ? `VeiligStallen bijgewerkt (${syncedVisits} transacties, bezetting).`
      : `Deels gelukt (${syncedVisits} transacties). ${errors.slice(0, 3).join(" · ")}`;

  if (syncErrors.length === 0 && batchVisitIds.length > 0) {
    await markVisitsFmsSynced(batchVisitIds, now, message);
  }

  await prisma.appSettings.update({
    where: { id: "default" },
    data: {
      ...(syncErrors.length === 0 && batchVisitIds.length > 0
        ? { lastFmsBatchAt: now, lastFmsBatchOk: prepErrors.length === 0, lastFmsBatchMessage: message }
        : { lastFmsBatchOk: false, lastFmsBatchMessage: message }),
    },
  });

  return { ok, message, syncedVisits, errors, mode: "batch" as const };
}

/** Sync one pending transaction (oldest first); advances watermark only on full success for that visit. */
export async function runVeiligstallenSingleSync(): Promise<{
  ok: boolean;
  message: string;
  syncedVisits: number;
  errors: string[];
  mode: "single";
}> {
  const settings = await getSettings();
  const creds = credentialsFromSettings(settings);
  const now = appNow(settings);
  const since = await lastFmsBatchAt();
  const errors: string[] = [];
  let syncedVisits = 0;

  const scope = await activeStallingScope();
  const visit = await prisma.visit.findFirst({
    where: { ...scope, fmsSyncStatus: "pending" },
    include: { bicycle: true, pass: { select: { passCode: true } } },
    orderBy: { updatedAt: "asc" },
  });

  if (visit) {
    try {
      const one = await syncOneVisitToFms(visit, settings, creds);
      if (one.errors.length) errors.push(...one.errors);
      if (one.ok) {
        syncedVisits = 1;
        await markVisitFmsSynced(visit.id, now, `Enkel: ${visit.externalTransactionId}`);
        await prisma.appSettings.update({
          where: { id: "default" },
          data: {
            lastFmsBatchAt: now,
            lastFmsBatchOk: true,
            lastFmsBatchMessage: `Enkel: ${visit.externalTransactionId} verstuurd.`,
          },
        });
        const left = await countVisitsPendingFmsSync();
        const message =
          left > 0
            ? `1 transactie verstuurd (${visit.externalTransactionId}). Nog ${left} openstaand.`
            : `1 transactie verstuurd (${visit.externalTransactionId}). Geen openstaande transacties.`;
        return { ok: true, message, syncedVisits, errors: [], mode: "single" };
      }
      const message = errors.join(" · ") || `Enkel: ${visit.externalTransactionId} mislukt`;
      await markVisitFmsFailed(visit.id, now, message);
      await prisma.appSettings.update({
        where: { id: "default" },
        data: { lastFmsBatchOk: false, lastFmsBatchMessage: message },
      });
      return { ok: false, message, syncedVisits: 0, errors, mode: "single" };
    } catch (e) {
      const err = e instanceof Error ? e.message : `Bezoek ${visit.id} mislukt`;
      errors.push(err);
      await markVisitFmsFailed(visit.id, now, err);
      await prisma.appSettings.update({
        where: { id: "default" },
        data: { lastFmsBatchOk: false, lastFmsBatchMessage: err },
      });
      return { ok: false, message: err, syncedVisits: 0, errors, mode: "single" };
    }
  }

  const floorChanged = await prisma.bicycle.count({
    where: { ...scope, updatedAt: { gt: since } },
  });
  if (floorChanged > 0) {
    try {
      await runFloorOccupationSync();
      const message = "Bezetting bijgewerkt (enkel-modus, geen open transacties).";
      await prisma.appSettings.update({
        where: { id: "default" },
        data: {
          lastFmsBatchAt: now,
          lastFmsBatchOk: true,
          lastFmsBatchMessage: message,
        },
      });
      return { ok: true, message, syncedVisits: 0, errors: [], mode: "single" };
    } catch (e) {
      const err = e instanceof Error ? e.message : "Occupation sync mislukt";
      errors.push(err);
      await prisma.appSettings.update({
        where: { id: "default" },
        data: { lastFmsBatchOk: false, lastFmsBatchMessage: err },
      });
      return { ok: false, message: err, syncedVisits: 0, errors, mode: "single" };
    }
  }

  return {
    ok: true,
    message: "Niets te synchroniseren.",
    syncedVisits: 0,
    errors: [],
    mode: "single",
  };
}
