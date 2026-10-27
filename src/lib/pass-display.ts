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
