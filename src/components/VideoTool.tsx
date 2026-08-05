import { useEffect, useMemo, useState } from "react";
import { useMediaQueue, sizeValidator } from "@/hooks/useMediaQueue";
import { probeVideo, formatBytes, formatDuration, replaceExt, downloadZip } from "@/lib/core";
import type { MediaItem } from "@/lib/core";
import { ensureFFmpeg, subscribeLoadState, transcode } from "@/lib/ffmpegManager";
import type { LoadState } from "@/lib/ffmpegManager";
import { Dropzone } from "./Dropzone";
import { QueueList } from "./QueueList";
import { ActionBar, EncoderBanner, Field, Notices, Segmented, SliderRow, TotalsRow, NumberInput } from "./Bits";

const MAX_BYTES = 800 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

type Mode = "crf" | "target";
type Res = "original" | "1080" | "720" | "480";

export function VideoTool() {
  const q = useMediaQueue({
    validate: sizeValidator(
      MAX_BYTES,
      (f) => VIDEO_TYPES.includes(f.type) || VIDEO_EXT.test(f.name),
      "unsupported format (use MP4, WebM, or MOV)"
    ),
    probe: probeVideo,
  });
  const [mode, setMode] = useState<Mode>("crf");
  const [crf, setCrf] = useState(26);
  const [res, setRes] = useState<Res>("original");
  const [targetMB, setTargetMB] = useState(25);
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ phase: "idle" });

  useEffect(() => {
    const unsub = subscribeLoadState(setLoadState);
    ensureFFmpeg().catch(() => {});
    return unsub;
  }, []);

  const estimate = (it: MediaItem): number | null => {
    const { width, height, duration } = it.meta;
    if (!duration || !isFinite(duration)) return null;
    if (mode === "target") return Math.min(it.file.size, targetMB * 1024 * 1024);
    let w = width ?? 1280, h = height ?? 720;
    const cap = res === "original" ? Infinity : Number(res);
    if (h > cap) { w = Math.round((w * cap) / h); h = cap; }
    const bpp = 0.12 * Math.pow(2, -(crf - 18) / 5);
    const videoBits = bpp * w * h * 30 * duration;
    const audioBits = 128_000 * duration;
    return Math.min(it.file.size, Math.round((videoBits + audioBits) / 8));
  };

  const buildArgs = (it: MediaItem): string[] => {
    const args: string[] = [];
    const h = it.meta.height ?? Infinity;
    const cap = res === "original" ? Infinity : Number(res);
    if (h > cap) args.push("-vf", `scale=-2:${cap}`);
    args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p");
    if (mode === "crf") {
      args.push("-crf", String(crf));
    } else {
      const dur = it.meta.duration && isFinite(it.meta.duration) ? it.meta.duration : 60;
      const totalKbps = (targetMB * 8192) / dur;
      const vKbps = Math.max(80, Math.round(totalKbps - 128));
      args.push("-b:v", `${vKbps}k`, "-maxrate", `${Math.round(vKbps * 1.4)}k`, "-bufsize", `${vKbps * 2}k`);
    }
    args.push("-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart");
    return args;
  };

  const processAll = async () => {
    setBusy(true);
    try {
      await ensureFFmpeg();
    } catch {
      setBusy(false);
      return;
    }
    const pending = q.items.filter((i) => i.status === "ready" || i.status === "error");
    for (const it of pending) {
      q.patch(it.id, { status: "processing", progress: 0, error: undefined });
      try {
        const ext = it.file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ".mp4";
        const blob = await transcode({
          input: it.file,
          inputName: `in-${it.id}${ext}`,
          outputName: `out-${it.id}.mp4`,
          args: buildArgs(it),
          onProgress: (p) => q.patch(it.id, { progress: p }),
        });
        q.patch(it.id, {
          status: "done",
          progress: 1,
          output: { blob: new Blob([blob], { type: "video/mp4" }), name: replaceExt(it.file.name, "compressed.mp4") },
        });
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
    const est = q.items.reduce((s, i) => {
      if (i.output) return s + i.output.blob.size;
      const e = estimate(i);
      return s + (e ?? i.file.size);
    }, 0);
    return { orig, est: q.items.some((i) => i.meta.duration || i.output) ? est : null, allDone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.items, mode, crf, res, targetMB]);

  const encoderReady = loadState.phase === "ready";

  return (
    <section aria-label="Video compressor">
      <Dropzone
        accept=".mp4,.webm,.mov,.m4v,video/mp4,video/webm,video/quicktime"
        onFiles={q.addFiles}
        hint="MP4, WebM, or MOV · up to 800 MB each · re-encoded to H.264 MP4"
        compact={q.items.length > 0}
      />
      <Notices notices={q.notices} />
      <EncoderBanner state={loadState} />

      {q.items.length > 0 && (
        <>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <Field label="Compression mode">
              <Segmented<Mode>
                value={mode}
                onChange={setMode}
                disabled={busy}
                options={[
                  { value: "crf", label: "Quality (CRF)" },
                  { value: "target", label: "Target size" },
                ]}
              />
            </Field>
            <Field label="Resolution">
              <Segmented<Res>
                value={res}
                onChange={setRes}
                disabled={busy}
                options={[
                  { value: "original", label: "Original" },
                  { value: "1080", label: "1080p" },
                  { value: "720", label: "720p" },
                  { value: "480", label: "480p" },
                ]}
              />
            </Field>
            {mode === "crf" ? (
              <Field label="Quality — lower CRF is higher quality">
                <SliderRow min={18} max={35} value={crf} onChange={setCrf} disabled={busy} valueLabel={`CRF ${crf}`} />
              </Field>
            ) : (
              <Field label="Target file size">
                <NumberInput value={targetMB} min={1} max={2000} onChange={(v) => setTargetMB(Math.max(1, v || 1))} suffix="MB per file" disabled={busy} ariaLabel="Target size in megabytes" />
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
            processLabel={`Compress ${q.items.filter((i) => i.status !== "done").length || ""} video${q.items.length === 1 ? "" : "s"}`}
            onProcess={processAll}
            canProcess={encoderReady && q.items.some((i) => i.status === "ready" || i.status === "error")}
            busy={busy}
            doneCount={done.length}
            zipBusy={zipBusy}
            onZip={async () => {
              setZipBusy(true);
              try {
                await downloadZip(done.map((d) => ({ name: d.output!.name, blob: d.output!.blob })), "tinymedia-videos.zip");
              } finally {
                setZipBusy(false);
              }
            }}
          >
            {!encoderReady && loadState.phase !== "error" && (
              <span className="text-xs text-slate-400 dark:text-slate-500">Waiting for the encoder to finish loading…</span>
            )}
          </ActionBar>
          {mode === "target" && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Target size uses single-pass bitrate control, so results land close to — not exactly on — {formatBytes(targetMB * 1024 * 1024)}.
            </p>
          )}
        </>
      )}
    </section>
  );
}