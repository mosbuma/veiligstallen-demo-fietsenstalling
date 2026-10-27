import { testReportingLogin } from "@/lib/aansluiten-login";
import { getSettings, updateSettings, type AppSettingsDto } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<AppSettingsDto> & {
      dataproviderPassword?: string;
      reportingPassword?: string;
    };
    if (Object.keys(body).length > 0) {
      const current = await getSettings();
      const patch = { ...body };
      if (patch.dataproviderPassword === "••••••" || !patch.dataproviderPassword?.length) {
        delete patch.dataproviderPassword;
      }
      if (patch.reportingPassword === "••••••" || !patch.reportingPassword?.length) {
        delete patch.reportingPassword;
      }
      await updateSettings({ ...current, ...patch });
    }
    const settings = await getSettings();
    const result = await testReportingLogin(settings);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[aansluiten/test-rapportage]", e);
    return NextResponse.json(
      { ok: false, status: 500, message: e instanceof Error ? e.message : "Serverfout", endpoint: "" },
      { status: 500 }
    );
  }
}
