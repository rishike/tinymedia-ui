import { useEffect, useState } from "react";
import {
  ArrowLeft, Film, FileAudio, Image as ImageIcon, LayoutGrid, Music,
  Repeat, MessageSquare, Sparkles, Zap, Gift,
} from "lucide-react";
import { VideoTool } from "@/components/VideoTool";
import { AudioTool } from "@/components/AudioTool";
import { ImageTool } from "@/components/ImageTool";
import { VideoToAudioTool } from "@/components/VideoToAudioTool";
import { ConvertImageTool } from "@/components/ConvertImageTool";
import { MergeImagesTool } from "@/components/MergeImagesTool";
import { FeedbackForm } from "@/components/FeedbackForm";
import { useTheme } from "@/hooks/useTheme";
import { SiteHeader } from "@/components/SiteHeader";

type ToolRoute = "compress-video" | "compress-image" | "compress-audio" | "video-to-mp3" | "convert-image" | "merge-images";
type Route = "" | ToolRoute | "feedback" | "privacy";

type ToolColor = "blue" | "emerald" | "amber" | "violet" | "pink";

const COLOR_STYLES: Record<ToolColor, { bg: string; text: string; hoverBg: string; ring: string }> = {
  blue: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-600 dark:text-blue-400", hoverBg: "group-hover:bg-blue-600", ring: "group-hover:ring-blue-200 dark:group-hover:ring-blue-900" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", hoverBg: "group-hover:bg-emerald-600", ring: "group-hover:ring-emerald-200 dark:group-hover:ring-emerald-900" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", hoverBg: "group-hover:bg-amber-600", ring: "group-hover:ring-amber-200 dark:group-hover:ring-amber-900" },
  violet: { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-600 dark:text-violet-400", hoverBg: "group-hover:bg-violet-600", ring: "group-hover:ring-violet-200 dark:group-hover:ring-violet-900" },
  pink: { bg: "bg-pink-50 dark:bg-pink-950/40", text: "text-pink-600 dark:text-pink-400", hoverBg: "group-hover:bg-pink-600", ring: "group-hover:ring-pink-200 dark:group-hover:ring-pink-900" },
};

const TOOLS: {
  route: ToolRoute;
  name: string;
  title: string;
  desc: string;
  icon: typeof Film;
  uses: string;
  color: ToolColor;
}[] = [
    {
      route: "compress-video",
      name: "Video Compressor",
      title: "Compress Video Online — reduce MP4, WebM & MOV file size",
      desc: "Shrink MP4, WebM, and MOV files with a quality slider, resolution presets, or a target file size.",
      icon: Film,
      uses: "Email attachments · WhatsApp limits · faster uploads",
      color: "blue",
    },
    {
      route: "compress-image",
      name: "Image Compressor & Resizer",
      title: "Compress & Resize Images Online — JPG, PNG, WebP",
      desc: "Batch-resize by dimensions, percentage, or a max file size, and convert to WebP or AVIF.",
      icon: ImageIcon,
      uses: "Web images · forms with size limits · storage cleanup",
      color: "emerald",
    },
    {
      route: "compress-audio",
      name: "Audio Compressor",
      title: "Compress Audio Online — reduce MP3, WAV & M4A size",
      desc: "Reduce MP3, WAV, M4A, and AAC files with bitrate and sample-rate presets.",
      icon: Music,
      uses: "Podcasts · voice notes · music libraries",
      color: "amber",
    },
    {
      route: "video-to-mp3",
      name: "Video to Audio Converter",
      title: "Video to MP3 Converter — extract audio from video online",
      desc: "Pull the audio track out of MP4, WebM, or MOV files as MP3, AAC, OGG, or WAV.",
      icon: FileAudio,
      uses: "Lectures · interviews · music from your own recordings",
      color: "amber",
    },
    {
      route: "convert-image",
      name: "Image Format Converter",
      title: "Convert Images Online — JPG, PNG, WebP, AVIF & back",
      desc: "Convert between JPG, PNG, WebP, and AVIF in both directions — GIF and BMP in, too.",
      icon: Repeat,
      uses: "WebP for the web · PNG for transparency · JPG for compatibility",
      color: "violet",
    },
    {
      route: "merge-images",
      name: "Merge Images",
      title: "Merge Images Into One — combine photos online",
      desc: "Combine multiple photos into a single image as a row, column, or grid, with spacing control.",
      icon: LayoutGrid,
      uses: "Before/after shots · screenshots · photo strips",
      color: "pink",
    },
  ];

// function GithubMark({ className }: { className?: string }) {
//   return (
//     <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
//       <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.34.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.8 1.19 1.83 1.19 3.09 0 4.43-2.7 5.4-5.26 5.69.42.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5Z" />
//     </svg>
//   );
// }

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "feedback") return "feedback";
  if (h === "privacy") return "privacy";
  return (TOOLS.some((t) => t.route === h) ? h : "") as Route;
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [route, setRoute] = useState<Route>(readRoute);
  const [visited, setVisited] = useState<Set<string>>(() => new Set(readRoute() ? [readRoute()] : []));

  useEffect(() => {
    const onHash = () => {
      const r = readRoute();
      setRoute(r);
      if (r) setVisited((v) => (v.has(r) ? v : new Set(v).add(r)));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (r: Route) => {
    window.location.hash = r ? `/${r}` : "/";
    setRoute(r);
    if (r) setVisited((v) => (v.has(r) ? v : new Set(v).add(r)));
    window.scrollTo(0, 0);
  };

  const active = TOOLS.find((t) => t.route === route);

  useEffect(() => {
    if (route === "feedback") {
      document.title = "Send feedback · TinyMedia";
    } else {
      document.title = active
        ? `${active.title} · TinyMedia`
        : "TinyMedia — free online video compressor, image resizer & audio converter";
    }
  }, [active, route]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 antialiased">

<SiteHeader route={route} go={go} theme={theme} toggle={toggle} />
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-8 sm:px-8 sm:pt-12">
        {route === "privacy" ? (
  <>
    <nav className="mt-6">
      <button onClick={() => go("")} className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-accent">
        <ArrowLeft className="h-3.5 w-3.5" /> All tools
      </button>
    </nav>
  </>
) : route === "feedback" ? (
          <>
            <nav className="mt-2">
              <button
                onClick={() => go("")}
                className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-accent"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> All tools
              </button>
            </nav>
            <header className="mt-4">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Send feedback</h1>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                Found a bug, want a feature, or just have a thought? Tell us. Name and
                email are optional — leave them blank to send anonymously.
              </p>
            </header>
            <FeedbackForm />
          </>
        ) : active ? (
          <>
            <nav className="mt-2">
              <button
                onClick={() => go("")}
                className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-accent"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> All tools
              </button>
            </nav>
            <header className="mt-4 flex items-start gap-4">
              <span className={["hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", COLOR_STYLES[active.color].bg, COLOR_STYLES[active.color].text].join(" ")}>
                <active.icon className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">{active.name}</h1>
                <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">{active.desc}</p>
              </div>
            </header>
            <main className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm sm:p-7">
              {TOOLS.map(({ route: r }) => (
                <div key={r} hidden={route !== r}>
                  {visited.has(r) && (
                    <>
                      {r === "compress-video" && <VideoTool />}
                      {r === "compress-image" && <ImageTool />}
                      {r === "compress-audio" && <AudioTool />}
                      {r === "video-to-mp3" && <VideoToAudioTool />}
                      {r === "convert-image" && <ConvertImageTool />}
                      {r === "merge-images" && <MergeImagesTool />}
                    </>
                  )}
                </div>
              ))}
            </main>
          </>
        ) : (
          <>
            <header className="mt-0 text-center sm:mt-0">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shadow-sm">
                <Sparkles className="h-1 w-1 text-accent" />
                Runs entirely in your browser
              </span>

              <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl">
                Compress, Convert
                <br className="hidden sm:block" /> &amp; Optimize Media
              </h1>

              <p className="mx-auto mt-1 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-400">
                Fast browser-based media tools powered by FFmpeg. Compress videos, resize
                images, convert formats, and optionally save processed files securely.
              </p>

             

              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <Badge icon={<Zap className="h-3.5 w-3.5" />} label="Browser Powered" color="blue" />
                 <Badge icon={<Sparkles className="h-3.5 w-3.5" />} label="Fast Processing" color="emerald" />
                <Badge icon={<Gift className="h-3.5 w-3.5" />} label="Free" color="amber" />
              </div>
            </header>

            <main id="tools" className="mt-1 grid scroll-mt-2 gap-3 sm:mt-20 md:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map(({ route: r, name, desc, icon: Icon, uses, color }) => (
                <button
                  key={r}
                  onClick={() => go(r)}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
                >
                  <span
                    className={[
                      "flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-transparent transition-all duration-300",
                      COLOR_STYLES[color].bg,
                      COLOR_STYLES[color].text,
                      COLOR_STYLES[color].hoverBg,
                      "group-hover:text-white",
                    ].join(" ")}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-50 group-hover:text-accent">{name}</span>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{desc}</p>
                  <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">{uses}</p>
                </button>
              ))}
            </main>
          </>
        )}

        <footer className="mt-24 border-t border-slate-200 dark:border-slate-800 pt-10">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">TinyMedia</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Browser-powered media tools. Video and audio use FFmpeg compiled to
                WebAssembly; image tools use
                the Canvas API. Closing this tab cancels work in progress.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Powered by</p>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <li>FFmpeg WebAssembly</li>
                <li>Canvas API</li>
                <li>Browser Processing</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Links</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                <li>
                  <button onClick={() => go("feedback")} className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-accent">
                    <MessageSquare className="h-3.5 w-3.5" /> Feedback
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-10 text-center text-xs text-slate-400 dark:text-slate-600">
            © {new Date().getFullYear()} TinyMedia. Free to use.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Badge({ icon, label, color }: { icon: React.ReactNode; label: string; color: ToolColor }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium",
        COLOR_STYLES[color].bg,
        COLOR_STYLES[color].text,
      ].join(" ")}
    >
      {icon}
      {label}
    </span>
  );
}