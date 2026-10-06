import { z } from "zod";
import type { TranscriptInput } from "./types";

export const transcriptInputSchema = z.object({
  url: z.string().trim().min(1, "url is required"),
  feedUrl: z.string().trim().min(1).optional(),
  guid: z.string().trim().min(1).optional(),
});

export const agentBodySchema = z
  .object({
    url: z.string().trim().min(1).optional(),
    urls: z.array(z.string().trim().min(1)).max(20).optional(),
    feedUrl: z.string().trim().min(1).optional(),
    guid: z.string().trim().min(1).optional(),
    stream: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.url || (v.urls && v.urls.length > 0)), {
    message: "Provide url or urls",
  });

export type AgentBody = z.infer<typeof agentBodySchema>;

export function parseInput(data: unknown): TranscriptInput {
  return transcriptInputSchema.parse(data);
}

export function parseAgentBody(data: unknown): AgentBody {
  return agentBodySchema.parse(data);
}
