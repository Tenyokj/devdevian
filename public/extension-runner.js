// Executed only inside the opaque-origin, script-only sandbox document.
(() => {
  let connected = false;
  addEventListener("message", (event) => {
    if (
      connected ||
      event.source !== parent ||
      event.data?.type !== "devdevian:connect" ||
      !event.ports[0]
    )
      return;
    connected = true;
    const port = event.ports[0],
      pending = new Map(),
      listeners = new Set();
    let seq = 0;
    const call = (method, args) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("Extension request timed out."));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        port.postMessage({ id, method, args });
      });
    port.onmessage = (event) => {
      const m = event.data;
      if (m.type === "theme") {
        listeners.forEach((fn) => fn(m.theme));
        return;
      }
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
    };
    const api = Object.freeze({
      version: 1,
      context: () => call("context"),
      onTheme: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      style: Object.freeze({ apply: (css) => call("style", { css }) }),
      layout: Object.freeze({ apply: (layout) => call("layout", layout) }),
      panel: Object.freeze({ configure: (options) => call("panel", options) }),
      navigate: (route) => call("navigate", { route }),
      views: Object.freeze({
        open: (route, title) => call("view", { route, title }),
      }),
      storage: Object.freeze({
        get: (key) => call("storage.get", { key }),
        set: (key, value) => call("storage.set", { key, value }),
      }),
      data: Object.freeze({ get: (path) => call("data.get", { path }) }),
    });
    Object.defineProperty(window, "devdevian", { value: api, writable: false });
    const report = (e) =>
      port.postMessage({
        type: "error",
        message: String(e.message || e.reason || e).slice(0, 300),
      });
    addEventListener("error", report);
    addEventListener("unhandledrejection", report);
    const source = event.data.source;
    if (typeof source !== "string" || source.length > 196608) return;
    const blob = new Blob([source], { type: "text/javascript" }),
      url = URL.createObjectURL(blob),
      script = document.createElement("script");
    script.src = url;
    script.onload = () => URL.revokeObjectURL(url);
    document.body.append(script);
  });
  parent.postMessage({ type: "devdevian:ready" }, "*");
})();
