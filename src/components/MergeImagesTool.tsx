import { useState } from "react";
import { useMediaQueue, sizeValidator } from "@/hooks/useMediaQueue";
import { probeImage, formatBytes, downloadBlob } from "@/lib/core";
import { mergeImages, defaultMergeSettings } from "@/lib/mergeImages";
import type { MergeSettings } from "@/lib/mergeImages";
import { Dropzone } from "./Dropzone";
import { QueueList } from "./QueueList";
import { Field, Notices, NumberInput, Segmented, SliderRow } from "./Bits";
import { Download, Loader2 } from "lucide-react";
import { uploadResultToS3 } from "@/lib/uploadToS3";

const MAX_BYTES = 80 * 1024 * 1024;
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMG_EXT = /\.(jpe?g|png|webp)$/i;

interface MergeResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

export function MergeImagesTool() {
  const q = useMediaQueue({
    validate: sizeValidator(
      MAX_BYTES,
      (f) => IMG_TYPES.includes(f.type) || IMG_EXT.test(f.name),
      "unsupported format (use JPG, PNG, or WebP)"
    ),
    probe: probeImage,
    makePreview: true,
  });
  const [s, setS] = useState<MergeSettings>(defaultMergeSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);
  const set = (p: Partial<MergeSettings>) => {
    setS((prev) => ({ ...prev, ...p }));
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url);
      return null;
    });
  };


  const merge = async () => {
    setBusy(true);
    setError(null);
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url);
      return null;
    });
    try {
      const out = await mergeImages(q.items.map((i) => i.file), s);
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
      void uploadResultToS3(out.blob, `merged.${s.format === "jpeg" ? "jpg" : s.format}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't merge these images.");
    }
    setBusy(false);
  };

  return (
    <section aria-label="Merge images">
      <Dropzone
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onFiles={(f) => {
          q.addFiles(f);
          setResult((r) => {
            if (r) URL.revokeObjectURL(r.url);
            return null;
          });
        }}
        hint="JPG, PNG, or WebP · at least 2 images · drag rows below to set the order"
        compact={q.items.length > 0}
      />
      <Notices notices={q.notices} />

      {q.items.length > 0 && (
        <>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <Field label="Layout">
              <Segmented
                value={s.layout}
                onChange={(layout) => set({ layout })}
                disabled={busy}
                options={[
                  { value: "vertical", label: "Column" },
                  { value: "horizontal", label: "Row" },
                  { value: "grid", label: "Grid" },
                ]}
              />
            </Field>
            {s.layout === "grid" && (
              <Field label="Columns">
                <NumberInput value={s.cols} min={1} max={12} onChange={(cols) => set({ cols: Math.max(1, Math.min(12, cols || 1)) })} disabled={busy} ariaLabel="Grid columns" />
              </Field>
            )}
            <Field label="Spacing between images">
              <SliderRow min={0} max={100} value={s.gap} onChange={(gap) => set({ gap })} disabled={busy} valueLabel={`${s.gap} px`} />
            </Field>
            <Field label="Background">
              <Segmented
                value={s.bg}
                onChange={(bg) => set({ bg })}
                disabled={busy}
                options={[
                  { value: "white", label: "White" },
                  { value: "black", label: "Black" },
                  { value: "transparent", label: "Transparent" },
                ]}
              />
              {s.bg === "transparent" && s.format === "jpeg" && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">JPEG can't be transparent — pick PNG or WebP, or the background will be white.</p>
              )}
            </Field>
            <Field label="Output format">
              <Segmented
                value={s.format}
                onChange={(format) => set({ format })}
                disabled={busy}
                options={[
                  { value: "jpeg", label: "JPEG" },
                  { value: "png", label: "PNG" },
                  { value: "webp", label: "WebP" },
                ]}
              />
            </Field>
            {s.format !== "png" && (
              <Field label="Quality">
                <SliderRow min={10} max={100} value={s.quality} onChange={(quality) => set({ quality })} disabled={busy} valueLabel={`${s.quality}`} />
              </Field>
            )}
          </div>

          <QueueList
            items={q.items}
            onReorder={(a, b) => {
              q.reorder(a, b);
              setResult((r) => {
                if (r) URL.revokeObjectURL(r.url);
                return null;
              });
            }}
            onToggleSelect={q.toggleSelect}
            onSelectAll={q.selectAll}
            onRemove={q.remove}
            onRemoveSelected={q.removeSelected}
            onClear={() => {
              q.clear();
              setResult(null);
            }}
            busy={busy}
            thumbs
            metaLine={(it) =>
              [it.meta.width && it.meta.height ? `${it.meta.width} × ${it.meta.height}` : null, formatBytes(it.file.size)]
                .filter(Boolean)
                .join(" · ")
            }
            estimate={() => null}
          />

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={merge}
              disabled={busy || q.items.length < 2}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-accent-hover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:shadow-none"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Merging…
                </span>
              ) : (
                `Merge ${q.items.length} images`
              )}
            </button>
            {q.items.length < 2 && <span className="text-xs text-slate-400 dark:text-slate-500">Add at least two images.</span>}
          </div>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          {result && (
            <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  Merged image · <span className="font-medium">{result.width} × {result.height}</span> ·{" "}
                  <span className="font-medium">{formatBytes(result.blob.size)}</span>
                </p>
                <button
                  onClick={() => downloadBlob(result.blob, `merged.${s.format === "jpeg" ? "jpg" : s.format}`)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:border-accent hover:text-accent"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
              <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-slate-100 dark:border-slate-800 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#1f2937_0%_25%,#111827_0%_50%)] bg-[length:16px_16px]">
                <img src={result.url} alt="Merged result" className="max-w-full" />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}