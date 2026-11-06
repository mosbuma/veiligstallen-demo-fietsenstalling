import { prisma } from "@/lib/db";
import { runVeiligstallenBatchSync } from "@/lib/fms-batch-sync";
import { runEmptyInventoryOccupationSync } from "@/lib/fms/occupation-inventory-sync";
import { appNow, getSettings } from "@/lib/settings";
import { activeStallingScope } from "@/lib/stalling-scope";
import { calculateTransactionCost, stallingsduurMinutes } from "@/lib/tariff";
import { fmsSyncNeedsResync } from "@/lib/visit-fms-sync-state";
import { Decimal } from "@prisma/client/runtime/library";

export type SimulationResetOptions = {
  clearPasses: boolean;
  clearBicycles: boolean;
  resetStalling: boolean;
};

export type SimulationResetResult = {
  ok: boolean;
  message: string;
  checkedOut: number;
  fmsSyncRuns: number;
  fmsSyncedVisits: number;
  fmsErrors: string[];
  visitsDeleted: number;
  fmsLogsDeleted: number;
  passesDeleted: number;
  bicyclesDeleted: number;
  bicyclesClearedFromFloor: number;
};

const bicycleFloorClear = {
  floorPresent: false,
  floorSectionId: "",
  floorStallPlace: "",
  floorPlacementKind: "assigned" as const,
  floorFmsSectionId: "",
};

async function closeAllOpenVisits(): Promise<number> {
  const settings = await getSettings();
  const now = appNow(settings);
  const scope = await activeStallingScope();
  const open = await prisma.visit.findMany({
    where: { ...scope, status: "open" },
    include: { bicycle: true },
  });
  for (const visit of open) {
    const duur = stallingsduurMinutes(visit.checkInDate, now);
    const kosten = calculateTransactionCost(duur, settings.tariffSteps);
    const bicycleId = visit.bicycleId ?? visit.bicycle?.id ?? null;
    await prisma.$transaction(async (tx) => {
      await tx.visit.update({
        where: { id: visit.id },
        data: {
          ...fmsSyncNeedsResync(),
          checkOutDate: now,
          checkOutType: "system",
          stallingsduur: duur,
          stallingskosten: new Decimal(kosten),
          paymentMethod: "cash",
          subscriptionWaived: false,
          status: "closed",
          physicallyPresent: false,
          inventoryBarcode: null,
        },
      });
      if (bicycleId) {
        await tx.bicycle.update({
          where: { id: bicycleId },
          data: bicycleFloorClear,
        });
      }
    });
  }
  return open.length;
}

async function pushAllPendingToFms(): Promise<{
  runs: number;
  syncedVisits: number;
  errors: string[];
}> {
  let runs = 0;
  let syncedVisits = 0;
  const errors: string[] = [];
  for (let i = 0; i < 50; i++) {
    const scope = await activeStallingScope();
    const pending = await prisma.visit.count({ where: { ...scope, fmsSyncStatus: "pending" } });
    if (pending === 0) break;
    runs += 1;
    const result = await runVeiligstallenBatchSync();
    syncedVisits += result.syncedVisits;
    if (result.errors.length) errors.push(...result.errors);
    if (!result.ok && result.syncedVisits === 0) break;
  }
  return { runs, syncedVisits, errors };
}

async function clearStallingData(clearBicycleRecords: boolean): Promise<{
  visitsDeleted: number;
  fmsLogsDeleted: number;
  bicyclesDeleted: number;
  bicyclesClearedFromFloor: number;
}> {
  const scope = await activeStallingScope();
  const visitIds = (
    await prisma.visit.findMany({ where: scope, select: { id: true } })
  ).map((v) => v.id);
  const fmsLogsDeleted =
    visitIds.length > 0
      ? (await prisma.fmsLog.deleteMany({ where: { visitId: { in: visitIds } } })).count
      : 0;
  const visitsDeleted = (await prisma.visit.deleteMany({ where: scope })).count;

  await prisma.appSettings.update({
    where: { id: "default" },
    data: {
      lastFmsBatchAt: null,
      lastFmsBatchOk: null,
      lastFmsBatchMessage: "",
    },
  });

  let bicyclesDeleted = 0;
  let bicyclesClearedFromFloor = 0;
  if (clearBicycleRecords) {
    bicyclesDeleted = (await prisma.bicycle.deleteMany({ where: scope })).count;
  } else {
    bicyclesClearedFromFloor = (
      await prisma.bicycle.updateMany({
        where: scope,
        data: bicycleFloorClear,
      })
    ).count;
  }

  return { visitsDeleted, fmsLogsDeleted, bicyclesDeleted, bicyclesClearedFromFloor };
}

export async function resetSimulation(
  options: SimulationResetOptions
): Promise<SimulationResetResult> {
  if (!options.clearPasses && !options.clearBicycles && !options.resetStalling) {
    return {
      ok: false,
      message: "Kies minstens één optie.",
      checkedOut: 0,
      fmsSyncRuns: 0,
      fmsSyncedVisits: 0,
      fmsErrors: [],
      visitsDeleted: 0,
      fmsLogsDeleted: 0,
      passesDeleted: 0,
      bicyclesDeleted: 0,
      bicyclesClearedFromFloor: 0,
    };
  }

  let checkedOut = 0;
  let fmsSyncRuns = 0;
  let fmsSyncedVisits = 0;
  const fmsErrors: string[] = [];
  let visitsDeleted = 0;
  let fmsLogsDeleted = 0;
  let passesDeleted = 0;
  let bicyclesDeleted = 0;
  let bicyclesClearedFromFloor = 0;
  let pendingBeforeHistoryWipe = 0;

  if (options.resetStalling) {
    checkedOut = await closeAllOpenVisits();
    const fms = await pushAllPendingToFms();
    fmsSyncRuns = fms.runs;
    fmsSyncedVisits = fms.syncedVisits;
    fmsErrors.push(...fms.errors);
    const emptySync = await runEmptyInventoryOccupationSync();
    if (emptySync.errors.length) fmsErrors.push(...emptySync.errors);
    pendingBeforeHistoryWipe = await prisma.visit.count({
      where: { ...(await activeStallingScope()), fmsSyncStatus: "pending" },
    });
    const cleared = await clearStallingData(options.clearBicycles);
    visitsDeleted = cleared.visitsDeleted;
    fmsLogsDeleted = cleared.fmsLogsDeleted;
    bicyclesDeleted = cleared.bicyclesDeleted;
    bicyclesClearedFromFloor = cleared.bicyclesClearedFromFloor;
  }

  if (options.clearBicycles && !options.resetStalling) {
    const scope = await activeStallingScope();
    const visitIds = (
      await prisma.visit.findMany({ where: scope, select: { id: true } })
    ).map((v) => v.id);
    fmsLogsDeleted =
      visitIds.length > 0
        ? (await prisma.fmsLog.deleteMany({ where: { visitId: { in: visitIds } } })).count
        : 0;
    visitsDeleted = (await prisma.visit.deleteMany({ where: scope })).count;
    bicyclesDeleted = (await prisma.bicycle.deleteMany({ where: scope })).count;
  }

  if (options.clearPasses) {
    passesDeleted = (await prisma.pass.deleteMany({ where: await activeStallingScope() })).count;
    await prisma.account.deleteMany({});
  }

  const parts: string[] = [];
  if (options.resetStalling) {
    parts.push(`${checkedOut} uitgecheckt`);
    parts.push(`${fmsSyncedVisits} naar FMS gesynchroniseerd (${fmsSyncRuns} batch(es))`);
    parts.push(`${visitsDeleted} transacties verwijderd`, `${fmsLogsDeleted} logregels gewist`);
    if (options.clearBicycles) parts.push(`${bicyclesDeleted} fietsen verwijderd`);
    else if (bicyclesClearedFromFloor > 0) parts.push(`${bicyclesClearedFromFloor} fietsen van vloer gehaald`);
  }
  if (options.clearPasses) parts.push(`${passesDeleted} sleutelhangers verwijderd`);
  if (options.clearBicycles && !options.resetStalling) {
    parts.push(`${bicyclesDeleted} fietsen verwijderd`);
  }

  let message = parts.join(" · ") || "Geen wijzigingen.";
  if (options.resetStalling && pendingBeforeHistoryWipe > 0) {
    message += ` · Let op: ${pendingBeforeHistoryWipe} transactie(s) stonden nog open voor FMS; lokale historie is wel gewist.`;
  }
  if (fmsErrors.length > 0) {
    message += ` · FMS: ${fmsErrors.slice(0, 2).join(" · ")}`;
  }

  return {
    ok: fmsErrors.length === 0 || !options.resetStalling,
    message,
    checkedOut,
    fmsSyncRuns,
    fmsSyncedVisits,
    fmsErrors,
    visitsDeleted,
    fmsLogsDeleted,
    passesDeleted,
    bicyclesDeleted,
    bicyclesClearedFromFloor,
  };
}
