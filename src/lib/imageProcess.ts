// src/lib/imageProcess.ts
import { replaceExt } from "./core";

export type ResizeMode = "dimensions" | "percent" | "maxsize";
export type ImgFormat = "original" | "jpeg" | "png" | "webp" | "avif";

export interface ImageSettings {
  mode: ResizeMode;
  width: number;
  height: number;
  lockAspect: boolean;
  percent: number; // 1..100
  maxKB: number;
  format: ImgFormat;
  quality: number; // 10..100
}

export const defaultImageSettings: ImageSettings = {
  mode: "percent",
  width: 1920,
  height: 1080,
  lockAspect: true,
  percent: 100,
  maxKB: 500,
  format: "webp",
  quality: 80,
};

let avifPromise: Promise<boolean> | null = null;
export function supportsAvif(): Promise<boolean> {
  if (!avifPromise) {
    avifPromise = new Promise((resolve) => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 2;
        c.toBlob((b) => resolve(!!b && b.type === "image/avif"), "image/avif", 0.8);
      } catch {
        resolve(false);
      }
    });
  }
  return avifPromise;
}

function mimeFor(format: ImgFormat, srcType: string): string {
  if (format === "original") {
    return ["image/jpeg", "image/png", "image/webp"].includes(srcType)
      ? srcType
      : "image/jpeg";
  }
  return `image/${format}`;
}

const extFor: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function targetDims(
  srcW: number,
  srcH: number,
  s: ImageSettings
): { w: number; h: number } {
  if (s.mode === "percent") {
    const f = Math.max(1, s.percent) / 100;
    return { w: Math.max(1, Math.round(srcW * f)), h: Math.max(1, Math.round(srcH * f)) };
  }
  if (s.mode === "dimensions") {
    if (s.lockAspect) {
      const f = Math.min(s.width / srcW, s.height / srcH);
      return { w: Math.max(1, Math.round(srcW * f)), h: Math.max(1, Math.round(srcH * f)) };
    }
    return { w: Math.max(1, s.width), h: Math.max(1, s.height) };
  }
  return { w: srcW, h: srcH }; // maxsize keeps dimensions, squeezes quality
}

/** Rough size estimate for the summary row — shown as "≈". */
export function estimateImageSize(
  file: File,
  meta: { width?: number; height?: number },
  s: ImageSettings
): number {
  if (s.mode === "maxsize") return Math.min(file.size, s.maxKB * 1024);
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return file.size;
  const { w: tw, h: th } = targetDims(w, h, s);
  const mime = mimeFor(s.format, file.type);
  const factor: Record<string, number> = {
    "image/jpeg": 1.0,
    "image/webp": 0.72,
    "image/avif": 0.5,
    "image/png": 2.2,
  };
  const q = mime === "image/png" ? 1 : Math.pow(s.quality / 90, 1.6);
  const est = file.size * ((tw * th) / (w * h)) * (factor[mime] ?? 1) * q;
  return Math.max(2048, Math.round(est));
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function processImage(
  file: File,
  s: ImageSettings
): Promise<{ blob: Blob; name: string; width: number; height: number }> {
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    bmp = await new Promise<HTMLImageElement>((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("This file couldn't be decoded as an image.")); };
      img.src = url;
    });
  }
  const srcW = "width" in bmp ? bmp.width : 0;
  const srcH = "height" in bmp ? bmp.height : 0;
  if (!srcW || !srcH) throw new Error("This file couldn't be decoded as an image.");

  const { w, h } = targetDims(srcW, srcH, s);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let mime = mimeFor(s.format, file.type);
  // JPEG has no alpha — flatten onto white
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  if ("close" in bmp) bmp.close();

  if (mime === "image/avif" && !(await supportsAvif())) {
    throw new Error("This browser can't encode AVIF — pick WebP or JPEG instead.");
  }

  let blob: Blob | null;
  if (s.mode === "maxsize") {
    // PNG can't be quality-squeezed — fall back to WebP for size targeting
    if (mime === "image/png") mime = "image/webp";
    const target = s.maxKB * 1024;
    let lo = 0.05, hi = 0.95;
    blob = await toBlob(canvas, mime, hi);
    if (!blob) throw new Error(`Couldn't encode to ${mime.split("/")[1].toUpperCase()}.`);
    if (blob.size > target) {
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        const attempt = await toBlob(canvas, mime, mid);
        if (!attempt) break;
        if (attempt.size > target) hi = mid;
        else { lo = mid; blob = attempt; }
      }
      const final = await toBlob(canvas, mime, lo);
      if (final && final.size <= target) blob = final;
    }
  } else {
    const q = mime === "image/png" ? undefined : s.quality / 100;
    blob = await toBlob(canvas, mime, q as number);
  }
  if (!blob) throw new Error(`Couldn't encode to ${mime.split("/")[1].toUpperCase()}.`);
  if (blob.type && blob.type !== mime) {
    // browser silently fell back (e.g. no webp) — surface it honestly
    mime = blob.type;
  }
  return { blob, name: replaceExt(file.name, extFor[mime] ?? "jpg"), width: w, height: h };
}
