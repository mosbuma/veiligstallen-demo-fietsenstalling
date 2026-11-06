import type { Prisma } from "@prisma/client";
import { canonicalPoolPassCode, formatIssuedPoolPassCode, isSyntheticPassCode } from "@/lib/pass-display";
import type { AppSettingsDto } from "@/lib/settings";

export function passCodeInPoolRange(code: string, start: number, end: number): boolean {
  const n = Number(code);
  if (!Number.isInteger(n)) return false;
  return n >= start && n <= end;
}

export function isBarcodeAsControleIdcode(passCode: string, barcode: string): boolean {
  return passCode.trim().length > 0 && passCode.trim() === barcode.trim();
}

export type CheckInPassMode = "user" | "controle" | "system";

export function validateCheckInCredentials(input: {
  passCode: string;
  barcode: string;
  checkInType: CheckInPassMode;
  passRangeStart: number;
  passRangeEnd: number;
}): void {
  const passCode = input.passCode.trim();
  const barcode = input.barcode.trim();

  if (!passCode) {
    throw new Error("Sleutelhanger is verplicht");
  }
  if (!barcode) {
    throw new Error("Fietssticker is verplicht");
  }
  if (isSyntheticPassCode(passCode)) {
    throw new Error("Systeem-sleutelhanger (SYS-…) kan niet voor check-in gebruikt worden");
  }

  if (
    input.checkInType === "controle" &&
    isBarcodeAsControleIdcode(passCode, barcode)
  ) {
    return;
  }

  if (!passCodeInPoolRange(passCode, input.passRangeStart, input.passRangeEnd)) {
    throw new Error(
      `Sleutelhanger ${passCode} valt buiten het sleutelhangerbereik (${input.passRangeStart}–${input.passRangeEnd})`
    );
  }
}

/** Resolve Pass row for check-in; never creates barcode-shaped pseudo-passes. */
export async function resolvePassForCheckIn(
  tx: Prisma.TransactionClient,
  settings: AppSettingsDto,
  input: {
    passCode: string;
    barcode: string;
    checkInType: CheckInPassMode;
    idType?: number;
  }
): Promise<{ passId: string | null; idType: number; idcode: string }> {
  const rawPass = input.passCode.trim();
  const barcode = input.barcode.trim();
  const checkInType = input.checkInType;
  const passCode =
    checkInType === "controle" && isBarcodeAsControleIdcode(rawPass, barcode)
      ? rawPass
      : canonicalPoolPassCode(rawPass);

  validateCheckInCredentials({
    passCode,
    barcode,
    checkInType,
    passRangeStart: settings.passRangeStart,
    passRangeEnd: settings.passRangeEnd,
  });

  const idcode = passCode;

  if (checkInType === "controle" && isBarcodeAsControleIdcode(passCode, barcode)) {
    return {
      passId: null,
      idType: input.idType ?? settings.defaultIdType,
      idcode,
    };
  }

  const profileId = settings.stallingProfileId;
  let pass = await tx.pass.findFirst({
    where: { stallingProfileId: profileId, passCode },
  });

  if (!pass) {
    pass = await issuePoolPassIfNext(tx, profileId, passCode, input.idType ?? settings.defaultIdType, settings);
  }

  return {
    passId: pass.id,
    idType: input.idType ?? pass.idType,
    idcode,
  };
}

async function issuePoolPassIfNext(
  tx: Prisma.TransactionClient,
  profileId: string,
  passCode: string,
  idType: number,
  settings: AppSettingsDto
) {
  const row = await tx.stallingProfile.findUniqueOrThrow({ where: { id: profileId } });
  const n = Number(passCode);
  if (!Number.isInteger(n) || n < row.passRangeStart || n > row.passRangeEnd) {
    throw new Error(`Sleutelhanger ${passCode} valt buiten sleutelhangerbereik`);
  }
  if (n !== row.passRangeNext) {
    throw new Error(
      `Sleutelhanger ${passCode} is nog niet uitgegeven (volgende vrije: ${formatIssuedPoolPassCode(row.passRangeNext)}). Gebruik Sleutelhanger uitgeven of willekeurige sleutelhanger.`
    );
  }
  if (row.passRangeNext > row.passRangeEnd) {
    throw new Error("Sleutelhangerbereik uitgeput — verhoog eind of volgende aan op Aansluiten");
  }
  const issuedCode = formatIssuedPoolPassCode(n);
  await tx.stallingProfile.update({
    where: { id: profileId },
    data: { passRangeNext: row.passRangeNext + 1 },
  });
  return tx.pass.create({
    data: {
      stallingProfileId: profileId,
      passCode: issuedCode,
      idType,
    },
  });
}
