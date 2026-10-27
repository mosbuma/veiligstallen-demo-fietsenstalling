import { prisma } from "@/lib/db";

export type TariffStep = { timespan: number; cost: number; unit: "hours" | "minutes" };

export type AppSettingsDto = {
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

export async function getSettings(): Promise<AppSettingsDto> {
  let row = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (!row) {
    row = await prisma.appSettings.create({ data: { id: "default" } });
  }
  let tariffSteps: TariffStep[] = [{ timespan: 1, cost: 0.5, unit: "hours" }];
  try {
    tariffSteps = JSON.parse(row.tariffStepsJson) as TariffStep[];
  } catch {
    /* keep default */
  }
  return {
    fmsBaseUrl: row.fmsBaseUrl.replace(/\/$/, ""),
    citycode: row.citycode,
    locationId: row.locationId,
    dataproviderUsername: row.dataproviderUsername,
    dataproviderPassword: row.dataproviderPassword,
    reportingUsername: row.reportingUsername,
    reportingPassword: row.reportingPassword,
    occupationMode: row.occupationMode as AppSettingsDto["occupationMode"],
    clockOffsetSeconds: row.clockOffsetSeconds,
    passRangeStart: row.passRangeStart,
    passRangeEnd: row.passRangeEnd,
    passRangeNext: row.passRangeNext,
    barcodeRangeStart: row.barcodeRangeStart,
    barcodeRangeEnd: row.barcodeRangeEnd,
    barcodeRangeNext: row.barcodeRangeNext,
    defaultIdType: row.defaultIdType,
    defaultBiketypeId: row.defaultBiketypeId,
    defaultSectionCapacity: row.defaultSectionCapacity,
    tariffSteps,
  };
}

export async function updateSettings(partial: Partial<AppSettingsDto>): Promise<AppSettingsDto> {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      fmsBaseUrl: merged.fmsBaseUrl,
      citycode: merged.citycode,
      locationId: merged.locationId,
      dataproviderUsername: merged.dataproviderUsername,
      dataproviderPassword: merged.dataproviderPassword,
      reportingUsername: merged.reportingUsername,
      reportingPassword: merged.reportingPassword,
      occupationMode: merged.occupationMode,
      clockOffsetSeconds: merged.clockOffsetSeconds,
      passRangeStart: merged.passRangeStart,
      passRangeEnd: merged.passRangeEnd,
      passRangeNext: merged.passRangeNext,
      barcodeRangeStart: merged.barcodeRangeStart,
      barcodeRangeEnd: merged.barcodeRangeEnd,
      barcodeRangeNext: merged.barcodeRangeNext,
      defaultIdType: merged.defaultIdType,
      defaultBiketypeId: merged.defaultBiketypeId,
      defaultSectionCapacity: merged.defaultSectionCapacity,
      tariffStepsJson: JSON.stringify(merged.tariffSteps),
    },
    update: {
      fmsBaseUrl: merged.fmsBaseUrl,
      citycode: merged.citycode,
      locationId: merged.locationId,
      dataproviderUsername: merged.dataproviderUsername,
      dataproviderPassword: merged.dataproviderPassword,
      reportingUsername: merged.reportingUsername,
      reportingPassword: merged.reportingPassword,
      occupationMode: merged.occupationMode,
      clockOffsetSeconds: merged.clockOffsetSeconds,
      passRangeStart: merged.passRangeStart,
      passRangeEnd: merged.passRangeEnd,
      passRangeNext: merged.passRangeNext,
      barcodeRangeStart: merged.barcodeRangeStart,
      barcodeRangeEnd: merged.barcodeRangeEnd,
      barcodeRangeNext: merged.barcodeRangeNext,
      defaultIdType: merged.defaultIdType,
      defaultBiketypeId: merged.defaultBiketypeId,
      defaultSectionCapacity: merged.defaultSectionCapacity,
      tariffStepsJson: JSON.stringify(merged.tariffSteps),
    },
  });
  return merged;
}

export function appNow(settings: AppSettingsDto): Date {
  return new Date(Date.now() + settings.clockOffsetSeconds * 1000);
}
