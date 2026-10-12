export type ParsedUrl =
  | { kind: "youtube-video"; videoId: string; url: string }
  | { kind: "youtube-playlist"; playlistId: string; videoId?: string; url: string }
  | { kind: "apple-episode"; showId: string; episodeId: string; url: string }
  | { kind: "apple-show"; showId: string; url: string }
  | { kind: "spotify-episode"; id: string; url: string }
  | { kind: "spotify-show"; id: string; url: string }
  | { kind: "rss"; url: string }
  | { kind: "unknown"; url: string };

const YT_ID = /^[a-zA-Z0-9_-]{11}$/;

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (YT_ID.test(trimmed)) {
    return `https://www.youtube.com/watch?v=${trimmed}`;
  }
  const spotifyEpisode = trimmed.match(/^spotify:episode:([A-Za-z0-9]+)/i);
  if (spotifyEpisode) return `https://open.spotify.com/episode/${spotifyEpisode[1]}`;
  const spotifyShow = trimmed.match(/^spotify:show:([A-Za-z0-9]+)/i);
  if (spotifyShow) return `https://open.spotify.com/show/${spotifyShow[1]}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.|m\.|music\.)?youtube\.com/i.test(trimmed) || /^youtu\.be\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (/^(podcasts\.apple\.com|open\.spotify\.com|spotify\.link)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function parseSourceUrl(raw: string): ParsedUrl {
  const url = normalizeUrl(raw);
  if (!url) return { kind: "unknown", url: raw };

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && YT_ID.test(id)) return { kind: "youtube-video", videoId: id, url };
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      const playlistId = u.searchParams.get("list") ?? undefined;
      const v = u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);

      if (u.pathname.startsWith("/playlist") && playlistId) {
        return { kind: "youtube-playlist", playlistId, videoId: v ?? undefined, url };
      }
      if (v && YT_ID.test(v)) {
        if (playlistId && !playlistId.startsWith("RD")) {
          return { kind: "youtube-playlist", playlistId, videoId: v, url };
        }
        return { kind: "youtube-video", videoId: v, url };
      }
      if ((parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") && parts[1] && YT_ID.test(parts[1])) {
        return { kind: "youtube-video", videoId: parts[1], url };
      }
    }

    if (host === "podcasts.apple.com") {
      const ids = [...u.pathname.matchAll(/\/id(\d+)/g)].map((m) => m[1]);
      const episodeId = u.searchParams.get("i") || (ids.length >= 2 ? ids[1] : null);
      const showId = ids[0];
      if (showId && episodeId) {
        return { kind: "apple-episode", showId, episodeId, url };
      }
      if (showId) {
        return { kind: "apple-show", showId, url };
      }
    }

    if (host === "open.spotify.com" || host === "spotify.link") {
      let parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "intl" && parts.length >= 4) parts = parts.slice(2);
      else if (parts[0]?.startsWith("intl-")) parts = parts.slice(1);
      const type = parts[0];
      const id = parts[1]?.split("?")[0];
      if (type === "episode" && id) return { kind: "spotify-episode", id, url };
      if (type === "show" && id) return { kind: "spotify-show", id, url };
    }

    if (
      /\.(rss|xml)$/i.test(u.pathname) ||
      /\/(rss|feed|podcast)(\.|\/|$)/i.test(u.pathname) ||
      host.includes("megaphone.fm") ||
      host.includes("simplecast.com") ||
      host.includes("transistor.fm") ||
      host.includes("buzzsprout.com") ||
      host.includes("libsyn.com") ||
      host.includes("anchor.fm") ||
      host.includes("podbean.com") ||
      host.includes("rss.com") ||
      host.includes("omnycontent.com") ||
      host.includes("art19.com") ||
      (host.includes("npr.org") && u.pathname.includes("podcast"))
    ) {
      return { kind: "rss", url };
    }

    return { kind: "unknown", url };
  } catch {
    return { kind: "unknown", url };
  }
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function splitInputUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,;]+/)) {
    const piece = part.trim();
    if (!piece || piece.startsWith("#")) continue;
    const normalized = normalizeUrl(piece);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}
