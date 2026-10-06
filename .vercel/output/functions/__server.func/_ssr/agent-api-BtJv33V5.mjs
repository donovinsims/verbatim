import { t as parseAgentBody } from "./input-D3yo7et-.mjs";
import { resolveTranscript, t as errorResult } from "./resolve-CVIb02Tu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/agent-api-BtJv33V5.js
var buckets = /* @__PURE__ */ new Map();
var WINDOW_MS = 6e4;
var MAX_PER_WINDOW = 20;
function checkRateLimit(key, limit = MAX_PER_WINDOW, windowMs = WINDOW_MS) {
	const now = Date.now();
	prune(now);
	const current = buckets.get(key);
	if (!current || now >= current.resetAt) {
		buckets.set(key, {
			count: 1,
			resetAt: now + windowMs
		});
		return { ok: true };
	}
	if (current.count >= limit) return {
		ok: false,
		retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1e3))
	};
	current.count += 1;
	return { ok: true };
}
function prune(now) {
	if (buckets.size < 500) return;
	for (const [key, bucket] of buckets) if (now >= bucket.resetAt) buckets.delete(key);
}
function clientKeyFromRequest(request) {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0]?.trim() || "anon";
	const real = request.headers.get("x-real-ip");
	if (real) return real.trim();
	return "anon";
}
var ALLOWED_TELEGRAM = /(^|\.)telegram\.org$/i;
async function handleTranscribeRequest(request) {
	const cors = corsHeaders(request);
	if (request.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: cors
	});
	if (request.method === "GET") return json({
		name: "verbatim.transcribe",
		method: "POST",
		body: {
			url: "string",
			urls: "string[] (max 20)",
			feedUrl: "string?",
			guid: "string?",
			stream: "boolean?"
		},
		result: "transcript | collection | error | { kind: 'batch', results }"
	}, 200, cors);
	if (request.method !== "POST") return json(errorResult("unsupported", "Use POST."), 405, cors);
	const limited = checkRateLimit(clientKeyFromRequest(request));
	if (!limited.ok) return json(errorResult("rate_limited", `Try again in ${limited.retryAfterSec}s.`), 429, {
		...cors,
		"Retry-After": String(limited.retryAfterSec)
	});
	let body;
	try {
		body = await request.json();
	} catch {
		return json(errorResult("invalid_url", "Body must be JSON with url or urls."), 400, cors);
	}
	let parsed;
	try {
		parsed = parseAgentBody(body);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Invalid request body.";
		return json(errorResult("invalid_url", message), 400, cors);
	}
	const jobs = inputsFromBody(parsed);
	if (!jobs.length) return json(errorResult("invalid_url", "Provide url or urls."), 400, cors);
	if (parsed.stream || request.headers.get("accept")?.includes("text/event-stream")) return sseResponse(jobs, cors);
	if (jobs.length === 1) {
		const result = await resolveTranscript(jobs[0]);
		return json(result, statusFor(result), cors);
	}
	return json({
		kind: "batch",
		results: await mapPool(jobs, 2, (job) => resolveTranscript(job))
	}, 200, cors);
}
function inputsFromBody(body) {
	if (body.urls?.length) return body.urls.slice(0, 20).map((url) => ({ url }));
	if (body.url) return [{
		url: body.url,
		feedUrl: body.feedUrl,
		guid: body.guid
	}];
	return [];
}
function sseResponse(jobs, cors) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({ async start(controller) {
		const send = (event, data) => {
			controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
		};
		try {
			for (let i = 0; i < jobs.length; i++) {
				send("progress", {
					index: i,
					total: jobs.length,
					url: jobs[i]?.url
				});
				const result = await resolveTranscript(jobs[i]);
				send("result", {
					index: i,
					result
				});
			}
			send("done", { total: jobs.length });
		} catch (err) {
			send("error", toErrorResultSafe(err));
		} finally {
			controller.close();
		}
	} });
	return new Response(stream, {
		status: 200,
		headers: {
			...cors,
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache"
		}
	});
}
function toErrorResultSafe(err) {
	const message = err instanceof Error ? err.message : "Stream failed.";
	return errorResult("unknown", message);
}
function corsHeaders(request) {
	const origin = request.headers.get("origin");
	const allow = isAllowedOrigin(origin, request);
	const headers = {
		Vary: "Origin",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
		"Access-Control-Max-Age": "600"
	};
	if (allow && origin) headers["Access-Control-Allow-Origin"] = origin;
	return headers;
}
function isAllowedOrigin(origin, request) {
	if (!origin) return true;
	try {
		const host = new URL(origin).hostname;
		if (host === "localhost" || host === "127.0.0.1") return true;
		if (ALLOWED_TELEGRAM.test(host)) return true;
		if (host === new URL(request.url).hostname) return true;
		return false;
	} catch {
		return false;
	}
}
function json(body, status, cors) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...cors,
			"Content-Type": "application/json; charset=utf-8"
		}
	});
}
function statusFor(result) {
	if (result.kind !== "error") return 200;
	switch (result.code) {
		case "invalid_url": return 400;
		case "not_found": return 404;
		case "blocked": return 403;
		case "rate_limited": return 429;
		case "timeout": return 504;
		case "too_large": return 413;
		default: return 422;
	}
}
async function mapPool(items, size, fn) {
	const results = new Array(items.length);
	let next = 0;
	async function worker() {
		for (;;) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await fn(items[i]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
	return results;
}
//#endregion
export { handleTranscribeRequest };
