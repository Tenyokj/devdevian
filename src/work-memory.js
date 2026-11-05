import { readDraft } from "./drafts.js";
const recentKey = (id) => `devdevian-recent:v1:${id}`;
export function rememberConversation(storage, user, id, now = Date.now()) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) return;
  try {
    const items = recentConversations(storage, user, now).filter(
      (r) => r.id !== Number(id),
    );
    storage.setItem(
      recentKey(user),
      JSON.stringify([{ id: Number(id), at: now }, ...items].slice(0, 12)),
    );
  } catch {}
}
export function recentConversations(storage, user, now = Date.now()) {
  try {
    const raw = storage.getItem(recentKey(user)) || "[]";
    if (raw.length > 4096) return [];
    const rows = JSON.parse(raw),
      seen = new Set();
    return Array.isArray(rows)
      ? rows
          .filter(
            (r) =>
              Number.isSafeInteger(r?.id) &&
              r.id > 0 &&
              Number.isFinite(r.at) &&
              r.at <= now + 60000 &&
              now - r.at < 30 * 86400000 &&
              !seen.has(r.id) &&
              seen.add(r.id),
          )
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}
export function localWorkDrafts(storage, user) {
  const rows = [];
  try {
    const prefix = `devdevian-draft:v1:${user}:`;
    const keys = Array.from({ length: Math.min(storage.length, 500) }, (_, i) =>
      storage.key(i),
    );
    for (const key of keys) {
      if (
        !key?.startsWith(prefix) ||
        key.slice(prefix.length).includes(":github:")
      )
        continue;
      const draft = readDraft(storage, key);
      if (draft)
        rows.push({
          key,
          title: draft.title || "Untitled conversation",
          data: draft,
        });
      if (rows.length === 12) break;
    }
  } catch {}
  return rows;
}

// Browser storage may be disabled by privacy settings; continuation is optional.
export function workStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
