import React, { useState, useEffect } from "react";
import { api } from "./data";
import { Modal, MD, ErrorMessage } from "./ui";
import "./github-writeback.css";
export function GitHubWriteback({ sourcePost = null, compact = false }) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState("issue"),
    [post, setPost] = useState(sourcePost ? String(sourcePost.id) : ""),
    [target, setTarget] = useState(""),
    [title, setTitle] = useState(sourcePost?.title || ""),
    [body, setBody] = useState(""),
    [share, setShare] = useState(false),
    [preview, setPreview] = useState(null),
    [items, setItems] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () => api("/github/writeback").then((d) => setItems(d.items));
  useEffect(() => {
    if (open) load().catch((e) => setError(e.message));
  }, [open]);
  async function inspect(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setPreview(
        await api("/github/writeback/preview", {
          method: "POST",
          body: {
            kind,
            post_id: Number(post),
            target,
            title,
            body,
            share_private: share,
          },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    setError("");
    try {
      setPreview(
        await api(`/github/writeback/${preview.id}/send`, {
          method: "POST",
          body: { confirm: true },
        }),
      );
    } catch (e) {
      setError(e.message);
      await api("/github/writeback/" + preview.id)
        .then(setPreview)
        .catch(() => {});
    } finally {
      setBusy(false);
      load().catch(() => {});
    }
  }
  return (
    <>
      <div className={compact ? "gh-writeback-inline" : "gh-writeback-entry"}>
        {!compact && (
          <div>
            <h3>From conversation to GitHub</h3>
            <p>
              Create an issue or share an outcome in an issue / PR. Preview
              every word before sending as your connected GitHub account.
            </p>
          </div>
        )}
        <button
          className={compact ? "" : "button secondary"}
          onClick={() => setOpen(true)}
        >
          Send to GitHub
        </button>
      </div>
      {open && (
        <Modal
          title="Send to GitHub"
          onClose={() => !busy && setOpen(false)}
          dismissible={!busy}
        >
          <div className="gh-writeback">
            <ErrorMessage error={error} />
            {!preview ? (
              <form onSubmit={inspect}>
                <label>
                  Action
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="issue">Create an issue</option>
                    <option value="comment">Comment on issue / PR</option>
                  </select>
                </label>
                <label>
                  {sourcePost ? "Conversation" : "Your conversation ID"}
                  <input
                    disabled={!!sourcePost}
                    type="number"
                    min="1"
                    required
                    value={post}
                    onChange={(e) => setPost(e.target.value)}
                  />
                </label>
                <label>
                  {kind === "issue" ? "Repository URL" : "Issue / PR URL"}
                  <input
                    type="url"
                    required
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder={
                      kind === "issue"
                        ? "https://github.com/owner/repository"
                        : "https://github.com/owner/repository/issues/42"
                    }
                  />
                </label>
                {kind === "issue" && (
                  <label>
                    Issue title
                    <input
                      required
                      minLength={5}
                      maxLength={160}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  Message · Markdown
                  <textarea
                    required
                    minLength={10}
                    maxLength={12000}
                    rows={8}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <label className="gh-writeback-consent">
                  <input
                    type="checkbox"
                    checked={share}
                    onChange={(e) => setShare(e.target.checked)}
                  />{" "}
                  I permit sharing this private conversation with the selected
                  private repository's readers.
                </label>
                <p>
                  Private conversations cannot be exported to public
                  repositories. GitHub must grant Issues or Pull requests write
                  permission separately. No code, branches or merges are
                  changed.
                </p>
                <button disabled={busy} className="button primary">
                  {busy ? "Preparing…" : "Preview on GitHub"}
                </button>
              </form>
            ) : (
              <div>
                <p className="gh-writeback-identity">
                  Publishing as <strong>@{preview.actor}</strong> ·{" "}
                  {preview.private ? "Private repository" : "Public repository"}
                </p>
                <a href={preview.target} target="_blank" rel="noreferrer">
                  {preview.target}
                </a>
                <h3>{preview.title}</h3>
                <MD>{preview.body}</MD>
                <p>
                  Operation: <code>{preview.id}</code> · {preview.state}
                </p>
                {preview.result_url && (
                  <a
                    className="button primary"
                    href={preview.result_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open published result ↗
                  </a>
                )}
                {preview.state === "preview" ? (
                  <div className="gh-writeback-actions">
                    <button disabled={busy} onClick={() => setPreview(null)}>
                      Back to edit
                    </button>
                    <button
                      disabled={busy}
                      className="button primary"
                      onClick={send}
                    >
                      {busy ? "Sending…" : "Confirm and send to GitHub"}
                    </button>
                  </div>
                ) : (
                  <p>
                    Attempted operations are never automatically resent. If the
                    outcome is uncertain, check GitHub before creating another.
                  </p>
                )}
                {!busy && preview.state !== "preview" && (
                  <button onClick={() => setPreview(null)}>New preview</button>
                )}
              </div>
            )}
            {items.length > 0 && (
              <details>
                <summary>Recent operations · {items.length}</summary>
                {items.map((i) => (
                  <button
                    className="gh-writeback-history"
                    key={i.id}
                    disabled={busy}
                    onClick={() =>
                      api("/github/writeback/" + i.id)
                        .then(setPreview)
                        .catch((e) => setError(e.message))
                    }
                  >
                    {i.kind} · {i.state} · {i.target}
                  </button>
                ))}
              </details>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
