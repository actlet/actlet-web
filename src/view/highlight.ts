/**
 * Cheap syntax highlighting by a file's kind: comments, strings, keywords,
 * Markdown headings and a CSV header. It returns spans of text with a
 * kind, never markup.
 */

export type SpanKind = "plain" | "keyword" | "string" | "comment" | "heading";

export interface Span {
  text: string;
  kind: SpanKind;
}

function words(s: string): string[] {
  return s.split(" ");
}

const keywords: Record<string, string[]> = {
  ".py": words(
    "def class import from return for in if elif else while with as try except raise None True False and or not lambda yield pass",
  ),
  ".go": words(
    "package import func return for range if else var const type struct interface go defer switch case nil true false map chan",
  ),
  ".sh": words("if then else fi for do done while case esac echo export function in"),
  ".js": words(
    "function const let var return if else for while import export from class new null true false async await",
  ),
  ".ts": words(
    "function const let var return if else for while import export from class new null true false async await interface type",
  ),
  ".yaml": words("true false null"),
};

const reString = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const reWord = /\b[A-Za-z_]+\b/g;

function ext(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const i = base.lastIndexOf(".");
  const e = i > 0 ? base.slice(i).toLowerCase() : "";
  return e === ".yml" ? ".yaml" : e;
}

/** Splits line n (from 0) of a file into highlighted spans. */
export function highlight(path: string, line: string, n: number): Span[] {
  const e = ext(path);
  if (e === ".md") return [{ text: line, kind: line.startsWith("#") ? "heading" : "plain" }];
  if (e === ".csv" || e === ".tsv") return [{ text: line, kind: n === 0 ? "heading" : "plain" }];
  let comment = "";
  if ([".py", ".sh", ".yaml", ".toml"].includes(e)) comment = "#";
  else if ([".go", ".js", ".ts", ".java", ".c", ".rs"].includes(e)) comment = "//";
  if (comment !== "") {
    const i = commentStart(line, comment);
    if (i >= 0) return [...code(line.slice(0, i), e), { text: line.slice(i), kind: "comment" }];
  }
  if (keywords[e] || e === ".json") return code(line, e);
  return [{ text: line, kind: "plain" }];
}

/** Where a comment starts, outside strings; -1 if there is none. */
function commentStart(line: string, mark: string): number {
  const strings = [...line.matchAll(reString)].map((m) => [m.index, m.index + m[0].length]);
  for (let i = line.indexOf(mark); i >= 0; i = line.indexOf(mark, i + 1)) {
    if (!strings.some(([a, b]) => i >= a && i < b)) return i;
  }
  return -1;
}

function code(line: string, e: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of line.matchAll(reString)) {
    out.push(...keywordSpans(line.slice(last, m.index), keywords[e]));
    out.push({ text: m[0], kind: "string" });
    last = m.index + m[0].length;
  }
  out.push(...keywordSpans(line.slice(last), keywords[e]));
  return out.filter((s) => s.text !== "");
}

function keywordSpans(s: string, kw: string[] | undefined): Span[] {
  if (!kw) return [{ text: s, kind: "plain" }];
  const out: Span[] = [];
  let last = 0;
  for (const m of s.matchAll(reWord)) {
    if (!kw.includes(m[0])) continue;
    out.push({ text: s.slice(last, m.index), kind: "plain" }, { text: m[0], kind: "keyword" });
    last = m.index + m[0].length;
  }
  out.push({ text: s.slice(last), kind: "plain" });
  return out;
}
