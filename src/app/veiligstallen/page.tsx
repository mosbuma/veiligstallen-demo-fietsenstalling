"use client";

import { displayPassCode } from "@/lib/pass-display";
import { useCallback, useEffect, useState } from "react";

type PendingVisit = {
  id: string;
  externalTransactionId: string;
  status: string;
  idcode: string;
  barcode: string;
  checkInDate: string;
  checkOutDate: string | null;
  checkInType: string;
  checkOutType: string | null;
  sectionId: string;
  stallPlace: string;
  stallingskosten: number | null;
  paymentMethod: string | null;
  updatedAt: string;
};

type SyncStatus = {
  pendingTransactions: number;
  pendingFloorChanges: number;
  pendingVisits: PendingVisit[];
  lastFmsBatchAt: string | null;
  lastFmsBatchOk: boolean | null;
  lastFmsBatchMessage: string;
};

export default function VeiligstallenPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/fms-sync");
    if (res.ok) setStatus((await res.json()) as SyncStatus);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onLocal = () => void load();
    window.addEventListener("local-db-updated", onLocal);
    return () => window.removeEventListener("local-db-updated", onLocal);
  }, [load]);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("nl-NL") : "—";

  const lastOk =
    status?.lastFmsBatchOk === true
      ? "Geslaagd"
      : status?.lastFmsBatchOk === false
        ? "Mislukt / deels"
        : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">VeiligStallen sync</h2>
        <button type="button" className="btn btn-secondary text-sm" onClick={() => void load()}>
          Vernieuwen
        </button>
      </div>

      {loading && !status && <p className="text-sm text-gray-600">Laden…</p>}

      {status && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card">
              <p className="text-xs text-gray-600">Laatste volledige sync</p>
              <p className="text-lg font-semibold">{fmt(status.lastFmsBatchAt)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-600">Resultaat laatste sync</p>
              <p
                className={`text-lg font-semibold ${status.lastFmsBatchOk ? "text-green-800" : status.lastFmsBatchOk === false ? "text-red-700" : ""}`}
              >
                {lastOk}
              </p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-600">Openstaande transacties</p>
              <p className="text-lg font-semibold text-amber-900">{status.pendingTransactions}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-600">Vloer-wijzigingen (bezetting)</p>
              <p className="text-lg font-semibold">{status.pendingFloorChanges}</p>
            </div>
          </div>

          {status.lastFmsBatchMessage && (
            <p className="text-sm text-gray-700">
              Laatste batch: <span className="font-medium">{status.lastFmsBatchMessage}</span>
            </p>
          )}

          <div className="card overflow-x-auto">
            <h3 className="mb-2 font-semibold">
              Pending transacties ({status.pendingVisits.length}) · gesorteerd op gewijzigd ↑
            </h3>
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Gewijzigd</th>
                  <th>MT-id</th>
                  <th>Status</th>
                  <th>Pas</th>
                  <th>Barcode</th>
                  <th>In / uit type</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Sectie / plaats</th>
                  <th>Kosten</th>
                  <th>Betaling</th>
                </tr>
              </thead>
              <tbody>
                {status.pendingVisits.map((v) => (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap font-mono text-xs">{fmt(v.updatedAt)}</td>
                    <td className="max-w-[8rem] truncate font-mono text-xs" title={v.externalTransactionId}>
                      {v.externalTransactionId}
                    </td>
                    <td>{v.status}</td>
                    <td>{displayPassCode(v.idcode)}</td>
                    <td className="font-mono">{v.barcode || "—"}</td>
                    <td className="text-xs">
                      {v.checkInType}
                      {v.checkOutType ? ` → ${v.checkOutType}` : ""}
                    </td>
                    <td className="whitespace-nowrap text-xs">{fmt(v.checkInDate)}</td>
                    <td className="whitespace-nowrap text-xs">{fmt(v.checkOutDate)}</td>
                    <td className="font-mono text-xs">
                      {v.sectionId || "—"}
                      {v.stallPlace ? ` / ${v.stallPlace}` : ""}
                    </td>
                    <td>{v.stallingskosten != null ? `€${v.stallingskosten.toFixed(2)}` : "—"}</td>
                    <td>{v.paymentMethod ?? "—"}</td>
                  </tr>
                ))}
                {status.pendingVisits.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-gray-500">
                      Geen transacties wachten op sync (watermark: {fmt(status.lastFmsBatchAt)}).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
