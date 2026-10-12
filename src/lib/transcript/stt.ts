import { cuesToText, wordCount } from "./parse-caption";
import type { Cue, TranscriptResult } from "./types";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_DURATION_SEC = 2 * 60 * 60;

type SttWord = {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
  start_time?: number;
  end_time?: number;
  startMs?: number;
  endMs?: number;
};

type SttResponse = {
  text?: string;
  transcript?: string;
  words?: SttWord[];
  segments?: {
    text?: string;
    start?: number;
    end?: number;
    speaker?: string;
    words?: SttWord[];
  }[];
};

function asMs(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value > 1000 || value === 0 ? Math.round(value) : Math.round(value * 1000);
}

function wordsToCues(words: SttWord[]): Cue[] {
  const cues: Cue[] = [];
  let buffer: string[] = [];
  let startMs = 0;
  let endMs = 0;

  const flush = () => {
    const text = buffer.join("").replace(/\s+/g, " ").trim();
    if (text) cues.push({ startMs, endMs: Math.max(endMs, startMs + 400), text });
    buffer = [];
  };

  for (const word of words) {
    const token = (word.word ?? word.text ?? "").toString();
    if (!token) continue;
    const wStart = asMs(word.start ?? word.start_time ?? word.startMs) ?? endMs;
    const wEnd = asMs(word.end ?? word.end_time ?? word.endMs) ?? wStart + 300;
    const gap = wStart - endMs;
    const endsSentence = /[.!?…]"?$/.test(buffer.join("").trim());
    if (buffer.length === 0) {
      startMs = wStart;
    } else if (gap > 1400 || endsSentence) {
      flush();
      startMs = wStart;
    }
    const needsSpace = buffer.length > 0 && !/^\s|^[.,!?']/.test(token) && !/\s$/.test(buffer[buffer.length - 1] ?? "");
    buffer.push(needsSpace ? ` ${token}` : token);
    endMs = wEnd;
  }
  flush();
  return cues;
}

function responseToCues(data: SttResponse): Cue[] {
  if (Array.isArray(data.segments) && data.segments.length > 0) {
    const cues: Cue[] = [];
    for (const seg of data.segments) {
      if (seg.words?.length) {
        cues.push(...wordsToCues(seg.words));
        continue;
      }
      const text = (seg.text ?? "").trim();
      if (!text) continue;
      const start = asMs(seg.start) ?? (cues.at(-1)?.endMs ?? 0);
      const end = asMs(seg.end) ?? start + 2000;
      cues.push({ startMs: start, endMs: end, text, speaker: seg.speaker });
    }
    if (cues.length) return cues;
  }
  if (Array.isArray(data.words) && data.words.length > 0) {
    const cues = wordsToCues(data.words);
    if (cues.length) return cues;
  }
  const text = (data.text || data.transcript || "").trim();
  if (text) return [{ startMs: 0, endMs: 2000, text }];
  return [];
}

export function canTranscribeAudio(durationSeconds: number | null): boolean {
  if (durationSeconds == null) return true;
  return durationSeconds > 0 && durationSeconds <= MAX_DURATION_SEC;
}

export async function transcribeAudioUrl(opts: {
  audioUrl: string;
  sourceUrl: string;
  title: string;
  author: string;
  durationSeconds: number | null;
  thumbnail?: string | null;
}): Promise<TranscriptResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("Audio transcription is unavailable"), { code: "no_transcript" as const });
  }
  if (!canTranscribeAudio(opts.durationSeconds)) {
    throw Object.assign(
      new Error("This episode is too long to transcribe here. If it is on YouTube, paste that video URL."),
      { code: "no_transcript" as const },
    );
  }

  const audioRes = await fetch(opts.audioUrl, {
    headers: {
      "User-Agent": "VerbatimTranscript/1.0 (https://grok.com)",
      Accept: "audio/*,*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  if (!audioRes.ok) {
    throw Object.assign(new Error(`Could not download episode audio (${audioRes.status})`), {
      code: "network" as const,
    });
  }
  const mime = audioRes.headers.get("content-type") || "audio/mpeg";
  const buf = Buffer.from(await audioRes.arrayBuffer());
  if (buf.byteLength < 2_000) {
    throw Object.assign(new Error("Episode audio was empty"), { code: "no_transcript" as const });
  }
  if (buf.byteLength > MAX_BYTES) {
    throw Object.assign(
      new Error("This episode’s audio file is too large to transcribe here. If it is on YouTube, paste that URL."),
      { code: "too_large" as const },
    );
  }

  const filename = mime.includes("wav")
    ? "episode.wav"
    : mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")
      ? "episode.m4a"
      : mime.includes("ogg")
        ? "episode.ogg"
        : "episode.mp3";

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buf)], { type: mime.split(";")[0] || "audio/mpeg" }),
    filename,
  );

  const sttRes = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!sttRes.ok) {
    const errText = await sttRes.text().catch(() => "");
    throw Object.assign(new Error(`Transcription failed (${sttRes.status})`), {
      code: "network" as const,
      details: errText.slice(0, 300),
    });
  }
  const data = (await sttRes.json()) as SttResponse;
  const cues = responseToCues(data);
  if (!cues.length) {
    throw Object.assign(new Error("Transcription returned an empty transcript"), { code: "no_transcript" as const });
  }
  const text = cuesToText(cues);
  return {
    url: opts.sourceUrl,
    canonicalUrl: opts.sourceUrl,
    source: "podcast",
    title: opts.title,
    author: opts.author,
    durationSeconds: opts.durationSeconds,
    language: null,
    isGenerated: true,
    thumbnail: opts.thumbnail ?? null,
    fetchedAt: new Date().toISOString(),
    cues,
    text,
    wordCount: wordCount(text),
    trackLabel: "Audio transcript",
  };
}
