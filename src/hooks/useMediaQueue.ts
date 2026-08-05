import { useCallback, useRef, useState } from "react";
import { uid, formatBytes } from "@/lib/core";
import type { MediaItem, MediaMeta } from "@/lib/core";

export interface QueueConfig {
  /** returns an error string if the file is rejected, else null */
  validate: (file: File) => string | null;
  probe: (file: File) => Promise<MediaMeta>;
  makePreview?: boolean;
}

export function useMediaQueue(cfg: QueueConfig) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const patch = useCallback((id: string, p: Partial<MediaItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const rejected: string[] = [];
    const accepted: MediaItem[] = [];
    for (const file of list) {
      const err = cfgRef.current.validate(file);
      if (err) {
        rejected.push(`${file.name} — ${err}`);
        continue;
      }
      accepted.push({
        id: uid(),
        file,
        status: "ready",
        progress: 0,
        meta: {},
        selected: false,
        previewUrl: cfgRef.current.makePreview ? URL.createObjectURL(file) : undefined,
      });
    }
    if (rejected.length) {
      setNotices(rejected);
      window.setTimeout(() => setNotices([]), 8000);
    }
    if (!accepted.length) return;
    setItems((prev) => [...prev, ...accepted]);
    // probe metadata in the background
    for (const it of accepted) {
      cfgRef.current.probe(it.file).then((meta) => patch(it.id, { meta }));
    }
  }, [patch]);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => {
      prev.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
      return [];
    });
  }, []);

  const removeSelected = useCallback(() => {
    setItems((prev) => {
      prev.filter((x) => x.selected).forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
      return prev.filter((x) => !x.selected);
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it)));
  }, []);

  const selectAll = useCallback((on: boolean) => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: on })));
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const resetOutputs = useCallback(() => {
    setItems((prev) =>
      prev.map((it) =>
        it.status === "done" || it.status === "error"
          ? { ...it, status: "ready", progress: 0, output: undefined, error: undefined }
          : it
      )
    );
  }, []);

  return {
    items, setItems, patch, addFiles, remove, clear, removeSelected,
    toggleSelect, selectAll, reorder, resetOutputs, notices,
  };
}

export function sizeValidator(maxBytes: number, okTypes: (file: File) => boolean, typeMsg: string) {
  return (file: File): string | null => {
    if (!okTypes(file)) return typeMsg;
    if (file.size > maxBytes) return `too large (limit ${formatBytes(maxBytes)})`;
    if (file.size === 0) return "file is empty";
    return null;
  };
}
