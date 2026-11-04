import { resetSimulation, type SimulationResetOptions } from "@/lib/simulation-reset";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<SimulationResetOptions>;
    const options: SimulationResetOptions = {
      clearPasses: body.clearPasses === true,
      clearBicycles: body.clearBicycles === true,
      resetStalling: body.resetStalling === true,
    };
    const result = await resetSimulation(options);
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "Reset mislukt",
      },
      { status: 500 }
    );
  }
}
