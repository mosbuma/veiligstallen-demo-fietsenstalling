"use client";

import { StallingInventoryTable } from "@/components/StallingInventoryTable";
import { useMetadata } from "@/components/MetadataLoader";
import type { StallingFloorBike, StallingVisit } from "@/lib/stalling-inventory";
import { useCallback, useEffect, useMemo, useState } from "react";

type ScanLogStatus = "ok" | "unexpected" | "duplicate";

type ScanLogEntry = {
  barcode: string;
  status: ScanLogStatus;
};

const SCAN_STATUS_LABEL: Record<ScanLogStatus, string> = {
  ok: "status ok",
  unexpected: "nieuw aangetroffen",
  duplicate: "al gescand",
};

export default function ControlePage() {
  const { biketypes } = useMetadata();
  const [openVisits, setOpenVisits] = useState<StallingVisit[]>([]);
  const [floorOnly, setFloorOnly] = useState<StallingFloorBike[]>([]);
  const [lastScannedBarcode, setLastScannedBarcode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const [sessionActive, setSessionActive] = useState(false);
  const [inventoryAtStart, setInventoryAtStart] = useState<string[]>([]);
  const [pendingVisitIds, setPendingVisitIds] = useState<string[]>([]);
  const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);
  const [unexpectedBarcodes, setUnexpectedBarcodes] = useState<string[]>([]);
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);

  const loadStalling = useCallback(async () => {
    const [visitsRes, floorRes] = await Promise.all([
      fetch("/api/visits?status=open"),
      fetch("/api/bicycles?inside=floor"),
    ]);
    if (visitsRes.ok) {
      const j = (await visitsRes.json()) as { data?: StallingVisit[] };
      setOpenVisits(j.data ?? []);
    }
    if (floorRes.ok) {
      const j = (await floorRes.json()) as { data?: StallingFloorBike[] };
      setFloorOnly(j.data ?? []);
    }
  }, []);

  useEffect(() => {
    void loadStalling();
  }, [loadStalling]);

  const biketypeName = (id: number) => biketypes.find((b) => b.id === id)?.name ?? String(id);

  const pendingSet = useMemo(() => new Set(pendingVisitIds), [pendingVisitIds]);
  const scannedSet = useMemo(() => new Set(scannedBarcodes), [scannedBarcodes]);

  const pendingBarcodes = useMemo(() => {
    const idSet = new Set(pendingVisitIds);
    return openVisits
      .filter((v) => idSet.has(v.id))
      .map((v) => v.bicycle?.barcode?.trim() ?? "")
      .filter((bc) => bc.length > 0);
  }, [pendingVisitIds, openVisits]);

  const appendScanLog = (barcode: string, status: ScanLogStatus) => {
    setScanLog((prev) => [...prev, { barcode, status }]);
  };

  const startSession = async () => {
    setMessage(null);
    const res = await fetch("/api/controle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const j = (await res.json()) as { inventoryVisitIds?: string[]; ok?: boolean };
    if (!res.ok || !j.ok) {
      setMessage("Controle starten mislukt");
      return;
    }
    const ids = j.inventoryVisitIds ?? [];
    setInventoryAtStart(ids);
    setPendingVisitIds([...ids]);
    setScannedBarcodes([]);
    setUnexpectedBarcodes([]);
    setScanLog([]);
    setLastScannedBarcode("");
    setSessionActive(true);
    setMessage(`Controle gestart — ${ids.length} inventaris-regels te scannen (of af te sluiten).`);
    await loadStalling();
  };

  const scanBarcode = async (bc: string) => {
    if (!sessionActive) {
      setMessage("Start eerst de controle.");
      return;
    }
    const trimmed = bc.trim();
    if (!trimmed) return;
    setLastScannedBarcode(trimmed);

    const res = await fetch("/api/controle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "scan",
        barcode: trimmed,
        pendingVisitIds,
        alreadyScannedBarcodes: scannedBarcodes,
        inventoryVisitIdsAtStart: inventoryAtStart,
      }),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      message?: string;
      effect?: string;
      visitId?: string;
      barcode?: string;
    };
    if (!res.ok || !j.ok) {
      setMessage(j.message ?? "Scan mislukt");
      return;
    }

    setMessage(null);

    if (j.effect === "inventory_found" && j.visitId) {
      setPendingVisitIds((prev) => prev.filter((id) => id !== j.visitId));
      setScannedBarcodes((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      appendScanLog(trimmed, "ok");
    } else if (j.effect === "unexpected_added") {
      setScannedBarcodes((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      setUnexpectedBarcodes((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
      appendScanLog(trimmed, "unexpected");
    } else if (j.effect === "already_scanned") {
      appendScanLog(trimmed, "duplicate");
    }

    await loadStalling();
    window.dispatchEvent(new Event("local-db-updated"));
  };

  const finishSession = async () => {
    if (!sessionActive) return;
    setMessage(null);
    const res = await fetch("/api/controle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "finish",
        pendingVisitIds,
        scannedBarcodes,
        unexpectedBarcodes,
      }),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      checkedOut?: number;
      checkedIn?: number;
      scannedPresent?: number;
      errors?: string[];
      fms?: { ok?: boolean; message?: string; syncedVisits?: number };
    };
    setSessionActive(false);
    setPendingVisitIds([]);
    setInventoryAtStart([]);
    setScannedBarcodes([]);
    setUnexpectedBarcodes([]);
    setScanLog([]);
    setLastScannedBarcode("");
    await loadStalling();
    window.dispatchEvent(new Event("local-db-updated"));

    const fmsPart = j.fms?.message ? ` VeiligStallen: ${j.fms.message}` : "";
    if (!j.ok) {
      setMessage(
        `Controle afgerond met fouten: ${j.errors?.join(" · ") ?? "onbekend"} (${j.checkedOut ?? 0} controle-uit, ${j.checkedIn ?? 0} controle-in).${fmsPart}`
      );
      return;
    }
    setMessage(
      `Controle afgerond — ${j.checkedOut ?? 0} controle-uit, ${j.checkedIn ?? 0} controle-in, ${j.scannedPresent ?? 0} gescand.${fmsPart}`
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="card space-y-3 xl:col-span-4">
        <h2 className="text-lg font-bold">Controle sessie</h2>
        <p className="text-sm text-gray-600">
          Zelfde lijst als op de balie. Bij start: snapshot van open inventaris. Elke scan verwijdert een
          inventaris-fiets van de openstaande lijst; onverwachte fietsen worden toegevoegd. Rest →
          controle-uitcheck bij afronden. Daarna wordt automatisch naar VeiligStallen gesynchroniseerd (managed transactions).
        </p>
        <div className="flex flex-wrap gap-2">
          {!sessionActive ? (
            <button type="button" className="btn btn-primary" onClick={() => void startSession()}>
              Start controle
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => void finishSession()}>
                Controle afronden
              </button>
              <span className="self-center text-sm text-gray-700">
                Openstaand: {pendingVisitIds.length} · Gescand: {scannedBarcodes.length}
              </span>
            </>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[var(--accent)]">Scans</h3>
          {!sessionActive ? (
            <p className="text-sm text-gray-500">Start controle en klik fietsen in de lijst rechts.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {scanLog.length === 0 && pendingBarcodes.length === 0 && (
                <li className="text-gray-500">Nog geen scans.</li>
              )}
              {scanLog.map((entry, i) => (
                <li key={`${entry.barcode}-${i}`} className="font-mono">
                  {entry.barcode} gescand → {SCAN_STATUS_LABEL[entry.status]}
                </li>
              ))}
              {pendingBarcodes.map((bc) => (
                <li key={`pending-${bc}`} className="font-mono text-amber-900">
                  {bc} → nog te scannen
                </li>
              ))}
            </ul>
          )}
        </div>
        {message && <p className="text-sm font-medium">{message}</p>}
      </div>

      <div className="card xl:col-span-8">
        <StallingInventoryTable
          mode="controle"
          openVisits={openVisits}
          floorOnly={floorOnly}
          biketypeName={biketypeName}
          selectedBarcode={lastScannedBarcode}
          scannedBarcodes={sessionActive ? scannedSet : undefined}
          pendingVisitIds={sessionActive ? pendingSet : undefined}
          onScanRow={sessionActive ? (bc) => void scanBarcode(bc) : undefined}
        />
      </div>
    </div>
  );
}
