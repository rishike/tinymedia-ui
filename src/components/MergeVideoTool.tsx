import { useEffect, useMemo, useState } from "react";
import { useMediaQueue, sizeValidator } from "@/hooks/useMediaQueue";
import { probeVideo, formatDuration, formatBytes, downloadBlob, trackConversion } from "@/lib/core";
import type { MediaItem } from "@/lib/core";
import { ensureFFmpeg, subscribeLoadState, runFFmpeg } from "@/lib/ffmpegManager";
import type { LoadState } from "@/lib/ffmpegManager";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import { Dropzone } from "./Dropzone";
import { QueueList } from "./QueueList";
import { EncoderBanner, Field, Segmented, Notices } from "./Bits";
import { uploadResultToS3 } from "@/lib/uploadToS3";

// Video re-encoding in the browser is heavy and single-threaded. These caps
// are deliberately conservative to avoid crashing the tab — this is NOT the
// same low-risk operation as merging audio.
const MAX_BYTES = 150 * 1024 * 1024;      // per file
const MAX_TOTAL_BYTES = 400 * 1024 * 1024; // combined
const MAX_FILES = 6;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

type Res = "720" | "480" | "1080";
const RES_DIMS: Record<Res, { w: number; h: number }> = {
  "1080": { w: 1920, h: 1080 },
  "720": { w: 1280, h: 720 },
  "480": { w: 854, h: 480 },
};

function extOf(name: string, fallback: string): string {
  return name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? fallback;
}

export function MergeVideoTool() {
  const q = useMediaQueue({
    validate: sizeValidator(
      MAX_BYTES,
      (f) => VIDEO_TYPES.includes(f.type) || VIDEO_EXT.test(f.name),
      "unsupported format (use MP4, WebM, or MOV)"
    ),
    probe: probeVideo,
  });
  const [res, setRes] = useState<Res>("720");
  const [busy, setBusy] = useState(false);
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

  const totals = useMemo(() => {
    const bytes = q.items.reduce((s, i) => s + i.file.size, 0);
    const duration = q.items.reduce((s, i) => s + (i.meta.duration ?? 0), 0);
    return { bytes, duration };
  }, [q.items]);

  const overTotal = totals.bytes > MAX_TOTAL_BYTES;
  const tooMany = q.items.length > MAX_FILES;

  const merge = async () => {
    if (q.items.length < 2 || overTotal || tooMany) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    clearResult();
    try {
      await ensureFFmpeg();
      const { w, h } = RES_DIMS[res];

      // Re-encode every clip to the same size/fps, then concat both video and
      // audio streams. This is the ROBUST path: unlike -c copy, it handles
      // clips with different resolutions, codecs, and framerates without
      // producing a broken file. The cost is a full re-encode of every clip.
      const inputs = q.items.map((it, i) => ({ name: `in${i}${extOf(it.file.name, ".mp4")}`, file: it.file }));
      const inArgs: string[] = [];
      const vParts: string[] = [];
      let vConcat = "";
      let aConcat = "";
      inputs.forEach((inp, i) => {
        inArgs.push("-i", inp.name);
        vParts.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`);
        vConcat += `[v${i}]`;
        aConcat += `[${i}:a]`;
      });
      const filter =
        vParts.join(";") +
        `;${vConcat}concat=n=${inputs.length}:v=1:a=0[v]` +
        `;${aConcat}concat=n=${inputs.length}:v=0:a=1[a]`;

      const blob = await runFFmpeg({
        inputs,
        args: [
          ...inArgs,
          "-filter_complex", filter,
          "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
          "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        ],
        outputName: "merged.mp4",
        outputType: "video/mp4",
        onProgress: setProgress,
      });

      const name = "merged-video.mp4";
      const url = URL.createObjectURL(blob);
      setResult({ blob, name, url });
      trackConversion("merge-video", { resolution: res, count: q.items.length });
      void uploadResultToS3(blob, name);
    } catch (e) {
      // The most likely real failure is running out of memory on large inputs.
      const msg = e instanceof Error ? e.message : "Couldn't merge these videos.";
      setError(
        /memory|allocat|abort/i.test(msg)
          ? "The browser ran out of memory merging these videos. Try fewer or smaller clips, or a lower resolution."
          : msg
      );
    } finally {
      setBusy(false);
    }
  };

  const encoderReady = loadState.phase === "ready";
  const canMerge = q.items.length >= 2 && encoderReady && !busy && !overTotal && !tooMany;

  return (
    <section aria-label="Merge video">
      <Dropzone
        accept=".mp4,.webm,.mov,.m4v,video/mp4,video/webm,video/quicktime"
        multiple
        onFiles={(f) => { q.addFiles(f); clearResult(); }}
        hint={`MP4, WebM, or MOV · up to ${MAX_FILES} clips · joined in the order below`}
        compact={q.items.length > 0}
      />
      <Notices notices={q.notices} />
      <EncoderBanner state={loadState} />

      {/* Upfront honesty about the cost — video merge is heavy in-browser. */}
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Merging video re-encodes every clip in your browser, which is slow and memory-hungry.
          Keep clips short and few, and prefer 720p or 480p. Large files may be slow or fail —
          that's a limit of in-browser processing, not your files.
        </span>
      </div>

      {q.items.length > 0 && (
        <>
          <div className="mt-6">
            <Field label="Output resolution">
              <Segmented<Res>
                value={res}
                onChange={(v) => { setRes(v); clearResult(); }}
                disabled={busy}
                options={[
                  { value: "480", label: "480p · fastest" },
                  { value: "720", label: "720p" },
                  { value: "1080", label: "1080p · slowest" },
                ]}
              />
            </Field>
          </div>

          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            {q.items.length} clips · total {formatBytes(totals.bytes)}
            {totals.duration > 0 ? ` · ≈ ${formatDuration(totals.duration)}` : ""}
          </p>
          {overTotal && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Combined size exceeds {formatBytes(MAX_TOTAL_BYTES)}. Remove some clips or use smaller files.
            </p>
          )}
          {tooMany && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Up to {MAX_FILES} clips at a time.
            </p>
          )}

          <QueueList
            items={q.items}
            onReorder={(a, b) => { q.reorder(a, b); clearResult(); }}
            onToggleSelect={q.toggleSelect}
            onSelectAll={q.selectAll}
            onRemove={(id) => { q.remove(id); clearResult(); }}
            onRemoveSelected={() => { q.removeSelected(); clearResult(); }}
            onClear={() => { q.clear(); clearResult(); }}
            busy={busy}
            metaLine={(it: MediaItem) =>
              [
                it.meta.width && it.meta.height ? `${it.meta.width} × ${it.meta.height}` : null,
                it.meta.duration ? formatDuration(it.meta.duration) : null,
                formatBytes(it.file.size),
              ].filter(Boolean).join(" · ")
            }
            estimate={() => null}
          />

          {busy && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Merging… {Math.round(progress * 100)}% — re-encoding can take a while, please keep this tab open.
              </p>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={merge}
              disabled={!canMerge}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {busy ? "Merging…" : `Merge ${q.items.length} videos`}
            </button>
            {!encoderReady && loadState.phase !== "error" && (
              <span className="text-xs text-slate-400 dark:text-slate-500">Waiting for the encoder…</span>
            )}
            {q.items.length < 2 && encoderReady && (
              <span className="text-xs text-slate-400 dark:text-slate-500">Add at least two videos.</span>
            )}
          </div>

          {result && (
            <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  Merged · <span className="font-medium">{formatBytes(result.blob.size)}</span> · {RES_DIMS[res].w} × {RES_DIMS[res].h}
                </p>
                <button
                  onClick={() => downloadBlob(result.blob, result.name)}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-accent hover:text-accent"
                >
                  <Download className="h-3.5 w-3.5" /> Download MP4
                </button>
              </div>
              <video src={result.url} controls className="mt-3 max-h-[360px] w-full rounded bg-black" />
            </div>
          )}
        </>
      )}
    </section>
  );
}