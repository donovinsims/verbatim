import type { Cue, TranscriptResult } from "./types";

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function formatTimestamp(ms: number, style: "srt" | "vtt" | "short"): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  if (style === "short") {
    return hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${minutes}:${pad(seconds)}`;
  }
  const sep = style === "srt" ? "," : ".";
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${sep}${pad(millis, 3)}`;
}

function cueLine(cue: Cue): string {
  return cue.speaker ? `${cue.speaker}: ${cue.text}` : cue.text;
}

export function toPlainText(t: TranscriptResult, withTimestamps = false): string {
  const header = [t.title, t.author, t.canonicalUrl].filter(Boolean).join("\n");
  if (t.cues.length <= 1 && !withTimestamps) {
    return `${header}\n\n${t.text}`.trim();
  }
  const body = t.cues
    .map((cue) =>
      withTimestamps ? `[${formatTimestamp(cue.startMs, "short")}] ${cueLine(cue)}` : cueLine(cue),
    )
    .join(withTimestamps ? "\n" : " ");
  return `${header}\n\n${withTimestamps ? body : t.text || body}`.trim();
}

export function toMarkdown(t: TranscriptResult): string {
  const meta = [
    `# ${t.title}`,
    "",
    t.author ? `**${t.author}**` : null,
    t.canonicalUrl ? `[Source](${t.canonicalUrl})` : null,
    t.durationSeconds ? `Duration: ${formatTimestamp(t.durationSeconds * 1000, "short")}` : null,
    t.language ? `Language: ${t.language}` : null,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const body = t.cues
    .map((cue) => {
      const time = formatTimestamp(cue.startMs, "short");
      return `**${time}** ${cueLine(cue)}`;
    })
    .join("\n\n");
  return `${meta}${body}\n`;
}

export function toSrt(t: TranscriptResult): string {
  return t.cues
    .map((cue, i) => {
      return `${i + 1}\n${formatTimestamp(cue.startMs, "srt")} --> ${formatTimestamp(cue.endMs, "srt")}\n${cueLine(cue)}\n`;
    })
    .join("\n");
}

export function toVtt(t: TranscriptResult): string {
  const body = t.cues
    .map((cue) => {
      const text = cue.speaker ? `<v ${cue.speaker}>${cue.text}` : cue.text;
      return `${formatTimestamp(cue.startMs, "vtt")} --> ${formatTimestamp(cue.endMs, "vtt")}\n${text}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function toJson(t: TranscriptResult): string {
  return JSON.stringify(
    {
      title: t.title,
      author: t.author,
      url: t.canonicalUrl,
      language: t.language,
      durationSeconds: t.durationSeconds,
      isGenerated: t.isGenerated,
      wordCount: t.wordCount,
      cues: t.cues,
      text: t.text,
    },
    null,
    2,
  );
}

export type ExportFormat = "txt" | "md" | "srt" | "vtt" | "json";

export function exportTranscript(t: TranscriptResult, format: ExportFormat): { filename: string; mime: string; content: string } {
  const slug = slugify(t.title || "transcript");
  switch (format) {
    case "md":
      return { filename: `${slug}.md`, mime: "text/markdown;charset=utf-8", content: toMarkdown(t) };
    case "srt":
      return { filename: `${slug}.srt`, mime: "application/x-subrip;charset=utf-8", content: toSrt(t) };
    case "vtt":
      return { filename: `${slug}.vtt`, mime: "text/vtt;charset=utf-8", content: toVtt(t) };
    case "json":
      return { filename: `${slug}.json`, mime: "application/json;charset=utf-8", content: toJson(t) };
    default:
      return { filename: `${slug}.txt`, mime: "text/plain;charset=utf-8", content: toPlainText(t, true) };
  }
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "transcript";
}
