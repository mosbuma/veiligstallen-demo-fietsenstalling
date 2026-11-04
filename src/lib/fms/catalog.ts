import { fmsFetch } from "@/lib/fms/client";

export type FmsCatalogLocation = { locationid: string; name: string };
export type FmsCatalogCity = { citycode: string; name: string; locations: FmsCatalogLocation[] };

function locationIdFromRow(row: Record<string, unknown>): string {
  return String(row.locationid ?? row.locationID ?? row.id ?? "").trim();
}

function locationNameFromRow(row: Record<string, unknown>): string {
  return String(row.name ?? row.title ?? row.locationname ?? locationIdFromRow(row)).trim();
}

export async function fetchFmsCityCatalog(baseUrl: string): Promise<{
  ok: boolean;
  status: number;
  cities: FmsCatalogCity[];
  message?: string;
}> {
  const creds = { baseUrl: baseUrl.replace(/\/$/, ""), username: "", password: "" };
  const res = await fmsFetch(creds, "GET", "/api/fms/v4/citycodes");
  if (res.status === 0) {
    return { ok: false, status: 0, cities: [], message: "Geen verbinding met FMS" };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      cities: [],
      message: typeof res.json === "object" && res.json && "message" in (res.json as object)
        ? String((res.json as { message: unknown }).message)
        : `HTTP ${res.status}`,
    };
  }

  const raw = Array.isArray(res.json) ? res.json : [];
  const cities: FmsCatalogCity[] = [];
  for (const item of raw) {
    const row = item as Record<string, unknown>;
    const citycode = String(row.citycode ?? row.cityCode ?? "").trim();
    if (!citycode) continue;
    const name = String(row.name ?? row.cityname ?? citycode).trim();
    const locRaw = Array.isArray(row.locations) ? row.locations : [];
    const locations: FmsCatalogLocation[] = [];
    for (const loc of locRaw) {
      const lr = loc as Record<string, unknown>;
      const locationid = locationIdFromRow(lr);
      if (!locationid) continue;
      locations.push({ locationid, name: locationNameFromRow(lr) });
    }
    locations.sort((a, b) => a.name.localeCompare(b.name, "nl"));
    cities.push({ citycode, name, locations });
  }
  cities.sort((a, b) => a.name.localeCompare(b.name, "nl"));
  return { ok: true, status: res.status, cities };
}
