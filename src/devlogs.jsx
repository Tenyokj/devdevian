import { FollowButton } from "./follow";
import React, { useEffect, useState } from "react";
import { BookOpen, Plus, Pencil, Eye, FileText } from "lucide-react";
import { api, dateStamp } from "./data";
import { MD, Modal, ErrorMessage } from "./ui";
import { Pagination } from "./content";
import "./devlogs.css";

function DevlogEditor({ project, user, entry, close, done }) {
  const key = `devdevian-devlog:v1:${user.id}:${project.id}:${entry?.id || "new"}`;
  const [draft, setDraft] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key));
      if (
        saved &&
        saved.saved > Date.now() - 86400000 &&
        saved.saved <= Date.now() + 60000 &&
        typeof saved.title === "string" &&
        saved.title.length <= 160 &&
        typeof saved.body === "string" &&
        saved.body.length <= 10000 &&
        typeof saved.operation_key === "string"
      )
        return saved;
    } catch {}
    return {
      title: entry?.title || "",
      body: entry?.body || "",
      expected_version: entry?.version,
      operation_key: crypto.randomUUID(),
    };
  });
  const [preview, setPreview] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ ...draft, saved: Date.now() }),
      );
    } catch {}
  }, [key, draft]);
  async function save(status) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/projects/${project.id}/devlogs${entry ? "/" + entry.id : ""}`,
        { method: entry ? "PUT" : "POST", body: { ...draft, status } },
      );
      sessionStorage.removeItem(key);
      done(status);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={entry ? "Edit Devlog" : "Write a Devlog"}
      onClose={() => !busy && close()}
    >
      <div className="devlog-editor">
        <span className="eyebrow">PROJECT JOURNAL · {project.name}</span>
        <h2>
          {preview ? "Ready to share?" : "A little progress. A useful story."}
        </h2>
        <p>
          {project.community_id
            ? "Visible only to members of this private community."
            : "Published updates are visible to everyone with access to this project."}{" "}
          Drafts are visible only to you.
        </p>
        <ErrorMessage error={error} />
        {preview ? (
          <article className="devlog-preview">
            <h3>{draft.title || "Untitled draft"}</h3>
            <MD>{draft.body || "Your update will appear here."}</MD>
          </article>
        ) : (
          <>
            <label>
              Title
              <input
                disabled={busy}
                value={draft.title}
                maxLength={160}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Update
              <textarea
                disabled={busy}
                value={draft.body}
                rows={12}
                maxLength={10000}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="What changed? What did you learn? What comes next?"
              />
            </label>
            <small>
              Markdown supports code, links and images. Use image URLs you are
              allowed to share. {draft.body.length.toLocaleString()}/10,000
              characters.
            </small>
          </>
        )}
        <div className="devlog-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setPreview(!preview)}
          >
            <Eye size={16} />
            {preview ? "Back to writing" : "Preview"}
          </button>
          {entry?.status !== "published" && (
            <button
              className="button secondary"
              disabled={busy || !draft.title.trim()}
              onClick={() => save("draft")}
            >
              <FileText size={16} />
              Save draft
            </button>
          )}
          {preview && (
            <button
              className="button primary"
              disabled={
                busy ||
                draft.title.trim().length < 5 ||
                draft.body.trim().length < 10
              }
              onClick={() => save("published")}
            >
              {busy
                ? "Saving…"
                : entry?.status === "published"
                  ? "Save changes"
                  : "Publish Devlog"}
            </button>
          )}
        </div>
        <small>
          Your writing is kept in this browser tab for 24 hours. Save a server
          draft to continue on another device.
        </small>
      </div>
    </Modal>
  );
}
export function Devlogs({ project, user, requireUser }) {
  const owner = user?.id === project.user_id;
  const [status, setStatus] = useState("published"),
    [page, setPage] = useState(1),
    [epoch, setEpoch] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [notice, setNotice] = useState(""),
    [discard, setDiscard] = useState(null),
    [discarding, setDiscarding] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    api(`/projects/${project.id}/devlogs?status=${status}&page=${page}`, {
      signal: c.signal,
    })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [project.id, user?.id, status, page, epoch]);
  async function discardDraft(d) {
    setDiscarding(true);
    setError("");
    try {
      await api(`/projects/${project.id}/devlogs/${d.id}`, {
        method: "DELETE",
        body: { expected_version: d.version },
      });
      setDiscard(null);
      setEpoch((n) => n + 1);
      setNotice("Draft discarded.");
    } catch (e) {
      setError(e.message);
    } finally {
      setDiscarding(false);
    }
  }
  return (
    <section className="devlogs" aria-label="Project Devlogs">
      <header className="devlog-heading">
        <div>
          <span className="eyebrow">BUILDING IN THE OPEN · AT YOUR PACE</span>
          <h2>
            <BookOpen size={26} />
            Devlogs
          </h2>
          <p>The changes, lessons and next steps behind this project.</p>
        </div>
        {data?.can_manage && (
          <button
            className="button primary"
            onClick={() => setEditing({ new: true })}
          >
            <Plus size={16} />
            Write a Devlog
          </button>
        )}
      </header>
      <FollowButton
        kind="post"
        item={project.post_id}
        user={user}
        requireUser={requireUser}
        toast={setNotice}
      />
      {owner && (
        <nav className="devlog-actions" aria-label="Devlog visibility">
          {["published", "draft"].map((s) => (
            <button
              key={s}
              className="button secondary"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s === "draft" ? "My drafts" : "Published"}
            </button>
          ))}
        </nav>
      )}
      {notice && <p role="status">{notice}</p>}
      <ErrorMessage error={error} />
      {error && (
        <button className="text-button" onClick={() => setEpoch((n) => n + 1)}>
          Retry Devlogs
        </button>
      )}
      {!data && !error && <p role="status">Loading Devlogs…</p>}
      {data?.items.length === 0 && (
        <div className="devlog-empty">
          <BookOpen size={32} />
          <h3>
            {status === "draft"
              ? "Room for your next idea."
              : "Every project has a story."}
          </h3>
          <p>
            {status === "draft"
              ? "Saved drafts will appear here."
              : "Published progress updates will appear here."}
          </p>
        </div>
      )}
      {data?.items.map((d) => (
        <article className="devlog-entry" key={d.id} id={`devlog-${d.id}`}>
          <div className="devlog-meta">
            <span>
              {d.status === "draft"
                ? "Draft · Only you"
                : dateStamp(d.published_at)}
            </span>
            <span>
              v{d.version}
              {d.updated_at ? " · Edited " + dateStamp(d.updated_at) : ""}
            </span>
          </div>
          <h3>{d.title}</h3>
          <MD>{d.body}</MD>
          <a className="text-button" href={`#post/${project.post_id}`}>
            Discuss this project
          </a>
          {data.can_manage && (
            <button className="text-button" onClick={() => setEditing(d)}>
              <Pencil size={15} />
              Edit Devlog
            </button>
          )}
          {data.can_manage && d.status === "draft" && (
            <button
              className="text-button"
              disabled={discarding}
              onClick={() =>
                discard === d.id ? discardDraft(d) : setDiscard(d.id)
              }
            >
              {discard === d.id ? "Confirm discard draft" : "Discard draft"}
            </button>
          )}
        </article>
      ))}
      <Pagination meta={data?.pagination} onPage={setPage} label="Devlogs" />
      {editing && owner && (
        <DevlogEditor
          key={`${user.id}:${project.id}:${editing.id || "new"}`}
          project={project}
          user={user}
          entry={editing.new ? null : editing}
          close={() => setEditing(null)}
          done={(s) => {
            setEditing(null);
            setStatus(s);
            setPage(1);
            setEpoch((n) => n + 1);
            setNotice(
              s === "draft"
                ? "Draft saved. Only you can read it."
                : "Devlog saved.",
            );
          }}
        />
      )}
    </section>
  );
}
