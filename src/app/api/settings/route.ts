import { getSettings, updateSettings, type AppSettingsDto } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function GET() {
  const s = await getSettings();
  return NextResponse.json({
    ...s,
    dataproviderPassword: s.dataproviderPassword ? "••••••" : "",
    reportingPassword: s.reportingPassword ? "••••••" : "",
  });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as Partial<AppSettingsDto> & {
    dataproviderPassword?: string;
    reportingPassword?: string;
  };
  const current = await getSettings();
  const patch = { ...body };
  if (patch.dataproviderPassword === "••••••" || !patch.dataproviderPassword?.length) {
    delete patch.dataproviderPassword;
  }
  if (patch.reportingPassword === "••••••" || !patch.reportingPassword?.length) {
    delete patch.reportingPassword;
  }
  const updated = await updateSettings(patch);
  return NextResponse.json({ ok: true, settings: updated });
}
