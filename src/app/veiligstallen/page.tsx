"use client";

import { FmsCallInspector } from "@/components/FmsCallInspector";
import { ModalDialog } from "@/components/ModalDialog";
import { displayPassCode } from "@/lib/pass-display";
import {
  externalTransactionIdsFromFmsLogRequest,
  type FmsLogEntry,
} from "@/lib/fms-log-view";
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
  fmsSyncStatus: "pending" | "synced" | "failed";
  fmsSyncAt: string | null;
  fmsSyncMessage: string | null;
  needsSync: boolean;
};

type VisitDetail = {
  id: string;
  externalTransactionId: string;
  status: string;
  idcode: string;
  idType: number;
  passCode: string | null;
  barcode: string;
  biketypeId: number;
  sectionId: string;
  stallPlace: string;
  placementKind: string;
  fmsSectionId: string;
  physicallyPresent: boolean;
  checkInDate: string;
  checkInType: string;
  checkOutDate: string | null;
  checkOutType: string | null;
  stallingsduur: number | null;
  stallingskosten: number | null;
  paymentMethod: string | null;
  subscriptionWaived: boolean;
  createdAt: string;
  updatedAt: string;
  fmsSyncStatus: "pending" | "synced" | "failed";
  fmsSyncAt: string | null;
  fmsSyncMessage: string | null;
};

function fmsSyncLabel(status: PendingVisit["fmsSyncStatus"]) {
  if (status === "synced") return "OK";
  if (status === "failed") return "Mislukt";
  return "Open";
}

function fmsSyncCellClass(status: PendingVisit["fmsSyncStatus"]) {
  if (status === "synced") return "text-green-800 font-semibold";
  if (status === "failed") return "text-red-700 font-semibold";
  return "text-amber-900";
}

/** Nieuwste FMS-sync eerst; zonder sync-tijd (open) op gewijzigd. */
function compareVisitByFmsSyncDesc(a: PendingVisit, b: PendingVisit) {
  const aSync = a.fmsSyncAt;
  const bSync = b.fmsSyncAt;
  if (aSync && bSync) return bSync.localeCompare(aSync);
  if (aSync && !bSync) return -1;
  if (!aSync && bSync) return 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

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
  const [globalLogs, setGlobalLogs] = useState<FmsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [visitLogEntries, setVisitLogEntries] = useState<FmsLogEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [filterVisitId, setFilterVisitId] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [logFilterCallType, setLogFilterCallType] = useState<string>("all");
  const [logFilterOk, setLogFilterOk] = useState<"all" | "ok" | "fail">("all");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [clearLogLoading, setClearLogLoading] = useState(false);
  const [standaloneLog, setStandaloneLog] = useState<FmsLogEntry | null>(null);
  const [logDetailLoading, setLogDetailLoading] = useState(false);

  const loadGlobalLogs = useCallback(async () => {
    const res = await fetch("/api/fms-log?limit=500");
    if (res.ok) {
      const j = (await res.json()) as { data: FmsLogEntry[] };
      setGlobalLogs(j.data);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/fms-sync");
    if (res.ok) setStatus((await res.json()) as SyncStatus);
    await loadGlobalLogs();
    setLoading(false);
  }, [loadGlobalLogs]);

  const loadDetail = useCallback(async (visitId: string) => {
    setDetailLoading(true);
    setResendMessage(null);
    setDetailError(null);
    const res = await fetch(`/api/fms-sync?visitId=${encodeURIComponent(visitId)}`);
    if (res.ok) {
      const j = (await res.json()) as { visit: VisitDetail; logEntries: FmsLogEntry[] };
      setDetail(j.visit);
      setVisitLogEntries(j.logEntries ?? []);
    } else {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      setDetail(null);
      setVisitLogEntries([]);
      setDetailError(j.message ?? `Detail laden mislukt (HTTP ${res.status})`);
    }
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onLocal = () => void load();
    window.addEventListener("local-db-updated", onLocal);
    return () => window.removeEventListener("local-db-updated", onLocal);
  }, [load]);

  useEffect(() => {
    if (selectedVisitId) void loadDetail(selectedVisitId);
    else {
      setDetail(null);
      setVisitLogEntries([]);
    }
  }, [selectedVisitId, loadDetail]);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("nl-NL") : "—";

  const visits = [...(status?.pendingVisits ?? [])].sort(compareVisitByFmsSyncDesc);
  const logCallTypes = Array.from(new Set(globalLogs.map((l) => l.callType))).sort();

  const filteredGlobalLogs = globalLogs
    .filter((log) => {
      if (logFilterCallType !== "all" && log.callType !== logFilterCallType) return false;
      if (logFilterOk === "ok" && !log.ok) return false;
      if (logFilterOk === "fail" && log.ok) return false;
      if (filterVisitId && log.visitId !== filterVisitId) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const displayedVisits = filterVisitId ? visits.filter((v) => v.id === filterVisitId) : visits;

  const selectedIndex = selectedVisitId ? visits.findIndex((v) => v.id === selectedVisitId) : -1;

  const goPrev = () => {
    if (selectedIndex > 0) selectVisit(visits[selectedIndex - 1]!.id);
  };
  const goNext = () => {
    if (selectedIndex >= 0 && selectedIndex < visits.length - 1) {
      selectVisit(visits[selectedIndex + 1]!.id);
    }
  };

  const clearLogFilters = () => {
    setFilterVisitId(null);
    setSelectedLogId(null);
    setLogFilterCallType("all");
    setLogFilterOk("all");
  };

  const clearFmsLog = async () => {
    if (
      !confirm(
        "Alle VeiligStallen-aanroepen uit het log wissen? Alleen lokale logregels worden verwijderd; transacties blijven staan."
      )
    ) {
      return;
    }
    setClearLogLoading(true);
    const res = await fetch("/api/fms-log", { method: "DELETE" });
    setClearLogLoading(false);
    if (!res.ok) return;
    setGlobalLogs([]);
    setVisitLogEntries([]);
    setSelectedLogId(null);
    clearLogFilters();
  };

  const closeDetail = () => {
    setSelectedVisitId(null);
    setStandaloneLog(null);
    setDetailError(null);
    setSelectedLogId(null);
  };

  const selectVisit = useCallback((visitId: string, opts?: { filterTable?: boolean }) => {
    setStandaloneLog(null);
    if (opts?.filterTable) setFilterVisitId(visitId);
    setSelectedVisitId(visitId);
  }, []);

  const onLogRowClick = async (log: FmsLogEntry) => {
    setSelectedLogId(log.id);
    setStandaloneLog(null);
    setDetailError(null);

    if (log.visitId) {
      selectVisit(log.visitId, { filterTable: true });
      return;
    }

    const mtCandidates = [
      ...(log.externalTransactionId ? [log.externalTransactionId] : []),
      ...externalTransactionIdsFromFmsLogRequest(log.requestBody),
    ];
    const uniqueMt = [...new Set(mtCandidates)];

    if (uniqueMt.length === 0) {
      setSelectedVisitId(null);
      setStandaloneLog(log);
      return;
    }

    setLogDetailLoading(true);
    let resolvedVisitId: string | null = null;
    for (const mtId of uniqueMt) {
      const res = await fetch(
        `/api/fms-sync?externalTransactionId=${encodeURIComponent(mtId)}`
      );
      if (res.ok) {
        const j = (await res.json()) as { visit: VisitDetail };
        resolvedVisitId = j.visit.id;
        break;
      }
    }
    setLogDetailLoading(false);

    if (resolvedVisitId) {
      selectVisit(resolvedVisitId, { filterTable: true });
      return;
    }

    setSelectedVisitId(null);
    setStandaloneLog(log);
  };

  const detailOpen = !!selectedVisitId || !!standaloneLog || logDetailLoading;
  const visitLogFocusIndex = selectedLogId
    ? Math.max(0, visitLogEntries.findIndex((e) => e.id === selectedLogId))
    : 0;

  const resend = async () => {
    if (!selectedVisitId) return;
    setResendLoading(true);
    setResendMessage(null);
    const res = await fetch("/api/fms-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resend", visitId: selectedVisitId }),
    });
    const j = (await res.json()) as { ok?: boolean; message?: string };
    setResendLoading(false);
    setResendMessage(j.message ?? (res.ok ? "Verstuurd" : "Mislukt"));
    void loadDetail(selectedVisitId);
    void load();
  };

  const lastOk =
    status?.lastFmsBatchOk === true
      ? "Geslaagd"
      : status?.lastFmsBatchOk === false
        ? "Mislukt / deels"
        : "—";

  const detailFields: { label: string; value: string }[] = detail
    ? [
        { label: "Intern id", value: detail.id },
        { label: "MT-id", value: detail.externalTransactionId },
        { label: "Status", value: detail.status },
        { label: "Sleutelhanger / idcode", value: displayPassCode(detail.idcode) },
        { label: "Id-type", value: String(detail.idType) },
        { label: "Sleutelhanger (record)", value: detail.passCode ?? "—" },
        { label: "Fietssticker", value: detail.barcode || "—" },
        { label: "Fietstype", value: String(detail.biketypeId) },
        { label: "Sectie", value: detail.sectionId || "—" },
        { label: "Plaats", value: detail.stallPlace || "—" },
        { label: "Plaatsing", value: detail.placementKind },
        { label: "FMS-sectie", value: detail.fmsSectionId || "—" },
        { label: "Fysiek aanwezig", value: detail.physicallyPresent ? "ja" : "nee" },
        { label: "Check-in", value: `${fmt(detail.checkInDate)} (${detail.checkInType})` },
        {
          label: "Check-out",
          value: detail.checkOutDate
            ? `${fmt(detail.checkOutDate)} (${detail.checkOutType ?? "—"})`
            : "—",
        },
        { label: "Stallingsduur", value: detail.stallingsduur != null ? `${detail.stallingsduur} min` : "—" },
        {
          label: "Kosten",
          value: detail.stallingskosten != null ? `€${detail.stallingskosten.toFixed(2)}` : "—",
        },
        { label: "Betaling", value: detail.paymentMethod ?? "—" },
        { label: "Abonnement kwijt", value: detail.subscriptionWaived ? "ja" : "nee" },
        { label: "Aangemaakt", value: fmt(detail.createdAt) },
        { label: "Gewijzigd", value: fmt(detail.updatedAt) },
        { label: "FMS sync", value: fmsSyncLabel(detail.fmsSyncStatus) },
        { label: "FMS sync tijd", value: fmt(detail.fmsSyncAt) },
        { label: "FMS sync detail", value: detail.fmsSyncMessage ?? "—" },
      ]
    : [];

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

          <ModalDialog
            open={detailOpen}
            onClose={closeDetail}
            title={selectedVisitId || logDetailLoading ? "Transactiedetail" : "FMS-aanroep"}
            headerActions={
              selectedVisitId ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={selectedIndex <= 0}
                    onClick={goPrev}
                  >
                    ← Vorige
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={selectedIndex < 0 || selectedIndex >= visits.length - 1}
                    onClick={goNext}
                  >
                    Volgende →
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={resendLoading}
                    onClick={() => void resend()}
                  >
                    {resendLoading ? "Bezig…" : "Opnieuw versturen"}
                  </button>
                  <button type="button" className="btn btn-secondary text-sm" onClick={closeDetail}>
                    Sluiten
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-secondary text-sm" onClick={closeDetail}>
                  Sluiten
                </button>
              )
            }
          >
            <div className="space-y-3">
              {(detailLoading || logDetailLoading) && (
                <p className="text-sm text-gray-600">Detail laden…</p>
              )}

              {detailError && !detailLoading && !logDetailLoading && (
                <p className="text-sm font-medium text-red-700">{detailError}</p>
              )}

              {selectedVisitId && detail && !detailLoading && !logDetailLoading && (
                <>
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {detailFields.map((f) => (
                      <div
                        key={f.label}
                        className="grid grid-cols-[9rem_1fr] gap-1 border-b border-gray-200/80 py-0.5"
                      >
                        <dt className="text-gray-600">{f.label}</dt>
                        <dd className="min-w-0 break-all font-mono text-xs">{f.value}</dd>
                      </div>
                    ))}
                  </dl>

                  {resendMessage && (
                    <p
                      className={`text-sm font-medium ${resendMessage.includes("mislukt") || resendMessage.includes("Mislukt") ? "text-red-700" : "text-green-800"}`}
                    >
                      {resendMessage}
                    </p>
                  )}

                  <FmsCallInspector
                    calls={visitLogEntries}
                    initialIndex={
                      visitLogFocusIndex >= 0 && visitLogEntries.some((e) => e.id === selectedLogId)
                        ? visitLogFocusIndex
                        : 0
                    }
                  />
                </>
              )}

              {standaloneLog && !selectedVisitId && !logDetailLoading && (
                <>
                  <p className="text-sm text-gray-600">
                    Geen lokale transactie gekoppeld (bijv. login of batch zonder match). Payload en response
                    van deze aanroep:
                  </p>
                  <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="grid grid-cols-[9rem_1fr] gap-1 border-b border-gray-200/80 py-0.5">
                      <dt className="text-gray-600">Tijd</dt>
                      <dd className="font-mono text-xs">{fmt(standaloneLog.createdAt)}</dd>
                    </div>
                    <div className="grid grid-cols-[9rem_1fr] gap-1 border-b border-gray-200/80 py-0.5">
                      <dt className="text-gray-600">Type</dt>
                      <dd className="font-mono text-xs">{standaloneLog.callType}</dd>
                    </div>
                    <div className="grid grid-cols-[9rem_1fr] gap-1 border-b border-gray-200/80 py-0.5">
                      <dt className="text-gray-600">Status</dt>
                      <dd className="text-xs">{standaloneLog.ok ? "OK" : "mislukt"}</dd>
                    </div>
                  </dl>
                  <FmsCallInspector calls={[standaloneLog]} title="Deze aanroep" />
                </>
              )}

              {selectedVisitId && !detailLoading && !logDetailLoading && !detail && !detailError && (
                <p className="text-sm text-gray-600">Geen detail beschikbaar.</p>
              )}
            </div>
          </ModalDialog>

          <div className="card overflow-x-auto">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                VeiligStallen-aanroepen ({filteredGlobalLogs.length}
                {filteredGlobalLogs.length !== globalLogs.length ? ` / ${globalLogs.length}` : ""}) · nieuwste eerst
                · filter voor tabel
              </h3>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={clearLogLoading || globalLogs.length === 0}
                onClick={() => void clearFmsLog()}
              >
                {clearLogLoading ? "Bezig…" : "Log wissen"}
              </button>
            </div>
            <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
              <div>
                <label className="label">Type</label>
                <select
                  className="input"
                  value={logFilterCallType}
                  onChange={(e) => setLogFilterCallType(e.target.value)}
                >
                  <option value="all">Alle types</option>
                  {logCallTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={logFilterOk}
                  onChange={(e) => setLogFilterOk(e.target.value as "all" | "ok" | "fail")}
                >
                  <option value="all">Alle</option>
                  <option value="ok">OK</option>
                  <option value="fail">Mislukt</option>
                </select>
              </div>
              {(filterVisitId || logFilterCallType !== "all" || logFilterOk !== "all") && (
                <button type="button" className="btn btn-secondary text-sm" onClick={clearLogFilters}>
                  Wis filters
                </button>
              )}
              {filterVisitId && (
                <p className="text-xs text-amber-900">
                  Tabel toont transactie gekoppeld aan geselecteerde aanroep.
                </p>
              )}
            </div>
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Tijd</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>HTTP</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {filteredGlobalLogs.map((log) => (
                  <tr
                    key={log.id}
                    className={`cursor-pointer ${
                      selectedLogId === log.id
                        ? "bg-amber-100 ring-1 ring-amber-400"
                        : log.ok
                          ? "hover:bg-slate-50"
                          : "bg-red-50/40 hover:bg-red-50/70"
                    }`}
                    onClick={() => void onLogRowClick(log)}
                  >
                    <td className="whitespace-nowrap font-mono text-xs">{fmt(log.createdAt)}</td>
                    <td className="font-mono text-xs">{log.callType}</td>
                    <td
                      className={
                        log.ok ? "text-xs font-semibold text-green-800" : "text-xs font-semibold text-red-700"
                      }
                    >
                      {log.ok ? "OK" : "mislukt"}
                    </td>
                    <td className="font-mono text-xs">{log.statusCode || "—"}</td>
                    <td className="text-xs">{log.method}</td>
                  </tr>
                ))}
                {filteredGlobalLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-gray-500">
                      Geen aanroepen (stel filters in).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card overflow-x-auto">
            <h3 className="mb-2 font-semibold">
              Lokale transacties ({displayedVisits.length}
              {displayedVisits.length !== visits.length ? ` / ${visits.length}` : ""}) · FMS-syncstatus · sorteer op
              sync-tijd, nieuwste eerst
            </h3>

            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Gewijzigd</th>
                  <th>FMS</th>
                  <th>Sync tijd</th>
                  <th>MT-id</th>
                  <th>Status</th>
                  <th>Sleutelhanger</th>
                  <th>Fietssticker</th>
                  <th>In / uit type</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Sectie / plaats</th>
                  <th>Kosten</th>
                  <th>Betaling</th>
                </tr>
              </thead>
              <tbody>
                {displayedVisits.map((v) => {
                  const selected = v.id === selectedVisitId;
                  return (
                    <tr
                      key={v.id}
                      className={`cursor-pointer ${selected ? "bg-amber-100 ring-1 ring-amber-400" : v.fmsSyncStatus === "synced" ? "bg-green-50/60" : v.fmsSyncStatus === "failed" ? "bg-red-50/50" : "hover:bg-slate-50"}`}
                      onClick={() => selectVisit(v.id)}
                    >
                      <td className="whitespace-nowrap font-mono text-xs">{fmt(v.updatedAt)}</td>
                      <td
                        className={`text-xs ${fmsSyncCellClass(v.fmsSyncStatus)}`}
                        title={v.fmsSyncMessage ?? undefined}
                      >
                        {fmsSyncLabel(v.fmsSyncStatus)}
                      </td>
                      <td className="whitespace-nowrap font-mono text-xs" title={v.fmsSyncMessage ?? undefined}>
                        {fmt(v.fmsSyncAt)}
                      </td>
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
                  );
                })}
                {displayedVisits.length === 0 && (
                  <tr>
                    <td colSpan={13} className="text-gray-500">
                      Geen transacties voor huidige filter.
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
