import { isSyntheticPassCode } from "@/lib/pass-display";
import { prisma } from "@/lib/db";
import { getSettings, type AppSettingsDto } from "@/lib/settings";
import { passCodesInUseFromStallingInventory } from "@/lib/stalling-inventory";

export type PoolSlice = { start: number; end: number; next: number; remaining: number };

export function poolStatus(settings: AppSettingsDto): { pass: PoolSlice; barcode: PoolSlice } {
  const passRemaining =
    settings.passRangeNext <= settings.passRangeEnd
      ? settings.passRangeEnd - settings.passRangeNext + 1
      : 0;
  const barcodeRemaining =
    settings.barcodeRangeNext <= settings.barcodeRangeEnd
      ? settings.barcodeRangeEnd - settings.barcodeRangeNext + 1
      : 0;
  return {
    pass: {
      start: settings.passRangeStart,
      end: settings.passRangeEnd,
      next: settings.passRangeNext,
      remaining: passRemaining,
    },
    barcode: {
      start: settings.barcodeRangeStart,
      end: settings.barcodeRangeEnd,
      next: settings.barcodeRangeNext,
      remaining: barcodeRemaining,
    },
  };
}

export class PoolExhaustedError extends Error {
  constructor(kind: "pass" | "barcode") {
    super(
      kind === "pass"
        ? "Pasbereik uitgeput — verhoog eind of pas volgende aan op Aansluiten"
        : "Barcodebereik uitgeput — verhoog eind of pas volgende aan op Aansluiten"
    );
    this.name = "PoolExhaustedError";
  }
}

async function consumePassCode(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.appSettings.findUniqueOrThrow({ where: { id: "default" } });
    if (row.passRangeNext > row.passRangeEnd) throw new PoolExhaustedError("pass");
    const passCode = String(row.passRangeNext);
    await tx.appSettings.update({
      where: { id: "default" },
      data: { passRangeNext: row.passRangeNext + 1 },
    });
    return passCode;
  });
}

async function consumeBarcode(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.appSettings.findUniqueOrThrow({ where: { id: "default" } });
    if (row.barcodeRangeNext > row.barcodeRangeEnd) throw new PoolExhaustedError("barcode");
    const barcode = String(row.barcodeRangeNext);
    await tx.appSettings.update({
      where: { id: "default" },
      data: { barcodeRangeNext: row.barcodeRangeNext + 1 },
    });
    return barcode;
  });
}

function passCodeInPoolRange(code: string, start: number, end: number): boolean {
  const n = Number(code);
  if (!Number.isInteger(n)) return false;
  return n >= start && n <= end;
}

/** Issued pass in pool range, not in use on stalling inventaris (for balie random pas). */
export async function pickRandomUnusedPoolPass(
  settings?: AppSettingsDto
): Promise<string | null> {
  const s = settings ?? (await getSettings());
  const [passes, openVisits] = await Promise.all([
    prisma.pass.findMany({ select: { passCode: true } }),
    prisma.visit.findMany({ where: { status: "open" }, select: { idcode: true } }),
  ]);
  const inUse = new Set(passCodesInUseFromStallingInventory(openVisits));
  const candidates = passes
    .map((p) => p.passCode)
    .filter((code) => !isSyntheticPassCode(code))
    .filter((code) => passCodeInPoolRange(code, s.passRangeStart, s.passRangeEnd))
    .filter((code) => !inUse.has(code));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}

export async function issuePass(accountId?: string): Promise<{ passCode: string; id: string }> {
  const settings = await getSettings();
  const passCode = await consumePassCode();
  const pass = await prisma.pass.create({
    data: {
      passCode,
      idType: settings.defaultIdType,
      accountId: accountId ?? null,
    },
  });
  return { passCode, id: pass.id };
}

/** @deprecated use issueBarcodedBicycle */
export async function issueBarcode(passId?: string, biketypeId?: number): Promise<{ barcode: string; id: string }> {
  const settings = await getSettings();
  const barcode = await consumeBarcode();
  const bicycle = await prisma.bicycle.create({
    data: {
      barcode,
      biketypeId: biketypeId ?? settings.defaultBiketypeId,
      passId: passId ?? null,
    },
  });
  return { barcode, id: bicycle.id };
}

export async function issueBarcodedBicycle(biketypeId?: number): Promise<{ barcode: string; id: string }> {
  const settings = await getSettings();
  const barcode = await consumeBarcode();
  const bicycle = await prisma.bicycle.create({
    data: {
      barcode,
      biketypeId: biketypeId ?? settings.defaultBiketypeId,
    },
  });
  return { barcode, id: bicycle.id };
}

export async function createAccount(label?: string) {
  return prisma.account.create({ data: { label } });
}
