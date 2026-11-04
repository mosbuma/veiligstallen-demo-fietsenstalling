"use client";

import {
  FMS_SYNC_MODE_CHANGED_EVENT,
  readFmsSyncMode,
  type FmsSyncMode,
} from "@/lib/fms-sync-mode";
import { useCallback, useEffect, useState } from "react";

type SyncStatus = {
  pendingTransactions: number;
  lastFmsBatchAt: string | null;
  lastFmsBatchOk: boolean | null;
  lastFmsBatchMessage: string;
};

const INTERVAL_MS = 5 * 60 * 1000;

export function VeiligstallenSyncBar() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<FmsSyncMode>("batch");

  useEffect(() => {
    setSyncMode(readFmsSyncMode());
    const onMode = () => setSyncMode(readFmsSyncMode());
    window.addEventListener(FMS_SYNC_MODE_CHANGED_EVENT, onMode);
    return () => window.removeEventListener(FMS_SYNC_MODE_CHANGED_EVENT, onMode);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/fms-sync");
    if (res.ok) setStatus((await res.json()) as SyncStatus);
  }, []);

  const postSync = useCallback(async (mode: FmsSyncMode) => {
    const res = await fetch("/api/fms-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const j = (await res.json()) as { ok?: boolean; message?: string };
    setFlash(j.message ?? (j.ok ? "Bijgewerkt" : "Mislukt"));
    await load();
    window.dispatchEvent(new Event("local-db-updated"));
  }, [load]);

  const runFullSync = useCallback(async () => {
    setRunning(true);
    setFlash(null);
    try {
      await postSync("batch");
    } finally {
      setRunning(false);
    }
  }, [postSync]);

  const runAutoSync = useCallback(async () => {
    try {
      await postSync(readFmsSyncMode());
    } catch {
      /* background tick — no running spinner */
    }
  }, [postSync]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 15000);
    const onLocal = () => void load();
    window.addEventListener("local-db-updated", onLocal);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("local-db-updated", onLocal);
    };
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => {
      void runAutoSync();
    }, INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [runAutoSync]);

  const pending = status?.pendingTransactions ?? 0;
  const single = syncMode === "single";
  const last = status?.lastFmsBatchAt
    ? new Date(status.lastFmsBatchAt).toLocaleString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "—";

  const buttonLabel = running
    ? "Bezig…"
    : pending > 0
      ? `Update VeiligStallen (${pending})`
      : "Update VeiligStallen";

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <button
        type="button"
        className="btn btn-primary text-sm"
        disabled={running}
        onClick={() => void runFullSync()}
      >
        {buttonLabel}
      </button>
      <p className="text-xs text-gray-600">
        {pending > 0 ? (
          <span className="font-medium text-amber-800">{pending} openstaand</span>
        ) : (
          <span className="text-green-800">Geen openstaande transacties</span>
        )}
        {" · "}auto 5 min ({single ? "1 transactie" : "batch"}) · laatste sync: {last}
      </p>
      {flash && (
        <p className={`text-xs ${status?.lastFmsBatchOk ? "text-green-800" : "text-red-700"}`}>{flash}</p>
      )}
    </div>
  );
}
