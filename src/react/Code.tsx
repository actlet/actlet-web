import { useMemo } from "react";
import { clip, splitCuts } from "../view/format";
import { dataLanguage, highlightData, type DataLanguage, type Span } from "../view/highlight";
import { sanitize } from "../view/sanitize";
import { MAX_TEXT } from "./Text";

/**
 * Untrusted JSON or YAML, highlighted. Like Text it shows text only:
 * escape sequences removed, cut to a length, and Actlet's own truncation
 * marks shown as such. Text in neither language shows plain.
 */
export function Code({ text, max = MAX_TEXT, language }: { text: string; max?: number; language?: DataLanguage }) {
  const { parts, omitted } = useMemo(() => {
    const { text: shown, omitted } = clip(sanitize(text), max);
    const lang = language ?? dataLanguage(shown);
    const parts = splitCuts(shown).map((p) => ({
      ...p,
      lines: p.cut || !lang ? null : highlightData(p.text.split("\n"), lang),
    }));
    return { parts, omitted };
  }, [text, max, language]);
  return (
    <>
      {parts.map((p, i) =>
        p.cut ? (
          <span key={i} className="actlet-cut" title="Actlet cut this content short">
            {p.text}
          </span>
        ) : p.lines ? (
          <Lines key={i} lines={p.lines} />
        ) : (
          p.text
        ),
      )}
      {omitted > 0 && (
        <span className="actlet-cut" title="Cut short by the viewer">
          {`… ${omitted.toLocaleString("en")} more characters`}
        </span>
      )}
    </>
  );
}

function Lines({ lines }: { lines: Span[][] }) {
  return lines.map((spans, i) => (
    <span key={i}>
      {i > 0 && "\n"}
      <Spans spans={spans} />
    </span>
  ));
}

/** Highlighted spans as text, each kind in its colour. */
export function Spans({ spans }: { spans: readonly Span[] }) {
  return spans.map((s, i) =>
    s.kind === "plain" ? (
      s.text
    ) : (
      <span key={i} className={`actlet-hl-${s.kind}`}>
        {s.text}
      </span>
    ),
  );
}
