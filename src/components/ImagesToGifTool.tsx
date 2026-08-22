import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, X, Download, Loader2, Wand2, GripVertical, Plus } from "lucide-react";
import { probeImage, formatBytes, downloadBlob, trackConversion, uid } from "@/lib/core";
import type { MediaMeta } from "@/lib/core";
import { ensureFFmpeg, subscribeLoadState, runFFmpeg } from "@/lib/ffmpegManager";
import type { LoadState } from "@/lib/ffmpegManager";
import { EncoderBanner, Field, Segmented, SliderRow } from "./Bits";
import { uploadResultToS3 } from "@/lib/uploadToS3";

const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const MAX_IMG = 40 * 1024 * 1024;
const MAX_IMAGES = 30;

type Size = "240" | "320" | "480" | "640";

interface ImgItem { id: string; file: File; url: string; meta: MediaMeta; }

function extOf(name: string, fallback: string): string {
  return name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? fallback;
}

export function ImagesToGifTool() {
  const [images, setImages] = useState<ImgItem[]>([]);
  const [secs, setSecs] = useState(0.7);   // seconds per image
  const [size, setSize] = useState<Size>("480");
  const [loop, setLoop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string; url: string } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });

  const imgInputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const unsub = subscribeLoadState(setLoadState);
    ensureFFmpeg().catch(() => {});
    return unsub;
  }, []);

  const clearResult = () => setResult((r) => { if (r) URL.revokeObjectURL(r.url); return null; });

  const addImages = async (files: FileList | File[]) => {
    const accepted: File[] = [];
    for (const f of Array.from(files)) {
      if (!IMG_TYPES.includes(f.type) && !IMG_EXT.test(f.name)) { setError(`${f.name}: use JPG, PNG, or WebP.`); continue; }
      if (f.size > MAX_IMG) { setError(`${f.name}: too large (limit ${formatBytes(MAX_IMG)}).`); continue; }
      accepted.push(f);
    }
    if (!accepted.length) return;
    setError(null);
    clearResult();
    const room = MAX_IMAGES - images.length;
    if (accepted.length > room) setError(`Up to ${MAX_IMAGES} images. Extra ones were ignored.`);
    const toAdd = accepted.slice(0, Math.max(0, room)).map((f) => ({ id: uid(), file: f, url: URL.createObjectURL(f), meta: {} as MediaMeta }));
    setImages((prev) => [...prev, ...toAdd]);
    for (const it of toAdd) probeImage(it.file).then((meta) => setImages((prev) => prev.map((x) => (x.id === it.id ? { ...x, meta } : x))));
  };

  const removeImage = (id: string) => {
    setImages((prev) => { const it = prev.find((x) => x.id === id); if (it) URL.revokeObjectURL(it.url); return prev.filter((x) => x.id !== id); });
    clearResult();
  };

  const reorder = (from: number, to: number) => {
    setImages((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next;
    });
    clearResult();
  };

  const make = async () => {
    if (images.length < 2) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    clearResult();
    try {
      await ensureFFmpeg();
      const dim = Number(size);
      const fps = 10; // internal render fps; per-image time set via -t on each input
      const inputs: { name: string; file: File | Blob }[] = [];
      const perArgs: string[] = [];
      const parts: string[] = [];
      let concatIns = "";
      images.forEach((im, i) => {
        const nm = `f${i}.${extOf(im.file.name, ".png").slice(1)}`;
        inputs.push({ name: nm, file: im.file });
        perArgs.push("-loop", "1", "-t", secs.toFixed(3), "-i", nm);
        parts.push(`[${i}:v]scale=${dim}:${dim}:force_original_aspect_ratio=decrease,pad=${dim}:${dim}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`);
        concatIns += `[v${i}]`;
      });
      // concat all, then split for palettegen + paletteuse in one graph.
      const filter =
        parts.join(";") +
        `;${concatIns}concat=n=${images.length}:v=1:a=0[s]` +
        `;[s]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer[out]`;

      const blob = await runFFmpeg({
        inputs,
        args: [
          ...perArgs,
          "-filter_complex", filter,
          "-map", "[out]",
          "-loop", loop ? "0" : "-1",
        ],
        outputName: "out.gif",
        outputType: "image/gif",
        onProgress: setProgress,
      });

      const name = "animation.gif";
      const url = URL.createObjectURL(blob);
      setResult({ blob, name, url });
      trackConversion("images-to-gif", { count: images.length, size });
      void uploadResultToS3(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the GIF.");
    } finally {
      setBusy(false);
    }
  };

  const encoderReady = loadState.phase === "ready";
  const canMake = images.length >= 2 && encoderReady && !busy;
  const totalSecs = images.length * secs;

  return (
    <section aria-label="Images to GIF">
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Turn a set of images into a looping animated GIF — like a flipbook or slideshow.
        Drag to set the order; each image shows for the same amount of time.
      </p>

      <EncoderBanner state={loadState} />

      <div className="mt-6">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Images {images.length > 0 && <span className="font-normal normal-case text-slate-400">({images.length}/{MAX_IMAGES})</span>}
        </p>

        {images.length > 0 && (
          <ul className="mb-2 divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {images.map((im, idx) => (
              <li key={im.id} draggable={!busy}
                onDragStart={() => { dragIndex.current = idx; }}
                onDragOver={(e) => { e.preventDefault(); setOverIndex(idx); }}
                onDragLeave={() => setOverIndex((o) => (o === idx ? null : o))}
                onDrop={(e) => { e.preventDefault(); if (dragIndex.current !== null) reorder(dragIndex.current, idx); dragIndex.current = null; setOverIndex(null); }}
                onDragEnd={() => { dragIndex.current = null; setOverIndex(null); }}
                className={["flex items-center gap-3 px-3 py-2.5", overIndex === idx ? "bg-accent/[0.05]" : ""].join(" ")}>
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300 dark:text-slate-600" />
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-slate-400">{idx + 1}</span>
                <img src={im.url} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{im.file.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{[im.meta.width && im.meta.height ? `${im.meta.width} × ${im.meta.height}` : null, formatBytes(im.file.size)].filter(Boolean).join(" · ")}</p>
                </div>
                <button onClick={() => removeImage(im.id)} disabled={busy} className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40 dark:text-slate-600 dark:hover:bg-slate-800" aria-label={`Remove ${im.file.name}`}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}

        <button onClick={() => !busy && imgInputRef.current?.click()} disabled={busy || images.length >= MAX_IMAGES}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50">
          {images.length === 0 ? <ImageIcon className="h-4 w-4 text-slate-400" strokeWidth={1.75} /> : <Plus className="h-4 w-4 text-slate-400" />}
          {images.length === 0 ? "Choose images (drag to reorder after adding)" : "Add more images"}
        </button>
        <input ref={imgInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) addImages(e.target.files); e.target.value = ""; }} />
      </div>

      {images.length > 0 && (
        <>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Field label={`Time per image · ${secs.toFixed(1)}s`}>
              <SliderRow min={0.2} max={3} step={0.1} value={secs} onChange={(v) => { setSecs(v); clearResult(); }} disabled={busy} valueLabel={`${secs.toFixed(1)}s`} />
            </Field>
            <Field label="Size">
              <Segmented<Size> value={size} onChange={(v) => { setSize(v); clearResult(); }} disabled={busy}
                options={[{ value: "240", label: "240" }, { value: "320", label: "320" }, { value: "480", label: "480" }, { value: "640", label: "640" }]} />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={loop} onChange={(e) => { setLoop(e.target.checked); clearResult(); }} disabled={busy}
              className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent/40" />
            Loop forever
          </label>

          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            {images.length} images · about {totalSecs.toFixed(1)}s per loop at {size}px square
          </p>

          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

          {busy && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Building GIF… {Math.round(progress * 100)}%</p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={make} disabled={!canMake}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {busy ? "Creating…" : "Create GIF"}
            </button>
            {!encoderReady && loadState.phase !== "error" && <span className="text-xs text-slate-400 dark:text-slate-500">Waiting for the encoder…</span>}
            {images.length < 2 && encoderReady && <span className="text-xs text-slate-400 dark:text-slate-500">Add at least two images.</span>}
          </div>

          {result && (
            <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">GIF ready · <span className="font-medium">{formatBytes(result.blob.size)}</span></p>
                <button onClick={() => downloadBlob(result.blob, result.name)} className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-accent hover:text-accent"><Download className="h-3.5 w-3.5" /> Download GIF</button>
              </div>
              <img src={result.url} alt="Generated GIF preview" className="mt-3 max-h-[360px] w-full rounded bg-black object-contain" />
            </div>
          )}
        </>
      )}
    </section>
  );
}
