import { decodeEntities, stripHtml } from "./http.ts";
import type { Cue } from "./types.ts";

function pushCue(cues: Cue[], startMs: number, endMs: number, text: string, speaker?: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  const last = cues[cues.length - 1];
  if (last && last.text === cleaned && Math.abs(last.startMs - startMs) < 80) return;
  cues.push({
    startMs: Math.max(0, startMs),
    endMs: Math.max(startMs + 200, endMs),
    text: cleaned,
    speaker,
  });
}

function parseClock(value: string): number {
  const parts = value.trim().split(":");
  if (parts.length < 2) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? Math.round(n * 1000) : 0;
  }
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const minutes = Number(parts.length === 3 ? parts[1] : parts[0]);
  const seconds = Number((parts.length === 3 ? parts[2] : parts[1]).replace(",", "."));
  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

export function parseVtt(input: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = input.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    if (/^WEBVTT/i.test(lines[0]) || /^NOTE\b/i.test(lines[0]) || /^STYLE\b/i.test(lines[0])) {
      continue;
    }
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->");
    const startMs = parseClock(startRaw);
    const endMs = parseClock(endRaw.replace(/[^\d:.,].*$/, ""));
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    let speaker: string | undefined;
    const text = textLines
      .map((line) => {
        const vMatch = line.match(/^<v\s+([^>]+)>/i);
        if (vMatch) {
          speaker = vMatch[1].trim();
          return line.replace(/^<v\s+[^>]+>/i, "");
        }
        const named = line.match(/^([A-Z][A-Za-z0-9 .'_-]{1,40}):\s+(.*)$/);
        if (named) {
          speaker = named[1];
          return named[2];
        }
        return line;
      })
      .join(" ")
      .replace(/<[^>]+>/g, "");
    pushCue(cues, startMs, endMs, decodeEntities(text), speaker);
  }
  return cues;
}

export function parseSrt(input: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = input.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->");
    const startMs = parseClock(startRaw);
    const endMs = parseClock(endRaw);
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "");
    pushCue(cues, startMs, endMs, decodeEntities(text));
  }
  return cues;
}

export function parseTimedtextXml(input: string): Cue[] {
  const cues: Cue[] = [];
  const re = /<text([^>]*)>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) {
    const attrs = match[1];
    const start = Number(attrs.match(/start="([^"]+)"/)?.[1] ?? 0);
    const dur = Number(attrs.match(/dur="([^"]+)"/)?.[1] ?? 0);
    const startMs = start < 1000 && String(start).includes(".") ? Math.round(start * 1000) : Math.round(start);
    const durMs = dur < 100 && dur > 0 && String(dur).includes(".") ? Math.round(dur * 1000) : Math.round(dur);
    const text = decodeEntities(match[2].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
    pushCue(cues, startMs, startMs + (durMs || 2000), text);
  }
  return cues;
}

export function parseSrv3(input: string): Cue[] {
  const cues: Cue[] = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) {
    const attrs = match[1];
    const rawT = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "0";
    const rawD = attrs.match(/\bd="([^"]+)"/)?.[1] ?? "0";
    const start = Number(rawT);
    const dur = Number(rawD);
    if (!Number.isFinite(start)) continue;
    const startMs =
      rawT.includes(".") || (start > 0 && start < 20 && dur < 20)
        ? Math.round(start * 1000)
        : Math.round(start);
    const durMs =
      rawD.includes(".") || (dur > 0 && dur < 20 && start < 20)
        ? Math.round(dur * 1000)
        : Math.round(dur);
    const inner = match[2];
    const segs = [...inner.matchAll(/<s\b([^>]*)>([\s\S]*?)<\/s>/gi)];
    const text = decodeEntities(
      (segs.length ? segs.map((s) => s[2]).join("") : inner)
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    );
    pushCue(cues, startMs, startMs + (durMs || 2000), text);
  }
  return cues;
}

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8?: string }[];
};

export function parseJson3(input: string): Cue[] {
  const data = JSON.parse(input) as { events?: Json3Event[] };
  const cues: Cue[] = [];
  for (const event of data.events ?? []) {
    const start = event.tStartMs ?? 0;
    const dur = event.dDurationMs ?? 2000;
    const text = (event.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n+/g, " ");
    if (!text.trim() || text.trim() === "\n") continue;
    pushCue(cues, start, start + dur, text);
  }
  return cues;
}

export function parsePodcastJson(input: string): Cue[] {
  const data = JSON.parse(input) as {
    segments?: { speaker?: string; speakerName?: string; startTime?: number; endTime?: number; body?: string; text?: string }[];
    results?: { alternatives?: { transcript?: string }[] }[];
  };
  if (Array.isArray(data.segments) && data.segments.length > 0) {
    const cues: Cue[] = [];
    for (const seg of data.segments) {
      const start = Math.round((seg.startTime ?? 0) * (seg.startTime && seg.startTime > 1000 ? 1 : 1000));
      const end = Math.round((seg.endTime ?? (seg.startTime ?? 0) + 2) * (seg.endTime && seg.endTime > 1000 ? 1 : 1000));
      const text = seg.body ?? seg.text ?? "";
      pushCue(cues, start, end, text, seg.speaker ?? seg.speakerName);
    }
    return cues;
  }
  return [];
}

export function parseCaptionPayload(raw: string, contentType = ""): Cue[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const lowerType = contentType.toLowerCase();

  if (lowerType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json3 = parseJson3(trimmed);
      if (json3.length) return mergeCues(json3);
    } catch {
      /* continue */
    }
    try {
      const podcast = parsePodcastJson(trimmed);
      if (podcast.length) return mergeCues(podcast);
    } catch {
      /* continue */
    }
  }

  if (lowerType.includes("vtt") || /^WEBVTT/i.test(trimmed)) {
    const vtt = parseVtt(trimmed);
    if (vtt.length) return mergeCues(vtt);
  }
  if (lowerType.includes("srt") || trimmed.includes("-->")) {
    const srt = trimmed.includes("WEBVTT") ? parseVtt(trimmed) : parseSrt(trimmed);
    if (srt.length) return mergeCues(srt);
  }
  if (trimmed.includes("<timedtext") || /<p\b[^>]*\bt="/i.test(trimmed)) {
    const srv3 = parseSrv3(trimmed);
    if (srv3.length) return mergeCues(srv3);
  }
  if (trimmed.includes("<text") || trimmed.includes("<transcript")) {
    const xml = parseTimedtextXml(trimmed);
    if (xml.length) return mergeCues(xml);
  }
  if (lowerType.includes("html") || /<\/?(p|div|br|article)\b/i.test(trimmed)) {
    const text = stripHtml(trimmed);
    if (text) return mergeCues([{ startMs: 0, endMs: 2000, text }]);
  }

  const asText = stripHtml(trimmed);
  if (asText) return mergeCues([{ startMs: 0, endMs: 2000, text: asText }]);
  return [];
}

export function cuesToText(cues: Cue[]): string {
  if (cues.length === 0) return "";
  const parts: string[] = [];
  let currentSpeaker: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const body = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (!body) {
      buffer = [];
      return;
    }
    parts.push(currentSpeaker ? `${currentSpeaker}: ${body}` : body);
    buffer = [];
  };

  for (const cue of cues) {
    if (cue.speaker && cue.speaker !== currentSpeaker) {
      flush();
      currentSpeaker = cue.speaker;
    }
    buffer.push(cue.text);
  }
  flush();
  return parts.join("\n\n");
}

export function mergeCues(cues: Cue[], maxGapMs = 1600): Cue[] {
  if (cues.length < 2) return cues;
  const out: Cue[] = [];
  let current: Cue = { ...cues[0] };
  for (const next of cues.slice(1)) {
    const sameSpeaker = (current.speaker || "") === (next.speaker || "");
    const gap = next.startMs - current.endMs;
    const endsSentence = /[.!?…]"?$/.test(current.text.trim());
    if (sameSpeaker && gap <= maxGapMs && !endsSentence) {
      current = {
        ...current,
        endMs: next.endMs,
        text: `${current.text} ${next.text}`.replace(/\s+/g, " ").trim(),
      };
    } else {
      out.push(current);
      current = { ...next };
    }
  }
  out.push(current);
  return out;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
