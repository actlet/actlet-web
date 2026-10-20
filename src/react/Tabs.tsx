import { useRef, type KeyboardEvent } from "react";

export const TABS = ["chat", "session", "task", "profile", "tools", "events"] as const;
export type TabId = (typeof TABS)[number];

const names: Record<TabId, string> = {
  chat: "Chat",
  session: "Session",
  task: "Task",
  profile: "Profile",
  tools: "Tools",
  events: "Events",
};

export interface TabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  /** The tabs offered, in order; all by default. */
  tabs?: readonly TabId[];
  /** The ID prefix of the panels the tabs control. */
  idPrefix?: string;
}

/** The views: the conversation, and the session, task, profile, tools and raw events. Arrow keys move between them. */
export function Tabs({ active, onChange, tabs = TABS, idPrefix = "actlet" }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let j = -1;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    if (j < 0) return;
    e.preventDefault();
    onChange(tabs[j]);
    refs.current[j]?.focus();
  };
  return (
    <div className="actlet-tabs" role="tablist" aria-label="Views">
      {tabs.map((t, i) => (
        <button
          key={t}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${t}`}
          aria-selected={t === active}
          aria-controls={`${idPrefix}-panel-${t}`}
          tabIndex={t === active ? 0 : -1}
          className={`actlet-tab${t === active ? " actlet-tab-on" : ""}`}
          onClick={() => onChange(t)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {names[t]}
        </button>
      ))}
    </div>
  );
}
