import { useEffect, useState } from "react";
import {
  ArrowLeft, Film, FileAudio, Image as ImageIcon, LayoutGrid, Moon, Music,
  Repeat, Sun, Github, MessageSquare, Sparkles, Zap, Cloud, Gift,
} from "lucide-react";
import { VideoTool } from "@/components/VideoTool";
import { AudioTool } from "@/components/AudioTool";
import { ImageTool } from "@/components/ImageTool";
import { VideoToAudioTool } from "@/components/VideoToAudioTool";
import { ConvertImageTool } from "@/components/ConvertImageTool";
import { MergeImagesTool } from "@/components/MergeImagesTool";
import { FeedbackForm } from "@/components/FeedbackForm";
import { useTheme } from "@/hooks/useTheme";

type ToolRoute = "compress-video" | "compress-image" | "compress-audio" | "video-to-mp3" | "convert-image" | "merge-images";
type Route = "" | ToolRoute | "feedback";

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

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "feedback") return "feedback";
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
      {/* header */}
      <div className="sticky top-0 z-20 border-b border-slate-200/70 dark:border-slate-800/70 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-6 gap-y-2 px-6 py-4 sm:px-8">
          <button onClick={() => go("")} className="rounded-md text-xl font-semibold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
            <span className="font-black tracking-tight text-slate-900 dark:text-white">
              Tiny
              <span className="text-accent">
                Media
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="rounded-lg p-2 text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => go("feedback")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors hover:border-accent hover:text-accent"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Feedback
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-8 sm:px-8 sm:pt-12">
        {route === "feedback" ? (
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
            <header className="mt-10 text-center sm:mt-16">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Runs entirely in your browser
              </span>

              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-6xl">
                Compress, Convert
                <br className="hidden sm:block" /> &amp; Optimize Media
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-400">
                Fast browser-based media tools powered by FFmpeg. Compress videos, resize
                images, convert formats, and optionally save processed files securely.
              </p>

              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  onClick={() => go("compress-video")}
                  className="rounded-xl bg-accent px-6 py-3 text-[15px] font-semibold text-white shadow-md transition-all duration-150 hover:bg-accent-hover hover:shadow-lg hover:scale-[1.03] active:scale-[0.98]"
                >
                  Compress Video
                </button>

                {/* <a
                  href="#tools"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3 text-[15px] font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition-all duration-150 hover:border-accent hover:text-accent hover:scale-[1.03] active:scale-[0.98]"
                >
                  Browse Tools
                </a> */}
              </div>

              <div className="mt-10 flex flex-wrap justify-center gap-2.5">
                <Badge icon={<Zap className="h-3.5 w-3.5" />} label="Browser Powered" color="blue" />
                <Badge icon={<Sparkles className="h-3.5 w-3.5" />} label="Fast Processing" color="emerald" />
                <Badge icon={<Gift className="h-3.5 w-3.5" />} label="Free" color="amber" />
              </div>
            </header>

            <main id="tools" className="mt-16 grid scroll-mt-24 gap-5 sm:mt-20 md:grid-cols-2 lg:grid-cols-3">
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
                WebAssembly (loaded once, ~31 MB, shared between tools); image tools use
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