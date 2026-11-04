import {
  credentialsFromSettings,
  fmsFetch,
  fmsResultErrorMessage,
  getBalances,
  getLocation,
  getSections,
  reportingCredentialsFromSettings,
  reportingFetch,
} from "@/lib/fms/client";
import type { AppSettingsDto } from "@/lib/settings";

const catalogCreds = (baseUrl: string) => ({ baseUrl, username: "", password: "" });

function locationIdFromRow(row: Record<string, unknown>): string {
  return String(row.locationid ?? row.locationID ?? row.id ?? "").trim();
}

function fmsUnauthorizedMessage(res: { json: unknown; text: string }): string | null {
  if (typeof res.json === "object" && res.json != null) {
    const msg = String((res.json as Record<string, unknown>).message ?? "").trim();
    if (msg === "Niet voldoende rechten") {
      return "FMS: login geaccepteerd, maar geen operator-read op balances (401). Normaal voor dataprovider.type2; schrijven kan nog werken.";
    }
    if (msg) return `FMS: ${msg}`;
  }
  return null;
}

export type LoginCheckResult = {
  ok: boolean;
  status: number;
  message: string;
  /** VeiligStallen URL that was called (not this demo app). */
  endpoint: string;
};

function balancesPath(settings: AppSettingsDto): string {
  return `/api/fms/v4/citycodes/${encodeURIComponent(settings.citycode)}/locations/${encodeURIComponent(settings.locationId)}/balances`;
}

function reportingStaticPath(settings: AppSettingsDto): string {
  return `/api/reporting/v4/occupation/static?staticSectionId=${encodeURIComponent(settings.locationId)}`;
}

export async function testFmsDataproviderLogin(
  settings: AppSettingsDto
): Promise<LoginCheckResult> {
  const endpoint = `${settings.fmsBaseUrl.replace(/\/$/, "")}${balancesPath(settings)}`;

  if (!settings.fmsBaseUrl?.trim()) {
    return { ok: false, status: 0, message: "Vul FMS base URL in", endpoint: "" };
  }
  if (!settings.citycode?.trim() || !settings.locationId?.trim()) {
    return { ok: false, status: 0, message: "Vul citycode en location id in", endpoint };
  }
  if (!settings.dataproviderUsername?.trim()) {
    return { ok: false, status: 0, message: "Vul dataprovider gebruikersnaam in", endpoint };
  }

  const creds = credentialsFromSettings(settings);
  const res = await getBalances(creds, settings.citycode, settings.locationId);

  if (res.status === 0) {
    return {
      ok: false,
      status: 0,
      message: `Geen verbinding met ${settings.fmsBaseUrl}. Draait VeiligStallen? (${res.text})`,
      endpoint,
    };
  }
  if (res.status === 401) {
    const hint = fmsUnauthorizedMessage(res);
    if (hint?.includes("dataprovider.type2")) {
      return { ok: true, status: 401, message: hint, endpoint };
    }
    return {
      ok: false,
      status: 401,
      message:
        hint ??
        "FMS: login geweigerd (401). Controleer UrlName, wachtwoord en Toegang FMS-service.",
      endpoint,
    };
  }
  if (res.status === 403) {
    return {
      ok: true,
      status: 403,
      message:
        "FMS: login geaccepteerd, maar geen operator-read op balances (403). Normaal voor dataprovider.type2; schrijven kan nog werken.",
      endpoint,
    };
  }
  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      message: "FMS: dataprovider-login OK (protected read balances).",
      endpoint,
    };
  }
  return {
    ok: false,
    status: res.status,
    message: `FMS: onverwacht antwoord HTTP ${res.status}${fmsResultErrorMessage(res) ? ` — ${fmsResultErrorMessage(res)}` : ""}`,
    endpoint,
  };
}

export async function testStallingConfig(
  settings: Pick<AppSettingsDto, "fmsBaseUrl" | "citycode" | "locationId">
): Promise<LoginCheckResult> {
  const endpoint = `${settings.fmsBaseUrl.replace(/\/$/, "")}/api/fms/v4/citycodes/${encodeURIComponent(settings.citycode)}/locations/${encodeURIComponent(settings.locationId)}`;

  if (!settings.fmsBaseUrl?.trim()) {
    return { ok: false, status: 0, message: "Vul FMS base URL in", endpoint: "" };
  }
  if (!settings.citycode?.trim() || !settings.locationId?.trim()) {
    return { ok: false, status: 0, message: "Vul citycode en location id in", endpoint };
  }

  const creds = catalogCreds(settings.fmsBaseUrl);
  const listPath = `/api/fms/v4/citycodes/${encodeURIComponent(settings.citycode)}/locations`;
  const [listRes, locRes, secRes] = await Promise.all([
    fmsFetch(creds, "GET", listPath),
    getLocation(creds, settings.citycode, settings.locationId),
    getSections(creds, settings.citycode, settings.locationId),
  ]);

  if (locRes.status === 0 || listRes.status === 0) {
    return {
      ok: false,
      status: 0,
      message: `Geen verbinding met ${settings.fmsBaseUrl}. Draait VeiligStallen?`,
      endpoint,
    };
  }

  if (listRes.status === 404) {
    return {
      ok: false,
      status: 404,
      message: `Citycode ${settings.citycode} niet gevonden in FMS.`,
      endpoint: `${settings.fmsBaseUrl.replace(/\/$/, "")}${listPath}`,
    };
  }

  const locations = Array.isArray(listRes.json) ? listRes.json : [];
  const inCity = locations.some(
    (row) => locationIdFromRow(row as Record<string, unknown>) === settings.locationId.trim()
  );

  if (listRes.ok && !inCity) {
    return {
      ok: false,
      status: locRes.status || 404,
      message: `StallingsID ${settings.locationId} hoort niet bij citycode ${settings.citycode} (niet in locatielijst).`,
      endpoint,
    };
  }

  if (!locRes.ok) {
    return {
      ok: false,
      status: locRes.status,
      message:
        locRes.status === 404
          ? `Locatie ${settings.locationId} niet gevonden (controleer StallingsID).`
          : `FMS locatie HTTP ${locRes.status}${fmsResultErrorMessage(locRes) ? ` — ${fmsResultErrorMessage(locRes)}` : ""}`,
      endpoint,
    };
  }

  const loc = locRes.json as Record<string, unknown>;
  const name = String(loc.name ?? loc.title ?? loc.locationname ?? "").trim();
  const sections = Array.isArray(secRes.json) ? secRes.json : [];
  const sectionBrief = sections
    .slice(0, 5)
    .map((s) => {
      const row = s as Record<string, unknown>;
      const id = String(row.sectionid ?? row.id ?? "?").trim();
      const label = row.name != null ? String(row.name).trim() : "";
      return label ? `${id} (${label})` : id;
    })
    .join(", ");
  const more = sections.length > 5 ? `, … (+${sections.length - 5})` : "";

  if (!secRes.ok) {
    return {
      ok: false,
      status: secRes.status,
      message: `Locatie OK${name ? ` (${name})` : ""}, maar secties ophalen mislukt (HTTP ${secRes.status}).`,
      endpoint: `${endpoint}/sections`,
    };
  }

  if (sections.length === 0) {
    return {
      ok: false,
      status: 200,
      message: `Locatie OK${name ? `: ${name}` : ""}, maar FMS geeft 0 secties — configureer secties in VeiligStallen-beheer.`,
      endpoint: `${endpoint}/sections`,
    };
  }

  return {
    ok: true,
    status: locRes.status,
    message: `Stalling OK${name ? `: ${name}` : ""}. ${sections.length} sectie(s): ${sectionBrief}${more}.`,
    endpoint,
  };
}

export async function testReportingLogin(settings: AppSettingsDto): Promise<LoginCheckResult> {
  const path = reportingStaticPath(settings);
  const endpoint = `${settings.fmsBaseUrl.replace(/\/$/, "")}${path}`;

  if (!settings.fmsBaseUrl?.trim()) {
    return { ok: false, status: 0, message: "Vul FMS base URL in", endpoint: "" };
  }
  if (!settings.locationId?.trim()) {
    return { ok: false, status: 0, message: "Vul location id in", endpoint };
  }
  if (!settings.reportingUsername?.trim()) {
    return { ok: false, status: 0, message: "Vul rapportage gebruiker in", endpoint };
  }

  const creds = reportingCredentialsFromSettings(settings);
  const res = await reportingFetch(creds, path);

  if (res.status === 0) {
    return {
      ok: false,
      status: 0,
      message: `Geen verbinding met ${settings.fmsBaseUrl}. (${res.text})`,
      endpoint,
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      status: 401,
      message:
        "Rapportage: login geweigerd (401). Gebruik een FMS site-gebruiker, niet het dataprovider-account.",
      endpoint,
    };
  }
  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      message: "Rapportage: login OK (occupation/static).",
      endpoint,
    };
  }
  return {
    ok: false,
    status: res.status,
    message: `Rapportage: HTTP ${res.status} — controleer rechten op deze stalling/gemeente.`,
    endpoint,
  };
}
