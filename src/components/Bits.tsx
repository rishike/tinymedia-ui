import type { ReactNode } from "react";
import { AlertTriangle, Archive, Loader2 } from "lucide-react";
import type { LoadState } from "@/lib/ffmpegManager";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      {children}
    </div>
  );
}

export function Segmented<T extends string>(p: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-1">
      {p.options.map((o) => (
        <button
          key={o.value}
          onClick={() => p.onChange(o.value)}
          disabled={p.disabled}
          className={[
            "rounded-lg px-3 py-1.5 text-[13px] transition-all duration-150 disabled:opacity-50",
            o.value === p.value
              ? "bg-white dark:bg-slate-900 font-semibold text-accent shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SliderRow(p: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  valueLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={p.step ?? 1}
        value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        disabled={p.disabled}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-slate-700 accent-accent disabled:opacity-50"
      />
      <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">{p.valueLabel}</span>
    </div>
  );
}

export function NativeSelect(p: {
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
      disabled={p.disabled}
      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
    >
      {p.options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput(p: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={Number.isFinite(p.value) ? p.value : ""}
        min={p.min}
        max={p.max}
        onChange={(e) => p.onChange(Number(e.target.value))}
        disabled={p.disabled}
        aria-label={p.ariaLabel}
        className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-sm tabular-nums text-slate-800 dark:text-slate-100 shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
      />
      {p.suffix && <span className="text-xs text-slate-500 dark:text-slate-400">{p.suffix}</span>}
    </div>
  );
}

export function Notices({ notices }: { notices: string[] }) {
  if (!notices.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3">
      {notices.map((n, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {n}
        </p>
      ))}
    </div>
  );
}

export function EncoderBanner({ state }: { state: LoadState }) {
  if (state.phase === "ready" || state.phase === "idle") return null;
  if (state.phase === "error") {
    return (
      <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {state.message}
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
        Loading the encoder — a one-time ~31 MB download, shared by the Video and Audio tools.
      </p>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${state.pct}%` }}
        />
      </div>
    </div>
  );
}

export function ActionBar(p: {
  processLabel: string;
  onProcess: () => void;
  canProcess: boolean;
  busy: boolean;
  doneCount: number;
  onZip: () => void;
  zipBusy: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button
        onClick={p.onProcess}
        disabled={!p.canProcess || p.busy}
        className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-accent-hover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:shadow-none"
      >
        {p.busy ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
          </span>
        ) : (
          p.processLabel
        )}
      </button>
      {p.doneCount > 1 && (
        <button
          onClick={p.onZip}
          disabled={p.zipBusy}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm transition-all duration-150 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <Archive className="h-3.5 w-3.5" />
          {p.zipBusy ? "Zipping…" : `Download all (.zip)`}
        </button>
      )}
      {p.children}
    </div>
  );
}

export function TotalsRow(p: { original: number; estimated: number | null; done: boolean }) {
  if (p.original <= 0) return null;
  return (
    <p className="mt-5 text-sm tabular-nums text-slate-600 dark:text-slate-300">
      Total{" "}
      <span className="font-semibold text-slate-900 dark:text-slate-50">
        {formatBytesLocal(p.original)}
      </span>
      {p.estimated != null && (
        <>
          <span className="mx-1.5 text-slate-300 dark:text-slate-600">→</span>
          {p.done ? "" : "≈ "}
          <span className="font-semibold text-accent">{formatBytesLocal(p.estimated)}</span>
          {p.estimated < p.original && (
            <span className="ml-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              −{Math.round((1 - p.estimated / p.original) * 100)}%{p.done ? "" : " est."}
            </span>
          )}
        </>
      )}
    </p>
  );
}

function formatBytesLocal(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}