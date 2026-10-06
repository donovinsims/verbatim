import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ClipboardCopy,
  Download,
  History,
  LoaderCircle,
  Pause,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { Input, TextArea } from "@/components/ui/input";
import { Scroll } from "@/components/ui/scroll";
import { SwipeRow } from "@/components/swipe-row";
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

export function VerbatimApp() {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("single");
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
        const room = MAX_BULK - current.filter((j) => j.status === "queued" || j.status === "running").length;
        const capped = unique.slice(0, Math.max(0, mode === "bulk" ? Math.min(room, MAX_BULK) : unique.length));
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
              return { ...j, status: "done", transcript: result, error: undefined, hint: undefined };
            }
            if (result.kind === "collection") {
              return { ...j, status: "collection", collection: result, label: result.title || j.label };
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
          setHistory((h) => pushHistory(h, historyFromTranscript(result, job.url), window.localStorage));
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

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-fg">
      <header className="flex items-center justify-between gap-3 border-b border-fg/8 px-4 py-3 md:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-2xl tracking-tight text-fg">Verbatim</h1>
          <p className="hidden text-sm text-muted sm:block">The full take, not a summary.</p>
        </div>
        <div className="flex items-center gap-1">
          {finished.length >= 2 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void exportTranscriptsZip(finished.map((j) => j.transcript!), "txt", { timestamps: showTimestamps })}
            >
              <Download className="size-4" />
              Zip {finished.length}
            </Button>
          ) : null}
          <Dropdown
            label={
              <>
                <History className="size-4" />
                Recents
                <ChevronDown className="size-3.5 opacity-60" />
              </>
            }
          >
            {history.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">Nothing saved yet. Finished transcripts stay in this browser.</p>
            ) : (
              history.map((item) => (
                <DropdownItem
                  key={item.canonicalUrl}
                  onSelect={() => enqueue([{ url: item.url, label: item.title }])}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{item.title}</span>
                    <span className="text-xs text-muted">
                      {item.author ? `${item.author} · ` : ""}
                      {item.wordCount ? `${item.wordCount.toLocaleString()} words` : "re-queue"}
                    </span>
                  </span>
                </DropdownItem>
              ))
            )}
          </Dropdown>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(280px,360px)_1fr] md:p-6">
        <section className="flex flex-col rounded-2xl bg-ink-2 p-4 shadow-card">
          <div className="mb-3 flex rounded-lg bg-fg/6 p-1">
            {(["single", "bulk"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`min-h-10 flex-1 rounded-md text-sm capitalize ${
                  mode === m ? "bg-ink text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <label className="mb-1 text-xs uppercase tracking-wide text-muted" htmlFor="verbatim-url">
            {mode === "bulk" ? "URLs (one per line, max 20)" : "URL"}
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
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitDraft();
              }
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={submitDraft} className="flex-1">
              Transcribe
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setJobs((curr) => curr.filter((j) => j.status === "running"));
              }}
              aria-label="Clear finished jobs"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SAMPLE_LINKS.map((sample) => (
              <Button
                key={sample.id}
                type="button"
                variant="chip"
                size="sm"
                onClick={() => {
                  setDraft(sample.url);
                  enqueue([{ url: sample.url, label: sample.label }]);
                }}
              >
                {sample.label}
              </Button>
            ))}
          </div>
          {notice ? <p className="mt-3 text-sm text-accent">{notice}</p> : null}
          <h2 className="mt-5 text-xs uppercase tracking-wide text-muted">Queue</h2>
          <Scroll className="mt-2 max-h-[42vh] md:max-h-[calc(100dvh-24rem)]">
            {jobs.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted">Jobs land here. One at a time in Single, two at a time in Bulk.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <SwipeRow
                      disabled={job.status === "running"}
                      onDismiss={() => dismissJob(job.id)}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(job.id)}
                        className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm ${
                          selected?.id === job.id ? "bg-fg/10 text-fg" : "text-fg/80 hover:bg-fg/6"
                        }`}
                      >
                        <StatusDot status={job.status} />
                        <span className="min-w-0 flex-1 truncate">{job.label}</span>
                      </button>
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            )}
          </Scroll>
        </section>

        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl bg-paper text-paper-ink shadow-paper md:min-h-[calc(100dvh-7rem)]">
          <PaperPane
            job={selected}
            search={search}
            onSearch={setSearch}
            showTimestamps={showTimestamps}
            onToggleTimestamps={() => setShowTimestamps((v) => !v)}
            copied={copied}
            onCopy={async (text) => {
              const ok = await copyText(text);
              if (ok) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }
            }}
            onPick={pickEpisode}
          />
        </section>
      </div>
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
      <p className="font-serif text-3xl text-balance text-paper-ink">The full take, not a summary.</p>
      <p className="mt-3 max-w-md text-pretty text-sm text-paper-muted">
        Paste a YouTube or podcast URL. Captions, published transcripts, and speech-to-text as a last resort.
      </p>
    </div>
  );
}

function LoadingPane({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col px-6 py-8 md:px-10">
      <div className="mb-6 flex items-center gap-2 text-sm text-paper-muted">
        <LoaderCircle className="size-4 animate-spin" />
        Fetching {label}
      </div>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded-full bg-paper-ink/8"
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
      <p className="font-serif text-2xl text-paper-ink">Could not pull a transcript</p>
      <p className="mt-3 max-w-lg text-pretty text-sm text-paper-ink/80">{message ?? "Unknown error."}</p>
      {hint ? <p className="mt-2 max-w-lg text-pretty text-sm text-paper-muted">{hint}</p> : null}
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
      <div className="border-b border-paper-ink/10 px-6 py-5 md:px-8">
        <p className="text-xs uppercase tracking-wide text-paper-muted">Pick an episode</p>
        <h2 className="mt-1 font-serif text-2xl text-paper-ink">{collection.title}</h2>
        {collection.author ? <p className="mt-1 text-sm text-paper-muted">{collection.author}</p> : null}
        <p className="mt-2 text-sm text-paper-muted">
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
                className="flex min-h-14 w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left hover:bg-paper-ink/5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-paper-ink">{item.title}</span>
                  {item.publishedAt ? (
                    <span className="text-xs text-paper-muted">{item.publishedAt}</span>
                  ) : null}
                </span>
                {item.durationMs ? (
                  <span className="shrink-0 text-xs tabular-nums text-paper-muted">{formatClock(item.durationMs)}</span>
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
    return transcript.cues.filter((c) => c.text.toLowerCase().includes(q) || c.speaker?.toLowerCase().includes(q));
  }, [transcript.cues, q]);

  const collapseAt = Math.max(8, Math.ceil(transcript.cues.length * 0.25));
  const searching = q.length > 0;
  const visible = searching || expanded || transcript.cues.length <= collapseAt
    ? filtered
    : filtered.slice(0, collapseAt);

  const copyPayload = serializeTranscript(transcript, "txt", { timestamps: showTimestamps });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-paper-ink/10 px-5 py-5 md:px-8">
        <h2 className="font-serif text-2xl text-balance text-paper-ink md:text-3xl">{transcript.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {transcript.author ? <Badge className="bg-paper-ink/8 text-paper-muted">{transcript.author}</Badge> : null}
          <Badge className="bg-paper-ink/8 text-paper-muted">{sourceLabel(transcript.source)}</Badge>
          {transcript.language ? <Badge className="bg-paper-ink/8 text-paper-muted">{transcript.language}</Badge> : null}
          {transcript.isAutoGenerated ? <Badge className="bg-paper-ink/8 text-paper-muted">Auto captions</Badge> : null}
          <Badge className="bg-paper-ink/8 text-paper-muted">{transcript.wordCount.toLocaleString()} words</Badge>
          {transcript.durationMs ? (
            <Badge className="bg-paper-ink/8 text-paper-muted">{formatClock(transcript.durationMs)}</Badge>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="paper"
            size="sm"
            onClick={() => onCopy(copyPayload)}
          >
            {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Dropdown
            align="left"
            label={
              <>
                <Download className="size-4" />
                Export
              </>
            }
          >
            {(["txt", "md", "srt", "vtt", "json"] as ExportFormat[]).map((fmt) => (
              <DropdownItem key={fmt} onSelect={() => exportTranscript(transcript, fmt, { timestamps: showTimestamps })}>
                {fmt.toUpperCase()}
              </DropdownItem>
            ))}
          </Dropdown>
          <Button variant="ghost" size="sm" className="text-paper-ink/70 hover:bg-paper-ink/8 hover:text-paper-ink" onClick={onToggleTimestamps}>
            {showTimestamps ? "Hide times" : "Show times"}
          </Button>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-paper-muted" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search lines"
            className="bg-paper-ink/6 pl-10 text-paper-ink placeholder:text-paper-muted focus-visible:ring-paper-ink/30"
            aria-label="Search transcript lines"
          />
        </div>
      </div>
      <Scroll className="relative flex-1 px-5 py-5 md:px-8">
        {visible.length === 0 ? (
          <p className="text-sm text-paper-muted">No lines match that search.</p>
        ) : (
          <ol className="space-y-3">
            {visible.map((cue, i) => (
              <CueLine key={`${cue.startMs}-${i}`} cue={cue} query={q} showTimestamps={showTimestamps} />
            ))}
          </ol>
        )}
        {!searching && !expanded && transcript.cues.length > collapseAt ? (
          <div className="relative mt-4">
            <div className="pointer-events-none absolute -top-16 left-0 right-0 h-16 bg-gradient-to-t from-paper to-transparent" />
            <Button variant="paper" className="w-full" onClick={() => setExpanded(true)}>
              See more ({transcript.cues.length - collapseAt} lines)
            </Button>
          </div>
        ) : null}
      </Scroll>
    </div>
  );
}

function CueLine({ cue, query, showTimestamps }: { cue: Cue; query: string; showTimestamps: boolean }) {
  return (
    <li className="flex gap-4 text-[15px] leading-relaxed">
      {showTimestamps ? (
        <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-paper-muted">{formatClock(cue.startMs)}</span>
      ) : null}
      <p className="min-w-0 text-pretty text-paper-ink">
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
      <mark className="bg-accent/40 text-paper-ink">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function StatusDot({ status }: { status: Job["status"] }) {
  const color =
    status === "done"
      ? "bg-fg"
      : status === "error"
        ? "bg-danger"
        : status === "running"
          ? "bg-accent animate-pulse"
          : status === "collection"
            ? "bg-accent"
            : "bg-muted";
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
