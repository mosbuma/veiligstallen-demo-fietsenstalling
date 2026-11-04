import { fmsFullUrl } from "@/lib/fms/client";
import { inferCallTypeFromPath, type FmsCallType } from "@/lib/fms-log-types";

export type FmsLogEntry = {
  id: string;
  createdAt: string;
  callType: FmsCallType;
  ok: boolean;
  statusCode: number;
  method: string;
  path: string;
  url: string;
  visitId: string | null;
  externalTransactionId: string | null;
  requestBody: unknown;
  responseBody: unknown;
  responseText: string;
  error: string | null;
};

type RawLog = {
  id: string;
  visitId: string | null;
  method: string;
  path: string;
  requestBody: unknown;
  statusCode: number | null;
  responseBody: unknown;
  error: string | null;
  createdAt: Date;
  callType?: string | null;
  ok?: boolean | null;
  visit?: { externalTransactionId: string } | null;
};

/** MT-ids from uploadJsonTransactions batch or single managedtransaction body. */
export function externalTransactionIdsFromFmsLogRequest(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  const ids: string[] = [];
  const pushId = (raw: unknown) => {
    if (typeof raw === "string" && raw.trim()) ids.push(raw.trim());
  };
  if (Array.isArray(o.managedtransactions)) {
    for (const mt of o.managedtransactions) {
      if (!mt || typeof mt !== "object") continue;
      const m = mt as Record<string, unknown>;
      pushId(m.externaltransactionid ?? m.externalTransactionId);
    }
  }
  const single = o.managedtransaction;
  if (single && typeof single === "object") {
    const m = single as Record<string, unknown>;
    pushId(m.externaltransactionid ?? m.externalTransactionId);
  }
  return ids;
}

export function fmsLogToEntry(log: RawLog, baseUrl: string): FmsLogEntry {
  const statusCode = log.statusCode ?? 0;
  const callType = (log.callType?.trim() || inferCallTypeFromPath(log.path)) as FmsCallType;
  const ok = log.ok ?? (statusCode >= 200 && statusCode < 300);
  return {
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    callType,
    ok,
    statusCode,
    method: log.method,
    path: log.path,
    url: fmsFullUrl(baseUrl, log.path),
    visitId: log.visitId,
    externalTransactionId: log.visit?.externalTransactionId ?? null,
    requestBody: log.requestBody,
    responseBody: log.responseBody ?? {},
    responseText:
      log.responseBody != null ? JSON.stringify(log.responseBody, null, 2) : log.error ?? "",
    error: log.error,
  };
}
