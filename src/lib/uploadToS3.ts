// src/lib/uploadToS3.ts
// Fire-and-forget upload of a PROCESSED result to S3, via a presigned POST.
// Deduplicates by content hash: identical output → identical key → no dupes.
// Failures are logged, never surfaced to the user — this upload is for the
// operator's records and must not affect the user's own result/download.

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Hashes uploaded this session, to skip redundant work.
const uploadedKeys = new Set<string>();

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extFromName(name: string): string {
  const m = name.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : "bin";
}

/**
 * Uploads `blob` to S3 in the background. Never throws — resolves to a boolean
 * indicating whether it stored (false = skipped/failed, harmless).
 */
export async function uploadResultToS3(blob: Blob, filename: string): Promise<boolean> {
  try {
    const hash = await sha256Hex(blob);
    const key = `uploads/${hash}.${extFromName(filename)}`;

    // Session-level skip: already sent this exact content.
    if (uploadedKeys.has(key)) return false;

    const presignRes = await fetch(`${API_BASE}/api/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        content_type: blob.type || "application/octet-stream",
        size: blob.size,
        key,
      }),
    });
    // 501 = S3 not configured on server; 400 = rejected. Either way, skip quietly.
    if (!presignRes.ok) return false;

    const { upload_url, fields } = await presignRes.json();
    const form = new FormData();
    Object.entries(fields as Record<string, string>).forEach(([k, v]) => form.append(k, v));
    form.append("file", blob);

    const putRes = await fetch(upload_url, { method: "POST", body: form });
    if (putRes.ok) {
      uploadedKeys.add(key);
      return true;
    }
    return false;
  } catch (err) {
    // Deliberately swallowed — operator-side upload must not break the user flow.
    console.debug("S3 upload skipped:", err);
    return false;
  }
}