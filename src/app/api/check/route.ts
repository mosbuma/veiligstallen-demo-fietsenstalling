import { checkDataproviderLogin, checkReportingLogin, runRoundTrip } from "@/lib/roundtrip";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const action = new URL(req.url).searchParams.get("action");
  if (action === "login") {
    const [dataprovider, reporting] = await Promise.all([
      checkDataproviderLogin(),
      checkReportingLogin(),
    ]);
    return NextResponse.json({ dataprovider, reporting });
  }
  const fromParam = new URL(req.url).searchParams.get("from");
  const toParam = new URL(req.url).searchParams.get("to");
  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  const result = await runRoundTrip(from, to);
  return NextResponse.json(result);
}
