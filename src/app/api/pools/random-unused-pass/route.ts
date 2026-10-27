import { pickRandomUnusedPoolPass } from "@/lib/ids";
import { NextResponse } from "next/server";

export async function GET() {
  const passCode = await pickRandomUnusedPoolPass();
  return NextResponse.json({ passCode });
}
