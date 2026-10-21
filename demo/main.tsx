import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { parse } from "yaml";
import { ActivityViewer, type TabId, type ThemeFile, type ViewerTheme } from "../src";
// Apps import "@actlet/viewer/styles.css".
import "../src/styles.css";
import { SyntheticDemo } from "./bench";
import { JsonlExample } from "./examples/JsonlExample";
import { SseExample } from "./examples/SseExample";
import { ThemedExample } from "./examples/ThemedExample";
import { WebSocketExample } from "./examples/WebSocketExample";
import { digestRecording, forkRecording, recording, standardRecording } from "./recording";
import { SimulatedLive } from "./SimulatedLive";
import ocean from "./themes/ocean.yaml?raw";

const modes = {
  replay: "replay the recording",
  standard: "replay: every standard tool and a budget",
  digest: "replay: a skill and a compaction",
  fork: "replay: a session forked from a checkpoint",
  live: "live: the recording fed in over time",
  websocket: "example: a WebSocket backend",
  sse: "example: server-sent events",
  jsonl: "example: a JSONL file",
  themed: "example: a theme file",
  synthetic: "a synthetic 20,000-event session",
} as const;
type Mode = keyof typeof modes;
const themes = ["auto", "dark", "light", "plain", "ocean"] as const;
type Theme = (typeof themes)[number];
/** ocean is a theme file, demo/themes/ocean.yaml; the others are built in. */
const oceanTheme = parse(ocean) as ThemeFile;

function Demo() {
  const params = new URLSearchParams(location.search);
  const [mode, setMode] = useState<Mode>(() => {
    const m = params.get("mode");
    return m !== null && m in modes ? (m as Mode) : "replay";
  });
  const [choice, setChoice] = useState<Theme>(() => {
    const t = params.get("theme") as Theme | null;
    return t !== null && themes.includes(t) ? t : "auto";
  });
  const theme: ViewerTheme = choice === "ocean" ? oceanTheme : choice;
  const speed = Number(params.get("speed") ?? 4);
  // ?at=<events shown> and ?tab=<view> open a replay at a given point, for screenshots.
  const at = params.get("at") === null ? undefined : Number(params.get("at"));
  const tab = (params.get("tab") ?? undefined) as TabId | undefined;
  const choose = (m: Mode) => {
    setMode(m);
    const url = new URL(location.href);
    url.searchParams.set("mode", m);
    history.replaceState(null, "", url);
  };
  let body;
  switch (mode) {
    case "replay":
      body = (
        <ActivityViewer
          events={recording}
          mode="replay"
          autoPlay={params.get("autoplay") !== "0"}
          speed={speed}
          theme={theme}
          sessionId="demo"
          startAt={at}
          defaultTab={tab}
        />
      );
      break;
    case "standard":
      body = (
        <ActivityViewer
          events={standardRecording}
          mode="replay"
          autoPlay={params.get("autoplay") !== "0"}
          speed={speed}
          theme={theme}
          sessionId="release"
          startAt={at}
          defaultTab={tab}
        />
      );
      break;
    case "digest":
      body = (
        <ActivityViewer
          events={digestRecording}
          mode="replay"
          autoPlay={params.get("autoplay") !== "0"}
          speed={speed}
          theme={theme}
          sessionId="digest"
          startAt={at}
          defaultTab={tab}
        />
      );
      break;
    case "fork":
      body = (
        <ActivityViewer
          events={forkRecording}
          mode="replay"
          autoPlay={params.get("autoplay") !== "0"}
          speed={speed}
          theme={theme}
          sessionId="digest-fork"
          startAt={at}
          defaultTab={tab}
        />
      );
      break;
    case "live":
      body = <SimulatedLive theme={theme} speed={speed} />;
      break;
    case "websocket":
      body = <WebSocketExample theme={theme} />;
      break;
    case "sse":
      body = <SseExample theme={theme} />;
      break;
    case "jsonl":
      body = <JsonlExample theme={theme} />;
      break;
    case "themed":
      body = <ThemedExample />;
      break;
    case "synthetic":
      body = <SyntheticDemo bench={params.get("bench") === "1"} theme={theme} />;
      break;
  }
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="demo-bar" style={bar}>
        <strong>@actlet/viewer demo</strong>
        <label>
          {"mode "}
          <select value={mode} onChange={(e) => choose(e.target.value as Mode)}>
            {Object.entries(modes).map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {"theme "}
          <select value={choice} onChange={(e) => setChoice(e.target.value as Theme)}>
            {themes.map((t) => (
              <option key={t} value={t}>
                {t === "ocean" ? "ocean (a theme file)" : t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <main style={{ flex: 1, minHeight: 0 }} key={mode}>
        {body}
      </main>
    </div>
  );
}

const bar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4em 1.5em",
  alignItems: "center",
  padding: "0.5em 1em",
  color: "#c9ccd6",
  background: "#0b0c10",
  fontSize: 13,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
