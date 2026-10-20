import { clip, splitCuts } from "../view/format";
import { sanitize } from "../view/sanitize";

/** The most characters one piece of text shows; longer text is cut, saying so. */
export const MAX_TEXT = 20_000;

/**
 * Untrusted text, shown as text only: escape sequences removed, cut to a
 * length, and Actlet's own truncation marks shown as such.
 */
export function Text({ text, max = MAX_TEXT }: { text: string; max?: number }) {
  const { text: shown, omitted } = clip(sanitize(text), max);
  return (
    <>
      {splitCuts(shown).map((p, i) =>
        p.cut ? (
          <span key={i} className="actlet-cut" title="Actlet cut this content short">
            {p.text}
          </span>
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
