import { prisma } from "@/lib/db";
import { FMS_CALL_TYPES } from "@/lib/fms-log-types";
import type { AppSettingsDto } from "@/lib/settings";

export type FmsCredentials = {
  baseUrl: string;
  username: string;
  password: string;
};

export function credentialsFromSettings(s: AppSettingsDto): FmsCredentials {
  return {
    baseUrl: s.fmsBaseUrl,
    username: s.dataproviderUsername,
    password: s.dataproviderPassword,
  };
}

export function reportingCredentialsFromSettings(s: AppSettingsDto): FmsCredentials {
  return {
    baseUrl: s.fmsBaseUrl,
    username: s.reportingUsername,
    password: s.reportingPassword,
  };
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export function fmsFullUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function buildUrl(baseUrl: string, path: string): string {
  return fmsFullUrl(baseUrl, path);
}

export type FmsCallResult = {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
};

/** Human-readable FMS error from a failed call (for UI / batch summary). */
export function fmsResultErrorMessage(result: FmsCallResult): string {
  if (result.ok) return "";
  if (typeof result.json === "object" && result.json != null) {
    const j = result.json as Record<string, unknown>;
    if (typeof j.message === "string" && j.message.trim()) return j.message.trim();
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
  }
  const t = result.text.trim();
  if (t && t.length < 500) return t;
  return result.status ? `HTTP ${result.status}` : "Onbekende fout";
}

export async function fmsFetch(
  creds: FmsCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<FmsCallResult> {
  const url = buildUrl(creds.baseUrl, path);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: basicAuth(creds.username, creds.password),
        ...(body != null ? { "Content-Type": "application/json" } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Kon VeiligStallen niet bereiken";
    return {
      ok: false,
      status: 0,
      json: { message, networkError: true },
      text: message,
    };
  }
}

export async function logFmsCall(input: {
  visitId?: string;
  callType: string;
  method: string;
  path: string;
  requestBody: unknown;
  result: FmsCallResult;
}): Promise<void> {
  const err =
    input.result.ok
      ? null
      : typeof input.result.json === "object" &&
          input.result.json &&
          "message" in input.result.json
        ? String((input.result.json as { message?: string }).message)
        : input.result.text.slice(0, 500);
  try {
    await prisma.fmsLog.create({
      data: {
        ...(input.visitId ? { visitId: input.visitId } : {}),
        callType: input.callType,
        ok: input.result.ok,
        method: input.method,
        path: input.path,
        requestBody: input.requestBody as object,
        statusCode: input.result.status,
        responseBody: (input.result.json ?? undefined) as object | undefined,
        error: err,
      },
    });
  } catch (e) {
    console.error("FmsLog create failed (run prisma migrate deploy && prisma generate):", e);
  }
}

export function v4LocationPath(citycode: string, locationid: string, suffix = ""): string {
  return `/api/fms/v4/citycodes/${encodeURIComponent(citycode)}/locations/${encodeURIComponent(locationid)}${suffix}`;
}

/** FMS v4 batch limit (all-or-nothing per request). */
export const FMS_MANAGED_TRANSACTIONS_BATCH_MAX = 50;

/** Batch at bikepark level (legacy); prefer section-scoped batch to match single MT POST. */
export async function postManagedTransactionsBatch(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  managedtransactions: Record<string, unknown>[]
): Promise<FmsCallResult> {
  const path = v4LocationPath(citycode, locationid, "/managedtransactions");
  const body = { managedtransactions };
  const result = await fmsFetch(creds, "POST", path, body);
  await logFmsCall({
    callType: FMS_CALL_TYPES.uploadJsonTransactions,
    method: "POST",
    path,
    requestBody: body,
    result,
  });
  return result;
}

export async function postManagedTransactionsBatchForSection(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  sectionid: string,
  managedtransactions: Record<string, unknown>[]
): Promise<FmsCallResult> {
  const path = v4LocationPath(
    citycode,
    locationid,
    `/sections/${encodeURIComponent(sectionid)}/managedtransactions`
  );
  const body = { managedtransactions };
  const result = await fmsFetch(creds, "POST", path, body);
  await logFmsCall({
    callType: FMS_CALL_TYPES.uploadJsonTransactions,
    method: "POST",
    path,
    requestBody: body,
    result,
  });
  return result;
}

export async function postManagedTransaction(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  sectionid: string,
  managed: Record<string, unknown>,
  visitId?: string
): Promise<FmsCallResult> {
  const path = v4LocationPath(
    citycode,
    locationid,
    `/sections/${encodeURIComponent(sectionid)}/managedtransactions`
  );
  const body = { managedtransaction: managed };
  const result = await fmsFetch(creds, "POST", path, body);
  await logFmsCall({
    visitId,
    callType: FMS_CALL_TYPES.uploadJsonTransaction,
    method: "POST",
    path,
    requestBody: body,
    result,
  });
  return result;
}

export async function postOccupation(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  sectionid: string,
  data: Record<string, unknown>,
  visitId?: string
): Promise<FmsCallResult> {
  const path = v4LocationPath(
    citycode,
    locationid,
    `/sections/${encodeURIComponent(sectionid)}/occupation`
  );
  const body = { data };
  const result = await fmsFetch(creds, "POST", path, body);
  await logFmsCall({
    visitId,
    callType: FMS_CALL_TYPES.updateOccupation,
    method: "POST",
    path,
    requestBody: body,
    result,
  });
  return result;
}

export async function postSaveBike(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  idtype: number,
  idcode: string,
  bike: Record<string, unknown>,
  visitId?: string
): Promise<FmsCallResult> {
  const path = v4LocationPath(
    citycode,
    locationid,
    `/idcodes/${idtype}/${encodeURIComponent(idcode)}/bike`
  );
  const body = { bike };
  const result = await fmsFetch(creds, "POST", path, body);
  await logFmsCall({
    visitId,
    callType: FMS_CALL_TYPES.saveJsonBike,
    method: "POST",
    path,
    requestBody: body,
    result,
  });
  return result;
}

export async function postSaldo(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  idtype: number,
  idcode: string,
  payload: { amount: number; paymenttypeid?: number; transactiondate: string },
  visitId?: string
): Promise<FmsCallResult> {
  const path = v4LocationPath(
    citycode,
    locationid,
    `/idcodes/${idtype}/${encodeURIComponent(idcode)}/balance`
  );
  const result = await fmsFetch(creds, "POST", path, payload);
  await logFmsCall({
    visitId,
    callType: FMS_CALL_TYPES.addJsonSaldo,
    method: "POST",
    path,
    requestBody: payload,
    result,
  });
  return result;
}

export async function postSubscription(
  creds: FmsCredentials,
  citycode: string,
  locationid: string,
  subscription: Record<string, unknown>,
  visitId?: string
): Promise<FmsCallResult> {
  const path = v4LocationPath(citycode, locationid, "/subscriptions");
  const body = { subscription };
  const result = await fmsFetch(creds, "POST", path, body);
  await logFmsCall({
    visitId,
    callType: FMS_CALL_TYPES.addSubscription,
    method: "POST",
    path,
    requestBody: body,
    result,
  });
  return result;
}

export async function getLocation(
  creds: FmsCredentials,
  citycode: string,
  locationid: string
): Promise<FmsCallResult> {
  return fmsFetch(creds, "GET", v4LocationPath(citycode, locationid));
}

export async function getSections(
  creds: FmsCredentials,
  citycode: string,
  locationid: string
): Promise<FmsCallResult> {
  return fmsFetch(creds, "GET", v4LocationPath(citycode, locationid, "/sections"));
}

export async function getBiketypes(creds: FmsCredentials): Promise<FmsCallResult> {
  return fmsFetch(creds, "GET", "/api/fms/v4/biketypes");
}

export async function getSubscriptionTypes(
  creds: FmsCredentials,
  citycode: string,
  locationid: string
): Promise<FmsCallResult> {
  return fmsFetch(creds, "GET", v4LocationPath(citycode, locationid, "/subscriptiontypes"));
}

export async function getBalances(
  creds: FmsCredentials,
  citycode: string,
  locationid: string
): Promise<FmsCallResult> {
  return fmsFetch(creds, "GET", v4LocationPath(citycode, locationid, "/balances"));
}

export async function getSubscriptions(
  creds: FmsCredentials,
  citycode: string,
  locationid: string
): Promise<FmsCallResult> {
  return fmsFetch(creds, "GET", v4LocationPath(citycode, locationid, "/subscriptions"));
}

export async function reportingFetch(
  creds: FmsCredentials,
  path: string
): Promise<FmsCallResult> {
  return fmsFetch(creds, "GET", path.startsWith("/") ? path : `/api/reporting${path}`);
}
