// Executed only inside the opaque-origin, script-only sandbox document.
(() => {
  let connected = false;
  const nonce = crypto.randomUUID();
  // A cached iframe may load before React attaches its message listener.
  const announce = () =>
    parent.postMessage({ type: "devdevian:ready", nonce }, "*");
  const hello = setInterval(announce, 500);
  const deadline = setTimeout(() => clearInterval(hello), 30000);
  addEventListener("message", (event) => {
    if (
      connected ||
      event.source !== parent ||
      event.data?.type !== "devdevian:connect" ||
      !event.ports[0]
    )
      return;
    connected = true;
    clearInterval(hello);
    clearTimeout(deadline);
    const port = event.ports[0],
      pending = new Map(),
      listeners = new Set(),
      contexts = new Set(),
      commands = new Map();
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
      if (m.type === "context") {
        contexts.forEach((fn) => fn(m.context));
        return;
      }
      if (m.type === "theme") {
        listeners.forEach((fn) => fn(m.theme));
        return;
      }
      if (m.type === "command") {
        const fn = commands.get(m.command);
        if (fn)
          Promise.resolve()
            .then(fn)
            .catch((error) =>
              port.postMessage({
                type: "error",
                message: String(error.message).slice(0, 300),
              }),
            );
        return;
      }
      const p = pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
    };
    const api = Object.freeze({
      version: 2,
      commands: Object.freeze({
        register: async (definition, callback) => {
          if (typeof callback !== "function")
            throw Error("A command callback is required.");
          await call("commands.register", definition);
          commands.set(definition.id, callback);
          return async () => {
            commands.delete(definition.id);
            await call("commands.unregister", { id: definition.id });
          };
        },
      }),
      context: () => call("context"),
      onContext: (fn) => {
        contexts.add(fn);
        return () => contexts.delete(fn);
      },
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
  parent.postMessage({ type: "devdevian:ready", nonce }, "*");
})();
