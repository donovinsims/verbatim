import { n as parseInput } from "./input-D3yo7et-.mjs";
import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/transcript.functions-DVYwuGo_.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var fetchTranscriptFn_createServerFn_handler = createServerRpc({
	id: "5a5e81b3ea3b7b8c63e14d667488a7c8a79256f3ad918bf6c7a6c1490955ae7a",
	name: "fetchTranscriptFn",
	filename: "src/lib/transcript.functions.ts"
}, (opts) => fetchTranscriptFn.__executeServer(opts));
var fetchTranscriptFn = createServerFn({ method: "POST" }).validator(parseInput).handler(fetchTranscriptFn_createServerFn_handler, async ({ data }) => {
	const { resolveTranscript } = await import("./resolve-CVIb02Tu.mjs");
	return resolveTranscript(data);
});
//#endregion
export { fetchTranscriptFn_createServerFn_handler };
