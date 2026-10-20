import { useCallback, useEffect, useRef, useState } from "react";
import type { EventInput } from "../../src";

/**
 * Collects events as they arrive and hands them to React once per frame,
 * so a burst of events causes one render, not hundreds. The array only
 * ever grows by appending, which lets the viewer fold just the new events.
 */
export function useEventBuffer(): [EventInput[], (ev: EventInput) => void] {
  const [events, setEvents] = useState<EventInput[]>([]);
  const pending = useRef<EventInput[]>([]);
  const frame = useRef<number | null>(null);
  const push = useCallback((ev: EventInput) => {
    pending.current.push(ev);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const batch = pending.current;
      pending.current = [];
      setEvents((prev) => [...prev, ...batch]);
    });
  }, []);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return [events, push];
}
