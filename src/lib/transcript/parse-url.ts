import type { ParsedSourceUrl, ParsedUrlKind } from "./types";

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const APPLE_HOSTS = new Set([
  "podcasts.apple.com",
  "itunes.apple.com",
  "geo.itunes.apple.com",
]);

const SPOTIFY_HOSTS = new Set([
  "open.spotify.com",
  "play.spotify.com",
  "spotify.link",
  "spotify.com",
  "www.spotify.com",
]);

export function splitInputUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,]+/)) {
    const url = part.trim();
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function parseSourceUrl(raw: string): ParsedSourceUrl {
  const originalUrl = raw.trim();
  const withScheme = ensureScheme(originalUrl);
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return {
      kind: "unknown",
      originalUrl,
      canonicalUrl: originalUrl,
    };
  }

  const host = url.hostname.toLowerCase();

  if (YT_HOSTS.has(host)) {
    return parseYouTube(url, originalUrl);
  }
  if (APPLE_HOSTS.has(host)) {
    return parseApple(url, originalUrl);
  }
  if (SPOTIFY_HOSTS.has(host)) {
    return parseSpotify(url, originalUrl);
  }
  if (looksLikeRss(url)) {
    return {
      kind: "rss",
      originalUrl,
      canonicalUrl: url.toString(),
    };
  }
  return {
    kind: "unknown",
    originalUrl,
    canonicalUrl: url.toString(),
  };
}

export function canonicalJobKey(input: {
  url: string;
  feedUrl?: string;
  guid?: string;
}): string {
  if (input.feedUrl && input.guid) {
    return `ep:${normalizeKey(input.feedUrl)}::${normalizeKey(input.guid)}`;
  }
  const parsed = parseSourceUrl(input.url);
  return `${parsed.kind}:${normalizeKey(parsed.canonicalUrl)}`;
}

function parseYouTube(url: URL, originalUrl: string): ParsedSourceUrl {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let videoId: string | undefined;
  let playlistId = url.searchParams.get("list") ?? undefined;

  if (host === "youtu.be" || host === "www.youtu.be") {
    videoId = parts[0] || undefined;
  } else if (parts[0] === "watch") {
    videoId = url.searchParams.get("v") ?? undefined;
  } else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") {
    videoId = parts[1] || undefined;
  } else if (parts[0] === "playlist") {
    playlistId = url.searchParams.get("list") ?? parts[1] ?? playlistId;
  } else if (url.searchParams.get("v")) {
    videoId = url.searchParams.get("v") ?? undefined;
  }

  videoId = sanitizeYouTubeId(videoId);
  playlistId = playlistId?.trim() || undefined;

  if (videoId) {
    return {
      kind: "youtube-video",
      originalUrl,
      canonicalUrl: playlistId
        ? `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      playlistId,
    };
  }
  if (playlistId) {
    return {
      kind: "youtube-playlist",
      originalUrl,
      canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
      playlistId,
    };
  }
  return { kind: "unknown", originalUrl, canonicalUrl: url.toString() };
}

function parseApple(url: URL, originalUrl: string): ParsedSourceUrl {
  const episodeId =
    url.searchParams.get("i") ??
    url.searchParams.get("episodeId") ??
    undefined;
  const showMatch = url.pathname.match(/\/id(\d+)/i);
  const showId = showMatch?.[1];
  if (episodeId && showId) {
    return {
      kind: "apple-episode",
      originalUrl,
      canonicalUrl: `https://podcasts.apple.com/podcast/id${showId}?i=${episodeId}`,
      appleShowId: showId,
      appleEpisodeId: episodeId,
    };
  }
  if (showId) {
    return {
      kind: "apple-show",
      originalUrl,
      canonicalUrl: `https://podcasts.apple.com/podcast/id${showId}`,
      appleShowId: showId,
    };
  }
  return { kind: "unknown", originalUrl, canonicalUrl: url.toString() };
}

function parseSpotify(url: URL, originalUrl: string): ParsedSourceUrl {
  const parts = url.pathname.split("/").filter(Boolean);
  const kindPart = parts[0] === "intl-en" || parts[0]?.startsWith("intl-") ? parts[1] : parts[0];
  const idPart = parts[0] === "intl-en" || parts[0]?.startsWith("intl-") ? parts[1] : parts[0];
  const rest = parts[0]?.startsWith("intl") ? parts.slice(1) : parts;
  const type = rest[0];
  const id = rest[1]?.split("?")[0];
  void kindPart;
  void idPart;
  if (type === "episode" && id) {
    return {
      kind: "spotify-episode",
      originalUrl,
      canonicalUrl: `https://open.spotify.com/episode/${id}`,
      spotifyId: id,
    };
  }
  if (type === "show" && id) {
    return {
      kind: "spotify-show",
      originalUrl,
      canonicalUrl: `https://open.spotify.com/show/${id}`,
      spotifyId: id,
    };
  }
  return { kind: "unknown", originalUrl, canonicalUrl: url.toString() };
}

function looksLikeRss(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  if (/\.(rss|xml|atom)$/.test(path)) return true;
  if (/(^|\/)(rss|feed|atom|podcasts?\/feed)(\/|$)/.test(path)) return true;
  if (url.searchParams.has("format") && /rss|xml|atom/i.test(url.searchParams.get("format") ?? "")) {
    return true;
  }
  return false;
}

function ensureScheme(raw: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return `https://${raw}`;
}

function sanitizeYouTubeId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.length >= 8 ? cleaned : undefined;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

export function isKnownSource(kind: ParsedUrlKind): boolean {
  return kind !== "unknown";
}
