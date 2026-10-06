import { XMLParser } from "fast-xml-parser";
import { TranscriptError } from "./errors";
import { fetchBuffer, fetchJson, fetchText, PODCAST_UA, stripHtml } from "./http";
import { isGoodEpisodeMatch, scoreTitle } from "./match";
import { parseCaptionBytes } from "./parse-caption";
import { parseSourceUrl } from "./parse-url";
import { transcribeEnclosure } from "./stt";
import { countWords, flattenCues, parseClockToMs } from "./time";
import type {
  CollectionItem,
  CollectionResult,
  Cue,
  ParsedSourceUrl,
  TranscriptInput,
  TranscriptResult,
} from "./types";
import { searchYoutubeForEpisode } from "./youtube";

const COLLECTION_CAP = 40;
const MATCH_SCAN_CAP = 200;
const THIN_WORD_THRESHOLD = 40;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseAttributeValue: false,
});

type RssFeed = {
  title: string;
  author?: string;
  feedUrl: string;
  items: RssItem[];
};

type RssItem = {
  title: string;
  guid?: string;
  link?: string;
  durationMs?: number;
  publishedAt?: string;
  author?: string;
  enclosureUrl?: string;
  enclosureBytes?: number;
  transcriptUrls: { url: string; type?: string }[];
  appleEpisodeId?: string;
};

export async function resolvePodcast(
  input: TranscriptInput,
  parsed?: ParsedSourceUrl,
): Promise<TranscriptResult | CollectionResult> {
  const source = parsed ?? parseSourceUrl(input.url);
  const resolved = await resolveFeed(input, source);

  if (input.feedUrl && input.guid) {
    const item = matchItem(resolved.items, input);
    if (!item) {
      throw new TranscriptError("not_found", "That episode is no longer in the feed.");
    }
    return transcriptForItem(resolved, item, input.url);
  }

  const wantsCollection =
    source.kind === "apple-show" ||
    source.kind === "spotify-show" ||
    (source.kind === "rss" && !input.guid && looksLikeShowOnly(input, resolved));

  if (wantsCollection) {
    return collectionFromFeed(resolved, source);
  }

  const item = matchItem(resolved.items, {
    url: input.url,
    guid: input.guid,
    titleHint: titleHintFromSource(source, input),
    appleEpisodeId: source.appleEpisodeId,
    spotifyUrl: source.kind.startsWith("spotify") ? source.canonicalUrl : undefined,
  });

  if (!item) {
    if (resolved.items.length) return collectionFromFeed(resolved, source);
    throw new TranscriptError("not_found", "Could not match that episode in the RSS feed.");
  }

  return transcriptForItem(resolved, item, input.url);
}

async function resolveFeed(input: TranscriptInput, parsed: ParsedSourceUrl): Promise<RssFeed> {
  if (input.feedUrl) {
    return fetchRss(input.feedUrl);
  }
  if (parsed.kind === "rss") {
    return fetchRss(parsed.canonicalUrl);
  }
  if (parsed.kind === "apple-episode" || parsed.kind === "apple-show") {
    return resolveApple(parsed);
  }
  if (parsed.kind === "spotify-episode" || parsed.kind === "spotify-show") {
    return resolveSpotify(parsed);
  }
  try {
    return await fetchRss(parsed.canonicalUrl);
  } catch (err) {
    if (err instanceof TranscriptError && err.code === "invalid_url") throw err;
    throw new TranscriptError("unsupported", "Could not resolve that link to an RSS feed.");
  }
}

async function resolveApple(parsed: ParsedSourceUrl): Promise<RssFeed> {
  const lookupId = parsed.appleEpisodeId ?? parsed.appleShowId;
  if (!lookupId) throw new TranscriptError("invalid_url", "Apple Podcasts id is missing.");
  const data = await fetchJson<ItunesLookup>(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(lookupId)}&entity=podcast`,
    { timeoutMs: 15_000, userAgent: PODCAST_UA },
  );
  const row = data.results?.[0];
  const feedUrl = row?.feedUrl;
  if (!feedUrl) {
    throw new TranscriptError("not_found", "Apple did not return an RSS feed for that show.");
  }
  return fetchRss(feedUrl);
}

async function resolveSpotify(parsed: ParsedSourceUrl): Promise<RssFeed> {
  const oembed = await fetchJson<SpotifyOembed>(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.canonicalUrl)}`,
    { timeoutMs: 15_000, userAgent: PODCAST_UA },
  ).catch(() => null);

  const title = oembed?.title?.replace(/\s+[-–|]\s+.*$/, "").trim() || oembed?.title;
  const author = oembed?.author_name;
  const query = [title, author].filter(Boolean).join(" ");
  if (!query) {
    throw new TranscriptError("not_found", "Spotify did not return enough metadata to find an RSS feed.");
  }

  const entity = parsed.kind === "spotify-show" ? "podcast" : "podcastEpisode";
  const search = await fetchJson<ItunesSearch>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&limit=8`,
    { timeoutMs: 15_000, userAgent: PODCAST_UA },
  );
  const hit = (search.results ?? []).find((r) => r.feedUrl && (!title || scoreTitle(r.trackName ?? r.collectionName ?? "", title) > 0.45));
  const feedUrl = hit?.feedUrl ?? search.results?.find((r) => r.feedUrl)?.feedUrl;
  if (!feedUrl) {
    throw new TranscriptError("not_found", "Could not map that Spotify link to an RSS feed.");
  }
  return fetchRss(feedUrl);
}

type ItunesLookup = { results?: { feedUrl?: string; trackName?: string; collectionName?: string; episodeGuid?: string }[] };
type ItunesSearch = ItunesLookup;
type SpotifyOembed = { title?: string; author_name?: string };

async function fetchRss(feedUrl: string): Promise<RssFeed> {
  const xml = await fetchText(feedUrl, {
    timeoutMs: 20_000,
    userAgent: PODCAST_UA,
    accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8",
    maxBytes: 6 * 1024 * 1024,
  });
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch {
    throw new TranscriptError("unknown", "The RSS feed was not valid XML.");
  }
  const rec = parsed as Record<string, unknown>;
  const rss = rec.rss as Record<string, unknown> | undefined;
  const channel = (rss?.channel ?? rec.channel ?? (rec.feed as Record<string, unknown> | undefined)) as
    | Record<string, unknown>
    | undefined;
  if (!channel) {
    throw new TranscriptError("unsupported", "That URL is not an RSS or Atom feed.");
  }
  const title = textOf(channel.title) || "Podcast";
  const author = textOf(channel["itunes:author"]) || textOf(channel.author) || textOf(channel["itunes:owner"]);
  const itemsRaw = asArray(channel.item ?? channel.entry).slice(0, MATCH_SCAN_CAP);
  const items = itemsRaw.map(parseRssItem).filter((i) => i.title);
  return { title, author, feedUrl, items };
}

function parseRssItem(raw: unknown): RssItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const enclosure = first(r.enclosure);
  const enclosureRec = (enclosure && typeof enclosure === "object" ? enclosure : {}) as Record<string, unknown>;
  const duration = textOf(r["itunes:duration"]) || textOf(r.duration);
  const guid = textOf(r.guid) || textOf(r.id);
  const link = hrefOf(r.link) || textOf(r.link);
  const transcripts = collectTranscripts(r);
  return {
    title: stripHtml(textOf(r.title) || "Untitled episode"),
    guid: guid || undefined,
    link: link || undefined,
    durationMs: parseClockToMs(duration),
    publishedAt: textOf(r.pubDate) || textOf(r.published) || textOf(r.updated) || undefined,
    author: textOf(r["itunes:author"]) || textOf(r.author) || undefined,
    enclosureUrl: stringAttr(enclosureRec, "@_url") || textOf(enclosureRec.url) || undefined,
    enclosureBytes: Number(stringAttr(enclosureRec, "@_length") || 0) || undefined,
    transcriptUrls: transcripts,
    appleEpisodeId: extractAppleEpisodeId(r, link),
  };
}

function collectTranscripts(r: Record<string, unknown>): { url: string; type?: string }[] {
  const out: { url: string; type?: string }[] = [];
  const nodes = [
    ...asArray(r["podcast:transcript"]),
    ...asArray(r.transcript),
    ...asArray(r["podcast:transcripts"]),
  ];
  for (const node of nodes) {
    if (typeof node === "string" && /^https?:/i.test(node)) {
      out.push({ url: node });
      continue;
    }
    if (node && typeof node === "object") {
      const rec = node as Record<string, unknown>;
      const url = stringAttr(rec, "@_url") || textOf(rec.url) || textOf(rec);
      const type = stringAttr(rec, "@_type") || textOf(rec.type) || undefined;
      if (url && /^https?:/i.test(url)) out.push({ url, type });
    }
  }
  return out;
}

function extractAppleEpisodeId(r: Record<string, unknown>, link?: string): string | undefined {
  const fromLink = (link ?? "").match(/[?&]i=(\d+)/);
  if (fromLink) return fromLink[1];
  for (const key of Object.keys(r)) {
    if (/apple/i.test(key)) {
      const text = textOf(r[key]);
      const m = text.match(/id(\d{8,})|[?&]i=(\d{8,})/);
      if (m) return m[1] || m[2];
    }
  }
  return undefined;
}

function matchItem(
  items: RssItem[],
  hint: {
    url?: string;
    guid?: string;
    titleHint?: string;
    appleEpisodeId?: string;
    spotifyUrl?: string;
  },
): RssItem | undefined {
  if (hint.guid) {
    const guidHit = items.find((i) => i.guid && normalize(i.guid) === normalize(hint.guid!));
    if (guidHit) return guidHit;
  }
  if (hint.appleEpisodeId) {
    const appleHit = items.find((i) => i.appleEpisodeId === hint.appleEpisodeId || i.link?.includes(hint.appleEpisodeId!));
    if (appleHit) return appleHit;
  }
  if (hint.url) {
    const urlHit = items.find((i) => i.link && urlsLooselyEqual(i.link, hint.url!));
    if (urlHit) return urlHit;
  }
  if (hint.titleHint) {
    const ranked = items
      .map((i) => ({ i, score: scoreTitle(i.title, hint.titleHint!) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0] && ranked[0].score >= 0.62) return ranked[0].i;
  }
  return undefined;
}

async function transcriptForItem(feed: RssFeed, item: RssItem, sourceUrl: string): Promise<TranscriptResult> {
  const canonicalUrl = item.link || sourceUrl;
  const published = await loadPublishedTranscript(item);
  if (published && !isThin(published, item.durationMs)) {
    return finishTranscript({
      title: item.title,
      author: item.author ?? feed.author,
      durationMs: item.durationMs,
      source: "podcast",
      sourceUrl,
      canonicalUrl,
      cues: published,
    });
  }

  try {
    const yt = await searchYoutubeForEpisode(item.title, item.author ?? feed.author, item.durationMs);
    if (yt && isGoodEpisodeMatch(item.title, yt.title, item.durationMs, yt.durationMs)) {
      return {
        ...yt,
        title: item.title || yt.title,
        author: item.author ?? feed.author ?? yt.author,
        sourceUrl,
        canonicalUrl,
      };
    }
  } catch {
    /* continue waterfall */
  }

  if (published && published.length) {
    return finishTranscript({
      title: item.title,
      author: item.author ?? feed.author,
      durationMs: item.durationMs,
      source: "file",
      sourceUrl,
      canonicalUrl,
      cues: published,
    });
  }

  if (!item.enclosureUrl) {
    throw new TranscriptError(
      "no_audio",
      "No published transcript, YouTube captions, or audio enclosure for this episode.",
    );
  }

  return transcribeEnclosure({
    enclosureUrl: item.enclosureUrl,
    title: item.title,
    author: item.author ?? feed.author,
    sourceUrl,
    canonicalUrl,
    durationMs: item.durationMs,
  });
}

async function loadPublishedTranscript(item: RssItem): Promise<Cue[] | null> {
  const urls = [...item.transcriptUrls];
  if (item.link) {
    try {
      const extra = await scrapeEpisodePageForTranscript(item.link);
      urls.push(...extra);
    } catch {
      /* optional */
    }
  }
  for (const t of urls.slice(0, 4)) {
    try {
      const buf = await fetchBuffer(t.url, { timeoutMs: 20_000, maxBytes: 4 * 1024 * 1024, userAgent: PODCAST_UA });
      const cues = parseCaptionBytes(buf, t.type ?? t.url);
      if (cues.length) return cues;
    } catch {
      continue;
    }
  }
  return null;
}

async function scrapeEpisodePageForTranscript(pageUrl: string): Promise<{ url: string; type?: string }[]> {
  const html = await fetchText(pageUrl, { timeoutMs: 12_000, maxBytes: 1_500_000, userAgent: PODCAST_UA });
  const out: { url: string; type?: string }[] = [];
  const re = /href=["']([^"']+\.(?:srt|vtt|json|ttml))["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1]!, pageUrl).toString();
      out.push({ url: abs, type: m[1] });
    } catch {
      /* skip */
    }
  }
  return out;
}

function collectionFromFeed(feed: RssFeed, parsed: ParsedSourceUrl): CollectionResult {
  const source =
    parsed.kind.startsWith("apple") ? "apple" : parsed.kind.startsWith("spotify") ? "spotify" : parsed.kind === "youtube-playlist" ? "youtube" : "rss";
  return {
    kind: "collection",
    title: feed.title,
    author: feed.author,
    source,
    sourceUrl: parsed.canonicalUrl,
    items: feed.items.slice(0, COLLECTION_CAP).map((item) => ({
      title: item.title,
      url: item.link || parsed.canonicalUrl,
      feedUrl: feed.feedUrl,
      guid: item.guid,
      durationMs: item.durationMs,
      publishedAt: item.publishedAt,
      author: item.author ?? feed.author,
    } satisfies CollectionItem)),
  };
}

function finishTranscript(partial: {
  title: string;
  author?: string;
  durationMs?: number;
  source: TranscriptResult["source"];
  sourceUrl: string;
  canonicalUrl: string;
  cues: Cue[];
  language?: string;
  isAutoGenerated?: boolean;
}): TranscriptResult {
  const text = flattenCues(partial.cues);
  return {
    kind: "transcript",
    title: partial.title,
    author: partial.author,
    durationMs: partial.durationMs,
    source: partial.source,
    sourceUrl: partial.sourceUrl,
    canonicalUrl: partial.canonicalUrl,
    language: partial.language,
    isAutoGenerated: partial.isAutoGenerated,
    cues: partial.cues,
    text,
    wordCount: countWords(text),
    fetchedAt: new Date().toISOString(),
  };
}

function isThin(cues: Cue[], durationMs?: number): boolean {
  const words = countWords(flattenCues(cues));
  if (words < THIN_WORD_THRESHOLD) return true;
  if (durationMs && durationMs > 10 * 60_000 && words < 80) return true;
  return false;
}

function looksLikeShowOnly(input: TranscriptInput, feed: RssFeed): boolean {
  if (input.guid) return false;
  const parsed = parseSourceUrl(input.url);
  if (parsed.kind === "rss") {
    const self = feed.items.some((i) => i.link && urlsLooselyEqual(i.link, input.url));
    return !self;
  }
  return true;
}

function titleHintFromSource(parsed: ParsedSourceUrl, input: TranscriptInput): string | undefined {
  if (parsed.kind === "spotify-episode" || parsed.kind === "apple-episode") return undefined;
  try {
    const u = new URL(input.url);
    const last = u.pathname.split("/").filter(Boolean).at(-1);
    return last?.replace(/[-_]/g, " ");
  } catch {
    return undefined;
  }
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function first<T>(v: T | T[] | undefined | null): T | undefined {
  const arr = asArray(v);
  return arr[0];
}

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (typeof v === "object") {
    const rec = v as Record<string, unknown>;
    if (typeof rec["#text"] === "string") return rec["#text"].trim();
    if (typeof rec._ === "string") return rec._.trim();
    if (typeof rec.name === "string") return rec.name.trim();
  }
  return "";
}

function hrefOf(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  const arr = asArray(v);
  for (const item of arr) {
    if (typeof item === "string" && /^https?:/i.test(item)) return item;
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const href = stringAttr(rec, "@_href") || stringAttr(rec, "@_url");
      const rel = stringAttr(rec, "@_rel");
      if (href && (!rel || rel === "alternate" || rel === "self")) return href;
      if (href) return href;
    }
  }
  return "";
}

function stringAttr(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  return typeof v === "string" ? v : "";
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function urlsLooselyEqual(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.hostname.replace(/^www\./, "") === ub.hostname.replace(/^www\./, "") && ua.pathname.replace(/\/$/, "") === ub.pathname.replace(/\/$/, "");
  } catch {
    return normalize(a) === normalize(b);
  }
}
