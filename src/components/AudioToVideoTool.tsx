import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Music, X, Download, Loader2, Film, GripVertical, Plus } from "lucide-react";
import { probeAudio, probeImage, formatBytes, formatDuration, downloadBlob, replaceExt, trackConversion, uid } from "@/lib/core";
import type { MediaMeta } from "@/lib/core";
import { ensureFFmpeg, subscribeLoadState, runFFmpeg } from "@/lib/ffmpegManager";
import type { LoadState } from "@/lib/ffmpegManager";
import { EncoderBanner, Field, Segmented } from "./Bits";
import { uploadResultToS3 } from "@/lib/uploadToS3";

const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/ogg"];
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg)$/i;
const MAX_IMG = 40 * 1024 * 1024;
const MAX_AUDIO = 200 * 1024 * 1024;
const MAX_IMAGES = 20;

type Res = "1080" | "720" | "480";
const RES_DIMS: Record<Res, { w: number; h: number }> = {
  "1080": { w: 1920, h: 1080 },
  "720": { w: 1280, h: 720 },
  "480": { w: 854, h: 480 },
};

interface ImgItem { id: string; file: File; url: string; meta: MediaMeta; }
interface AudioItem { file: File; url: string; meta: MediaMeta; }

function extOf(name: string, fallback: string): string {
  return name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? fallback;
}

export function AudioToVideoTool() {
  const [images, setImages] = useState<ImgItem[]>([]);
  const [audio, setAudio] = useState<AudioItem | null>(null);
  const [res, setRes] = useState<Res>("1080");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string; url: string } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });

  const imgInputRef = useRef<HTMLInputElement>(null);
  const audInputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const unsub = subscribeLoadState(setLoadState);
    ensureFFmpeg().catch(() => {});
    return unsub;
  }, []);

  const clearResult = () => setResult((r) => { if (r) URL.revokeObjectURL(r.url); return null; });

  const addImages = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const accepted: File[] = [];
    for (const f of list) {
      if (!IMG_TYPES.includes(f.type) && !IMG_EXT.test(f.name)) { setError(`${f.name}: image must be JPG, PNG, or WebP.`); continue; }
      if (f.size > MAX_IMG) { setError(`${f.name}: too large (limit ${formatBytes(MAX_IMG)}).`); continue; }
      accepted.push(f);
    }
    if (!accepted.length) return;
    setError(null);
    clearResult();
    const room = MAX_IMAGES - images.length;
    if (accepted.length > room) setError(`You can add up to ${MAX_IMAGES} images. Extra images were ignored.`);
    const toAdd = accepted.slice(0, Math.max(0, room)).map((f) => ({ id: uid(), file: f, url: URL.createObjectURL(f), meta: {} as MediaMeta }));
    setImages((prev) => [...prev, ...toAdd]);
    for (const it of toAdd) {
      probeImage(it.file).then((meta) => setImages((prev) => prev.map((x) => (x.id === it.id ? { ...x, meta } : x))));
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) URL.revokeObjectURL(it.url);
      return prev.filter((x) => x.id !== id);
    });
    clearResult();
  };

  const reorder = (from: number, to: number) => {
    setImages((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    clearResult();
  };

  const pickAudio = async (f: File) => {
    if (!AUDIO_TYPES.includes(f.type) && !AUDIO_EXT.test(f.name)) { setError("Audio must be MP3, WAV, M4A, or AAC."); return; }
    if (f.size > MAX_AUDIO) { setError(`Audio is too large (limit ${formatBytes(MAX_AUDIO)}).`); return; }
    setError(null);
    clearResult();
    if (audio) URL.revokeObjectURL(audio.url);
    const meta = await probeAudio(f);
    setAudio({ file: f, url: URL.createObjectURL(f), meta });
  };

  const perImageSeconds = (): number | null => {
    if (!audio?.meta.duration || !isFinite(audio.meta.duration) || images.length === 0) return null;
    return audio.meta.duration / images.length;
  };

  const finishOk = (blob: Blob, outName: string) => {
    const url = URL.createObjectURL(blob);
    setResult({ blob, name: outName, url });
    trackConversion("audio-to-video", { resolution: res, images: images.length });
    void uploadResultToS3(blob, outName);
  };

  const make = async () => {
    if (images.length === 0 || !audio) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    clearResult();
    try {
      await ensureFFmpeg();
      const { w, h } = RES_DIMS[res];
      const dur = audio.meta.duration && isFinite(audio.meta.duration) ? audio.meta.duration : null;
      const audExt = extOf(audio.file.name, ".mp3");
      const outName = replaceExt(audio.file.name, "mp4");

      if (images.length === 1) {
        const imgExt = extOf(images[0].file.name, ".png");
        const blob = await runFFmpeg({
          inputs: [
            { name: `img${imgExt}`, file: images[0].file },
            { name: `aud${audExt}`, file: audio.file },
          ],
          args: [
            "-loop", "1", "-i", `img${imgExt}`, "-i", `aud${audExt}`,
            "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
            "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "2",
            "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
          ],
          outputName: "out.mp4", outputType: "video/mp4", onProgress: setProgress,
        });
        finishOk(blob, outName);
        return;
      }

      const per = dur ? dur / images.length : 4;
      const { w: vw, h: vh } = RES_DIMS[res];

      // Build a filter_complex that loops each image for `per` seconds, scales +
      // pads each to the same canvas, then concatenates them in order. This is
      // more reliable than the concat demuxer (which drops per-image durations
      // when combined with fps filtering) and stays cheap because fps=2 keeps
      // the total frame count tiny.
      const inputs: { name: string; file: File | Blob }[] = [];
      const perImageArgs: string[] = [];
      const filterParts: string[] = [];
      let concatIns = "";
      images.forEach((im, i) => {
        const nm = `img${i}.${extOf(im.file.name, ".png").slice(1)}`;
        inputs.push({ name: nm, file: im.file });
        // each image is its own -loop 1 -t <per> -i input
        perImageArgs.push("-loop", "1", "-t", per.toFixed(3), "-i", nm);
        filterParts.push(
          `[${i}:v]scale=${vw}:${vh}:force_original_aspect_ratio=decrease,pad=${vw}:${vh}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=2[v${i}]`
        );
        concatIns += `[v${i}]`;
      });
      const audioIndex = images.length; // audio is the input after all images
      inputs.push({ name: `aud${audExt}`, file: audio.file });

      const filterComplex =
        filterParts.join(";") +
        `;${concatIns}concat=n=${images.length}:v=1:a=0,format=yuv420p[v]`;

      const blob = await runFFmpeg({
        inputs,
        args: [
          ...perImageArgs,
          "-i", `aud${audExt}`,
          "-filter_complex", filterComplex,
          "-map", "[v]",
          "-map", `${audioIndex}:a`,
          "-c:v", "libx264", "-tune", "stillimage",
          "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
        ],
        outputName: "out.mp4", outputType: "video/mp4", onProgress: setProgress,
      });
      finishOk(blob, outName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the video.");
    } finally {
      setBusy(false);
    }
  };

  const encoderReady = loadState.phase === "ready";
  const canMake = images.length > 0 && !!audio && encoderReady && !busy;
  const per = perImageSeconds();

  return (
    <section aria-label="Audio to video">
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Turn a track into a video by pairing it with one or more still images — ideal for
        music, bhajans, or podcasts you want to upload to YouTube. With several images, each
        is shown for an equal share of the audio, in the order below.
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
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {[im.meta.width && im.meta.height ? `${im.meta.width} × ${im.meta.height}` : null, formatBytes(im.file.size), per ? `shows ~${per < 1 ? per.toFixed(1) : Math.round(per)}s` : null].filter(Boolean).join(" · ")}
                  </p>
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

      <div className="mt-5">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Audio</p>
        {audio ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-700"><Music className="h-5 w-5 text-slate-400" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{audio.file.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{[audio.meta.duration ? formatDuration(audio.meta.duration) : null, formatBytes(audio.file.size)].filter(Boolean).join(" · ")}</p>
            </div>
            <button onClick={() => { URL.revokeObjectURL(audio.url); setAudio(null); clearResult(); }} disabled={busy} className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40 dark:text-slate-600 dark:hover:bg-slate-800" aria-label="Remove audio"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button onClick={() => !busy && audInputRef.current?.click()} disabled={busy} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40 px-4 py-4 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50">
            <Music className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.75} />
            <span className="text-sm text-slate-800 dark:text-slate-100">Choose an audio track</span>
          </button>
        )}
        <input ref={audInputRef} type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) pickAudio(e.target.files[0]); e.target.value = ""; }} />
      </div>

      <div className="mt-5">
        <Field label="Resolution">
          <Segmented<Res> value={res} onChange={(v) => { setRes(v); clearResult(); }} disabled={busy}
            options={[{ value: "1080", label: "1080p" }, { value: "720", label: "720p" }, { value: "480", label: "480p" }]} />
        </Field>
      </div>

      {images.length > 1 && per && (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          {images.length} images over {formatDuration(audio?.meta.duration)} — each shows for about {per < 1 ? per.toFixed(1) : Math.round(per)} seconds.
        </p>
      )}
      {images.length > 6 && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Many images at 1080p can take a while to encode in the browser. If it's slow, try 720p.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {busy && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Encoding… {Math.round(progress * 100)}%</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={make} disabled={!canMake}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
          {busy ? "Creating…" : "Create video"}
        </button>
        {!encoderReady && loadState.phase !== "error" && <span className="text-xs text-slate-400 dark:text-slate-500">Waiting for the encoder…</span>}
        {(images.length === 0 || !audio) && encoderReady && <span className="text-xs text-slate-400 dark:text-slate-500">Add at least one image and an audio file.</span>}
      </div>

      {result && (
        <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">Video ready · <span className="font-medium">{formatBytes(result.blob.size)}</span> · {RES_DIMS[res].w} × {RES_DIMS[res].h}</p>
            <button onClick={() => downloadBlob(result.blob, result.name)} className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-accent hover:text-accent"><Download className="h-3.5 w-3.5" /> Download MP4</button>
          </div>
          <video src={result.url} controls className="mt-3 max-h-[360px] w-full rounded bg-black" />
        </div>
      )}
    </section>
  );
}