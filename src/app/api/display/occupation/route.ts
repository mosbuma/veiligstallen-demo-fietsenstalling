import { countOpenVisits } from "@/lib/visits";
import { getMetadataBundle, parseSections } from "@/lib/fms/metadata-cache";
import { NextResponse } from "next/server";

export async function GET() {
  const open = await countOpenVisits();
  let capacity = 0;
  let locationName = "";
  try {
    const bundle = await getMetadataBundle();
    const loc = bundle.location.json as Record<string, unknown>;
    locationName = String(loc.name ?? loc.title ?? "");
    const sections = parseSections(bundle.sections.json);
    capacity = sections.reduce((s, sec) => s + (sec.capacity ?? 0), 0);
    if (capacity === 0) capacity = sections.length * 50;
  } catch {
    capacity = 100;
  }
  const free = Math.max(0, capacity - open);
  return NextResponse.json({ open, capacity, free, locationName });
}
