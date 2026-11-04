import { bicycleParkedMap } from "@/lib/bicycles";
import { createAccount, issueBarcodedBicycle, issuePass, PoolExhaustedError } from "@/lib/ids";
import { credentialsFromSettings, postSaldo, postSubscription } from "@/lib/fms/client";
import { appNow, getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { activeStallingScope } from "@/lib/stalling-scope";
import { NextResponse } from "next/server";

export async function GET() {
  const scope = await activeStallingScope();
  const [accounts, passes, bicycles, parkedMap, openVisits] = await Promise.all([
    prisma.account.findMany({
      include: { passes: { where: scope } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pass.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.bicycle.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 500 }),
    bicycleParkedMap(),
    prisma.visit.findMany({
      where: { ...scope, status: "open", bicycleId: { not: null } },
      select: { bicycleId: true, physicallyPresent: true, placementKind: true },
    }),
  ]);
  const openByBike = new Map(
    openVisits.map((v) => [v.bicycleId!, { present: v.physicallyPresent, kind: v.placementKind }])
  );
  const bicyclesWithStatus = bicycles.map((b) => {
    const open = openByBike.get(b.id);
    let location: "buiten" | "stalling_vloer" | "stalling_overig" | "stalling_inventaris" = "buiten";
    if (open?.present === true && open.kind === "assigned") location = "stalling_vloer";
    else if (open?.present === true && open.kind === "other") location = "stalling_overig";
    else if (open) location = "stalling_inventaris";
    else if (b.floorPresent) {
      location = b.floorPlacementKind === "other" ? "stalling_overig" : "stalling_vloer";
    }
    return {
      ...b,
      parked: parkedMap.has(b.id),
      location,
    };
  });
  return NextResponse.json({ accounts, passes, bicycles: bicyclesWithStatus });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action as string;
    if (action === "account") {
      const acc = await createAccount(body.label);
      return NextResponse.json({ account: acc });
    }
    if (action === "pass") {
      const p = await issuePass(body.accountId);
      return NextResponse.json(p);
    }
    if (action === "barcode") {
      const b = await issueBarcodedBicycle(body.biketypeId);
      return NextResponse.json(b);
    }
    if (action === "saldo") {
      const settings = await getSettings();
      const creds = credentialsFromSettings(settings);
      const now = appNow(settings);
      const res = await postSaldo(
        creds,
        settings.citycode,
        settings.locationId,
        Number(body.idType ?? 0),
        String(body.passCode),
        {
          amount: Number(body.amount),
          paymenttypeid: 1,
          transactiondate: now.toISOString(),
        }
      );
      return NextResponse.json({ ok: res.ok, status: res.status, json: res.json });
    }
    if (action === "subscription") {
      const settings = await getSettings();
      const creds = credentialsFromSettings(settings);
      const now = appNow(settings);
      const res = await postSubscription(creds, settings.citycode, settings.locationId, {
        subscriptiontypeid: Number(body.subscriptiontypeid),
        idcode: String(body.passCode),
        idtype: Number(body.idType ?? 0),
        cost: Number(body.cost ?? 0),
        startdate: body.startdate ?? now.toISOString(),
        expirationdate: body.expirationdate,
      });
      return NextResponse.json({ ok: res.ok, status: res.status, json: res.json });
    }
    return NextResponse.json({ message: "Onbekende actie" }, { status: 400 });
  } catch (e) {
    if (e instanceof PoolExhaustedError) {
      return NextResponse.json({ message: e.message }, { status: 409 });
    }
    throw e;
  }
}
