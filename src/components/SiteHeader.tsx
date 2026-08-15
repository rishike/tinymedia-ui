import { useEffect, useRef, useState } from "react";
import {
  ChevronDown, Film, FileAudio, Image as ImageIcon, LayoutGrid,
  Menu, Moon, Music, Repeat, Sun, X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types — keep these in sync with App.tsx                             */
/* ------------------------------------------------------------------ */

export type ToolRoute =
  | "compress-video" | "compress-image" | "compress-audio"
  | "video-to-mp3" | "convert-image" | "merge-images";

export type Route = "" | ToolRoute | "feedback" | "privacy";

type NavItem = {
  route: ToolRoute;
  /** Short label for nav + menu. Long marketing names stay in TOOLS. */
  label: string;
  hint: string;
  icon: typeof Film;
};

/* Two groups instead of six flat links. The grouping is the point:
   it tells a first-time visitor what the site actually does. */
const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Compress",
    items: [
      { route: "compress-video", label: "Video", hint: "MP4, WebM, MOV", icon: Film },
      { route: "compress-image", label: "Image", hint: "JPG, PNG, WebP", icon: ImageIcon },
      { route: "compress-audio", label: "Audio", hint: "MP3, WAV, M4A", icon: Music },
    ],
  },
  {
    heading: "Convert",
    items: [
      { route: "video-to-mp3", label: "Video to audio", hint: "Extract the track", icon: FileAudio },
      { route: "convert-image", label: "Image format", hint: "JPG ⇄ PNG ⇄ WebP", icon: Repeat },
      { route: "merge-images", label: "Merge images", hint: "Row, column, grid", icon: LayoutGrid },
    ],
  },
];

const ALL_TOOL_ROUTES = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.route));

/* Shared row styles. The row takes a soft blue tint; the icon tile takes
   the solid brand blue, echoing the tool cards on the homepage. */
const rowBase =
  "group flex w-full items-center gap-3 rounded-xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60";

const tileBase =
  "flex shrink-0 items-center justify-center rounded-lg transition-colors";

/* ------------------------------------------------------------------ */

export function SiteHeader({
  route,
  go,
  theme,
  toggle,
}: {
  route: Route;
  go: (r: Route) => void;
  theme: "light" | "dark";
  toggle: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const onToolPage = ALL_TOOL_ROUTES.includes(route as ToolRoute);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Lock scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const navigate = (r: Route) => {
    setMenuOpen(false);
    setMobileOpen(false);
    go(r);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-5 sm:px-8">

        {/* Wordmark */}
        <button
          onClick={() => navigate("")}
          className="flex shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          aria-label="TinyMedia home"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-blue-600 text-white shadow-sm shadow-blue-600/25">
            <Film className="h-[15px] w-[15px]" strokeWidth={2.4} />
          </span>
          <span className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
            TinyMedia
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="ml-8 hidden items-center gap-1 md:flex">
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              className={[
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-medium outline-none",
                "transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60",
                onToolPage || menuOpen
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
              ].join(" ")}
            >
              Tools
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {menuOpen && (
              <div
                className="absolute left-0 top-[calc(100%+10px)] w-[440px] rounded-2xl border border-slate-200/80 bg-white p-2 shadow-2xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50"
                role="menu"
              >
                <div className="grid grid-cols-2 gap-1">
                  {NAV_GROUPS.map((group) => (
                    <div key={group.heading}>
                      <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-400 dark:text-slate-500">
                        {group.heading}
                      </p>
                      {group.items.map(({ route: r, label, hint, icon: Icon }) => {
                        const isActive = route === r;
                        return (
                          <button
                            key={r}
                            role="menuitem"
                            onClick={() => navigate(r)}
                            className={[
                              rowBase,
                              "px-2.5 py-2",
                              isActive
                                ? "bg-blue-50 dark:bg-blue-950/40"
                                : "hover:bg-blue-50/60 dark:hover:bg-blue-950/25",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                tileBase,
                                "h-8 w-8",
                                isActive
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-100 text-slate-500 group-hover:bg-blue-600 group-hover:text-white dark:bg-slate-800 dark:text-slate-400",
                              ].join(" ")}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span
                                className={[
                                  "block text-[13.5px] font-medium transition-colors",
                                  isActive
                                    ? "text-blue-700 dark:text-blue-300"
                                    : "text-slate-900 group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-300",
                                ].join(" ")}
                              >
                                {label}
                              </span>
                              <span className="mt-0.5 block text-[12px] text-slate-500 dark:text-slate-400">
                                {hint}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => navigate("feedback")}
            className={[
              "rounded-lg px-3 py-2 text-[13.5px] font-medium outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-blue-500/60",
              route === "feedback"
                ? "text-slate-900 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
            ].join(" ")}
          >
            Feedback
          </button>
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {theme === "dark" ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
          </button>

          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/60 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-x-0 top-0 max-h-[88vh] overflow-y-auto rounded-b-3xl bg-white pb-6 dark:bg-slate-950">
            <div className="flex h-16 items-center px-5">
              <span className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                TinyMedia
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div className="px-3">
              {NAV_GROUPS.map((group) => (
                <div key={group.heading} className="mb-2">
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-400 dark:text-slate-500">
                    {group.heading}
                  </p>
                  {group.items.map(({ route: r, label, hint, icon: Icon }) => {
                    const isActive = route === r;
                    return (
                      <button
                        key={r}
                        onClick={() => navigate(r)}
                        className={[
                          rowBase,
                          "px-3 py-2.5",
                          isActive
                            ? "bg-blue-50 dark:bg-blue-950/40"
                            : "active:bg-blue-50/60 dark:active:bg-blue-950/25",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            tileBase,
                            "h-9 w-9",
                            isActive
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                          ].join(" ")}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span>
                          <span
                            className={[
                              "block text-[15px] font-medium",
                              isActive
                                ? "text-blue-700 dark:text-blue-300"
                                : "text-slate-900 dark:text-slate-100",
                            ].join(" ")}
                          >
                            {label}
                          </span>
                          <span className="block text-[12.5px] text-slate-500 dark:text-slate-400">
                            {hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                <button
                  onClick={() => navigate("feedback")}
                  className="w-full rounded-xl px-3 py-3 text-left text-[15px] font-medium text-slate-700 dark:text-slate-300"
                >
                  Feedback
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}