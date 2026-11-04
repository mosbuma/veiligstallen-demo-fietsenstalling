import { setActiveStallingProfile } from "@/lib/stalling-profile";
import { getSettings } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { profileId?: string };
  if (!body.profileId?.trim()) {
    return NextResponse.json({ ok: false, message: "profileId ontbreekt" }, { status: 400 });
  }
  await setActiveStallingProfile(body.profileId.trim());
  const settings = await getSettings();
  return NextResponse.json({
    ok: true,
    settings: {
      ...settings,
      dataproviderPassword: settings.dataproviderPassword ? "••••••" : "",
      reportingPassword: settings.reportingPassword ? "••••••" : "",
    },
  });
}
