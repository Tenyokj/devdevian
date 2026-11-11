import { validatePackage } from "../extension-package.mjs";
import React, { useState, useEffect, useLayoutEffect } from "react";
import {
  Palette,
  CheckCircle2,
  ArrowUpRight,
  Download,
  Plus,
  Search,
  RotateCcw,
  ShieldCheck,
  Package,
  Upload,
} from "lucide-react";
import { api as requestApi } from "./data";
const api = (path, options = {}) =>
  requestApi(path, {
    ...options,
    headers: { ...options.headers, "X-Devdevian-Extensions": "2" },
  });
import { Modal, Field, ErrorMessage } from "./ui";
import {
  themeTokens,
  validateManifest,
  builtinThemes,
  paletteKeys,
} from "../extension-manifest.mjs";
import "./extensions.css";
const change = () =>
  window.dispatchEvent(new window.Event("devdevian-extensions"));
const clearTokens = () => {
  const root = document.documentElement;
  for (const key of Object.keys(themeTokens(builtinThemes[0].manifest)))
    root.style.removeProperty(key);
  delete root.dataset.extension;
};
// No cached theme is applied before account lookup. Switching accounts clears it
// before the next paint; every response is scoped to its request's account.
export function useExtensionTheme(user, baseTheme, setBaseTheme) {
  const [selection, setSelection] = useState(null);
  useLayoutEffect(() => {
    setSelection(null);
    clearTokens();
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    let alive = true,
      controller;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      api("/extensions/me?active_only=1", { signal: controller.signal })
        .then((s) => {
          if (alive) {
            setSelection(s.active || null);
            window.dispatchEvent(
              new window.CustomEvent("devdevian-extension-state", {
                detail: { ...s, userId: user.id },
              }),
            );
          }
        })
        .catch(() => {
          if (alive) {
            setSelection(null);
            window.dispatchEvent(
              new window.CustomEvent("devdevian-extension-state", {
                detail: { userId: user.id, enabled: [] },
              }),
            );
          }
        });
    };
    const visible = () => {
      if (!document.hidden) load();
    };
    load();
    window.addEventListener("devdevian-extensions", load);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(visible, 60000);
    return () => {
      alive = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("devdevian-extensions", load);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user?.id]);
  useEffect(() => {
    if (selection && setBaseTheme) setBaseTheme(selection.manifest.mode);
  }, [selection?.id]);
  useLayoutEffect(() => {
    clearTokens();
    const root = document.documentElement;
    root.dataset.theme = baseTheme;
    root.style.colorScheme = baseTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", baseTheme === "dark" ? "#0e1223" : "#f6f7fc");
    if (selection) {
      try {
        const tokens = themeTokens(selection.manifest);
        if (baseTheme !== selection.manifest.mode) {
          for (const key of Object.keys(tokens))
            if (!["--extension-font", "--extension-radius"].includes(key))
              delete tokens[key];
        }
        for (const [k, v] of Object.entries(tokens))
          root.style.setProperty(k, v);
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute(
            "content",
            baseTheme === selection.manifest.mode
              ? selection.manifest.palette.canvas
              : baseTheme === "dark"
                ? "#0e1223"
                : "#f6f7fc",
          );
        root.dataset.extension = selection.id;
        root.dataset.theme = baseTheme;
        root.style.colorScheme = baseTheme;
      } catch {
        clearTokens();
      }
    }
    return () => {
      clearTokens();
      root.dataset.theme = baseTheme;
      root.style.colorScheme = baseTheme;
    };
  }, [selection, baseTheme, user?.id]);
  return selection;
}
function ThemePreview({ manifest, name = "Your workspace" }) {
  let tokens;
  try {
    tokens = themeTokens(manifest);
  } catch {
    tokens = themeTokens(builtinThemes[0].manifest);
  }
  return (
    <div
      className="extension-demo"
      style={tokens}
      aria-label={`${name} theme preview`}
    >
      <div className="extension-demo-side">
        <img src="/devdevian-logo.png" alt="" />
        <strong>devdevian.</strong>
        <span>◉ Public feed</span>
        <span className="selected">⌘ My work</span>
        <span>▦ Projects</span>
        <span>◇ Extensions</span>
      </div>
      <div className="extension-demo-main">
        <small>YOUR NEXT USEFUL STEP</small>
        <h3>Build in your own colors.</h3>
        <div className="extension-demo-card">
          <span className="extension-demo-tag">Code review</span>
          <h4>One more pair of eyes?</h4>
          <p>Keep the code, context and conversation together.</p>
          <pre>
            <span>const</span> next = <span>await</span> build();
          </pre>
          <button type="button" tabIndex={-1}>
            Open conversation ↗
          </button>
        </div>
        <span className="extension-demo-foot">{name} · browser preview</span>
      </div>
    </div>
  );
}
function ThemeCard({ item, onOpen, active }) {
  if (item.manifest.kind === "extension")
    return (
      <button className="extension-card" onClick={() => onOpen(item)}>
        <div className="extension-package-art">
          <Package size={45} />
          <code>JavaScript + CSS</code>
        </div>
        <div className="extension-card-body">
          <h3>{item.name}</h3>
          <p>{item.description}</p>
          <div className="extension-card-meta">
            <span>By @{item.author.username || item.author.name}</span>
            <span className={"extension-badge " + item.review}>
              {item.review === "reviewed" ? "Reviewed" : "Community"}
            </span>
          </div>
          <small>
            v{item.version} · {item.enabled ? "Enabled" : "Code extension"}
          </small>
        </div>
      </button>
    );
  return (
    <button className="extension-card" onClick={() => onOpen(item)}>
      <div
        className="extension-card-art"
        style={{
          background: `linear-gradient(135deg, ${item.manifest.palette.canvas}, ${item.manifest.palette.accentSoft})`,
        }}
      >
        <div
          style={{
            background: item.manifest.palette.surface,
            borderColor: item.manifest.palette.line,
          }}
        >
          <i style={{ background: item.manifest.palette.accent }} />
          <b style={{ background: item.manifest.palette.text }} />
          <b style={{ background: item.manifest.palette.secondary }} />
          <div>
            {["accent", "text", "secondary", "line"].map((k) => (
              <span key={k} style={{ background: item.manifest.palette[k] }} />
            ))}
          </div>
        </div>
        <Palette style={{ color: item.manifest.palette.accent }} size={28} />
      </div>
      <div className="extension-card-body">
        <div className="extension-card-title">
          <h3>{item.name}</h3>
          {active === item.id && <CheckCircle2 size={19} />}
        </div>
        <p>{item.description}</p>
        <div className="extension-card-meta">
          <span>
            {item.builtin
              ? "By Devdevian"
              : `By @${item.author.username || item.author.name}`}
          </span>
          <span className={"extension-badge " + item.review}>
            {item.review === "reviewed" ? <ShieldCheck size={13} /> : null}
            {item.review === "reviewed"
              ? "Reviewed"
              : item.review === "withdrawn"
                ? "Withdrawn"
                : "Community"}
          </span>
        </div>
        <small>
          v{item.version} · {item.manifest.mode}
        </small>
      </div>
    </button>
  );
}
function PermissionList({ manifest }) {
  return (
    <div className="extension-capabilities">
      <strong>Requested capabilities</strong>
      <ul>
        {manifest.permissions.map((p) => (
          <li key={p}>
            <code>{p}</code>
          </li>
        ))}
      </ul>
      {manifest.permissions.includes("data.read") && (
        <p>
          This extension can read conversations, projects and events you can
          access, including private work. Only install code you trust.
        </p>
      )}
      {manifest.permissions.some((p) => p.startsWith("network:")) && (
        <p>
          Network origins are enabled inside its sandbox. Data you provide or
          grant to this extension can be sent to those services.
        </p>
      )}
    </div>
  );
}
function PublishTheme({ close, onPublished }) {
  const [pkg, setPkg] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [live, setLive] = useState(false);
  const accept = (value) => {
    validatePackage(value.manifest);
    if (
      typeof value.name !== "string" ||
      typeof value.slug !== "string" ||
      typeof value.version !== "string" ||
      typeof value.description !== "string"
    )
      throw Error(
        "Package needs name, slug, version and description metadata.",
      );
    setPkg(value);
    setConsent(false);
    setError("");
  };
  const local = async () => {
    try {
      const build = await api("/extensions/development");
      accept(build);
      return build;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };

  return (
    <Modal
      title="Load an extension package"
      onClose={() => {
        setLive(false);
        close();
      }}
      wide
    >
      <p className="modal-description">
        Develop JavaScript and CSS in your editor. Build a .devext.json package,
        inspect its sources and capabilities here, then preview or publish it.
      </p>
      <ErrorMessage error={error} />
      <label className="extension-package-drop">
        Choose .devext.json
        <input
          aria-label="Extension package file"
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            try {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 210000)
                throw Error("Package file exceeds the upload limit.");
              accept(JSON.parse(await file.text()));
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      </label>
      <a href="/docs/extensions" target="_blank" rel="noreferrer">
        SDK, local development and package format ↗
      </a>
      {["localhost", "127.0.0.1"].includes(location.hostname) && (
        <div className="extension-editor">
          <strong>Local development server</strong>
          <p>
            Start with npm run extension:dev -- path/to/extension. Load the
            local build, grant its capabilities, then enable live preview.
          </p>
          <button className="text-button" onClick={local}>
            Load local build
          </button>
          {pkg && (
            <label>
              <input
                type="checkbox"
                checked={live}
                disabled={!consent}
                onChange={(e) => setLive(e.target.checked)}
              />{" "}
              Live preview (local server only)
            </label>
          )}
        </div>
      )}
      {pkg && (
        <>
          <h2>
            {pkg.name} <small>v{pkg.version}</small>
          </h2>
          <p>{pkg.description}</p>
          <PermissionList manifest={pkg.manifest} />
          <details className="extension-editor">
            <summary>
              Inspect packaged source files (
              {Object.keys(pkg.manifest.files).length})
            </summary>
            {Object.entries(pkg.manifest.files).map(([path, source]) => (
              <details key={path}>
                <summary>{path}</summary>
                <pre>{source}</pre>
              </details>
            ))}
          </details>
          <label className="extension-ack">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I trust this code and allow its declared capabilities for a local
            preview. This does not grant other extensions access.
          </label>
          <div className="extension-actions">
            <button
              className="secondary-button"
              disabled={!consent}
              onClick={() => {
                window.dispatchEvent(
                  new window.CustomEvent("devdevian-extension-preview", {
                    detail: { ...pkg, live },
                  }),
                );
                close();
              }}
            >
              Preview in my app
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await api("/extensions/publish", {
                    method: "POST",
                    body: pkg,
                  });
                  onPublished(result);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Publishing…" : "Publish immutable package"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
export function Extensions({ user, requireUser }) {
  const [library, setLibrary] = useState(null),
    [mine, setMine] = useState({ installed: [], published: [], active: null }),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [tab, setTab] = useState("discover"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(null),
    [publish, setPublish] = useState(false),
    [ack, setAck] = useState(false),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const loadMine = () => api("/extensions/me").then(setMine);
  useEffect(() => {
    const c = new AbortController();
    setLibrary(null);
    setError("");
    const timer = setTimeout(
      () =>
        api(
          `/extensions/library?q=${encodeURIComponent(query)}&filter=${filter}&page=${page}`,
          { signal: c.signal },
        )
          .then(setLibrary)
          .catch((e) => {
            if (!c.signal.aborted) setError(e.message);
          }),
      180,
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query, filter, page]);
  useEffect(() => {
    const c = new AbortController();
    setMine({ installed: [], published: [], active: null });
    api("/extensions/me", { signal: c.signal })
      .then(setMine)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [user?.id]);
  useEffect(() => {
    if (!selected) return;
    const c = new AbortController();
    api("/extensions/releases/" + selected.id, { signal: c.signal })
      .then((item) => setSelected(item))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [selected?.id]);
  const open = (item) => {
    setSelected(item);
    setAck(false);
    setNote("");
    setError("");
  };
  const mutate = async (path, method, body, success) => {
    if (!user) {
      requireUser(() => {});
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api(path, { method, body });
      await loadMine();
      change();
      setNotice(success);
      return result;
    } catch (e) {
      setError(e.message);
      if (selected) {
        try {
          setSelected(await api("/extensions/releases/" + selected.id));
        } catch {}
      }
    } finally {
      setBusy(false);
    }
  };
  const installed =
      selected && mine.installed.some((x) => x.id === selected.id),
    active = mine.active?.id;
  const items =
    tab === "installed"
      ? mine.installed
      : tab === "published"
        ? mine.published || []
        : [...(library?.builtins || []), ...(library?.items || [])];
  return (
    <section className="extensions-page">
      <header className="extensions-hero">
        <div>
          <span className="extension-kicker">
            <Package size={15} /> DEVDEVIAN EXTENSIONS
          </span>
          <h1>
            Your space.
            <br />
            <em>Your code.</em>
          </h1>
          <p>
            Code your own workspace: shell layouts, panels, tools and themes.
            Install packages for your account. Everyone else keeps theirs.
          </p>
          <div className="extension-actions">
            <button
              className="primary-button"
              onClick={() =>
                user ? setPublish(true) : requireUser(() => setPublish(true))
              }
            >
              <Plus size={17} /> Upload extension
            </button>
            <a href="/docs/extensions">
              Developer guide <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
        <div className="extension-hero-art" aria-hidden="true">
          {builtinThemes.map((x) => (
            <span
              key={x.id}
              style={{
                "--swatch": x.manifest.palette.accent,
                "--paper": x.manifest.palette.canvas,
              }}
            >
              <Palette size={34} />
              <b>{x.name}</b>
            </span>
          ))}
        </div>
      </header>
      <div className="extension-account-bar">
        <span>
          <Palette size={18} />
          {mine.active
            ? `Active: ${mine.active.name} · v${mine.active.version}`
            : "Using the default appearance"}
        </span>
        <button
          className="text-button"
          disabled={!user || busy || !mine.active}
          onClick={() =>
            mutate(
              "/extensions/active",
              "PUT",
              { release: null },
              "Default appearance restored.",
            )
          }
        >
          <RotateCcw size={15} /> Restore default
        </button>
      </div>
      <div className="extension-toolbar">
        <div role="tablist" aria-label="Theme library">
          {[
            ["discover", "Discover"],
            ["installed", "Installed"],
            ["published", "Your publications"],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "discover" && (
          <div className="extension-search">
            <Search size={17} />
            <input
              aria-label="Search extensions"
              placeholder="Find extensions, tools and themes…"
              value={query}
              maxLength={80}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Extension review filter"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All extensions</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>
        )}
      </div>
      {!selected && <ErrorMessage error={error} />}
      <p className="extension-notice" role="status">
        {notice}
      </p>
      <div className="extension-grid">
        {items.map((item) => (
          <ThemeCard key={item.id} item={item} onOpen={open} active={active} />
        ))}
      </div>
      {tab === "discover" && !library && !error && (
        <p role="status">Loading extensions…</p>
      )}
      {!items.length && (library || tab !== "discover") && (
        <div className="extension-empty">
          <Palette size={32} />
          <h2>
            {tab === "installed"
              ? "Make this space yours."
              : tab === "published"
                ? "Your first extension starts here."
                : "No extensions found."}
          </h2>
          <p>
            {tab === "installed"
              ? "Open Discover, preview an extension and install it for your account."
              : tab === "published"
                ? "Build a package locally, inspect its sources and upload your .devext.json."
                : "Try another name or show all extensions."}
          </p>
        </div>
      )}
      {tab === "discover" && library?.pagination.pages > 1 && (
        <div className="extension-pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {library.pagination.pages}
          </span>
          <button
            disabled={page >= library.pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
      <aside className="extension-trust">
        <ShieldCheck size={23} />
        <div>
          <strong>Your code, with explicit capabilities.</strong>
          <p>
            Code runs in an isolated sandbox. Shell changes, data reads and
            network access require declared capabilities. “Reviewed” applies to
            this exact version; inspect its sources and permissions before
            installing.
          </p>
        </div>
      </aside>
      {selected && (
        <Modal
          title={selected.name}
          onClose={() => !busy && setSelected(null)}
          wide
        >
          <div className="extension-detail-meta">
            <span className={"extension-badge " + selected.review}>
              {selected.review === "reviewed" ? (
                <ShieldCheck size={15} />
              ) : null}
              {selected.review === "reviewed"
                ? "Reviewed version"
                : selected.review === "withdrawn"
                  ? "Withdrawn"
                  : "Unreviewed community version"}
            </span>
            <span>
              v{selected.version} · by{" "}
              {selected.author.username
                ? "@" + selected.author.username
                : selected.author.name}
            </span>
          </div>
          <p className="modal-description">{selected.description}</p>
          {selected.manifest.kind === "theme" ? (
            <ThemePreview manifest={selected.manifest} name={selected.name} />
          ) : (
            <>
              <PermissionList manifest={selected.manifest} />
              <details className="extension-editor">
                <summary>Packaged sources</summary>
                {Object.entries(selected.manifest.files).map(
                  ([path, source]) => (
                    <details key={path}>
                      <summary>{path}</summary>
                      <pre>{source}</pre>
                    </details>
                  ),
                )}
              </details>
            </>
          )}
          <ErrorMessage error={error} />
          {selected.review_note && (
            <p className="extension-review-note">
              Review note: {selected.review_note}
            </p>
          )}
          {(selected.review === "unreviewed" ||
            selected.manifest.kind === "extension") && (
            <label className="extension-ack">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I trust this exact version and allow its declared capabilities.
              Unreviewed code has not been checked by Devdevian.
            </label>
          )}
          <div className="extension-actions">
            <a
              className="text-button"
              href={
                "data:application/json;charset=utf-8," +
                encodeURIComponent(
                  JSON.stringify(
                    selected.manifest.kind === "extension"
                      ? {
                          name: selected.name,
                          slug: selected.slug,
                          version: selected.version,
                          description: selected.description,
                          manifest: selected.manifest,
                        }
                      : selected.manifest,
                    null,
                    2,
                  ),
                )
              }
              download={`${selected.slug}-${selected.version}.devext.json`}
            >
              <Download size={15} /> Manifest
            </a>
            {selected.manifest.kind === "extension" &&
              mine.installed.find((x) => x.id === selected.id)?.enabled && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await mutate(
                        "/extensions/disable/" + selected.id,
                        "PUT",
                        {},
                        "Extension disabled.",
                      )
                    )
                      setSelected(null);
                  }}
                >
                  Disable extension
                </button>
              )}
            {installed && (
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  if (
                    await mutate(
                      "/extensions/installs/" + selected.id,
                      "DELETE",
                      undefined,
                      "Extension removed.",
                    )
                  )
                    setSelected(null);
                }}
              >
                Remove
              </button>
            )}
            <button
              className="primary-button"
              disabled={
                busy ||
                selected.review === "withdrawn" ||
                ((selected.review === "unreviewed" ||
                  selected.manifest.kind === "extension") &&
                  !ack) ||
                selected.id === active
              }
              onClick={async () => {
                if (
                  await mutate(
                    "/extensions/install",
                    "POST",
                    {
                      release: selected.id,
                      acknowledge_unreviewed: ack,
                      granted_permissions:
                        selected.manifest.kind === "extension" && ack
                          ? selected.manifest.permissions
                          : undefined,
                    },
                    `${selected.name} applied to your account.`,
                  )
                )
                  setSelected(null);
              }}
            >
              {selected.id === active
                ? "Active"
                : busy
                  ? "Applying…"
                  : installed
                    ? "Apply this version"
                    : "Install & apply"}
            </button>
          </div>
          {(mine.can_review || selected.author.id === user?.id) &&
            !selected.builtin && (
              <details className="extension-editor">
                <summary>
                  {mine.can_review ? "Version review" : "Manage your version"}
                </summary>
                <p>
                  Reviews never carry over to a new version. Withdrawal disables
                  this version for every account on its next refresh.
                </p>
                <Field label="Review or withdrawal note">
                  <input
                    value={note}
                    minLength={5}
                    maxLength={400}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <div className="extension-actions">
                  {(mine.can_review
                    ? [
                        ["reviewed", "Mark reviewed"],
                        ["unreviewed", "Revoke review"],
                        ["withdrawn", "Withdraw version"],
                      ]
                    : [["withdrawn", "Withdraw version"]]
                  ).map(([status, label]) => (
                    <button
                      className="secondary-button"
                      key={status}
                      disabled={busy || note.trim().length < 5}
                      onClick={async () => {
                        const result = await mutate(
                          "/extensions/releases/" + selected.id + "/review",
                          "PATCH",
                          { status, note },
                          "Version status updated.",
                        );
                        if (result) {
                          setSelected(result);
                          setLibrary(null);
                          setQuery("");
                          setPage(1);
                          setFilter((f) => (f === "all" ? "reviewed" : "all"));
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </details>
            )}
        </Modal>
      )}
      {publish && (
        <PublishTheme
          close={() => setPublish(false)}
          onPublished={(item) => {
            setPublish(false);
            loadMine();
            setTab("published");
            open(item);
            setNotice("Version published as an unreviewed community package.");
          }}
        />
      )}
    </section>
  );
}
