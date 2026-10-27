import { getMetadataBundle, parseSections } from "@/lib/fms/metadata-cache";
import { parseSectionsForParking } from "@/lib/parking";
import { getSettings } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const bundle = await getMetadataBundle(force);
    const settings = await getSettings();
    const sections = parseSections(bundle.sections.json);
    const parkingSections = parseSectionsForParking(
      bundle.sections.json,
      settings.defaultSectionCapacity
    );
    const networkError = bundle.location.status === 0;
    return NextResponse.json({
      location: bundle.location.json,
      sections,
      parkingSections,
      biketypes: bundle.biketypes.json,
      subscriptionTypes: bundle.subscriptionTypes.json,
      ok: bundle.location.ok && !networkError,
      message: networkError
        ? `Geen verbinding met VeiligStallen (${bundle.settings.fmsBaseUrl})`
        : undefined,
    });
  } catch (e) {
    console.error("[metadata]", e);
    return NextResponse.json(
      { ok: false, sections: [], message: e instanceof Error ? e.message : "Metadata laden mislukt" },
      { status: 500 }
    );
  }
}
