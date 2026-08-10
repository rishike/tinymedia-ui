// src/lib/core.ts
export interface MediaMeta {
  width?: number;
  height?: number;
  duration?: number; // seconds
}

export type ItemStatus = "ready" | "processing" | "done" | "error";

export interface MediaItem {
  id: string;
  file: File;
  status: ItemStatus;
  progress: number; // 0..1
  meta: MediaMeta;
  selected: boolean;
  previewUrl?: string;
  output?: { blob: Blob; name: string; width?: number; height?: number };
  error?: string;
}

let counter = 0;
export const uid = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}

export function formatDuration(s?: number): string {
  if (s == null || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}:${sec.toString().padStart(2, "0")} min` : `${sec}s`;
}

export function replaceExt(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}

export function savingsPct(orig: number, next: number): number {
  if (orig <= 0) return 0;
  return Math.round((1 - next / orig) * 100);
}

/* ---------- metadata probes ---------- */

export function probeVideo(file: File): Promise<MediaMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (meta: MediaMeta) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    v.onloadedmetadata = () =>
      done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => done({});
    v.src = url;
  });
}

export function probeAudio(file: File): Promise<MediaMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    const done = (meta: MediaMeta) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    a.onloadedmetadata = () => done({ duration: a.duration });
    a.onerror = () => done({});
    a.src = url;
  });
}

export function probeImage(file: File): Promise<MediaMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (meta: MediaMeta) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => done({});
    img.src = url;
  });
}

/* ---------- downloads ---------- */

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadZip(
  entries: { name: string; blob: Blob }[],
  zipName: string,
  onProgress?: (pct: number) => void
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  for (const e of entries) {
    let name = e.name;
    let i = 1;
    while (used.has(name)) {
      name = e.name.replace(/(\.[^.]+)$/, `-${i}$1`);
      i++;
    }
    used.add(name);
    zip.file(name, e.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" }, (m) =>
    onProgress?.(m.percent)
  );
  downloadBlob(blob, zipName);
}

export function trackConversion(toolName: string, extra?: Record<string, string | number>) {
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") {
    gtag("event", "file_converted", { tool_name: toolName, ...extra });
  }
}