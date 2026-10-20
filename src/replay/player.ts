/**
 * Plays a fed array of events back: folds them into a view up to a
 * position, and moves the position on with the events' own timing at a
 * chosen speed. Time is passed in, so the player is deterministic.
 */
import type { ActivityEvent } from "../gen/actlet/gateway/v0/gateway_pb";
import { apply, newSession, type Session } from "../view/session";
import { instant } from "../view/time";

/** The longest pause a replay shows between events, in milliseconds; longer ones are cut short. */
export const MAX_IDLE = 2000;

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 64;

export type PlayerState = "playing" | "paused" | "at the end";

export class Player {
  private events: readonly ActivityEvent[] = [];
  private times: number[] = [];
  private pos = 0;
  private sess: Session;
  private playing = false;
  private speed = 1;
  /** Wall time of the last advance, and the recording time reached, in milliseconds. */
  private clock = 0;
  private cursor: number | null = null;

  constructor(
    events: readonly ActivityEvent[] = [],
    private readonly sessionId = "",
  ) {
    this.sess = newSession(sessionId);
    this.setEvents(events);
  }

  /**
   * Replaces the events. When the new array starts with the events shown,
   * the position is kept (the recording grew); otherwise playback starts
   * over.
   */
  setEvents(events: readonly ActivityEvent[]) {
    const keep = this.pos <= events.length && this.events.slice(0, this.pos).every((ev, i) => events[i] === ev);
    this.events = events;
    this.times = events.map((ev) => instant(ev.time).at);
    if (!keep) {
      this.sess = newSession(this.sessionId);
      this.pos = 0;
      this.cursor = null;
    }
  }

  /** The events being played. */
  get source(): readonly ActivityEvent[] {
    return this.events;
  }

  /** The number of events. */
  get length(): number {
    return this.events.length;
  }

  /** The number of events shown. */
  get position(): number {
    return this.pos;
  }

  /** The view at the position. It changes in place as the position moves on. */
  get view(): Session {
    return this.sess;
  }

  get currentSpeed(): number {
    return this.speed;
  }

  get state(): PlayerState {
    if (this.pos >= this.events.length) return "at the end";
    return this.playing ? "playing" : "paused";
  }

  get isPlaying(): boolean {
    return this.playing && this.pos < this.events.length;
  }

  /** Shows the first n events; playing goes on from there. */
  seek(n: number) {
    this.foldTo(n);
    this.cursor = this.pos > 0 ? this.times[this.pos - 1] : null;
  }

  private foldTo(n: number) {
    n = Math.max(0, Math.min(n, this.events.length));
    if (n < this.pos) {
      this.sess = newSession(this.sessionId);
      this.pos = 0;
    }
    for (; this.pos < n; this.pos++) apply(this.sess, this.events[this.pos]);
  }

  /** Starts playing; from the start again when at the end. */
  play(now: number) {
    if (this.pos >= this.events.length) this.seek(0);
    this.playing = true;
    this.clock = now;
    if (this.pos < this.events.length && this.cursor === null) this.cursor = this.times[this.pos];
  }

  pause() {
    this.playing = false;
  }

  /** Pauses or resumes playing. */
  toggle(now: number) {
    if (this.isPlaying) this.pause();
    else this.play(now);
  }

  /** Sets the speed, within MIN_SPEED and MAX_SPEED. */
  setSpeed(speed: number) {
    this.speed = Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED);
  }

  /** Doubles the speed. */
  faster() {
    this.setSpeed(this.speed * 2);
  }

  /** Halves the speed. */
  slower() {
    this.setSpeed(this.speed / 2);
  }

  /** Moves playback on to now, and reports whether the view changed. */
  advance(now: number): boolean {
    if (!this.playing || this.cursor === null) return false;
    const before = this.pos;
    this.cursor += (now - this.clock) * this.speed;
    this.clock = now;
    if (this.pos < this.events.length) {
      // Skip long idle stretches.
      const next = this.times[this.pos];
      if (next - this.cursor > MAX_IDLE) this.cursor = next - MAX_IDLE / 4;
    }
    let n = this.pos;
    while (n < this.events.length && this.times[n] <= this.cursor) n++;
    // The cursor keeps its place between events, so short gaps pass too.
    this.foldTo(n);
    if (this.pos >= this.events.length) this.playing = false;
    return this.pos !== before;
  }
}
