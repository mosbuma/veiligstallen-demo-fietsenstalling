import { checkOut } from "@/lib/visits";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await checkOut(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Fout" }, { status: 400 });
  }
}
