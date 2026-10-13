import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardCopy,
  Download,
  FileText,
  ListTodo,
  LoaderCircle,
  Pause,
  Play,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DashboardButton,
  DashboardMenu,
  DashboardMenuContent,
  DashboardMenuItem,
  DashboardMenuTrigger,
  DashboardShell,
} from "@/components/block/dashboard-shell";
import { Input, TextArea } from "@/components/ui/input";
import { Scroll } from "@/components/ui/scroll";
import { fetchTranscriptFn } from "@/lib/transcript.functions";
import { copyText, exportTranscript, exportTranscriptsZip } from "@/lib/transcript/client-export";
import { SAMPLE_LINKS } from "@/lib/transcript/examples";
import { serializeTranscript } from "@/lib/transcript/formats";
import { inFlightJobs } from "@/lib/transcript/in-flight";
import {
  concurrencyFor,
  dedupeJobs,
  historyFromTranscript,
  loadHistory,
  MAX_BULK,
  newJobId,
  pushHistory,
  splitAndCapUrls,
} from "@/lib/transcript/queue";
import { formatClock } from "@/lib/transcript/time";
import type {
  CollectionItem,
  CollectionResult,
  Cue,
  ExportFormat,
  HistoryItem,
  Job,
  TranscriptResult,
} from "@/lib/transcript/types";

type Mode = "single" | "bulk";
type View = "workspace" | "queue" | "history";

export function VerbatimApp() {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("single");
  const [view, setView] = useState<View>("workspace");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [paused, setPaused] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadHistory(typeof window === "undefined" ? null : window.localStorage));
  }, []);

  const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0] ?? null;

  const enqueue = useCallback(
    (entries: { url: string; feedUrl?: string; guid?: string; label?: string }[]) => {
      setJobs((current) => {
        const incoming: Job[] = entries.map((e) => ({
          id: newJobId(),
          url: e.url,
          feedUrl: e.feedUrl,
          guid: e.guid,
          label: e.label || shortLabel(e.url),
          status: "queued" as const,
        }));
        const unique = dedupeJobs(current, incoming);
        if (!unique.length) {
          setNotice("That URL is already in the queue.");
          return current;
        }
        const room =
          MAX_BULK - current.filter((j) => j.status === "queued" || j.status === "running").length;
        const capped = unique.slice(
          0,
          Math.max(0, mode === "bulk" ? Math.min(room, MAX_BULK) : unique.length),
        );
        if (capped.length < unique.length) {
          setNotice(`Bulk is capped at ${MAX_BULK} jobs.`);
        }
        const next = [...current, ...capped];
        if (!selectedId && capped[0]) setSelectedId(capped[0].id);
        else if (capped[0] && current.length === 0) setSelectedId(capped[0].id);
        return next;
      });
    },
    [mode, selectedId],
  );

  function submitDraft() {
    const { urls, truncated } = splitAndCapUrls(draft, mode === "bulk" ? MAX_BULK : 1);
    if (!urls.length) {
      setNotice("Paste a YouTube, Apple Podcasts, Spotify, or RSS link.");
      return;
    }
    if (mode === "single") enqueue([{ url: urls[0]! }]);
    else enqueue(urls.map((url) => ({ url })));
    if (truncated) setNotice(`Only the first ${MAX_BULK} URLs were queued.`);
    setDraft("");
  }

  useEffect(() => {
    if (paused) return;
    const limit = concurrencyFor(mode);
    const running = jobs.filter((j) => j.status === "running").length;
    const slots = limit - running;
    if (slots <= 0) return;
    const queued = jobs.filter((j) => j.status === "queued").slice(0, slots);
    if (!queued.length) return;

    for (const job of queued) {
      if (inFlightJobs.has(job.id)) continue;
      inFlightJobs.add(job.id);
      setJobs((curr) => curr.map((j) => (j.id === job.id ? { ...j, status: "running" } : j)));
      void runJob(job);
    }

    async function runJob(job: Job) {
      try {
        const result = await fetchTranscriptFn({
          data: { url: job.url, feedUrl: job.feedUrl, guid: job.guid },
        });
        setJobs((curr) =>
          curr.map((j) => {
            if (j.id !== job.id) return j;
            if (result.kind === "transcript") {
              return {
                ...j,
                status: "done",
                transcript: result,
                error: undefined,
                hint: undefined,
              };
            }
            if (result.kind === "collection") {
              return {
                ...j,
                status: "collection",
                collection: result,
                label: result.title || j.label,
              };
            }
            return {
              ...j,
              status: "error",
              error: result.message,
              hint: result.hint,
              errorCode: result.code,
            };
          }),
        );
        if (result.kind === "transcript") {
          setHistory((h) =>
            pushHistory(h, historyFromTranscript(result, job.url), window.localStorage),
          );
        }
        setSelectedId((id) => id ?? job.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transcript fetch failed.";
        setJobs((curr) =>
          curr.map((j) => (j.id === job.id ? { ...j, status: "error", error: message } : j)),
        );
      } finally {
        inFlightJobs.delete(job.id);
      }
    }
  }, [jobs, mode, paused]);

  function dismissJob(id: string) {
    setJobs((curr) => {
      const target = curr.find((j) => j.id === id);
      if (target?.status === "running") return curr;
      const next = curr.filter((j) => j.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  function pickEpisode(item: CollectionItem) {
    enqueue([
      {
        url: item.url,
        feedUrl: item.feedUrl,
        guid: item.guid,
        label: item.title,
      },
    ]);
  }

  const finished = jobs.filter((j) => j.status === "done" && j.transcript);
  const running = jobs.filter((job) => job.status === "running").length;
  const queued = jobs.filter((job) => job.status === "queued").length;
  const collections = jobs.filter((job) => job.status === "collection").length;
  const failed = jobs.filter((job) => job.status === "error").length;
  const status = paused ? "Paused" : running > 0 ? "Processing" : "Ready";
  const statusTone = paused || running > 0 ? "warning" : "success";

  return (
    <main className="h-dvh bg-(--obsidian-dashboard-shell-background)">
      <DashboardShell
        className="dark"
        brand={{
          name: "Verbatim",
          description: "The full take, not a summary.",
          logo: <FileText aria-hidden className="size-5" />,
        }}
        navigation={[
          {
            id: "workspace",
            title: "Workspace",
            items: [{ id: "workspace", label: "Transcript", icon: FileText }],
          },
          {
            id: "queue",
            title: "Queue",
            items: [{ id: "queue", label: "All jobs", icon: ListTodo, count: jobs.length }],
          },
          {
            id: "history",
            title: "History",
            items: [
              { id: "history", label: "Saved transcripts", icon: Upload, count: history.length },
            ],
          },
        ]}
        activeItemId={view}
        onActiveItemChange={(id) => setView(id as View)}
        title={view === "workspace" ? "Workspace" : view === "queue" ? "Queue" : "History"}
        status={status}
        statusTone={statusTone}
        tabs={
          view === "workspace"
            ? [
                { value: "single", label: "Single" },
                { value: "bulk", label: "Bulk" },
              ]
            : undefined
        }
        tab={view === "workspace" ? mode : undefined}
        onTabChange={(next) => setMode(next as Mode)}
        headerActions={
          finished.length >= 2 ? (
            <DashboardButton
              variant="secondary"
              size="sm"
              onClick={() =>
                void exportTranscriptsZip(
                  finished.map((job) => job.transcript!),
                  "txt",
                  { timestamps: showTimestamps },
                )
              }
            >
              <Download aria-hidden />
              Zip {finished.length}
            </DashboardButton>
          ) : undefined
        }
        toolbarActions={
          view === "workspace" ? (
            <>
              <DashboardButton
                variant="secondary"
                size="sm"
                onClick={() => setPaused((value) => !value)}
                aria-pressed={paused}
              >
                {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
                {paused ? "Resume" : "Pause"}
              </DashboardButton>
              <DashboardButton
                variant="ghost"
                size="icon"
                onClick={() =>
                  setJobs((current) => current.filter((job) => job.status === "running"))
                }
                aria-label="Clear finished jobs"
              >
                <Trash2 aria-hidden />
              </DashboardButton>
            </>
          ) : undefined
        }
      >
        {view === "workspace" ? (
          <div className="grid min-h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:p-6">
            <section className="rounded-lg border border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-panel) p-4">
              <label
                className="mb-2 block text-xs font-medium uppercase tracking-[1px] text-(--obsidian-dashboard-shell-text-subtle)"
                htmlFor="verbatim-url"
              >
                {mode === "bulk" ? `URLs (one per line, max ${MAX_BULK})` : "URL"}
              </label>
              <TextArea
                id="verbatim-url"
                value={draft}
                rows={mode === "bulk" ? 6 : 3}
                placeholder={
                  mode === "bulk"
                    ? "https://youtube.com/watch?v=...\nhttps://podcasts.apple.com/..."
                    : "Paste a YouTube, Apple Podcasts, Spotify, or RSS link"
                }
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    submitDraft();
                  }
                }}
              />
              <DashboardButton
                variant="primary"
                size="md"
                className="mt-3 w-full"
                onClick={submitDraft}
              >
                Transcribe
              </DashboardButton>
              <div className="mt-4 flex flex-wrap gap-2">
                {SAMPLE_LINKS.map((sample) => (
                  <DashboardButton
                    key={sample.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDraft(sample.url);
                      enqueue([{ url: sample.url, label: sample.label }]);
                    }}
                  >
                    {sample.label}
                  </DashboardButton>
                ))}
              </div>
              {notice ? (
                <p role="status" className="mt-4 text-sm text-(--obsidian-dashboard-shell-warning)">
                  {notice}
                </p>
              ) : null}
              <p className="mt-5 text-xs leading-relaxed text-(--obsidian-dashboard-shell-text-subtle)">
                One job at a time in Single; up to two at a time in Bulk.
              </p>
            </section>
            <section className="flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-lg border border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-control)">
              <PaperPane
                job={selected}
                search={search}
                onSearch={setSearch}
                showTimestamps={showTimestamps}
                onToggleTimestamps={() => setShowTimestamps((value) => !value)}
                copied={copied}
                onCopy={async (text) => {
                  if (await copyText(text)) {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }
                }}
                onPick={pickEpisode}
              />
            </section>
          </div>
        ) : view === "queue" ? (
          <QueueView
            jobs={jobs}
            selectedId={selected?.id}
            queued={queued}
            running={running}
            collections={collections}
            failed={failed}
            onSelect={setSelectedId}
            onDismiss={dismissJob}
          />
        ) : (
          <HistoryView
            history={history}
            onRequeue={(item) => enqueue([{ url: item.url, label: item.title }])}
          />
        )}
      </DashboardShell>
    </main>
  );
}

function QueueView({
  jobs,
  selectedId,
  queued,
  running,
  collections,
  failed,
  onSelect,
  onDismiss,
}: {
  jobs: Job[];
  selectedId?: string;
  queued: number;
  running: number;
  collections: number;
  failed: number;
  onSelect: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const summary = [
    { label: "Queued", value: queued },
    { label: "Running", value: running },
    { label: "Completed", value: jobs.filter((job) => job.status === "done").length },
    { label: "Collections", value: collections },
    { label: "Failed", value: failed },
  ];
  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {summary.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-panel) p-3"
          >
            <p className="text-xs text-(--obsidian-dashboard-shell-text-subtle)">{item.label}</p>
            <p className="mt-1 text-xl font-medium tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>
      <section className="mt-4 overflow-hidden rounded-lg border border-(--obsidian-dashboard-shell-border)">
        {jobs.length === 0 ? (
          <p className="p-6 text-sm text-(--obsidian-dashboard-shell-text-muted)">
            Jobs land here after you submit a URL.
          </p>
        ) : (
          <ul>
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex min-h-14 items-center gap-3 border-b border-(--obsidian-dashboard-shell-border) px-3 last:border-b-0"
              >
                <StatusDot status={job.status} />
                <DashboardButton
                  variant="ghost"
                  size="sm"
                  className="min-w-0 flex-1 justify-start truncate"
                  onClick={() => onSelect(job.id)}
                  aria-pressed={selectedId === job.id}
                >
                  {job.label}
                </DashboardButton>
                <span className="text-xs capitalize text-(--obsidian-dashboard-shell-text-subtle)">
                  {job.status}
                </span>
                {job.status !== "running" ? (
                  <DashboardButton
                    variant="ghost"
                    size="icon"
                    aria-label={`Dismiss ${job.label}`}
                    onClick={() => onDismiss(job.id)}
                  >
                    <Trash2 aria-hidden />
                  </DashboardButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HistoryView({
  history,
  onRequeue,
}: {
  history: HistoryItem[];
  onRequeue: (item: HistoryItem) => void;
}) {
  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <section className="overflow-hidden rounded-lg border border-(--obsidian-dashboard-shell-border)">
        {history.length === 0 ? (
          <p className="p-6 text-sm text-(--obsidian-dashboard-shell-text-muted)">
            Nothing saved yet. Finished transcripts stay in this browser.
          </p>
        ) : (
          <ul>
            {history.map((item) => (
              <li
                key={item.canonicalUrl}
                className="flex min-h-16 items-center gap-4 border-b border-(--obsidian-dashboard-shell-border) p-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-(--obsidian-dashboard-shell-text-subtle)">
                    {item.author ? `${item.author} · ` : ""}
                    {item.wordCount
                      ? `${item.wordCount.toLocaleString()} words`
                      : "Saved transcript"}
                  </p>
                </div>
                <DashboardButton variant="secondary" size="sm" onClick={() => onRequeue(item)}>
                  Re-queue
                </DashboardButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PaperPane({
  job,
  search,
  onSearch,
  showTimestamps,
  onToggleTimestamps,
  copied,
  onCopy,
  onPick,
}: {
  job: Job | null;
  search: string;
  onSearch: (v: string) => void;
  showTimestamps: boolean;
  onToggleTimestamps: () => void;
  copied: boolean;
  onCopy: (text: string) => void;
  onPick: (item: CollectionItem) => void;
}) {
  if (!job) return <EmptyPane />;
  if (job.status === "queued" || job.status === "running") return <LoadingPane label={job.label} />;
  if (job.status === "error") return <ErrorPane message={job.error} hint={job.hint} />;
  if (job.status === "collection" && job.collection) {
    return <CollectionPane collection={job.collection} onPick={onPick} />;
  }
  if (job.transcript) {
    return (
      <TranscriptPane
        transcript={job.transcript}
        search={search}
        onSearch={onSearch}
        showTimestamps={showTimestamps}
        onToggleTimestamps={onToggleTimestamps}
        copied={copied}
        onCopy={onCopy}
      />
    );
  }
  return <EmptyPane />;
}

function EmptyPane() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <p className="text-2xl font-medium text-balance">The full take, not a summary.</p>
      <p className="mt-3 max-w-md text-pretty text-sm text-(--obsidian-dashboard-shell-text-muted)">
        Paste a YouTube or podcast URL. Captions, published transcripts, and speech-to-text as a
        last resort.
      </p>
    </div>
  );
}

function LoadingPane({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col px-6 py-8 md:px-10">
      <div className="mb-6 flex items-center gap-2 text-sm text-(--obsidian-dashboard-shell-text-muted)">
        <LoaderCircle className="size-4 animate-spin" />
        Fetching {label}
      </div>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded-full bg-(--obsidian-dashboard-shell-muted)"
            style={{ width: `${70 + ((i * 17) % 25)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorPane({ message, hint }: { message?: string; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center px-8 py-16">
      <p className="text-2xl font-medium">Could not pull a transcript</p>
      <p className="mt-3 max-w-lg text-pretty text-sm text-(--obsidian-dashboard-shell-text-muted)">
        {message ?? "Unknown error."}
      </p>
      {hint ? (
        <p className="mt-2 max-w-lg text-pretty text-sm text-(--obsidian-dashboard-shell-text-subtle)">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function CollectionPane({
  collection,
  onPick,
}: {
  collection: CollectionResult;
  onPick: (item: CollectionItem) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-(--obsidian-dashboard-shell-border) px-6 py-5 md:px-8">
        <p className="text-xs uppercase tracking-wide text-(--obsidian-dashboard-shell-text-subtle)">
          Pick an episode
        </p>
        <h2 className="mt-1 text-2xl font-medium">{collection.title}</h2>
        {collection.author ? (
          <p className="mt-1 text-sm text-(--obsidian-dashboard-shell-text-muted)">
            {collection.author}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-(--obsidian-dashboard-shell-text-muted)">
          Show and playlist links do not auto-fetch everything. Each tap starts a new job.
        </p>
      </div>
      <Scroll className="flex-1 px-3 py-3 md:px-5">
        <ul className="flex flex-col">
          {collection.items.map((item, i) => (
            <li key={`${item.guid ?? item.url}-${i}`}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left hover:bg-(--obsidian-dashboard-shell-hover) focus-visible:outline-2 focus-visible:outline-(--obsidian-dashboard-shell-ring)"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{item.title}</span>
                  {item.publishedAt ? (
                    <span className="text-xs text-(--obsidian-dashboard-shell-text-subtle)">
                      {item.publishedAt}
                    </span>
                  ) : null}
                </span>
                {item.durationMs ? (
                  <span className="shrink-0 text-xs tabular-nums text-(--obsidian-dashboard-shell-text-subtle)">
                    {formatClock(item.durationMs)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </Scroll>
    </div>
  );
}

function TranscriptPane({
  transcript,
  search,
  onSearch,
  showTimestamps,
  onToggleTimestamps,
  copied,
  onCopy,
}: {
  transcript: TranscriptResult;
  search: string;
  onSearch: (v: string) => void;
  showTimestamps: boolean;
  onToggleTimestamps: () => void;
  copied: boolean;
  onCopy: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return transcript.cues;
    return transcript.cues.filter(
      (c) => c.text.toLowerCase().includes(q) || c.speaker?.toLowerCase().includes(q),
    );
  }, [transcript.cues, q]);

  const collapseAt = Math.max(8, Math.ceil(transcript.cues.length * 0.25));
  const searching = q.length > 0;
  const visible =
    searching || expanded || transcript.cues.length <= collapseAt
      ? filtered
      : filtered.slice(0, collapseAt);

  const copyPayload = serializeTranscript(transcript, "txt", { timestamps: showTimestamps });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-(--obsidian-dashboard-shell-border) px-5 py-5 md:px-8">
        <h2 className="text-2xl font-medium text-balance md:text-3xl">{transcript.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {transcript.author ? (
            <Badge className="bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-text-muted)">
              {transcript.author}
            </Badge>
          ) : null}
          <Badge className="bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-text-muted)">
            {sourceLabel(transcript.source)}
          </Badge>
          {transcript.language ? (
            <Badge className="bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-text-muted)">
              {transcript.language}
            </Badge>
          ) : null}
          {transcript.isAutoGenerated ? (
            <Badge className="bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-text-muted)">
              Auto captions
            </Badge>
          ) : null}
          <Badge className="bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-text-muted)">
            {transcript.wordCount.toLocaleString()} words
          </Badge>
          {transcript.durationMs ? (
            <Badge className="bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-text-muted)">
              {formatClock(transcript.durationMs)}
            </Badge>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DashboardButton variant="secondary" size="sm" onClick={() => onCopy(copyPayload)}>
            {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </DashboardButton>
          <DashboardMenu>
            <DashboardMenuTrigger asChild>
              <DashboardButton variant="secondary" size="sm">
                <Download aria-hidden />
                Export
              </DashboardButton>
            </DashboardMenuTrigger>
            <DashboardMenuContent align="start">
              {(["txt", "md", "srt", "vtt", "json"] as ExportFormat[]).map((fmt) => (
                <DashboardMenuItem
                  key={fmt}
                  onSelect={() => exportTranscript(transcript, fmt, { timestamps: showTimestamps })}
                >
                  {fmt.toUpperCase()}
                </DashboardMenuItem>
              ))}
            </DashboardMenuContent>
          </DashboardMenu>
          <DashboardButton variant="ghost" size="sm" onClick={onToggleTimestamps}>
            {showTimestamps ? "Hide times" : "Show times"}
          </DashboardButton>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--obsidian-dashboard-shell-text-subtle)" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search lines"
            className="bg-(--obsidian-dashboard-shell-muted) pl-10 text-(--obsidian-dashboard-shell-foreground) placeholder:text-(--obsidian-dashboard-shell-text-subtle) focus-visible:ring-(--obsidian-dashboard-shell-ring)"
            aria-label="Search transcript lines"
          />
        </div>
      </div>
      <Scroll className="relative flex-1 px-5 py-5 md:px-8">
        {visible.length === 0 ? (
          <p className="text-sm text-(--obsidian-dashboard-shell-text-muted)">
            No lines match that search.
          </p>
        ) : (
          <ol className="space-y-3">
            {visible.map((cue, i) => (
              <CueLine
                key={`${cue.startMs}-${i}`}
                cue={cue}
                query={q}
                showTimestamps={showTimestamps}
              />
            ))}
          </ol>
        )}
        {!searching && !expanded && transcript.cues.length > collapseAt ? (
          <div className="relative mt-4">
            <div className="pointer-events-none absolute -top-16 left-0 right-0 h-16 bg-gradient-to-t from-(--obsidian-dashboard-shell-control) to-transparent" />
            <DashboardButton
              variant="secondary"
              size="md"
              className="w-full"
              onClick={() => setExpanded(true)}
            >
              See more ({transcript.cues.length - collapseAt} lines)
            </DashboardButton>
          </div>
        ) : null}
      </Scroll>
    </div>
  );
}

function CueLine({
  cue,
  query,
  showTimestamps,
}: {
  cue: Cue;
  query: string;
  showTimestamps: boolean;
}) {
  return (
    <li className="flex gap-4 text-[15px] leading-relaxed">
      {showTimestamps ? (
        <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-(--obsidian-dashboard-shell-text-subtle)">
          {formatClock(cue.startMs)}
        </span>
      ) : null}
      <p className="min-w-0 text-pretty">
        {cue.speaker ? <span className="font-medium">{cue.speaker}: </span> : null}
        {highlight(cue.text, query)}
      </p>
    </li>
  );
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-(--obsidian-dashboard-shell-muted-hover) text-(--obsidian-dashboard-shell-foreground)">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function StatusDot({ status }: { status: Job["status"] }) {
  const color =
    status === "done"
      ? "bg-(--obsidian-dashboard-shell-success)"
      : status === "error"
        ? "bg-(--obsidian-dashboard-shell-danger)"
        : status === "running"
          ? "bg-(--obsidian-dashboard-shell-warning) animate-pulse"
          : status === "collection"
            ? "bg-(--obsidian-dashboard-shell-warning)"
            : "bg-(--obsidian-dashboard-shell-text-subtle)";
  return <span className={`size-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

function shortLabel(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const tail = u.pathname.split("/").filter(Boolean).at(-1);
    return tail ? decodeURIComponent(tail).replace(/[-_]/g, " ") : u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 48);
  }
}

function sourceLabel(source: TranscriptResult["source"]): string {
  switch (source) {
    case "youtube":
      return "YouTube captions";
    case "podcast":
      return "Published transcript";
    case "rss":
      return "RSS";
    case "stt":
      return "Speech-to-text";
    case "file":
      return "Transcript file";
  }
}
