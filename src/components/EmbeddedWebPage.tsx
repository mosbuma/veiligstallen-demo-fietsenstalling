"use client";

/**
 * Embedded page in a 4:3 preview, scaled to fit (no scrollbars).
 */
import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  src: string;
  /** Native layout size of the embedded page (before scale). */
  nativeWidth?: number;
  nativeHeight?: number;
  className?: string;
};

type Fit = { scale: number; offsetX: number; offsetY: number };

function fitInBox(boxW: number, boxH: number, nativeWidth: number, nativeHeight: number): Fit {
  if (boxW <= 0 || boxH <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.min(boxW / nativeWidth, boxH / nativeHeight);
  const scaledW = nativeWidth * scale;
  const scaledH = nativeHeight * scale;
  return {
    scale,
    offsetX: (boxW - scaledW) / 2,
    offsetY: (boxH - scaledH) / 2,
  };
}

export function EmbeddedWebPage({
  title,
  src,
  nativeWidth = 1024,
  nativeHeight = 768,
  className = "",
}: Props) {
  const [iframeKey, setIframeKey] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      setFit(fitInBox(el.clientWidth, el.clientHeight, nativeWidth, nativeHeight));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nativeWidth, nativeHeight]);

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-slate-50 ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-gray-100/90 px-2 py-1.5">
        <span className="truncate text-xs font-semibold text-gray-800">{title}</span>
        <button
          type="button"
          className="btn btn-secondary shrink-0 text-xs"
          onClick={() => setIframeKey((k) => k + 1)}
          aria-label={`${title} vernieuwen`}
        >
          Vernieuwen
        </button>
      </div>
      <div ref={viewportRef} className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-900">
        <iframe
          key={iframeKey}
          title={title}
          src={src}
          width={nativeWidth}
          height={nativeHeight}
          className="pointer-events-auto absolute left-0 top-0 block max-w-none border-0 bg-white"
          style={{
            transform: `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`,
            transformOrigin: "top left",
          }}
          scrolling="no"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
