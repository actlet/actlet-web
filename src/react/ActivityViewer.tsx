import { useCallback, useId, useMemo, useState, type CSSProperties } from "react";
import type { EventInput } from "../events";
import { SessionState, type CommandAck, type Origin } from "../gen/actlet/gateway/v0/gateway_pb";
import type { Session } from "../view/session";
import { CommandBar, type CommandHandler } from "./CommandBar";
import { commandOutcomes, DEFAULT_COMMANDS, type CommandKind, type CommandOutcome } from "../commands";
import { FileViewer, type FileReader } from "./FileViewer";
import { useLiveSession, useNow, useReplay, type ReplayOptions } from "./hooks";
import { EventsPanel, ProfilePanel, SessionPanel, TaskPanel, ToolsPanel } from "./Panels";
import { ReplayControls } from "./ReplayControls";
import { Sidebar } from "./Sidebar";
import { StateAnnouncer, StatusLine } from "./StatusLine";
import { budgetDefinitions, budgets } from "../view/budgets";
import { lineageText } from "../view/format";
import { sanitize } from "../view/sanitize";
import { themeLook, type ViewerTheme } from "../view/theme";
import { Tabs, type TabId } from "./Tabs";
import { Text } from "./Text";
import { TurnStream } from "./TurnStream";

export interface ActivityViewerProps {
  /**
   * The session's activity events, oldest first, as messages or as their
   * Protobuf JSON. In live mode, append new events to show them; in replay
   * mode, pass the whole recording.
   */
  events: readonly EventInput[];
  /** "live" follows events as they are appended; "replay" plays a recording back. Live by default. */
  mode?: "live" | "replay";
  /** The session's ID, which the events don't carry, for the Session tab. */
  sessionId?: string;
  /**
   * The look: "auto" (the default) follows the reader's system setting,
   * dark or light, and plain when they ask for more contrast; or a
   * built-in theme, "dark", "light" or "plain"; or a theme in the format
   * of Actlet's terminal viewer, as parsed from its YAML or JSON. A theme
   * that isn't valid leaves the viewer dark, and the status line says why.
   */
  theme?: ViewerTheme;
  /** What the viewer is connected to, in a few words, for the status line: "live" by default. */
  connectionLabel?: string;
  /** Live mode: the implementor's stream has ended, so no more events will come. */
  ended?: boolean;

  /** Live mode: delivers commands the operator sends. Without it, the viewer only watches. */
  onCommand?: CommandHandler;
  /** The commands offered: steer notes only by default; add "pause", "stop" or "profile_update" (raising a budget). */
  allowedCommands?: readonly CommandKind[];
  /** Acknowledgements of sent commands the implementor received, if any; command events count too. */
  acks?: readonly CommandAck[];
  /** The origin and actor set on sent commands; the origin is remote by default. */
  commandOrigin?: Origin;
  actor?: string;

  /** Reads files of the session for the file viewer; without it, the viewer shows what the events hold of them. */
  readFile?: FileReader;

  /** Replay mode: start playing at once, at this speed. */
  autoPlay?: boolean;
  speed?: number;
  /** Replay mode: how many events to show at first; all of them by default, or none when playing at once. */
  startAt?: number;

  /** The tab shown first. */
  defaultTab?: TabId;
  /** Draw a line between turns and between tool calls; on by default, and the reader can turn it off. */
  separators?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A session's activity, shown like the terminal viewer: the conversation, a status line, a sidebar of workers and files, and tabs. */
export function ActivityViewer(props: ActivityViewerProps) {
  return props.mode === "replay" ? <ReplayViewer {...props} /> : <LiveViewer {...props} />;
}

function LiveViewer(props: ActivityViewerProps) {
  const { session, version, commands } = useLiveSession(props.events, props.sessionId);
  const ended = props.ended ?? false;
  const running = !ended && (session.state === SessionState.RUNNING || session.state === SessionState.UNSPECIFIED);
  const now = useNow(running);
  let connection = props.connectionLabel ?? "live";
  if (ended) connection += ", run ended";
  return (
    <Layout {...props} session={session} version={version} commands={commands} now={now} connection={connection} live />
  );
}

function ReplayViewer(props: ActivityViewerProps) {
  const opts: ReplayOptions = {
    sessionId: props.sessionId,
    autoPlay: props.autoPlay,
    speed: props.speed,
    start: props.startAt,
  };
  const r = useReplay(props.events, opts);
  return (
    <Layout
      {...props}
      session={r.session}
      version={r.version}
      commands={r.commands}
      now={null}
      connection={r.label}
      live={false}
      shortcuts={(key) => {
        // Space or k plays and pauses, arrows step (ten with Shift), + and - change the speed.
        const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, "<": -10, ">": 10 };
        if (key === " " || key === "k") r.toggle();
        else if (key in steps) r.seek(r.position + steps[key]);
        else if (key === "+" || key === "=") r.setSpeed(r.speed * 2);
        else if (key === "-") r.setSpeed(r.speed / 2);
        else return false;
        return true;
      }}
      controls={
        <ReplayControls
          playing={r.playing}
          position={r.position}
          length={r.length}
          speed={r.speed}
          onToggle={r.toggle}
          onSeek={r.seek}
          onSpeed={r.setSpeed}
        />
      }
    />
  );
}

interface LayoutProps extends Omit<ActivityViewerProps, "events"> {
  session: Session;
  version: number;
  commands: ReadonlyMap<string, CommandOutcome>;
  now: number | null;
  connection: string;
  live: boolean;
  controls?: React.ReactNode;
  /** Handles a key pressed outside any control; reports whether it did. */
  shortcuts?: (key: string) => boolean;
}

const terminal = [SessionState.PAUSED, SessionState.STOPPED, SessionState.COMPLETED, SessionState.FAILED];

function Layout(p: LayoutProps) {
  const { session, version, now, connection } = p;
  const id = useId();
  const [tab, setTab] = useState<TabId>(p.defaultTab ?? "chat");
  const [focus, setFocus] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [separators, setSeparators] = useState(p.separators ?? true);
  const [collapseSubs, setCollapseSubs] = useState(false);
  const closeFile = useCallback(() => setFile(null), []);
  // Few commands are sent, so merging the acknowledgements each render is cheap.
  const outcomes = commandOutcomes([], p.acks, p.commands);
  const look = useMemo(() => themeLook(p.theme), [p.theme]);
  const ended = (p.ended ?? false) || terminal.includes(session.state);
  const commands = p.live && p.onCommand && (p.allowedCommands ?? DEFAULT_COMMANDS).length > 0;

  let body: React.ReactNode;
  switch (tab) {
    case "chat":
      body = (
        <div className="actlet-chat">
          <div className="actlet-chat-main">
            <div className="actlet-toolbar">
              {focus !== "" && (
                <span className="actlet-focus">
                  {`showing ${focus} only · `}
                  <button type="button" className="actlet-link" onClick={() => setFocus("")}>
                    show all
                  </button>
                </span>
              )}
              <label>
                <input type="checkbox" checked={expandAll} onChange={(e) => setExpandAll(e.target.checked)} /> expand
                all
              </label>
              <label>
                <input type="checkbox" checked={separators} onChange={(e) => setSeparators(e.target.checked)} />{" "}
                separators
              </label>
              <label>
                <input type="checkbox" checked={collapseSubs} onChange={(e) => setCollapseSubs(e.target.checked)} />{" "}
                collapse subagents
              </label>
            </div>
            <TurnStream
              session={session}
              version={version}
              worker={focus}
              expandAll={expandAll}
              separators={separators}
              collapseSubagents={collapseSubs}
              onFocusWorker={setFocus}
            />
          </div>
          <Sidebar session={session} focus={focus} onFocus={setFocus} onOpenFile={setFile} />
        </div>
      );
      break;
    case "session":
      body = <SessionPanel session={session} now={now} connection={connection} />;
      break;
    case "task":
      body = <TaskPanel session={session} />;
      break;
    case "profile":
      body = <ProfilePanel session={session} now={now} />;
      break;
    case "tools":
      body = <ToolsPanel session={session} />;
      break;
    case "events":
      body = <EventsPanel session={session} />;
      break;
  }

  return (
    <div
      className={`actlet-viewer${p.className ? " " + p.className : ""}`}
      data-theme={look.name}
      data-selection={look.reverseSelection ? "reverse" : undefined}
      style={look.variables ? { ...look.variables, colorScheme: look.colorScheme, ...p.style } : p.style}
      role="region"
      aria-label="Session activity"
      onKeyDown={(e) => {
        if (!p.shortcuts || e.altKey || e.ctrlKey || e.metaKey || file !== null) return;
        const t = e.target as HTMLElement;
        if (t.closest("input, select, textarea, button, a, [role=tab], [role=dialog]")) return;
        const key = e.shiftKey && e.key === "ArrowLeft" ? "<" : e.shiftKey && e.key === "ArrowRight" ? ">" : e.key;
        if (p.shortcuts(key)) e.preventDefault();
      }}
    >
      <div className="actlet-header">
        <span className="actlet-title">actlet</span>
        {lineageText(session) !== "" && (
          <span className="actlet-chip actlet-fork" title={`Forked from ${sanitize(lineageText(session))}`}>
            <span aria-hidden="true">⑂ </span>
            fork<span className="actlet-sr-only">{`, forked from ${sanitize(lineageText(session))}`}</span>
          </span>
        )}
        {session.info && session.info.taskId !== "" && (
          <span className="actlet-muted actlet-task">
            <Text text={session.info.taskId} max={200} />
          </span>
        )}
        <Tabs active={tab} onChange={setTab} idPrefix={id} />
      </div>
      <div className="actlet-body" role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`}>
        {body}
      </div>
      <div className="actlet-footer">
        {p.controls}
        {commands && (
          <CommandBar
            onCommand={p.onCommand!}
            allowed={p.allowedCommands ?? DEFAULT_COMMANDS}
            outcomes={outcomes}
            ended={ended}
            origin={p.commandOrigin}
            actor={p.actor}
            budgetDefinitions={budgetDefinitions(session)}
            budgetStates={budgets(session)}
          />
        )}
        <StatusLine session={session} connection={connection} now={now} notice={look.notice} />
        <StateAnnouncer session={session} />
      </div>
      {file !== null && <FileViewer session={session} path={file} readFile={p.readFile} onClose={closeFile} />}
    </div>
  );
}
