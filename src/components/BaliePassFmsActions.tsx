"use client";

import { ModalDialog } from "@/components/ModalDialog";
import { isSyntheticPassCode } from "@/lib/pass-display";
import { useCallback, useEffect, useMemo, useState } from "react";

type SubTypeOption = { id: number; label: string };

type SellMode = "withPass" | "withoutPass";

function parseSubscriptionTypes(json: unknown): SubTypeOption[] {
  const raw = Array.isArray(json) ? json : (json as { data?: unknown[] })?.data;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Record<string, unknown>;
      const id = Number(o.subscriptiontypeid ?? o.id ?? o.subscriptionTypeId);
      const label = String(o.name ?? o.title ?? o.description ?? id);
      return { id, label };
    })
    .filter((x) => Number.isFinite(x.id) && x.id > 0);
}

const subtleBtn =
  "rounded border border-[var(--border)] bg-white/80 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

type Props = {
  passCode: string;
  passActive: boolean;
  onFeedback: (message: string | null) => void;
};

export function BaliePassFmsActions({ passCode, passActive, onFeedback }: Props) {
  const [saldoOpen, setSaldoOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [saldoAmount, setSaldoAmount] = useState("10");
  const [subTypeId, setSubTypeId] = useState("");
  const [subscribeId, setSubscribeId] = useState("");
  const [sellMode, setSellMode] = useState<SellMode>("withPass");
  const [createdSubId, setCreatedSubId] = useState<string | null>(null);
  const [subTypes, setSubTypes] = useState<SubTypeOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [dialogMsg, setDialogMsg] = useState<string | null>(null);

  const trimmedPass = passCode.trim();

  const loadSubTypes = useCallback(() => {
    fetch("/api/metadata")
      .then((r) => r.json())
      .then((j) => {
        const parsed = parseSubscriptionTypes(j.subscriptionTypes);
        setSubTypes(parsed);
        setSubTypeId((current) => current || (parsed[0] ? String(parsed[0].id) : ""));
      })
      .catch(() => setSubTypes([]));
  }, []);

  useEffect(() => {
    if (sellOpen) loadSubTypes();
  }, [sellOpen, loadSubTypes]);

  const subTypeOptions = useMemo(() => {
    if (subTypes.length > 0) return subTypes;
    return subTypeId ? [{ id: Number(subTypeId), label: `Type ${subTypeId}` }] : [];
  }, [subTypes, subTypeId]);

  const postAdmin = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setDialogMsg(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; status?: number; subscriptionId?: number };
      const text =
        j.message ??
        (j.ok
          ? payload.action === "saldo"
            ? "Saldo naar FMS gestuurd"
            : "Gelukt"
          : `FMS ${j.status ?? res.status}`);
      setDialogMsg(text);
      onFeedback(text);
      if (j.ok) {
        if (payload.action === "subscription" && j.subscriptionId) {
          setSubscribeId(String(j.subscriptionId));
        }
        if (payload.action === "saldo") setSaldoOpen(false);
        if (payload.action === "subscription") {
          const linked = Boolean(payload.passCode);
          if (linked) {
            setCreatedSubId(null);
            setSellOpen(false);
          } else if (j.subscriptionId) {
            setCreatedSubId(String(j.subscriptionId));
          } else {
            setSellOpen(false);
          }
        }
        if (payload.action === "subscribe") setLinkOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const openSaldo = () => {
    setDialogMsg(null);
    setSaldoOpen(true);
  };
  const openSell = () => {
    setDialogMsg(null);
    setCreatedSubId(null);
    setSellMode(trimmedPass && passActive ? "withPass" : "withoutPass");
    setSellOpen(true);
  };
  const openLink = () => {
    setDialogMsg(null);
    setLinkOpen(true);
  };

  /** Balie veld moet een echte sleutelhanger zijn (niet leeg, niet SYS-*). Pool leeg → eerst bereik op Aansluiten. */
  const canUsePhysicalPass = Boolean(trimmedPass) && !isSyntheticPassCode(trimmedPass);

  const goLinkAfterCreate = () => {
    if (createdSubId) setSubscribeId(createdSubId);
    setSellOpen(false);
    setCreatedSubId(null);
    setLinkOpen(true);
  };

  const sellNeedsPass = sellMode === "withPass";
  const canSubmitSell =
    !busy &&
    subTypeId.trim() &&
    (sellNeedsPass ? Boolean(trimmedPass && passActive) : true);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={subtleBtn} disabled={!passActive} onClick={openSaldo}>
          Opwaarderen
        </button>
        <button type="button" className={subtleBtn} onClick={openSell}>
          Abonnement verkopen
        </button>
        <button type="button" className={subtleBtn} disabled={!passActive} onClick={openLink}>
          Abonnement koppelen
        </button>
      </div>

      <ModalDialog open={saldoOpen} onClose={() => setSaldoOpen(false)} title="Stallingstegoed opwaarderen">
        <div className="mx-auto max-w-md space-y-3">
          <div>
            <label className="label">Sleutelhanger</label>
            <input className="input bg-gray-50 font-mono" readOnly value={trimmedPass} />
          </div>
          <div>
            <label className="label">Bedrag (€)</label>
            <input
              className="input"
              type="number"
              min={0}
              step={0.01}
              value={saldoAmount}
              onChange={(e) => setSaldoAmount(e.target.value)}
            />
          </div>
          {dialogMsg && <p className="text-sm text-gray-700">{dialogMsg}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn btn-secondary" onClick={() => setSaldoOpen(false)}>
              Annuleren
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !trimmedPass}
              onClick={() =>
                void postAdmin({
                  action: "saldo",
                  passCode: trimmedPass,
                  amount: Number(saldoAmount),
                  idType: 0,
                })
              }
            >
              Opwaarderen
            </button>
          </div>
        </div>
      </ModalDialog>

      <ModalDialog
        open={sellOpen}
        onClose={() => {
          setSellOpen(false);
          setCreatedSubId(null);
        }}
        title="Abonnement verkopen"
      >
        <div className="mx-auto max-w-md space-y-3">
          {createdSubId ? (
            <>
              <p className="text-sm text-gray-800">
                Abonnement staat in FMS zonder sleutelhanger. De <strong>koppelcode</strong> voor stap 2 is dit
                numerieke <strong>abonnement-id</strong> (geen U-code tenzij jullie penning-flow gebruiken).
              </p>
              <div>
                <label className="label">Abonnement-id (koppelcode)</label>
                <input className="input bg-gray-50 font-mono text-lg" readOnly value={createdSubId} />
              </div>
              {!canUsePhysicalPass && (
                <p className="text-xs text-amber-800">
                  Vul eerst het sleutelhangerveld op de balie in (scan of typ) of gebruik <strong>Sleutelhanger
                  uitgeven</strong>. Als de pool 0 is: op Aansluiten het bereik uitbreiden of in Administratie
                  passes bijboeken — dat is los van dit abonnement-id.
                </p>
              )}
              {dialogMsg && <p className="text-sm text-gray-700">{dialogMsg}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSellOpen(false);
                    setCreatedSubId(null);
                  }}
                >
                  Sluiten
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canUsePhysicalPass}
                  title={
                    !canUsePhysicalPass
                      ? "Vul het sleutelhangerveld op de balie in of geef een sleutelhanger uit"
                      : undefined
                  }
                  onClick={goLinkAfterCreate}
                >
                  Sleutelhanger koppelen
                </button>
              </div>
            </>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="label mb-1">Koppeling</legend>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="sellMode"
                    className="mt-0.5"
                    checked={sellMode === "withoutPass"}
                    onChange={() => setSellMode("withoutPass")}
                  />
                  <span>
                    <span className="font-medium">Zonder sleutelhanger</span>
                    <span className="block text-xs text-gray-600">
                      Alleen abonnement in FMS (POST subscriptions, Wilmar stap 1). Later koppelen via
                      activeringscode of id.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="sellMode"
                    className="mt-0.5"
                    checked={sellMode === "withPass"}
                    onChange={() => setSellMode("withPass")}
                    disabled={!passActive || !trimmedPass}
                  />
                  <span className={!passActive || !trimmedPass ? "opacity-60" : undefined}>
                    <span className="font-medium">Direct aan sleutelhanger</span>
                    <span className="block text-xs text-gray-600">
                      Abonnement meteen op de geselecteerde sleutelhanger (één stap).
                    </span>
                  </span>
                </label>
              </fieldset>

              {sellNeedsPass && (
                <div>
                  <label className="label">Sleutelhanger</label>
                  <input className="input bg-gray-50 font-mono" readOnly value={trimmedPass} />
                </div>
              )}

              <div>
                <label className="label">Abonnementstype</label>
                {subTypeOptions.length > 0 ? (
                  <select
                    className="input"
                    value={subTypeId}
                    onChange={(e) => setSubTypeId(e.target.value)}
                  >
                    {subTypeOptions.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.label} ({t.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    placeholder="subscriptiontypeid"
                    value={subTypeId}
                    onChange={(e) => setSubTypeId(e.target.value)}
                  />
                )}
              </div>
              {dialogMsg && <p className="text-sm text-gray-700">{dialogMsg}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSellOpen(false);
                    setCreatedSubId(null);
                  }}
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canSubmitSell}
                  onClick={() => {
                    const base = {
                      action: "subscription" as const,
                      subscriptiontypeid: Number(subTypeId),
                      cost: 0,
                    };
                    if (sellNeedsPass) {
                      void postAdmin({
                        ...base,
                        passCode: trimmedPass,
                        idType: 0,
                      });
                    } else {
                      void postAdmin(base);
                    }
                  }}
                >
                  Verkopen
                </button>
              </div>
            </>
          )}
        </div>
      </ModalDialog>

      <ModalDialog open={linkOpen} onClose={() => setLinkOpen(false)} title="Abonnement koppelen">
        <div className="mx-auto max-w-md space-y-3">
          <div>
            <label className="label">Sleutelhanger</label>
            <input className="input bg-gray-50 font-mono" readOnly value={trimmedPass} />
          </div>
          <div>
            <label className="label">Koppelcode</label>
            <input
              className="input font-mono"
              placeholder="U… activeringscode of numeriek abonnement-id"
              value={subscribeId}
              onChange={(e) => setSubscribeId(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-600">
              Activeringscode van het document (bijv. U10164311201) of het numerieke id uit FMS na
              verkopen zonder pas — zelfde logica als Wilmar/CF subscribe.
            </p>
          </div>
          {dialogMsg && <p className="text-sm text-gray-700">{dialogMsg}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn btn-secondary" onClick={() => setLinkOpen(false)}>
              Annuleren
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !trimmedPass || !subscribeId.trim()}
              onClick={() =>
                void postAdmin({
                  action: "subscribe",
                  subscriptionId: subscribeId.trim(),
                  passCode: trimmedPass,
                  idType: 0,
                })
              }
            >
              Koppelen
            </button>
          </div>
        </div>
      </ModalDialog>
    </>
  );
}
