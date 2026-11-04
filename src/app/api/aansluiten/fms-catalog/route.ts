import { fetchFmsCityCatalog } from "@/lib/fms/catalog";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const baseUrl = new URL(req.url).searchParams.get("baseUrl")?.trim() ?? "";
  if (!baseUrl) {
    return NextResponse.json({ ok: false, cities: [], message: "baseUrl ontbreekt" }, { status: 400 });
  }
  const result = await fetchFmsCityCatalog(baseUrl);
  return NextResponse.json(result);
}
