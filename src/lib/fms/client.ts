import { prisma } from "@/lib/db";
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

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export type FmsCallResult = {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
};

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
  await prisma.fmsLog.create({
    data: {
      visitId: input.visitId,
      method: input.method,
      path: input.path,
      requestBody: input.requestBody as object,
      statusCode: input.result.status,
      responseBody: input.result.json as object,
      error: err,
    },
  });
}

export function v4LocationPath(citycode: string, locationid: string, suffix = ""): string {
  return `/api/fms/v4/citycodes/${encodeURIComponent(citycode)}/locations/${encodeURIComponent(locationid)}${suffix}`;
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
  await logFmsCall({ visitId, method: "POST", path, requestBody: body, result });
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
  await logFmsCall({ visitId, method: "POST", path, requestBody: body, result });
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
  await logFmsCall({ visitId, method: "POST", path, requestBody: body, result });
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
  await logFmsCall({ visitId, method: "POST", path, requestBody: payload, result });
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
  await logFmsCall({ visitId, method: "POST", path, requestBody: body, result });
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
