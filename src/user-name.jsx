import React, { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { api } from "./data";
import "./user-name.css";

// One bounded batch per render wave, rather than one request per visible name.
const cache = new Map(),
  listeners = new Map(),
  queued = new Set(),
  inFlight = new Set();
let scheduled = false,
  timer,
  generation = 0;
function emit(id) {
  for (const notify of listeners.get(id) || []) notify();
}
async function flush() {
  scheduled = false;
  const version = generation;
  const ids = [...queued].slice(0, 100);
  ids.forEach((id) => {
    queued.delete(id);
    inFlight.add(id);
  });
  if (!ids.length) return;
  try {
    const result = await api("/identities?ids=" + ids.join(","));
    for (const id of ids) {
      if (version !== generation) {
        queued.add(id);
        continue;
      }
      cache.delete(id);
      cache.set(id, { ...result.identities[id], at: Date.now() });
      emit(id);
    }
    while (cache.size > 1000) cache.delete(cache.keys().next().value);
  } catch {
    // A failed refresh must not keep displaying a revoked/stale mark.
    for (const id of ids) {
      if (version !== generation) {
        queued.add(id);
        continue;
      }
      cache.set(id, { verified: false, at: Date.now() });
      emit(id);
    }
  }
  ids.forEach((id) => inFlight.delete(id));
  if (queued.size) schedule();
}
function schedule() {
  if (!scheduled) {
    scheduled = true;
    setTimeout(flush, 0);
  }
}
function refresh(force = false) {
  if (document.hidden) return;
  for (const id of listeners.keys()) {
    if (
      !inFlight.has(id) &&
      (force || Date.now() - (cache.get(id)?.at || 0) >= 60000)
    )
      queued.add(id);
  }
  if (queued.size) schedule();
}
function visibility() {
  refresh();
}
function invalidate() {
  generation++;
  refresh(true);
}
export function UserName({ userId, children, identity, size = 15 }) {
  const id = Number(userId),
    [, redraw] = useState(0);
  useEffect(() => {
    if (!Number.isSafeInteger(id) || id < 1) return;
    const notify = () => redraw((n) => n + 1);
    if (!listeners.has(id)) listeners.set(id, new Set());
    listeners.get(id).add(notify);
    if (!timer) {
      timer = setInterval(refresh, 30000);
      document.addEventListener("visibilitychange", visibility);
      window.addEventListener("devdevian-verification", invalidate);
    }
    refresh();
    return () => {
      listeners.get(id)?.delete(notify);
      if (!listeners.get(id)?.size) listeners.delete(id);
      if (!listeners.size) {
        clearInterval(timer);
        timer = null;
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("devdevian-verification", invalidate);
      }
    };
  }, [id]);
  const badge = cache.get(id) || identity;
  return (
    <span className="user-identity">
      {children}
      {badge?.verified && (
        <BadgeCheck
          className="identity-verified"
          size={size}
          role="img"
          aria-label={
            badge.founder ? "Devdevian founder" : "Verified by Devdevian"
          }
        >
          <title>
            {badge.founder ? "Devdevian founder" : "Verified by Devdevian"}
          </title>
        </BadgeCheck>
      )}
    </span>
  );
}
