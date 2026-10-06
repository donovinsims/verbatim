import { a as object, n as boolean, o as string, t as array } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/input-D3yo7et-.js
var transcriptInputSchema = object({
	url: string().trim().min(1, "url is required"),
	feedUrl: string().trim().min(1).optional(),
	guid: string().trim().min(1).optional()
});
var agentBodySchema = object({
	url: string().trim().min(1).optional(),
	urls: array(string().trim().min(1)).max(20).optional(),
	feedUrl: string().trim().min(1).optional(),
	guid: string().trim().min(1).optional(),
	stream: boolean().optional()
}).refine((v) => Boolean(v.url || v.urls && v.urls.length > 0), { message: "Provide url or urls" });
function parseInput(data) {
	return transcriptInputSchema.parse(data);
}
function parseAgentBody(data) {
	return agentBodySchema.parse(data);
}
//#endregion
export { parseInput as n, parseAgentBody as t };
