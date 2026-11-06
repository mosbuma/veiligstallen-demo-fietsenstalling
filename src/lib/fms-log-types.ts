/** Stable call-type labels stored on FmsLog and shown in the UI. */
export const FMS_CALL_TYPES = {
  saveJsonBike: "saveJsonBike",
  addJsonSaldo: "addJsonSaldo",
  uploadJsonTransaction: "uploadJsonTransaction",
  uploadJsonTransactions: "uploadJsonTransactions",
  /** Lumiguide-style bezettingstelling (data.occupation). */
  updateOccupation: "updateOccupation",
  /** Inventarisatie / syncSector: POST occupation met data.bikes → new_wachtrij_sync op VS. */
  syncSector: "syncSector",
  addSubscription: "addSubscription",
  /** POST …/subscriptions/{id} — pas koppelen (Wilmar subscribe). */
  subscribe: "subscribe",
  /** POST …/idcodes/{type}/{code} — tijdelijke pas → definitieve pas (CF subscribe). */
  koppelpas: "koppelpas",
  unknown: "unknown",
} as const;

export function occupationCallType(data: Record<string, unknown>): FmsCallType {
  if ("bikes" in data) return FMS_CALL_TYPES.syncSector;
  return FMS_CALL_TYPES.updateOccupation;
}

export type FmsCallType = (typeof FMS_CALL_TYPES)[keyof typeof FMS_CALL_TYPES];

export function inferCallTypeFromPath(path: string): FmsCallType {
  if (path.includes("managedtransactions")) return FMS_CALL_TYPES.uploadJsonTransaction;
  if (path.includes("/balance")) return FMS_CALL_TYPES.addJsonSaldo;
  if (path.includes("/occupation")) return FMS_CALL_TYPES.updateOccupation;
  if (/\/subscriptions\/\d+/.test(path)) return FMS_CALL_TYPES.subscribe;
  if (path.includes("/subscriptions")) return FMS_CALL_TYPES.addSubscription;
  if (/\/idcodes\/\d+\/[^/]+$/.test(path)) return FMS_CALL_TYPES.koppelpas;
  if (path.includes("/bike")) return FMS_CALL_TYPES.saveJsonBike;
  return FMS_CALL_TYPES.unknown;
}
