"use client";

import { useState } from "react";

type RoundTrip = {
  overall: string;
  localCount: number;
  localSum: number;
  remoteCount: number;
  remoteSum: number;
  openLocal: number;
  remoteOccupation: number | null;
  matches: Array<{ externalTransactionId: string; matched: boolean; localCost: number }>;
  inkomstenUrl: string;
  period: { from: string; to: string };
};

export default function CheckPage() {
  const [login, setLogin] = useState<{ dataprovider: { ok: boolean; message: string }; reporting: { ok: boolean; message: string } } | null>(null);
  const [rt, setRt] = useState<RoundTrip | null>(null);
  const [loading, setLoading] = useState(false);

  const testLogin = async () => {
    setLoading(true);
    const res = await fetch("/api/check?action=login");
    setLogin(await res.json());
    setLoading(false);
  };

  const runCheck = async () => {
    setLoading(true);
    const res = await fetch("/api/check");
    setRt(await res.json());
    setLoading(false);
  };

  const overallLabel: Record<string, string> = {
    login_failed: "Login mislukt",
    pending: "Nog niet in rapport (wacht op archief/queue)",
    match: "Komt overeen",
    mismatch: "Verschil",
  };

  return (
    <div className="space-y-4">
      <div className="card prose prose-sm max-w-none">
        <h2 className="text-xl font-bold">Round-trip check (Wilmar v4)</h2>
        <p>
          Test dataprovider- en rapportage-login, en vergelijk lokale bezoeken met Rapportage API v4
          (transacties + bezetting) en totalen t.o.v. Inkomsten in VeiligStallen.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void testLogin()}>
          Test login
        </button>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void runCheck()}>
          Controleer verwerking
        </button>
      </div>

      {login && (
        <div className="card grid gap-2 md:grid-cols-2">
          <p className={login.dataprovider.ok ? "text-green-800" : "text-red-700"}>
            Dataprovider: {login.dataprovider.message}
          </p>
          <p className={login.reporting.ok ? "text-green-800" : "text-red-700"}>
            Rapportage: {login.reporting.message}
          </p>
        </div>
      )}

      {rt && (
        <div className="card space-y-2">
          <p className="text-lg font-bold">{overallLabel[rt.overall] ?? rt.overall}</p>
          <p className="text-sm">
            Periode {rt.period.from} — {rt.period.to}
          </p>
          <ul className="text-sm">
            <li>Lokaal voltooid: {rt.localCount} · €{rt.localSum.toFixed(2)}</li>
            <li>Rapportage transacties: {rt.remoteCount} · €{rt.remoteSum.toFixed(2)}</li>
            <li>Open lokaal: {rt.openLocal}</li>
            <li>
              Bezetting rapportage (laatste punt):{" "}
              {rt.remoteOccupation != null ? rt.remoteOccupation : "—"}
            </li>
          </ul>
          <p className="text-sm">
            <a href={rt.inkomstenUrl} target="_blank" rel="noreferrer">
              Inkomsten / rapportages in VeiligStallen (browser-sessie)
            </a>
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>External TX</th>
                <th>Lokaal €</th>
                <th>In rapport</th>
              </tr>
            </thead>
            <tbody>
              {rt.matches.map((m) => (
                <tr key={m.externalTransactionId}>
                  <td className="font-mono text-xs">{m.externalTransactionId}</td>
                  <td>{m.localCost.toFixed(2)}</td>
                  <td>{m.matched ? "ja" : "nee"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rt.overall === "pending" && (
            <p className="text-sm text-amber-800">
              Writes kunnen in <code>transacties</code> staan terwijl het rapport{" "}
              <code>transacties_archief</code> leest. Probeer later opnieuw na queue/archief.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
