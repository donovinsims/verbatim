import JSZip from "jszip";
import type { ExportFormat, TranscriptResult } from "./types";
import { mimeFor, safeFilename, serializeTranscript, type FormatOptions } from "./formats";

export function downloadText(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function exportTranscript(
  transcript: TranscriptResult,
  format: ExportFormat,
  options: FormatOptions = {},
): void {
  downloadText(
    safeFilename(transcript.title, format),
    serializeTranscript(transcript, format, options),
    mimeFor(format),
  );
}

export async function exportTranscriptsZip(
  transcripts: TranscriptResult[],
  format: ExportFormat,
  options: FormatOptions = {},
): Promise<void> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const t of transcripts) {
    let name = safeFilename(t.title, format);
    if (used.has(name.toLowerCase())) {
      const stamp = t.canonicalUrl.replace(/[^a-z0-9]+/gi, "").slice(-8);
      name = safeFilename(`${t.title}-${stamp}`, format);
    }
    used.add(name.toLowerCase());
    zip.file(name, serializeTranscript(t, format, options));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(`verbatim-${transcripts.length}.${format}.zip`, blob);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "true");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
