import { prisma } from "@/lib/db";
import {
  credentialsFromSettings,
  getBiketypes,
  getLocation,
  getSections,
  getSubscriptionTypes,
  getSubscriptions,
  getBalances,
} from "@/lib/fms/client";
import { getSettings } from "@/lib/settings";

const TTL_MS = 5 * 60 * 1000;

async function getCached<T>(key: string): Promise<T | null> {
  const row = await prisma.metadataCache.findUnique({ where: { cacheKey: key } });
  if (!row || row.expiresAt < new Date()) return null;
  return row.payload as T;
}

async function setCached(key: string, payload: unknown): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.metadataCache.upsert({
    where: { cacheKey: key },
    create: { cacheKey: key, payload: payload as object, expiresAt },
    update: { payload: payload as object, fetchedAt: new Date(), expiresAt },
  });
}

export type SectionSummary = { sectionid?: string; id?: string; name?: string; capacity?: number };

export async function getMetadataBundle(force = false) {
  const settings = await getSettings();
  const { citycode, locationId } = settings;
  const cacheKey = `bundle:${citycode}:${locationId}`;
  if (!force) {
    const cached = await getCached<Awaited<ReturnType<typeof fetchBundle>>>(cacheKey);
    if (cached) return cached;
  }
  const bundle = await fetchBundle(settings);
  if (bundle.location.ok) {
    await setCached(cacheKey, bundle);
  }
  return bundle;
}

async function fetchBundle(settings: Awaited<ReturnType<typeof getSettings>>) {
  const creds = credentialsFromSettings(settings);
  const { citycode, locationId } = settings;
  const [location, sections, biketypes, subscriptionTypes] = await Promise.all([
    getLocation(creds, citycode, locationId),
    getSections(creds, citycode, locationId),
    getBiketypes(creds),
    citycode && locationId
      ? getSubscriptionTypes(creds, citycode, locationId)
      : Promise.resolve({ ok: false, status: 0, json: [], text: "" }),
  ]);
  return { location, sections, biketypes, subscriptionTypes, settings };
}

export async function getProtectedReads(force = false) {
  const settings = await getSettings();
  const creds = credentialsFromSettings(settings);
  const key = `protected:${settings.citycode}:${settings.locationId}`;
  if (!force) {
    const cached = await getCached<{ balances: unknown; subscriptions: unknown }>(key);
    if (cached) return cached;
  }
  const [balances, subscriptions] = await Promise.all([
    getBalances(creds, settings.citycode, settings.locationId),
    getSubscriptions(creds, settings.citycode, settings.locationId),
  ]);
  const payload = { balances: balances.json, subscriptions: subscriptions.json };
  if (balances.ok) await setCached(key, payload);
  return payload;
}

export function parseSections(sectionsJson: unknown): SectionSummary[] {
  if (!Array.isArray(sectionsJson)) return [];
  return sectionsJson.map((s) => {
    const row = s as Record<string, unknown>;
    return {
      sectionid: String(row.sectionid ?? row.id ?? row.sectionID ?? ""),
      name: row.name != null ? String(row.name) : undefined,
      capacity: typeof row.capacity === "number" ? row.capacity : undefined,
    };
  });
}
