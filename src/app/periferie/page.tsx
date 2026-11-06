"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function PeriferiePage() {
  const [form, setForm] = useState({
    occupationMode: "both" as "indirect" | "direct" | "both",
    defaultIdType: 0,
    defaultBiketypeId: 1,
    tariffStepsJson: '[{"timespan":1,"cost":0.5,"unit":"hours"}]',
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) =>
        setForm({
          occupationMode: s.occupationMode,
          defaultIdType: s.defaultIdType,
          defaultBiketypeId: s.defaultBiketypeId,
          tariffStepsJson: JSON.stringify(s.tariffSteps ?? [], null, 2),
        })
      );
  }, []);

  const save = async () => {
    let tariffSteps;
    try {
      tariffSteps = JSON.parse(form.tariffStepsJson);
    } catch {
      setMsg("Tarief JSON ongeldig");
      return;
    }
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, tariffSteps }),
    });
    setMsg("Opgeslagen");
  };

  return (
    <div className="space-y-4">
      <div className="card prose prose-sm max-w-none">
        <h2 className="text-xl font-bold">Periferie & lokale instellingen</h2>
        <p>
          VeiligStallen-koppeling en sleutelhanger-/fietsstickerbereiken staan op{" "}
          <Link href="/aansluiten">Aansluiten</Link>. Hier stel je bezettingsmodus en het lokale tarief
          voor <code>stallingskosten</code> in (FMS berekent dat niet).
        </p>
        <h3 className="font-semibold">Welke FMS-call bij welke actie</h3>
        <ul className="text-sm">
          <li>Check-in → managedtransactions + save bike (idcodes/…/bike)</li>
          <li>Check-out → managedtransactions (zelfde externaltransactionid) + optioneel saldo POST</li>
          <li>Direct bezetting → occupation met occupation-getal (Lumiguide-bron)</li>
          <li>Controle sync → occupation met bikes-array</li>
          <li>Abonnement → subscriptions POST</li>
        </ul>
        <p className="text-sm">
          Id-types: 0 sleutelhanger, 1 OV-chip, 2 barcode-fiets.
        </p>
      </div>

      <div className="card grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">Bezetting</label>
          <select
            className="input"
            value={form.occupationMode}
            onChange={(e) =>
              setForm({ ...form, occupationMode: e.target.value as "indirect" | "direct" | "both" })
            }
          >
            <option value="indirect">Alleen indirect (via transacties)</option>
            <option value="direct">Alleen direct (occupation-getal)</option>
            <option value="both">Beide</option>
          </select>
        </div>
        <div>
          <label className="label">Standaard id-type</label>
          <select
            className="input"
            value={form.defaultIdType}
            onChange={(e) => setForm({ ...form, defaultIdType: Number(e.target.value) })}
          >
            <option value={0}>0 — sleutelhanger</option>
            <option value={1}>1 — OV-chip</option>
            <option value={2}>2 — barcode</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Tariefstappen (JSON)</label>
          <textarea
            className="input min-h-[120px] font-mono text-xs"
            value={form.tariffStepsJson}
            onChange={(e) => setForm({ ...form, tariffStepsJson: e.target.value })}
          />
        </div>
        <button type="button" className="btn btn-primary md:col-span-2" onClick={() => void save()}>
          Opslaan
        </button>
        {msg && <p className="text-sm md:col-span-2">{msg}</p>}
      </div>
    </div>
  );
}
