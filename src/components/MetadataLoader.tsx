"use client";

import { useEffect, useState } from "react";

export type SectionOption = { sectionid: string; name?: string };

export type ParkingSectionMeta = {
  sectionid: string;
  name?: string;
  capacity: number;
  biketypeIds: number[] | null;
};

export function useMetadata() {
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [parkingSections, setParkingSections] = useState<ParkingSectionMeta[]>([]);
  const [biketypes, setBiketypes] = useState<Array<{ id: number; name: string }>>([]);
  const [locationName, setLocationName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/metadata")
      .then((r) => r.json())
      .then((j) => {
        setSections(
          (j.sections ?? []).map((s: { sectionid: string; name?: string }) => ({
            sectionid: s.sectionid,
            name: s.name,
          }))
        );
        const bt = Array.isArray(j.biketypes) ? j.biketypes : [];
        setBiketypes(bt.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })));
        const ps = Array.isArray(j.parkingSections) ? j.parkingSections : [];
        setParkingSections(
          ps.map(
            (s: {
              sectionid: string;
              name?: string;
              capacity: number;
              biketypeIds: number[] | null;
            }) => ({
              sectionid: s.sectionid,
              name: s.name,
              capacity: s.capacity,
              biketypeIds: s.biketypeIds,
            })
          )
        );
        const loc = j.location as { name?: string; title?: string };
        setLocationName(String(loc?.name ?? loc?.title ?? ""));
        setError(j.ok ? null : "Metadata kon niet worden geladen — controleer aansluiting");
      })
      .catch(() => setError("Metadata laden mislukt"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return { sections, parkingSections, biketypes, locationName, loading, error, reload: load };
}
