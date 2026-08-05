import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

interface Props {
  accept: string;
  multiple?: boolean;
  onFiles: (files: FileList | File[]) => void;
  hint: string;
  compact?: boolean;
  disabled?: boolean;
}

export function Dropzone({ accept, multiple = true, onFiles, hint, compact, disabled }: Props) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (disabled) return;
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
    },
    [onFiles, disabled]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Add files"
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={[
        "group w-full cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
        over
          ? "border-accent bg-accent/[0.05] scale-[1.005]"
          : "border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 hover:border-accent/50 hover:bg-accent/[0.03]",
        compact ? "px-5 py-5" : "px-6 py-14 sm:py-16",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className={compact ? "flex items-center gap-3.5" : "flex flex-col items-center gap-4 text-center"}>
        <span
          className={[
            "flex shrink-0 items-center justify-center rounded-full transition-all duration-200",
            over ? "bg-accent text-white" : "bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 group-hover:text-accent group-hover:ring-accent/30",
            compact ? "h-9 w-9" : "h-14 w-14",
          ].join(" ")}
        >
          <Upload className={compact ? "h-4 w-4" : "h-6 w-6"} strokeWidth={1.75} />
        </span>
        <div>
          <p className={["font-medium text-slate-800 dark:text-slate-100", compact ? "text-sm" : "text-base"].join(" ")}>
            {compact ? "Add more files" : "Drop files here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
      </div>
    </div>
  );
}