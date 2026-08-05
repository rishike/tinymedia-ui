import { useEffect, useMemo, useState } from "react";
import { useMediaQueue, sizeValidator } from "@/hooks/useMediaQueue";
import { probeVideo, formatDuration, replaceExt, downloadZip } from "@/lib/core";
import type { MediaItem } from "@/lib/core";
import { ensureFFmpeg, subscribeLoadState, transcode } from "@/lib/ffmpegManager";
import type { LoadState } from "@/lib/ffmpegManager";
import { Dropzone } from "./Dropzone";
import { QueueList } from "./QueueList";
import { ActionBar, EncoderBanner, Field, NativeSelect, Notices, Segmented, TotalsRow } from "./Bits";

const MAX_BYTES = 800 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

type Fmt = "mp3" | "aac" | "ogg" | "wav";

const codecFor: Record<Fmt, { args: (kbps: number) => string[]; ext: string; mime: string }> = {
  mp3: { args: (k) => ["-c:a", "libmp3lame", "-b:a", `${k}k`], ext: "mp3", mime: "audio/mpeg" },
  aac: { args: (k) => ["-c:a", "aac", "-b:a", `${k}k`], ext: "m4a", mime: "audio/mp4" },
  ogg: { args: (k) => ["-c:a", "libvorbis", "-b:a", `${k}k`], ext: "ogg", mime: "audio/ogg" },
  wav: { args: () => ["-c:a", "pcm_s16le"], ext: "wav", mime: "audio/wav" },
};

export function VideoToAudioTool() {
  const q = useMediaQueue({
    validate: sizeValidator(
      MAX_BYTES,
      (f) => VIDEO_TYPES.includes(f.type) || VIDEO_EXT.test(f.name),
      "unsupported format (use MP4, WebM, or MOV)"
    ),
    probe: probeVideo,
  });
  const [fmt, setFmt] = useState<Fmt>("mp3");
  const [bitrate, setBitrate] = useState(192);
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });

  useEffect(() => {
    const unsub = subscribeLoadState(setLoadState);
    ensureFFmpeg().catch(() => {});
    return unsub;
  }, []);

  const estimate = (it: MediaItem): number | null => {
    const d = it.meta.duration;
    if (!d || !isFinite(d)) return null;
    if (fmt === "wav") return Math.round(d * 44100 * 2 * 2) + 4096; // 16-bit stereo
    return Math.round((bitrate * 1000 * d) / 8) + 4096;
  };

  const processAll = async () => {
    setBusy(true);
    try {
      await ensureFFmpeg();
    } catch {
      setBusy(false);
      return;
    }
    const { args, ext, mime } = codecFor[fmt];
    for (const it of q.items.filter((i) => i.status === "ready" || i.status === "error")) {
      q.patch(it.id, { status: "processing", progress: 0, error: undefined });
      try {
        const inExt = it.file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ".mp4";
        const blob = await transcode({
          input: it.file,
          inputName: `in-${it.id}${inExt}`,
          outputName: `out-${it.id}.${ext}`,
          args: ["-vn", ...args(bitrate)],
          onProgress: (p) => q.patch(it.id, { progress: p }),
        });
        q.patch(it.id, {
          status: "done",
          progress: 1,
          output: { blob: new Blob([blob], { type: mime }), name: replaceExt(it.file.name, ext) },
        });
      } catch (e) {
        q.patch(it.id, {
          status: "error",
          error:
            e instanceof Error
              ? e.message === "Encoding failed — the file may be corrupt or use an unsupported codec."
                ? "Couldn't extract audio — the video may have no audio track or an unsupported codec."
                : e.message
              : "Extraction failed.",
        });
      }
    }
    setBusy(false);
  };

  const done = q.items.filter((i) => i.status === "done" && i.output);
  const totals = useMemo(() => {
    const orig = q.items.reduce((s, i) => s + i.file.size, 0);
    const allDone = q.items.length > 0 && q.items.every((i) => i.status === "done" && i.output);
    const est = q.items.reduce((s, i) => s + (i.output ? i.output.blob.size : estimate(i) ?? i.file.size), 0);
    return { orig, est: q.items.some((i) => i.meta.duration || i.output) ? est : null, allDone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.items, fmt, bitrate]);

  const encoderReady = loadState.phase === "ready";

  return (
    <section aria-label="Video to audio converter">
      <Dropzone
        accept=".mp4,.webm,.mov,.m4v,video/mp4,video/webm,video/quicktime"
        onFiles={q.addFiles}
        hint="MP4, WebM, or MOV · up to 800 MB each · audio track only is kept"
        compact={q.items.length > 0}
      />
      <Notices notices={q.notices} />
      <EncoderBanner state={loadState} />

      {q.items.length > 0 && (
        <>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <Field label="Audio format">
              <Segmented<Fmt>
                value={fmt}
                onChange={setFmt}
                disabled={busy}
                options={[
                  { value: "mp3", label: "MP3" },
                  { value: "aac", label: "AAC" },
                  { value: "ogg", label: "OGG" },
                  { value: "wav", label: "WAV" },
                ]}
              />
            </Field>
            {fmt !== "wav" ? (
              <Field label="Bitrate">
                <NativeSelect
                  value={String(bitrate)}
                  onChange={(v) => setBitrate(Number(v))}
                  disabled={busy}
                  options={[320, 256, 192, 128, 96].map((b) => ({
                    value: String(b),
                    label: `${b} kbps${b === 192 ? " · good default" : ""}`,
                  }))}
                />
              </Field>
            ) : (
              <Field label="Bitrate">
                <p className="py-1.5 text-sm text-slate-500 dark:text-slate-400">WAV is uncompressed — no bitrate to choose.</p>
              </Field>
            )}
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
            metaLine={(it) =>
              [
                it.meta.width && it.meta.height ? `${it.meta.width} × ${it.meta.height}` : null,
                it.meta.duration ? formatDuration(it.meta.duration) : null,
                it.file.type || "video",
              ].filter(Boolean).join(" · ")
            }
            estimate={estimate}
          />

          <ActionBar
            processLabel={`Extract audio`}
            onProcess={processAll}
            canProcess={encoderReady && q.items.some((i) => i.status === "ready" || i.status === "error")}
            busy={busy}
            doneCount={done.length}
            zipBusy={zipBusy}
            onZip={async () => {
              setZipBusy(true);
              try {
                await downloadZip(done.map((d) => ({ name: d.output!.name, blob: d.output!.blob })), "tinymedia-audio.zip");
              } finally {
                setZipBusy(false);
              }
            }}
          >
            {!encoderReady && loadState.phase !== "error" && (
              <span className="text-xs text-slate-400 dark:text-slate-500">Waiting for the encoder to finish loading…</span>
            )}
          </ActionBar>
        </>
      )}
    </section>
  );
}