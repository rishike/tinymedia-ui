import { useEffect, useMemo, useState } from "react";
import { useMediaQueue, sizeValidator } from "@/hooks/useMediaQueue";
import { probeImage, downloadZip } from "@/lib/core";
import type { MediaItem } from "@/lib/core";
import { defaultImageSettings, processImage, estimateImageSize, supportsAvif } from "@/lib/imageProcess";
import type { ImageSettings } from "@/lib/imageProcess";
import { Dropzone } from "./Dropzone";
import { QueueList } from "./QueueList";
import { ActionBar, Field, NativeSelect, Notices, SliderRow, TotalsRow } from "./Bits";
import { uploadResultToS3 } from "@/lib/uploadToS3";

const MAX_BYTES = 80 * 1024 * 1024;
const IN_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/bmp"];
const IN_EXT = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;

export function ConvertImageTool() {
  const q = useMediaQueue({
    validate: sizeValidator(
      MAX_BYTES,
      (f) => IN_TYPES.includes(f.type) || IN_EXT.test(f.name),
      "unsupported format (use JPG, PNG, WebP, AVIF, GIF, or BMP)"
    ),
    probe: probeImage,
    makePreview: true,
  });
  const [format, setFormat] = useState<ImageSettings["format"]>("webp");
  const [quality, setQuality] = useState(85);
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [avifOk, setAvifOk] = useState<boolean | null>(null);

  useEffect(() => {
    supportsAvif().then(setAvifOk);
  }, []);

  // conversion only: keep dimensions, change encoding
  const settings: ImageSettings = useMemo(
    () => ({ ...defaultImageSettings, mode: "percent", percent: 100, format, quality }),
    [format, quality]
  );

  const estimate = (it: MediaItem): number | null => estimateImageSize(it.file, it.meta, settings);

  const processAll = async () => {
    setBusy(true);
    for (const it of q.items.filter((i) => i.status === "ready" || i.status === "error")) {
      q.patch(it.id, { status: "processing", progress: 0.4, error: undefined });
      try {
        const out = await processImage(it.file, settings);
        q.patch(it.id, {
          status: "done",
          progress: 1,
          output: { blob: out.blob, name: out.name, width: out.width, height: out.height },
        });
        void uploadResultToS3(out.blob, out.name);
      } catch (e) {
        q.patch(it.id, { status: "error", error: e instanceof Error ? e.message : "Couldn't convert this image." });
      }
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
  }, [q.items, settings]);

  const lossless = format === "png";

  return (
    <section aria-label="Image format converter">
      <Dropzone
        accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,image/*"
        onFiles={q.addFiles}
        hint="JPG, PNG, WebP, AVIF, GIF, or BMP in · JPG, PNG, WebP, or AVIF out · animated GIFs keep the first frame"
        compact={q.items.length > 0}
      />
      <Notices notices={q.notices} />

      {q.items.length > 0 && (
        <>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <Field label="Convert to">
              <NativeSelect
                value={format}
                onChange={(v) => setFormat(v as ImageSettings["format"])}
                disabled={busy}
                options={[
                  { value: "jpeg", label: "JPEG — smallest for photos, no transparency" },
                  { value: "png", label: "PNG — lossless, keeps transparency" },
                  { value: "webp", label: "WebP — small, keeps transparency" },
                  {
                    value: "avif",
                    label: avifOk === false ? "AVIF — not supported by this browser" : "AVIF — smallest, modern",
                    disabled: avifOk === false,
                  },
                ]}
              />
            </Field>
            <Field label={lossless ? "Quality — not used for lossless PNG" : "Quality"}>
              <SliderRow min={10} max={100} value={quality} onChange={setQuality} disabled={busy || lossless} valueLabel={`${quality}`} />
            </Field>
          </div>

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
            metaLine={(it) =>
              [
                it.meta.width && it.meta.height ? `${it.meta.width} × ${it.meta.height}` : null,
                (it.file.type || "image").replace("image/", "").toUpperCase() + " → " + format.toUpperCase(),
              ].filter(Boolean).join(" · ")
            }
            estimate={estimate}
          />

          <ActionBar
            processLabel={`Convert ${q.items.filter((i) => i.status !== "done").length || ""} image${q.items.length === 1 ? "" : "s"}`}
            onProcess={processAll}
            canProcess={q.items.some((i) => i.status === "ready" || i.status === "error")}
            busy={busy}
            doneCount={done.length}
            zipBusy={zipBusy}
            onZip={async () => {
              setZipBusy(true);
              try {
                await downloadZip(done.map((d) => ({ name: d.output!.name, blob: d.output!.blob })), "tinymedia-converted.zip");
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