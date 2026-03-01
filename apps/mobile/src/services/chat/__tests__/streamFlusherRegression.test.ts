import { createStreamFlusher } from "../streamFlusher";

describe("regression: stream flusher", () => {
  it("always flushes assistant text even when debug callback throws", () => {
    const timerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const flushed: string[] = [];

    const flusher = createStreamFlusher(
      (chunk) => flushed.push(chunk),
      () => "",
      timerRef,
      () => {
        throw new Error("debug callback failed");
      },
    );

    flusher.queue("hello world\n");
    expect(flushed).toEqual(["hello world\n"]);
    expect(timerRef.current).toBeNull();
  });
});
