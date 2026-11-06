"use client";

import { useEffect, useState } from "react";

type PassRow = { id: string; passCode: string; idType: number; createdAt: string; saldo: number | null };
type BicycleRow = {
  id: string;
  barcode: string;
  biketypeId: number;
  createdAt: string;
  parked: boolean;
  location: "buiten" | "stalling_vloer" | "stalling_overig" | "stalling_inventaris";
};

type AdminTab = "passen" | "barcodes";

export default function AdministratiePage() {
  const [tab, setTab] = useState<AdminTab>("passen");
  const [passes, setPasses] = useState<PassRow[]>([]);
  const [bicycles, setBicycles] = useState<BicycleRow[]>([]);

  const reload = () => {
    fetch("/api/admin")
      .then((r) => r.json())
      .then((j) => {
        setPasses(j.passes ?? []);
        setBicycles(j.bicycles ?? []);
      });
  };

  useEffect(() => {
    reload();
  }, []);

  const tabClass = (t: AdminTab) =>
    tab === t
      ? "rounded bg-[var(--accent)] px-3 py-1 text-sm font-semibold text-white"
      : "rounded px-3 py-1 text-sm hover:bg-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
        <button type="button" className={tabClass("passen")} onClick={() => setTab("passen")}>
          Sleutelhangers
        </button>
        <button type="button" className={tabClass("barcodes")} onClick={() => setTab("barcodes")}>
          Fietsstickers
        </button>
      </div>
      <p className="text-sm text-gray-600">
        Uitgifte, opwaarderen en abonnementen: <strong>Balie</strong>. Bereiken: <strong>Aansluiten</strong>.
      </p>

      {tab === "passen" && (
        <div className="card">
          <h2 className="mb-2 text-lg font-bold">Uitgegeven sleutelhangers ({passes.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Sleutelhanger</th>
                <th>Saldo</th>
                <th>Id-type</th>
                <th>Aangemaakt</th>
              </tr>
            </thead>
            <tbody>
              {passes.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono">{p.passCode}</td>
                  <td>{p.saldo == null ? "—" : `€${p.saldo.toFixed(2)}`}</td>
                  <td>{p.idType}</td>
                  <td className="text-sm text-gray-600">{new Date(p.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "barcodes" && (
        <div className="card">
          <h2 className="mb-2 text-lg font-bold">Fietsen / fietsstickers ({bicycles.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Fietssticker</th>
                <th>Fietstype</th>
                <th>Status</th>
                <th>Aangemaakt</th>
              </tr>
            </thead>
            <tbody>
              {bicycles.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono">{b.barcode}</td>
                  <td>{b.biketypeId}</td>
                  <td>
                    {b.location === "stalling_vloer"
                      ? "Stalling (vloer)"
                      : b.location === "stalling_overig"
                        ? "Stalling (overig)"
                        : b.location === "stalling_inventaris"
                          ? "Stalling (inv.)"
                          : "Buiten"}
                  </td>
                  <td className="text-sm text-gray-600">{new Date(b.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
