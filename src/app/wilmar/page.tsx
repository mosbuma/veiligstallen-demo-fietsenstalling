"use client";

import { WilmarDatePicker } from "@/components/WilmarDatePicker";
import {
  defaultWilmarDateRange,
  formatWilmarDateShort,
  readWilmarDateRange,
  writeWilmarDateRange,
  wilmarDateRangeToBounds,
  type WilmarDateRange,
} from "@/lib/wilmar-page-prefs";
import { useCallback, useEffect, useState } from "react";

type TypeCount = { type: string; count: number };

type FlowItem = {
  id: string;
  cfOrWilmar: string;
  v4Api: string;
  wilmarScenario?: string;
  status: string;
  demoNotes: string;
};

type Analysis = {
  ok: boolean;
  message?: string;
  period?: { from: string; to: string };
  stalling?: { citycode: string; locationId: string };
  reporting?: {
    checkin: {
      ok: boolean;
      count: number;
      byCheckInType: TypeCount[];
      byCheckOutType: TypeCount[];
      nonUserSamples: Record<string, unknown>[];
      error?: string;
    };
    checkout: {
      ok: boolean;
      count: number;
      byCheckInType: TypeCount[];
      byCheckOutType: TypeCount[];
      nonUserSamples: Record<string, unknown>[];
      error?: string;
    };
  };
  local?: {
    total: number;
    pendingFms: number;
    byCheckInType: TypeCount[];
    byCheckOutType: TypeCount[];
    samples: Record<string, unknown>[];
  };
  catalog?: FlowItem[];
  missingOrPartialCount?: number;
  managedTransactionFields?: { demoSends: string[]; demoOmits: string[] };
  hints?: string[];
};

function statusBadge(status: string) {
  const cls =
    status === "demo"
      ? "bg-green-100 text-green-900"
      : status === "partial"
        ? "bg-amber-100 text-amber-900"
        : status === "manual"
          ? "bg-slate-200 text-slate-800"
          : "bg-red-100 text-red-900";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
}

function TypeCountTable({ title, rows }: { title: string; rows: TypeCount[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">Geen rijen</p>
      ) : (
        <table className="table mt-1 text-sm">
          <thead>
            <tr>
              <th>Type</th>
              <th>Aantal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.type}>
                <td className="font-mono">{r.type}</td>
                <td>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function WilmarPage() {
  const [range, setRange] = useState<WilmarDateRange>(defaultWilmarDateRange);
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRange(readWilmarDateRange());
  }, []);

  const updateRange = useCallback((patch: Partial<WilmarDateRange>) => {
    setRange((prev) => {
      const next = { ...prev, ...patch };
      writeWilmarDateRange(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = wilmarDateRangeToBounds(range);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const res = await fetch(
      `/api/wilmar/analysis?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
    );
    const j = (await res.json()) as Analysis;
    setData(j);
    setLoading(false);
  }, [range.from, range.to]);

  return (
    <div className="space-y-4">
      <div className="card prose prose-sm max-w-none">
        <h2 className="text-xl font-bold">Wilmar — transactie-analyse (tijdelijk)</h2>
        <p>
          Vergelijk <strong>rapportage-API</strong> (archief in VeiligStallen) met <strong>lokale demo-bezoeken</strong>{" "}
          en zie welke ColdFusion/Wilmar-flows nog ontbreken in de simulatie (sync, saldo, abonnement koppelen, …).
        </p>
        <p className="text-sm text-amber-900">
          Bronnen: <code>reference/endpoints-veiligstallen.md</code>, VS{" "}
          <code>write-sequence-scenarios.ts</code>, <code>docs/plan-fms-sync.md</code>.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <WilmarDatePicker label="Van" value={range.from} onChange={(from) => updateRange({ from })} />
        <WilmarDatePicker label="Tot" value={range.to} onChange={(to) => updateRange({ to })} />
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void load()}>
          {loading ? "Laden…" : "Laad rapportage + lokaal"}
        </button>
      </div>
      <p className="-mt-2 text-sm text-gray-600">
        Periode: {formatWilmarDateShort(range.from)} – {formatWilmarDateShort(range.to)} (hele dagen)
      </p>

      {data && !data.ok && <div className="card text-red-700">{data.message ?? "Mislukt"}</div>}

      {data?.ok && data.reporting && data.local && (
        <>
          <div className="card grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-lg font-bold">
                Rapportage — check-outs ({data.stalling?.citycode} / {data.stalling?.locationId})
              </h3>
              {!data.reporting.checkout.ok ? (
                <p className="text-sm text-red-700">{data.reporting.checkout.error ?? "HTTP-fout"}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">{data.reporting.checkout.count} rijen in periode</p>
                  <TypeCountTable title="checkintype (sparse JSON)" rows={data.reporting.checkout.byCheckInType} />
                  <TypeCountTable title="checkouttype" rows={data.reporting.checkout.byCheckOutType} />
                </>
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold">Rapportage — check-ins</h3>
              {!data.reporting.checkin.ok ? (
                <p className="text-sm text-red-700">{data.reporting.checkin.error ?? "HTTP-fout"}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">{data.reporting.checkin.count} rijen</p>
                  <TypeCountTable title="checkintype" rows={data.reporting.checkin.byCheckInType} />
                </>
              )}
            </div>
          </div>

          <div className="card grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-lg font-bold">Lokaal (actieve simulatie)</h3>
              <p className="text-sm text-gray-600">
                {data.local.total} bezoeken in venster · {data.local.pendingFms} pending FMS-sync
              </p>
              <TypeCountTable title="checkInType" rows={data.local.byCheckInType} />
              <TypeCountTable title="checkOutType" rows={data.local.byCheckOutType} />
            </div>
            <div>
              <h3 className="text-lg font-bold">MT-velden demo vs Wilmar</h3>
              <p className="text-xs text-gray-600">Verstuurd bij sync:</p>
              <p className="font-mono text-xs">{data.managedTransactionFields?.demoSends.join(", ")}</p>
              <p className="mt-2 text-xs text-gray-600">Nog niet in demo-payload:</p>
              <p className="font-mono text-xs text-amber-900">
                {data.managedTransactionFields?.demoOmits.join(", ")}
              </p>
            </div>
          </div>

          {(data.reporting.checkout.nonUserSamples.length > 0 ||
            data.reporting.checkin.nonUserSamples.length > 0) && (
            <div className="card">
              <h3 className="text-lg font-bold">Rapportage — niet-user types (samples)</h3>
              <p className="text-sm text-gray-600">
                sync / controle / system / reservation in archief → prioriteit voor simulatie.
              </p>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-100 p-2 text-xs">
                {JSON.stringify(
                  [...data.reporting.checkout.nonUserSamples, ...data.reporting.checkin.nonUserSamples],
                  null,
                  2
                )}
              </pre>
            </div>
          )}

          {data.hints && (
            <ul className="card list-disc space-y-1 pl-5 text-sm text-gray-700">
              {data.hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {data?.catalog && (
        <div className="card overflow-x-auto">
          <h3 className="text-lg font-bold">
            CF / Wilmar → v4 — demo-dekking ({data.missingOrPartialCount} open)
          </h3>
          <table className="table text-sm">
            <thead>
              <tr>
                <th>Status</th>
                <th>Flow</th>
                <th>v4 API</th>
                <th>VS scenario</th>
                <th>Demo</th>
              </tr>
            </thead>
            <tbody>
              {data.catalog.map((f) => (
                <tr key={f.id}>
                  <td>{statusBadge(f.status)}</td>
                  <td className="max-w-xs">{f.cfOrWilmar}</td>
                  <td className="max-w-xs font-mono text-xs">{f.v4Api}</td>
                  <td className="font-mono text-xs">{f.wilmarScenario ?? "—"}</td>
                  <td className="max-w-md text-xs text-gray-700">{f.demoNotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
