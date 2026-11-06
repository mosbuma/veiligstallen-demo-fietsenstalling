import { idcodeForFmsApi, isSyntheticPassCode } from "@/lib/pass-display";

/** Wilmar: occupation / controle-in idcode when pass may be unknown (VS parking-simulation). */
export function syncIdcodeForBike(
  passCode: string | null | undefined,
  barcode: string
): string {
  const pass = passCode?.trim();
  if (pass && !isSyntheticPassCode(pass)) return idcodeForFmsApi(pass);
  return barcode.trim();
}

/** idtype for FMS when linking barcode to idcode (barcode-only controle-in). */
export function idTypeForSyncIdcode(idcode: string, barcode: string, passIdType: number): number {
  if (idcode.trim() === barcode.trim() && !isSyntheticPassCode(idcode)) {
    return passIdType === 0 ? 2 : passIdType;
  }
  return passIdType;
}
