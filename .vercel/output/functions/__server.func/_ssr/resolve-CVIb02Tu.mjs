import { c as parseSourceUrl, l as parseSrtTime, n as countWords, r as flattenCues, s as parseClockToMs } from "./time-DzjAGbLE.mjs";
import { t as XMLParser } from "../_libs/fast-xml-parser+strnum.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/resolve-CVIb02Tu.js
var TranscriptError = class extends Error {
	code;
	hint;
	constructor(code, message, hint) {
		super(message);
		this.name = "TranscriptError";
		this.code = code;
		this.hint = hint;
	}
};
var HINTS = {
	invalid_url: "Paste a YouTube, Apple Podcasts, Spotify, or RSS link.",
	no_transcript: "No captions or published transcript turned up. A show page may need an episode pick first.",
	blocked: "The source refused the request. Try again later, or pick a different host for the same episode.",
	no_audio: "The episode has no downloadable audio enclosure to transcribe.",
	timeout: "The source took too long. Retry the same URL; bulk jobs will pick up the rest.",
	not_found: "Nothing lives at that URL anymore.",
	unsupported: "That host is not a YouTube, podcast, or RSS source.",
	rate_limited: "Slow down a bit and retry. The queue will keep your other jobs.",
	stt_unavailable: "Speech-to-text is the last resort and is not available in this environment.",
	too_large: "Audio is over the 2 hour / 50 MB cap used for speech-to-text.",
	network: "A network hop failed. Check the URL and try again.",
	unknown: "Something unexpected failed while fetching the transcript."
};
function errorResult(code, message, hint) {
	return {
		kind: "error",
		code,
		message,
		hint: hint ?? HINTS[code]
	};
}
function toErrorResult(err) {
	if (err instanceof TranscriptError) return errorResult(err.code, err.message, err.hint);
	if (err instanceof Error) {
		const name = err.name.toLowerCase();
		const msg = err.message.toLowerCase();
		if (name === "aborterror" || msg.includes("timeout") || msg.includes("timed out")) return errorResult("timeout", "The request timed out.");
		if (msg.includes("fetch") || msg.includes("network") || msg.includes("enotfound")) return errorResult("network", err.message);
		return errorResult("unknown", err.message);
	}
	return errorResult("unknown", "Transcript fetch failed.");
}
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var PODCAST_UA = "Verbatim/1.0 (transcript fetcher; +https://verbatim.app)";
var DEFAULT_TIMEOUT_MS = 2e4;
var DEFAULT_MAX_BYTES = 8388608;
async function fetchResponse(url, opts = {}) {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const headers = {
			"User-Agent": opts.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
			Accept: opts.accept ?? "*/*",
			"Accept-Language": "en-US,en;q=0.9",
			...opts.headers
		};
		return await fetch(url, {
			method: opts.method ?? "GET",
			headers,
			body: opts.body,
			redirect: "follow",
			signal: controller.signal
		});
	} catch (err) {
		throw mapFetchError(err);
	} finally {
		clearTimeout(timer);
	}
}
async function fetchText(url, opts = {}) {
	const res = await fetchResponse(url, opts);
	await assertOk(res, url);
	const buf = await readLimited(res, opts.maxBytes ?? DEFAULT_MAX_BYTES);
	return new TextDecoder("utf-8").decode(buf);
}
async function fetchBuffer(url, opts = {}) {
	const res = await fetchResponse(url, opts);
	await assertOk(res, url);
	return readLimited(res, opts.maxBytes ?? DEFAULT_MAX_BYTES);
}
async function fetchJson(url, opts = {}) {
	const text = await fetchText(url, {
		...opts,
		accept: opts.accept ?? "application/json, text/javascript, */*;q=0.8"
	});
	try {
		return JSON.parse(text);
	} catch {
		throw new TranscriptError("unknown", "The source returned invalid JSON.");
	}
}
async function fetchHead(url, opts = {}) {
	try {
		return await fetchResponse(url, {
			...opts,
			method: "HEAD",
			timeoutMs: opts.timeoutMs ?? 1e4
		});
	} catch {
		return fetchResponse(url, {
			...opts,
			method: "GET",
			timeoutMs: opts.timeoutMs ?? 1e4
		});
	}
}
async function readLimited(res, maxBytes) {
	const lenHeader = res.headers.get("content-length");
	if (lenHeader) {
		const len = Number(lenHeader);
		if (Number.isFinite(len) && len > maxBytes) throw new TranscriptError("too_large", `Response is ${len} bytes; the cap is ${maxBytes} bytes.`);
	}
	if (!res.body) {
		const buf = new Uint8Array(await res.arrayBuffer());
		if (buf.byteLength > maxBytes) throw new TranscriptError("too_large", `Response exceeded ${maxBytes} bytes.`);
		return buf;
	}
	const reader = res.body.getReader();
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.byteLength;
		if (total > maxBytes) {
			try {
				await reader.cancel();
			} catch {}
			throw new TranscriptError("too_large", `Response exceeded ${maxBytes} bytes.`);
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}
async function assertOk(res, url) {
	if (res.ok) return;
	const status = res.status;
	if (status === 404 || status === 410) throw new TranscriptError("not_found", `Nothing found at ${hostOf(url)} (${status}).`);
	if (status === 401 || status === 403 || status === 451) throw new TranscriptError("blocked", `${hostOf(url)} refused the request (${status}).`);
	if (status === 429) throw new TranscriptError("rate_limited", `${hostOf(url)} rate-limited the request.`);
	if (status >= 500) throw new TranscriptError("network", `${hostOf(url)} returned ${status}.`);
	throw new TranscriptError("network", `${hostOf(url)} returned ${status}.`);
}
function mapFetchError(err) {
	if (err instanceof TranscriptError) return err;
	if (err instanceof Error) {
		const name = err.name.toLowerCase();
		const msg = err.message.toLowerCase();
		if (name === "aborterror" || msg.includes("aborted") || msg.includes("timeout")) return new TranscriptError("timeout", "The request timed out.");
		return new TranscriptError("network", err.message);
	}
	return new TranscriptError("network", "Network request failed.");
}
function hostOf(url) {
	try {
		return new URL(url).hostname;
	} catch {
		return "source";
	}
}
function decodeHtmlEntities(input) {
	return input.replace(/&nbsp;/gi, " ").replace(/&/gi, "&").replace(/"/gi, "\"").replace(/&#39;|'/gi, "'").replace(/</gi, "<").replace(/>/gi, ">").replace(/&#(\d+);/g, (_, n) => {
		const code = Number(n);
		return Number.isFinite(code) ? String.fromCharCode(code) : _;
	}).replace(/&#x([0-9a-f]+);/gi, (_, n) => {
		const code = parseInt(n, 16);
		return Number.isFinite(code) ? String.fromCharCode(code) : _;
	});
}
function stripHtml(input) {
	return decodeHtmlEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function extractJsonObject(source, marker) {
	const idx = source.indexOf(marker);
	if (idx < 0) return null;
	const start = source.indexOf("{", idx);
	if (start < 0) return null;
	let depth = 0;
	let inString = false;
	let escape = false;
	for (let i = start; i < source.length; i++) {
		const ch = source[i];
		if (inString) {
			if (escape) escape = false;
			else if (ch === "\\") escape = true;
			else if (ch === "\"") inString = false;
			continue;
		}
		if (ch === "\"") {
			inString = true;
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				const slice = source.slice(start, i + 1);
				try {
					return JSON.parse(slice);
				} catch {
					return null;
				}
			}
		}
	}
	return null;
}
var STOP = /* @__PURE__ */ new Set([
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
	"show"
]);
function normalizeTitle(title) {
	return title.toLowerCase().replace(/[#|_]+/g, " ").replace(/\b(ep|episode)\s*\d+\b/g, " ").replace(/^\s*\d+\s*[:.\-)]\s*/, " ").replace(/^\s*\d+\s+/, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function titleTokens(title) {
	return normalizeTitle(title).split(" ").filter((t) => t.length > 1 && !STOP.has(t));
}
function scoreTitle(a, b) {
	const na = normalizeTitle(a);
	const nb = normalizeTitle(b);
	if (!na || !nb) return 0;
	if (na === nb) return 1;
	if (na.includes(nb) || nb.includes(na)) {
		const shorter = Math.min(na.length, nb.length);
		const longer = Math.max(na.length, nb.length);
		return Math.max(.72, shorter / longer);
	}
	const ta = new Set(titleTokens(a));
	const tb = new Set(titleTokens(b));
	if (!ta.size || !tb.size) return dice(na, nb);
	let overlap = 0;
	for (const t of ta) if (tb.has(t)) overlap++;
	const jaccard = overlap / (/* @__PURE__ */ new Set([...ta, ...tb])).size;
	const overlapCoeff = overlap / Math.min(ta.size, tb.size);
	const diceScore = dice(na, nb);
	return Math.max(jaccard, overlapCoeff * .95, diceScore * .9);
}
function scoreDuration(aMs, bMs) {
	if (!aMs || !bMs || aMs <= 0 || bMs <= 0) return .5;
	const delta = Math.abs(aMs - bMs);
	if (delta <= 5e3) return 1;
	if (delta <= 15e3) return .92;
	if (delta <= 3e4) return .8;
	const pct = delta / Math.max(aMs, bMs);
	if (pct <= .08) return .78;
	if (pct <= .15) return .62;
	if (pct <= .25) return .4;
	return Math.max(0, 1 - pct);
}
function combinedScore(titleA, titleB, durationA, durationB) {
	const t = scoreTitle(titleA, titleB);
	const d = scoreDuration(durationA, durationB);
	return t * .72 + d * .28;
}
function isGoodEpisodeMatch(titleA, titleB, durationA, durationB) {
	const t = scoreTitle(titleA, titleB);
	const d = scoreDuration(durationA, durationB);
	if (t >= .86 && d >= .4) return true;
	if (t >= .6 && d >= .78) return true;
	return combinedScore(titleA, titleB, durationA, durationB) >= .7;
}
function dice(a, b) {
	if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
	const bg = (s) => {
		const set = /* @__PURE__ */ new Map();
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
	return total ? 2 * overlap / total : 0;
}
var MIN_CUE_MS = 200;
function parseCaptionBytes(bytes, mimeHint) {
	const trimmed = stripBom(typeof bytes === "string" ? bytes : decodeCaptionText(bytes)).trim();
	if (!trimmed) return [];
	const hint = (mimeHint ?? "").toLowerCase();
	if (hint.includes("json3") || looksLikeJson3(trimmed)) return normalizeCues(parseJson3(trimmed));
	if (hint.includes("json") || looksLikeJson(trimmed)) return normalizeCues(parseJsonTranscript(trimmed));
	if (hint.includes("vtt") || trimmed.startsWith("WEBVTT")) return normalizeCues(parseVtt(trimmed));
	if (hint.includes("srt") || looksLikeSrt(trimmed)) return normalizeCues(parseSrt(trimmed));
	if (hint.includes("ttml") || hint.includes("xml") || trimmed.startsWith("<")) {
		const xmlCues = parseXmlCaptions(trimmed);
		if (xmlCues.length) return normalizeCues(xmlCues);
	}
	if (looksLikeSrt(trimmed)) return normalizeCues(parseSrt(trimmed));
	if (looksLikeVtt(trimmed)) return normalizeCues(parseVtt(trimmed));
	return [];
}
function decodeCaptionText(bytes) {
	if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 254) return new TextDecoder("utf-16le").decode(bytes);
	if (bytes.length >= 2 && bytes[0] === 254 && bytes[1] === 255) return new TextDecoder("utf-16be").decode(bytes);
	return new TextDecoder("utf-8").decode(bytes);
}
function stripBom(text) {
	return text.replace(/^\uFEFF/, "");
}
function looksLikeJson(text) {
	return text.startsWith("{") || text.startsWith("[");
}
function looksLikeJson3(text) {
	return text.includes("\"events\"") && text.includes("tStartMs");
}
function looksLikeSrt(text) {
	return /\d+\s+\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(text);
}
function looksLikeVtt(text) {
	return text.includes("-->") && (text.startsWith("WEBVTT") || /\d{1,2}:\d{2}[.]\d{3}\s+-->/.test(text));
}
function parseJson3(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		return [];
	}
	const cues = [];
	for (const event of data.events ?? []) {
		if (!event.segs?.length) continue;
		const textLine = event.segs.map((s) => s.utf8 ?? "").join("").replace(/\n+/g, " ").trim();
		if (!textLine || textLine === "\n") continue;
		const start = event.tStartMs ?? 0;
		const end = start + (event.dDurationMs ?? 2e3);
		cues.push({
			startMs: start,
			endMs: Math.max(start + MIN_CUE_MS, end),
			text: decodeHtmlEntities(textLine)
		});
	}
	return cues;
}
function parseJsonTranscript(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		return [];
	}
	if (data && typeof data === "object" && "events" in data) return parseJson3(text);
	if (Array.isArray(data)) return data.flatMap((row) => cueFromUnknown(row));
	if (data && typeof data === "object") {
		const obj = data;
		if (Array.isArray(obj.segments)) return obj.segments.flatMap((row) => cueFromUnknown(row));
		if (Array.isArray(obj.transcripts)) return obj.transcripts.flatMap((row) => cueFromUnknown(row));
		if (Array.isArray(obj.cues)) return obj.cues.flatMap((row) => cueFromUnknown(row));
		if (Array.isArray(obj.results)) return obj.results.flatMap((row) => cueFromUnknown(row));
		if (typeof obj.text === "string" && Array.isArray(obj.words)) return wordsToCues(obj.words);
	}
	return [];
}
function cueFromUnknown(row) {
	if (!row || typeof row !== "object") return [];
	const r = row;
	const text = String(r.text ?? r.body ?? r.utterance ?? r.content ?? "").trim();
	if (!text) return [];
	const start = numMs(r.startMs) ?? numMs(r.startTime) ?? numSec(r.start) ?? numMs(r.begin) ?? 0;
	const end = numMs(r.endMs) ?? numMs(r.endTime) ?? numSec(r.end) ?? start + 2e3;
	const speaker = optionalString(r.speaker ?? r.speakerLabel ?? r.name);
	return [{
		startMs: start,
		endMs: Math.max(start + MIN_CUE_MS, end),
		text: stripHtml(text),
		speaker
	}];
}
function wordsToCues(words) {
	const parsed = [];
	for (const w of words) {
		if (!w || typeof w !== "object") continue;
		const r = w;
		const text = String(r.text ?? r.word ?? "").trim();
		if (!text) continue;
		const start = numMs(r.startMs) ?? numSec(r.start) ?? 0;
		const end = numMs(r.endMs) ?? numSec(r.end) ?? start + 400;
		const speaker = optionalString(r.speaker);
		parsed.push({
			startMs: start,
			endMs: end,
			text,
			speaker
		});
	}
	return groupWordCues(parsed);
}
function groupWordCues(words) {
	const cues = [];
	let current = null;
	for (const word of words) {
		const speakerChanged = current && (current.speaker ?? "") !== (word.speaker ?? "");
		const tooLong = current && word.endMs - current.startMs > 8e3;
		const punctuated = current && /[.!?]$/.test(current.text) && word.startMs - current.endMs > 180;
		if (!current || speakerChanged || tooLong || punctuated) {
			if (current) cues.push(current);
			current = { ...word };
			continue;
		}
		const joiner = /^[.,!?)]/.test(word.text) ? "" : " ";
		current = {
			startMs: current.startMs,
			endMs: word.endMs,
			text: `${current.text}${joiner}${word.text}`.replace(/\s+/g, " ").trim(),
			speaker: current.speaker
		};
	}
	if (current) cues.push(current);
	return cues;
}
function parseVtt(text) {
	const blocks = text.replace(/^WEBVTT[^\n]*\n/, "").split(/\n{2,}/);
	const cues = [];
	for (const block of blocks) {
		const lines = block.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("NOTE") && !l.startsWith("STYLE"));
		const timeLine = lines.find((l) => l.includes("-->"));
		if (!timeLine) continue;
		const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim().split(/\s+/)[0] ?? "");
		const textLines = lines.filter((l) => l !== timeLine && !/^\d+$/.test(l));
		const cueText = stripHtml(textLines.join(" ").replace(/<v\s+([^>]+)>/gi, "$1: "));
		if (!cueText) continue;
		const speakerMatch = textLines.join(" ").match(/<v\s+([^>]+)>/i);
		cues.push({
			startMs: parseSrtTime(startRaw ?? "0"),
			endMs: parseSrtTime(endRaw ?? "0"),
			text: cueText,
			speaker: speakerMatch?.[1]?.trim()
		});
	}
	return cues;
}
function parseSrt(text) {
	const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
	const cues = [];
	for (const block of blocks) {
		const lines = block.split("\n").filter(Boolean);
		if (!lines.length) continue;
		const timeIndex = lines.findIndex((l) => l.includes("-->"));
		if (timeIndex < 0) continue;
		const [startRaw, endRaw] = lines[timeIndex].split("-->").map((s) => s.trim());
		const cueText = stripHtml(lines.slice(timeIndex + 1).join(" "));
		if (!cueText) continue;
		cues.push({
			startMs: parseSrtTime(startRaw ?? "0"),
			endMs: parseSrtTime(endRaw ?? "0"),
			text: cueText
		});
	}
	return cues;
}
function parseXmlCaptions(text) {
	const transcript = [...text.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)];
	if (transcript.length) return transcript.map((m) => {
		const attrs = m[1] ?? "";
		const start = Number(attr(attrs, "start") ?? 0);
		const dur = Number(attr(attrs, "dur") ?? attr(attrs, "duration") ?? 2);
		const startMs = start > 1e3 ? start : start * 1e3;
		return {
			startMs,
			endMs: startMs + (dur > 1e3 ? dur : dur * 1e3),
			text: stripHtml(m[2] ?? "")
		};
	}).filter((c) => c.text);
	const pTags = [...text.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)];
	if (pTags.length) return pTags.map((m) => {
		const attrs = m[1] ?? "";
		const begin = attr(attrs, "begin") ?? attr(attrs, "start") ?? "0";
		const end = attr(attrs, "end");
		const dur = attr(attrs, "dur");
		const startMs = ttmlTimeToMs(begin);
		const endMs = end ? ttmlTimeToMs(end) : startMs + (dur ? ttmlTimeToMs(dur) : 2e3);
		const speaker = attr(attrs, "tts:origin") ?? void 0;
		return {
			startMs,
			endMs,
			text: stripHtml(m[2] ?? ""),
			speaker
		};
	}).filter((c) => c.text);
	return [];
}
function attr(attrs, name) {
	return attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
}
function ttmlTimeToMs(raw) {
	if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1e3);
	if (raw.endsWith("ms")) return Math.round(Number(raw.slice(0, -2)));
	if (raw.endsWith("s")) return Math.round(Number(raw.slice(0, -1)) * 1e3);
	if (raw.endsWith("t")) return Math.round(Number(raw.slice(0, -1)) / 90);
	return parseSrtTime(raw.replace(".", ","));
}
function numMs(v) {
	if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
	if (typeof v === "string" && v.trim()) {
		const n = Number(v);
		if (Number.isFinite(n)) return Math.round(n);
	}
}
function numSec(v) {
	if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 1e3);
	if (typeof v === "string" && v.trim()) {
		const n = Number(v);
		if (Number.isFinite(n)) return Math.round(n * 1e3);
	}
}
function optionalString(v) {
	if (typeof v === "string" && v.trim()) return v.trim();
	if (typeof v === "number") return String(v);
}
function normalizeCues(cues) {
	const cleaned = cues.map((c) => ({
		startMs: Math.max(0, Math.round(c.startMs)),
		endMs: Math.max(0, Math.round(c.endMs)),
		text: c.text.replace(/\s+/g, " ").trim(),
		speaker: c.speaker?.trim() || void 0
	})).filter((c) => c.text).map((c) => ({
		...c,
		endMs: c.endMs <= c.startMs ? c.startMs + 1e3 : c.endMs
	})).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
	const merged = [];
	for (const cue of cleaned) {
		const prev = merged[merged.length - 1];
		if (prev && prev.text === cue.text && cue.startMs <= prev.endMs + 80 && (prev.speaker ?? "") === (cue.speaker ?? "")) {
			prev.endMs = Math.max(prev.endMs, cue.endMs);
			continue;
		}
		merged.push({ ...cue });
	}
	return merged;
}
var MAX_AUDIO_BYTES = 52428800;
var MAX_AUDIO_MS = 72e5;
var STT_TIMEOUT_MS = 18e4;
function assertAudioBudget(durationMs, byteLength) {
	if (durationMs && durationMs > MAX_AUDIO_MS) throw new TranscriptError("too_large", "That episode is longer than the 2 hour speech-to-text cap.");
	if (byteLength && byteLength > MAX_AUDIO_BYTES) throw new TranscriptError("too_large", "Audio is over the 50 MB speech-to-text cap.");
}
async function transcribeEnclosure(opts) {
	assertAudioBudget(opts.durationMs);
	const apiKey = process.env.XAI_API_KEY?.trim();
	if (!apiKey) throw new TranscriptError("stt_unavailable", "No captions or published transcript, and speech-to-text is unavailable.");
	let byteLength;
	try {
		const head = await fetchHead(opts.enclosureUrl, { timeoutMs: 12e3 });
		const len = Number(head.headers.get("content-length") ?? 0);
		if (Number.isFinite(len) && len > 0) byteLength = len;
	} catch {}
	assertAudioBudget(opts.durationMs, byteLength);
	const stt = await callXaiStt({
		enclosureUrl: opts.enclosureUrl,
		apiKey,
		byteLength
	});
	const cues = cuesFromStt(stt, opts.durationMs);
	if (!cues.length && !stt.text?.trim()) throw new TranscriptError("no_transcript", "Speech-to-text returned an empty transcript.");
	const text = flattenCues(cues.length ? cues : [{
		startMs: 0,
		endMs: opts.durationMs ?? 1e3,
		text: stt.text ?? ""
	}]);
	return {
		kind: "transcript",
		title: opts.title,
		author: opts.author,
		durationMs: opts.durationMs ?? (stt.duration ? Math.round(stt.duration * 1e3) : void 0),
		source: "stt",
		sourceUrl: opts.sourceUrl,
		canonicalUrl: opts.canonicalUrl,
		language: stt.language,
		isAutoGenerated: true,
		cues: cues.length ? cues : [{
			startMs: 0,
			endMs: opts.durationMs ?? 1e3,
			text: stt.text ?? ""
		}],
		text,
		wordCount: countWords(text),
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
async function callXaiStt(opts) {
	const form = new FormData();
	form.set("model", "grok-voice-transcribe-2.0");
	form.set("language", "en");
	form.set("format", "true");
	form.set("diarize", "true");
	if (opts.byteLength && opts.byteLength > MAX_AUDIO_BYTES) throw new TranscriptError("too_large", "Audio is over the 50 MB speech-to-text cap.");
	form.set("url", opts.enclosureUrl);
	const res = await fetch("https://api.x.ai/v1/stt", {
		method: "POST",
		headers: { Authorization: `Bearer ${opts.apiKey}` },
		body: form,
		signal: AbortSignal.timeout(STT_TIMEOUT_MS)
	}).catch((err) => {
		if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) throw new TranscriptError("timeout", "Speech-to-text timed out.");
		throw new TranscriptError("network", "Could not reach speech-to-text.");
	});
	if (res.status === 413) return callXaiSttWithFile(opts);
	if (!res.ok) {
		if (res.status === 401 || res.status === 403) throw new TranscriptError("stt_unavailable", "Speech-to-text refused the request.");
		const fallback = await callXaiSttWithFile(opts).catch(() => null);
		if (fallback) return fallback;
		throw new TranscriptError("no_transcript", `Speech-to-text failed (${res.status}).`);
	}
	return await res.json();
}
async function callXaiSttWithFile(opts) {
	const buf = await fetchBuffer(opts.enclosureUrl, {
		timeoutMs: 9e4,
		maxBytes: MAX_AUDIO_BYTES
	});
	const form = new FormData();
	form.set("model", "grok-voice-transcribe-2.0");
	form.set("language", "en");
	form.set("format", "true");
	form.set("diarize", "true");
	form.set("file", new File([Buffer.from(buf)], "episode.mp3", { type: "audio/mpeg" }));
	const res = await fetch("https://api.x.ai/v1/stt", {
		method: "POST",
		headers: { Authorization: `Bearer ${opts.apiKey}` },
		body: form,
		signal: AbortSignal.timeout(STT_TIMEOUT_MS)
	});
	if (!res.ok) throw new TranscriptError("no_transcript", `Speech-to-text failed (${res.status}).`);
	return await res.json();
}
function cuesFromStt(stt, durationMs) {
	const words = [];
	for (const w of stt.words ?? []) {
		const text = (w.text ?? "").trim();
		if (!text) continue;
		const startMs = Math.round((w.start ?? 0) * 1e3);
		const endMs = Math.round((w.end ?? (w.start ?? 0) + .4) * 1e3);
		const speaker = w.speaker == null ? void 0 : `Speaker ${w.speaker}`;
		words.push({
			startMs,
			endMs,
			text,
			speaker
		});
	}
	if (words.length) return groupWordCues(words);
	const text = (stt.text ?? "").trim();
	if (!text) return [];
	const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
	const slice = (durationMs && durationMs > 0 ? durationMs : sentences.length * 3e3) / Math.max(sentences.length, 1);
	return sentences.map((sentence, i) => ({
		startMs: Math.round(i * slice),
		endMs: Math.round((i + 1) * slice),
		text: sentence
	}));
}
var WEB_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
var ANDROID_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
var COLLECTION_CAP$1 = 40;
var YT_COOKIES = "CONSENT=YES+; SOCS=CAI";
var CLIENTS = [
	{
		name: "ANDROID",
		version: "19.29.37",
		key: ANDROID_KEY,
		extra: { androidSdkVersion: 30 }
	},
	{
		name: "WEB_EMBEDDED_PLAYER",
		version: "1.20241201.00.00"
	},
	{
		name: "IOS",
		version: "19.29.1",
		extra: {
			deviceMake: "Apple",
			deviceModel: "iPhone16,2"
		}
	},
	{
		name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
		version: "2.0"
	},
	{
		name: "WEB",
		version: "2.20241201.01.00",
		key: WEB_KEY
	}
];
async function resolveYoutube(parsed) {
	if (parsed.kind === "youtube-playlist" || !parsed.videoId && parsed.playlistId) return fetchPlaylist(parsed.playlistId, parsed.canonicalUrl);
	if (!parsed.videoId) throw new TranscriptError("invalid_url", "That YouTube link is missing a video id.");
	return fetchVideoTranscript(parsed.videoId, parsed.canonicalUrl);
}
async function fetchVideoTranscript(videoId, sourceUrl) {
	const player = await loadPlayer(videoId);
	const status = player.playabilityStatus?.status;
	if (status && status !== "OK") {
		const reason = player.playabilityStatus?.reason ?? status;
		if (status === "LOGIN_REQUIRED" || status === "UNPLAYABLE" || /sign in|unavailable|private/i.test(reason)) throw new TranscriptError("blocked", `YouTube blocked playback (${reason}).`);
		if (status === "ERROR") throw new TranscriptError("not_found", reason || "YouTube could not find that video.");
	}
	const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
	if (!tracks.length) throw new TranscriptError("no_transcript", "This video has no caption track.", "YouTube only returns a transcript when captions exist. Auto-ASR is used when that is all there is.");
	const track = pickCaptionTrack(tracks);
	if (!track?.baseUrl) throw new TranscriptError("no_transcript", "Caption tracks were listed but none could be downloaded.");
	const { cues, isAutoGenerated, language } = await downloadTrack(track);
	if (!cues.length) throw new TranscriptError("no_transcript", "The caption track was empty.");
	const details = player.videoDetails;
	const durationSec = Number(details?.lengthSeconds ?? player.microformat?.playerMicroformatRenderer?.lengthSeconds ?? 0);
	const text = flattenCues(cues);
	return {
		kind: "transcript",
		title: details?.title || `YouTube ${videoId}`,
		author: details?.author || player.microformat?.playerMicroformatRenderer?.ownerChannelName,
		durationMs: Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1e3 : void 0,
		source: "youtube",
		sourceUrl,
		canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
		language,
		isAutoGenerated,
		cues,
		text,
		wordCount: countWords(text),
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
async function searchYoutubeForEpisode(title, author, durationMs) {
	const hits = await searchYoutube([
		title,
		author,
		"podcast"
	].filter(Boolean).join(" "));
	for (const hit of hits.slice(0, 8)) {
		if (!isGoodEpisodeMatch(title, hit.title, durationMs, hit.durationMs)) continue;
		try {
			const transcript = await fetchVideoTranscript(hit.videoId, `https://www.youtube.com/watch?v=${hit.videoId}`);
			if (isGoodEpisodeMatch(title, transcript.title, durationMs, transcript.durationMs)) return transcript;
		} catch {
			continue;
		}
	}
	return null;
}
async function loadPlayer(videoId) {
	const fromWatch = await playerFromWatchPage(videoId);
	if (fromWatch && hasUsablePlayer(fromWatch)) return fromWatch;
	let lastErr;
	for (const client of CLIENTS) try {
		const player = await playerFromInnertube(videoId, client);
		if (hasUsablePlayer(player) || player.playabilityStatus) return player;
	} catch (err) {
		lastErr = err;
	}
	if (fromWatch) return fromWatch;
	if (lastErr instanceof TranscriptError) throw lastErr;
	throw new TranscriptError("blocked", "YouTube did not return a player response.");
}
function hasUsablePlayer(player) {
	const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks;
	return Boolean(tracks?.length) || player.playabilityStatus?.status === "OK";
}
async function playerFromWatchPage(videoId) {
	try {
		const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`, {
			timeoutMs: 18e3,
			headers: {
				Cookie: YT_COOKIES,
				"Accept-Language": "en-US,en;q=0.9"
			},
			userAgent: BROWSER_UA
		});
		return extractJsonObject(html, "ytInitialPlayerResponse") ?? extractJsonObject(html, "var ytInitialPlayerResponse") ?? null;
	} catch {
		return null;
	}
}
async function playerFromInnertube(videoId, client) {
	const url = `https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${client.key ?? WEB_KEY}`;
	const body = {
		context: {
			client: {
				clientName: client.name,
				clientVersion: client.version,
				hl: "en",
				gl: "US",
				...client.extra
			},
			thirdParty: client.name.includes("EMBEDDED") ? { embedUrl: "https://www.youtube.com/" } : void 0
		},
		videoId,
		contentCheckOk: true,
		racyCheckOk: true
	};
	return fetchJson(url, {
		method: "POST",
		body: JSON.stringify(body),
		timeoutMs: 18e3,
		headers: {
			"Content-Type": "application/json",
			Cookie: YT_COOKIES,
			Origin: "https://www.youtube.com",
			Referer: `https://www.youtube.com/watch?v=${videoId}`,
			"X-YouTube-Client-Name": client.name === "ANDROID" ? "3" : "1",
			"X-YouTube-Client-Version": client.version
		},
		userAgent: client.name === "ANDROID" ? "com.google.android.youtube/19.29.37 (Linux; U; Android 14)" : BROWSER_UA
	});
}
function pickCaptionTrack(tracks) {
	return tracks.filter((t) => t.baseUrl).map((t) => {
		const lang = (t.languageCode ?? "").toLowerCase();
		const auto = t.kind === "asr" || (t.vssId ?? "").startsWith("a.");
		let score = 0;
		if (lang === "en" || lang.startsWith("en-")) score += 50;
		else if (lang === "en-orig" || lang.includes("en")) score += 40;
		if (!auto) score += 30;
		if (lang === "en" && !auto) score += 20;
		return {
			t,
			score
		};
	}).sort((a, b) => b.score - a.score)[0]?.t ?? tracks[0];
}
async function downloadTrack(track) {
	const base = decodeAmp(track.baseUrl ?? "");
	if (!base) throw new TranscriptError("no_transcript", "Caption URL was empty.");
	const attempts = [
		withFmt(base, "json3"),
		withFmt(base, "vtt"),
		base
	];
	let lastErr;
	for (const url of attempts) try {
		const res = await fetchResponse(url, {
			timeoutMs: 25e3,
			headers: { Cookie: YT_COOKIES },
			userAgent: BROWSER_UA
		});
		if (!res.ok) continue;
		const cues = parseCaptionBytes(new Uint8Array(await res.arrayBuffer()), url.includes("fmt=json3") ? "application/json3" : url.includes("fmt=vtt") ? "text/vtt" : res.headers.get("content-type") ?? "");
		if (cues.length) return {
			cues,
			isAutoGenerated: track.kind === "asr" || (track.vssId ?? "").startsWith("a."),
			language: track.languageCode
		};
	} catch (err) {
		lastErr = err;
	}
	if (lastErr instanceof TranscriptError) throw lastErr;
	throw new TranscriptError("no_transcript", "Could not parse the caption track.");
}
function withFmt(url, fmt) {
	try {
		const u = new URL(url);
		u.searchParams.set("fmt", fmt);
		return u.toString();
	} catch {
		return `${url}${url.includes("?") ? "&" : "?"}fmt=${fmt}`;
	}
}
function decodeAmp(url) {
	return url.replace(/&/g, "&");
}
async function fetchPlaylist(playlistId, sourceUrl) {
	const items = await playlistItems(playlistId);
	if (!items.length) throw new TranscriptError("not_found", "That playlist is empty or unavailable.");
	return {
		kind: "collection",
		title: items[0]?.author ? `${items[0].author} playlist` : "YouTube playlist",
		author: items[0]?.author,
		source: "youtube",
		sourceUrl,
		items: items.slice(0, COLLECTION_CAP$1)
	};
}
async function playlistItems(playlistId) {
	try {
		const found = walkPlaylist(extractJsonObject(await fetchText(`https://www.youtube.com/playlist?list=${playlistId}`, {
			timeoutMs: 18e3,
			headers: { Cookie: YT_COOKIES }
		}), "ytInitialData"));
		if (found.length) return found;
	} catch {}
	try {
		return walkPlaylist(await fetchJson(`https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&key=${WEB_KEY}`, {
			method: "POST",
			body: JSON.stringify({
				context: { client: {
					clientName: "WEB",
					clientVersion: "2.20241201.01.00",
					hl: "en"
				} },
				browseId: `VL${playlistId}`
			}),
			headers: {
				"Content-Type": "application/json",
				Cookie: YT_COOKIES,
				Origin: "https://www.youtube.com"
			},
			timeoutMs: 18e3
		}));
	} catch {
		return [];
	}
}
function walkPlaylist(node, acc = []) {
	if (!node || acc.length >= COLLECTION_CAP$1) return acc;
	if (Array.isArray(node)) {
		for (const child of node) walkPlaylist(child, acc);
		return acc;
	}
	if (typeof node !== "object") return acc;
	const rec = node;
	const renderer = rec.playlistVideoRenderer;
	if (renderer?.videoId) {
		const videoId = String(renderer.videoId);
		const title = textRuns(renderer.title) || `Video ${videoId}`;
		const length = textRuns(renderer.lengthText);
		acc.push({
			title,
			url: `https://www.youtube.com/watch?v=${videoId}`,
			durationMs: parseClockToMs(length),
			thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
			author: textRuns(renderer.shortBylineText)
		});
		return acc;
	}
	for (const value of Object.values(rec)) walkPlaylist(value, acc);
	return acc;
}
function textRuns(value) {
	if (!value) return "";
	if (typeof value === "string") return stripHtml(value);
	if (typeof value === "object") {
		const rec = value;
		if (typeof rec.simpleText === "string") return rec.simpleText;
		if (Array.isArray(rec.runs)) return rec.runs.map((r) => r && typeof r === "object" && "text" in r ? String(r.text) : "").join("");
	}
	return "";
}
async function searchYoutube(query) {
	try {
		const hits = walkSearch(await fetchJson(`https://www.youtube.com/youtubei/v1/search?prettyPrint=false&key=${WEB_KEY}`, {
			method: "POST",
			body: JSON.stringify({
				context: { client: {
					clientName: "WEB",
					clientVersion: "2.20241201.01.00",
					hl: "en"
				} },
				query
			}),
			headers: {
				"Content-Type": "application/json",
				Cookie: YT_COOKIES,
				Origin: "https://www.youtube.com"
			},
			timeoutMs: 18e3
		}));
		if (hits.length) return hits;
	} catch {}
	try {
		return walkSearch(extractJsonObject(await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
			timeoutMs: 18e3,
			headers: { Cookie: YT_COOKIES }
		}), "ytInitialData"));
	} catch {
		return [];
	}
}
function walkSearch(node, acc = []) {
	if (!node || acc.length >= 16) return acc;
	if (Array.isArray(node)) {
		for (const child of node) walkSearch(child, acc);
		return acc;
	}
	if (typeof node !== "object") return acc;
	const rec = node;
	const renderer = rec.videoRenderer;
	if (renderer?.videoId) {
		acc.push({
			videoId: String(renderer.videoId),
			title: textRuns(renderer.title),
			durationMs: parseClockToMs(textRuns(renderer.lengthText)),
			author: textRuns(renderer.ownerText) || textRuns(renderer.shortBylineText)
		});
		return acc;
	}
	for (const value of Object.values(rec)) walkSearch(value, acc);
	return acc;
}
var COLLECTION_CAP = 40;
var MATCH_SCAN_CAP = 200;
var THIN_WORD_THRESHOLD = 40;
var xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	textNodeName: "#text",
	trimValues: true,
	parseAttributeValue: false
});
async function resolvePodcast(input, parsed) {
	const source = parsed ?? parseSourceUrl(input.url);
	const resolved = await resolveFeed(input, source);
	if (input.feedUrl && input.guid) {
		const item = matchItem(resolved.items, input);
		if (!item) throw new TranscriptError("not_found", "That episode is no longer in the feed.");
		return transcriptForItem(resolved, item, input.url);
	}
	if (source.kind === "apple-show" || source.kind === "spotify-show" || source.kind === "rss" && !input.guid && looksLikeShowOnly(input, resolved)) return collectionFromFeed(resolved, source);
	const item = matchItem(resolved.items, {
		url: input.url,
		guid: input.guid,
		titleHint: titleHintFromSource(source, input),
		appleEpisodeId: source.appleEpisodeId,
		spotifyUrl: source.kind.startsWith("spotify") ? source.canonicalUrl : void 0
	});
	if (!item) {
		if (resolved.items.length) return collectionFromFeed(resolved, source);
		throw new TranscriptError("not_found", "Could not match that episode in the RSS feed.");
	}
	return transcriptForItem(resolved, item, input.url);
}
async function resolveFeed(input, parsed) {
	if (input.feedUrl) return fetchRss(input.feedUrl);
	if (parsed.kind === "rss") return fetchRss(parsed.canonicalUrl);
	if (parsed.kind === "apple-episode" || parsed.kind === "apple-show") return resolveApple(parsed);
	if (parsed.kind === "spotify-episode" || parsed.kind === "spotify-show") return resolveSpotify(parsed);
	try {
		return await fetchRss(parsed.canonicalUrl);
	} catch (err) {
		if (err instanceof TranscriptError && err.code === "invalid_url") throw err;
		throw new TranscriptError("unsupported", "Could not resolve that link to an RSS feed.");
	}
}
async function resolveApple(parsed) {
	const lookupId = parsed.appleEpisodeId ?? parsed.appleShowId;
	if (!lookupId) throw new TranscriptError("invalid_url", "Apple Podcasts id is missing.");
	const feedUrl = ((await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(lookupId)}&entity=podcast`, {
		timeoutMs: 15e3,
		userAgent: PODCAST_UA
	})).results?.[0])?.feedUrl;
	if (!feedUrl) throw new TranscriptError("not_found", "Apple did not return an RSS feed for that show.");
	return fetchRss(feedUrl);
}
async function resolveSpotify(parsed) {
	const oembed = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.canonicalUrl)}`, {
		timeoutMs: 15e3,
		userAgent: PODCAST_UA
	}).catch(() => null);
	const title = oembed?.title?.replace(/\s+[-–|]\s+.*$/, "").trim() || oembed?.title;
	const query = [title, oembed?.author_name].filter(Boolean).join(" ");
	if (!query) throw new TranscriptError("not_found", "Spotify did not return enough metadata to find an RSS feed.");
	const entity = parsed.kind === "spotify-show" ? "podcast" : "podcastEpisode";
	const search = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&limit=8`, {
		timeoutMs: 15e3,
		userAgent: PODCAST_UA
	});
	const feedUrl = (search.results ?? []).find((r) => r.feedUrl && (!title || scoreTitle(r.trackName ?? r.collectionName ?? "", title) > .45))?.feedUrl ?? search.results?.find((r) => r.feedUrl)?.feedUrl;
	if (!feedUrl) throw new TranscriptError("not_found", "Could not map that Spotify link to an RSS feed.");
	return fetchRss(feedUrl);
}
async function fetchRss(feedUrl) {
	const xml = await fetchText(feedUrl, {
		timeoutMs: 2e4,
		userAgent: PODCAST_UA,
		accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8",
		maxBytes: 6291456
	});
	let parsed;
	try {
		parsed = xmlParser.parse(xml);
	} catch {
		throw new TranscriptError("unknown", "The RSS feed was not valid XML.");
	}
	const rec = parsed;
	const channel = rec.rss?.channel ?? rec.channel ?? rec.feed;
	if (!channel) throw new TranscriptError("unsupported", "That URL is not an RSS or Atom feed.");
	return {
		title: textOf(channel.title) || "Podcast",
		author: textOf(channel["itunes:author"]) || textOf(channel.author) || textOf(channel["itunes:owner"]),
		feedUrl,
		items: asArray(channel.item ?? channel.entry).slice(0, MATCH_SCAN_CAP).map(parseRssItem).filter((i) => i.title)
	};
}
function parseRssItem(raw) {
	const r = raw ?? {};
	const enclosure = first(r.enclosure);
	const enclosureRec = enclosure && typeof enclosure === "object" ? enclosure : {};
	const duration = textOf(r["itunes:duration"]) || textOf(r.duration);
	const guid = textOf(r.guid) || textOf(r.id);
	const link = hrefOf(r.link) || textOf(r.link);
	const transcripts = collectTranscripts(r);
	return {
		title: stripHtml(textOf(r.title) || "Untitled episode"),
		guid: guid || void 0,
		link: link || void 0,
		durationMs: parseClockToMs(duration),
		publishedAt: textOf(r.pubDate) || textOf(r.published) || textOf(r.updated) || void 0,
		author: textOf(r["itunes:author"]) || textOf(r.author) || void 0,
		enclosureUrl: stringAttr(enclosureRec, "@_url") || textOf(enclosureRec.url) || void 0,
		enclosureBytes: Number(stringAttr(enclosureRec, "@_length") || 0) || void 0,
		transcriptUrls: transcripts,
		appleEpisodeId: extractAppleEpisodeId(r, link)
	};
}
function collectTranscripts(r) {
	const out = [];
	const nodes = [
		...asArray(r["podcast:transcript"]),
		...asArray(r.transcript),
		...asArray(r["podcast:transcripts"])
	];
	for (const node of nodes) {
		if (typeof node === "string" && /^https?:/i.test(node)) {
			out.push({ url: node });
			continue;
		}
		if (node && typeof node === "object") {
			const rec = node;
			const url = stringAttr(rec, "@_url") || textOf(rec.url) || textOf(rec);
			const type = stringAttr(rec, "@_type") || textOf(rec.type) || void 0;
			if (url && /^https?:/i.test(url)) out.push({
				url,
				type
			});
		}
	}
	return out;
}
function extractAppleEpisodeId(r, link) {
	const fromLink = (link ?? "").match(/[?&]i=(\d+)/);
	if (fromLink) return fromLink[1];
	for (const key of Object.keys(r)) if (/apple/i.test(key)) {
		const m = textOf(r[key]).match(/id(\d{8,})|[?&]i=(\d{8,})/);
		if (m) return m[1] || m[2];
	}
}
function matchItem(items, hint) {
	if (hint.guid) {
		const guidHit = items.find((i) => i.guid && normalize(i.guid) === normalize(hint.guid));
		if (guidHit) return guidHit;
	}
	if (hint.appleEpisodeId) {
		const appleHit = items.find((i) => i.appleEpisodeId === hint.appleEpisodeId || i.link?.includes(hint.appleEpisodeId));
		if (appleHit) return appleHit;
	}
	if (hint.url) {
		const urlHit = items.find((i) => i.link && urlsLooselyEqual(i.link, hint.url));
		if (urlHit) return urlHit;
	}
	if (hint.titleHint) {
		const ranked = items.map((i) => ({
			i,
			score: scoreTitle(i.title, hint.titleHint)
		})).sort((a, b) => b.score - a.score);
		if (ranked[0] && ranked[0].score >= .62) return ranked[0].i;
	}
}
async function transcriptForItem(feed, item, sourceUrl) {
	const canonicalUrl = item.link || sourceUrl;
	const published = await loadPublishedTranscript(item);
	if (published && !isThin(published, item.durationMs)) return finishTranscript({
		title: item.title,
		author: item.author ?? feed.author,
		durationMs: item.durationMs,
		source: "podcast",
		sourceUrl,
		canonicalUrl,
		cues: published
	});
	try {
		const yt = await searchYoutubeForEpisode(item.title, item.author ?? feed.author, item.durationMs);
		if (yt && isGoodEpisodeMatch(item.title, yt.title, item.durationMs, yt.durationMs)) return {
			...yt,
			title: item.title || yt.title,
			author: item.author ?? feed.author ?? yt.author,
			sourceUrl,
			canonicalUrl
		};
	} catch {}
	if (published && published.length) return finishTranscript({
		title: item.title,
		author: item.author ?? feed.author,
		durationMs: item.durationMs,
		source: "file",
		sourceUrl,
		canonicalUrl,
		cues: published
	});
	if (!item.enclosureUrl) throw new TranscriptError("no_audio", "No published transcript, YouTube captions, or audio enclosure for this episode.");
	return transcribeEnclosure({
		enclosureUrl: item.enclosureUrl,
		title: item.title,
		author: item.author ?? feed.author,
		sourceUrl,
		canonicalUrl,
		durationMs: item.durationMs
	});
}
async function loadPublishedTranscript(item) {
	const urls = [...item.transcriptUrls];
	if (item.link) try {
		const extra = await scrapeEpisodePageForTranscript(item.link);
		urls.push(...extra);
	} catch {}
	for (const t of urls.slice(0, 4)) try {
		const cues = parseCaptionBytes(await fetchBuffer(t.url, {
			timeoutMs: 2e4,
			maxBytes: 4194304,
			userAgent: PODCAST_UA
		}), t.type ?? t.url);
		if (cues.length) return cues;
	} catch {
		continue;
	}
	return null;
}
async function scrapeEpisodePageForTranscript(pageUrl) {
	const html = await fetchText(pageUrl, {
		timeoutMs: 12e3,
		maxBytes: 15e5,
		userAgent: PODCAST_UA
	});
	const out = [];
	const re = /href=["']([^"']+\.(?:srt|vtt|json|ttml))["']/gi;
	let m;
	while (m = re.exec(html)) try {
		const abs = new URL(m[1], pageUrl).toString();
		out.push({
			url: abs,
			type: m[1]
		});
	} catch {}
	return out;
}
function collectionFromFeed(feed, parsed) {
	const source = parsed.kind.startsWith("apple") ? "apple" : parsed.kind.startsWith("spotify") ? "spotify" : parsed.kind === "youtube-playlist" ? "youtube" : "rss";
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
			author: item.author ?? feed.author
		}))
	};
}
function finishTranscript(partial) {
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
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function isThin(cues, durationMs) {
	const words = countWords(flattenCues(cues));
	if (words < THIN_WORD_THRESHOLD) return true;
	if (durationMs && durationMs > 6e5 && words < 80) return true;
	return false;
}
function looksLikeShowOnly(input, feed) {
	if (input.guid) return false;
	if (parseSourceUrl(input.url).kind === "rss") return !feed.items.some((i) => i.link && urlsLooselyEqual(i.link, input.url));
	return true;
}
function titleHintFromSource(parsed, input) {
	if (parsed.kind === "spotify-episode" || parsed.kind === "apple-episode") return void 0;
	try {
		return new URL(input.url).pathname.split("/").filter(Boolean).at(-1)?.replace(/[-_]/g, " ");
	} catch {
		return;
	}
}
function asArray(v) {
	if (v == null) return [];
	return Array.isArray(v) ? v : [v];
}
function first(v) {
	return asArray(v)[0];
}
function textOf(v) {
	if (v == null) return "";
	if (typeof v === "string" || typeof v === "number") return String(v).trim();
	if (typeof v === "object") {
		const rec = v;
		if (typeof rec["#text"] === "string") return rec["#text"].trim();
		if (typeof rec._ === "string") return rec._.trim();
		if (typeof rec.name === "string") return rec.name.trim();
	}
	return "";
}
function hrefOf(v) {
	if (!v) return "";
	if (typeof v === "string") return v;
	const arr = asArray(v);
	for (const item of arr) {
		if (typeof item === "string" && /^https?:/i.test(item)) return item;
		if (item && typeof item === "object") {
			const rec = item;
			const href = stringAttr(rec, "@_href") || stringAttr(rec, "@_url");
			const rel = stringAttr(rec, "@_rel");
			if (href && (!rel || rel === "alternate" || rel === "self")) return href;
			if (href) return href;
		}
	}
	return "";
}
function stringAttr(rec, key) {
	const v = rec[key];
	return typeof v === "string" ? v : "";
}
function normalize(s) {
	return s.trim().toLowerCase();
}
function urlsLooselyEqual(a, b) {
	try {
		const ua = new URL(a);
		const ub = new URL(b);
		return ua.hostname.replace(/^www\./, "") === ub.hostname.replace(/^www\./, "") && ua.pathname.replace(/\/$/, "") === ub.pathname.replace(/\/$/, "");
	} catch {
		return normalize(a) === normalize(b);
	}
}
var OVERALL_TIMEOUT_MS = 12e4;
async function resolveTranscript(input) {
	try {
		return await withTimeout(resolveTranscriptInner(input), OVERALL_TIMEOUT_MS);
	} catch (err) {
		return toErrorResult(err);
	}
}
async function resolveTranscriptInner(input) {
	const url = input.url?.trim();
	if (!url) return errorResult("invalid_url", "A URL is required.");
	if (input.feedUrl && (input.guid || url)) return resolvePodcast({
		url,
		feedUrl: input.feedUrl,
		guid: input.guid
	});
	const parsed = parseSourceUrl(url);
	switch (parsed.kind) {
		case "youtube-video":
		case "youtube-playlist": return resolveYoutube(parsed);
		case "apple-episode":
		case "apple-show":
		case "spotify-episode":
		case "spotify-show":
		case "rss": return resolvePodcast({
			url,
			feedUrl: input.feedUrl,
			guid: input.guid
		}, parsed);
		default:
			if (!/^https?:\/\//i.test(ensureScheme(url))) return errorResult("invalid_url", "That does not look like a URL.");
			try {
				return await resolvePodcast({ url }, parsed);
			} catch (err) {
				if (err instanceof TranscriptError && (err.code === "unsupported" || err.code === "invalid_url")) return errorResult("invalid_url", "Paste a YouTube, Apple Podcasts, Spotify, or RSS link.");
				throw err;
			}
	}
}
function ensureScheme(raw) {
	return /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
}
function withTimeout(promise, ms) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new TranscriptError("timeout", "The transcript request timed out."));
		}, ms);
		promise.then((value) => {
			clearTimeout(timer);
			resolve(value);
		}, (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}
//#endregion
export { resolveTranscript, errorResult as t };
