const loadImageMock = jest.fn();
jest.mock("@napi-rs/canvas", () => ({
  loadImage: (...args: unknown[]) => loadImageMock(...args),
}));

import {
  clearRemoteImageCache,
  loadImageAsync,
} from "../src/utilities/canvas/remoteImage";

const NONE = "./src/assets/images/None.png";
const fetchMock = jest.fn();

function okResponse(bytes = 4) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(bytes),
  };
}

beforeEach(() => {
  clearRemoteImageCache();
  fetchMock.mockReset();
  loadImageMock.mockReset();
  // Buffers decode to a fresh fake image; local paths decode to a tagged one.
  loadImageMock.mockImplementation(async (source: unknown) =>
    typeof source === "string"
      ? { local: source, width: 1, height: 1 }
      : { buffer: source, width: 1, height: 1 },
  );
  (global as any).fetch = fetchMock;
});

describe("shared remote image loader", () => {
  it("fetches once, then serves repeats from memory", async () => {
    fetchMock.mockResolvedValue(okResponse());
    const a = await loadImageAsync("https://cdn.test/a.png");
    const b = await loadImageAsync("https://cdn.test/a.png");
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    let release!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const first = loadImageAsync("https://cdn.test/b.png");
    const second = loadImageAsync("https://cdn.test/b.png");
    release(okResponse());
    expect(await first).toBe(await second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads local paths directly without fetch or caching", async () => {
    await loadImageAsync("./src/assets/images/x.png");
    await loadImageAsync("./src/assets/images/x.png");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadImageMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to fallbackUrl, then to None.png, when the fetch fails or times out", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/fallback.png")) return okResponse();
      throw new DOMException("timed out", "TimeoutError");
    });
    const viaFallback: any = await loadImageAsync(
      "https://cdn.test/dead.png",
      "https://cdn.test/fallback.png",
    );
    expect(viaFallback.buffer).toBeDefined();
    const viaNone: any = await loadImageAsync("https://cdn.test/dead2.png");
    expect(viaNone.local).toBe(NONE);
  });

  it("treats a non-2xx response as a failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const image: any = await loadImageAsync("https://cdn.test/404.png");
    expect(image.local).toBe(NONE);
  });

  it("caches failures only briefly", async () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    fetchMock.mockRejectedValue(new Error("down"));
    await loadImageAsync("https://cdn.test/flaky.png");
    await loadImageAsync("https://cdn.test/flaky.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 61_000);
    fetchMock.mockResolvedValue(okResponse());
    const recovered: any = await loadImageAsync("https://cdn.test/flaky.png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recovered.buffer).toBeDefined();
    now.mockRestore();
  });

  it("evicts the least recently used entry beyond 200 images", async () => {
    fetchMock.mockImplementation(async () => okResponse());
    for (let i = 0; i < 200; i++) await loadImageAsync(`https://cdn.test/${i}.png`);
    await loadImageAsync("https://cdn.test/0.png"); // touch 0 -> 1 is now oldest
    await loadImageAsync("https://cdn.test/200.png"); // evicts 1
    expect(fetchMock).toHaveBeenCalledTimes(201);
    await loadImageAsync("https://cdn.test/0.png");
    expect(fetchMock).toHaveBeenCalledTimes(201);
    await loadImageAsync("https://cdn.test/1.png");
    expect(fetchMock).toHaveBeenCalledTimes(202);
  });

  it("lets a caller map the url first (disk cache) and reuses the result", async () => {
    const resolve = jest.fn(async () => "./cache/p.png");
    const a: any = await loadImageAsync("https://cdn.test/p.png", undefined, resolve);
    await loadImageAsync("https://cdn.test/p.png", undefined, resolve);
    expect(a.local).toBe("./cache/p.png");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
