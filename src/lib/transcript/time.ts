/** Parse "1:23:45", "4:05", "1.500", or raw seconds into milliseconds. */
export function parseClockToMs(raw: string | number | undefined | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 100_000 ? Math.round(raw) : Math.round(raw * 1000);
  }
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return undefined;
    return n > 100_000 ? Math.round(n) : Math.round(n * 1000);
  }
  const parts = s.replace(",", ".").split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return Math.round(((h ?? 0) * 3600 + (m ?? 0) * 60 + (sec ?? 0)) * 1000);
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return Math.round(((m ?? 0) * 60 + (sec ?? 0)) * 1000);
  }
  return undefined;
}

export function parseSrtTime(raw: string): number {
  const m = raw.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) {
    const vtt = raw.trim().match(/(\d+):(\d+)[,.](\d+)/);
    if (!vtt) return 0;
    const mm = Number(vtt[1]);
    const ss = Number(vtt[2]);
    const ms = Number((vtt[3] ?? "0").padEnd(3, "0").slice(0, 3));
    return mm * 60_000 + ss * 1000 + ms;
  }
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ms = Number((m[4] ?? "0").padEnd(3, "0").slice(0, 3));
  return h * 3_600_000 + mm * 60_000 + ss * 1000 + ms;
}

export function formatSrtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const milli = t % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
}

export function formatVttTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const milli = t % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(milli, 3)}`;
}

export function formatClock(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${pad(m, 2)}:${pad(s, 2)}`;
  return `${m}:${pad(s, 2)}`;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

export function countWords(text: string): number {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

export function flattenCues(cues: { text: string }[]): string {
  return cues
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join("\n");
}
