import { i as __toESM } from "../_runtime.mjs";
import { n as parseInput } from "./input-D3yo7et-.mjs";
import { a as formatSrtTime, i as formatClock, o as formatVttTime, t as canonicalJobKey, u as splitInputUrls } from "./time-DzjAGbLE.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Play, c as History, d as ChevronDown, f as Check, i as Search, l as Download, o as Pause, r as Trash2, s as LoaderCircle, t as X, u as ClipboardCopy } from "../_libs/lucide-react.mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as require_lib } from "../_libs/jszip+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/queue-BY1sz_eb.js
var HISTORY_KEY = "verbatim.history.v2";
function splitAndCapUrls(text, cap = 20) {
	const all = splitInputUrls(text);
	if (all.length <= cap) return {
		urls: all,
		truncated: false,
		dropped: 0
	};
	return {
		urls: all.slice(0, cap),
		truncated: true,
		dropped: all.length - cap
	};
}
function dedupeJobs(existing, incoming) {
	const keys = new Set(existing.map((j) => canonicalJobKey(j)));
	const out = [];
	for (const job of incoming) {
		const key = canonicalJobKey(job);
		if (keys.has(key)) continue;
		keys.add(key);
		out.push(job);
	}
	return out;
}
function historyFromTranscript(t, pastedUrl) {
	return {
		title: t.title,
		author: t.author,
		wordCount: t.wordCount,
		url: pastedUrl,
		canonicalUrl: t.canonicalUrl,
		savedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function loadHistory(storage) {
	if (!storage) return [];
	try {
		const raw = storage.getItem(HISTORY_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isHistoryItem).slice(0, 12);
	} catch {
		return [];
	}
}
function saveHistory(items, storage) {
	const next = compactHistory(items).slice(0, 12);
	if (storage) try {
		storage.setItem(HISTORY_KEY, JSON.stringify(next));
	} catch {}
	return next;
}
function pushHistory(items, incoming, storage) {
	return saveHistory([incoming, ...items.filter((h) => h.canonicalUrl.toLowerCase() !== incoming.canonicalUrl.toLowerCase())], storage);
}
function compactHistory(items) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const item of items) {
		const key = item.canonicalUrl.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			title: item.title.slice(0, 180),
			author: item.author?.slice(0, 80),
			wordCount: item.wordCount,
			url: item.url,
			canonicalUrl: item.canonicalUrl,
			savedAt: item.savedAt
		});
	}
	return out;
}
function isHistoryItem(v) {
	if (!v || typeof v !== "object") return false;
	const r = v;
	return typeof r.title === "string" && typeof r.url === "string" && typeof r.canonicalUrl === "string";
}
function newJobId() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function concurrencyFor(mode) {
	return mode === "bulk" ? 2 : 1;
}
//#endregion
//#region node_modules/.nitro/vite/services/ssr/assets/routes-B9pJE6d5.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var import_lib = /* @__PURE__ */ __toESM(require_lib());
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function Badge({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-full bg-fg/8 px-2.5 py-0.5 text-xs font-medium text-muted", className),
		...props
	});
}
function Button({ className, variant = "primary", size = "md", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		className: cn("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70", "disabled:cursor-not-allowed disabled:opacity-40", size === "sm" ? "min-h-10 px-3 text-sm" : "min-h-11 px-4 text-sm", variant === "primary" && "bg-fg text-ink hover:bg-fg/90", variant === "ghost" && "bg-transparent text-fg/80 hover:bg-fg/10 hover:text-fg", variant === "paper" && "bg-ink text-paper hover:bg-ink/90", variant === "danger" && "bg-transparent text-danger hover:bg-danger/10", variant === "chip" && "rounded-full bg-fg/8 text-fg/80 hover:bg-fg/12 hover:text-fg", className),
		...props
	});
}
function Dropdown({ label, children, align = "right" }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const ref = (0, import_react.useRef)(null);
	const id = (0, import_react.useId)();
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onDoc = (e) => {
			if (!ref.current?.contains(e.target)) setOpen(false);
		};
		const onKey = (e) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDoc);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDoc);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative",
		ref,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-fg/80 hover:bg-fg/8 hover:text-fg",
			"aria-haspopup": "menu",
			"aria-expanded": open,
			"aria-controls": id,
			onClick: () => setOpen((v) => !v),
			children: label
		}), open ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			id,
			role: "menu",
			className: cn("absolute z-30 mt-1 min-w-56 rounded-xl bg-ink-2 p-1 shadow-menu", align === "right" ? "right-0" : "left-0"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				onClick: () => setOpen(false),
				children
			})
		}) : null]
	});
}
function DropdownItem({ children, onSelect, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		role: "menuitem",
		disabled,
		onClick: onSelect,
		className: "flex min-h-10 w-full items-start rounded-lg px-3 py-2 text-left text-sm text-fg/90 hover:bg-fg/8 disabled:opacity-40",
		children
	});
}
function Input({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: cn("min-h-11 w-full rounded-lg bg-fg/6 px-3 text-sm text-fg", "placeholder:text-muted ring-0 outline-none", "focus-visible:ring-2 focus-visible:ring-accent/70", className),
		...props
	});
}
function TextArea({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
		className: cn("w-full rounded-lg bg-fg/6 px-3 py-3 text-sm text-fg leading-relaxed", "placeholder:text-muted ring-0 outline-none resize-y min-h-24", "focus-visible:ring-2 focus-visible:ring-accent/70", className),
		...props
	});
}
function Scroll({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("overflow-y-auto overscroll-contain", className),
		...props
	});
}
function SwipeRow({ children, onDismiss, disabled, label = "Remove" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-stretch gap-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "min-w-0 flex-1",
			children
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			type: "button",
			variant: "ghost",
			size: "sm",
			className: "min-h-11 min-w-11 shrink-0 px-0",
			disabled,
			onClick: onDismiss,
			"aria-label": label,
			title: disabled ? "A running job cannot be removed" : label,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
		})]
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var fetchTranscriptFn = createServerFn({ method: "POST" }).validator(parseInput).handler(createSsrRpc("5a5e81b3ea3b7b8c63e14d667488a7c8a79256f3ad918bf6c7a6c1490955ae7a"));
function serializeTranscript(transcript, format, options = {}) {
	switch (format) {
		case "txt": return toTxt(transcript, options);
		case "md": return toMarkdown(transcript, options);
		case "srt": return toSrt(transcript.cues);
		case "vtt": return toVtt(transcript.cues, transcript.title);
		case "json": return toJson(transcript);
		default: return toTxt(transcript, options);
	}
}
function toTxt(transcript, options = {}) {
	return `${[
		transcript.title,
		transcript.author,
		transcript.canonicalUrl
	].filter(Boolean).join("\n")}\n\n${options.timestamps ? transcript.cues.map((c) => `[${formatClock(c.startMs)}] ${speakerPrefix(c)}${c.text}`).join("\n") : transcript.text}\n`;
}
function toMarkdown(transcript, options = {}) {
	const lines = [
		`# ${transcript.title}`,
		"",
		transcript.author ? `*${transcript.author}*` : "",
		transcript.canonicalUrl ? `[Source](${transcript.canonicalUrl})` : "",
		transcript.wordCount ? `${transcript.wordCount} words` : "",
		""
	].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
	const body = transcript.cues.map((c) => {
		const who = c.speaker ? `**${c.speaker}:** ` : "";
		if (options.timestamps) return `- \`${formatClock(c.startMs)}\` ${who}${c.text}`;
		return `- ${who}${c.text}`;
	});
	return `${lines.join("\n")}\n${body.join("\n")}\n`;
}
function toSrt(cues) {
	return cues.map((c, i) => {
		return `${i + 1}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${speakerPrefix(c)}${c.text}\n`;
	}).join("\n");
}
function toVtt(cues, title) {
	return (title ? `WEBVTT - ${title}\n\n` : "WEBVTT\n\n") + cues.map((c) => {
		const who = c.speaker ? `<v ${c.speaker}>` : "";
		return `${formatVttTime(c.startMs)} --> ${formatVttTime(c.endMs)}\n${who}${c.text}\n`;
	}).join("\n");
}
function toJson(transcript) {
	return `${JSON.stringify(transcript, null, 2)}\n`;
}
function extensionFor(format) {
	return format;
}
function mimeFor(format) {
	switch (format) {
		case "txt": return "text/plain;charset=utf-8";
		case "md": return "text/markdown;charset=utf-8";
		case "srt": return "application/x-subrip;charset=utf-8";
		case "vtt": return "text/vtt;charset=utf-8";
		case "json": return "application/json;charset=utf-8";
	}
}
function safeFilename(title, format) {
	return `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "transcript"}.${extensionFor(format)}`;
}
function speakerPrefix(c) {
	return c.speaker ? `${c.speaker}: ` : "";
}
function downloadText(filename, contents, mime) {
	downloadBlob(filename, new Blob([contents], { type: mime }));
}
function downloadBlob(filename, blob) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.rel = "noopener";
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function exportTranscript(transcript, format, options = {}) {
	downloadText(safeFilename(transcript.title, format), serializeTranscript(transcript, format, options), mimeFor(format));
}
async function exportTranscriptsZip(transcripts, format, options = {}) {
	const zip = new import_lib.default();
	const used = /* @__PURE__ */ new Set();
	for (const t of transcripts) {
		let name = safeFilename(t.title, format);
		if (used.has(name.toLowerCase())) {
			const stamp = t.canonicalUrl.replace(/[^a-z0-9]+/gi, "").slice(-8);
			name = safeFilename(`${t.title}-${stamp}`, format);
		}
		used.add(name.toLowerCase());
		zip.file(name, serializeTranscript(t, format, options));
	}
	const blob = await zip.generateAsync({ type: "blob" });
	downloadBlob(`verbatim-${transcripts.length}.${format}.zip`, blob);
}
async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const el = document.createElement("textarea");
			el.value = text;
			el.setAttribute("readonly", "true");
			el.style.position = "fixed";
			el.style.left = "-9999px";
			document.body.appendChild(el);
			el.select();
			const ok = document.execCommand("copy");
			el.remove();
			return ok;
		} catch {
			return false;
		}
	}
}
var SAMPLE_LINKS = [
	{
		id: "zoo",
		label: "Me at the Zoo",
		hint: "YouTube",
		url: "https://www.youtube.com/watch?v=jNQXAC9IVRw"
	},
	{
		id: "apple-dnd",
		label: "Darknet Diaries · Apple",
		hint: "Carna Botnet",
		url: "https://podcasts.apple.com/us/podcast/carna-botnet/id1296350485?i=1000402428920"
	},
	{
		id: "spotify-dnd",
		label: "Darknet Diaries · Spotify",
		hint: "Carna Botnet",
		url: "https://open.spotify.com/episode/52s3YMuCACqHmFb0EufNgw"
	}
];
/** Module-level set so React Strict Mode remounts cannot double-start the same job. */
var inFlightJobs = /* @__PURE__ */ new Set();
function VerbatimApp() {
	const [draft, setDraft] = (0, import_react.useState)("");
	const [mode, setMode] = (0, import_react.useState)("single");
	const [jobs, setJobs] = (0, import_react.useState)([]);
	const [selectedId, setSelectedId] = (0, import_react.useState)(null);
	const [search, setSearch] = (0, import_react.useState)("");
	const [showTimestamps, setShowTimestamps] = (0, import_react.useState)(true);
	const [paused, setPaused] = (0, import_react.useState)(false);
	const [history, setHistory] = (0, import_react.useState)([]);
	const [copied, setCopied] = (0, import_react.useState)(false);
	const [notice, setNotice] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		setHistory(loadHistory(typeof window === "undefined" ? null : window.localStorage));
	}, []);
	const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0] ?? null;
	const enqueue = (0, import_react.useCallback)((entries) => {
		setJobs((current) => {
			const unique = dedupeJobs(current, entries.map((e) => ({
				id: newJobId(),
				url: e.url,
				feedUrl: e.feedUrl,
				guid: e.guid,
				label: e.label || shortLabel(e.url),
				status: "queued"
			})));
			if (!unique.length) {
				setNotice("That URL is already in the queue.");
				return current;
			}
			const room = 20 - current.filter((j) => j.status === "queued" || j.status === "running").length;
			const capped = unique.slice(0, Math.max(0, mode === "bulk" ? Math.min(room, 20) : unique.length));
			if (capped.length < unique.length) setNotice(`Bulk is capped at 20 jobs.`);
			const next = [...current, ...capped];
			if (!selectedId && capped[0]) setSelectedId(capped[0].id);
			else if (capped[0] && current.length === 0) setSelectedId(capped[0].id);
			return next;
		});
	}, [mode, selectedId]);
	function submitDraft() {
		const { urls, truncated } = splitAndCapUrls(draft, mode === "bulk" ? 20 : 1);
		if (!urls.length) {
			setNotice("Paste a YouTube, Apple Podcasts, Spotify, or RSS link.");
			return;
		}
		if (mode === "single") enqueue([{ url: urls[0] }]);
		else enqueue(urls.map((url) => ({ url })));
		if (truncated) setNotice(`Only the first 20 URLs were queued.`);
		setDraft("");
	}
	(0, import_react.useEffect)(() => {
		if (paused) return;
		const slots = concurrencyFor(mode) - jobs.filter((j) => j.status === "running").length;
		if (slots <= 0) return;
		const queued = jobs.filter((j) => j.status === "queued").slice(0, slots);
		if (!queued.length) return;
		for (const job of queued) {
			if (inFlightJobs.has(job.id)) continue;
			inFlightJobs.add(job.id);
			setJobs((curr) => curr.map((j) => j.id === job.id ? {
				...j,
				status: "running"
			} : j));
			runJob(job);
		}
		async function runJob(job) {
			try {
				const result = await fetchTranscriptFn({ data: {
					url: job.url,
					feedUrl: job.feedUrl,
					guid: job.guid
				} });
				setJobs((curr) => curr.map((j) => {
					if (j.id !== job.id) return j;
					if (result.kind === "transcript") return {
						...j,
						status: "done",
						transcript: result,
						error: void 0,
						hint: void 0
					};
					if (result.kind === "collection") return {
						...j,
						status: "collection",
						collection: result,
						label: result.title || j.label
					};
					return {
						...j,
						status: "error",
						error: result.message,
						hint: result.hint,
						errorCode: result.code
					};
				}));
				if (result.kind === "transcript") setHistory((h) => pushHistory(h, historyFromTranscript(result, job.url), window.localStorage));
				setSelectedId((id) => id ?? job.id);
			} catch (err) {
				const message = err instanceof Error ? err.message : "Transcript fetch failed.";
				setJobs((curr) => curr.map((j) => j.id === job.id ? {
					...j,
					status: "error",
					error: message
				} : j));
			} finally {
				inFlightJobs.delete(job.id);
			}
		}
	}, [
		jobs,
		mode,
		paused
	]);
	function dismissJob(id) {
		setJobs((curr) => {
			if (curr.find((j) => j.id === id)?.status === "running") return curr;
			const next = curr.filter((j) => j.id !== id);
			if (selectedId === id) setSelectedId(next[0]?.id ?? null);
			return next;
		});
	}
	function pickEpisode(item) {
		enqueue([{
			url: item.url,
			feedUrl: item.feedUrl,
			guid: item.guid,
			label: item.title
		}]);
	}
	const finished = jobs.filter((j) => j.status === "done" && j.transcript);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-dvh flex-col bg-ink text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center justify-between gap-3 border-b border-fg/8 px-4 py-3 md:px-6",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-baseline gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "font-serif text-2xl tracking-tight text-fg",
					children: "Verbatim"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "hidden text-sm text-muted sm:block",
					children: "The full take, not a summary."
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-1",
				children: [finished.length >= 2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: () => void exportTranscriptsZip(finished.map((j) => j.transcript), "txt", { timestamps: showTimestamps }),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }),
						"Zip ",
						finished.length
					]
				}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dropdown, {
					label: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(History, { className: "size-4" }),
						"Recents",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "size-3.5 opacity-60" })
					] }),
					children: history.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "px-3 py-2 text-sm text-muted",
						children: "Nothing saved yet. Finished transcripts stay in this browser."
					}) : history.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownItem, {
						onSelect: () => enqueue([{
							url: item.url,
							label: item.title
						}]),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "flex min-w-0 flex-col",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "truncate",
								children: item.title
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-xs text-muted",
								children: [item.author ? `${item.author} · ` : "", item.wordCount ? `${item.wordCount.toLocaleString()} words` : "re-queue"]
							})]
						})
					}, item.canonicalUrl))
				})]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(280px,360px)_1fr] md:p-6",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "flex flex-col rounded-2xl bg-ink-2 p-4 shadow-card",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-3 flex rounded-lg bg-fg/6 p-1",
						children: ["single", "bulk"].map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setMode(m),
							className: `min-h-10 flex-1 rounded-md text-sm capitalize ${mode === m ? "bg-ink text-fg" : "text-muted hover:text-fg"}`,
							children: m
						}, m))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: "mb-1 text-xs uppercase tracking-wide text-muted",
						htmlFor: "verbatim-url",
						children: mode === "bulk" ? "URLs (one per line, max 20)" : "URL"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextArea, {
						id: "verbatim-url",
						value: draft,
						rows: mode === "bulk" ? 6 : 3,
						placeholder: mode === "bulk" ? "https://youtube.com/watch?v=...\nhttps://podcasts.apple.com/..." : "Paste a YouTube, Apple Podcasts, Spotify, or RSS link",
						onChange: (e) => setDraft(e.target.value),
						onKeyDown: (e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								submitDraft();
							}
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex flex-wrap gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "button",
								onClick: submitDraft,
								className: "flex-1",
								children: "Transcribe"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								type: "button",
								variant: "ghost",
								onClick: () => setPaused((p) => !p),
								"aria-pressed": paused,
								children: [paused ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-4" }), paused ? "Resume" : "Pause"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "ghost",
								onClick: () => {
									setJobs((curr) => curr.filter((j) => j.status === "running"));
								},
								"aria-label": "Clear finished jobs",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" })
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-3 flex flex-wrap gap-2",
						children: SAMPLE_LINKS.map((sample) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "chip",
							size: "sm",
							onClick: () => {
								setDraft(sample.url);
								enqueue([{
									url: sample.url,
									label: sample.label
								}]);
							},
							children: sample.label
						}, sample.id))
					}),
					notice ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-sm text-accent",
						children: notice
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "mt-5 text-xs uppercase tracking-wide text-muted",
						children: "Queue"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scroll, {
						className: "mt-2 max-h-[42vh] md:max-h-[calc(100dvh-24rem)]",
						children: jobs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "px-1 py-3 text-sm text-muted",
							children: "Jobs land here. One at a time in Single, two at a time in Bulk."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "flex flex-col gap-1",
							children: jobs.map((job) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SwipeRow, {
								disabled: job.status === "running",
								onDismiss: () => dismissJob(job.id),
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => setSelectedId(job.id),
									className: `flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm ${selected?.id === job.id ? "bg-fg/10 text-fg" : "text-fg/80 hover:bg-fg/6"}`,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusDot, { status: job.status }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "min-w-0 flex-1 truncate",
										children: job.label
									})]
								})
							}) }, job.id))
						})
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "flex min-h-[70vh] flex-col overflow-hidden rounded-2xl bg-paper text-paper-ink shadow-paper md:min-h-[calc(100dvh-7rem)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaperPane, {
					job: selected,
					search,
					onSearch: setSearch,
					showTimestamps,
					onToggleTimestamps: () => setShowTimestamps((v) => !v),
					copied,
					onCopy: async (text) => {
						if (await copyText(text)) {
							setCopied(true);
							window.setTimeout(() => setCopied(false), 1500);
						}
					},
					onPick: pickEpisode
				})
			})]
		})]
	});
}
function PaperPane({ job, search, onSearch, showTimestamps, onToggleTimestamps, copied, onCopy, onPick }) {
	if (!job) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyPane, {});
	if (job.status === "queued" || job.status === "running") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoadingPane, { label: job.label });
	if (job.status === "error") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ErrorPane, {
		message: job.error,
		hint: job.hint
	});
	if (job.status === "collection" && job.collection) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollectionPane, {
		collection: job.collection,
		onPick
	});
	if (job.transcript) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TranscriptPane, {
		transcript: job.transcript,
		search,
		onSearch,
		showTimestamps,
		onToggleTimestamps,
		copied,
		onCopy
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyPane, {});
}
function EmptyPane() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-1 flex-col items-center justify-center px-8 py-16 text-center",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "font-serif text-3xl text-balance text-paper-ink",
			children: "The full take, not a summary."
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 max-w-md text-pretty text-sm text-paper-muted",
			children: "Paste a YouTube or podcast URL. Captions, published transcripts, and speech-to-text as a last resort."
		})]
	});
}
function LoadingPane({ label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-1 flex-col px-6 py-8 md:px-10",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-6 flex items-center gap-2 text-sm text-paper-muted",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }),
				"Fetching ",
				label
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-3",
			"aria-hidden": "true",
			children: Array.from({ length: 8 }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "h-3 rounded-full bg-paper-ink/8",
				style: { width: `${70 + i * 17 % 25}%` }
			}, i))
		})]
	});
}
function ErrorPane({ message, hint }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-1 flex-col items-start justify-center px-8 py-16",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-serif text-2xl text-paper-ink",
				children: "Could not pull a transcript"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 max-w-lg text-pretty text-sm text-paper-ink/80",
				children: message ?? "Unknown error."
			}),
			hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-lg text-pretty text-sm text-paper-muted",
				children: hint
			}) : null
		]
	});
}
function CollectionPane({ collection, onPick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-0 flex-1 flex-col",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "border-b border-paper-ink/10 px-6 py-5 md:px-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs uppercase tracking-wide text-paper-muted",
					children: "Pick an episode"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-1 font-serif text-2xl text-paper-ink",
					children: collection.title
				}),
				collection.author ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-paper-muted",
					children: collection.author
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-paper-muted",
					children: "Show and playlist links do not auto-fetch everything. Each tap starts a new job."
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scroll, {
			className: "flex-1 px-3 py-3 md:px-5",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col",
				children: collection.items.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => onPick(item),
					className: "flex min-h-14 w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left hover:bg-paper-ink/5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "block truncate text-sm text-paper-ink",
							children: item.title
						}), item.publishedAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xs text-paper-muted",
							children: item.publishedAt
						}) : null]
					}), item.durationMs ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "shrink-0 text-xs tabular-nums text-paper-muted",
						children: formatClock(item.durationMs)
					}) : null]
				}) }, `${item.guid ?? item.url}-${i}`))
			})
		})]
	});
}
function TranscriptPane({ transcript, search, onSearch, showTimestamps, onToggleTimestamps, copied, onCopy }) {
	const [expanded, setExpanded] = (0, import_react.useState)(false);
	const q = search.trim().toLowerCase();
	const filtered = (0, import_react.useMemo)(() => {
		if (!q) return transcript.cues;
		return transcript.cues.filter((c) => c.text.toLowerCase().includes(q) || c.speaker?.toLowerCase().includes(q));
	}, [transcript.cues, q]);
	const collapseAt = Math.max(8, Math.ceil(transcript.cues.length * .25));
	const searching = q.length > 0;
	const visible = searching || expanded || transcript.cues.length <= collapseAt ? filtered : filtered.slice(0, collapseAt);
	const copyPayload = serializeTranscript(transcript, "txt", { timestamps: showTimestamps });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-0 flex-1 flex-col",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "border-b border-paper-ink/10 px-5 py-5 md:px-8",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-serif text-2xl text-balance text-paper-ink md:text-3xl",
					children: transcript.title
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex flex-wrap items-center gap-2",
					children: [
						transcript.author ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							className: "bg-paper-ink/8 text-paper-muted",
							children: transcript.author
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							className: "bg-paper-ink/8 text-paper-muted",
							children: sourceLabel(transcript.source)
						}),
						transcript.language ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							className: "bg-paper-ink/8 text-paper-muted",
							children: transcript.language
						}) : null,
						transcript.isAutoGenerated ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							className: "bg-paper-ink/8 text-paper-muted",
							children: "Auto captions"
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, {
							className: "bg-paper-ink/8 text-paper-muted",
							children: [transcript.wordCount.toLocaleString(), " words"]
						}),
						transcript.durationMs ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							className: "bg-paper-ink/8 text-paper-muted",
							children: formatClock(transcript.durationMs)
						}) : null
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-wrap items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "paper",
							size: "sm",
							onClick: () => onCopy(copyPayload),
							children: [copied ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipboardCopy, { className: "size-4" }), copied ? "Copied" : "Copy"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dropdown, {
							align: "left",
							label: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }), "Export"] }),
							children: [
								"txt",
								"md",
								"srt",
								"vtt",
								"json"
							].map((fmt) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownItem, {
								onSelect: () => exportTranscript(transcript, fmt, { timestamps: showTimestamps }),
								children: fmt.toUpperCase()
							}, fmt))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "ghost",
							size: "sm",
							className: "text-paper-ink/70 hover:bg-paper-ink/8 hover:text-paper-ink",
							onClick: onToggleTimestamps,
							children: showTimestamps ? "Hide times" : "Show times"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "relative mt-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-paper-muted" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						value: search,
						onChange: (e) => onSearch(e.target.value),
						placeholder: "Search lines",
						className: "bg-paper-ink/6 pl-10 text-paper-ink placeholder:text-paper-muted focus-visible:ring-paper-ink/30",
						"aria-label": "Search transcript lines"
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Scroll, {
			className: "relative flex-1 px-5 py-5 md:px-8",
			children: [visible.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-paper-muted",
				children: "No lines match that search."
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
				className: "space-y-3",
				children: visible.map((cue, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CueLine, {
					cue,
					query: q,
					showTimestamps
				}, `${cue.startMs}-${i}`))
			}), !searching && !expanded && transcript.cues.length > collapseAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative mt-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pointer-events-none absolute -top-16 left-0 right-0 h-16 bg-gradient-to-t from-paper to-transparent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "paper",
					className: "w-full",
					onClick: () => setExpanded(true),
					children: [
						"See more (",
						transcript.cues.length - collapseAt,
						" lines)"
					]
				})]
			}) : null]
		})]
	});
}
function CueLine({ cue, query, showTimestamps }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: "flex gap-4 text-[15px] leading-relaxed",
		children: [showTimestamps ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "w-12 shrink-0 pt-0.5 text-xs tabular-nums text-paper-muted",
			children: formatClock(cue.startMs)
		}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "min-w-0 text-pretty text-paper-ink",
			children: [cue.speaker ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "font-medium",
				children: [cue.speaker, ": "]
			}) : null, highlight(cue.text, query)]
		})]
	});
}
function highlight(text, query) {
	if (!query) return text;
	const idx = text.toLowerCase().indexOf(query);
	if (idx < 0) return text;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		text.slice(0, idx),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("mark", {
			className: "bg-accent/40 text-paper-ink",
			children: text.slice(idx, idx + query.length)
		}),
		text.slice(idx + query.length)
	] });
}
function StatusDot({ status }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: `size-2 shrink-0 rounded-full ${status === "done" ? "bg-fg" : status === "error" ? "bg-danger" : status === "running" ? "bg-accent animate-pulse" : status === "collection" ? "bg-accent" : "bg-muted"}`,
		"aria-hidden": "true"
	});
}
function shortLabel(url) {
	try {
		const u = new URL(url.startsWith("http") ? url : `https://${url}`);
		const tail = u.pathname.split("/").filter(Boolean).at(-1);
		return tail ? decodeURIComponent(tail).replace(/[-_]/g, " ") : u.hostname.replace(/^www\./, "");
	} catch {
		return url.slice(0, 48);
	}
}
function sourceLabel(source) {
	switch (source) {
		case "youtube": return "YouTube captions";
		case "podcast": return "Published transcript";
		case "rss": return "RSS";
		case "stt": return "Speech-to-text";
		case "file": return "Transcript file";
	}
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VerbatimApp, {});
}
//#endregion
export { Home as component };
