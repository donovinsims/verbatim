import { exportTranscript, slugify, type ExportFormat } from "./formats";
import type { TranscriptResult } from "./types";

export function downloadTextFile(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadTranscript(transcript: TranscriptResult, format: ExportFormat) {
  const file = exportTranscript(transcript, format);
  downloadTextFile(file.filename, file.mime, file.content);
}

export async function downloadZip(transcripts: TranscriptResult[], format: ExportFormat) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used = new Set<string>();
  for (const t of transcripts) {
    const file = exportTranscript(t, format);
    let name = file.filename;
    if (used.has(name)) {
      const stem = name.replace(/\.[^.]+$/, "");
      const ext = name.slice(stem.length);
      let i = 2;
      while (used.has(`${stem}-${i}${ext}`)) i += 1;
      name = `${stem}-${i}${ext}`;
    }
    used.add(name);
    zip.file(name, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `verbatim-${slugify(transcripts[0]?.title || "transcripts")}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
