import { createFileRoute } from "@tanstack/react-router";
import { VerbatimApp } from "@/components/verbatim-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <VerbatimApp />;
}
