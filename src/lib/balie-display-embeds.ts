/** VeiligStallen display pages embedded on the balie (paths on FMS base URL). */
export type BalieDisplayEmbed = {
  id: string;
  title: string;
  /** Path + query on FMS host, e.g. /display/verwijssysteem/... */
  path: string;
  /** Layout size of the display page (for uniform scale into the preview). */
  nativeWidth: number;
  nativeHeight: number;
};

/** FMS-style paths (citycode + locationId). Legacy CF URLs still work on the FMS host. */
export function buildBalieDisplayEmbeds(citycode: string, locationId: string): BalieDisplayEmbed[] {
  const cc = encodeURIComponent(citycode.trim());
  const loc = encodeURIComponent(locationId.trim());
  const q = new URLSearchParams({ citycode: citycode.trim(), locationId: locationId.trim() }).toString();

  return [
    {
      id: "verwijssysteem",
      title: "Verwijssysteem",
      path: `/display/verwijssysteem/${cc}/${loc}`,
      nativeWidth: 1024,
      nativeHeight: 768,
    },
    {
      id: "presentatie",
      title: "Presentatie",
      path: `/display/presentaties/presentatie.cfm?${q}`,
      nativeWidth: 1280,
      nativeHeight: 800,
    },
  ];
}

/** @deprecated use buildBalieDisplayEmbeds(settings.citycode, settings.locationId) */
export const BALIE_DISPLAY_EMBEDS: BalieDisplayEmbed[] = buildBalieDisplayEmbeds("9933", "9933_001");

export function fmsDisplayUrl(fmsBaseUrl: string, path: string): string {
  const base = fmsBaseUrl.replace(/\/$/, "");
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}
