const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "ep",
  "episode",
  "podcast",
  "show",
]);

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[#|_]+/g, " ")
    .replace(/\b(ep|episode)\s*\d+\b/g, " ")
    .replace(/^\s*\d+\s*[:.\-)]\s*/, " ")
    .replace(/^\s*\d+\s+/, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokens(title: string): string[] {
  return normalizeTitle(title)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function scoreTitle(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return Math.max(0.72, shorter / longer);
  }
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (!ta.size || !tb.size) return dice(na, nb);
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  const jaccard = overlap / new Set([...ta, ...tb]).size;
  const overlapCoeff = overlap / Math.min(ta.size, tb.size);
  const diceScore = dice(na, nb);
  return Math.max(jaccard, overlapCoeff * 0.95, diceScore * 0.9);
}

export function scoreDuration(aMs?: number, bMs?: number): number {
  if (!aMs || !bMs || aMs <= 0 || bMs <= 0) return 0.5;
  const delta = Math.abs(aMs - bMs);
  if (delta <= 5_000) return 1;
  if (delta <= 15_000) return 0.92;
  if (delta <= 30_000) return 0.8;
  const pct = delta / Math.max(aMs, bMs);
  if (pct <= 0.08) return 0.78;
  if (pct <= 0.15) return 0.62;
  if (pct <= 0.25) return 0.4;
  return Math.max(0, 1 - pct);
}

export function combinedScore(titleA: string, titleB: string, durationA?: number, durationB?: number): number {
  const t = scoreTitle(titleA, titleB);
  const d = scoreDuration(durationA, durationB);
  return t * 0.72 + d * 0.28;
}

export function isGoodEpisodeMatch(
  titleA: string,
  titleB: string,
  durationA?: number,
  durationB?: number,
): boolean {
  const t = scoreTitle(titleA, titleB);
  const d = scoreDuration(durationA, durationB);
  if (t >= 0.86 && d >= 0.4) return true;
  if (t >= 0.6 && d >= 0.78) return true;
  return combinedScore(titleA, titleB, durationA, durationB) >= 0.7;
}

function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bg = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      set.set(g, (set.get(g) ?? 0) + 1);
    }
    return set;
  };
  const aa = bg(a);
  const bb = bg(b);
  let overlap = 0;
  for (const [g, n] of aa) overlap += Math.min(n, bb.get(g) ?? 0);
  const total = [...aa.values()].reduce((s, n) => s + n, 0) + [...bb.values()].reduce((s, n) => s + n, 0);
  return total ? (2 * overlap) / total : 0;
}
