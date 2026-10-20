/** Cleans a slash-separated path like Go's path.Clean. */
export function cleanPath(p: string): string {
  if (p === "") return ".";
  const rooted = p.startsWith("/");
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!rooted) out.push("..");
      continue;
    }
    out.push(part);
  }
  const joined = out.join("/");
  if (rooted) return "/" + joined;
  return joined === "" ? "." : joined;
}

/**
 * Turns a path as tools show it, relative to workspace/, into one relative
 * to the session folder. Absolute paths are kept.
 */
export function sessionPath(p: string): string {
  if (p.startsWith("/")) return p;
  return cleanPath("workspace/" + p);
}

/** Turns a path relative to the session folder back into one relative to workspace/, as tools take it. */
export function toolPath(p: string): string {
  if (p.startsWith("/")) return p;
  if (p.startsWith("workspace/")) return p.slice("workspace/".length);
  return "../" + p;
}
