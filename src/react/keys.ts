/**
 * The viewer's keyboard shortcuts, by where they work. The handlers look
 * keys up here, and the help dialog lists them from here, so the two
 * can't drift apart.
 */

/**
 * A shortcut: the keys that do it, as KeyboardEvent.key values ("Shift+"
 * for Shift with a key that has no shifted character), and what it does.
 * A native one is the browser's own, such as Enter on a button: it is
 * listed, not handled.
 */
export interface Binding<A extends string = string> {
  action: A;
  keys: readonly string[];
  does: string;
  native?: boolean;
}

export interface KeyGroup {
  title: string;
  /** Where the keys work, when it isn't anywhere. */
  where?: string;
  bindings: readonly Binding[];
}

export const VIEWER_KEYS = [{ action: "help", keys: ["?"], does: "show the keys and commands" }] as const;

export const TAB_KEYS = [
  { action: "next", keys: ["ArrowRight"], does: "the next view" },
  { action: "previous", keys: ["ArrowLeft"], does: "the previous view" },
  { action: "first", keys: ["Home"], does: "the first view" },
  { action: "last", keys: ["End"], does: "the last view" },
] as const;

export const STREAM_KEYS = [
  { action: "next", keys: ["ArrowDown", "j"], does: "the next tool call" },
  { action: "previous", keys: ["ArrowUp", "k"], does: "the previous tool call" },
  { action: "first", keys: ["Home"], does: "the first tool call" },
  { action: "last", keys: ["End"], does: "the last tool call" },
  { action: "expand", keys: ["Enter", " "], does: "expand or collapse the tool call", native: true },
] as const;

export const SIDEBAR_KEYS = [
  { action: "next", keys: ["ArrowDown", "j"], does: "the next worker or file" },
  { action: "previous", keys: ["ArrowUp", "k"], does: "the previous worker or file" },
  { action: "first", keys: ["Home"], does: "the first row" },
  { action: "last", keys: ["End"], does: "the last row" },
  { action: "open", keys: ["Enter", " "], does: "show the worker alone, or open the file", native: true },
] as const;

export const REPLAY_KEYS = [
  { action: "toggle", keys: [" ", "k"], does: "play or pause" },
  { action: "back", keys: ["ArrowLeft"], does: "back one event" },
  { action: "forward", keys: ["ArrowRight"], does: "forward one event" },
  { action: "back10", keys: ["Shift+ArrowLeft"], does: "back ten events" },
  { action: "forward10", keys: ["Shift+ArrowRight"], does: "forward ten events" },
  { action: "faster", keys: ["+", "="], does: "twice as fast" },
  { action: "slower", keys: ["-"], does: "half as fast" },
] as const;

export const DIALOG_KEYS = [
  { action: "close", keys: ["Escape"], does: "close it" },
  { action: "move", keys: ["Tab", "Shift+Tab"], does: "move within it", native: true },
] as const;

/** The action a key press does, of the bindings given; undefined if none, or with Ctrl, Alt or Meta held. */
export function actionFor<A extends string>(
  bindings: readonly Binding<A>[],
  e: { key: string; shiftKey: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean },
): A | undefined {
  if (e.ctrlKey || e.altKey || e.metaKey) return undefined;
  for (const b of bindings) {
    for (const k of b.keys) {
      if (k.startsWith("Shift+") && k.length > 6) {
        if (e.shiftKey && e.key === k.slice(6)) return b.action;
      } else if (e.key === k && (!e.shiftKey || isSymbol(k))) return b.action;
    }
  }
  return undefined;
}

/** A character typed with Shift on some keyboards, such as ? or +, whose binding holds either way. */
function isSymbol(k: string): boolean {
  return k.length === 1 && k.toLowerCase() === k.toUpperCase() && k !== " ";
}

/** How a key reads in the help: arrows as arrows, Space and Esc by name. */
export function keyName(k: string): string {
  const names: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    " ": "Space",
    Escape: "Esc",
  };
  if (k.startsWith("Shift+") && k.length > 6) return "Shift " + keyName(k.slice(6));
  return names[k] ?? k;
}

/** The shortcuts the viewer has, in groups, for the help: replay keys only in a replay. */
export function keyGroups(replay: boolean): KeyGroup[] {
  const groups: KeyGroup[] = [{ title: "Anywhere", bindings: VIEWER_KEYS }];
  if (replay) groups.push({ title: "Replay", where: "outside the controls", bindings: REPLAY_KEYS });
  groups.push(
    { title: "Views", where: "on the tabs", bindings: TAB_KEYS },
    { title: "Conversation", where: "in the conversation", bindings: STREAM_KEYS },
    { title: "Workers and files", where: "in the sidebar", bindings: SIDEBAR_KEYS },
    { title: "Dialogs", where: "in a file or this help", bindings: DIALOG_KEYS },
  );
  return groups;
}
