export type TranscriptSource = "youtube" | "podcast" | "rss";

export type Cue = {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
};

export type TranscriptResult = {
  url: string;
  canonicalUrl: string;
  source: TranscriptSource;
  title: string;
  author: string;
  durationSeconds: number | null;
  language: string | null;
  isGenerated: boolean;
  thumbnail: string | null;
  fetchedAt: string;
  cues: Cue[];
  text: string;
  wordCount: number;
  trackLabel: string | null;
};

export type CollectionItem = {
  url: string;
  title: string;
  author?: string;
  durationSeconds?: number | null;
  hasTranscript?: boolean;
  feedUrl?: string;
  guid?: string;
  publishedAt?: string | null;
  thumbnail?: string | null;
};

export type CollectionResult = {
  title: string;
  author: string;
  source: TranscriptSource;
  url: string;
  artwork?: string | null;
  items: CollectionItem[];
};

export type FetchOk =
  | { ok: true; kind: "transcript"; transcript: TranscriptResult }
  | { ok: true; kind: "collection"; collection: CollectionResult };

export type FetchErr = {
  ok: false;
  code:
    | "invalid_url"
    | "not_found"
    | "no_transcript"
    | "blocked"
    | "unsupported"
    | "network"
    | "too_large";
  error: string;
  hint?: string;
};

export type FetchResponse = FetchOk | FetchErr;

export type FetchInput = {
  url: string;
  feedUrl?: string;
  guid?: string;
};
