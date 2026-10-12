import { XMLParser } from "fast-xml-parser";
import { fetchJson, fetchText, resolveRedirect, stripHtml } from "./http";
import { parseDurationSeconds, rankYoutubeHits, titleScore, transcriptLooksComplete } from "./match";
import { cuesToText, parseCaptionPayload, wordCount } from "./parse-caption";
import { fetchYoutubeTranscript, searchYoutubeVideos } from "./youtube";
import { parseSourceUrl, youtubeWatchUrl } from "./parse-url";
import { transcribeAudioUrl } from "./stt";
import type { CollectionItem, CollectionResult, TranscriptResult } from "./types";
import type { ParsedUrl } from "./parse-url";

export { titleScore };

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "__cdata",
  trimValues: true,
  parseTagValue: false,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function nodeText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.__cdata === "string") return rec.__cdata;
    if (typeof rec["#text"] === "string") return rec["#text"];
  }
  return "";
}

type RssItem = Record<string, unknown>;

type ParsedEpisode = {
  title: string;
  guid: string;
  link: string;
  description: string;
  durationSeconds: number | null;
  publishedAt: string | null;
  transcriptUrls: { url: string; type: string }[];
  youtubeIds: string[];
  enclosureUrl: string | null;
  artwork: string | null;
  raw: RssItem;
};

type ParsedFeed = {
  title: string;
  author: string;
  feedUrl: string;
  artwork: string | null;
  items: ParsedEpisode[];
};

const rssCache = new Map<string, { feed: ParsedFeed; at: number }>();
const RSS_TTL_MS = 8 * 60_000;

function looksLikeRss(url: string, contentType = "", snippet = ""): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (
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
      host.includes("feedburner.com") ||
      host.includes("fireside.fm") ||
      host.includes("captivate.fm")
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  const lower = contentType.toLowerCase();
  if (lower.includes("xml") || lower.includes("rss") || lower.includes("atom")) return true;
  return /<rss[\s>]|<feed[\s>]/i.test(snippet.slice(0, 2000));
}

function extractYoutubeIds(text: string): string[] {
  const ids = new Set<string>();
  const re =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) ids.add(match[1]);
  return [...ids];
}

function transcriptRefs(item: RssItem): { url: string; type: string }[] {
  const refs: { url: string; type: string }[] = [];
  const keys = Object.keys(item);
  for (const key of keys) {
    if (!/transcript/i.test(key)) continue;
    for (const node of asArray(item[key])) {
      if (typeof node === "string" && /^https?:\/\//i.test(node)) {
        refs.push({ url: node, type: "text/plain" });
        continue;
      }
      if (node && typeof node === "object") {
        const rec = node as Record<string, string>;
        const url = rec["@_url"] || rec["@_href"] || nodeText(node);
        if (url && /^https?:\/\//i.test(url)) {
          refs.push({ url, type: rec["@_type"] || rec["@_kind"] || "" });
        }
      }
    }
  }
  return refs;
}

function rssArtwork(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  const itunes = rec["itunes:image"];
  if (typeof itunes === "string" && /^https?:\/\//i.test(itunes)) return itunes;
  if (itunes && typeof itunes === "object") {
    const href =
      (itunes as Record<string, string>)["@_href"] ||
      (itunes as Record<string, string>)["@_url"] ||
      nodeText(itunes);
    if (href && /^https?:\/\//i.test(href)) return href;
  }
  const image = rec.image;
  if (image && typeof image === "object") {
    const href =
      nodeText((image as Record<string, unknown>).url) ||
      (image as Record<string, string>)["@_href"] ||
      (image as Record<string, string>)["@_url"];
    if (href && /^https?:\/\//i.test(href)) return href;
  }
  for (const key of ["media:thumbnail", "media:content"] as const) {
    for (const child of asArray(rec[key])) {
      if (!child || typeof child !== "object") continue;
      const row = child as Record<string, string>;
      const type = row["@_type"] || "";
      const medium = row["@_medium"] || "";
      const href = row["@_url"] || row["@_href"];
      if (!href || !/^https?:\/\//i.test(href)) continue;
      if (key === "media:thumbnail" || type.startsWith("image") || medium === "image") return href;
    }
  }
  return null;
}

export async function fetchRssFeed(feedUrl: string): Promise<ParsedFeed> {
  const key = feedUrl.trim();
  const cached = rssCache.get(key);
  if (cached && Date.now() - cached.at < RSS_TTL_MS) return cached.feed;

  const res = await fetchText(feedUrl, { ua: "app", timeoutMs: 28_000 });
  if (res.status >= 400) throw new Error(`Could not load RSS feed (${res.status})`);
  if (!looksLikeRss(res.url || feedUrl, res.contentType, res.text)) {
    throw Object.assign(new Error("That URL is not a podcast RSS feed"), { code: "unsupported" as const });
  }
  const parsed = xmlParser.parse(res.text) as {
    rss?: { channel?: Record<string, unknown> };
    feed?: Record<string, unknown>;
  };
  const channel = parsed.rss?.channel ?? parsed.feed;
  if (!channel) throw new Error("That URL is not a podcast RSS feed");
  const title = nodeText(channel.title) || "Podcast";
  const author =
    nodeText(channel["itunes:author"]) ||
    nodeText(channel["itunes:owner"]) ||
    nodeText((channel["itunes:owner"] as Record<string, unknown> | undefined)?.["itunes:name"]) ||
    title;
  const artwork = rssArtwork(channel);
  const items = asArray(channel.item as RssItem | RssItem[]).map((item) => {
    const description = nodeText(item.description) + " " + nodeText(item["content:encoded"]);
    const guid = nodeText(item.guid) || nodeText(item.link) || nodeText(item.title);
    const enclosure = asArray(item.enclosure)[0] as Record<string, string> | undefined;
    return {
      title: nodeText(item.title) || "Untitled episode",
      guid,
      link: nodeText(item.link) || "",
      description,
      durationSeconds: parseDurationSeconds(nodeText(item["itunes:duration"])),
      publishedAt: nodeText(item.pubDate) || nodeText(item.published) || null,
      transcriptUrls: transcriptRefs(item),
      youtubeIds: extractYoutubeIds(`${nodeText(item.link)} ${description}`),
      enclosureUrl: enclosure?.["@_url"] ?? null,
      artwork: rssArtwork(item) || artwork,
      raw: item,
    };
  });
  const feed: ParsedFeed = { title, author, feedUrl: res.url || key, artwork, items };
  rssCache.set(key, { feed, at: Date.now() });
  if (feed.feedUrl !== key) rssCache.set(feed.feedUrl, { feed, at: Date.now() });
  return feed;
}

function matchEpisode(
  feed: ParsedFeed,
  opts: { guid?: string; title?: string; episodeId?: string; url?: string },
) {
  const guid = opts.guid?.trim();
  if (guid) {
    const g = guid.toLowerCase();
    const exact = feed.items.find(
      (i) =>
        i.guid.toLowerCase() === g ||
        i.link.toLowerCase() === g ||
        i.guid.toLowerCase() === decodeURIComponent(g) ||
        i.link.toLowerCase() === decodeURIComponent(g),
    );
    if (exact) return exact;
  }
  if (opts.episodeId) {
    const id = opts.episodeId;
    const hit = feed.items.find(
      (i) => i.guid.includes(id) || i.link.includes(id) || JSON.stringify(i.raw).includes(id),
    );
    if (hit) return hit;
  }
  if (opts.url) {
    const hit = feed.items.find((i) => i.link && opts.url && (i.link === opts.url || opts.url.includes(i.guid)));
    if (hit) return hit;
  }
  if (opts.title) {
    let best = null as ParsedEpisode | null;
    let bestScore = 0.62;
    for (const item of feed.items) {
      const score = titleScore(item.title, opts.title);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
    if (best) return best;
  }
  return null;
}

function collectionFromFeed(feed: ParsedFeed, pageUrl: string, rssUrl = feed.feedUrl): CollectionResult {
  const items: CollectionItem[] = feed.items.slice(0, 40).map((ep) => ({
    url: ep.link || pageUrl,
    title: ep.title,
    author: feed.author,
    durationSeconds: ep.durationSeconds,
    hasTranscript: ep.transcriptUrls.length > 0 || ep.youtubeIds.length > 0 || Boolean(ep.enclosureUrl),
    feedUrl: rssUrl,
    guid: ep.guid,
    publishedAt: ep.publishedAt,
    thumbnail: ep.artwork,
  }));
  return {
    title: feed.title,
    author: feed.author,
    source: "podcast",
    url: pageUrl,
    artwork: feed.artwork,
    items,
  };
}

async function transcriptFromPage(pageUrl: string): Promise<{ url: string; type: string }[]> {
  if (!/^https?:/i.test(pageUrl) || /\.(mp3|m4a|aac|wav|ogg)(\?|$)/i.test(pageUrl)) return [];
  try {
    const res = await fetchText(pageUrl, { timeoutMs: 12_000 });
    if (res.status >= 400 || !res.text) return [];
    if ((res.contentType || "").includes("audio")) return [];
    const refs: { url: string; type: string }[] = [];
    const re = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(res.text))) {
      const href = match[1];
      if (!/transcript|\.vtt|\.srt|\.json/i.test(href) && !/transcript/i.test(match[0])) continue;
      try {
        const abs = new URL(href, pageUrl).toString();
        if (/^https?:\/\//i.test(abs)) {
          const type = /\.vtt/i.test(abs) ? "text/vtt" : /\.srt/i.test(abs) ? "application/x-subrip" : "text/html";
          refs.push({ url: abs, type });
        }
      } catch {
        /* skip */
      }
    }
    return refs;
  } catch {
    return [];
  }
}

async function youtubeFallback(feed: ParsedFeed, episode: ParsedEpisode): Promise<TranscriptResult | null> {
  const ids: { id: string; durationSeconds: number | null; title: string }[] = episode.youtubeIds.map((id) => ({
    id,
    durationSeconds: episode.durationSeconds,
    title: episode.title,
  }));
  try {
    const query = `${feed.title} ${episode.title}`.replace(/\s+/g, " ").trim();
    const hits = await searchYoutubeVideos(query);
    const ranked = rankYoutubeHits(hits, episode.title, feed.title, episode.durationSeconds);
    for (const row of ranked.slice(0, 8)) {
      if (ids.some((x) => x.id === row.videoId)) continue;
      ids.push({ id: row.videoId, durationSeconds: row.durationSeconds ?? null, title: row.title });
    }
  } catch {
    /* search is optional */
  }

  const seen = new Set<string>();
  for (const candidate of ids) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (
      episode.durationSeconds &&
      episode.durationSeconds >= 90 &&
      candidate.durationSeconds &&
      candidate.durationSeconds < Math.max(90, episode.durationSeconds * 0.45)
    ) {
      continue;
    }
    try {
      const result = await fetchYoutubeTranscript(candidate.id, youtubeWatchUrl(candidate.id));
      if (!transcriptLooksComplete(result, episode.durationSeconds)) continue;
      return result;
    } catch {
      /* try next */
    }
  }
  return null;
}

function captionLooksThin(cues: ReturnType<typeof parseCaptionPayload>, durationSeconds: number | null): boolean {
  const text = cuesToText(cues);
  const words = wordCount(text);
  if (cues.length <= 1 && words < 200) return true;
  if (durationSeconds && durationSeconds >= 90) {
    const minWords = Math.max(80, Math.round(durationSeconds * 0.35));
    if (words < minWords && cues.length < 40) return true;
  }
  return words < 12;
}

async function transcriptFromEpisode(
  feed: ParsedFeed,
  episode: ParsedEpisode,
  sourceUrl: string,
): Promise<TranscriptResult> {
  const ranked = [...episode.transcriptUrls].sort((a, b) => {
    const rank = (t: string) => (/json/i.test(t) ? 0 : /vtt/i.test(t) ? 1 : /srt/i.test(t) ? 2 : 3);
    return rank(a.type) - rank(b.type);
  });

  if (episode.link) {
    const extra = await transcriptFromPage(episode.link);
    for (const ref of extra) {
      if (!ranked.some((r) => r.url === ref.url)) ranked.push(ref);
    }
  }

  let lastErr: Error | null = null;
  for (const ref of ranked) {
    try {
      const res = await fetchText(ref.url, { ua: "app", timeoutMs: 28_000 });
      if (res.status >= 400 || !res.text.trim()) continue;
      const cues = parseCaptionPayload(res.text, res.contentType || ref.type);
      if (!cues.length || captionLooksThin(cues, episode.durationSeconds)) continue;
      const text = cuesToText(cues);
      return {
        url: sourceUrl,
        canonicalUrl: episode.link || sourceUrl,
        source: "podcast",
        title: episode.title,
        author: feed.author,
        durationSeconds: episode.durationSeconds,
        language: null,
        isGenerated: false,
        thumbnail: episode.artwork,
        fetchedAt: new Date().toISOString(),
        cues,
        text,
        wordCount: wordCount(text),
        trackLabel: ref.type || "Transcript",
      };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  const fromYoutube = await youtubeFallback(feed, episode);
  if (fromYoutube) {
    return {
      ...fromYoutube,
      url: sourceUrl,
      canonicalUrl: episode.link || fromYoutube.canonicalUrl,
      title: episode.title || fromYoutube.title,
      author: feed.author || fromYoutube.author,
      thumbnail: episode.artwork || fromYoutube.thumbnail,
    };
  }

  if (episode.enclosureUrl) {
    try {
      return await transcribeAudioUrl({
        audioUrl: episode.enclosureUrl,
        sourceUrl,
        title: episode.title,
        author: feed.author,
        durationSeconds: episode.durationSeconds,
        thumbnail: episode.artwork,
      });
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw Object.assign(
    lastErr ??
      new Error(
        "This episode does not publish a transcript. If it is also on YouTube, paste that video URL.",
      ),
    { code: "no_transcript" as const },
  );
}

async function lookupAppleFeed(showId: string): Promise<{ feedUrl: string; collectionName: string; artwork: string | null }> {
  const data = await fetchJson<{
    results?: { feedUrl?: string; collectionName?: string; kind?: string; artworkUrl600?: string }[];
  }>(`https://itunes.apple.com/lookup?id=${encodeURIComponent(showId)}&entity=podcast`, {
    timeoutMs: 12_000,
  });
  const show = data.results?.find((r) => r.feedUrl) ?? data.results?.[0];
  if (!show?.feedUrl) throw new Error("Could not find an RSS feed for this Apple Podcasts show");
  return {
    feedUrl: show.feedUrl,
    collectionName: show.collectionName || "Podcast",
    artwork: show.artworkUrl600 || null,
  };
}

async function lookupAppleEpisode(episodeId: string) {
  const data = await fetchJson<{
    results?: {
      trackName?: string;
      collectionId?: number;
      feedUrl?: string;
      artistName?: string;
      collectionName?: string;
      artworkUrl600?: string;
    }[];
  }>(`https://itunes.apple.com/lookup?id=${encodeURIComponent(episodeId)}&entity=podcastEpisode`, {
    timeoutMs: 12_000,
  });
  const ep = data.results?.find((r) => r.trackName) ?? data.results?.[0];
  if (!ep) throw new Error("Could not find that Apple Podcasts episode");
  return {
    trackName: ep.trackName || "Episode",
    collectionId: ep.collectionId,
    feedUrl: ep.feedUrl,
    artistName: ep.artistName,
    collectionName: ep.collectionName,
    artwork: ep.artworkUrl600 || null,
  };
}

function titleFromAppleUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).at(-1) || "";
    if (/^id\d+$/i.test(last)) return "";
    return decodeURIComponent(last).replace(/-/g, " ").trim();
  } catch {
    return "";
  }
}

async function appleEpisodeMeta(episodeId: string, pageUrl: string, showName: string) {
  try {
    return await lookupAppleEpisode(episodeId);
  } catch {
    /* fall through */
  }
  const slug = titleFromAppleUrl(pageUrl);
  const hit = await itunesSearchEpisode(`${showName} ${slug}`.trim(), showName);
  if (hit?.trackName) {
    return {
      trackName: hit.trackName,
      collectionId: hit.collectionId,
      feedUrl: hit.feedUrl,
      artistName: hit.artistName,
      collectionName: hit.collectionName,
      artwork: hit.artworkUrl600 || null,
    };
  }
  try {
    const page = await fetchText(pageUrl, { timeoutMs: 10_000 });
    const og =
      page.text.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
      page.text.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i)?.[1] ||
      page.text.match(/<title>([^<]+)<\/title>/i)?.[1];
    if (og) {
      const title = og
        .replace(/\s*[-–|]\s*(Apple Podcasts|Podcasts?|Listen on Apple Podcasts).*$/i, "")
        .replace(/\s*[-–|]\s*[^-–|]{2,60}$/u, (tail) => (titleScore(tail, showName) > 0.5 ? "" : tail))
        .trim();
      if (title) return { trackName: title, feedUrl: undefined as string | undefined, artwork: null as string | null };
    }
  } catch {
    /* ignore */
  }
  if (slug) return { trackName: slug, feedUrl: undefined as string | undefined, artwork: null as string | null };
  return null;
}

async function spotifyOembed(url: string) {
  let title = "";
  let author = "";
  let durationSeconds: number | null = null;
  let thumbnail: string | null = null;
  try {
    const data = await fetchJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
      { timeoutMs: 10_000 },
    );
    title = data.title || "";
    author = data.author_name || "";
    thumbnail = data.thumbnail_url || null;
  } catch {
    /* oembed is optional */
  }
  try {
    const match = (
      await fetchText(url.replace("://open.spotify.com/", "://open.spotify.com/embed/"), { timeoutMs: 10_000 })
    ).text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (match) {
      const entity = JSON.parse(match[1]).props?.pageProps?.state?.data?.entity as
        | { title?: string; name?: string; subtitle?: string; duration?: unknown; coverArt?: { sources?: { url?: string }[] } }
        | undefined;
      title = entity?.title || entity?.name || title;
      author = entity?.subtitle || author;
      durationSeconds = parseDurationSeconds(entity?.duration) ?? durationSeconds;
      thumbnail = entity?.coverArt?.sources?.at(-1)?.url || thumbnail;
    }
  } catch {
    /* embed page is optional */
  }
  if (!title) return null;
  return { title, author, durationSeconds, thumbnail };
}

async function itunesSearchEpisode(term: string, author?: string) {
  const results =
    (
      await fetchJson<{
        results?: {
          trackName?: string;
          collectionName?: string;
          artistName?: string;
          collectionId?: number;
          feedUrl?: string;
          artworkUrl600?: string;
        }[];
      }>(
        `https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&limit=8&term=${encodeURIComponent(term)}`,
        { timeoutMs: 12_000 },
      )
    ).results ?? [];
  if (results.length === 0) return null;
  let best = null as (typeof results)[number] | null;
  let bestScore = 0;
  for (const hit of results) {
    if (!hit.trackName) continue;
    const titlePart = titleScore(hit.trackName, term.replace(author ?? "", "").trim() || term);
    const authorPart = author
      ? Math.max(titleScore(hit.collectionName || "", author), titleScore(hit.artistName || "", author))
      : 0;
    if (titlePart < 0.7) continue;
    if (author && authorPart < 0.45) continue;
    const score = titlePart + authorPart * 0.4;
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return best;
}

async function resolveFromFeed(opts: {
  feedUrl: string;
  pageUrl: string;
  guid?: string;
  title?: string;
  episodeId?: string;
  allowCollection: boolean;
}): Promise<TranscriptResult | CollectionResult> {
  const feed = await fetchRssFeed(opts.feedUrl);
  const episode = matchEpisode(feed, {
    guid: opts.guid,
    title: opts.title,
    episodeId: opts.episodeId,
    url: opts.pageUrl,
  });
  if (episode) return transcriptFromEpisode(feed, episode, opts.pageUrl);
  if (opts.guid) {
    const fallback = feed.items.find((i) => i.guid === opts.guid);
    if (fallback) return transcriptFromEpisode(feed, fallback, opts.pageUrl);
  }
  if (!opts.allowCollection) {
    throw Object.assign(new Error("Could not match that episode in the show feed"), { code: "not_found" as const });
  }
  return collectionFromFeed(feed, opts.pageUrl, feed.feedUrl);
}

export async function resolvePodcast(input: {
  url: string;
  parsed: ParsedUrl;
  feedUrl?: string;
  guid?: string;
}): Promise<TranscriptResult | CollectionResult> {
  let { url, parsed, feedUrl: givenFeed, guid } = input;
  if (parsed.kind === "unknown" || url.includes("spotify.link")) {
    try {
      const finalUrl = await resolveRedirect(url);
      if (finalUrl !== url) {
        parsed = parseSourceUrl(finalUrl);
        url = parsed.url || finalUrl;
      }
    } catch {
      /* keep original */
    }
  }
  if (givenFeed && (guid || parsed.kind === "unknown" || parsed.kind === "rss")) {
    try {
      return await resolveFromFeed({
        feedUrl: givenFeed,
        pageUrl: url,
        guid,
        allowCollection: !guid,
      });
    } catch (err) {
      if (guid) throw err;
    }
  }
  if (parsed.kind === "apple-show") {
    return resolveFromFeed({
      feedUrl: (await lookupAppleFeed(parsed.showId)).feedUrl,
      pageUrl: url,
      guid,
      allowCollection: !guid,
    });
  }
  if (parsed.kind === "apple-episode") {
    const show = await lookupAppleFeed(parsed.showId);
    const episodeMeta = await appleEpisodeMeta(parsed.episodeId, url, show.collectionName);
    return resolveFromFeed({
      feedUrl: episodeMeta?.feedUrl || show.feedUrl,
      pageUrl: url,
      guid,
      title: episodeMeta?.trackName,
      episodeId: parsed.episodeId,
      allowCollection: true,
    });
  }
  if (parsed.kind === "spotify-show") {
    const meta = await spotifyOembed(url);
    if (!meta) {
      throw Object.assign(
        new Error("Could not read that Spotify show. Paste the show's RSS or Apple Podcasts URL instead."),
        { code: "unsupported" as const },
      );
    }
    const hit = await itunesSearchEpisode(meta.title, meta.author);
    if (hit?.collectionId) {
      return resolveFromFeed({
        feedUrl: (await lookupAppleFeed(String(hit.collectionId))).feedUrl,
        pageUrl: url,
        guid,
        allowCollection: !guid,
      });
    }
    throw Object.assign(
      new Error("Spotify hide RSS feeds. Paste the Apple Podcasts URL or the show's RSS feed."),
      { code: "unsupported" as const },
    );
  }
  if (parsed.kind === "spotify-episode") {
    const meta = await spotifyOembed(url);
    if (!meta) {
      throw Object.assign(
        new Error("Could not read that Spotify episode. Paste an Apple Podcasts or RSS URL instead."),
        { code: "unsupported" as const },
      );
    }
    const hit = await itunesSearchEpisode(`${meta.author} ${meta.title}`, meta.author);
    if (hit?.feedUrl || hit?.collectionId) {
      return resolveFromFeed({
        feedUrl: hit.feedUrl || (await lookupAppleFeed(String(hit.collectionId))).feedUrl,
        pageUrl: url,
        guid,
        title: hit.trackName || meta.title,
        allowCollection: true,
      });
    }
    try {
      const yt = await youtubeFallback(
        { title: meta.author, author: meta.author, feedUrl: "", artwork: meta.thumbnail, items: [] },
        {
          title: meta.title,
          guid: url,
          link: url,
          description: "",
          durationSeconds: meta.durationSeconds,
          publishedAt: null,
          transcriptUrls: [],
          youtubeIds: [],
          enclosureUrl: null,
          artwork: meta.thumbnail,
          raw: {},
        },
      );
      if (yt) return { ...yt, thumbnail: meta.thumbnail || yt.thumbnail };
    } catch {
      /* youtube fallback optional */
    }
    throw Object.assign(
      new Error(`Found “${meta.title}” on Spotify, but no published transcript. If the episode is on YouTube, paste that URL.`),
      { code: "no_transcript" as const },
    );
  }
  const rssUrl = givenFeed || (parsed.kind === "rss" ? parsed.url : null);
  if (rssUrl) {
    return resolveFromFeed({
      feedUrl: rssUrl,
      pageUrl: url,
      guid,
      allowCollection: !guid,
    });
  }
  if (parsed.kind === "unknown") {
    const res = await fetchText(url, { ua: "app", timeoutMs: 14_000 });
    if (looksLikeRss(url, res.contentType, res.text)) {
      const feed = await fetchRssFeed(url);
      return collectionFromFeed(feed, url, feed.feedUrl);
    }
    const maybeYt = extractYoutubeIds(res.text);
    if (maybeYt[0]) return fetchYoutubeTranscript(maybeYt[0], youtubeWatchUrl(maybeYt[0]));
    const stripped = stripHtml(res.text).slice(0, 200);
    throw Object.assign(
      new Error(stripped ? "That page is not a YouTube video or podcast feed." : "Could not recognize that URL."),
      { code: "unsupported" as const },
    );
  }
  throw Object.assign(new Error("Could not resolve that podcast URL"), { code: "unsupported" as const });
}
