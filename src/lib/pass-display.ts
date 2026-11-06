/** Uitgegeven sleutelhangers uit het numerieke poolbereik (FMS idcode). */
export const POOL_PASS_CODE_DIGITS = 12;

export function formatIssuedPoolPassCode(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Ongeldig sleutelhangernummer: ${n}`);
  }
  const bare = String(n);
  if (bare.length > POOL_PASS_CODE_DIGITS) {
    throw new Error(
      `Sleutelhangernummer ${n} past niet in ${POOL_PASS_CODE_DIGITS} cijfers — verklein eindbereik op Aansluiten`
    );
  }
  return bare.padStart(POOL_PASS_CODE_DIGITS, "0");
}

/** Idcode in FMS-URL’s / wachtrij (numeriek zonder leading zeros, zoals Wilmar/VS). */
export function idcodeForFmsApi(code: string): string {
  const trimmed = code.trim();
  if (!trimmed || isSyntheticPassCode(trimmed)) return trimmed;
  if (!/^\d+$/.test(trimmed)) return trimmed;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return trimmed;
  return String(n);
}

/** Eén vorm voor numerieke poolcodes (scan/invoer met of zonder leading zeros). */
export function canonicalPoolPassCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed || isSyntheticPassCode(trimmed)) return trimmed;
  if (!/^\d+$/.test(trimmed)) return trimmed;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return trimmed;
  return formatIssuedPoolPassCode(n);
}

/** System-generated placeholder passes (plaats zonder scan); not real idcodes. */
export function isSyntheticPassCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.startsWith("SYS-");
}

export function displayPassCode(code: string | null | undefined): string {
  if (!code || isSyntheticPassCode(code)) return "—";
  return code;
}

/** For editable fields: empty when synthetic so operators never see SYS-* */
export function passCodeForInput(code: string | null | undefined): string {
  if (!code || isSyntheticPassCode(code)) return "";
  return code;
}

/** Registered at balie (scan); `system` = slot bezet but not known to stalling operators. */
export function visitKnownAtBalie(visit: { checkInType: string }): boolean {
  return visit.checkInType === "user" || visit.checkInType === "controle";
}
