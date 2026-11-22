// Drafts stay on this device. Each workspace instance owns a separate record so
// an acknowledgement in another tab cannot erase unsent work.
const prefix = "devdevian.live-draft.v1:";
const lifetime = 7 * 86400000;
export function liveDrafts(owner, session, storage = globalThis.localStorage) {
  const scope = `${prefix}${owner}:${session}:`;
  const key = scope + crypto.randomUUID();
  // A sign-out in any tab invalidates writers that are still finishing a request.
  const resetKey = `devdevian.live-draft-reset:${owner}`;
  const generation = storage.getItem(resetKey);
  function list() {
    const rows = [];
    for (const k of Object.keys(storage)) {
      if (!k.startsWith(scope) || k === key) continue;
      try {
        const row = JSON.parse(storage.getItem(k));
        if (
          row.version !== 1 ||
          row.owner !== owner ||
          row.session !== session ||
          typeof row.state !== "string" ||
          row.state.length > 262144 ||
          typeof row.code !== "string" ||
          row.code.length > 20000 ||
          !Number.isFinite(row.updated) ||
          Date.now() - row.updated > lifetime
        ) {
          storage.removeItem(k);
          continue;
        }
        rows.push({ ...row, key: k });
      } catch {
        storage.removeItem(k);
      }
    }
    return rows.sort((a, b) => b.updated - a.updated);
  }
  return {
    list,
    save(state, code, revision) {
      if (storage.getItem(resetKey) !== generation)
        throw new Error("Account changed");
      if (state.length > 262144 || code.length > 20000)
        throw new Error("Draft too large");
      storage.setItem(
        key,
        JSON.stringify({
          version: 1,
          owner,
          session,
          state,
          code,
          revision,
          updated: Date.now(),
        }),
      );
    },
    clear: () => storage.removeItem(key),
    discard: (row) => {
      if (row.key.startsWith(scope)) storage.removeItem(row.key);
    },
  };
}
export function clearLiveDrafts(owner, storage = globalThis.localStorage) {
  try {
    for (const key of Object.keys(storage))
      if (key.startsWith(`${prefix}${owner}:`)) storage.removeItem(key);
    storage.setItem(`devdevian.live-draft-reset:${owner}`, crypto.randomUUID());
  } catch {
    /* A disabled browser store has no recoverable drafts. */
  }
}
