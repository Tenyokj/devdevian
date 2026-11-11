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
import { api } from "./data";
import { Modal, Field, ErrorMessage } from "./ui";
import {
  themeTokens,
  validateManifest,
  builtinThemes,
  paletteKeys,
} from "../extension-manifest.mjs";
import "./extensions.css";
const change = () => window.dispatchEvent(new Event("devdevian-extensions"));
const clearTokens = () => {
  const root = document.documentElement;
  for (const key of Object.keys(themeTokens(builtinThemes[0].manifest)))
    root.style.removeProperty(key);
  delete root.dataset.extension;
};
// No cached theme is applied before account lookup. Switching accounts clears it
// before the next paint; every response is scoped to its request's account.
export function useExtensionTheme(user, baseTheme) {
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
          if (alive) setSelection(s.active || null);
        })
        .catch(() => {
          if (alive) setSelection(null);
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
        for (const [k, v] of Object.entries(tokens))
          root.style.setProperty(k, v);
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", selection.manifest.palette.canvas);
        root.dataset.extension = selection.id;
        root.dataset.theme = selection.manifest.mode;
        root.style.colorScheme = selection.manifest.mode;
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
function PublishTheme({ close, onPublished }) {
  const [manifest, setManifest] = useState(builtinThemes[0].manifest),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [raw, setRaw] = useState("");
  let valid = true;
  try {
    validateManifest(manifest);
  } catch {
    valid = false;
  }
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(manifest, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "devdevian-theme.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal title="Publish a theme" onClose={close} wide>
      <p className="modal-description">
        Your theme becomes a public, immutable version. It starts as unreviewed.
        Publishing does not change anyone’s installed theme.
      </p>
      <ErrorMessage error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            validateManifest(manifest);
            const item = await api("/extensions/publish", {
              method: "POST",
              body: {
                name: f.get("name"),
                slug: f.get("slug"),
                version: f.get("version"),
                description: f.get("description"),
                manifest,
              },
            });
            onPublished(item);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="extension-form-grid">
          <Field label="Theme name">
            <input
              name="name"
              required
              minLength={3}
              maxLength={60}
              placeholder="Golden Hour"
            />
          </Field>
          <Field label="Unique slug">
            <input
              name="slug"
              required
              pattern="[a-z][a-z0-9-]{2,47}"
              placeholder="golden-hour"
            />
          </Field>
          <Field label="Version">
            <input
              name="version"
              required
              defaultValue="1.0.0"
              pattern="(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})"
            />
          </Field>
          <Field label="Start from">
            <select
              aria-label="Start from"
              onChange={(e) =>
                setManifest(builtinThemes[Number(e.target.value)].manifest)
              }
            >
              {builtinThemes.map((x, i) => (
                <option key={x.id} value={i}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            name="description"
            required
            minLength={20}
            maxLength={1200}
            rows={3}
            placeholder="Describe the palette and what it feels like to use."
          />
        </Field>
        <div className="extension-form-grid">
          <Field label="Font">
            <select
              value={manifest.font}
              onChange={(e) =>
                setManifest({ ...manifest, font: e.target.value })
              }
            >
              {["default", "mono", "system"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Corners">
            <select
              value={manifest.corners}
              onChange={(e) =>
                setManifest({ ...manifest, corners: e.target.value })
              }
            >
              {["round", "soft", "square"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <details className="extension-editor">
          <summary>Edit palette tokens</summary>
          <div className="extension-palette-editor">
            {paletteKeys.map((k) => (
              <label key={k}>
                {k}
                <input
                  aria-label={k}
                  type="color"
                  value={manifest.palette[k]}
                  onChange={(e) =>
                    setManifest({
                      ...manifest,
                      palette: { ...manifest.palette, [k]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <ThemePreview manifest={manifest} />
        {!valid && (
          <p className="extension-warning">
            Adjust the palette to meet reading and accent contrast requirements
            before publishing.
          </p>
        )}
        <details className="extension-editor">
          <summary>Import or export JSON</summary>
          <p>
            Only schema 1 theme data is accepted. Scripts, CSS, URLs and
            additional fields are rejected.
          </p>
          <label className="extension-file">
            Import JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 8192)
                    throw Error("Theme files must be smaller than 8 KB.");
                  setManifest(validateManifest(JSON.parse(await f.text())));
                  setError("");
                } catch (e) {
                  setError(e.message);
                }
              }}
            />
          </label>
          <textarea
            aria-label="Paste theme JSON"
            value={raw}
            maxLength={8192}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Or paste a manifest here"
          />
          <button
            type="button"
            className="text-button"
            onClick={() => {
              try {
                setManifest(validateManifest(JSON.parse(raw)));
                setError("");
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Load JSON
          </button>
          <button type="button" className="text-button" onClick={download}>
            <Download size={15} /> Export manifest
          </button>
        </details>
        <div className="extension-actions">
          <a href="/docs/extensions" target="_blank" rel="noreferrer">
            Theme author guide <ArrowUpRight size={15} />
          </a>
          <button className="primary-button" disabled={busy || !valid}>
            {busy ? "Publishing…" : "Publish version"}
          </button>
        </div>
      </form>
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
            <em>Your colors.</em>
          </h1>
          <p>
            Themes made by developers, for their own corner of the forum.
            Install a look for your account. Everyone else keeps theirs.
          </p>
          <div className="extension-actions">
            <button
              className="primary-button"
              onClick={() =>
                user ? setPublish(true) : requireUser(() => setPublish(true))
              }
            >
              <Plus size={17} /> Create a theme
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
              aria-label="Search themes"
              placeholder="Find your next palette…"
              value={query}
              maxLength={80}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Theme review filter"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All themes</option>
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
        <p role="status">Loading themes…</p>
      )}
      {!items.length && (library || tab !== "discover") && (
        <div className="extension-empty">
          <Palette size={32} />
          <h2>
            {tab === "installed"
              ? "Make this space yours."
              : tab === "published"
                ? "Your first palette starts here."
                : "No themes found."}
          </h2>
          <p>
            {tab === "installed"
              ? "Open Discover, preview a theme and install it for your account."
              : tab === "published"
                ? "Start with a built-in palette or import your own JSON manifest."
                : "Try another name or show all themes."}
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
          <strong>Appearance, with clear boundaries.</strong>
          <p>
            Themes use color and layout tokens. No scripts, arbitrary CSS or
            external requests. “Reviewed” applies to this exact version; it is
            not a security guarantee. Community themes are clearly labeled.
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
          <ThemePreview manifest={selected.manifest} name={selected.name} />
          <ErrorMessage error={error} />
          {selected.review_note && (
            <p className="extension-review-note">
              Review note: {selected.review_note}
            </p>
          )}
          {selected.review === "unreviewed" && (
            <label className="extension-ack">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I understand this version has not been reviewed by Devdevian.
            </label>
          )}
          <div className="extension-actions">
            <a
              className="text-button"
              href={
                "data:application/json;charset=utf-8," +
                encodeURIComponent(JSON.stringify(selected.manifest, null, 2))
              }
              download={`${selected.slug}-${selected.version}.json`}
            >
              <Download size={15} /> Manifest
            </a>
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
                      "Theme removed.",
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
                (selected.review === "unreviewed" && !ack) ||
                selected.id === active
              }
              onClick={async () => {
                if (
                  await mutate(
                    "/extensions/install",
                    "POST",
                    { release: selected.id, acknowledge_unreviewed: ack },
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
            setNotice("Version published as an unreviewed community theme.");
          }}
        />
      )}
    </section>
  );
}
