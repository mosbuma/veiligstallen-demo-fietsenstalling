/** Allowed on FMS v4 managedtransactions (Wilmar). */
const FMS_CHECK_TYPES = new Set(["user", "controle", "system", "sync", "reservation"]);

export function toFmsCheckType(type: string | null | undefined, fallback = "user"): string {
  const t = (type ?? fallback).trim().toLowerCase();
  if (FMS_CHECK_TYPES.has(t)) return t;
  return "system";
}
