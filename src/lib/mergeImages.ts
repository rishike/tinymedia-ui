export interface MergeSettings {
  layout: "horizontal" | "vertical" | "grid";
  cols: number;
  gap: number;
  bg: "white" | "black" | "transparent";
  format: "jpeg" | "png" | "webp";
  quality: number; // 10..100
}

export const defaultMergeSettings: MergeSettings = {
  layout: "vertical",
  cols: 2,
  gap: 0,
  bg: "white",
  format: "jpeg",
  quality: 90,
};

const MAX_SIDE = 10000;

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} couldn't be decoded as an image.`);
  }
}

export async function mergeImages(
  files: File[],
  s: MergeSettings
): Promise<{ blob: Blob; width: number; height: number }> {
  if (files.length < 2) throw new Error("Add at least two images to merge.");
  const imgs = await Promise.all(files.map(decode));

  let width = 0;
  let height = 0;
  // per-image draw rects
  const rects: { x: number; y: number; w: number; h: number }[] = [];

  if (s.layout === "horizontal") {
    const H = Math.min(...imgs.map((i) => i.height));
    let x = 0;
    for (const im of imgs) {
      const w = Math.round((im.width * H) / im.height);
      rects.push({ x, y: 0, w, h: H });
      x += w + s.gap;
    }
    width = x - s.gap;
    height = H;
  } else if (s.layout === "vertical") {
    const W = Math.min(...imgs.map((i) => i.width));
    let y = 0;
    for (const im of imgs) {
      const h = Math.round((im.height * W) / im.width);
      rects.push({ x: 0, y, w: W, h });
      y += h + s.gap;
    }
    width = W;
    height = y - s.gap;
  } else {
    const cols = Math.max(1, Math.min(s.cols, imgs.length));
    const rows = Math.ceil(imgs.length / cols);
    const cellW = Math.max(...imgs.map((i) => i.width));
    const cellH = Math.max(...imgs.map((i) => i.height));
    width = cols * cellW + (cols - 1) * s.gap;
    height = rows * cellH + (rows - 1) * s.gap;
    imgs.forEach((im, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      // contain within cell, centered
      const f = Math.min(cellW / im.width, cellH / im.height);
      const w = Math.round(im.width * f);
      const h = Math.round(im.height * f);
      rects.push({
        x: c * (cellW + s.gap) + Math.round((cellW - w) / 2),
        y: r * (cellH + s.gap) + Math.round((cellH - h) / 2),
        w,
        h,
      });
    });
  }

  // cap overall size
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const transparentOk = s.format !== "jpeg";
  if (!(s.bg === "transparent" && transparentOk)) {
    ctx.fillStyle = s.bg === "black" ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
  }
  imgs.forEach((im, i) => {
    const r = rects[i];
    ctx.drawImage(im, r.x * scale, r.y * scale, r.w * scale, r.h * scale);
    im.close();
  });

  const mime = `image/${s.format}`;
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, mime, s.format === "png" ? undefined : s.quality / 100)
  );
  if (!blob) throw new Error(`Couldn't encode the merged image as ${s.format.toUpperCase()}.`);
  return { blob, width: cw, height: ch };
}
