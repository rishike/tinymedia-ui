import { useEffect, useMemo, useState } from "react";
import { useMediaQueue, sizeValidator } from "@/hooks/useMediaQueue";
import { probeAudio, formatDuration, formatBytes, downloadBlob, trackConversion } from "@/lib/core";
import type { MediaItem } from "@/lib/core";
import { ensureFFmpeg, subscribeLoadState, runFFmpeg } from "@/lib/ffmpegManager";
import type { LoadState } from "@/lib/ffmpegManager";
import { Download, Loader2 } from "lucide-react";
import { Dropzone } from "./Dropzone";
import { QueueList } from "./QueueList";
import { EncoderBanner, Field, NativeSelect, Notices } from "./Bits";
import { uploadResultToS3 } from "@/lib/uploadToS3";

const MAX_BYTES = 200 * 1024 * 1024;
const AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/ogg"];
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg)$/i;

type Fmt = "mp3" | "aac" | "ogg" | "wav";
const OUT: Record<Fmt, { codec: string; ext: string; mime: string; bitrate: boolean }> = {
  mp3: { codec: "libmp3lame", ext: "mp3", mime: "audio/mpeg", bitrate: true },
  aac: { codec: "aac", ext: "m4a", mime: "audio/mp4", bitrate: true },
  ogg: { codec: "libvorbis", ext: "ogg", mime: "audio/ogg", bitrate: true },
  wav: { codec: "pcm_s16le", ext: "wav", mime: "audio/wav", bitrate: false },
};

function extOf(name: string, fallback: string): string {
  return name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? fallback;
}

export function MergeAudioTool() {
  const q = useMediaQueue({
    validate: sizeValidator(
      MAX_BYTES,
      (f) => AUDIO_TYPES.includes(f.type) || AUDIO_EXT.test(f.name),
      "unsupported format (use MP3, WAV, M4A, AAC, or OGG)"
    ),
    probe: probeAudio,
  });
  const [fmt, setFmt] = useState<Fmt>("mp3");
  const [bitrate, setBitrate] = useState(192);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string; url: string } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });

  useEffect(() => {
    const unsub = subscribeLoadState(setLoadState);
    ensureFFmpeg().catch(() => {});
    return unsub;
  }, []);

  const clearResult = () => setResult((r) => { if (r) URL.revokeObjectURL(r.url); return null; });

  const totalDuration = useMemo(
    () => q.items.reduce((s, i) => s + (i.meta.duration ?? 0), 0),
    [q.items]
  );

  const merge = async () => {
    if (q.items.length < 2) return;
    setBusy(true);
    setError(null);
    clearResult();
    try {
      await ensureFFmpeg();
      const conf = OUT[fmt];

      // Write each input under a distinct name; build a concat-filter graph.
      // The concat FILTER (not the demuxer) decodes every input first, so
      // mismatched formats/bitrates/sample-rates merge cleanly.
      const inputs = q.items.map((it, i) => ({
        name: `in${i}${extOf(it.file.name, ".mp3")}`,
        file: it.file,
      }));
      const inArgs: string[] = [];
      let labels = "";
      inputs.forEach((inp, i) => {
        inArgs.push("-i", inp.name);
        labels += `[${i}:a]`;
      });
      const filter = `${labels}concat=n=${inputs.length}:v=0:a=1[out]`;

      const codecArgs = conf.bitrate
        ? ["-c:a", conf.codec, "-b:a", `${bitrate}k`]
        : ["-c:a", conf.codec];

      const blob = await runFFmpeg({
        inputs,
        args: [
          ...inArgs,
          "-filter_complex", filter,
          "-map", "[out]",
          ...codecArgs,
        ],
        outputName: `merged.${conf.ext}`,
        outputType: conf.mime,
        onProgress: () => {},
      });

      const name = `merged-audio.${conf.ext}`;
      const url = URL.createObjectURL(blob);
      setResult({ blob, name, url });
      trackConversion("merge-audio", { format: fmt, count: q.items.length });
      void uploadResultToS3(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't merge these audio files.");
    } finally {
      setBusy(false);
    }
  };

  const encoderReady = loadState.phase === "ready";
  const canMerge = q.items.length >= 2 && encoderReady && !busy;

  return (
    <section aria-label="Merge audio">
      <Dropzone
        accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
        multiple
        onFiles={(f) => { q.addFiles(f); clearResult(); }}
        hint="MP3, WAV, M4A, AAC, or OGG · they'll be joined in the order below"
        compact={q.items.length > 0}
      />
      <Notices notices={q.notices} />
      <EncoderBanner state={loadState} />

      {q.items.length > 0 && (
        <>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <Field label="Output format">
              <NativeSelect
                value={fmt}
                onChange={(v) => { setFmt(v as Fmt); clearResult(); }}
                disabled={busy}
                options={[
                  { value: "mp3", label: "MP3" },
                  { value: "aac", label: "AAC (M4A)" },
                  { value: "ogg", label: "OGG" },
                  { value: "wav", label: "WAV (uncompressed)" },
                ]}
              />
            </Field>
            {OUT[fmt].bitrate ? (
              <Field label="Bitrate">
                <NativeSelect
                  value={String(bitrate)}
                  onChange={(v) => { setBitrate(Number(v)); clearResult(); }}
                  disabled={busy}
                  options={[320, 256, 192, 128, 96].map((b) => ({ value: String(b), label: `${b} kbps${b === 192 ? " · good default" : ""}` }))}
                />
              </Field>
            ) : (
              <Field label="Bitrate">
                <p className="py-1.5 text-sm text-slate-500 dark:text-slate-400">WAV is uncompressed — no bitrate to choose.</p>
              </Field>
            )}
          </div>

          {totalDuration > 0 && (
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              {q.items.length} files · total length ≈ {formatDuration(totalDuration)}
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
              [it.meta.duration ? formatDuration(it.meta.duration) : null, it.file.type || "audio"].filter(Boolean).join(" · ")
            }
            estimate={() => null}
          />

          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={merge}
              disabled={!canMerge}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {busy ? "Merging…" : `Merge ${q.items.length} files`}
            </button>
            {!encoderReady && loadState.phase !== "error" && (
              <span className="text-xs text-slate-400 dark:text-slate-500">Waiting for the encoder…</span>
            )}
            {q.items.length < 2 && encoderReady && (
              <span className="text-xs text-slate-400 dark:text-slate-500">Add at least two audio files.</span>
            )}
          </div>

          {result && (
            <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  Merged · <span className="font-medium">{formatBytes(result.blob.size)}</span>
                </p>
                <button
                  onClick={() => downloadBlob(result.blob, result.name)}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-accent hover:text-accent"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
              <audio src={result.url} controls className="mt-3 w-full" />
            </div>
          )}
        </>
      )}
    </section>
  );
}