/** Stable call-type labels stored on FmsLog and shown in the UI. */
export const FMS_CALL_TYPES = {
  saveJsonBike: "saveJsonBike",
  addJsonSaldo: "addJsonSaldo",
  uploadJsonTransaction: "uploadJsonTransaction",
  uploadJsonTransactions: "uploadJsonTransactions",
  updateOccupation: "updateOccupation",
  addSubscription: "addSubscription",
  unknown: "unknown",
} as const;

export type FmsCallType = (typeof FMS_CALL_TYPES)[keyof typeof FMS_CALL_TYPES];

export function inferCallTypeFromPath(path: string): FmsCallType {
  if (path.includes("managedtransactions")) return FMS_CALL_TYPES.uploadJsonTransaction;
  if (path.includes("/balance")) return FMS_CALL_TYPES.addJsonSaldo;
  if (path.includes("/occupation")) return FMS_CALL_TYPES.updateOccupation;
  if (path.includes("/subscriptions")) return FMS_CALL_TYPES.addSubscription;
  if (path.includes("/bike")) return FMS_CALL_TYPES.saveJsonBike;
  return FMS_CALL_TYPES.unknown;
}
