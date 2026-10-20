import type { ReactNode } from "react";
import { budgetLine, budgets } from "../view/budgets";
import { duration, elapsed, firstSentence, orNA, plural, progressText, tokens } from "../view/format";
import { clock } from "../view/time";
import { sanitize } from "../view/sanitize";
import { contextWindow, firstLine, stateName, workers, type Session } from "../view/session";
import { Text } from "./Text";

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="actlet-section">
      <h3 className="actlet-section-title">
        {title}
        {note && <span className="actlet-muted">{` (${note})`}</span>}
      </h3>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="actlet-kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>
            <Text text={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Pre({ text }: { text: string }) {
  return (
    <pre className="actlet-pre">
      <Text text={text.replace(/\n+$/, "")} />
    </pre>
  );
}

const knownStates = ["ok", "alerted", "exhausted", "waiting"];
const feedbackKinds = ["problem", "suggestion", "question", "other"];

/** The session's budgets: each one's limit, what is used of it, and its state. */
export function BudgetTable({ session: s, now = null }: { session: Session; now?: number | null }) {
  const bs = budgets(s);
  if (bs.length === 0) return <div className="actlet-muted">none</div>;
  return (
    <table className="actlet-table actlet-budgets">
      <thead>
        <tr>
          <th>budget</th>
          <th>limit</th>
          <th>used</th>
          <th>
            <span className="actlet-sr-only">share used</span>
          </th>
          <th>state</th>
        </tr>
      </thead>
      <tbody>
        {bs.map((b, i) => {
          const l = budgetLine(s, b, now);
          // Only the states Actlet defines go into attributes; the text shows whatever was sent.
          const state = knownStates.includes(l.state) ? l.state : undefined;
          return (
            <tr key={i} data-state={state} className={state ? `actlet-budget-${state}` : undefined}>
              <td>{l.kind}</td>
              <td>
                <Text text={l.limit} max={100} />
              </td>
              <td>{l.used}</td>
              <td>
                {l.percent !== null && (
                  <meter
                    className="actlet-meter"
                    min={0}
                    max={100}
                    low={50}
                    high={90}
                    optimum={0}
                    value={Math.min(l.percent, 100)}
                    aria-label={`${l.kind} budget used`}
                  />
                )}
              </td>
              <td className="actlet-budget-state">
                <Text text={l.stateText || l.state || "n/a"} max={100} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export interface PanelProps {
  session: Session;
  /** The current time in milliseconds while a live session runs. */
  now?: number | null;
  /** What the viewer shows, such as "live" or "replay". */
  connection?: string;
}

/** The figures the status line leaves out: the session, usage per worker and budgets. */
export function SessionPanel({ session: s, now = null, connection = "" }: PanelProps) {
  const ns = elapsed(s, now);
  let state = stateName(s.state);
  if (s.reason !== "") state += ": " + s.reason;
  return (
    <div className="actlet-panel">
      <Section title="Session">
        <KV
          rows={[
            ["id", orNA(s.id)],
            ["state", state],
            ["run", `${s.epoch}${s.resumed ? ", resumed" : ""}`],
            ["elapsed", ns === null ? "0s" : duration(Math.round(ns / 1e9) * 1e9)],
            ["viewing", orNA(connection)],
            ["events", `${s.events}${s.skipped > 0 ? `, ${s.skipped} missed` : ""}`],
            ...(s.progress ? [["progress", progressText(s.progress)] as [string, string]] : []),
          ]}
        />
      </Section>
      <Section title="Usage">
        <KV
          rows={[
            ["tokens", `${tokens(s.usage.input)} in, ${tokens(s.usage.output)} out`],
            ["cost", s.usage.cost > 0 ? `${s.usage.cost.toFixed(4)} ${s.usage.currency}` : "n/a"],
          ]}
        />
        <table className="actlet-table">
          <thead>
            <tr>
              <th>worker</th>
              <th>model</th>
              <th>turns</th>
              <th>context</th>
              <th>tokens</th>
              <th>cost</th>
            </tr>
          </thead>
          <tbody>
            {workers(s).map((w) => {
              const window = contextWindow(s, w.model);
              return (
                <tr key={w.id}>
                  <td>{w.id}</td>
                  <td>
                    <Text text={orNA(w.model)} max={100} />
                  </td>
                  <td>{w.turns}</td>
                  <td>
                    {window > 0 && w.context > 0 ? `${Math.floor((w.context * 100) / window)}%` : tokens(w.context)}
                  </td>
                  <td>{tokens(w.usage.input + w.usage.output)}</td>
                  <td>{w.usage.cost > 0 ? w.usage.cost.toFixed(4) : "n/a"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title="Budgets">
        <BudgetTable session={s} now={now} />
      </Section>
      {s.feedback.length > 0 && (
        <Section title="Feedback" note="from the agent">
          {s.feedbackDropped > 0 && <div className="actlet-muted">{`… ${s.feedbackDropped} earlier`}</div>}
          <ul className="actlet-plain-list actlet-feedback">
            {s.feedback.map((f, i) => (
              <li key={i}>
                <span className="actlet-muted">{clock(f.at)}</span>{" "}
                <span className={`actlet-chip actlet-feedback-${feedbackKinds.includes(f.kind) ? f.kind : "other"}`}>
                  <Text text={f.kind} max={40} />
                </span>{" "}
                <Text text={f.message} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** The task and the worker tree. */
export function TaskPanel({ session: s }: PanelProps) {
  const info = s.info;
  if (!info) return <div className="actlet-panel actlet-muted">no task information yet</div>;
  return (
    <div className="actlet-panel">
      <Section title={`Task ${info.taskId}`} note={info.taskKind}>
        <Pre text={info.task} />
      </Section>
      <Section title="Workers">
        <ul className="actlet-tree">
          {workers(s).map((w) => (
            <li key={w.id} style={{ marginLeft: `${(w.id.split(".").length - 1) * 1.2}em` }}>
              <strong>{w.id}</strong>
              <Text text={`  ${w.status}  ${plural(w.turns, "turn")}  model ${orNA(w.model)}`} max={300} />
              {w.task !== "" && (
                <div className="actlet-muted">
                  <Text text={"task: " + firstLine(w.task)} max={1000} />
                </div>
              )}
              {w.result !== "" && (
                <div className="actlet-muted">
                  <Text text={"result: " + firstLine(w.result)} max={1000} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** The effective configuration, models and budgets. */
export function ProfilePanel({ session: s, now = null }: PanelProps) {
  const info = s.info;
  if (!info) return <div className="actlet-panel actlet-muted">no profile information yet</div>;
  const mc = info.models;
  const roles = Object.entries(mc?.roles ?? {})
    .map(([r, a]) => `${sanitize(r)} → ${sanitize(a)}`)
    .sort();
  return (
    <div className="actlet-panel">
      <Section title="Effective configuration" note={`profile ${s.profile}`}>
        <Pre text={info.config} />
      </Section>
      <Section title="Models">
        {mc && mc.aliases.length > 0 ? (
          <>
            <ul className="actlet-plain-list">
              {mc.aliases.map((a, i) => (
                <li key={i}>
                  <Text text={a.alias} max={200} />
                  {a.description !== "" && (
                    <>
                      {"  "}
                      <Text text={a.description} max={1000} />
                    </>
                  )}
                  {a.contextWindow > 0n && (
                    <span className="actlet-muted">{`  ${tokens(Number(a.contextWindow))} context`}</span>
                  )}
                </li>
              ))}
            </ul>
            <div>
              <Text text={"roles: " + orNA(roles.join(", "))} />
            </div>
            <div>
              <Text text={"selectable: " + orNA(mc.selectable.join(", "))} />
            </div>
          </>
        ) : (
          <div className="actlet-muted">none listed; the agent asks for the "main" alias</div>
        )}
      </Section>
      <Section title="Budgets">
        <BudgetTable session={s} now={now} />
      </Section>
      <Section title="Local viewers may">
        <Text text={orNA(info.localCommands.join(", "))} />
      </Section>
    </div>
  );
}

/** The tools, the profile's grants and what is installed. */
export function ToolsPanel({ session: s }: PanelProps) {
  const info = s.info;
  if (!info) return <div className="actlet-panel actlet-muted">no tool information yet</div>;
  return (
    <div className="actlet-panel">
      <Section title="Tools" note="recovery policy">
        {info.tools.length === 0 && <div className="actlet-muted">none</div>}
        <table className="actlet-table">
          <tbody>
            {info.tools.map((t, i) => (
              <tr key={i}>
                <td className="actlet-mono">
                  <Text text={t.name} max={200} />
                </td>
                <td className="actlet-mono">
                  <Text text={t.policy} max={50} />
                </td>
                <td className="actlet-muted" title={sanitize(t.description)}>
                  <Text text={firstSentence(t.description)} max={500} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Grants">
        {info.grants.length === 0 && <div className="actlet-muted">none: every local tool, with default settings</div>}
        {info.grants.map((g, i) => (
          <div key={i} className="actlet-mono">
            <Text
              text={`${g.name}  ${Object.entries(g.settings)
                .map(([k, v]) => `${k}=${v}`)
                .sort()
                .join(" ")}`}
            />
          </div>
        ))}
      </Section>
      <Section title="Installed" note="tools manifest">
        {info.manifest === "" ? <div className="actlet-muted">none</div> : <Pre text={info.manifest} />}
      </Section>
    </div>
  );
}

/** Every event in a line, for debugging. */
export function EventsPanel({ session: s }: PanelProps) {
  return (
    <div className="actlet-panel actlet-events">
      {s.logDropped > 0 && <div className="actlet-muted">{`… ${s.logDropped} older events`}</div>}
      {s.log.length === 0 && <div className="actlet-muted">no events yet</div>}
      {s.log.map((l, i) => (
        <div key={i} className="actlet-event-line">
          <span className="actlet-muted">
            {`${l.epoch}.${l.seq}`.padEnd(7) + " " + (l.worker || "session").padEnd(8) + " "}
          </span>
          <Text text={l.text} max={1000} />
        </div>
      ))}
    </div>
  );
}
