import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toEvent, type EventInput } from "../events";
import type { ActivityEvent } from "../gen/actlet/gateway/v0/gateway_pb";
import { Player } from "../replay/player";
import { apply, newSession, skip, type Session } from "../view/session";

/** Decodes events; null for one that can't be decoded. */
export function decodeEvents(inputs: readonly EventInput[]): (ActivityEvent | null)[] {
  return inputs.map((input) => {
    try {
      return toEvent(input);
    } catch {
      return null;
    }
  });
}

export interface SessionView {
  session: Session;
  /** Changes whenever the session does; the session itself changes in place. */
  version: number;
  /** The events decoded so far; null for those that couldn't be. */
  events: readonly (ActivityEvent | null)[];
}

interface LiveState {
  session: Session;
  inputs: EventInput[];
  decoded: (ActivityEvent | null)[];
  folds: number;
  sessionId: string;
}

function liveState(sessionId: string, folds: number): LiveState {
  return { session: newSession(sessionId), inputs: [], decoded: [], folds, sessionId };
}

/**
 * The session view of a live stream of events. Feed it the events so far;
 * when the array grows by appended events, only those are folded, and an
 * array that starts differently is folded from scratch. Events that can't
 * be decoded are counted as missed.
 */
export function useLiveSession(events: readonly EventInput[], sessionId = ""): SessionView {
  const ref = useRef<LiveState | null>(null);
  // Folding is deterministic and only ever moves forward for the same
  // events, so it is done during render and kept between renders.
  /* eslint-disable react-hooks/refs */
  let st = ref.current ?? liveState(sessionId, 0);
  const n = st.inputs.length;
  const sameStart =
    n <= events.length && (n === 0 || (events[0] === st.inputs[0] && events[n - 1] === st.inputs[n - 1]));
  if (!sameStart || st.sessionId !== sessionId) st = liveState(sessionId, st.folds + 1);
  for (let i = st.inputs.length; i < events.length; i++) {
    let ev: ActivityEvent | null;
    try {
      ev = toEvent(events[i]);
    } catch {
      ev = null;
    }
    st.inputs.push(events[i]);
    st.decoded.push(ev);
    if (ev) apply(st.session, ev);
    else skip(st.session, 1);
  }
  ref.current = st;
  return { session: st.session, version: st.folds * 1e9 + st.inputs.length, events: st.decoded };
  /* eslint-enable react-hooks/refs */
}

export interface ReplayView extends SessionView {
  playing: boolean;
  position: number;
  length: number;
  speed: number;
  /** "replay playing 2x 45%", for the status line. */
  label: string;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  seek: (position: number) => void;
  setSpeed: (speed: number) => void;
}

export interface ReplayOptions {
  sessionId?: string;
  autoPlay?: boolean;
  speed?: number;
  /** Start at this many events shown; at the end by default unless playing automatically. */
  start?: number;
  /** How often playback moves on, in milliseconds. */
  tick?: number;
}

/** Plays a fed array of events back, with play, pause, seek and speed. */
export function useReplay(events: readonly EventInput[], opts: ReplayOptions = {}): ReplayView {
  const { sessionId = "", autoPlay = false, speed = 1, tick = 100 } = opts;
  const decoded = useMemo(() => decodeEvents(events), [events]);
  const usable = useMemo(() => decoded.filter((e): e is ActivityEvent => e !== null), [decoded]);
  const [player] = useState(() => {
    const p = new Player(usable, sessionId);
    p.setSpeed(speed);
    if (autoPlay) p.play(Date.now());
    else p.seek(opts.start ?? usable.length);
    return p;
  });
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  if (player.source !== usable) player.setEvents(usable);
  const playing = player.isPlaying;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (player.advance(Date.now()) || !player.isPlaying) bump();
    }, tick);
    return () => clearInterval(id);
  }, [player, playing, tick]);

  const pct = player.length > 0 ? Math.floor((player.position * 100) / player.length) : 100;
  return {
    session: player.view,
    version: version * 1e6 + player.position,
    events: decoded,
    playing,
    position: player.position,
    length: player.length,
    speed: player.currentSpeed,
    label: `replay ${player.state} ${player.currentSpeed}x ${pct}%`,
    toggle: () => {
      player.toggle(Date.now());
      bump();
    },
    play: () => {
      player.play(Date.now());
      bump();
    },
    pause: () => {
      player.pause();
      bump();
    },
    seek: (n: number) => {
      player.seek(n);
      bump();
    },
    setSpeed: (s: number) => {
      player.setSpeed(s);
      if (player.isPlaying) player.play(Date.now());
      bump();
    },
  };
}

/** The current time in milliseconds, updated every interval while active; null when not. */
export function useNow(active: boolean, interval = 1000): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return active ? now : null;
}
