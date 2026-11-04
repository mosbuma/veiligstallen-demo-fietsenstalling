import { testFmsDataproviderLogin } from "@/lib/aansluiten-login";
import { applyAansluitenTestPatch } from "@/lib/aansluiten-settings-patch";
import type { AppSettingsDto } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<AppSettingsDto>;
    const settings = await applyAansluitenTestPatch("dataprovider", body);
    const result = await testFmsDataproviderLogin(settings);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[aansluiten/test-fms]", e);
    return NextResponse.json(
      { ok: false, status: 500, message: e instanceof Error ? e.message : "Serverfout", endpoint: "" },
      { status: 500 }
    );
  }
}
