/**
 * Makes untrusted text safe to show: removes terminal escape sequences
 * (CSI, OSC, DCS and the like) and other control characters, keeping
 * newlines and tabs, and replaces lone surrogates. Carriage returns are
 * dropped, so text can't overwrite what came before it on a line.
 * Bidirectional overrides are removed too.
 *
 * It follows the Go view model's Sanitize, which works on UTF-8 bytes, so
 * both arrive at the same text.
 */
export function sanitize(s: string): string {
  let clean = true;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c < 0x20 && c !== 0x0a && c !== 0x09) || c >= 0x7f) {
      clean = false;
      break;
    }
  }
  if (clean) return s;
  let out = "";
  for (let i = 0; i < s.length;) {
    const r = s.codePointAt(i)!;
    const size = r > 0xffff ? 2 : 1;
    if (r >= 0xd800 && r <= 0xdfff) {
      out += "\ufffd"; // a lone surrogate: invalid text
      i++;
    } else if (r === 0x1b) {
      const [n, broken] = escapeLen(s, i);
      out += "\ufffd".repeat(broken);
      i += n;
    } else if (r === 0x9b) {
      i += size + csiLen(s, i + size);
    } else if (r === 0x9d || r === 0x90 || r === 0x98 || r === 0x9e || r === 0x9f) {
      i += size + stringLen(s, i + size);
    } else if (r === 0x0a || r === 0x09) {
      out += s[i];
      i += size;
    } else if (r <= 0x1f || (r >= 0x7f && r <= 0x9f)) {
      i += size; // other C0 and C1 controls, including \r
    } else if (isBidiOverride(r)) {
      i += size;
    } else {
      out += size === 2 ? s.slice(i, i + 2) : s[i];
      i += size;
    }
  }
  return out;
}

function isBidiOverride(r: number): boolean {
  return (r >= 0x202a && r <= 0x202e) || (r >= 0x2066 && r <= 0x2069);
}

/**
 * The length of the escape sequence at s[i], which is ESC, and how many
 * replacement characters it leaves behind: the Go version consumes bytes,
 * so a sequence ending in a multi-byte character leaves the rest of that
 * character's bytes as invalid text.
 */
function escapeLen(s: string, i: number): [number, number] {
  const rest = s.length - i;
  if (rest < 2) return [rest, 0];
  switch (s[i + 1]) {
    case "[":
      return [2 + csiLen(s, i + 2), 0];
    case "]":
    case "P":
    case "X":
    case "^":
    case "_":
      return [2 + stringLen(s, i + 2), 0];
  }
  // Two-character sequences, and ones with intermediate bytes.
  let n = 1;
  while (n < rest && s.charCodeAt(i + n) >= 0x20 && s.charCodeAt(i + n) <= 0x2f) n++;
  if (n < rest) {
    const r = s.codePointAt(i + n)!;
    if (r >= 0xd800 && r <= 0xdfff) return [n + 1, 0];
    const bytes = utf8Len(r);
    return [n + (r > 0xffff ? 2 : 1), bytes - 1];
  }
  return [n, 0];
}

function utf8Len(r: number): number {
  if (r < 0x80) return 1;
  if (r < 0x800) return 2;
  if (r < 0x10000) return 3;
  return 4;
}

/** The length of a CSI sequence's parameters and final byte at s[i]. */
function csiLen(s: string, i: number): number {
  for (let j = i; j < s.length; j++) {
    const c = s.charCodeAt(j);
    if (c >= 0x40 && c <= 0x7e) return j - i + 1;
    if (c < 0x20) return j - i; // malformed: stop here
  }
  return s.length - i;
}

/** The length of a control string at s[i] up to and including its terminator: BEL, ESC \ or ST. */
function stringLen(s: string, i: number): number {
  for (let j = i; j < s.length; j++) {
    const c = s.charCodeAt(j);
    if (c === 0x07 || c === 0x9c) return j - i + 1;
    if (c === 0x1b && s[j + 1] === "\\") return j - i + 2;
  }
  return s.length - i;
}
