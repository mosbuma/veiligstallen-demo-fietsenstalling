import { listStallingProfiles } from "@/lib/stalling-profile";
import { getSettings } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function GET() {
  const [profiles, settings] = await Promise.all([listStallingProfiles(), getSettings()]);
  return NextResponse.json({
    activeProfileId: settings.stallingProfileId,
    profiles: profiles.map((p) => ({
      id: p.id,
      label: p.label || `${p.citycode} / ${p.locationId}`,
      citycode: p.citycode,
      locationId: p.locationId,
    })),
  });
}
