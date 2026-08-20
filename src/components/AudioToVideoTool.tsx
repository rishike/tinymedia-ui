import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Music, X, Download, Loader2, Film } from "lucide-react";
import { probeAudio, probeImage, formatBytes, formatDuration, downloadBlob, replaceExt, trackConversion } from "@/lib/core";
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

type Res = "1080" | "720" | "480";
const RES_DIMS: Record<Res, { w: number; h: number }> = {
  "1080": { w: 1920, h: 1080 },
  "720": { w: 1280, h: 720 },
  "480": { w: 854, h: 480 },
};

interface Picked {
  file: File;
  url: string;
  meta: MediaMeta;
}

function PickerBox(props: {
  label: string;
  hint: string;
  icon: typeof ImageIcon;
  accept: string;
  picked: Picked | null;
  disabled?: boolean;
  preview: "image" | "audio";
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { icon: Icon } = props;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{props.label}</p>
      {props.picked ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
          {props.preview === "image" ? (
            <img src={props.picked.url} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-700">
              <Music className="h-5 w-5 text-slate-400" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{props.picked.file.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {props.preview === "image"
                ? [props.picked.meta.width && props.picked.meta.height ? `${props.picked.meta.width} × ${props.picked.meta.height}` : null, formatBytes(props.picked.file.size)].filter(Boolean).join(" · ")
                : [props.picked.meta.duration ? formatDuration(props.picked.meta.duration) : null, formatBytes(props.picked.file.size)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            onClick={props.onClear}
            disabled={props.disabled}
            className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40 dark:text-slate-600 dark:hover:bg-slate-700"
            aria-label={`Remove ${props.label}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => !props.disabled && inputRef.current?.click()}
          disabled={props.disabled}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40 px-4 py-4 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.75} />
          <div>
            <p className="text-sm text-slate-800 dark:text-slate-100">{props.hint}</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={props.accept}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) props.onPick(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </button>
      )}
    </div>
  );
}

export function AudioToVideoTool() {
  const [image, setImage] = useState<Picked | null>(null);
  const [audio, setAudio] = useState<Picked | null>(null);
  const [res, setRes] = useState<Res>("1080");
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

  const pickImage = async (f: File) => {
    if (!IMG_TYPES.includes(f.type) && !IMG_EXT.test(f.name)) { setError("Image must be JPG, PNG, or WebP."); return; }
    if (f.size > MAX_IMG) { setError(`Image is too large (limit ${formatBytes(MAX_IMG)}).`); return; }
    setError(null);
    clearResult();
    if (image) URL.revokeObjectURL(image.url);
    const meta = await probeImage(f);
    setImage({ file: f, url: URL.createObjectURL(f), meta });
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

  const make = async () => {
    if (!image || !audio) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    clearResult();
    try {
      await ensureFFmpeg();
      const { w, h } = RES_DIMS[res];
      const imgExt = image.file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ".png";
      const audExt = audio.file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? ".mp3";
      const outName = replaceExt(audio.file.name, "mp4");
      const blob = await runFFmpeg({
        inputs: [
          { name: `img${imgExt}`, file: image.file },
          { name: `aud${audExt}`, file: audio.file },
        ],
        args: [
          "-loop", "1",
          "-i", `img${imgExt}`,
          "-i", `aud${audExt}`,
          "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
          "-c:v", "libx264",
          "-tune", "stillimage",
          "-pix_fmt", "yuv420p",
          "-r", "2", // static image needs only a tiny framerate — keeps output small & fast
          "-c:a", "aac",
          "-b:a", "192k",
          "-shortest",
          "-movflags", "+faststart",
        ],
        outputName: "out.mp4",
        outputType: "video/mp4",
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(blob);
      setResult({ blob, name: outName, url });
      trackConversion("audio-to-video", { resolution: res });
      void uploadResultToS3(blob, outName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the video.");
    } finally {
      setBusy(false);
    }
  };

  const encoderReady = loadState.phase === "ready";
  const canMake = !!image && !!audio && encoderReady && !busy;

  return (
    <section aria-label="Audio to video">
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Turn a track into a video by pairing it with a still image — ideal for music,
        bhajans, or podcasts you want to upload to YouTube. The image is shown for the
        full length of the audio.
      </p>

      <EncoderBanner state={loadState} />

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <PickerBox
          label="Image"
          hint="Choose a cover image"
          icon={ImageIcon}
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          preview="image"
          picked={image}
          disabled={busy}
          onPick={pickImage}
          onClear={() => { if (image) URL.revokeObjectURL(image.url); setImage(null); clearResult(); }}
        />
        <PickerBox
          label="Audio"
          hint="Choose an audio track"
          icon={Music}
          accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
          preview="audio"
          picked={audio}
          disabled={busy}
          onPick={pickAudio}
          onClear={() => { if (audio) URL.revokeObjectURL(audio.url); setAudio(null); clearResult(); }}
        />
      </div>

      <div className="mt-5">
        <Field label="Resolution">
          <Segmented<Res>
            value={res}
            onChange={(v) => { setRes(v); clearResult(); }}
            disabled={busy}
            options={[
              { value: "1080", label: "1080p" },
              { value: "720", label: "720p" },
              { value: "480", label: "480p" },
            ]}
          />
        </Field>
      </div>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {busy && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Encoding… {Math.round(progress * 100)}% — longer tracks take longer.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={make}
          disabled={!canMake}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
          {busy ? "Creating…" : "Create video"}
        </button>
        {!encoderReady && loadState.phase !== "error" && (
          <span className="text-xs text-slate-400 dark:text-slate-500">Waiting for the encoder to finish loading…</span>
        )}
        {(!image || !audio) && encoderReady && (
          <span className="text-xs text-slate-400 dark:text-slate-500">Add both an image and an audio file.</span>
        )}
      </div>

      {result && (
        <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">
              Video ready · <span className="font-medium">{formatBytes(result.blob.size)}</span> · {RES_DIMS[res].w} × {RES_DIMS[res].h}
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
    </section>
  );
}