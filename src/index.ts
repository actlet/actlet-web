// @actlet/viewer: React components that show an Actlet session's
// activity, live or replayed, from events the implementor feeds them,
// and everything in @actlet/viewer/core.

export * from "./core";

// Components.
export { ActivityViewer, type ActivityViewerProps } from "./react/ActivityViewer";
export { TurnStream, ItemView, type TurnStreamProps, type StreamOptions } from "./react/TurnStream";
export { ToolBlock, type ToolBlockProps } from "./react/ToolBlock";
export { StatusLine, type StatusLineProps } from "./react/StatusLine";
export { Sidebar, type SidebarProps } from "./react/Sidebar";
export { FileViewer, type FileContent, type FileReader, type FileViewerProps } from "./react/FileViewer";
export { Tabs, TABS, type TabId, type TabsProps } from "./react/Tabs";
export { SessionPanel, TaskPanel, ProfilePanel, ToolsPanel, EventsPanel, type PanelProps } from "./react/Panels";
export { ReplayControls, type ReplayControlsProps } from "./react/ReplayControls";
export { CommandBar, type CommandBarProps, type CommandHandler } from "./react/CommandBar";
export { Text } from "./react/Text";
export {
  decodeEvents,
  useLiveSession,
  useNow,
  useReplay,
  type ReplayOptions,
  type ReplayView,
  type SessionView,
} from "./react/hooks";
