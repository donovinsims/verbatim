import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  Search,
  Share,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SwipeRow } from "@/components/swipe-row";
import { AppSheet } from "@/components/app-sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { fetchTranscriptFn } from "@/lib/transcript.functions";
import { downloadTranscript, downloadZip } from "@/lib/transcript/client-export";
import { formatTimestamp } from "@/lib/transcript/formats";
import { splitInputUrls, parseSourceUrl } from "@/lib/transcript/parse-url";
import {
  MAX_BULK,
  FETCH_TIMEOUT_MS,
  compactHistoryEntry,
  loadHistory,
  loadQueue,
  mergeQueue,
  saveHistory,
  saveQueue,
  type HistoryEntry,
} from "@/lib/transcript/queue";
import type { CollectionResult, FetchResponse, TranscriptResult } from "@/lib/transcript/types";
import { cn } from "@/lib/utils";

type JobStatus = "queued" | "running" | "done" | "error" | "collection";

type Job = {
  id: string;
  url: string;
  feedUrl?: string;
  guid?: string;
  label: string;
  status: JobStatus;
  error?: string;
  hint?: string;
  transcript?: TranscriptResult;
  collection?: CollectionResult;
  retries?: number;
  code?: string;
};

const EXAMPLES = [
  {
    label: "YouTube",
    hint: "Me at the Zoo",
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  },
  {
    label: "Apple Podcasts",
    hint: "Darknet Diaries",
    url: "https://podcasts.apple.com/us/podcast/the-courthouse-revisited/id1296350485?i=1000786685956",
  },
  {
    label: "Spotify",
    hint: "Darknet Diaries",
    url: "https://open.spotify.com/episode/77T8QzpcCdhYdZcdudNwuH",
  },
];

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function previewThumb(url: string): string | null {
  const parsed = parseSourceUrl(url);
  if ((parsed.kind === "youtube-video" || parsed.kind === "youtube-playlist") && parsed.videoId) {
    return `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`;
  }
  return null;
}

function jobThumb(job: Job): string | null {
  return job.transcript?.thumbnail || job.collection?.artwork || previewThumb(job.url);
}

function Cover({
  src,
  className,
  alt = "",
}: {
  src: string | null | undefined;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("cover object-cover", className)}
    />
  );
}

function fetchWithTimeout(data: { url: string; feedUrl?: string; guid?: string }): Promise<FetchResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<FetchResponse>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          ok: false,
          code: "network",
          error: "This is taking too long.",
          hint: "The host may be blocking us. Try again in a moment.",
        }),
      FETCH_TIMEOUT_MS,
    );
  });
  return Promise.race([fetchTranscriptFn({ data }), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function ModeSwitch({ bulk, onChange }: { bulk: boolean; onChange: (next: boolean) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  function movePill(animate: boolean) {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    const tab = bar.querySelector<HTMLElement>(`.t-tab[aria-selected="true"]`);
    if (!tab) return;
    if (!animate) pill.style.transition = "none";
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }

  useLayoutEffect(() => {
    movePill(false);
    const onResize = () => movePill(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bulk]);

  return (
    <div ref={barRef} className="t-tabs app-segment" role="tablist" aria-label="Mode">
      <span ref={pillRef} className="t-tabs-pill" aria-hidden />
      <button
        type="button"
        role="tab"
        className="t-tab"
        aria-selected={!bulk}
        onClick={() => onChange(false)}
      >
        Single
      </button>
      <button
        type="button"
        role="tab"
        className="t-tab"
        aria-selected={bulk}
        onClick={() => onChange(true)}
      >
        Bulk
      </button>
    </div>
  );
}

export function VerbatimApp() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [bulk, setBulk] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [showTimes, setShowTimes] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const inflight = useRef<Set<string>>(new Set());
  const cancelled = useRef<Set<string>>(new Set());
  const skipPersist = useRef(true);
  const jobsRef = useRef<Job[]>([]);

  useEffect(() => {
    try {
      setHistory(loadHistory());
      const restored = loadQueue();
      if (restored.length) {
        setJobs(
          restored.map((row) => ({
            ...row,
            status: row.status === "done" || row.status === "error" || row.status === "collection" ? row.status : "queued",
          })),
        );
      }
    } catch {
      /* ignore a corrupt save so the app still opens */
    }
  }, []);

  jobsRef.current = jobs;

  function persistJobs(list: Job[]) {
    saveQueue(
      list.map((job) => ({
        id: job.id,
        url: job.url,
        feedUrl: job.feedUrl,
        guid: job.guid,
        label: job.label,
        status: job.status === "running" ? "queued" : job.status,
        error: job.error,
        hint: job.hint,
        retries: job.retries,
        transcript: job.transcript,
        collection: job.collection,
      })),
    );
  }

  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    persistJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    const flush = () => persistJobs(jobsRef.current);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb", `${kb}px`);
    };
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    apply();
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--kb");
    };
  }, []);

  const active = jobs.find((j) => j.id === activeId) ?? jobs[0] ?? null;
  const doneTranscripts = jobs.filter((j) => j.status === "done" && j.transcript).map((j) => j.transcript!);
  const busy = jobs.some((j) => j.status === "queued" || j.status === "running");

  useEffect(() => {
    setQuery("");
  }, [activeId]);

  useEffect(() => {
    const running = jobs.filter((j) => j.status === "running").length;
    const limit = bulk ? 2 : 1;
    if (running >= limit) return;
    const next = jobs.find((j) => j.status === "queued" && !inflight.current.has(j.id));
    if (!next) return;
    inflight.current.add(next.id);
    setJobs((prev) => prev.map((j) => (j.id === next.id ? { ...j, status: "running" } : j)));
    void (async () => {
      try {
        const result = await fetchWithTimeout({
          url: next.url,
          feedUrl: next.feedUrl,
          guid: next.guid,
        });
        if (cancelled.current.has(next.id)) return;
        if (result.ok && result.kind === "transcript") {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === next.id
                ? { ...j, status: "done", transcript: result.transcript, label: result.transcript.title, error: undefined, hint: undefined }
                : j,
            ),
          );
          setHistory((prev) => {
            const nextHist = [
              compactHistoryEntry(result.transcript),
              ...prev.filter((t) => t.canonicalUrl !== result.transcript.canonicalUrl),
            ];
            return saveHistory(nextHist);
          });
        } else if (result.ok && result.kind === "collection") {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === next.id
                ? { ...j, status: "collection" as const, collection: result.collection, label: result.collection.title }
                : j,
            ),
          );
          if (bulk) toast("Pick episodes from the list — whole shows are not auto-queued.");
        } else if (!result.ok) {
          const retries = next.retries ?? 0;
          if ((result.code === "blocked" || result.code === "network") && retries < 1) {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === next.id ? { ...j, status: "queued" as const, retries: retries + 1 } : j,
              ),
            );
            return;
          }
          setJobs((prev) =>
            prev.map((j) =>
              j.id === next.id
                ? { ...j, status: "error", error: result.error, hint: result.hint, code: result.code }
                : j,
            ),
          );
        }
      } catch (err) {
        if (cancelled.current.has(next.id)) return;
        setJobs((prev) =>
          prev.map((j) =>
            j.id === next.id
              ? { ...j, status: "error", error: err instanceof Error ? err.message : "Request failed", code: "network" }
              : j,
          ),
        );
      } finally {
        inflight.current.delete(next.id);
      }
    })();
  }, [jobs, bulk]);

  function enqueue(urls: { url: string; feedUrl?: string; guid?: string; label?: string }[], replace = !bulk) {
    const created: Job[] = urls.map((u) => ({
      id: uid(),
      url: u.url,
      feedUrl: u.feedUrl,
      guid: u.guid,
      label: u.label || u.url,
      status: "queued" as const,
    }));
    if (created.length === 0) return;
    setJobs((prev) => {
      const result = mergeQueue(replace ? [] : prev, created, { replace: false, max: MAX_BULK });
      queueMicrotask(() => {
        if (result.added === 0 && result.skippedDupes && !result.skippedFull) {
          toast("Already in the queue");
        } else if (result.skippedFull && result.added === 0) {
          toast(`Queue is full (${MAX_BULK}). Clear finished jobs to add more.`);
        } else if (result.skippedFull) {
          toast(`Queued ${result.added}. Queue is full (${MAX_BULK}).`);
        } else if (result.skippedDupes) {
          toast(`Queued ${result.added}, skipped ${result.skippedDupes} already listed`);
        }
        if (result.added > 0) {
          const firstNew = result.next[result.next.length - result.added];
          setActiveId(firstNew?.id ?? created[0].id);
          setQuery("");
          setSheetOpen(true);
        }
      });
      return result.next;
    });
  }

  function dismissJob(id: string) {
    cancelled.current.add(id);
    inflight.current.delete(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setActiveId((current) => (current === id ? null : current));
  }

  function retryJob(id: string) {
    cancelled.current.delete(id);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? { ...j, status: "queued", error: undefined, hint: undefined, retries: (j.retries ?? 0) + 1 }
          : j,
      ),
    );
  }

  function submit() {
    const urls = splitInputUrls(draft);
    if (urls.length === 0) {
      toast("Paste a YouTube or podcast URL");
      return;
    }
    enqueue(urls.map((url) => ({ url })), !bulk);
  }

  function openCollectionItem(item: { url: string; feedUrl?: string; guid?: string; title: string }) {
    enqueue([{ url: item.url, feedUrl: item.feedUrl, guid: item.guid, label: item.title }]);
  }

  const sheetTitle =
    active?.status === "error"
      ? "Couldn't fetch"
      : active?.status === "collection"
        ? active.collection?.title || "Show"
        : active?.status === "done"
          ? "Transcript"
          : "Fetching";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div ref={stageRef} className="app-stage">
        <div className="fiducial-frame" aria-hidden>
          <span className="fiducial-rail fiducial-rail-l" />
          <span className="fiducial-rail fiducial-rail-r" />
          <span className="fiducial fiducial-tl" />
          <span className="fiducial fiducial-tr" />
          <span className="fiducial fiducial-bl" />
          <span className="fiducial fiducial-br" />
        </div>
        <header className="nav-bar">
          <div className="nav-leading">
            <ThemeToggle />
          </div>
          <p className="nav-title">Verbatim</p>
          <div className="nav-trailing">
            {history.length > 0 ? (
              <button type="button" className="sheet-tint" onClick={() => setRecentsOpen(true)}>
                Recents
              </button>
            ) : null}
          </div>
        </header>

        <main className="page-gutter composer mx-auto w-full max-w-xl pt-3">
          <div className="mb-5">
            <h1 className="large-title">Paste a link.</h1>
            <p className="lede mt-2">The words, from the link.</p>
          </div>

          <section className="inset-group p-6">
            <ModeSwitch bulk={bulk} onChange={setBulk} />
            <label className="mt-4 block">
              <span className="micro-label">
                {bulk ? "URLs, one per line" : "Episode or video URL"}
              </span>
              <Textarea
                value={draft}
                inputMode="url"
                enterKeyHint={bulk ? "enter" : "go"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="url"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
                  if (!bulk && e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={
                  bulk
                    ? "Episode URLs, one per line. A show opens a list to pick from."
                    : "youtube.com/watch?v=…  or  podcasts.apple.com / open.spotify.com"
                }
                className={bulk ? "min-h-40" : "min-h-28"}
              />
            </label>
            <Button className="mt-4 w-full" size="lg" onClick={submit} disabled={busy && !bulk}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Fetching" : bulk ? "Queue transcripts" : "Get transcript"}
            </Button>
          </section>

          {jobs.length > 0 ? (
            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="micro-label mb-0 px-1">
                  Queue
                  <span className="ms-2 font-sans normal-case tracking-normal text-muted tabular-nums">
                    {jobs.length}/{MAX_BULK}
                  </span>
                </p>
                {doneTranscripts.length > 1 ? (
                  <button
                    type="button"
                    className="min-h-11 text-[14px] font-medium text-fg"
                    onClick={() => void downloadZip(doneTranscripts, "txt")}
                  >
                    Download all
                  </button>
                ) : null}
              </div>
              <ul className="inset-group">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <SwipeRow
                      onDismiss={() => dismissJob(job.id)}
                      className="rounded-none"
                      surfaceClassName="bg-bg-elevated"
                    >
                      <div className="flex w-full items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(job.id);
                            setSheetOpen(true);
                          }}
                          className="row min-w-0 flex-1"
                        >
                          {jobThumb(job) ? (
                            <span className="relative size-11 shrink-0 overflow-hidden rounded-[8px]">
                              <Cover src={jobThumb(job)} className="size-11" />
                            </span>
                          ) : (
                            <StatusDot status={job.status} />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[17px]">{job.label}</span>
                            <span className="mt-0.5 block truncate text-[13px] text-muted">
                              {job.status === "error"
                                ? job.error || "Failed"
                                : job.status === "queued"
                                  ? "Waiting"
                                  : job.status === "running"
                                    ? "Fetching"
                                    : job.status === "collection"
                                      ? "Pick episodes"
                                      : job.transcript
                                        ? `${(job.transcript.wordCount ?? 0).toLocaleString()} words`
                                        : "Ready"}
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-subtle" />
                        </button>
                        {job.status !== "running" ? (
                          <button
                            type="button"
                            aria-label="Remove from queue"
                            onClick={() => dismissJob(job.id)}
                            className="inline-flex size-11 shrink-0 items-center justify-center text-subtle"
                          >
                            <X className="size-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label="Cancel"
                            onClick={() => dismissJob(job.id)}
                            className="inline-flex size-11 shrink-0 items-center justify-center text-[13px] text-muted"
                          >
                            Stop
                          </button>
                        )}
                      </div>
                    </SwipeRow>
                  </li>
                ))}
              </ul>
              {jobs.length > 1 ? (
                <button
                  type="button"
                  className="mt-2 inline-flex min-h-11 items-center gap-1 px-1 text-[14px] font-medium text-muted"
                  onClick={() => {
                    setJobs([]);
                    setActiveId(null);
                    setSheetOpen(false);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Clear queue
                </button>
              ) : null}
            </section>
          ) : (
            <section className="mt-6">
              <p className="micro-label mb-2 px-1">Try one</p>
              <ul className="inset-group">
                {EXAMPLES.map((ex) => (
                  <li key={ex.url}>
                    <button
                      type="button"
                      className="row"
                      onClick={() => {
                        setDraft(ex.url);
                        setBulk(false);
                        enqueue([{ url: ex.url, label: ex.hint }], true);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px]">{ex.hint}</span>
                        <span className="mt-0.5 block text-[13px] text-muted">{ex.label}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>

      <AppSheet
        open={sheetOpen && Boolean(active)}
        onOpenChange={setSheetOpen}
        stageRef={stageRef}
        tone="paper"
        size="page"
        labelledBy="sheet-title"
        title={sheetTitle}
        leading={
          <button type="button" className="sheet-tint" onClick={() => setSheetOpen(false)}>
            Close
          </button>
        }
        trailing={
          active?.status === "done" && active.transcript ? (
            <>
              <CopyButton transcript={active.transcript} showTimes={showTimes} />
              <button type="button" className="sheet-tint" onClick={() => setExportOpen(true)} aria-label="Export">
                <Share className="size-4" />
              </button>
            </>
          ) : null
        }
      >
        {active?.status === "running" || active?.status === "queued" ? (
          <LoadingPane label={active.label} thumb={jobThumb(active)} />
        ) : null}
        {active?.status === "error" ? (
          <ErrorPane
            error={active.error}
            hint={active.hint}
            onRetry={() => retryJob(active.id)}
          />
        ) : null}
        {active?.status === "collection" && active.collection ? (
          <CollectionPane collection={active.collection} onPick={openCollectionItem} />
        ) : null}
        {active?.status === "done" && active.transcript ? (
          <TranscriptPane
            transcript={active.transcript}
            query={query}
            onQuery={setQuery}
            showTimes={showTimes}
            onToggleTimes={() => setShowTimes((v) => !v)}
          />
        ) : null}
      </AppSheet>

      <AppSheet
        open={recentsOpen}
        onOpenChange={setRecentsOpen}
        size="action"
        tone="grouped"
        stacked
        labelledBy="recents-title"
        title="Recents"
        leading={
          <button type="button" className="sheet-tint" onClick={() => setRecentsOpen(false)}>
            Close
          </button>
        }
      >
        <ul className="action-group">
          {history.map((item) => (
            <li key={item.canonicalUrl + item.fetchedAt}>
              <button
                type="button"
                className="row"
                onClick={() => {
                  setDraft(item.canonicalUrl);
                  setRecentsOpen(false);
                  enqueue([{ url: item.canonicalUrl, label: item.title }], !bulk);
                }}
              >
                {item.thumbnail ? (
                  <Cover src={item.thumbnail} className="size-11 shrink-0 rounded-[8px]" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px]">{item.title}</span>
                  <span className="text-[13px] text-muted">
                    {item.wordCount ? `${item.wordCount.toLocaleString()} words` : item.author}
                  </span>
                </span>
                <ChevronRight className="size-4 text-subtle" />
              </button>
            </li>
          ))}
        </ul>
      </AppSheet>

      <AppSheet
        open={exportOpen}
        onOpenChange={setExportOpen}
        size="action"
        tone="grouped"
        stacked
        labelledBy="export-title"
        title="Export"
        leading={
          <button type="button" className="sheet-tint" onClick={() => setExportOpen(false)}>
            Close
          </button>
        }
      >
        <div className="pb-3">
          <div className="action-group">
            {(
              [
                ["txt", "Plain text"],
                ["md", "Markdown"],
                ["srt", "SubRip"],
                ["vtt", "WebVTT"],
                ["json", "JSON"],
              ] as const
            ).map(([format, label]) => (
              <button
                key={format}
                type="button"
                className="action-item"
                onClick={() => {
                  if (active?.transcript) downloadTranscript(active.transcript, format);
                  setExportOpen(false);
                }}
              >
                {label}
              </button>
            ))}
            {doneTranscripts.length > 1 ? (
              <button
                type="button"
                className="action-item"
                onClick={() => {
                  void downloadZip(doneTranscripts, "txt");
                  setExportOpen(false);
                }}
              >
                All as ZIP
              </button>
            ) : null}
          </div>
          <div className="action-group">
            <button type="button" className="action-item action-item-cancel" onClick={() => setExportOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </AppSheet>
    </div>
  );
}

function CopyButton({ transcript, showTimes }: { transcript: TranscriptResult; showTimes: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="sheet-tint"
      aria-label="Copy transcript"
      onClick={async () => {
        const body = showTimes
          ? transcript.cues
              .map((c) => `[${formatTimestamp(c.startMs, "short")}] ${c.speaker ? `${c.speaker}: ` : ""}${c.text}`)
              .join("\n")
          : transcript.text;
        const payload = `${transcript.title}\n${transcript.author}\n${transcript.canonicalUrl}\n\n${body}`;
        try {
          await navigator.clipboard.writeText(payload);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
          toast("Copied transcript");
        } catch {
          toast("Couldn’t copy. Select the words instead.");
        }
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}

function StatusDot({ status }: { status: JobStatus }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "done" && "bg-ok",
        status === "error" && "bg-danger",
        status === "running" && "bg-paper-muted animate-pulse",
        status === "queued" && "bg-subtle",
        status === "collection" && "bg-muted",
      )}
    />
  );
}

function LoadingPane({ label, thumb }: { label: string; thumb?: string | null }) {
  return (
    <div className="px-5 py-6">
      {thumb ? (
        <Cover src={thumb} className="cover-sq mb-5 rounded-[10px]" />
      ) : null}
      <p className="micro-label text-paper-muted">Fetching</p>
      <h2 className="reading-title mt-2">The words are on their way.</h2>
      <p className="mt-2 max-w-sm truncate text-[15px] text-paper-muted">{label}</p>
      <div className="skeleton mt-10 space-y-3">
        <div className="h-3 w-5/6 rounded-full bg-paper-fg/10" />
        <div className="h-3 w-full rounded-full bg-paper-fg/10" />
        <div className="h-3 w-4/6 rounded-full bg-paper-fg/10" />
        <div className="h-3 w-3/4 rounded-full bg-paper-fg/10" />
        <div className="h-3 w-2/3 rounded-full bg-paper-fg/10" />
      </div>
    </div>
  );
}

function ErrorPane({
  error,
  hint,
  onRetry,
}: {
  error?: string;
  hint?: string;
  onRetry: () => void;
}) {
  return (
    <div className="t-input-wrap is-error px-5 py-10">
      <div className="t-input is-error is-shaking">
        <p className="micro-label text-danger-fg">Could not fetch</p>
        <h2 className="reading-title mt-2 max-w-lg">{error || "Something went wrong"}</h2>
      </div>
      {hint ? <p className="t-error-msg mt-4 max-w-lg text-[17px] leading-relaxed text-paper-muted">{hint}</p> : null}
      <Button className="mt-8 w-full" size="lg" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

function CollectionPane({
  collection,
  onPick,
}: {
  collection: CollectionResult;
  onPick: (item: CollectionResult["items"][number]) => void;
}) {
  return (
    <div>
      <div className="px-5 pb-3 pt-6">
        {collection.artwork ? (
          <Cover
            src={collection.artwork}
            className={cn(
              "mb-4 rounded-[10px]",
              collection.source === "youtube" ? "hero-cover aspect-video w-full" : "cover-sq",
            )}
          />
        ) : null}
        <p className="micro-label text-paper-muted">
          {collection.source === "youtube" ? "Playlist" : "Show"}
        </p>
        <h2 className="reading-title mt-1">{collection.title}</h2>
        <p className="mt-1 text-[15px] text-paper-muted">{collection.author}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-paper-muted">
          Tap an episode to fetch it. The whole show is never queued at once.
        </p>
      </div>
      <ul>
        {collection.items.map((item) => (
          <li key={(item.guid || item.url) + item.title} className="shadow-[inset_0_0.5px_0_0_var(--color-paper-rule)]">
            <button type="button" onClick={() => onPick(item)} className="row text-paper-fg">
              {item.thumbnail ? <Cover src={item.thumbnail} className="size-11 shrink-0 rounded-[8px]" /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-medium">{item.title}</span>
                <span className="text-[13px] text-paper-muted">
                  {item.hasTranscript === false ? "No published transcript" : "Get transcript"}
                </span>
              </span>
              {item.hasTranscript === false ? <Badge tone="paper">No file</Badge> : null}
              <ChevronRight className="size-4 shrink-0 text-paper-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TranscriptPane({
  transcript,
  query,
  onQuery,
  showTimes,
  onToggleTimes,
}: {
  transcript: TranscriptResult;
  query: string;
  onQuery: (v: string) => void;
  showTimes: boolean;
  onToggleTimes: () => void;
}) {
  const filtered = useMemo(() => {
    const cues = Array.isArray(transcript.cues) ? transcript.cues : [];
    const q = query.trim().toLowerCase();
    if (!q) return cues;
    return cues.filter(
      (c) => c.text.toLowerCase().includes(q) || (c.speaker && c.speaker.toLowerCase().includes(q)),
    );
  }, [transcript, query]);

  return (
    <div className="px-5 pb-8 pt-6">
      {transcript.thumbnail ? (
        <Cover
          src={transcript.thumbnail}
          className={cn(
            "mb-4 rounded-[10px]",
            transcript.source === "youtube" ? "hero-cover aspect-video w-full" : "cover-sq",
          )}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="paper">{transcript.source === "youtube" ? "YouTube" : "Podcast"}</Badge>
        {transcript.isGenerated ? <Badge tone="paper">Auto captions</Badge> : null}
        {transcript.language ? <Badge tone="paper">{transcript.language}</Badge> : null}
      </div>
      <h2 className="reading-title mt-2">{transcript.title}</h2>
      <p className="mt-1 text-[15px] text-paper-muted">
        {transcript.author}
        {transcript.durationSeconds ? ` · ${formatTimestamp(transcript.durationSeconds * 1000, "short")}` : ""}
        {` · ${(transcript.wordCount ?? 0).toLocaleString()} words`}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-paper-muted" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search this transcript"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11 bg-paper-fg/5 ps-10 text-[16px] text-paper-fg shadow-[0_0_0_1px_var(--color-paper-rule)] placeholder:text-paper-muted"
          />
        </div>
        <button
          type="button"
          className="h-11 min-h-11 rounded-[10px] px-3 text-[14px] font-medium text-paper-muted"
          onClick={onToggleTimes}
        >
          {showTimes ? "Hide times" : "Show times"}
        </button>
      </div>
      <div className="reading-body mt-6 space-y-4">
        {filtered.length === 0 ? (
          <p className="text-[17px] text-paper-muted">No lines match that search.</p>
        ) : (
          filtered.map((cue, i) => (
            <p key={`${cue.startMs}-${i}`} className="flex gap-4">
              {showTimes ? (
                <span className="w-12 shrink-0 pt-1.5 font-mono text-[12px] tabular-nums text-paper-muted">
                  {formatTimestamp(cue.startMs, "short")}
                </span>
              ) : null}
              <span>
                {cue.speaker ? <span className="font-medium">{cue.speaker}: </span> : null}
                {highlight(cue.text, query)}
              </span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-paper-fg/10 text-paper-fg">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
