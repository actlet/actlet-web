import { useCallback, useId, useMemo, useState, type CSSProperties } from "react";
import type { EventInput } from "../events";
import { SessionState, type ActivityEvent, type CommandAck, type Origin } from "../gen/actlet/gateway/v0/gateway_pb";
import type { Session } from "../view/session";
import { CommandBar, type CommandHandler } from "./CommandBar";
import { commandOutcomes, DEFAULT_COMMANDS, type CommandKind } from "./commands";
import { FileViewer, type FileReader } from "./FileViewer";
import { useLiveSession, useNow, useReplay, type ReplayOptions } from "./hooks";
import { EventsPanel, ProfilePanel, SessionPanel, TaskPanel, ToolsPanel } from "./Panels";
import { ReplayControls } from "./ReplayControls";
import { Sidebar } from "./Sidebar";
import { StatusLine } from "./StatusLine";
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
  /** Light, dark, or the reader's system setting (the default). */
  theme?: "light" | "dark" | "auto";
  /** What the viewer is connected to, in a few words, for the status line: "live" by default. */
  connectionLabel?: string;
  /** Live mode: the implementor's stream has ended, so no more events will come. */
  ended?: boolean;

  /** Live mode: delivers commands the operator sends. Without it, the viewer only watches. */
  onCommand?: CommandHandler;
  /** The commands offered: steer notes only by default. */
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

  /** The tab shown first. */
  defaultTab?: TabId;
  /** Draw a line between turns and between tool calls. */
  separators?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A session's activity, shown like the terminal viewer: the conversation, a status line, a sidebar of workers and files, and tabs. */
export function ActivityViewer(props: ActivityViewerProps) {
  return props.mode === "replay" ? <ReplayViewer {...props} /> : <LiveViewer {...props} />;
}

function LiveViewer(props: ActivityViewerProps) {
  const { session, version, events } = useLiveSession(props.events, props.sessionId);
  const ended = props.ended ?? false;
  const running = !ended && (session.state === SessionState.RUNNING || session.state === SessionState.UNSPECIFIED);
  const now = useNow(running);
  let connection = props.connectionLabel ?? "live";
  if (ended) connection += ", run ended";
  return (
    <Layout {...props} session={session} version={version} events={events} now={now} connection={connection} live />
  );
}

function ReplayViewer(props: ActivityViewerProps) {
  const opts: ReplayOptions = { sessionId: props.sessionId, autoPlay: props.autoPlay, speed: props.speed };
  const r = useReplay(props.events, opts);
  return (
    <Layout
      {...props}
      session={r.session}
      version={r.version}
      events={r.events}
      now={null}
      connection={r.label}
      live={false}
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
  events: readonly (ActivityEvent | null)[];
  now: number | null;
  connection: string;
  live: boolean;
  controls?: React.ReactNode;
}

const terminal = [SessionState.PAUSED, SessionState.STOPPED, SessionState.COMPLETED, SessionState.FAILED];

function Layout(p: LayoutProps) {
  const { session, version, now, connection } = p;
  const id = useId();
  const [tab, setTab] = useState<TabId>(p.defaultTab ?? "chat");
  const [focus, setFocus] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [separators, setSeparators] = useState(p.separators ?? false);
  const [collapseSubs, setCollapseSubs] = useState(false);
  const closeFile = useCallback(() => setFile(null), []);
  const { events, acks } = p;
  const outcomes = useMemo(
    () =>
      commandOutcomes(
        events.filter((e): e is ActivityEvent => e !== null),
        acks,
      ),
    [events, acks],
  );
  const theme = p.theme ?? "auto";
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
    <div className={`actlet-viewer${p.className ? " " + p.className : ""}`} data-theme={theme} style={p.style}>
      <header className="actlet-header">
        <span className="actlet-title">actlet</span>
        {session.info && session.info.taskId !== "" && (
          <span className="actlet-muted actlet-task">
            <Text text={session.info.taskId} max={200} />
          </span>
        )}
        <Tabs active={tab} onChange={setTab} idPrefix={id} />
      </header>
      <div className="actlet-body" role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`}>
        {body}
      </div>
      <footer className="actlet-footer">
        {p.controls}
        {commands && (
          <CommandBar
            onCommand={p.onCommand!}
            allowed={p.allowedCommands ?? DEFAULT_COMMANDS}
            outcomes={outcomes}
            ended={ended}
            origin={p.commandOrigin}
            actor={p.actor}
          />
        )}
        <StatusLine session={session} connection={connection} now={now} />
      </footer>
      {file !== null && <FileViewer session={session} path={file} readFile={p.readFile} onClose={closeFile} />}
    </div>
  );
}
