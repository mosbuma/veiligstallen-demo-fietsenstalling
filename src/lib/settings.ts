import { prisma } from "@/lib/db";
import {
  getActiveStallingProfile,
  getActiveStallingProfileId,
  updateActiveStallingProfile,
  upsertStallingProfileForConnection,
  type StallingProfilePatch,
} from "@/lib/stalling-profile";

export type TariffStep = { timespan: number; cost: number; unit: "hours" | "minutes" };

/** Merged view: global app settings + active stalling profile (used across the demo). */
export type AppSettingsDto = {
  stallingProfileId: string;
  fmsBaseUrl: string;
  citycode: string;
  locationId: string;
  dataproviderUsername: string;
  dataproviderPassword: string;
  reportingUsername: string;
  reportingPassword: string;
  occupationMode: "indirect" | "direct" | "both";
  clockOffsetSeconds: number;
  passRangeStart: number;
  passRangeEnd: number;
  passRangeNext: number;
  barcodeRangeStart: number;
  barcodeRangeEnd: number;
  barcodeRangeNext: number;
  defaultIdType: number;
  defaultBiketypeId: number;
  defaultSectionCapacity: number;
  tariffSteps: TariffStep[];
};

async function getAppRow() {
  let row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!row) {
    row = await prisma.appSettings.create({ data: { id: "default" } });
  }
  return row;
}

function parseTariffSteps(json: string): TariffStep[] {
  try {
    return JSON.parse(json) as TariffStep[];
  } catch {
    return [{ timespan: 1, cost: 0.5, unit: "hours" }];
  }
}

export async function getSettings(): Promise<AppSettingsDto> {
  const [app, profile] = await Promise.all([getAppRow(), getActiveStallingProfile()]);
  return {
    stallingProfileId: profile.id,
    fmsBaseUrl: app.fmsBaseUrl.replace(/\/$/, ""),
    citycode: profile.citycode,
    locationId: profile.locationId,
    dataproviderUsername: profile.dataproviderUsername,
    dataproviderPassword: profile.dataproviderPassword,
    reportingUsername: profile.reportingUsername,
    reportingPassword: profile.reportingPassword,
    occupationMode: app.occupationMode as AppSettingsDto["occupationMode"],
    clockOffsetSeconds: app.clockOffsetSeconds,
    passRangeStart: profile.passRangeStart,
    passRangeEnd: profile.passRangeEnd,
    passRangeNext: profile.passRangeNext,
    barcodeRangeStart: profile.barcodeRangeStart,
    barcodeRangeEnd: profile.barcodeRangeEnd,
    barcodeRangeNext: profile.barcodeRangeNext,
    defaultIdType: profile.defaultIdType,
    defaultBiketypeId: profile.defaultBiketypeId,
    defaultSectionCapacity: profile.defaultSectionCapacity,
    tariffSteps: parseTariffSteps(app.tariffStepsJson),
  };
}

export async function updateSettings(partial: Partial<AppSettingsDto>): Promise<AppSettingsDto> {
  const app = await getAppRow();
  const profileId = partial.stallingProfileId ?? (await getActiveStallingProfileId());

  const appPatch: {
    fmsBaseUrl?: string;
    occupationMode?: string;
    clockOffsetSeconds?: number;
    tariffStepsJson?: string;
  } = {};
  if (partial.fmsBaseUrl != null) appPatch.fmsBaseUrl = partial.fmsBaseUrl.replace(/\/$/, "");
  if (partial.occupationMode != null) appPatch.occupationMode = partial.occupationMode;
  if (partial.clockOffsetSeconds != null) appPatch.clockOffsetSeconds = partial.clockOffsetSeconds;
  if (partial.tariffSteps != null) appPatch.tariffStepsJson = JSON.stringify(partial.tariffSteps);

  if (Object.keys(appPatch).length > 0) {
    await prisma.appSettings.update({
      where: { id: "default" },
      data: appPatch,
    });
  }

  const profilePatch: StallingProfilePatch = {};
  if (partial.citycode != null && partial.locationId != null) {
    await upsertStallingProfileForConnection(partial.citycode, partial.locationId, {
      dataproviderUsername: partial.dataproviderUsername,
      dataproviderPassword: partial.dataproviderPassword,
      reportingUsername: partial.reportingUsername,
      reportingPassword: partial.reportingPassword,
      passRangeStart: partial.passRangeStart,
      passRangeEnd: partial.passRangeEnd,
      passRangeNext: partial.passRangeNext,
      barcodeRangeStart: partial.barcodeRangeStart,
      barcodeRangeEnd: partial.barcodeRangeEnd,
      barcodeRangeNext: partial.barcodeRangeNext,
      defaultIdType: partial.defaultIdType,
      defaultBiketypeId: partial.defaultBiketypeId,
      defaultSectionCapacity: partial.defaultSectionCapacity,
    });
  } else {
    if (partial.dataproviderUsername != null) profilePatch.dataproviderUsername = partial.dataproviderUsername;
    if (partial.dataproviderPassword != null) profilePatch.dataproviderPassword = partial.dataproviderPassword;
    if (partial.reportingUsername != null) profilePatch.reportingUsername = partial.reportingUsername;
    if (partial.reportingPassword != null) profilePatch.reportingPassword = partial.reportingPassword;
    if (partial.passRangeStart != null) profilePatch.passRangeStart = partial.passRangeStart;
    if (partial.passRangeEnd != null) profilePatch.passRangeEnd = partial.passRangeEnd;
    if (partial.passRangeNext != null) profilePatch.passRangeNext = partial.passRangeNext;
    if (partial.barcodeRangeStart != null) profilePatch.barcodeRangeStart = partial.barcodeRangeStart;
    if (partial.barcodeRangeEnd != null) profilePatch.barcodeRangeEnd = partial.barcodeRangeEnd;
    if (partial.barcodeRangeNext != null) profilePatch.barcodeRangeNext = partial.barcodeRangeNext;
    if (partial.defaultIdType != null) profilePatch.defaultIdType = partial.defaultIdType;
    if (partial.defaultBiketypeId != null) profilePatch.defaultBiketypeId = partial.defaultBiketypeId;
    if (partial.defaultSectionCapacity != null) profilePatch.defaultSectionCapacity = partial.defaultSectionCapacity;
    if (Object.keys(profilePatch).length > 0) {
      await updateActiveStallingProfile(profilePatch);
    }
  }

  void profileId;
  return getSettings();
}

export function appNow(settings: AppSettingsDto): Date {
  return new Date(Date.now() + settings.clockOffsetSeconds * 1000);
}
