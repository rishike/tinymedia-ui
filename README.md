# TinyMedia

Free browser-based media tools — everything runs 100% client-side. Files never
leave the user's device.

**Tools:** Video Compressor · Image Compressor & Resizer · Audio Compressor ·
Video to Audio Converter · Image Format Converter · Merge Images

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS · ffmpeg.wasm
(`@ffmpeg/ffmpeg`) for video/audio · Canvas API for images · JSZip for batch
downloads.

## Requirements

- Node.js 18+ (20+ recommended)
- npm

## Run locally

```bash
npm install     # also applies the required patch (see below)
npm run dev     # http://localhost:5173
```

## Build for production

```bash
npm run build   # type-checks, then outputs static files to dist/
npm run preview # serve the production build locally
```

`dist/` is fully static — deploy it to any static host (Netlify, Vercel,
Cloudflare Pages, cPanel `public_html`, etc.). No server code, no environment
variables. Since your Haritpane setup is cPanel: this needs no Passenger/Node
app at all — just upload the `dist/` contents.

## How the ffmpeg part works (important)

- The ffmpeg core (~31 MB of WebAssembly) is **not** bundled. It is downloaded
  once at runtime from jsDelivr (unpkg as fallback) the first time the user
  opens a Video or Audio tool, then kept in memory and shared by all
  ffmpeg-based tools. See `src/lib/ffmpegManager.ts`.
- The ffmpeg worker is inlined as a string (`src/lib/ffmpegWorkerCode.ts`,
  generated — don't edit by hand) and started from a blob URL. The core bytes
  are passed to the worker via `postMessage`, and the worker creates its own
  blob URLs from them. This is deliberate: page-created blob URLs cannot be
  fetched from inside a worker when the app runs in an opaque origin (sandboxed
  iframes, `file://`), so this approach works everywhere, including normal
  hosting.
- `patches/@ffmpeg+ffmpeg+0.12.15.patch` makes the library spawn that worker as
  a classic worker straight from the blob URL. It is applied automatically by
  `patch-package` on `npm install` (via the `postinstall` script). If you see
  `ERROR_IMPORT_FAILURE` or the encoder never finishes loading, the patch
  probably didn't apply — run `npx patch-package` and check the output.
- If you upgrade `@ffmpeg/ffmpeg`, you must regenerate the worker string and
  re-create the patch for the new version:

  ```bash
  npm run worker:generate
  ```

## Project structure

```
index.html                  Entry HTML (title + meta description)
src/
  main.tsx                  React entry point
  App.tsx                   Hash router, homepage, page shells, SEO titles
  index.css                 Tailwind directives
  components/
    VideoTool.tsx           Video compressor (CRF / target size / resolution)
    ImageTool.tsx           Image compressor & resizer (Canvas)
    AudioTool.tsx           Audio compressor (bitrate / sample rate / format)
    VideoToAudioTool.tsx    Extract audio track as MP3/AAC/OGG/WAV
    ConvertImageTool.tsx    Image format converter (JPG/PNG/WebP/AVIF ⇄)
    MergeImagesTool.tsx     Merge images into one (row / column / grid)
    QueueList.tsx           Shared queue: drag-reorder, bulk actions, per-item
                            progress and downloads
    Dropzone.tsx            Drag-and-drop / file picker
    Bits.tsx                Small shared UI primitives
  hooks/
    useMediaQueue.ts        Queue state: validation, probing, selection, reorder
  lib/
    ffmpegManager.ts        Lazy shared ffmpeg.wasm loader + job mutex
    ffmpegWorkerCode.ts     Inlined ffmpeg worker (generated)
    imageProcess.ts         Canvas resize/convert, AVIF detection, size search
    mergeImages.ts          Merge layout math + canvas composition
    core.ts                 Types, formatting, metadata probes, downloads
scripts/
  generate-worker-code.mjs  Regenerates ffmpegWorkerCode.ts
patches/
  @ffmpeg+ffmpeg+0.12.15.patch
```

## Backend & feedback

The media tools are 100% client-side and need **no backend**. A separate
FastAPI service in `backend/` powers only the **feedback form** (and includes a
standalone S3 presigned-upload learning module). See `backend/README.md` for
setup.

- Frontend → backend wiring: in dev, `vite.config.ts` proxies `/api` to
  `http://localhost:8000`. In production, either serve both on the same origin
  (leave `VITE_API_BASE` blank) or set `VITE_API_BASE` to the API's URL (copy
  `.env.example` to `.env`). If cross-origin, set the backend's `CORS_ORIGINS`
  to your frontend URL.
- The feedback form works without a name or email — message only sends
  anonymously.

## Routing & SEO

Pages use hash routes (`#/compress-video`, `#/compress-image`,
`#/compress-audio`, `#/video-to-mp3`, `#/convert-image`, `#/merge-images`) and
set a keyword-rich `document.title` per page. Note that search engines treat
hash routes as a single page — for real per-tool rankings, port the pages to a
framework with true paths (e.g. Next.js: `/compress-video`, each with its own
meta description). The tool components carry over as-is; only `App.tsx`'s
router would be replaced by file-based routes.

## Browser support

Chrome, Edge, Firefox, and Safari 15+. AVIF encoding is feature-detected and
disabled where unsupported (Firefox/Safari). ffmpeg runs single-threaded
(`SharedArrayBuffer` isn't required, so no special COOP/COEP headers are needed
on your host).
