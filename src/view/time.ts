import type { Duration, Timestamp } from "@bufbuild/protobuf/wkt";

/** A point in time: RFC 3339 text with nanoseconds, as Go writes it, and milliseconds since the Unix epoch. */
export interface Instant {
  time: string;
  at: number;
}

/** The Unix epoch: what an event without a time is placed at, as in the Go view model. */
export const EPOCH: Instant = { time: "1970-01-01T00:00:00Z", at: 0 };

/** Converts a Timestamp; a missing one is the Unix epoch. */
export function instant(ts: Timestamp | undefined): Instant {
  if (!ts) return EPOCH;
  const seconds = Number(ts.seconds);
  return { time: rfc3339(seconds, ts.nanos), at: seconds * 1000 + Math.floor(ts.nanos / 1e6) };
}

/** Formats a time like Go's time.RFC3339Nano in UTC: the fraction without trailing zeros. */
export function rfc3339(seconds: number, nanos: number): string {
  const d = new Date(seconds * 1000);
  const base = d.toISOString().slice(0, 19);
  if (!nanos) return base + "Z";
  const frac = String(nanos).padStart(9, "0").replace(/0+$/, "");
  return `${base}.${frac}Z`;
}

/** Converts a Duration to nanoseconds; a missing one is zero. */
export function nanos(d: Duration | undefined): number {
  if (!d) return 0;
  return Number(d.seconds) * 1e9 + d.nanos;
}

/** A clock time, HH:MM:SS in UTC, or "" for the epoch or a time before it. */
export function clock(at: number): string {
  if (at < 1000) return "";
  return new Date(at).toISOString().slice(11, 19);
}
