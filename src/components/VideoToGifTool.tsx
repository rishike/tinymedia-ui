import { useEffect, useState } from "react";
import { Film, X, Download, Loader2, Wand2 } from "lucide-react";
import { probeVideo, formatBytes, formatDuration, downloadBlob, replaceExt, trackConversion } from "@/lib/core";
import type { MediaMeta } from "@/lib/core";
import { ensureFFmpeg, subscribeLoadState, runFFmpeg } from "@/lib/ffmpegManager";
import type { LoadState } from "@/lib/ffmpegManager";
import { EncoderBanner, Field, Segmented, SliderRow } from "./Bits";
import { uploadResultToS3 } from "@/lib/uploadToS3";

const MAX_BYTES = 200 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const MAX_GIF_SECONDS = 30; // GIFs balloon fast; cap the slice length

type Width = "240" | "320" | "480" | "640";

interface Picked { file: File; url: string; meta: MediaMeta; }

function clampNum(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

export function VideoToGifTool() {
  const [video, setVideo] = useState<Picked | null>(null);
  const [start, setStart] = useState(0);
  const [duration, setDuration] = useState(4);
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState<Width>("480");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"" | "palette" | "render">("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string; url: string } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });

  useEffect(() => {
    const unsub = subscribeLoadState(setLoadState);
    ensureFFmpeg().catch(() => {});
    return unsub;
  }, []);

  const clearResult = () => setResult((r) => { if (r) URL.revokeObjectURL(r.url); return null; });

  const pick = async (f: File) => {
    if (!VIDEO_TYPES.includes(f.type) && !VIDEO_EXT.test(f.name)) { setError("Video must be MP4, WebM, or MOV."); return; }
    if (f.size > MAX_BYTES) { setError(`Video is too large (limit ${formatBytes(MAX_BYTES)}).`); return; }
    setError(null);
    clearResult();
    if (video) URL.revokeObjectURL(video.url);
    const meta = await probeVideo(f);
    setVideo({ file: f, url: URL.createObjectURL(f), meta });
    // sensible defaults from the clip
    const dur = meta.duration && isFinite(meta.duration) ? meta.duration : 4;
    setStart(0);
    setDuration(Math.min(4, Math.round(dur)));
  };

  const clipDur = video?.meta.duration && isFinite(video.meta.duration) ? video.meta.duration : null;
  const effDuration = clipDur ? clampNum(duration, 0.5, Math.min(MAX_GIF_SECONDS, clipDur - start)) : duration;

  // Rough size estimate: frames × pixels × ~per-pixel GIF cost. Very approximate,
  // but enough to warn before someone makes a 100 MB GIF.
  const estBytes = (() => {
    const w = Number(width);
    const h = clipDur && video?.meta.width && video.meta.height ? Math.round((w * video.meta.height) / video.meta.width) : w * 0.5625;
    const frames = fps * effDuration;
    return Math.round(frames * w * h * 0.12);
  })();

  const make = async () => {
    if (!video) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    clearResult();
    try {
      await ensureFFmpeg();
      const inExt = video.file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ".mp4";
      const vf = `fps=${fps},scale=${width}:-1:flags=lanczos`;

      // Pass 1 — generate an optimal color palette from the selected slice.
      setPhase("palette");
      const palette = await runFFmpeg({
        inputs: [{ name: `in${inExt}`, file: video.file }],
        args: [
          "-ss", String(start), "-t", String(effDuration),
          "-i", `in${inExt}`,
          "-vf", `${vf},palettegen`,
        ],
        outputName: "palette.png",
        outputType: "image/png",
        onProgress: (p) => setProgress(p * 0.4),
      });

      // Pass 2 — render the GIF using that palette (much better quality/size).
      setPhase("render");
      const blob = await runFFmpeg({
        inputs: [
          { name: `in${inExt}`, file: video.file },
          { name: "palette.png", file: palette },
        ],
        args: [
          "-ss", String(start), "-t", String(effDuration),
          "-i", `in${inExt}`,
          "-i", "palette.png",
          "-lavfi", `${vf}[x];[x][1:v]paletteuse`,
        ],
        outputName: "out.gif",
        outputType: "image/gif",
        onProgress: (p) => setProgress(0.4 + p * 0.6),
      });

      const name = replaceExt(video.file.name, "gif");
      const url = URL.createObjectURL(blob);
      setResult({ blob, name, url });
      trackConversion("video-to-gif", { fps, width });
      void uploadResultToS3(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the GIF.");
    } finally {
      setBusy(false);
      setPhase("");
    }
  };

  const encoderReady = loadState.phase === "ready";
  const canMake = !!video && encoderReady && !busy && effDuration >= 0.5;

  return (
    <section aria-label="Video to GIF">
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Turn a clip (or part of one) into an animated GIF. Uses a two-pass palette
        for clean colors. Tip: GIFs get large quickly — keep it short and modest in
        size and frame rate.
      </p>

      <EncoderBanner state={loadState} />

      <div className="mt-6">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Video</p>
        {video ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-700"><Film className="h-5 w-5 text-slate-400" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{video.file.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {[video.meta.width && video.meta.height ? `${video.meta.width} × ${video.meta.height}` : null, video.meta.duration ? formatDuration(video.meta.duration) : null, formatBytes(video.file.size)].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button onClick={() => { URL.revokeObjectURL(video.url); setVideo(null); clearResult(); }} disabled={busy} className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40 dark:text-slate-600 dark:hover:bg-slate-800" aria-label="Remove video"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <label className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40 px-4 py-4 transition-colors hover:border-accent">
            <Film className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.75} />
            <span className="text-sm text-slate-800 dark:text-slate-100">Choose a video (MP4, WebM, or MOV)</span>
            <input type="file" accept=".mp4,.webm,.mov,.m4v,video/mp4,video/webm,video/quicktime" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) pick(e.target.files[0]); e.target.value = ""; }} />
          </label>
        )}
      </div>

      {video && (
        <>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {clipDur && (
              <Field label={`Start · ${formatDuration(start)}`}>
                <SliderRow min={0} max={Math.max(0, Math.floor(clipDur - 0.5))} value={start}
                  onChange={(v) => { setStart(v); clearResult(); }} disabled={busy} valueLabel={`${start}s`} />
              </Field>
            )}
            <Field label={`Duration · ${effDuration.toFixed(1)}s`}>
              <SliderRow min={1} max={clipDur ? Math.min(MAX_GIF_SECONDS, Math.ceil(clipDur - start)) : MAX_GIF_SECONDS}
                value={Math.round(effDuration)} onChange={(v) => { setDuration(v); clearResult(); }} disabled={busy} valueLabel={`${Math.round(effDuration)}s`} />
            </Field>
            <Field label="Frame rate">
              <SliderRow min={5} max={24} value={fps} onChange={(v) => { setFps(v); clearResult(); }} disabled={busy} valueLabel={`${fps} fps`} />
            </Field>
            <Field label="Width">
              <Segmented<Width> value={width} onChange={(v) => { setWidth(v); clearResult(); }} disabled={busy}
                options={[{ value: "240", label: "240" }, { value: "320", label: "320" }, { value: "480", label: "480" }, { value: "640", label: "640" }]} />
            </Field>
          </div>

          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Estimated size ≈ {formatBytes(estBytes)} · {Math.round(fps * effDuration)} frames at {width}px wide
          </p>
          {estBytes > 15 * 1024 * 1024 && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              That's a big GIF. Lower the frame rate, width, or duration for a smaller file.
            </p>
          )}

          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

          {busy && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {phase === "palette" ? "Analyzing colors…" : "Rendering GIF…"} {Math.round(progress * 100)}%
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={make} disabled={!canMake}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {busy ? "Creating…" : "Create GIF"}
            </button>
            {!encoderReady && loadState.phase !== "error" && <span className="text-xs text-slate-400 dark:text-slate-500">Waiting for the encoder…</span>}
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
