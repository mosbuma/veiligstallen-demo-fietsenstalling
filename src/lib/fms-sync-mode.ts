export const FMS_SYNC_MODE_STORAGE_KEY = "veiligstallen-fms-sync-mode";

export type FmsSyncMode = "batch" | "single";

export const FMS_SYNC_MODE_CHANGED_EVENT = "fms-sync-mode-changed";

export function readFmsSyncMode(): FmsSyncMode {
  if (typeof window === "undefined") return "batch";
  return localStorage.getItem(FMS_SYNC_MODE_STORAGE_KEY) === "single" ? "single" : "batch";
}

export function writeFmsSyncMode(mode: FmsSyncMode) {
  localStorage.setItem(FMS_SYNC_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(FMS_SYNC_MODE_CHANGED_EVENT, { detail: mode }));
}
