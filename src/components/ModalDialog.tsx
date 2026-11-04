"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  headerActions?: ReactNode;
  children: ReactNode;
};

export function ModalDialog({ open, onClose, title, headerActions, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[max(1rem,8vh)] sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Dialoog sluiten"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-dialog-title"
        className="relative z-10 flex max-h-[min(88vh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-slate-50/90 px-4 py-3">
          <h2 id="modal-dialog-title" className="font-semibold text-[var(--accent)]">
            {title}
          </h2>
          {headerActions ? <div className="flex flex-wrap gap-2">{headerActions}</div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
