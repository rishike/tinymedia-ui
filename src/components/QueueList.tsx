import { useRef, useState } from "react";
import { GripVertical, X, Download, AlertCircle, Check } from "lucide-react";
import { formatBytes, downloadBlob, savingsPct } from "@/lib/core";
import type { MediaItem } from "@/lib/core";

interface Props {
  items: MediaItem[];
  onReorder: (from: number, to: number) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: (on: boolean) => void;
  onRemove: (id: string) => void;
  onRemoveSelected: () => void;
  onClear: () => void;
  /** e.g. "1920 × 1080 · 0:42 min" */
  metaLine: (it: MediaItem) => string;
  /** estimated output bytes for a ready item, or null to hide */
  estimate: (it: MediaItem) => number | null;
  busy: boolean;
  thumbs?: boolean;
}

export function QueueList(p: Props) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const allSelected = p.items.length > 0 && p.items.every((i) => i.selected);
  const someSelected = p.items.some((i) => i.selected);

  if (p.items.length === 0) return null;

  return (
    <div className="mt-6">
      {/* bulk bar */}
      <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
        <label className="flex cursor-pointer select-none items-center gap-2 text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => p.onSelectAll(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
            disabled={p.busy}
          />
          Select all
        </label>
        <button
          onClick={p.onRemoveSelected}
          disabled={!someSelected || p.busy}
          className="text-slate-600 dark:text-slate-300 underline-offset-2 hover:text-slate-900 dark:hover:text-white hover:underline disabled:cursor-not-allowed disabled:text-slate-300 dark:disabled:text-slate-600"
        >
          Remove selected
        </button>
        <button
          onClick={p.onClear}
          disabled={p.busy}
          className="text-slate-600 dark:text-slate-300 underline-offset-2 hover:text-slate-900 dark:hover:text-white hover:underline disabled:cursor-not-allowed disabled:text-slate-300 dark:disabled:text-slate-600"
        >
          Clear queue
        </button>
        <span className="ml-auto text-slate-400 dark:text-slate-500">
          {p.items.length} file{p.items.length === 1 ? "" : "s"} · drag to reorder
        </span>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        {p.items.map((it, idx) => (
          <li
            key={it.id}
            draggable={!p.busy}
            onDragStart={(e) => {
              dragIndex.current = idx;
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex.current !== null) setOverIndex(idx);
            }}
            onDragLeave={() => setOverIndex((o) => (o === idx ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex.current !== null) p.onReorder(dragIndex.current, idx);
              dragIndex.current = null;
              setOverIndex(null);
            }}
            onDragEnd={() => {
              dragIndex.current = null;
              setOverIndex(null);
            }}
            className={[
              "flex items-center gap-3 px-4 py-3 transition-colors",
              overIndex === idx ? "bg-accent/[0.05]" : "bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/40",
            ].join(" ")}
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300 dark:text-slate-600" strokeWidth={1.75} />
            <input
              type="checkbox"
              checked={it.selected}
              onChange={() => p.onToggleSelect(it.id)}
              className="h-3.5 w-3.5 shrink-0 accent-accent"
              disabled={p.busy}
              aria-label={`Select ${it.file.name}`}
            />
            {p.thumbs && (
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
                {it.previewUrl && (
                  <img src={it.previewUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">{it.file.name}</p>
              <p className="truncate text-xs tabular-nums text-slate-500 dark:text-slate-400">{p.metaLine(it)}</p>
              {it.status === "processing" && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300"
                    style={{ width: `${Math.round(it.progress * 100)}%` }}
                  />
                </div>
              )}
              {it.status === "error" && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3 w-3 shrink-0" /> {it.error}
                </p>
              )}
            </div>

            {/* size readout */}
            <div className="hidden shrink-0 text-right text-xs tabular-nums sm:block">
              {it.status === "done" && it.output ? (
                <>
                  <span className="text-slate-400 dark:text-slate-500 line-through">{formatBytes(it.file.size)}</span>{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-50">{formatBytes(it.output.blob.size)}</span>
                  <span
                    className={[
                      "ml-1.5 rounded-full px-1.5 py-0.5 font-medium",
                      it.output.blob.size < it.file.size
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                        : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
                    ].join(" ")}
                  >
                    {it.output.blob.size < it.file.size
                      ? `−${savingsPct(it.file.size, it.output.blob.size)}%`
                      : `+${-savingsPct(it.file.size, it.output.blob.size)}%`}
                  </span>
                </>
              ) : it.status === "processing" ? (
                <span className="text-slate-500 dark:text-slate-400">{Math.round(it.progress * 100)}%</span>
              ) : (
                (() => {
                  const est = p.estimate(it);
                  return est != null ? (
                    <>
                      <span className="text-slate-500 dark:text-slate-400">{formatBytes(it.file.size)}</span>
                      <span className="mx-1 text-slate-300 dark:text-slate-600">→</span>
                      <span className="text-slate-700 dark:text-slate-200">≈ {formatBytes(est)}</span>
                    </>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">{formatBytes(it.file.size)}</span>
                  );
                })()
              )}
            </div>

            {it.status === "done" && it.output && (
              <button
                onClick={() => downloadBlob(it.output!.blob, it.output!.name)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors hover:border-accent hover:text-accent"
              >
                <Download className="h-3 w-3" /> Save
              </button>
            )}
            {it.status === "done" && !it.output && <Check className="h-4 w-4 text-accent" />}
            <button
              onClick={() => p.onRemove(it.id)}
              disabled={p.busy && it.status === "processing"}
              className="shrink-0 rounded-lg p-1.5 text-slate-300 dark:text-slate-600 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-40"
              aria-label={`Remove ${it.file.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}