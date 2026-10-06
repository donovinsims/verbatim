import type { Cue } from "./types";
import { parseSrtTime } from "./time";
import { decodeHtmlEntities, stripHtml } from "./http";

const MIN_CUE_MS = 200;

export function parseCaptionBytes(bytes: Uint8Array | string, mimeHint?: string): Cue[] {
  const text = typeof bytes === "string" ? bytes : decodeCaptionText(bytes);
  const trimmed = stripBom(text).trim();
  if (!trimmed) return [];
  const hint = (mimeHint ?? "").toLowerCase();

  if (hint.includes("json3") || looksLikeJson3(trimmed)) {
    return normalizeCues(parseJson3(trimmed));
  }
  if (hint.includes("json") || looksLikeJson(trimmed)) {
    return normalizeCues(parseJsonTranscript(trimmed));
  }
  if (hint.includes("vtt") || trimmed.startsWith("WEBVTT")) {
    return normalizeCues(parseVtt(trimmed));
  }
  if (hint.includes("srt") || looksLikeSrt(trimmed)) {
    return normalizeCues(parseSrt(trimmed));
  }
  if (hint.includes("ttml") || hint.includes("xml") || trimmed.startsWith("<")) {
    const xmlCues = parseXmlCaptions(trimmed);
    if (xmlCues.length) return normalizeCues(xmlCues);
  }
  if (looksLikeSrt(trimmed)) return normalizeCues(parseSrt(trimmed));
  if (looksLikeVtt(trimmed)) return normalizeCues(parseVtt(trimmed));
  return [];
}

export function parseCaptionText(text: string, mimeHint?: string): Cue[] {
  return parseCaptionBytes(text, mimeHint);
}

function decodeCaptionText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function looksLikeJson(text: string): boolean {
  return text.startsWith("{") || text.startsWith("[");
}

function looksLikeJson3(text: string): boolean {
  return text.includes('"events"') && text.includes("tStartMs");
}

function looksLikeSrt(text: string): boolean {
  return /\d+\s+\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(text);
}

function looksLikeVtt(text: string): boolean {
  return text.includes("-->") && (text.startsWith("WEBVTT") || /\d{1,2}:\d{2}[.]\d{3}\s+-->/.test(text));
}

function parseJson3(text: string): Cue[] {
  let data: { events?: Json3Event[] };
  try {
    data = JSON.parse(text) as { events?: Json3Event[] };
  } catch {
    return [];
  }
  const cues: Cue[] = [];
  for (const event of data.events ?? []) {
    if (!event.segs?.length) continue;
    const textLine = event.segs
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n+/g, " ")
      .trim();
    if (!textLine || textLine === "\n") continue;
    const start = event.tStartMs ?? 0;
    const end = start + (event.dDurationMs ?? 2000);
    cues.push({ startMs: start, endMs: Math.max(start + MIN_CUE_MS, end), text: decodeHtmlEntities(textLine) });
  }
  return cues;
}

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8?: string }[];
};

function parseJsonTranscript(text: string): Cue[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (data && typeof data === "object" && "events" in data) {
    return parseJson3(text);
  }
  if (Array.isArray(data)) {
    return data.flatMap((row) => cueFromUnknown(row));
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.segments)) {
      return obj.segments.flatMap((row) => cueFromUnknown(row));
    }
    if (Array.isArray(obj.transcripts)) {
      return obj.transcripts.flatMap((row) => cueFromUnknown(row));
    }
    if (Array.isArray(obj.cues)) {
      return obj.cues.flatMap((row) => cueFromUnknown(row));
    }
    if (Array.isArray(obj.results)) {
      return obj.results.flatMap((row) => cueFromUnknown(row));
    }
    if (typeof obj.text === "string" && Array.isArray(obj.words)) {
      return wordsToCues(obj.words as unknown[]);
    }
  }
  return [];
}

function cueFromUnknown(row: unknown): Cue[] {
  if (!row || typeof row !== "object") return [];
  const r = row as Record<string, unknown>;
  const text = String(r.text ?? r.body ?? r.utterance ?? r.content ?? "").trim();
  if (!text) return [];
  const start =
    numMs(r.startMs) ??
    numMs(r.startTime) ??
    numSec(r.start) ??
    numMs(r.begin) ??
    0;
  const end =
    numMs(r.endMs) ??
    numMs(r.endTime) ??
    numSec(r.end) ??
    start + 2000;
  const speaker = optionalString(r.speaker ?? r.speakerLabel ?? r.name);
  return [{ startMs: start, endMs: Math.max(start + MIN_CUE_MS, end), text: stripHtml(text), speaker }];
}

function wordsToCues(words: unknown[]): Cue[] {
  const parsed: Cue[] = [];
  for (const w of words) {
    if (!w || typeof w !== "object") continue;
    const r = w as Record<string, unknown>;
    const text = String(r.text ?? r.word ?? "").trim();
    if (!text) continue;
    const start = numMs(r.startMs) ?? numSec(r.start) ?? 0;
    const end = numMs(r.endMs) ?? numSec(r.end) ?? start + 400;
    const speaker = optionalString(r.speaker);
    parsed.push({ startMs: start, endMs: end, text, speaker });
  }
  return groupWordCues(parsed);
}

export function groupWordCues(words: Cue[]): Cue[] {
  const cues: Cue[] = [];
  let current: Cue | null = null;
  for (const word of words) {
    const speakerChanged = current && (current.speaker ?? "") !== (word.speaker ?? "");
    const tooLong = current && word.endMs - current.startMs > 8000;
    const punctuated = current && /[.!?]$/.test(current.text) && word.startMs - current.endMs > 180;
    if (!current || speakerChanged || tooLong || punctuated) {
      if (current) cues.push(current);
      current = { ...word };
      continue;
    }
    const joiner = /^[.,!?)]/.test(word.text) ? "" : " ";
    current = {
      startMs: current.startMs,
      endMs: word.endMs,
      text: `${current.text}${joiner}${word.text}`.replace(/\s+/g, " ").trim(),
      speaker: current.speaker,
    };
  }
  if (current) cues.push(current);
  return cues;
}

function parseVtt(text: string): Cue[] {
  const body = text.replace(/^WEBVTT[^\n]*\n/, "");
  const blocks = body.split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("NOTE") && !l.startsWith("STYLE"));
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim().split(/\s+/)[0] ?? "");
    const textLines = lines.filter((l) => l !== timeLine && !/^\d+$/.test(l));
    const cueText = stripHtml(textLines.join(" ").replace(/<v\s+([^>]+)>/gi, "$1: "));
    if (!cueText) continue;
    const speakerMatch = textLines.join(" ").match(/<v\s+([^>]+)>/i);
    cues.push({
      startMs: parseSrtTime(startRaw ?? "0"),
      endMs: parseSrtTime(endRaw ?? "0"),
      text: cueText,
      speaker: speakerMatch?.[1]?.trim(),
    });
  }
  return cues;
}

function parseSrt(text: string): Cue[] {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    if (!lines.length) continue;
    const timeIndex = lines.findIndex((l) => l.includes("-->"));
    if (timeIndex < 0) continue;
    const [startRaw, endRaw] = lines[timeIndex]!.split("-->").map((s) => s.trim());
    const cueText = stripHtml(lines.slice(timeIndex + 1).join(" "));
    if (!cueText) continue;
    cues.push({
      startMs: parseSrtTime(startRaw ?? "0"),
      endMs: parseSrtTime(endRaw ?? "0"),
      text: cueText,
    });
  }
  return cues;
}

function parseXmlCaptions(text: string): Cue[] {
  const transcript = [...text.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)];
  if (transcript.length) {
    return transcript.map((m) => {
      const attrs = m[1] ?? "";
      const start = Number(attr(attrs, "start") ?? 0);
      const dur = Number(attr(attrs, "dur") ?? attr(attrs, "duration") ?? 2);
      const startMs = start > 1000 ? start : start * 1000;
      const durMs = dur > 1000 ? dur : dur * 1000;
      return {
        startMs,
        endMs: startMs + durMs,
        text: stripHtml(m[2] ?? ""),
      };
    }).filter((c) => c.text);
  }

  const pTags = [...text.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)];
  if (pTags.length) {
    return pTags
      .map((m) => {
        const attrs = m[1] ?? "";
        const begin = attr(attrs, "begin") ?? attr(attrs, "start") ?? "0";
        const end = attr(attrs, "end");
        const dur = attr(attrs, "dur");
        const startMs = ttmlTimeToMs(begin);
        const endMs = end ? ttmlTimeToMs(end) : startMs + (dur ? ttmlTimeToMs(dur) : 2000);
        const speaker = attr(attrs, "tts:origin") ?? undefined;
        return {
          startMs,
          endMs,
          text: stripHtml(m[2] ?? ""),
          speaker,
        };
      })
      .filter((c) => c.text);
  }
  return [];
}

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return m?.[1];
}

function ttmlTimeToMs(raw: string): number {
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000);
  if (raw.endsWith("ms")) return Math.round(Number(raw.slice(0, -2)));
  if (raw.endsWith("s")) return Math.round(Number(raw.slice(0, -1)) * 1000);
  if (raw.endsWith("t")) return Math.round(Number(raw.slice(0, -1)) / 90);
  return parseSrtTime(raw.replace(".", ","));
}

function numMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return undefined;
}

function numSec(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 1000);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n * 1000);
  }
  return undefined;
}

function optionalString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return undefined;
}

export function normalizeCues(cues: Cue[]): Cue[] {
  const cleaned = cues
    .map((c) => ({
      startMs: Math.max(0, Math.round(c.startMs)),
      endMs: Math.max(0, Math.round(c.endMs)),
      text: c.text.replace(/\s+/g, " ").trim(),
      speaker: c.speaker?.trim() || undefined,
    }))
    .filter((c) => c.text)
    .map((c) => ({
      ...c,
      endMs: c.endMs <= c.startMs ? c.startMs + 1000 : c.endMs,
    }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged: Cue[] = [];
  for (const cue of cleaned) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.text === cue.text &&
      (cue.startMs <= prev.endMs + 80) &&
      (prev.speaker ?? "") === (cue.speaker ?? "")
    ) {
      prev.endMs = Math.max(prev.endMs, cue.endMs);
      continue;
    }
    merged.push({ ...cue });
  }
  return merged;
}
