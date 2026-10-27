export type SectionParkingMeta = {
  sectionid: string;
  name?: string;
  capacity: number;
  biketypeIds: number[] | null;
};

export function sectionAccepts(section: SectionParkingMeta, biketypeId: number): boolean {
  if (!section.biketypeIds?.length) return true;
  return section.biketypeIds.includes(biketypeId);
}

/** True if at least one FMS sector accepts this biketype (empty sector list → all allowed). */
export function stallingHandlesBiketype(sections: SectionParkingMeta[], biketypeId: number): boolean {
  if (!sections.length) return true;
  return sections.some((s) => sectionAccepts(s, biketypeId));
}
