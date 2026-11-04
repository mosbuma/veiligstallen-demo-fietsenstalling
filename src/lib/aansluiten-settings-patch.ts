import { getSettings, updateSettings, type AppSettingsDto } from "@/lib/settings";

export type AansluitenTestScope = "stalling" | "dataprovider" | "reporting";

function stripEmptyPasswords(patch: Partial<AppSettingsDto>): Partial<AppSettingsDto> {
  const p = { ...patch };
  if (p.dataproviderPassword === "••••••" || !p.dataproviderPassword?.length) {
    delete p.dataproviderPassword;
  }
  if (p.reportingPassword === "••••••" || !p.reportingPassword?.length) {
    delete p.reportingPassword;
  }
  return p;
}

function scopePatch(scope: AansluitenTestScope, body: Partial<AppSettingsDto>): Partial<AppSettingsDto> {
  switch (scope) {
    case "stalling":
      return {
        fmsBaseUrl: body.fmsBaseUrl,
        citycode: body.citycode,
        locationId: body.locationId,
      };
    case "dataprovider":
      return {
        fmsBaseUrl: body.fmsBaseUrl,
        citycode: body.citycode,
        locationId: body.locationId,
        dataproviderUsername: body.dataproviderUsername,
        dataproviderPassword: body.dataproviderPassword,
      };
    case "reporting":
      return {
        fmsBaseUrl: body.fmsBaseUrl,
        citycode: body.citycode,
        locationId: body.locationId,
        reportingUsername: body.reportingUsername,
        reportingPassword: body.reportingPassword,
      };
  }
}

/** Persist only fields relevant to the test button (not the whole aansluiten form). */
export async function applyAansluitenTestPatch(
  scope: AansluitenTestScope,
  body: Partial<AppSettingsDto>
): Promise<AppSettingsDto> {
  if (Object.keys(body).length === 0) {
    return getSettings();
  }
  const current = await getSettings();
  const patch = stripEmptyPasswords(scopePatch(scope, body));
  return updateSettings({ ...current, ...patch });
}
