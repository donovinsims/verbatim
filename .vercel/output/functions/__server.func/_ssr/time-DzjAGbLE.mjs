//#region node_modules/.nitro/vite/services/ssr/assets/time-DzjAGbLE.js
var YT_HOSTS = /* @__PURE__ */ new Set([
	"youtube.com",
	"www.youtube.com",
	"m.youtube.com",
	"music.youtube.com",
	"youtu.be",
	"www.youtu.be",
	"youtube-nocookie.com",
	"www.youtube-nocookie.com"
]);
var APPLE_HOSTS = /* @__PURE__ */ new Set([
	"podcasts.apple.com",
	"itunes.apple.com",
	"geo.itunes.apple.com"
]);
var SPOTIFY_HOSTS = /* @__PURE__ */ new Set([
	"open.spotify.com",
	"play.spotify.com",
	"spotify.link",
	"spotify.com",
	"www.spotify.com"
]);
function splitInputUrls(text) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
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
function parseSourceUrl(raw) {
	const originalUrl = raw.trim();
	const withScheme = ensureScheme(originalUrl);
	let url;
	try {
		url = new URL(withScheme);
	} catch {
		return {
			kind: "unknown",
			originalUrl,
			canonicalUrl: originalUrl
		};
	}
	const host = url.hostname.toLowerCase();
	if (YT_HOSTS.has(host)) return parseYouTube(url, originalUrl);
	if (APPLE_HOSTS.has(host)) return parseApple(url, originalUrl);
	if (SPOTIFY_HOSTS.has(host)) return parseSpotify(url, originalUrl);
	if (looksLikeRss(url)) return {
		kind: "rss",
		originalUrl,
		canonicalUrl: url.toString()
	};
	return {
		kind: "unknown",
		originalUrl,
		canonicalUrl: url.toString()
	};
}
function canonicalJobKey(input) {
	if (input.feedUrl && input.guid) return `ep:${normalizeKey(input.feedUrl)}::${normalizeKey(input.guid)}`;
	const parsed = parseSourceUrl(input.url);
	return `${parsed.kind}:${normalizeKey(parsed.canonicalUrl)}`;
}
function parseYouTube(url, originalUrl) {
	const host = url.hostname.toLowerCase();
	const parts = url.pathname.split("/").filter(Boolean);
	let videoId;
	let playlistId = url.searchParams.get("list") ?? void 0;
	if (host === "youtu.be" || host === "www.youtu.be") videoId = parts[0] || void 0;
	else if (parts[0] === "watch") videoId = url.searchParams.get("v") ?? void 0;
	else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") videoId = parts[1] || void 0;
	else if (parts[0] === "playlist") playlistId = url.searchParams.get("list") ?? parts[1] ?? playlistId;
	else if (url.searchParams.get("v")) videoId = url.searchParams.get("v") ?? void 0;
	videoId = sanitizeYouTubeId(videoId);
	playlistId = playlistId?.trim() || void 0;
	if (videoId) return {
		kind: "youtube-video",
		originalUrl,
		canonicalUrl: playlistId ? `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}` : `https://www.youtube.com/watch?v=${videoId}`,
		videoId,
		playlistId
	};
	if (playlistId) return {
		kind: "youtube-playlist",
		originalUrl,
		canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
		playlistId
	};
	return {
		kind: "unknown",
		originalUrl,
		canonicalUrl: url.toString()
	};
}
function parseApple(url, originalUrl) {
	const episodeId = url.searchParams.get("i") ?? url.searchParams.get("episodeId") ?? void 0;
	const showId = url.pathname.match(/\/id(\d+)/i)?.[1];
	if (episodeId && showId) return {
		kind: "apple-episode",
		originalUrl,
		canonicalUrl: `https://podcasts.apple.com/podcast/id${showId}?i=${episodeId}`,
		appleShowId: showId,
		appleEpisodeId: episodeId
	};
	if (showId) return {
		kind: "apple-show",
		originalUrl,
		canonicalUrl: `https://podcasts.apple.com/podcast/id${showId}`,
		appleShowId: showId
	};
	return {
		kind: "unknown",
		originalUrl,
		canonicalUrl: url.toString()
	};
}
function parseSpotify(url, originalUrl) {
	const parts = url.pathname.split("/").filter(Boolean);
	parts[0] === "intl-en" || parts[0]?.startsWith("intl-") ? parts[1] : parts[0];
	parts[0] === "intl-en" || parts[0]?.startsWith("intl-") ? parts[1] : parts[0];
	const rest = parts[0]?.startsWith("intl") ? parts.slice(1) : parts;
	const type = rest[0];
	const id = rest[1]?.split("?")[0];
	if (type === "episode" && id) return {
		kind: "spotify-episode",
		originalUrl,
		canonicalUrl: `https://open.spotify.com/episode/${id}`,
		spotifyId: id
	};
	if (type === "show" && id) return {
		kind: "spotify-show",
		originalUrl,
		canonicalUrl: `https://open.spotify.com/show/${id}`,
		spotifyId: id
	};
	return {
		kind: "unknown",
		originalUrl,
		canonicalUrl: url.toString()
	};
}
function looksLikeRss(url) {
	const path = url.pathname.toLowerCase();
	if (/\.(rss|xml|atom)$/.test(path)) return true;
	if (/(^|\/)(rss|feed|atom|podcasts?\/feed)(\/|$)/.test(path)) return true;
	if (url.searchParams.has("format") && /rss|xml|atom/i.test(url.searchParams.get("format") ?? "")) return true;
	return false;
}
function ensureScheme(raw) {
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
	return `https://${raw}`;
}
function sanitizeYouTubeId(id) {
	if (!id) return void 0;
	const cleaned = id.replace(/[^A-Za-z0-9_-]/g, "");
	return cleaned.length >= 8 ? cleaned : void 0;
}
function normalizeKey(value) {
	return value.trim().toLowerCase().replace(/\/+$/, "");
}
/** Parse "1:23:45", "4:05", "1.500", or raw seconds into milliseconds. */
function parseClockToMs(raw) {
	if (raw == null || raw === "") return void 0;
	if (typeof raw === "number" && Number.isFinite(raw)) return raw > 1e5 ? Math.round(raw) : Math.round(raw * 1e3);
	const s = String(raw).trim();
	if (!s) return void 0;
	if (/^\d+(\.\d+)?$/.test(s)) {
		const n = Number(s);
		if (!Number.isFinite(n)) return void 0;
		return n > 1e5 ? Math.round(n) : Math.round(n * 1e3);
	}
	const parts = s.replace(",", ".").split(":").map((p) => Number(p));
	if (parts.some((n) => !Number.isFinite(n))) return void 0;
	if (parts.length === 3) {
		const [h, m, sec] = parts;
		return Math.round(((h ?? 0) * 3600 + (m ?? 0) * 60 + (sec ?? 0)) * 1e3);
	}
	if (parts.length === 2) {
		const [m, sec] = parts;
		return Math.round(((m ?? 0) * 60 + (sec ?? 0)) * 1e3);
	}
}
function parseSrtTime(raw) {
	const m = raw.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
	if (!m) {
		const vtt = raw.trim().match(/(\d+):(\d+)[,.](\d+)/);
		if (!vtt) return 0;
		const mm = Number(vtt[1]);
		const ss = Number(vtt[2]);
		const ms = Number((vtt[3] ?? "0").padEnd(3, "0").slice(0, 3));
		return mm * 6e4 + ss * 1e3 + ms;
	}
	const h = Number(m[1]);
	const mm = Number(m[2]);
	const ss = Number(m[3]);
	const ms = Number((m[4] ?? "0").padEnd(3, "0").slice(0, 3));
	return h * 36e5 + mm * 6e4 + ss * 1e3 + ms;
}
function formatSrtTime(ms) {
	const t = Math.max(0, Math.round(ms));
	const h = Math.floor(t / 36e5);
	const m = Math.floor(t % 36e5 / 6e4);
	const s = Math.floor(t % 6e4 / 1e3);
	const milli = t % 1e3;
	return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
}
function formatVttTime(ms) {
	const t = Math.max(0, Math.round(ms));
	const h = Math.floor(t / 36e5);
	const m = Math.floor(t % 36e5 / 6e4);
	const s = Math.floor(t % 6e4 / 1e3);
	const milli = t % 1e3;
	return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(milli, 3)}`;
}
function formatClock(ms) {
	const t = Math.max(0, Math.round(ms / 1e3));
	const h = Math.floor(t / 3600);
	const m = Math.floor(t % 3600 / 60);
	const s = t % 60;
	if (h > 0) return `${h}:${pad(m, 2)}:${pad(s, 2)}`;
	return `${m}:${pad(s, 2)}`;
}
function pad(n, w) {
	return String(n).padStart(w, "0");
}
function countWords(text) {
	return text.trim().split(/\s+/).filter(Boolean).length;
}
function flattenCues(cues) {
	return cues.map((c) => c.text.trim()).filter(Boolean).join("\n");
}
//#endregion
export { formatSrtTime as a, parseSourceUrl as c, formatClock as i, parseSrtTime as l, countWords as n, formatVttTime as o, flattenCues as r, parseClockToMs as s, canonicalJobKey as t, splitInputUrls as u };
