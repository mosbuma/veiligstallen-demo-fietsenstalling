import { prisma } from "@/lib/db";

export type StallingProfileDto = {
  id: string;
  label: string;
  citycode: string;
  locationId: string;
  dataproviderUsername: string;
  dataproviderPassword: string;
  reportingUsername: string;
  reportingPassword: string;
  passRangeStart: number;
  passRangeEnd: number;
  passRangeNext: number;
  barcodeRangeStart: number;
  barcodeRangeEnd: number;
  barcodeRangeNext: number;
  defaultIdType: number;
  defaultBiketypeId: number;
  defaultSectionCapacity: number;
};

export function profileLabel(citycode: string, locationId: string, extra?: string): string {
  const base = `${citycode} / ${locationId}`;
  return extra?.trim() ? `${base} — ${extra.trim()}` : base;
}

function toDto(row: {
  id: string;
  label: string;
  citycode: string;
  locationId: string;
  dataproviderUsername: string;
  dataproviderPassword: string;
  reportingUsername: string;
  reportingPassword: string;
  passRangeStart: number;
  passRangeEnd: number;
  passRangeNext: number;
  barcodeRangeStart: number;
  barcodeRangeEnd: number;
  barcodeRangeNext: number;
  defaultIdType: number;
  defaultBiketypeId: number;
  defaultSectionCapacity: number;
}): StallingProfileDto {
  return { ...row };
}

export async function listStallingProfiles(): Promise<StallingProfileDto[]> {
  const rows = await prisma.stallingProfile.findMany({ orderBy: [{ citycode: "asc" }, { locationId: "asc" }] });
  return rows.map(toDto);
}

export async function getStallingProfileById(id: string): Promise<StallingProfileDto | null> {
  const row = await prisma.stallingProfile.findUnique({ where: { id } });
  return row ? toDto(row) : null;
}

export async function getActiveStallingProfileId(): Promise<string> {
  const app = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (app?.activeStallingProfileId) return app.activeStallingProfileId;
  const first = await prisma.stallingProfile.findFirst({ orderBy: { createdAt: "asc" } });
  if (!first) {
    const created = await ensureDefaultProfile();
    return created.id;
  }
  await prisma.appSettings.update({
    where: { id: "default" },
    data: { activeStallingProfileId: first.id },
  });
  return first.id;
}

async function ensureDefaultProfile() {
  return prisma.stallingProfile.create({
    data: {
      id: "default-profile",
      label: profileLabel("9933", "9933_001"),
      citycode: "9933",
      locationId: "9933_001",
    },
  });
}

export async function getActiveStallingProfile(): Promise<StallingProfileDto> {
  const id = await getActiveStallingProfileId();
  const row = await prisma.stallingProfile.findUniqueOrThrow({ where: { id } });
  return toDto(row);
}

export async function setActiveStallingProfile(profileId: string): Promise<StallingProfileDto> {
  await prisma.stallingProfile.findUniqueOrThrow({ where: { id: profileId } });
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", activeStallingProfileId: profileId },
    update: { activeStallingProfileId: profileId },
  });
  return getActiveStallingProfile();
}

export type StallingProfilePatch = Partial<
  Omit<StallingProfileDto, "id" | "label"> & { label?: string }
>;

export async function upsertStallingProfileForConnection(
  citycode: string,
  locationId: string,
  patch: StallingProfilePatch = {}
): Promise<StallingProfileDto> {
  const cc = citycode.trim();
  const loc = locationId.trim();
  const existing = await prisma.stallingProfile.findUnique({
    where: { citycode_locationId: { citycode: cc, locationId: loc } },
  });
  const data = {
    citycode: cc,
    locationId: loc,
    label: patch.label?.trim() || profileLabel(cc, loc),
    dataproviderUsername: patch.dataproviderUsername,
    dataproviderPassword: patch.dataproviderPassword,
    reportingUsername: patch.reportingUsername,
    reportingPassword: patch.reportingPassword,
    passRangeStart: patch.passRangeStart,
    passRangeEnd: patch.passRangeEnd,
    passRangeNext: patch.passRangeNext,
    barcodeRangeStart: patch.barcodeRangeStart,
    barcodeRangeEnd: patch.barcodeRangeEnd,
    barcodeRangeNext: patch.barcodeRangeNext,
    defaultIdType: patch.defaultIdType,
    defaultBiketypeId: patch.defaultBiketypeId,
    defaultSectionCapacity: patch.defaultSectionCapacity,
  };
  const cleaned = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;

  let row;
  if (existing) {
    row = await prisma.stallingProfile.update({
      where: { id: existing.id },
      data: cleaned,
    });
  } else {
    row = await prisma.stallingProfile.create({
      data: {
        citycode: cc,
        locationId: loc,
        label: profileLabel(cc, loc),
        ...cleaned,
      },
    });
  }
  await setActiveStallingProfile(row.id);
  return toDto(row);
}

export async function updateActiveStallingProfile(patch: StallingProfilePatch): Promise<StallingProfileDto> {
  const id = await getActiveStallingProfileId();
  const cleaned = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;
  const row = await prisma.stallingProfile.update({
    where: { id },
    data: cleaned,
  });
  return toDto(row);
}
