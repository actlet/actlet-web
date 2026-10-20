/** One place where two JSON values differ. */
export interface Difference {
  /** Where, such as workers[0].items[3].turn.calls[1].status. */
  path: string;
  /** The value on each side; undefined where a side has nothing. */
  left: unknown;
  right: unknown;
}

export interface DiffOptions {
  /** Treat null, an empty array and an empty object as the same, as Go writes nil slices and maps as null. */
  loose?: boolean;
  /** Numbers that aren't integers may differ by this much. */
  epsilon?: number;
}

/** Lists where two JSON values differ, in document order. */
export function diffJson(left: unknown, right: unknown, opts: DiffOptions = {}, path = ""): Difference[] {
  const { loose = false, epsilon = 1e-9 } = opts;
  if (loose && isEmpty(left) && isEmpty(right)) return [];
  if (typeof left === "number" && typeof right === "number") {
    if (left === right || (!Number.isInteger(left) && Math.abs(left - right) <= epsilon)) return [];
    return [{ path, left, right }];
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const out: Difference[] = [];
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      out.push(...diffJson(left[i], right[i], opts, `${path}[${i}]`));
    }
    return out;
  }
  if (isObject(left) && isObject(right)) {
    const out: Difference[] = [];
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
    for (const k of keys) {
      const l = left[k],
        r = right[k];
      if (loose && (l === undefined || r === undefined) && isEmpty(l ?? r)) continue;
      out.push(...diffJson(l, r, opts, path === "" ? k : `${path}.${k}`));
    }
    return out;
  }
  return Object.is(left, right) ? [] : [{ path, left, right }];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isEmpty(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    (Array.isArray(v) && v.length === 0) ||
    (isObject(v) && Object.keys(v).length === 0)
  );
}

/** A difference in a line: the path and both values, long ones shortened. */
export function describeDifference(d: Difference, names: [string, string] = ["ts", "go"]): string {
  const show = (v: unknown) => {
    if (v === undefined) return "(missing)";
    const s = JSON.stringify(v);
    return s.length > 120 ? s.slice(0, 117) + "…" : s;
  };
  return `${d.path || "(root)"}: ${names[0]} ${show(d.left)} ≠ ${names[1]} ${show(d.right)}`;
}
