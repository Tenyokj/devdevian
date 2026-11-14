import { useSyncExternalStore } from "react";

// Host-owned registry: sandbox packages can request a panel, not create DOM tabs.
// Stable snapshots keep profile navigation independent of iframe rerenders.
const panels = new Map(),
  listeners = new Set();
let snapshot = [];
function publish() {
  snapshot = [...panels.values()];
  for (const listener of listeners) listener();
}
export function registerProfilePanel(panel) {
  panels.set(panel.id, panel);
  publish();
  return () => {
    if (panels.get(panel.id) === panel) {
      panels.delete(panel.id);
      publish();
    }
  };
}
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;
export function useProfileExtensionPanels(userId) {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).filter(
    (panel) => panel.userId === userId,
  );
}
