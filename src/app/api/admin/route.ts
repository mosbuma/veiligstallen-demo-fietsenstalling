import { bicycleParkedMap } from "@/lib/bicycles";
import { createAccount, issueBarcodedBicycle, issuePass, PoolExhaustedError } from "@/lib/ids";
import {
  credentialsFromSettings,
  fmsResultErrorMessage,
  fmsResultOk,
  fmsSubscriptionIdFromResult,
  postSaldo,
  postSubscription,
} from "@/lib/fms/client";
import { linkSubscriptionPass } from "@/lib/fms/link-subscription-pass";
import { idcodeForFmsApi } from "@/lib/pass-display";
import { fmsBalanceForIdcode } from "@/lib/fms/balance-read";
import { getProtectedReads } from "@/lib/fms/metadata-cache";
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
  let balanceRows: unknown = null;
  try {
    const reads = await getProtectedReads(true);
    balanceRows = reads.balances;
  } catch {
    balanceRows = null;
  }
  const balanceList = Array.isArray(balanceRows)
    ? balanceRows
    : balanceRows && typeof balanceRows === "object" && Array.isArray((balanceRows as { data?: unknown }).data)
      ? (balanceRows as { data: unknown[] }).data
      : null;
  const passesWithSaldo = passes.map((pass) => ({
    ...pass,
    saldo:
      balanceList == null
        ? null
        : (fmsBalanceForIdcode(balanceList, pass.passCode, pass.idType) ?? 0),
  }));
  return NextResponse.json({ accounts, passes: passesWithSaldo, bicycles: bicyclesWithStatus });
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
      const subscription: Record<string, unknown> = {
        subscriptiontypeid: Number(body.subscriptiontypeid),
        cost: Number(body.cost ?? 0),
        startdate: body.startdate ?? now.toISOString(),
      };
      if (body.expirationdate) subscription.expirationdate = body.expirationdate;
      const passCode = body.passCode != null ? String(body.passCode).trim() : "";
      if (passCode) {
        subscription.idcode = idcodeForFmsApi(passCode);
        subscription.idtype = Number(body.idType ?? 0);
      }
      const res = await postSubscription(creds, settings.citycode, settings.locationId, subscription);
      const subscriptionId = fmsSubscriptionIdFromResult(res.json);
      const ok = res.ok && (fmsResultOk(res.json) || subscriptionId != null);
      if (ok) await getProtectedReads(true);
      return NextResponse.json({
        ok,
        status: res.status,
        json: res.json,
        subscriptionId,
        message: ok
          ? subscriptionId
            ? `Abonnement aangemaakt (id ${subscriptionId})`
            : "Abonnement aangemaakt"
          : fmsResultErrorMessage(res) || `FMS HTTP ${res.status}`,
      });
    }
    if (action === "subscribe") {
      const settings = await getSettings();
      const creds = credentialsFromSettings(settings);
      const koppelcode = String(body.subscriptionId ?? body.koppelcode ?? "").trim();
      const idcode = String(body.passCode ?? "").trim();
      const passIdType = Number(body.idType ?? 0);
      if (!koppelcode) {
        return NextResponse.json({ ok: false, message: "Koppelcode ontbreekt" }, { status: 400 });
      }
      if (!idcode) {
        return NextResponse.json({ ok: false, message: "Sleutelhanger (idcode) is verplicht" }, { status: 400 });
      }
      const res = await linkSubscriptionPass(
        creds,
        settings.citycode,
        settings.locationId,
        koppelcode,
        idcode,
        passIdType
      );
      const ok = res.ok && fmsResultOk(res.json);
      if (ok) await getProtectedReads(true);
      const via = /^\d+$/.test(koppelcode) ? "subscribe" : "koppelpas";
      return NextResponse.json({
        ok,
        status: res.status,
        json: res.json,
        message: ok
          ? `Sleutelhanger ${idcode} gekoppeld (${via}, code ${koppelcode})`
          : fmsResultErrorMessage(res) || `FMS HTTP ${res.status}`,
      });
    }
    return NextResponse.json({ message: "Onbekende actie" }, { status: 400 });
  } catch (e) {
    if (e instanceof PoolExhaustedError) {
      return NextResponse.json({ message: e.message }, { status: 409 });
    }
    throw e;
  }
}
