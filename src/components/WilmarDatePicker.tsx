"use client";

import {
  dateToWilmarIso,
  defaultWilmarDateRange,
  formatWilmarDateShort,
  parseWilmarDateParts,
  wilmarIsoToDate,
  wilmarMonthShortLabel,
} from "@/lib/wilmar-page-prefs";
import { useEffect, useId, useRef, useState } from "react";
import { DayPicker, type Formatters } from "react-day-picker";
import { nl } from "react-day-picker/locale";

const wilmarFormatters: Partial<Formatters> = {
  formatCaption: (month) =>
    month.toLocaleDateString("nl-NL", { month: "short", year: "numeric" }).replace(/\./g, ""),
  formatMonthDropdown: (month) => wilmarMonthShortLabel(month.getMonth() + 1),
  formatWeekdayName: (weekday) =>
    weekday.toLocaleDateString("nl-NL", { weekday: "short" }).replace(/\./g, ""),
};

type Props = {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
};

export function WilmarDatePicker({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = wilmarIsoToDate(value) ?? wilmarIsoToDate(defaultWilmarDateRange().to);
  const display =
    parseWilmarDateParts(value) != null ? formatWilmarDateShort(value) : formatWilmarDateShort(defaultWilmarDateRange().to);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <label className="label" htmlFor={listId}>
        {label}
      </label>
      <button
        id={listId}
        type="button"
        className="input flex min-w-[11rem] items-center justify-between gap-2 text-left"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{display}</span>
        <span className="text-xs text-gray-500" aria-hidden>
          ▾
        </span>
      </button>
      {open && selected && (
        <div
          className="wilmar-day-picker absolute z-50 mt-1 rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg"
          role="dialog"
          aria-label={`${label} kiezen`}
        >
          <DayPicker
            mode="single"
            locale={nl}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (d) {
                onChange(dateToWilmarIso(d));
                setOpen(false);
              }
            }}
            captionLayout="dropdown"
            startMonth={new Date(2018, 0)}
            endMonth={new Date(new Date().getFullYear() + 1, 11)}
            formatters={wilmarFormatters}
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
}
