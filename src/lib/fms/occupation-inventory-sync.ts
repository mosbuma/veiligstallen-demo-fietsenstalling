/**
 * Wilmar syncSector equivalent: POST …/occupation with data.bikes → new_wachtrij_sync.
 */
import { credentialsFromSettings, postOccupation, type FmsCredentials } from "@/lib/fms/client";
import { syncIdcodeForBike, idTypeForSyncIdcode } from "@/lib/fms/sync-idcode";
import { getMetadataBundle, parseSections } from "@/lib/fms/metadata-cache";
import { fmsSectionForFloor } from "@/lib/real-world";
import { appNow, getSettings, type AppSettingsDto } from "@/lib/settings";
import { activeStallingScope } from "@/lib/stalling-scope";
import { prisma } from "@/lib/db";
import { isSyntheticPassCode } from "@/lib/pass-display";

export type OccupationBikePayload = {
  idcode: string;
  idtype: number;
  transactiondate: string;
  bikeid?: string;
};

function occupationModeAllowsInventorySync(mode: AppSettingsDto["occupationMode"]): boolean {
  return mode === "indirect" || mode === "both";
}

type FloorBikeRow = {
  barcode: string;
  biketypeId: number;
  floorPresent: boolean;
  floorSectionId: string;
  floorStallPlace: string;
  floorPlacementKind: string;
  floorFmsSectionId: string;
  pass: { passCode: string; idType: number } | null;
  visits: { idcode: string; idType: number; fmsSyncStatus: string }[];
};

async function loadFloorBicycles(): Promise<FloorBikeRow[]> {
  const { stallingProfileId } = await activeStallingScope();
  return prisma.bicycle.findMany({
    where: { stallingProfileId, floorPresent: true },
    include: {
      pass: { select: { passCode: true, idType: true } },
      visits: {
        where: { stallingProfileId, status: "open" },
        take: 1,
        select: { idcode: true, idType: true, fmsSyncStatus: true },
      },
    },
  });
}

function appendBikeToSectionMap(
  bySection: Map<string, OccupationBikePayload[]>,
  b: FloorBikeRow,
  open: FloorBikeRow["visits"][0] | undefined,
  transactionDate: string
) {
  const section = fmsSectionForFloor(b);
  if (!section) return;
  const passCode = open?.idcode ?? b.pass?.passCode ?? "";
  const idcode = syncIdcodeForBike(passCode, b.barcode);
  if (!idcode || isSyntheticPassCode(idcode)) return;
  const idtype = open?.idType ?? idTypeForSyncIdcode(idcode, b.barcode, b.pass?.idType ?? 0);
  const entry: OccupationBikePayload = {
    idcode,
    idtype,
    transactiondate: transactionDate,
    bikeid: b.barcode,
  };
  const list = bySection.get(section) ?? [];
  list.push(entry);
  bySection.set(section, list);
}

async function floorBikesBySection(
  transactionDate: string,
  filter?: (b: FloorBikeRow, open: FloorBikeRow["visits"][0] | undefined) => boolean
): Promise<Map<string, OccupationBikePayload[]>> {
  const bicycles = await loadFloorBicycles();
  const bySection = new Map<string, OccupationBikePayload[]>();
  for (const b of bicycles) {
    const open = b.visits[0];
    if (filter && !filter(b, open)) continue;
    appendBikeToSectionMap(bySection, b, open, transactionDate);
  }
  return bySection;
}

/** seq-sync-only: fiets op vloer zonder open lokaal bezoek (geen eerdere MT check-in in demo). */
function isSyncOnlyCandidate(_b: FloorBikeRow, open: FloorBikeRow["visits"][0] | undefined): boolean {
  return !open;
}

async function allFmsSectionIds(): Promise<string[]> {
  const bundle = await getMetadataBundle(false);
  const sections = parseSections(bundle.sections.json);
  const ids = sections
    .map((s) => String(s.sectionid ?? s.id ?? "").trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

export async function postSectorOccupationBikes(
  settings: AppSettingsDto,
  creds: FmsCredentials,
  fmsSectionId: string,
  bikes: OccupationBikePayload[]
): Promise<{ ok: boolean; status: number; error?: string }> {
  const transactiondate = bikes[0]?.transactiondate ?? appNow(settings).toISOString();
  const res = await postOccupation(
    creds,
    settings.citycode,
    settings.locationId,
    fmsSectionId,
    {
      bikes: bikes.map(({ idcode, idtype, transactiondate: td, bikeid }) => ({
        idcode,
        idtype,
        transactiondate: td,
        ...(bikeid ? { bikeid } : {}),
      })),
      transactiondate,
    }
  );
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        typeof res.json === "object" && res.json && "message" in (res.json as object)
          ? String((res.json as { message: unknown }).message)
          : res.text.slice(0, 200) || `HTTP ${res.status}`,
    };
  }
  return { ok: true, status: res.status };
}

async function runOccupationSyncFromFloorMap(
  bySection: Map<string, OccupationBikePayload[]>
): Promise<{ ok: boolean; sections: number; errors: string[]; bikeCount: number }> {
  const settings = await getSettings();
  const creds = credentialsFromSettings(settings);
  const errors: string[] = [];
  let sections = 0;
  let bikeCount = 0;
  for (const [sectionId, bikes] of bySection) {
    bikeCount += bikes.length;
    const res = await postSectorOccupationBikes(settings, creds, sectionId, bikes);
    if (!res.ok) errors.push(`Occupation sync ${sectionId}: ${res.error ?? res.status}`);
    else sections += 1;
  }
  return { ok: errors.length === 0, sections, errors, bikeCount };
}

/** Inventarisatie OK: occupation with current floor bikes per section (Wilmar scanlijst). */
export async function runInventoryOccupationSyncFromFloor(): Promise<{
  ok: boolean;
  sections: number;
  errors: string[];
  bikeCount?: number;
}> {
  const settings = await getSettings();
  if (!occupationModeAllowsInventorySync(settings.occupationMode)) {
    return { ok: true, sections: 0, errors: [] };
  }
  const now = appNow(settings).toISOString();
  const bySection = await floorBikesBySection(now);
  const result = await runOccupationSyncFromFloorMap(bySection);
  return { ok: result.ok, sections: result.sections, errors: result.errors, bikeCount: result.bikeCount };
}

/**
 * seq-sync-only testpad: alleen vloerfietsen zonder open lokaal bezoek.
 * FMS maakt Type_checkin=sync als die pas/barcode nog niet geparkeerd staat (na process-queues).
 */
export async function runSyncOnlyOccupationSyncFromFloor(): Promise<{
  ok: boolean;
  sections: number;
  errors: string[];
  bikeCount: number;
}> {
  const settings = await getSettings();
  if (!occupationModeAllowsInventorySync(settings.occupationMode)) {
    return { ok: true, sections: 0, errors: [], bikeCount: 0 };
  }
  const now = appNow(settings).toISOString();
  const bySection = await floorBikesBySection(now, isSyncOnlyCandidate);
  return runOccupationSyncFromFloorMap(bySection);
}

async function runEmptyInventoryOccupationSyncFixed(
  settings: AppSettingsDto,
  creds: FmsCredentials,
  transactiondate: string,
  sectionIds: string[]
): Promise<{ ok: boolean; sections: number; errors: string[] }> {
  const errors: string[] = [];
  let sections = 0;
  for (const sectionId of sectionIds) {
    const res = await postOccupation(
      creds,
      settings.citycode,
      settings.locationId,
      sectionId,
      { bikes: [], transactiondate }
    );
    if (!res.ok) {
      errors.push(
        `Occupation leeg ${sectionId}: HTTP ${res.status} ${typeof res.json === "object" && res.json && "message" in (res.json as object) ? String((res.json as { message: unknown }).message) : ""}`
      );
    } else sections += 1;
  }
  return { ok: errors.length === 0, sections, errors };
}

/** Sluiten / alles weg: lege bikes[] per sectie (sync-checkout in FMS). */
export async function runEmptyInventoryOccupationSync(): Promise<{
  ok: boolean;
  sections: number;
  errors: string[];
}> {
  const settings = await getSettings();
  if (!occupationModeAllowsInventorySync(settings.occupationMode)) {
    return { ok: true, sections: 0, errors: [] };
  }
  const creds = credentialsFromSettings(settings);
  const now = appNow(settings).toISOString();
  const sectionIds = await allFmsSectionIds();
  return runEmptyInventoryOccupationSyncFixed(settings, creds, now, sectionIds);
}

/** @deprecated name — use runInventoryOccupationSyncFromFloor */
export async function syncOccupationInventory(
  sectionId: string,
  bikes: Array<{ idcode: string; idtype: number; bikeid: string }>
): Promise<{ ok: boolean; status: number; localOnly?: false; error?: string }> {
  const settings = await getSettings();
  const creds = credentialsFromSettings(settings);
  const now = appNow(settings).toISOString();
  const payloads: OccupationBikePayload[] = bikes.map((b) => ({
    idcode: b.idcode,
    idtype: b.idtype,
    transactiondate: now,
    bikeid: b.bikeid,
  }));
  const res = await postSectorOccupationBikes(settings, creds, sectionId, payloads);
  return { ok: res.ok, status: res.status, error: res.error };
}
