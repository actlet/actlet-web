/**
 * Measures the viewer on a long synthetic session in a real browser: fold
 * time, how long each live append takes to reach the screen, frame times
 * while scrolling through the conversation, and heap size. scripts/bench.mjs
 * runs it headless; ?mode=synthetic&bench=1 runs it by hand.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityViewer, fold, type ActivityEvent } from "../src";
import { syntheticEvents } from "../test/synthetic";

export interface BenchResult {
  events: number;
  foldMs: number;
  append: { batch: number; count: number; avgMs: number; p95Ms: number; maxMs: number };
  scroll: { frames: number; avgMs: number; p95Ms: number; maxMs: number; over50ms: number; rendered: number };
  heapMB: number | null;
  done: true;
}

declare global {
  interface Window {
    __bench?: BenchResult;
    gc?: () => void;
  }
}

const N = 20_000;
const BATCH = 250;

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function stats(xs: number[]) {
  const sorted = [...xs].sort((a, b) => a - b);
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    avgMs: round(avg),
    p95Ms: round(sorted[Math.floor(sorted.length * 0.95)]),
    maxMs: round(sorted[sorted.length - 1]),
  };
}

function round(x: number) {
  return Math.round(x * 10) / 10;
}

export function SyntheticDemo({ bench, theme }: { bench: boolean; theme: "auto" | "dark" | "light" }) {
  const [all] = useState(() => syntheticEvents(N));
  const [shown, setShown] = useState<ActivityEvent[]>(() => (bench ? [] : all));
  const [result, setResult] = useState<BenchResult | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bench) return;
    let cancelled = false;
    (async () => {
      const t0 = performance.now();
      fold(all);
      const foldMs = performance.now() - t0;

      // Live: append a batch, and time until the frame after it is painted.
      const appends: number[] = [];
      for (let n = BATCH; n <= all.length && !cancelled; n += BATCH) {
        const start = performance.now();
        setShown(all.slice(0, n));
        await nextFrame();
        await nextFrame();
        appends.push(performance.now() - start);
      }

      // Scroll from the end to the start, a step per frame.
      const stream = root.current!.querySelector<HTMLElement>(".actlet-stream")!;
      const frames: number[] = [];
      let rendered = 0;
      let last = await nextFrame();
      const step = Math.max(stream.scrollHeight / 400, 60);
      while (stream.scrollTop > 0 && frames.length < 2000 && !cancelled) {
        stream.scrollTop = Math.max(stream.scrollTop - step, 0);
        const now = await nextFrame();
        frames.push(now - last);
        last = now;
        rendered = Math.max(rendered, stream.querySelectorAll(":scope > .actlet-entry").length);
      }

      window.gc?.();
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const r: BenchResult = {
        events: all.length,
        foldMs: round(foldMs),
        append: { batch: BATCH, count: appends.length, ...stats(appends) },
        scroll: { frames: frames.length, ...stats(frames), over50ms: frames.filter((f) => f > 50).length, rendered },
        heapMB: memory ? round(memory.usedJSHeapSize / 2 ** 20) : null,
        done: true,
      };
      window.__bench = r;
      setResult(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [all, bench]);

  return (
    <div ref={root} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {result && (
        <pre
          id="bench"
          style={{ margin: 0, padding: "0.5em 1em", background: "#0b0c10", color: "#9fe0b0", fontSize: 12 }}
        >
          {JSON.stringify(result)}
        </pre>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ActivityViewer events={shown} theme={theme} sessionId="synthetic" connectionLabel={`synthetic ${N}`} />
      </div>
    </div>
  );
}
