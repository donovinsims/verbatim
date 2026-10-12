import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeHtmlEntities, fetchText, readLimited, stripHtml, withRequestSignal } from "./http";

describe("html helpers", () => {
  it("decodes entities and strips tags", () => {
    expect(decodeHtmlEntities("a & b &#39; c")).toBe("a & b ' c");
    expect(stripHtml("<font>Hi &#39;there&#39;</font>")).toBe("Hi 'there'");
  });
});

describe("readLimited", () => {
  it("rejects oversized content-length", async () => {
    const res = new Response("hello", { headers: { "content-length": "99999" } });
    await expect(readLimited(res, 8)).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("user-agent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a browser user-agent by default", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchText("https://example.com/x");
    const call = fetchMock.mock.calls[0] as unknown as
      [string, RequestInit | undefined] | undefined;
    const headers = new Headers(call?.[1]?.headers);
    expect(headers.get("User-Agent")).toMatch(/Mozilla/);
  });
});

describe("request cancellation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("aborts an in-flight upstream fetch when the request deadline is cancelled", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = withRequestSignal(controller.signal, () =>
      fetchText("https://example.com/slow"),
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "timeout" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
