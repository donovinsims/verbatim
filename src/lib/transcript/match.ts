import type { Cue, TranscriptResult } from "./types.ts";

export function parseDurationSeconds(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return value > 100_000 ? Math.round(value / 1000) : Math.round(value);
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const nested =
      rec.simpleText ??
      rec.label ??
      rec.lengthSeconds ??
      (Array.isArray(rec.runs) ? (rec.runs as { text?: string }[]).map((r) => r.text ?? "").join("") : null);
    return parseDurationSeconds(nested);
  }
  const v = String(value).trim();
  if (!v) return null;

  const clock = v.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (clock) {
    if (clock[3] != null) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  const hours = Number(v.match(/(\d+)\s*h(?:our)?s?/i)?.[1] ?? 0);
  const mins = Number(v.match(/(\d+)\s*m(?:in(?:ute)?s?)?/i)?.[1] ?? 0);
  const secs = Number(v.match(/(\d+)\s*s(?:ec(?:ond)?s?)?/i)?.[1] ?? 0);
  if (hours || mins || secs) return hours * 3600 + mins * 60 + secs;

  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n > 100_000 ? Math.round(n / 1000) : n;
  }
  return null;
}

export function normTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(episode|ep|feat|ft|official|video|audio|podcast|full|4k)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleScore(haystack: string, needle: string): number {
  const hay = normTitle(haystack);
  const need = normTitle(needle);
  if (!hay || !need) return 0;
  if (hay === need) return 1;
  if (hay.includes(need) || need.includes(hay)) return 0.9;
  const words = need.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length;
}

export type RankedYoutubeHit = {
  videoId: string;
  title: string;
  author?: string;
  durationSeconds?: number | null;
  score: number;
};

export function youtubeCandidateScore(
  hit: { title: string; durationSeconds?: number | null },
  episodeTitle: string,
  showTitle: string,
  episodeDuration: number | null,
): number {
  const title = Math.max(
    titleScore(hit.title, episodeTitle),
    showTitle ? titleScore(hit.title, `${showTitle} ${episodeTitle}`) : 0,
  );
  const dur = hit.durationSeconds ?? null;
  if (episodeDuration && episodeDuration >= 90) {
    if (dur == null) return title * 0.72;
    const ratio = dur / episodeDuration;
    if (dur < 90 && episodeDuration > 8 * 60) return 0;
    if (ratio < 0.45) return title * 0.15;
    if (ratio > 1.8) return title * 0.55;
    const closeness = 1 - Math.min(1, Math.abs(1 - ratio) / 0.35);
    return title * 0.55 + closeness * 0.45;
  }
  if (dur != null && dur < 75) return title * 0.35;
  return title;
}

export function rankYoutubeHits<T extends { videoId: string; title: string; durationSeconds?: number | null }>(
  hits: T[],
  episodeTitle: string,
  showTitle: string,
  episodeDuration: number | null,
): Array<T & { score: number }> {
  return hits
    .map((hit) => ({
      ...hit,
      score: youtubeCandidateScore(hit, episodeTitle, showTitle, episodeDuration),
    }))
    .filter((row) => row.score >= 0.42)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0);
    });
}

export function transcriptLooksComplete(
  result: Pick<TranscriptResult, "wordCount" | "durationSeconds" | "cues"> & { cues: Cue[] },
  expectedSeconds: number | null,
): boolean {
  const words = result.wordCount ?? 0;
  const videoDur = result.durationSeconds ?? null;
  if (expectedSeconds && expectedSeconds >= 90) {
    if (videoDur && videoDur < expectedSeconds * 0.45) return false;
    const minWords = Math.max(80, Math.round(expectedSeconds * 0.35));
    if (words < minWords && (result.cues?.length ?? 0) < 40) return false;
  }
  return words >= 12 || (result.cues?.length ?? 0) >= 3;
}
