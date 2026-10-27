"use client";

import { useEffect, useState } from "react";

type PassRow = { id: string; passCode: string; idType: number; createdAt: string };
type BicycleRow = {
  id: string;
  barcode: string;
  biketypeId: number;
  createdAt: string;
  parked: boolean;
  location: "buiten" | "stalling_vloer" | "stalling_overig" | "stalling_inventaris";
};

type AdminTab = "passen" | "barcodes" | "saldos";

export default function AdministratiePage() {
  const [tab, setTab] = useState<AdminTab>("passen");
  const [passes, setPasses] = useState<PassRow[]>([]);
  const [bicycles, setBicycles] = useState<BicycleRow[]>([]);
  const [saldoPass, setSaldoPass] = useState("");
  const [saldoAmount, setSaldoAmount] = useState("10");
  const [subType, setSubType] = useState("1");
  const [subPass, setSubPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

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

  const addSaldo = async () => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saldo", passCode: saldoPass, amount: Number(saldoAmount) }),
    });
    const j = await res.json();
    setMsg(j.ok ? "Saldo naar FMS gestuurd" : `FMS ${j.status}`);
  };

  const addSub = async () => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "subscription",
        passCode: subPass,
        subscriptiontypeid: Number(subType),
        cost: 0,
      }),
    });
    const j = await res.json();
    setMsg(j.ok ? "Abonnement naar FMS" : `FMS ${j.status}`);
  };

  const tabClass = (t: AdminTab) =>
    tab === t
      ? "rounded bg-[var(--accent)] px-3 py-1 text-sm font-semibold text-white"
      : "rounded px-3 py-1 text-sm hover:bg-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
        <button type="button" className={tabClass("passen")} onClick={() => setTab("passen")}>
          Passen
        </button>
        <button type="button" className={tabClass("barcodes")} onClick={() => setTab("barcodes")}>
          Barcodes
        </button>
        <button type="button" className={tabClass("saldos")} onClick={() => setTab("saldos")}>
          Saldos &amp; abonnement
        </button>
      </div>
      <p className="text-sm text-gray-600">
        Pas- en barcode-uitgifte gebeurt op de <strong>Balie</strong>. Bereiken instellen op{" "}
        <strong>Aansluiten</strong>.
      </p>

      {tab === "passen" && (
        <div className="card">
          <h2 className="mb-2 text-lg font-bold">Uitgegeven passen ({passes.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Pascode</th>
                <th>Id-type</th>
                <th>Aangemaakt</th>
              </tr>
            </thead>
            <tbody>
              {passes.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono">{p.passCode}</td>
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
          <h2 className="mb-2 text-lg font-bold">Fietsen / barcodes ({bicycles.length})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Barcode</th>
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

      {tab === "saldos" && (
        <div className="card max-w-md space-y-3">
          <h2 className="text-lg font-bold">FMS saldo</h2>
          <input
            className="input"
            placeholder="Pas voor saldo"
            value={saldoPass}
            onChange={(e) => setSaldoPass(e.target.value)}
          />
          <input
            className="input"
            type="number"
            value={saldoAmount}
            onChange={(e) => setSaldoAmount(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={() => void addSaldo()}>
            Opwaarderen (POST balance)
          </button>
          <hr className="border-[var(--border)]" />
          <h3 className="font-semibold">Abonnement</h3>
          <input
            className="input"
            placeholder="Pas abonnement"
            value={subPass}
            onChange={(e) => setSubPass(e.target.value)}
          />
          <input
            className="input"
            placeholder="subscriptiontypeid"
            value={subType}
            onChange={(e) => setSubType(e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={() => void addSub()}>
            Abonnement aanmaken (FMS)
          </button>
        </div>
      )}

      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
