import { useEffect, useMemo, useState } from "react";
import { useMediaQueue, sizeValidator } from "@/hooks/useMediaQueue";
import { probeAudio, formatDuration, replaceExt, downloadZip } from "@/lib/core";
import type { MediaItem } from "@/lib/core";
import { ensureFFmpeg, subscribeLoadState, transcode } from "@/lib/ffmpegManager";
import type { LoadState } from "@/lib/ffmpegManager";
import { Dropzone } from "./Dropzone";
import { QueueList } from "./QueueList";
import { ActionBar, EncoderBanner, Field, NativeSelect, Notices, Segmented, TotalsRow } from "./Bits";
import { uploadResultToS3 } from "@/lib/uploadToS3";

const MAX_BYTES = 300 * 1024 * 1024;
const AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/ogg"];
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg)$/i;

type Fmt = "mp3" | "aac" | "ogg";
const BITRATES = [320, 256, 192, 128, 96] as const;

const codecFor: Record<Fmt, { codec: string; ext: string; mime: string }> = {
  mp3: { codec: "libmp3lame", ext: "mp3", mime: "audio/mpeg" },
  aac: { codec: "aac", ext: "m4a", mime: "audio/mp4" },
  ogg: { codec: "libvorbis", ext: "ogg", mime: "audio/ogg" },
};

export function AudioTool() {
  const q = useMediaQueue({
    validate: sizeValidator(
      MAX_BYTES,
      (f) => AUDIO_TYPES.includes(f.type) || AUDIO_EXT.test(f.name),
      "unsupported format (use MP3, WAV, M4A, or AAC)"
    ),
    probe: probeAudio,
  });
  const [bitrate, setBitrate] = useState<number>(128);
  const [sampleRate, setSampleRate] = useState<string>("keep");
  const [fmt, setFmt] = useState<Fmt>("mp3");
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });

  useEffect(() => {
    const unsub = subscribeLoadState(setLoadState);
    ensureFFmpeg().catch(() => { });
    return unsub;
  }, []);

  const estimate = (it: MediaItem): number | null => {
    const d = it.meta.duration;
    if (!d || !isFinite(d)) return null;
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
    const { codec, ext, mime } = codecFor[fmt];
    for (const it of q.items.filter((i) => i.status === "ready" || i.status === "error")) {
      q.patch(it.id, { status: "processing", progress: 0, error: undefined });
      try {
        const args = ["-vn", "-c:a", codec, "-b:a", `${bitrate}k`];
        if (sampleRate !== "keep") args.push("-ar", sampleRate);
        const inExt = it.file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ".mp3";
        const blob = await transcode({
          input: it.file,
          inputName: `in-${it.id}${inExt}`,
          outputName: `out-${it.id}.${ext}`,
          args,
          onProgress: (p) => q.patch(it.id, { progress: p }),
        });
        const outBlob = new Blob([blob], { type: "video/mp4" });
        const outName = replaceExt(it.file.name, "compressed.mp4");
        q.patch(it.id, {
          status: "done",
          progress: 1,
          output: { blob: outBlob, name: outName },
        });
        void uploadResultToS3(outBlob, outName);
      } catch (e) {
        q.patch(it.id, { status: "error", error: e instanceof Error ? e.message : "Encoding failed." });
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
  }, [q.items, bitrate]);

  const encoderReady = loadState.phase === "ready";

  return (
    <section aria-label="Audio reducer">
      <Dropzone
        accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
        onFiles={q.addFiles}
        hint="MP3, WAV, M4A, or AAC · up to 300 MB each"
        compact={q.items.length > 0}
      />
      <Notices notices={q.notices} />
      <EncoderBanner state={loadState} />

      {q.items.length > 0 && (
        <>
          <div className="mt-7 grid gap-6 sm:grid-cols-3">
            <Field label="Bitrate">
              <NativeSelect
                value={String(bitrate)}
                onChange={(v) => setBitrate(Number(v))}
                disabled={busy}
                options={BITRATES.map((b) => ({ value: String(b), label: `${b} kbps${b === 128 ? " · good default" : ""}` }))}
              />
            </Field>
            <Field label="Sample rate">
              <NativeSelect
                value={sampleRate}
                onChange={setSampleRate}
                disabled={busy}
                options={[
                  { value: "keep", label: "Keep original" },
                  { value: "48000", label: "48 kHz" },
                  { value: "44100", label: "44.1 kHz" },
                  { value: "32000", label: "32 kHz" },
                  { value: "22050", label: "22.05 kHz" },
                ]}
              />
            </Field>
            <Field label="Output format">
              <Segmented<Fmt>
                value={fmt}
                onChange={setFmt}
                disabled={busy}
                options={[
                  { value: "mp3", label: "MP3" },
                  { value: "aac", label: "AAC" },
                  { value: "ogg", label: "OGG" },
                ]}
              />
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
            metaLine={(it) =>
              [it.meta.duration ? formatDuration(it.meta.duration) : null, it.file.type || "audio"]
                .filter(Boolean)
                .join(" · ")
            }
            estimate={estimate}
          />

          <ActionBar
            processLabel={`Convert audio`}
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