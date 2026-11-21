import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate } from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
export const toBase64 = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
export const fromBase64 = (s) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const colors = [
  "#56b6ff",
  "#d38cff",
  "#50c8a2",
  "#ffb56b",
  "#ef85ad",
  "#d4c263",
];
export function createLiveTransport({
  data,
  user,
  request,
  onSync,
  onStatus,
  onText,
}) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromBase64(data.state), "remote");
  const awareness = new Awareness(doc);
  awareness.setLocalStateField("user", {
    name: user.name,
    color: colors[user.id % colors.length],
    colorLight: colors[user.id % colors.length] + "30",
  });
  let pending = [],
    dueAt = 0,
    lastCursor = "",
    revision = data.session.revision,
    after = data.messages.at(-1)?.id || 0,
    timer,
    stopped = false,
    running = false,
    heartbeat = 0,
    failures = 0,
    channel = null,
    retryAt = 0,
    lastAction = Date.now();
  const code = doc.getText("code");
  const localUpdate = (update, origin) => {
    onText?.(code.toString());
    if (origin !== "remote") {
      pending.push(update);
      if (pending.length > 40) pending = [Y.mergeUpdates(pending)];
      onStatus("Saving changes…");
      schedule(600);
    }
  };
  doc.on("update", localUpdate);
  function schedule(ms) {
    if (stopped) return;
    const due = Date.now() + ms;
    if (timer && due >= dueAt) return;
    clearTimeout(timer);
    dueAt = due;
    timer = setTimeout(() => {
      timer = null;
      dueAt = 0;
      sync();
    }, ms);
  }
  function peers(rows) {
    const encoder = encoding.createEncoder(),
      remote = rows.filter(
        (p) => !(p.user_id === user.id && p.client_id === String(doc.clientID)),
      );
    encoding.writeVarUint(encoder, remote.length);
    for (const p of remote) {
      let cursor = null;
      try {
        if (p.anchor && p.head)
          cursor = {
            anchor: Y.decodeRelativePosition(fromBase64(p.anchor)),
            head: Y.decodeRelativePosition(fromBase64(p.head)),
          };
      } catch {}
      const color = colors[p.user_id % colors.length];
      encoding.writeVarUint(encoder, p.presence_id);
      encoding.writeVarUint(encoder, p.seen);
      encoding.writeVarString(
        encoder,
        JSON.stringify({
          user: { name: p.name, color, colorLight: color + "30" },
          cursor,
        }),
      );
    }
    applyAwarenessUpdate(awareness, encoding.toUint8Array(encoder), "remote");
  }
  async function sync() {
    if (stopped || running) return;
    if (document.hidden) {
      schedule(2500);
      return;
    }
    if (Date.now() - lastAction > 600000) {
      onStatus("Paused while idle · interact to reconnect");
      schedule(10000);
      return;
    }
    if (Date.now() < retryAt) {
      schedule(retryAt - Date.now());
      return;
    }
    running = true;
    const sending = pending;
    pending = [];
    channel = new AbortController();
    const cursor = awareness.getLocalState()?.cursor;
    try {
      const cursorKey = JSON.stringify(cursor || null);
      const beat = Date.now() - heartbeat > 10000 || cursorKey !== lastCursor;
      const result = await request(
        {
          client_id: String(doc.clientID),
          revision,
          after,
          heartbeat: beat,
          ...(sending.length
            ? { update: toBase64(Y.mergeUpdates(sending)) }
            : {}),
          anchor: cursor
            ? toBase64(Y.encodeRelativePosition(cursor.anchor))
            : null,
          head: cursor ? toBase64(Y.encodeRelativePosition(cursor.head)) : null,
        },
        channel.signal,
      );
      if (stopped) return;
      if (result.state) Y.applyUpdate(doc, fromBase64(result.state), "remote");
      revision = result.session.revision;
      if (beat) {
        heartbeat = Date.now();
        lastCursor = cursorKey;
      }
      after = Math.max(after, ...result.messages.map((m) => m.id));
      peers(result.presence);
      failures = 0;
      onSync(result);
      onText?.(code.toString());
      onStatus(
        pending.length
          ? "Saving changes…"
          : result.session.closed_at
            ? "Session saved"
            : "Connected · changes sync in a few seconds",
      );
      if (result.session.closed_at) {
        stop();
        return;
      }
    } catch (e) {
      if (stopped) return;
      pending = [...sending, ...pending];
      failures++;
      if ([401, 403, 404].includes(e.status)) {
        onStatus("Access changed · local code kept for copying");
        onSync({ access_lost: true });
        stop();
        return;
      }
      if ([400, 413].includes(e.status)) {
        onStatus(e.message);
        onSync({ access_lost: true });
        stop();
        return;
      }
      retryAt = Date.now() + Math.min(30000, 1500 * 2 ** Math.min(failures, 4));
      onStatus("Reconnecting · local changes are still here");
    } finally {
      running = false;
      if (!stopped) schedule(pending.length && !failures ? 700 : 2500);
    }
  }
  function interact() {
    lastAction = Date.now();
    if (!running) schedule(700);
  }
  window.addEventListener("pointerdown", interact);
  window.addEventListener("keydown", interact);
  function visible() {
    if (!document.hidden) {
      lastAction = Date.now();
      schedule(0);
    }
  }
  document.addEventListener("visibilitychange", visible);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    channel?.abort();
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("pointerdown", interact);
    window.removeEventListener("keydown", interact);
  }
  schedule(0);
  return {
    doc,
    awareness,
    code,
    syncNow: () => schedule(0),
    async flushPending() {
      const deadline = Date.now() + 12000;
      while (!stopped && (pending.length || running) && Date.now() < deadline) {
        if (pending.length && !running) sync();
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return !pending.length && !running;
    },
    hasPending: () => pending.length > 0 || running,
    getRevision: () => revision,
    stop,
    destroy() {
      stop();
      doc.off("update", localUpdate);
      awareness.destroy();
      doc.destroy();
    },
  };
}
