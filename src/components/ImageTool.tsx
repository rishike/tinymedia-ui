import { useEffect, useMemo, useState } from "react";
import { useMediaQueue, sizeValidator } from "@/hooks/useMediaQueue";
import { probeImage, downloadZip } from "@/lib/core";
import type { MediaItem } from "@/lib/core";
import {
  type ImageSettings, defaultImageSettings, processImage, estimateImageSize, supportsAvif, targetDims,
} from "@/lib/imageProcess";
import { Dropzone } from "./Dropzone";
import { QueueList } from "./QueueList";
import { ActionBar, Field, NativeSelect, Notices, NumberInput, Segmented, SliderRow, TotalsRow } from "./Bits";
import { Lock, Unlock } from "lucide-react";

const MAX_BYTES = 80 * 1024 * 1024;
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMG_EXT = /\.(jpe?g|png|webp)$/i;

export function ImageTool() {
  const q = useMediaQueue({
    validate: sizeValidator(
      MAX_BYTES,
      (f) => IMG_TYPES.includes(f.type) || IMG_EXT.test(f.name),
      "unsupported format (use JPG, PNG, or WebP)"
    ),
    probe: probeImage,
    makePreview: true,
  });
  const [s, setS] = useState<ImageSettings>(defaultImageSettings);
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [avifOk, setAvifOk] = useState<boolean | null>(null);
  const set = (p: Partial<ImageSettings>) => setS((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    supportsAvif().then(setAvifOk);
  }, []);

  const estimate = (it: MediaItem): number | null => estimateImageSize(it.file, it.meta, s);

  const processAll = async () => {
    setBusy(true);
    for (const it of q.items.filter((i) => i.status === "ready" || i.status === "error")) {
      q.patch(it.id, { status: "processing", progress: 0.4, error: undefined });
      try {
        const out = await processImage(it.file, s);
        q.patch(it.id, {
          status: "done",
          progress: 1,
          output: { blob: out.blob, name: out.name, width: out.width, height: out.height },
        });
      } catch (e) {
        q.patch(it.id, { status: "error", error: e instanceof Error ? e.message : "Couldn't process this image." });
      }
      // let the UI breathe between large images
      await new Promise((r) => setTimeout(r, 0));
    }
    setBusy(false);
  };

  const done = q.items.filter((i) => i.status === "done" && i.output);
  const totals = useMemo(() => {
    const orig = q.items.reduce((sum, i) => sum + i.file.size, 0);
    const allDone = q.items.length > 0 && q.items.every((i) => i.status === "done" && i.output);
    const est = q.items.reduce((sum, i) => sum + (i.output ? i.output.blob.size : estimate(i) ?? i.file.size), 0);
    return { orig, est: q.items.length ? est : null, allDone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.items, s]);

  const lossless = s.format === "png" && s.mode !== "maxsize";

  return (
    <section aria-label="Image resizer">
      <Dropzone
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onFiles={q.addFiles}
        hint="JPG, PNG, or WebP · batch upload · up to 80 MB each"
        compact={q.items.length > 0}
      />
      <Notices notices={q.notices} />

      {q.items.length > 0 && (
        <>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <Field label="Resize by">
              <Segmented
                value={s.mode}
                onChange={(mode) => set({ mode })}
                disabled={busy}
                options={[
                  { value: "percent", label: "Percentage" },
                  { value: "dimensions", label: "Dimensions" },
                  { value: "maxsize", label: "Max file size" },
                ]}
              />
            </Field>

            {s.mode === "percent" && (
              <Field label="Scale">
                <SliderRow min={5} max={100} value={s.percent} onChange={(percent) => set({ percent })} disabled={busy} valueLabel={`${s.percent}%`} />
              </Field>
            )}
            {s.mode === "dimensions" && (
              <Field label={s.lockAspect ? "Fit within (keeps aspect ratio)" : "Exact dimensions (may stretch)"}>
                <div className="flex items-center gap-2">
                  <NumberInput value={s.width} min={1} onChange={(width) => set({ width: Math.max(1, width || 1) })} suffix="×" disabled={busy} ariaLabel="Width in pixels" />
                  <NumberInput value={s.height} min={1} onChange={(height) => set({ height: Math.max(1, height || 1) })} suffix="px" disabled={busy} ariaLabel="Height in pixels" />
                  <button
                    onClick={() => set({ lockAspect: !s.lockAspect })}
                    disabled={busy}
                    aria-pressed={s.lockAspect}
                    title={s.lockAspect ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                    className={[
                      "rounded-lg border p-1.5 transition-colors",
                      s.lockAspect ? "border-accent text-accent" : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300",
                    ].join(" ")}
                  >
                    {s.lockAspect ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </Field>
            )}
            {s.mode === "maxsize" && (
              <Field label="Max size per image">
                <NumberInput value={s.maxKB} min={10} onChange={(maxKB) => set({ maxKB: Math.max(10, maxKB || 10) })} suffix="KB" disabled={busy} ariaLabel="Maximum size in kilobytes" />
              </Field>
            )}

            <Field label="Output format">
              <NativeSelect
                value={s.format}
                onChange={(format) => set({ format: format as ImageSettings["format"] })}
                disabled={busy}
                options={[
                  { value: "original", label: "Keep original" },
                  { value: "jpeg", label: "JPEG" },
                  { value: "png", label: "PNG (lossless)" },
                  { value: "webp", label: "WebP" },
                  { value: "avif", label: avifOk === false ? "AVIF — not supported by this browser" : "AVIF", disabled: avifOk === false },
                ]}
              />
            </Field>
            <Field label={lossless ? "Quality — not used for lossless PNG" : "Quality"}>
              <SliderRow min={10} max={100} value={s.quality} onChange={(quality) => set({ quality })} disabled={busy || lossless} valueLabel={`${s.quality}`} />
            </Field>
          </div>

          {s.mode === "maxsize" && s.format === "png" && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">PNG can't hit a size target — these will be saved as WebP instead.</p>
          )}

          <TotalsRow original={totals.orig} estimated={totals.est} done={totals.allDone} />

          <QueueList
            items={q.items}
            onReorder={q.reorder}
            onToggleSelect={q.toggleSelect}
            onSelectAll={q.selectAll}
            onRemove={q.remove}
            onRemoveSelected={q.removeSelected}
            onClear={q.clear}
            busy={busy}
            thumbs
            metaLine={(it) => {
              const src = it.meta.width && it.meta.height ? `${it.meta.width} × ${it.meta.height}` : it.file.type || "image";
              if (it.output?.width && it.output.height && (it.output.width !== it.meta.width || it.output.height !== it.meta.height)) {
                return `${src} → ${it.output.width} × ${it.output.height}`;
              }
              if (it.status !== "done" && it.meta.width && it.meta.height && s.mode !== "maxsize") {
                const t = targetDims(it.meta.width, it.meta.height, s);
                if (t.w !== it.meta.width || t.h !== it.meta.height) return `${src} → ${t.w} × ${t.h}`;
              }
              return src;
            }}
            estimate={estimate}
          />

          <ActionBar
            processLabel={`Resize ${q.items.filter((i) => i.status !== "done").length || ""} image${q.items.length === 1 ? "" : "s"}`}
            onProcess={processAll}
            canProcess={q.items.some((i) => i.status === "ready" || i.status === "error")}
            busy={busy}
            doneCount={done.length}
            zipBusy={zipBusy}
            onZip={async () => {
              setZipBusy(true);
              try {
                await downloadZip(done.map((d) => ({ name: d.output!.name, blob: d.output!.blob })), "tinymedia-images.zip");
              } finally {
                setZipBusy(false);
              }
            }}
          />
        </>
      )}
    </section>
  );
}