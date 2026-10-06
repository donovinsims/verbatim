import type { Cue, ExportFormat, TranscriptResult } from "./types";
import { formatClock, formatSrtTime, formatVttTime } from "./time";

export type FormatOptions = {
  timestamps?: boolean;
};

export function serializeTranscript(
  transcript: TranscriptResult,
  format: ExportFormat,
  options: FormatOptions = {},
): string {
  switch (format) {
    case "txt":
      return toTxt(transcript, options);
    case "md":
      return toMarkdown(transcript, options);
    case "srt":
      return toSrt(transcript.cues);
    case "vtt":
      return toVtt(transcript.cues, transcript.title);
    case "json":
      return toJson(transcript);
    default:
      return toTxt(transcript, options);
  }
}

export function toTxt(transcript: TranscriptResult, options: FormatOptions = {}): string {
  const header = [transcript.title, transcript.author, transcript.canonicalUrl].filter(Boolean).join("\n");
  const body = options.timestamps
    ? transcript.cues
        .map((c) => `[${formatClock(c.startMs)}] ${speakerPrefix(c)}${c.text}`)
        .join("\n")
    : transcript.text;
  return `${header}\n\n${body}\n`;
}

export function toMarkdown(transcript: TranscriptResult, options: FormatOptions = {}): string {
  const lines = [
    `# ${transcript.title}`,
    "",
    transcript.author ? `*${transcript.author}*` : "",
    transcript.canonicalUrl ? `[Source](${transcript.canonicalUrl})` : "",
    transcript.wordCount ? `${transcript.wordCount} words` : "",
    "",
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
  const body = transcript.cues.map((c) => {
    const who = c.speaker ? `**${c.speaker}:** ` : "";
    if (options.timestamps) return `- \`${formatClock(c.startMs)}\` ${who}${c.text}`;
    return `- ${who}${c.text}`;
  });
  return `${lines.join("\n")}\n${body.join("\n")}\n`;
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => {
      return `${i + 1}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${speakerPrefix(c)}${c.text}\n`;
    })
    .join("\n");
}

export function toVtt(cues: Cue[], title?: string): string {
  const header = title ? `WEBVTT - ${title}\n\n` : "WEBVTT\n\n";
  const body = cues
    .map((c) => {
      const who = c.speaker ? `<v ${c.speaker}>` : "";
      return `${formatVttTime(c.startMs)} --> ${formatVttTime(c.endMs)}\n${who}${c.text}\n`;
    })
    .join("\n");
  return header + body;
}

export function toJson(transcript: TranscriptResult): string {
  return `${JSON.stringify(transcript, null, 2)}\n`;
}

export function extensionFor(format: ExportFormat): string {
  return format;
}

export function mimeFor(format: ExportFormat): string {
  switch (format) {
    case "txt":
      return "text/plain;charset=utf-8";
    case "md":
      return "text/markdown;charset=utf-8";
    case "srt":
      return "application/x-subrip;charset=utf-8";
    case "vtt":
      return "text/vtt;charset=utf-8";
    case "json":
      return "application/json;charset=utf-8";
  }
}

export function safeFilename(title: string, format: ExportFormat): string {
  const base = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "transcript";
  return `${base}.${extensionFor(format)}`;
}

function speakerPrefix(c: Cue): string {
  return c.speaker ? `${c.speaker}: ` : "";
}
