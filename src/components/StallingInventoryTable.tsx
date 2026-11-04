"use client";

import { displayPassCode } from "@/lib/pass-display";
import {
  buildStallingRows,
  inventarisBarcode,
  sectorPlaatsForFloor,
  sectorPlaatsForVisit,
  type StallingFloorBike,
  type StallingVisit,
} from "@/lib/stalling-inventory";

type Props = {
  openVisits: StallingVisit[];
  floorOnly: StallingFloorBike[];
  biketypeName: (id: number) => string;
  mode: "balie" | "controle";
  selectedBarcode?: string;
  scannedBarcodes?: Set<string>;
  pendingVisitIds?: Set<string>;
  onScanRow?: (barcode: string) => void;
};

export function StallingInventoryTable({
  openVisits,
  floorOnly,
  biketypeName,
  mode,
  selectedBarcode = "",
  scannedBarcodes,
  pendingVisitIds,
  onScanRow,
}: Props) {
  const rows = buildStallingRows(openVisits, floorOnly);
  const count = rows.length;

  return (
    <div className="min-w-0 space-y-3">
      <h2 className="text-lg font-bold">Stalling ({count})</h2>
      {mode === "balie" ? (
        <p className="text-xs text-gray-600">
          Binnen in de stalling: inventaris, alleen fysiek (controle), inventaris zonder fysieke fiets (niet
          scannen). Overig = virtuele bezetting.
        </p>
      ) : (
        <p className="text-xs text-gray-600">
          Wilmar-controle (lokaal): scan alleen fysiek aanwezige fietsen (niet inventaris zonder fiets op
          vloer). Ontbrekende inventaris → controle-uit bij afronden. Onverwachte fietsen op vloer →
          controle-in. VeiligStallen via Update op de balie.
        </p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>Barcode</th>
            <th>Pas</th>
            <th>Sectie</th>
            <th>Plaats</th>
            <th>Fietstype</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === "floor") {
              const b = row.bike;
              const selected = selectedBarcode === b.barcode;
              const scanned = scannedBarcodes?.has(b.barcode);
              const { sector, place } = sectorPlaatsForFloor(b);
              return (
                <tr
                  key={`floor-${b.id}`}
                  className={`${onScanRow ? "balie-scan-row" : ""} ${selected ? "bg-amber-100 ring-1 ring-amber-400" : onScanRow ? "hover:bg-slate-50" : ""} text-amber-900 ${scanned ? "bg-green-50" : ""}`}
                  onClick={() => b.barcode && onScanRow?.(b.barcode)}
                >
                  <td className={`font-mono text-sm ${selected ? "font-semibold" : ""}`}>
                    {b.barcode}
                    {scanned ? " ✓" : ""}
                  </td>
                  <td className="text-sm text-gray-500">—</td>
                  <td className="font-mono text-xs">{sector}</td>
                  <td className="font-mono text-xs">{place}</td>
                  <td className="text-sm">{biketypeName(b.biketypeId)}</td>
                </tr>
              );
            }

            const v = row.visit;
            const bc = inventarisBarcode(v);
            const selected = Boolean(bc && selectedBarcode === bc);
            const scanned = bc && scannedBarcodes?.has(bc);
            const pending = pendingVisitIds?.has(v.id);
            const absent = !v.physicallyPresent;
            const { sector, place } = sectorPlaatsForVisit(v);

            if ((mode === "balie" || mode === "controle") && absent) {
              return (
                <tr key={`absent-${v.id}`} className="stalling-row-no-scan text-gray-500 italic">
                  <td className="font-mono text-sm">{bc || "—"}</td>
                  <td className="text-sm">{displayPassCode(v.idcode)}</td>
                  <td className="font-mono text-xs">—</td>
                  <td className="font-mono text-xs">—</td>
                  <td className="text-sm">{biketypeName(v.biketypeId)}</td>
                </tr>
              );
            }

            return (
              <tr
                key={v.id}
                className={`${onScanRow ? "balie-scan-row" : ""} ${selected ? "bg-amber-100 ring-1 ring-amber-400" : onScanRow ? "hover:bg-slate-50" : ""} ${v.placementKind === "other" ? "text-violet-800" : ""} ${scanned ? "bg-green-50" : ""} ${mode === "controle" && pending ? "ring-1 ring-red-200" : ""}`}
                onClick={() => bc && onScanRow?.(bc)}
              >
                <td className={`font-mono text-sm ${selected ? "font-semibold" : ""}`}>
                  {bc || "—"}
                  {scanned ? " ✓" : ""}
                </td>
                <td className="text-sm">{displayPassCode(v.idcode)}</td>
                <td className="font-mono text-xs">{sector}</td>
                <td className="font-mono text-xs">{place}</td>
                <td className="text-sm">{biketypeName(v.biketypeId)}</td>
              </tr>
            );
          })}
          {count === 0 && (
            <tr>
              <td colSpan={5} className="text-sm text-gray-500">
                Geen fietsen in de stalling
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
