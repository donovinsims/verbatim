import type { ErrorComponentProps } from "@tanstack/react-router";

const FALLBACK_MESSAGE = "Something got stuck. Close this tab and open Verbatim again.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <h1 className="font-heading text-[20px] font-semibold leading-none tracking-normal">Couldn’t open</h1>
      <p className="max-w-md text-[16px] leading-relaxed break-words text-muted">
        {errorMessage(error)}
      </p>
      <button
        type="button"
        className="mt-4 h-9 min-h-11 rounded-[10px] bg-primary px-[11px] text-[14px] font-medium text-primary-fg"
        onClick={() => window.location.reload()}
      >
        Try again
      </button>
    </main>
  );
}
