import React, { useEffect, useState } from "react";
import {
  Pin,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  GitPullRequest,
  BookOpen,
  FolderGit2,
  Code2,
  Search,
  X,
} from "lucide-react";
import { api, dateStamp } from "./data";
import { Modal, ErrorMessage, Empty } from "./ui";
import { Pagination } from "./content";
import "./portfolio.css";
const identity = (p) => p.kind + ":" + p.id;
const labels = {
  project: "Project",
  conversation: "Conversation",
  solution: "Accepted solution",
  contributions: "Accepted contribution",
  reviews: "Code review",
  devlogs: "Devlog",
};
const icons = {
  project: FolderGit2,
  conversation: Code2,
  solution: CheckCircle2,
  contributions: GitPullRequest,
  reviews: Code2,
  devlogs: BookOpen,
};
export function Portfolio({
  personId,
  own,
  section = "overview",
  go,
  onSection,
}) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [editing, setEditing] = useState(false),
    [selection, setSelection] = useState([]),
    [version, setVersion] = useState(0),
    [search, setSearch] = useState(""),
    [candidates, setCandidates] = useState(null),
    [editError, setEditError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    setPage(1);
    setEditing(false);
    setSaved(false);
  }, [personId, section]);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    api(`/users/${personId}/portfolio?section=${section}&page=${page}`, {
      signal: c.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [personId, section, page, refresh]);
  useEffect(() => {
    if (!editing) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      setCandidates(null);
      api(
        `/users/${personId}/portfolio/candidates?q=${encodeURIComponent(search)}`,
        { signal: c.signal },
      )
        .then((d) => setCandidates(d.items))
        .catch((e) => {
          if (!c.signal.aborted) setEditError(e.message);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [personId, editing, search]);
  const openItem = (item) =>
    go(
      item.kind === "solution"
        ? `post/${item.post_id}/reply/${item.id}`
        : item.kind === "project"
          ? `workspace/${item.project_id}`
          : section === "devlogs"
            ? `workspace/${item.project_id}/devlogs`
            : section === "contributions"
              ? `workspace/${item.project_id}/contributions`
              : `post/${item.post_id}`,
    );
  const card = (item, kind) => {
    const Icon = icons[kind] || Code2;
    return (
      <article
        className={"portfolio-card portfolio-" + kind}
        key={kind + ":" + item.id}
      >
        <div className="portfolio-card-label">
          <Icon size={17} />
          <span>{labels[kind]}</span>
          {item.revision && <small>v{item.revision}</small>}
        </div>
        <button
          className="portfolio-card-title"
          onClick={() => openItem({ ...item, kind })}
        >
          <h3>{item.title}</h3>
          <ArrowUpRight size={19} />
        </button>
        {item.project_name && (
          <p className="portfolio-project-name">{item.project_name}</p>
        )}
        <p className="portfolio-excerpt">
          {item.excerpt || "Open this work to see its context and discussion."}
        </p>
        {item.verdict && (
          <span className="portfolio-verdict">
            {
              {
                changes_requested: "Changes requested",
                no_objections: "No objections",
                line_feedback: "Line feedback",
              }[item.verdict]
            }
          </span>
        )}
        <footer>
          <time>{dateStamp(item.created)}</time>
          {item.pull_url && (
            <a href={item.pull_url} target="_blank" rel="noreferrer">
              GitHub PR <ArrowUpRight size={13} />
            </a>
          )}
        </footer>
      </article>
    );
  };
  const toggle = (item) => {
    const key = identity(item);
    setEditError("");
    setSelection((old) =>
      old.some((p) => identity(p) === key)
        ? old.filter((p) => identity(p) !== key)
        : old.length < 6
          ? [...old, item]
          : old,
    );
  };
  async function save() {
    setBusy(true);
    setEditError("");
    try {
      await api(`/users/${personId}/portfolio`, {
        method: "PUT",
        body: {
          pins: selection.map(({ kind, id }) => ({ kind, id })),
          expected_version: version,
        },
      });
      setEditing(false);
      setSaved(true);
      setRefresh((n) => n + 1);
    } catch (e) {
      setEditError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setEditError("");
    try {
      const d = await api(`/users/${personId}/portfolio`);
      setSelection(d.pins);
      setVersion(d.version);
    } catch (e) {
      setEditError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="portfolio"
      aria-label={
        section === "overview"
          ? "Developer portfolio"
          : labels[section] + " history"
      }
    >
      <ErrorMessage error={error} />
      {!data && !error && <p role="status">Loading public work…</p>}
      {saved && (
        <p className="portfolio-success" role="status">
          <CheckCircle2 size={17} /> Featured work updated.
        </p>
      )}
      {data && section === "overview" && (
        <>
          <header className="portfolio-heading">
            <div>
              <span className="eyebrow">BUILT · SHARED · REVIEWED</span>
              <h2>Work with a story.</h2>
              <p>Public projects, useful answers and work built together.</p>
            </div>
            <span className="portfolio-public-badge">Public work only</span>
          </header>
          <div className="portfolio-metrics">
            {[
              ["projects", "Projects", FolderGit2, "Projects"],
              [
                "contributions",
                "Accepted contributions",
                GitPullRequest,
                "Contributions",
              ],
              ["reviews", "Reviews & line feedback", Code2, "Reviews"],
              ["devlogs", "Published Devlogs", BookOpen, "Devlogs"],
            ].map(([key, label, Icon, tab]) => (
              <button
                className={"portfolio-metric portfolio-" + key}
                key={key}
                onClick={() => onSection(tab)}
              >
                <Icon size={21} />
                <strong>{data.totals[key]}</strong>
                <span>{label}</span>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
          <div className="portfolio-featured-heading">
            <div>
              <h3>
                <Pin size={18} /> Featured work
              </h3>
              <p>A few things worth a closer look.</p>
            </div>
            {own && (
              <button
                className="button secondary"
                onClick={() => {
                  setSelection(data.pins);
                  setVersion(data.version);
                  setSearch("");
                  setEditError("");
                  setEditing(true);
                }}
              >
                Curate featured work
              </button>
            )}
          </div>
          {data.pins.length ? (
            <div className="portfolio-grid">
              {data.pins.map((item) => card(item, item.kind))}
            </div>
          ) : (
            <div className="portfolio-empty">
              <div className="portfolio-orbit" aria-hidden="true">
                <FolderGit2 />
                <Code2 />
                <BookOpen />
              </div>
              <h3>
                {own
                  ? "Make room for your best work."
                  : "A portfolio is taking shape."}
              </h3>
              <p>
                {own
                  ? "Pin up to six public projects, conversations or answers accepted as solutions."
                  : "This developer has not featured any public work yet. Explore their projects and conversations."}
              </p>
            </div>
          )}
        </>
      )}
      {data && section !== "overview" && (
        <>
          <header className="portfolio-heading">
            <div>
              <span className="eyebrow">PUBLIC WORK · REAL CONTEXT</span>
              <h2>
                {section === "contributions"
                  ? "Results accepted by a project."
                  : section === "reviews"
                    ? "A second pair of eyes."
                    : "Notes from the build."}
              </h2>
              <p>
                {section === "contributions"
                  ? "Current accepted contributions, linked to their project and task."
                  : section === "reviews"
                    ? "Published review outcomes and retained line feedback. Each keeps its original context."
                    : "Published project updates. Private drafts stay with their author."}
              </p>
            </div>
          </header>
          {data.items.length ? (
            <div className="portfolio-grid">
              {data.items.map((item) => card(item, section))}
            </div>
          ) : (
            <Empty
              icon={icons[section]}
              title="The next chapter is still ahead."
              description="No public work in this section yet."
            />
          )}
          <Pagination meta={data.pagination} onPage={setPage} label={section} />
        </>
      )}
      {editing && (
        <Modal
          title="Curate featured work"
          onClose={() => setEditing(false)}
          dismissible={!busy}
        >
          <div className="portfolio-curator">
            <h2>Your work, in your order.</h2>
            <p>
              Choose up to six public works. Private or removed content never
              appears here.
            </p>
            <ErrorMessage error={editError} />
            <ol className="portfolio-selection">
              {selection.map((item, i) => (
                <li key={identity(item)}>
                  <span>
                    <small>{labels[item.kind]}</small>
                    <strong>{item.title}</strong>
                  </span>
                  <button
                    aria-label={"Move up " + item.title}
                    disabled={busy || i === 0}
                    onClick={() =>
                      setSelection((old) => {
                        const a = [...old];
                        [a[i - 1], a[i]] = [a[i], a[i - 1]];
                        return a;
                      })
                    }
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    aria-label={"Move down " + item.title}
                    disabled={busy || i === selection.length - 1}
                    onClick={() =>
                      setSelection((old) => {
                        const a = [...old];
                        [a[i + 1], a[i]] = [a[i], a[i + 1]];
                        return a;
                      })
                    }
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    aria-label={"Unpin " + item.title}
                    disabled={busy}
                    onClick={() => toggle(item)}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ol>
            <label className="portfolio-search">
              <Search size={18} />
              <input
                aria-label="Find your public work"
                placeholder="Find your public work…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={80}
              />
            </label>
            {!candidates && <p role="status">Finding public work…</p>}
            {candidates && (
              <div className="portfolio-candidates">
                {candidates.map((item) => (
                  <label key={identity(item)}>
                    <input
                      type="checkbox"
                      checked={selection.some(
                        (p) => identity(p) === identity(item),
                      )}
                      disabled={
                        busy ||
                        (selection.length >= 6 &&
                          !selection.some(
                            (p) => identity(p) === identity(item),
                          ))
                      }
                      onChange={() => toggle(item)}
                    />
                    <span>
                      <small>{labels[item.kind]}</small>
                      <strong>{item.title}</strong>
                    </span>
                  </label>
                ))}
                {!candidates.length && <p>No matching public work.</p>}
              </div>
            )}
            <div className="form-actions">
              <button
                disabled={busy}
                className="button secondary"
                onClick={reload}
              >
                Reload saved selection
              </button>
              <button disabled={busy} className="button primary" onClick={save}>
                {busy
                  ? "Saving…"
                  : `Save featured work (${selection.length}/6)`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
