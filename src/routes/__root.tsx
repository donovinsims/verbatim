import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Verbatim";
const CRITICAL_CSS =
  "html,body,#app{background:#fafafa;color:#262626;margin:0}html{color-scheme:light}@media(prefers-color-scheme:dark){html:not(.light),html.dark,html.dark body,html.dark #app{background:#111;color:#f5f5f5}html:not(.light){color-scheme:dark}}html.dark,html.dark body,html.dark #app{background:#111;color:#f5f5f5}html.dark{color-scheme:dark}";

const THEME_BOOT =
  '(function(){try{var t=localStorage.getItem("verbatim.theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme:dark)").matches;document.documentElement.classList.toggle("dark",d);document.documentElement.classList.toggle("light",!d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { title: APP_NAME },
      {
        name: "description",
        content: "Full transcripts from YouTube videos and podcast episodes. Export as TXT, SRT, VTT, Markdown, or JSON.",
      },
      { name: "theme-color", content: "#FAFAFA", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#111111", media: "(prefers-color-scheme: dark)" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      {
        rel: "preload",
        href: "/fonts/cal-sans-ui.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/cal-sans-text.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
    styles: [{ children: CRITICAL_CSS }],
    scripts: [{ children: THEME_BOOT }],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
