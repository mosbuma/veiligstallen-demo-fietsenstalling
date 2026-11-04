"use client";

import type { FmsLogEntry } from "@/lib/fms-log-view";
import { useEffect, useState } from "react";

function jsonBlock(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type Props = {
  calls: FmsLogEntry[];
  /** Chronological label in section title */
  title?: string;
  emptyHint?: string;
  /** Initial selected index */
  initialIndex?: number;
};

export function FmsCallInspector({
  calls,
  title = "FMS-aanroepen voor deze transactie",
  emptyHint = "Nog geen FMS-log voor deze transactie. Gebruik Opnieuw versturen om aanroepen te registreren.",
  initialIndex = 0,
}: Props) {
  const [expandedCall, setExpandedCall] = useState(initialIndex);
  const [inspectorTab, setInspectorTab] = useState<"request" | "response">("request");

  useEffect(() => {
    const idx = Math.min(Math.max(0, initialIndex), Math.max(0, calls.length - 1));
    setExpandedCall(idx);
    setInspectorTab("request");
  }, [initialIndex, calls]);

  if (calls.length === 0) {
    return <p className="text-sm text-gray-600">{emptyHint}</p>;
  }

  const active = calls[expandedCall] ?? calls[0]!;

  return (
    <div className="space-y-2 border-t border-gray-200 pt-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-gray-600">Chronologisch · elk type heeft eigen payload/response.</p>
      <div className="flex flex-wrap gap-1">
        {calls.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={`rounded px-2 py-1 text-xs font-medium ${expandedCall === i ? "bg-[var(--accent)] text-white" : "bg-white border border-gray-300"} ${c.ok ? "" : "ring-1 ring-red-300"}`}
            onClick={() => {
              setExpandedCall(i);
              setInspectorTab("request");
            }}
            title={new Date(c.createdAt).toLocaleString("nl-NL")}
          >
            {new Date(c.createdAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}{" "}
            · {c.callType} · {c.ok ? "OK" : "mislukt"} · HTTP {c.statusCode}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded border border-gray-200 bg-white p-3 text-sm">
        <p className="font-mono text-xs break-all">
          <span className="font-semibold text-gray-700">{active.method}</span> {active.url}
        </p>
        {active.error && <p className="text-xs text-red-700">{active.error}</p>}
        <div className="flex gap-2 border-b border-gray-100 pb-1">
          <button
            type="button"
            className={`text-xs font-semibold ${inspectorTab === "request" ? "text-[var(--accent)]" : "text-gray-500"}`}
            onClick={() => setInspectorTab("request")}
          >
            Payload
          </button>
          <button
            type="button"
            className={`text-xs font-semibold ${inspectorTab === "response" ? "text-[var(--accent)]" : "text-gray-500"}`}
            onClick={() => setInspectorTab("response")}
          >
            Response
          </button>
        </div>
        <pre className="max-h-64 overflow-auto rounded bg-gray-900 p-3 text-xs text-green-100">
          {inspectorTab === "request"
            ? jsonBlock(active.requestBody)
            : active.responseText || jsonBlock(active.responseBody)}
        </pre>
      </div>
    </div>
  );
}
