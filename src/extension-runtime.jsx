import {
  requestExtensionResume,
  readExtensionDraft,
  saveExtensionDraft,
  extensionDraftStorage,
} from "./extension-drafts";
import React, { useEffect, useState, useRef } from "react";
import { api as requestApi } from "./data";
import {
  validatePackage,
  scopedStyles,
  layoutCSS,
  networkOrigins,
  validateCommand,
} from "../extension-package.mjs";
import "./extension-runtime.css";
const api = (path, options = {}) =>
  requestApi(path, {
    ...options,
    headers: { ...options.headers, "X-Devdevian-Extensions": "2" },
  });
const validRoute = (route) =>
  typeof route === "string" &&
  /^(feed|work|following|projects|events|github|extensions|communities|saved|profile|post\/[1-9]\d*|workspace\/[1-9]\d*(?:\/room)?)$/.test(
    route,
  );
const permissionFor = {
  style: "ui.style",
  layout: "ui.layout",
  panel: "ui.panel",
  navigate: "ui.navigate",
  view: "views.open",
  "storage.get": "storage",
  "storage.set": "storage",
  "data.get": "data.read",
  "commands.register": "ui.commands",
  "commands.unregister": "ui.commands",
};
export function Runner({
  item,
  userId,
  mode,
  onError,
  onLayout,
  onView,
  preview,
  commandIndex = 0,
  suppressed = false,
}) {
  const frame = useRef(),
    style = useRef(),
    port = useRef(),
    [commands, setCommands] = useState([]),
    [commandsOpen, setCommandsOpen] = useState(false),
    [slotRect, setSlotRect] = useState(null),
    [panel, setPanel] = useState({
      placement: "right",
      width: 380,
      height: 420,
      title: item.name,
    });
  const own = item.manifest,
    grants = item.grants || [],
    identity = item.slug;
  useEffect(() => {
    const element = document.createElement("style");
    element.dataset.extensionStyle = item.id;
    element.textContent = scopedStyles(own.styles[mode]);
    document.head.append(element);
    style.current = element;
    return () => element.remove();
  }, [item.id, mode]);
  useEffect(() => {
    port.current?.postMessage({ type: "theme", theme: mode });
  }, [mode]);
  useEffect(() => {
    let alive = true,
      channel,
      connectedWindow,
      connectedNonce,
      epoch = 0,
      requests = 0,
      windowStart = Date.now();
    const pending = new Set(),
      registered = new Map();
    const handle = async (message, connection, replyPort) => {
      const { id, method, args } = message || {};
      const requestKey = connection + ":" + id;
      if (
        !Number.isInteger(id) ||
        id < 1 ||
        id > 1e9 ||
        pending.has(requestKey)
      )
        return;
      pending.add(requestKey);
      try {
        if (Date.now() - windowStart > 1000) {
          windowStart = Date.now();
          requests = 0;
        }
        if (++requests > 40 || pending.size > 8)
          throw Error("Extension request limit reached.");
        if (JSON.stringify(message).length > 65536)
          throw Error("Extension message too large.");
        const required = permissionFor[method];
        if (method !== "context" && (!required || !grants.includes(required)))
          throw Error("Capability not granted: " + method);
        let result = null;
        if (method === "context")
          result = {
            mode: document.documentElement.dataset.theme,
            route: location.hash.slice(1),
            preview: !!preview,
          };
        else if (method === "style") {
          style.current.textContent = scopedStyles(args?.css);
          result = true;
        } else if (method === "layout") {
          onLayout(item.id, layoutCSS(args));
          result = true;
        } else if (method === "panel") {
          const p = args || {};
          if (
            ![
              "right",
              "left",
              "bottom",
              "overlay",
              "full",
              "hidden",
              "top",
              "inline",
            ].includes(p.placement) ||
            typeof p.title !== "string" ||
            p.title.length > 60
          )
            throw Error("Invalid panel placement or title.");
          const width = Number(p.width ?? 380),
            height = Number(p.height ?? 420);
          if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width < 180 ||
            width > 1600 ||
            height < 100 ||
            height > 1600
          )
            throw Error("Panel size outside supported bounds.");
          setPanel({ ...p, width, height });
          result = true;
        } else if (method === "commands.register") {
          const command = validateCommand(args);
          if (!registered.has(command.id) && registered.size >= 8)
            throw Error("At most eight commands per extension.");
          registered.set(command.id, command);
          setCommands([...registered.values()]);
          result = true;
        } else if (method === "commands.unregister") {
          registered.delete(args?.id);
          setCommands([...registered.values()]);
          result = true;
        } else if (method === "navigate") {
          if (!validRoute(args?.route)) throw Error("Unsupported app route.");
          location.hash = args.route;
          result = true;
        } else if (method === "view") {
          if (
            !validRoute(args?.route) ||
            typeof args.title !== "string" ||
            args.title.length > 60
          )
            throw Error("Invalid view.");
          onView(item.id, args.route, args.title);
          result = true;
        } else if (method.startsWith("storage.")) {
          const key = args?.key;
          if (
            typeof key !== "string" ||
            !key ||
            key.length > 80 ||
            !/^[-a-zA-Z0-9_.]+$/.test(key)
          )
            throw Error("Use a short storage key.");
          const prefix = `devdevian-extension:${userId}:${identity}:`,
            storageKey = prefix + key;
          if (method === "storage.get")
            result = JSON.parse(localStorage.getItem(storageKey) || "null");
          else {
            const value = JSON.stringify(args.value);
            if (value === undefined || value.length > 16384)
              throw Error("Storage value is limited to 16 KB.");
            let size = value.length;
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k.startsWith(prefix) && k !== storageKey)
                size += (localStorage.getItem(k) || "").length;
            }
            if (size > 65536)
              throw Error(
                "Extension storage is limited to 64 KB per account on this device.",
              );
            localStorage.setItem(storageKey, value);
            result = true;
          }
        } else if (method === "data.get") {
          const path = args?.path;
          if (
            typeof path !== "string" ||
            path.length > 240 ||
            !/^\/(?:posts(?:\/[1-9]\d*)?|projects(?:\/[1-9]\d*)?|events(?:\/[1-9]\d*)?)(?:\?(?:page|limit)=[1-9]\d?(?:&(?:page|limit)=[1-9]\d?)?)?$/.test(
              path,
            )
          )
            throw Error(
              "Only bounded conversation, project and event reads are supported.",
            );
          result = await api(path);
          if (JSON.stringify(result).length > 65536)
            throw Error("This result is too large; select a smaller page.");
        }
        if (alive) replyPort.postMessage({ id, result });
      } catch (e) {
        if (alive)
          replyPort.postMessage({
            id,
            error: String(e.message).slice(0, 240),
          });
      } finally {
        pending.delete(requestKey);
      }
    };
    const ready = (event) => {
      if (
        (channel &&
          connectedWindow === event.source &&
          connectedNonce === event.data?.nonce) ||
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "devdevian:ready" ||
        event.origin !== "null"
      )
        return;
      channel?.port1.close();
      connectedWindow = event.source;
      connectedNonce = event.data?.nonce;
      const connection = ++epoch;
      pending.clear();
      registered.clear();
      setCommands([]);
      channel = new MessageChannel();
      const replyPort = channel.port1;
      port.current = channel.port1;
      channel.port1.onmessage = (e) => {
        if (e.data?.type === "error") {
          onError(item.id, String(e.data.message).slice(0, 300));
          return;
        }
        handle(e.data, connection, replyPort);
      };
      frame.current.contentWindow.postMessage(
        { type: "devdevian:connect", source: own.files[own.entry] },
        "*",
        [channel.port2],
      );
    };
    window.addEventListener("message", ready);
    return () => {
      alive = false;
      window.removeEventListener("message", ready);
      channel?.port1.close();
      port.current = null;
      onLayout(item.id, null);
    };
  }, [item.id, userId]);
  const invoke = (id) => {
    port.current?.postMessage({ type: "command", command: id });
    setCommandsOpen(false);
  };
  useEffect(() => {
    const keydown = (event) => {
      if (
        !event.isTrusted ||
        event.repeat ||
        !event.altKey ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.defaultPrevented ||
        event.target?.closest?.(
          "input,textarea,select,[contenteditable], [role=dialog]",
        ) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const command = commands.find(
        (c) =>
          c.shortcut === "Alt+Shift+" + event.code.replace(/^(Key|Digit)/, ""),
      );
      if (command) {
        event.preventDefault();
        invoke(command.id);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [commands]);
  useEffect(() => {
    if (panel.placement !== "inline" || suppressed) {
      setSlotRect(null);
      return;
    }
    let node, raf;
    const measure = () => {
      if (!node?.isConnected) return;
      const r = node.getBoundingClientRect(),
        nav = document.querySelector(".topbar")?.getBoundingClientRect();
      const next = {
        left: r.left,
        top: r.top,
        width: r.width,
        height: panel.height,
        clip: Math.max(0, (nav?.bottom || 0) - r.top),
      };
      setSlotRect((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const locate = () => {
      const parent = document.querySelector(".devext-content");
      if (!parent) {
        setSlotRect(null);
        return;
      }
      if (node?.parentNode === parent) return;
      node?.remove();
      resize.disconnect();
      node = document.createElement("div");
      node.className = "devext-inline-slot";
      node.style.height = panel.height + "px";
      node.style.marginBottom = "24px";
      parent.prepend(node);
      resize.observe(node);
      schedule();
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.getElementById("root"), {
      childList: true,
      subtree: true,
    });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      node?.remove();
    };
  }, [panel.placement, panel.height, suppressed]);
  const network = own.permissions.filter((x) => x.startsWith("network:"));
  const content = (
    <section
      className={"devext-panel devext-panel-" + panel.placement}
      style={{
        display: suppressed ? "none" : undefined,
        "--panel-width": panel.width + "px",
        "--panel-height": panel.height + "px",
        ...(panel.placement === "inline"
          ? {
              left: slotRect?.left || 0,
              top: slotRect?.top || 0,
              width: slotRect?.width || 0,
              height: panel.height,
              visibility: slotRect ? "visible" : "hidden",
              clipPath: `inset(${Math.min(panel.height, slotRect?.clip || 0)}px 0 0 0)`,
            }
          : {}),
      }}
      aria-label={item.name + " extension panel"}
    >
      <header>
        <strong>{panel.title}</strong>
        <small>{preview ? "Local preview" : `v${item.version}`}</small>
      </header>
      <iframe
        ref={frame}
        title={item.name + " sandbox"}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        src={
          "/api/extensions/runner?network=" +
          encodeURIComponent(JSON.stringify(network))
        }
      />
    </section>
  );
  return (
    <>
      {content}
      {commands.length > 0 && (
        <div
          className="devext-command-controls"
          style={{ "--command-index": commandIndex }}
          aria-label={item.name + " commands"}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setCommandsOpen(false);
              event.currentTarget.querySelector("button")?.focus();
              event.stopPropagation();
            }
          }}
        >
          <button
            aria-expanded={commandsOpen}
            onClick={() => setCommandsOpen((x) => !x)}
          >
            ⌘ {item.name}
          </button>
          {commandsOpen && (
            <div className="devext-command-menu">
              {commands.map((c) => (
                <button key={c.id} onClick={() => invoke(c.id)}>
                  {c.title}
                  {c.shortcut && <kbd>{c.shortcut}</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
export function ExtensionRuntime({ user }) {
  const [enabled, setEnabled] = useState([]),
    [preview, setPreview] = useState(null),
    [route, setRoute] = useState(location.hash),
    [errors, setErrors] = useState({}),
    [mode, setMode] = useState(document.documentElement.dataset.theme),
    [views, setViews] = useState([]),
    [safe, setSafe] = useState(() =>
      new URLSearchParams(location.search).has("extensions-safe"),
    );
  useEffect(() => {
    const change = () => setRoute(location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const layouts = useRef(new Map());
  const disabled = user === null || location.pathname === "/workspace-pane";
  const applyLayouts = () => {
    const surface = document.querySelector(".devext-surface");
    if (!surface) return;
    for (const [k, v] of [
      ["isolation", "isolate"],
      ["position", "relative"],
      ["z-index", "0"],
    ])
      surface.style.setProperty(k, v, "important");
    const layout = [...layouts.current.values()].at(-1);
    for (const name of [
      "grid-template-areas",
      "grid-template-columns",
      "grid-template-rows",
      "gap",
    ])
      surface.style.removeProperty(name);
    delete surface.dataset.extensionLayout;
    if (layout) {
      surface.dataset.extensionLayout = "true";
      Object.assign(surface.style, layout);
    }
  };
  const onLayout = (id, value) => {
    if (value) layouts.current.set(id, value);
    else layouts.current.delete(id);
    applyLayouts();
  };
  useEffect(() => {
    setEnabled([]);
    setPreview(null);
    setViews([]);
    setErrors({});
    applyLayouts();
    if (disabled) return;
    let alive = true;
    const c = new AbortController();
    const update = (e) => {
      if (e.detail?.userId === user.id) setEnabled(e.detail.enabled || []);
    };
    const local = (e) => {
      try {
        validatePackage(e.detail.manifest);
        setPreview({
          ...e.detail,
          build:
            e.detail.live &&
            ["localhost", "127.0.0.1"].includes(location.hostname) &&
            e.detail.build
              ? e.detail.build
              : window.crypto.randomUUID(),
          id: "local-preview",
          slug: "local-preview",
          grants: e.detail.manifest.permissions,
        });
        setSafe(false);
      } catch (e) {
        setErrors((x) => ({ ...x, preview: e.message }));
      }
    };
    window.addEventListener("devdevian-extension-state", update);
    window.addEventListener("devdevian-extension-preview", local);
    api("/extensions/me?active_only=1", { signal: c.signal })
      .then((s) => {
        if (alive) setEnabled(s.enabled || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
      c.abort();
      window.removeEventListener("devdevian-extension-state", update);
      window.removeEventListener("devdevian-extension-preview", local);
      layouts.current.clear();
      applyLayouts();
    };
  }, [user?.id]);
  useEffect(() => {
    if (
      !preview?.live ||
      !["localhost", "127.0.0.1"].includes(location.hostname)
    )
      return;
    let alive = true,
      busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await api("/extensions/development");
        validatePackage(next.manifest);
        if (!alive) return;
        if (
          JSON.stringify([...next.manifest.permissions].sort()) !==
          JSON.stringify([...preview.grants].sort())
        ) {
          stopPreview();
          setErrors((x) => ({
            ...x,
            preview:
              "Capabilities changed. Load the build again and review its permissions.",
          }));
          return;
        }
        if (next.build !== preview.build) {
          if (preview.returnToPublisher) {
            const saved = readExtensionDraft(extensionDraftStorage(), user.id);
            if (
              saved &&
              !saveExtensionDraft(
                extensionDraftStorage(),
                user.id,
                saved.draft,
                next,
              )
            ) {
              setErrors((x) => ({
                ...x,
                preview: "Updated source could not be saved to the draft.",
              }));
            }
          }
          setPreview({
            ...next,
            live: true,
            returnToPublisher: preview.returnToPublisher,
            id: "local-preview",
            slug: "local-preview",
            grants: preview.grants,
          });
        }
      } catch (e) {
        if (alive) setErrors((x) => ({ ...x, preview: e.message }));
      } finally {
        busy = false;
      }
    }, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [preview?.build, preview?.live]);
  useEffect(() => {
    const o = new window.MutationObserver(() =>
      setMode(document.documentElement.dataset.theme),
    );
    o.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    if (!enabled.length && !preview) {
      setViews([]);
    }
  }, [enabled.length, preview]);
  const stopPreview = () => {
    const resume = preview?.returnToPublisher;
    setPreview(null);
    setViews([]);
    if (resume && user) {
      requestExtensionResume(user.id);
      location.hash = "extensions";
      window.dispatchEvent(new window.Event("devdevian-extension-resume"));
    }
  };
  const stop = async () => {
    setSafe(true);
    stopPreview();
    setViews([]);
    layouts.current.clear();
    applyLayouts();
    if (user) {
      try {
        await api("/extensions/disable-all", { method: "POST", body: {} });
        window.dispatchEvent(new window.Event("devdevian-extensions"));
      } catch (e) {
        setErrors((x) => ({ ...x, recovery: e.message }));
      }
    }
  };
  const active =
    disabled || safe ? [] : [...enabled, ...(preview ? [preview] : [])];
  return (
    <>
      {!disabled && (active.length > 0 || safe) && (
        <div
          className="devext-recovery"
          aria-label="Extension recovery controls"
        >
          <a href="/app#extensions">Extensions</a>
          {(enabled.length > 0 || preview) && (
            <>
              <span>
                {preview ? "Developer preview" : `${enabled.length} enabled`}
              </span>
              <button onClick={stop}>Disable all extensions</button>
            </>
          )}
          {safe && (
            <>
              <span>Safe mode</span>
              <button
                onClick={() => {
                  setSafe(false);
                  history.replaceState(
                    null,
                    "",
                    location.pathname + location.hash,
                  );
                }}
              >
                Leave safe mode
              </button>
            </>
          )}
          {preview && <button onClick={stopPreview}>Stop preview</button>}
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <div className="devext-errors" role="status">
          {Object.entries(errors).map(([id, message]) => (
            <p key={id}>
              {id}: {message}
            </p>
          ))}
          <button onClick={() => setErrors({})}>Dismiss</button>
        </div>
      )}
      {active.map((item, index) => (
        <Runner
          key={item.id + (item.build || "")}
          commandIndex={index}
          suppressed={
            item.id !== "local-preview" && route.startsWith("#extensions")
          }
          item={item}
          userId={user.id}
          mode={mode}
          onLayout={onLayout}
          onError={(id, message) => setErrors((x) => ({ ...x, [id]: message }))}
          preview={item.id === "local-preview"}
          onView={(id, route, title) =>
            setViews((old) => [
              ...old
                .filter((x) => x.owner !== id || x.route !== route)
                .slice(-2),
              { id: id + ":" + route, owner: id, route, title },
            ])
          }
        />
      ))}
      {!safe &&
        !disabled &&
        views
          .filter((v) => active.some((p) => p.id === v.owner))
          .map((v, index, list) => (
            <section
              className="devext-view"
              key={v.id}
              style={{ "--view-index": index, "--view-count": list.length }}
            >
              <header>
                <strong>{v.title}</strong>
                <button
                  aria-label={"Close " + v.title}
                  onClick={() =>
                    setViews((x) => x.filter((y) => y.id !== v.id))
                  }
                >
                  ×
                </button>
              </header>
              <iframe
                title={v.title + " app view"}
                src={"/workspace-pane#" + v.route}
              />
            </section>
          ))}
    </>
  );
}
