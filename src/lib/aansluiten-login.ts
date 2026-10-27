import {
  credentialsFromSettings,
  getBalances,
  reportingCredentialsFromSettings,
  reportingFetch,
} from "@/lib/fms/client";
import type { AppSettingsDto } from "@/lib/settings";

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
    return {
      ok: false,
      status: 401,
      message: "FMS: login geweigerd (401). Controleer UrlName en wachtwoord van de dataleverancier.",
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
    message: `FMS: onverwacht antwoord HTTP ${res.status}`,
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
