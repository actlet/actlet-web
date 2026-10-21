/**
 * Cheap syntax highlighting: JSON and YAML token by token, and other
 * files by their kind (comments, strings, numbers, keywords, function
 * names, Markdown headings and a CSV header). It returns spans of text
 * with a kind, never markup.
 */

export type SpanKind =
  "plain" | "keyword" | "string" | "number" | "comment" | "key" | "function" | "punctuation" | "heading";

export interface Span {
  text: string;
  kind: SpanKind;
}

/** The data languages highlighted token by token. */
export type DataLanguage = "json" | "yaml";

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
};

const reString = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const reWord = /\b(?:[A-Za-z_]\w*(?=\s*\()|[A-Za-z_]+|\d+(?:\.\d+)?)\b/g;

function ext(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const i = base.lastIndexOf(".");
  const e = i > 0 ? base.slice(i).toLowerCase() : "";
  return e === ".yml" ? ".yaml" : e;
}

/** Splits a file's lines into highlighted spans, a list for each line. */
export function highlightFile(path: string, lines: readonly string[]): Span[][] {
  const e = ext(path);
  if (e === ".json") return highlightData(lines, "json");
  if (e === ".yaml") return highlightData(lines, "yaml");
  return lines.map((l, n) => highlightLine(e, l, n));
}

function highlightLine(e: string, line: string, n: number): Span[] {
  if (e === ".md") return [{ text: line, kind: line.startsWith("#") ? "heading" : "plain" }];
  if (e === ".csv" || e === ".tsv") return [{ text: line, kind: n === 0 ? "heading" : "plain" }];
  let comment = "";
  if ([".py", ".sh", ".toml"].includes(e)) comment = "#";
  else if ([".go", ".js", ".ts", ".java", ".c", ".rs"].includes(e)) comment = "//";
  if (comment !== "") {
    const i = commentStart(line, comment);
    if (i >= 0) return [...code(line.slice(0, i), e), { text: line.slice(i), kind: "comment" }];
  }
  if (keywords[e]) return code(line, e);
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
    out.push(...wordSpans(line.slice(last, m.index), keywords[e]));
    out.push({ text: m[0], kind: "string" });
    last = m.index + m[0].length;
  }
  out.push(...wordSpans(line.slice(last), keywords[e]));
  return out.filter((s) => s.text !== "");
}

function wordSpans(s: string, kw: string[]): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of s.matchAll(reWord)) {
    const w = m[0];
    const kind: SpanKind = kw.includes(w)
      ? "keyword"
      : /^\d/.test(w)
        ? "number"
        : s
              .slice(m.index + w.length)
              .trimStart()
              .startsWith("(")
          ? "function"
          : "plain";
    if (kind === "plain") continue;
    out.push({ text: s.slice(last, m.index), kind: "plain" }, { text: w, kind });
    last = m.index + w.length;
  }
  out.push({ text: s.slice(last), kind: "plain" });
  return out;
}

/**
 * Which data language a text is in: JSON if it starts with a brace or a
 * bracket, YAML if a line looks like a key or a list item, else none.
 */
export function dataLanguage(text: string): DataLanguage | null {
  const t = text.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (/^(?:---\s*$|\s*(?:- |[\w"'.-][^:\n]*:(?:\s|$)))/m.test(t)) return "yaml";
  return null;
}

/** Splits JSON or YAML lines into highlighted spans, a list for each line. */
export function highlightData(lines: readonly string[], lang: DataLanguage): Span[][] {
  if (lang === "json") return lines.map((l) => flow(l));
  const out: Span[][] = [];
  // A block scalar (key: |) runs over the lines indented deeper than its key.
  let block = -1;
  for (const l of lines) {
    const indent = l.length - l.trimStart().length;
    if (block >= 0 && (l.trim() === "" || indent > block)) {
      out.push([{ text: l, kind: "string" }]);
      continue;
    }
    block = -1;
    const spans = yamlLine(l);
    if (/[|>][+-]?\s*$/.test(withoutComment(l)) && spans.some((s) => s.kind === "key" || s.text.trim() === "-")) {
      block = indent;
    }
    out.push(spans);
  }
  return out;
}

const reFlow = /("(?:[^"\\]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b|([{}[\],:])/g;

/** JSON, or YAML's flow style: strings (keys before a colon), numbers, literals and punctuation. */
function flow(line: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  const plain = (end: number) => {
    if (end > last) out.push({ text: line.slice(last, end), kind: "plain" });
  };
  for (const m of line.matchAll(reFlow)) {
    plain(m.index);
    if (m[1] !== undefined) {
      out.push({ text: m[1], kind: m[2] ? "key" : "string" });
      if (m[2]) out.push({ text: m[2], kind: "punctuation" });
    } else if (m[3] !== undefined) out.push({ text: m[3], kind: "number" });
    else if (m[4] !== undefined) out.push({ text: m[4], kind: "keyword" });
    else out.push({ text: m[5], kind: "punctuation" });
    last = m.index + m[0].length;
  }
  plain(line.length);
  return out;
}

/** The line up to a comment: a # at its start or after a space, outside quotes. */
function withoutComment(line: string): string {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote !== "") {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

const reYamlKey = /^(\s*)((?:-\s+)*)("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|(?!-\s)[^\s#'"{[][^#]*?)(\s*:)(?=\s|$)/;
const reYamlItem = /^(\s*)((?:-\s+)+|-$)/;

function yamlLine(line: string): Span[] {
  const body = withoutComment(line);
  const comment = line.slice(body.length);
  const out: Span[] = [];
  let rest = body;
  if (/^(?:---|\.\.\.)\s*$/.test(rest)) {
    out.push({ text: rest, kind: "punctuation" });
    rest = "";
  }
  const k = reYamlKey.exec(rest);
  if (k) {
    out.push({ text: k[1], kind: "plain" });
    if (k[2]) out.push({ text: k[2], kind: "punctuation" });
    out.push({ text: k[3], kind: "key" }, { text: k[4], kind: "punctuation" });
    rest = rest.slice(k[0].length);
  } else {
    const it = reYamlItem.exec(rest);
    if (it) {
      out.push({ text: it[1], kind: "plain" }, { text: it[2], kind: "punctuation" });
      rest = rest.slice(it[0].length);
    }
  }
  out.push(...yamlValue(rest));
  if (comment !== "") out.push({ text: comment, kind: "comment" });
  return out.filter((s) => s.text !== "");
}

function yamlValue(s: string): Span[] {
  const v = s.trim();
  if (v === "") return [{ text: s, kind: "plain" }];
  const lead = s.slice(0, s.length - s.trimStart().length);
  const trail = s.slice(s.trimEnd().length);
  let kind: SpanKind = "string";
  if (v.startsWith("{") || v.startsWith("[")) return [{ text: lead, kind: "plain" }, ...flow(s.trimStart())];
  if (/^[|>][+-]?$/.test(v) || /^[&*!]\S*$/.test(v)) kind = "punctuation";
  else if (/^(?:true|false|null|~|yes|no|on|off)$/i.test(v)) kind = "keyword";
  else if (/^[-+]?(?:\d[\d_]*(?:\.\d*)?(?:[eE][-+]?\d+)?|0x[\da-fA-F]+|\.inf|\.nan)$/i.test(v)) kind = "number";
  return [
    { text: lead, kind: "plain" },
    { text: v, kind },
    { text: trail, kind: "plain" },
  ];
}
