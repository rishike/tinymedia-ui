import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { FFMPEG_WORKER_CODE } from "./ffmpegWorkerCode";

const CORE_VERSION = "0.12.6";
const CDN_BASES = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
];

async function fetchBytes(url: string, onPct?: (pct: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get("Content-Length") ?? 0);
  if (!res.body || !total) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onPct?.(100);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onPct?.(Math.min(99, Math.round((received / total) * 100)));
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  onPct?.(100);
  return out;
}

export type LoadState =
  | { phase: "idle" }
  | { phase: "loading"; pct: number }
  | { phase: "ready" }
  | { phase: "error"; message: string };

type Listener = (s: LoadState) => void;

let state: LoadState = { phase: "idle" };
const listeners = new Set<Listener>();

let loadPromise: Promise<FFmpeg> | null = null;

function setState(s: LoadState) {
  state = s;
  listeners.forEach((l) => l(s));
}

export function subscribeLoadState(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => listeners.delete(l);
}

export function getLoadState() {
  return state;
}

/** Kick off (or reuse) the shared ffmpeg.wasm instance. Safe to call repeatedly. */
export function ensureFFmpeg(): Promise<FFmpeg> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    setState({ phase: "loading", pct: 0 });
    const workerBlobURL = URL.createObjectURL(
      new Blob([FFMPEG_WORKER_CODE], { type: "text/javascript" })
    );
    let lastErr: unknown = null;
    for (const base of CDN_BASES) {
      try {
        const ff = new FFmpeg();
        // The core (~110 KB js + ~31 MB wasm) is downloaded here and handed to the
        // worker as raw bytes; the worker mints its own blob URLs. Page-created blob
        // URLs are not fetchable from workers in opaque origins (sandboxed iframes).
        const coreText = new TextDecoder().decode(
          await fetchBytes(`${base}/ffmpeg-core.js`)
        );
        const wasmBytes = await fetchBytes(`${base}/ffmpeg-core.wasm`, (pct) =>
          setState({ phase: "loading", pct })
        );
        await ff.load({
          classWorkerURL: workerBlobURL,
          coreText,
          wasmBytes,
        } as unknown as Parameters<FFmpeg["load"]>[0]);

        setState({ phase: "ready" });
        return ff;
      } catch (e) {
        lastErr = e;
      }
    }
    loadPromise = null;
    setState({
      phase: "error",
      message:
        "Couldn't download the encoder (about 31 MB, fetched once from a CDN). Check your connection and try again.",
    });
    throw lastErr instanceof Error ? lastErr : new Error("ffmpeg load failed");
  })();
  return loadPromise;
}

/* One ffmpeg instance, one job at a time — video & audio tabs share it. */
let chain: Promise<unknown> = Promise.resolve();
export function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = () => fn();
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

export interface TranscodeJob {
  input: File;
  inputName: string;
  outputName: string;
  args: string[]; // args between -i input and output
  onProgress?: (p: number) => void;
}

export async function transcode(job: TranscodeJob): Promise<Blob> {
  const ff = await ensureFFmpeg();
  return runExclusive(async () => {
    const onProg = ({ progress }: { progress: number }) => {
      if (isFinite(progress)) job.onProgress?.(Math.max(0, Math.min(1, progress)));
    };
    ff.on("progress", onProg);
    try {
      await ff.writeFile(job.inputName, await fetchFile(job.input));
      const code = await ff.exec(["-i", job.inputName, ...job.args, job.outputName]);
      if (code !== 0) throw new Error("Encoding failed — the file may be corrupt or use an unsupported codec.");
      const data = (await ff.readFile(job.outputName)) as Uint8Array;
      if (!data?.length) throw new Error("Encoder produced an empty file.");
      return new Blob([data.slice()]);
    } finally {
      ff.off("progress", onProg);
      try { await ff.deleteFile(job.inputName); } catch { /* noop */ }
      try { await ff.deleteFile(job.outputName); } catch { /* noop */ }
    }
  });
}
