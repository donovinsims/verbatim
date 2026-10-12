import type { ReactNode } from "react";
import { Toaster } from "sonner";

/**
 * App-wide client provider mounted once near the top of `<body>`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        theme="system"
        position="bottom-center"
        toastOptions={{
          className:
            "!bg-bg-elevated !text-fg !border-border !shadow-[var(--shadow-border)] !rounded-[10px] !text-[14px]",
        }}
      />
    </>
  );
}
