import { poolStatus } from "@/lib/ids";
import { getSettings } from "@/lib/settings";
import { NextResponse } from "next/server";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(poolStatus(settings));
}
