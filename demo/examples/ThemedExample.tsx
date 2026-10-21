/**
 * Styling the viewer with a theme file in the format of Actlet's terminal
 * viewer, so one file styles both. The app reads the file and parses its
 * YAML (or JSON); the viewer checks the theme, takes what it leaves out
 * from its base, and says in the status line why it stays dark if the
 * theme isn't valid. Edit the theme here to try it.
 */
import { useState } from "react";
import { parse } from "yaml";
import { ActivityViewer, type ThemeFile } from "../../src";
import { standardRecording } from "../recording";
// An app would fetch the file, or read it from disk on the server.
import ocean from "../themes/ocean.yaml?raw";

export function ThemedExample() {
  const [text, setText] = useState(ocean);
  // YAML that doesn't parse leaves the last theme that did.
  const [last, setLast] = useState<ThemeFile>(() => parse(ocean) as ThemeFile);
  const [error, setError] = useState("");
  const edit = (t: string) => {
    setText(t);
    try {
      setLast(parse(t) as ThemeFile);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  };
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 300, display: "flex", flexDirection: "column", background: "#0b0c10", color: "#c9ccd6" }}>
        <label htmlFor="theme-file" style={{ padding: "0.5em 0.8em", fontSize: 13 }}>
          ocean.yaml
        </label>
        <textarea
          id="theme-file"
          value={text}
          spellCheck={false}
          onChange={(e) => edit(e.target.value)}
          style={{
            flex: 1,
            font: "12px ui-monospace, monospace",
            background: "#11131a",
            color: "#d8dbe2",
            border: 0,
            padding: "0.8em",
          }}
        />
        {error !== "" && (
          <div role="alert" style={{ padding: "0.5em 0.8em", color: "#f37184", fontSize: 12 }}>
            {`YAML: ${error}`}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ActivityViewer events={standardRecording} mode="replay" theme={last} sessionId="release" />
      </div>
    </div>
  );
}
