"use client";

import { useEffect, useState } from "react";

type Visit = {
  id: string;
  externalTransactionId: string;
  idcode: string;
  checkInDate: string;
  checkOutDate: string | null;
  stallingsduur: number | null;
  stallingskosten: number | null;
  paymentMethod: string | null;
  subscriptionWaived: boolean;
};

type Log = {
  id: string;
  path: string;
  statusCode: number | null;
  error: string | null;
  createdAt: string;
  visit?: { externalTransactionId: string };
};

export default function FinancienPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    fetch("/api/visits")
      .then((r) => r.json())
      .then((j) => setVisits((j.data ?? []).filter((v: Visit) => v.checkOutDate)));
    fetch("/api/fms-log")
      .then((r) => r.json())
      .then((j) => setLogs(j.data ?? []));
  }, []);

  const sum = visits.reduce((s, v) => s + Number(v.stallingskosten ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-lg font-bold">Financiën (lokaal)</h2>
        <p className="text-sm">
          Voltooide bezoeken en wat naar FMS is gestuurd. Vergelijk met{" "}
          <a href="/check">Check → Controleer verwerking</a> en Inkomsten in VeiligStallen-beheer.
        </p>
        <p className="mt-2 font-semibold">Totaal stallingskosten (lokaal): €{sum.toFixed(2)}</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>External TX</th>
              <th>Pas</th>
              <th>Uit</th>
              <th>Duur</th>
              <th>Kosten</th>
              <th>Betaalwijze</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td className="font-mono text-xs">{v.externalTransactionId}</td>
                <td>{v.idcode}</td>
                <td>{v.checkOutDate ? new Date(v.checkOutDate).toLocaleString("nl-NL") : "—"}</td>
                <td>{v.stallingsduur ?? "—"} min</td>
                <td>€{Number(v.stallingskosten ?? 0).toFixed(2)}</td>
                <td>
                  {v.subscriptionWaived ? "abonnement" : v.paymentMethod ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <h3 className="mb-2 font-semibold">FMS verzendlog</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Tijd</th>
              <th>Pad</th>
              <th>HTTP</th>
              <th>Fout</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString("nl-NL")}</td>
                <td className="max-w-xs truncate font-mono text-xs">{l.path}</td>
                <td>{l.statusCode ?? "—"}</td>
                <td className="text-red-700">{l.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
