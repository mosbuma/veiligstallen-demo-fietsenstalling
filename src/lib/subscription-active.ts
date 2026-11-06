import { canonicalPoolPassCode, idcodeForFmsApi } from "@/lib/pass-display";

function addPassCodeAliases(set: Set<string>, code: string) {
  const trimmed = code.trim();
  if (!trimmed) return;
  set.add(trimmed);
  const fms = idcodeForFmsApi(trimmed);
  if (fms !== trimmed) set.add(fms);
  const canon = canonicalPoolPassCode(trimmed);
  if (canon !== trimmed) set.add(canon);
}

/** Active FMS subscriptions from cached GET …/subscriptions (idcode not expired). */
export function activeSubscriptionIdcodes(subscriptions: unknown): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(subscriptions)) return set;
  const now = new Date();
  for (const sub of subscriptions) {
    const row = sub as Record<string, unknown>;
    const code = String(row.idcode ?? "").trim();
    if (!code) continue;
    const exp = row.expirationdate ? new Date(String(row.expirationdate)) : null;
    if (exp && exp < now) continue;
    addPassCodeAliases(set, code);
  }
  return set;
}

export function passHasActiveSubscription(passCode: string, subscriptions: unknown): boolean {
  const set = activeSubscriptionIdcodes(subscriptions);
  const trimmed = passCode.trim();
  if (set.has(trimmed)) return true;
  const fms = idcodeForFmsApi(trimmed);
  if (fms !== trimmed && set.has(fms)) return true;
  const canon = canonicalPoolPassCode(trimmed);
  if (canon !== trimmed && set.has(canon)) return true;
  return false;
}
