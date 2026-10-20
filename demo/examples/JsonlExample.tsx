/**
 * Replaying a JSONL file, as `actlet-cli replay export --jsonl` writes it:
 * fetched from the backend (here, the mock server's copy of the demo
 * recording), or picked by the reader. The file is decoded with
 * parseJsonl; the viewer never reads files or .actrec recordings itself.
 */
import { useEffect, useState } from "react";
import { ActivityViewer, parseJsonl, type ActivityEvent } from "../../src";

export function JsonlExample({ theme }: { theme: "auto" | "dark" | "light" }) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [source, setSource] = useState("/mock/demo.jsonl");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/mock/demo.jsonl")
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status}`))))
      .then((text) => live && setEvents(parseJsonl(text)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const onFile = async (file: File) => {
    try {
      setEvents(parseJsonl(await file.text()));
      setSource(file.name);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "0.4em 1em", fontSize: 13, color: "#c9ccd6", background: "#14161b" }}>
        <label>
          {`Replaying ${source}. Open another recording: `}
          <input
            type="file"
            accept=".jsonl,.ndjson,application/x-ndjson"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        {error && <span style={{ color: "#e06c75" }}>{` can't read it: ${error}`}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {events && <ActivityViewer key={source} events={events} mode="replay" autoPlay speed={8} theme={theme} />}
      </div>
    </div>
  );
}
