"use client";

import { EmbeddedWebPage } from "@/components/EmbeddedWebPage";
import { buildBalieDisplayEmbeds, fmsDisplayUrl } from "@/lib/balie-display-embeds";
import { useEffect, useState } from "react";

const DEFAULT_FMS_BASE = "http://localhost:3000";

export function BalieDisplayEmbeds() {
  const [fmsBaseUrl, setFmsBaseUrl] = useState(DEFAULT_FMS_BASE);
  const [embeds, setEmbeds] = useState(() => buildBalieDisplayEmbeds("9933", "9933_001"));

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { fmsBaseUrl?: string; citycode?: string; locationId?: string }) => {
        if (s.fmsBaseUrl?.trim()) setFmsBaseUrl(s.fmsBaseUrl.replace(/\/$/, ""));
        if (s.citycode?.trim() && s.locationId?.trim()) {
          setEmbeds(buildBalieDisplayEmbeds(s.citycode, s.locationId));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 xl:ml-auto xl:w-[min(420px,36vw)]">
      {embeds.map((embed) => (
        <EmbeddedWebPage
          key={embed.id}
          title={embed.title}
          src={fmsDisplayUrl(fmsBaseUrl, embed.path)}
          nativeWidth={embed.nativeWidth}
          nativeHeight={embed.nativeHeight}
        />
      ))}
    </aside>
  );
}
