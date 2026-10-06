import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleTranscribeRequest } = await import("@/lib/transcript/agent-api");
        return handleTranscribeRequest(request);
      },
      POST: async ({ request }) => {
        const { handleTranscribeRequest } = await import("@/lib/transcript/agent-api");
        return handleTranscribeRequest(request);
      },
      OPTIONS: async ({ request }) => {
        const { handleTranscribeRequest } = await import("@/lib/transcript/agent-api");
        return handleTranscribeRequest(request);
      },
    },
  },
});
