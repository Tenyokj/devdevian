import { CodeTokens, useCodeTokens } from "./code-color";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  History,
  Plus,
  ArrowLeftRight,
  ArrowLeft,
  FileCode2,
  Trash2,
  Eye,
} from "lucide-react";
import { api, dateStamp } from "./data";
import { Modal, ErrorMessage } from "./ui";
import { Select } from "./controls";
import { Pagination } from "./content";
import { GitHubContext } from "./github-context";
import {
  compareReviewLines,
  workspaceDraftKey,
  readWorkspaceDraft,
  saveWorkspaceDraft,
} from "./workspace-model.mjs";
import "./workspaces.css";

function SnapshotCode({ snapshot, range }) {
  const [index, setIndex] = useState(() =>
      Math.max(
        0,
        snapshot.files.findIndex(
          (f) =>
            range && range.start >= f.start_line && range.end <= f.end_line,
        ),
      ),
    ),
    [page, setPage] = useState(() =>
      range
        ? Math.floor(
            (range.start -
              (snapshot.files.find(
                (f) => range.start >= f.start_line && range.end <= f.end_line,
              )?.start_line || 1)) /
              100,
          ) + 1
        : 1,
    );
  const file = snapshot.files[index];
  const lines = file.code.split("\n");
  const coloredLines = useCodeTokens(file.code, file.path);
  return (
    <div className="dw-snapshot">
      <Select
        aria-label="Snapshot file"
        value={index}
        onChange={(e) => {
          setIndex(Number(e.target.value));
          setPage(1);
        }}
      >
        {snapshot.files.map((f, i) => (
          <option key={f.path} value={i}>
            {f.path}
          </option>
        ))}
      </Select>
      <p className="muted">
        Exact published code · v{snapshot.number} · lines {file.start_line}–
        {file.end_line}
      </p>
      <div className="dw-code" aria-label={`Revision ${snapshot.number} code`}>
        {lines.slice((page - 1) * 100, page * 100).map((line, i) => {
          const n = file.start_line + (page - 1) * 100 + i;
          return (
            <div
              key={n}
              className={
                range && n >= range.start && n <= range.end
                  ? "dw-highlight"
                  : ""
              }
            >
              <span>{n}</span>
              <code>
                <CodeTokens
                  tokens={coloredLines[(page - 1) * 100 + i]}
                  text={line}
                />
              </code>
            </div>
          );
        })}
      </div>
      <Pagination
        meta={{
          page,
          pages: Math.ceil(lines.length / 100),
          total: lines.length,
        }}
        label="snapshot lines"
        onPage={setPage}
      />
    </div>
  );
}
function SnapshotComparison({ before, after }) {
  const [page, setPage] = useState(1);
  const { rows, coarse } = useMemo(
    () => compareReviewLines(before.code, after.code),
    [before.code, after.code],
  );
  return (
    <section aria-label="Revision comparison">
      <h3>
        {before.label || `v${before.number}`} →{" "}
        {after.label || `v${after.number}`}
      </h3>
      <p className="muted">
        {coarse
          ? "Large change: showing the exact replaced block."
          : "Exact published text. Unchanged lines keep both line numbers."}
      </p>
      <div className="dw-compare-files">
        <p>
          <strong>{before.label || `v${before.number}`}</strong>
          {before.files.map((f) => (
            <code key={f.path}>{f.path}</code>
          ))}
        </p>
        <p>
          <strong>{after.label || `v${after.number}`}</strong>
          {after.files.map((f) => (
            <code key={f.path}>{f.path || "Unnamed file"}</code>
          ))}
        </p>
      </div>
      <div className="dw-code dw-diff">
        {rows.slice((page - 1) * 100, page * 100).map((r, i) => (
          <div key={i} className={"dw-" + r.kind}>
            <span>{r.old ?? "·"}</span>
            <span>{r.next ?? "·"}</span>
            <span>
              {r.kind === "added" ? "+" : r.kind === "removed" ? "−" : " "}
            </span>
            <code>{r.text || " "}</code>
          </div>
        ))}
      </div>
      <Pagination
        meta={{ page, pages: Math.ceil(rows.length / 100), total: rows.length }}
        label="comparison lines"
        onPage={setPage}
      />
    </section>
  );
}
export function SnapshotDialog({
  postId,
  snapshotId,
  currentId,
  range,
  close,
}) {
  const [snapshot, setSnapshot] = useState(null),
    [current, setCurrent] = useState(null),
    [compare, setCompare] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setCurrent(null);
    setError("");
    const tasks = [
      api(`/posts/${postId}/revisions/${snapshotId}`, {
        signal: controller.signal,
      }),
    ];
    if (compare && currentId !== snapshotId)
      tasks.push(
        api(`/posts/${postId}/revisions/${currentId}`, {
          signal: controller.signal,
        }),
      );
    Promise.all(tasks)
      .then(([old, latest]) => {
        if (!controller.signal.aborted) {
          setSnapshot(old);
          setCurrent(latest);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [postId, snapshotId, currentId, compare, retry]);
  return (
    <Modal
      title="Published review version"
      onClose={close}
      wide
      className="dw-dialog"
    >
      <div className="dw-heading">
        <div>
          <span className="eyebrow">IMMUTABLE SNAPSHOT</span>
          <h2>{snapshot ? `Revision ${snapshot.number}` : "Review history"}</h2>
        </div>
        {currentId && currentId !== snapshotId && (
          <button
            className="button secondary"
            onClick={() => setCompare(!compare)}
          >
            <ArrowLeftRight size={16} />
            {compare ? "View original" : "Compare with current"}
          </button>
        )}
      </div>
      <ErrorMessage error={error} />
      {error && (
        <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
          Retry snapshot
        </button>
      )}
      {!snapshot && !error && (
        <p role="status">Loading the original snapshot…</p>
      )}
      {snapshot && (
        <>
          <p className="muted">
            Published {dateStamp(snapshot.created)} · Feedback stays on this
            revision.
          </p>
          <p>{snapshot.review_focus}</p>
          <GitHubContext value={snapshot.context.github_context} />
          {compare && current ? (
            <SnapshotComparison
              key={`${snapshot.id}:${current.id}`}
              before={snapshot}
              after={current}
            />
          ) : (
            <SnapshotCode snapshot={snapshot} range={range} />
          )}
        </>
      )}
    </Modal>
  );
}

function PublishRevision({ post, base, user, close, published }) {
  const key = workspaceDraftKey(user.id, `revision:${post.id}`);
  const [restored] = useState(() => {
    try {
      return readWorkspaceDraft(sessionStorage, key);
    } catch {
      return null;
    }
  });
  const [files, setFiles] = useState(
      restored?.files || base.files.map(({ path, code }) => ({ path, code })),
    ),
    [focus, setFocus] = useState(restored?.review_focus ?? post.review_focus),
    [index, setIndex] = useState(0),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stored, setStored] = useState(true),
    [conflict, setConflict] = useState(
      !!restored &&
        ((restored.expected_revision !== undefined &&
          restored.expected_revision !== post.revision) ||
          (restored.base_revision_id !== undefined &&
            restored.base_revision_id !== base.id)),
    ),
    [baseline, setBaseline] = useState({
      snapshot: base,
      revision: post.revision,
    }),
    [compare, setCompare] = useState(false),
    [rebase, setRebase] = useState(false);
  const expected = restored?.expected_revision ?? post.revision,
    baseId = restored?.base_revision_id ?? base.id;
  const [target, setTarget] = useState({
    expected_revision: expected,
    base_revision_id: baseId,
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function persist(nextFiles = files, nextFocus = focus, nextTarget = target) {
    try {
      setStored(
        saveWorkspaceDraft(sessionStorage, key, {
          files: nextFiles,
          review_focus: nextFocus,
          ...nextTarget,
        }),
      );
    } catch {
      setStored(false);
    }
  }
  const size = files.map((f) => f.code).join("\n").length;
  const valid =
    files.length > 0 &&
    size >= 10 &&
    size <= 20000 &&
    focus.trim().length >= 10 &&
    files.every((f) => f.path.trim() && f.code !== undefined) &&
    new Set(files.map((f) => f.path)).size === files.length;
  function change(field, value) {
    const next = files.map((f, i) =>
      i === index ? { ...f, [field]: value } : f,
    );
    persist(next);
    setFiles(next);
    setPreview(false);
  }
  async function publish() {
    if (!preview || busy || !valid) return;
    setBusy(true);
    setError("");
    try {
      const created = await api(`/posts/${post.id}/revisions`, {
        method: "POST",
        body: { ...target, files, review_focus: focus },
      });
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Publication succeeded even when local storage is unavailable. */
      }
      if (alive.current) published(created);
    } catch (e) {
      if (alive.current) {
        setError(e.message);
        setConflict(e.status === 409);
        setPreview(false);
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function reloadBase() {
    setBusy(true);
    setError("");
    try {
      const latest = await api(`/posts/${post.id}/revisions`);
      if (!latest.current_revision_id)
        throw Error(
          "The current snapshot is unavailable. Your draft is kept; try again after reloading the conversation.",
        );
      const snapshot = await api(
        `/posts/${post.id}/revisions/${latest.current_revision_id}`,
      );
      if (alive.current) {
        const nextTarget = {
          expected_revision: latest.post_revision,
          base_revision_id: latest.current_revision_id,
        };
        persist(files, focus, nextTarget);
        setTarget(nextTarget);
        setBaseline({ snapshot, revision: latest.post_revision });
        setCompare(true);
        setConflict(false);
        setRebase(true);
        setPreview(false);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal
      title="Share a review revision"
      onClose={() => !busy && close()}
      dismissible={!busy}
      wide
      className="dw-dialog"
    >
      <span className="eyebrow">KEEP THE REVIEW MOVING</span>
      <h2>New code. Same conversation.</h2>
      <p>
        Previous versions and feedback stay available. Preview exactly what you
        share.
      </p>
      <p className="dw-draft" role="status">
        {stored
          ? "Draft saved in this browser tab, for this account."
          : "Tab storage is unavailable. Keep this editor open to retain your draft."}
      </p>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => {
          setFiles(
            baseline.snapshot.files.map(({ path, code }) => ({ path, code })),
          );
          setFocus(baseline.snapshot.review_focus);
          setIndex(0);
          setTarget({
            expected_revision: baseline.revision,
            base_revision_id: baseline.snapshot.id,
          });
          setPreview(false);
          setConflict(false);
          setRebase(false);
          setCompare(false);
          setError("");
          try {
            sessionStorage.removeItem(key);
          } catch {}
        }}
      >
        Discard revision draft
      </button>
      {rebase && (
        <p role="status" className="dw-notice">
          Your draft is kept. Review it against the latest code before
          publishing; this replaces the current snapshot.
        </p>
      )}
      {conflict && (
        <p className="dw-notice">
          This draft was based on an earlier version. Reload the latest version
          to review your changes.
        </p>
      )}
      {rebase && (
        <button className="text-button" onClick={() => setCompare(!compare)}>
          {compare ? "Hide latest comparison" : "Compare draft with latest"}
        </button>
      )}
      {compare && (
        <SnapshotComparison
          key={`${baseline.snapshot.id}:${files.map((f) => f.code).join("\n")}`}
          before={baseline.snapshot}
          after={{
            number: "draft",
            label: "Your draft",
            code: files.map((f) => f.code).join("\n"),
            files,
          }}
        />
      )}
      {!preview ? (
        <>
          <div className="dw-toolbar">
            <Select
              aria-label="Revision file to edit"
              value={index}
              disabled={busy}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {files.map((f, i) => (
                <option key={i} value={i}>
                  {f.path || `File ${i + 1}`}
                </option>
              ))}
            </Select>
            <button
              className="text-button"
              disabled={busy || files.length >= 10}
              onClick={() => {
                const next = [...files, { path: "", code: "" }];
                persist(next);
                setFiles(next);
                setIndex(files.length);
              }}
            >
              <Plus size={15} />
              Add file
            </button>
            <button
              className="text-button"
              disabled={busy || files.length === 1}
              onClick={() => {
                const next = files.filter((_, i) => i !== index);
                persist(next);
                setFiles(next);
                setIndex(0);
              }}
            >
              <Trash2 size={15} />
              Remove file
            </button>
          </div>
          <label>
            Relative file path
            <input
              aria-label="Revision file path"
              maxLength={240}
              required
              disabled={busy}
              value={files[index].path}
              onChange={(e) => change("path", e.target.value)}
            />
          </label>
          <label>
            File contents
            <textarea
              className="dw-editor"
              aria-label="Revision file contents"
              rows={12}
              maxLength={20000}
              disabled={busy}
              value={files[index].code}
              onChange={(e) => change("code", e.target.value)}
              spellCheck="false"
            />
          </label>
          <label>
            What should reviewers focus on?
            <textarea
              aria-label="Revision review focus"
              rows={3}
              maxLength={1500}
              disabled={busy}
              value={focus}
              onChange={(e) => {
                persist(files, e.target.value);
                setFocus(e.target.value);
              }}
            />
          </label>
          <p className="muted">
            {files.length}/10 files · {size.toLocaleString()}/20,000 characters.
            Existing GitHub context remains with its original version.
          </p>
        </>
      ) : (
        <section aria-label="Publication preview">
          <h3>Publication preview</h3>
          <p>{focus}</p>
          {files.map((f) => (
            <div className="dw-preview-file" key={f.path}>
              <strong>
                <FileCode2 size={15} />
                {f.path}
              </strong>
              <pre>
                <code>{f.code}</code>
              </pre>
            </div>
          ))}
        </section>
      )}
      <ErrorMessage error={error} />
      {conflict && (
        <button className="text-button" disabled={busy} onClick={reloadBase}>
          Reload latest version and keep my draft
        </button>
      )}
      <div className="dw-toolbar dw-bottom">
        {preview ? (
          <>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(false)}
            >
              <ArrowLeft size={15} />
              Back to editing
            </button>
            <button
              className="button primary"
              disabled={busy || !valid}
              onClick={publish}
            >
              {busy ? "Publishing…" : "Publish revision"}
            </button>
          </>
        ) : (
          <button
            className="button primary"
            disabled={busy || !valid || conflict}
            onClick={() => setPreview(true)}
          >
            <Eye size={16} />
            Preview revision
          </button>
        )}
      </div>
    </Modal>
  );
}

export function ReviewVersions({ post, user, onPublished }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [view, setView] = useState(null),
    [editing, setEditing] = useState(null),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0),
    [unsupported, setUnsupported] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    api(`/posts/${post.id}/revisions?page=${page}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) {
          setData(r);
          setUnsupported(r.capabilities?.review_revisions !== 1);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setUnsupported(e.status === 404);
          if (e.status !== 404) setError(e.message);
        }
      });
    return () => controller.abort();
  }, [post.id, post.revision, page, retry, user?.id]);
  async function edit() {
    setLoading(true);
    setError("");
    try {
      const base = await api(
        `/posts/${post.id}/revisions/${data.current_revision_id}`,
      );
      if (alive.current) setEditing(base);
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  if (unsupported) return null;
  return (
    <section className="dw-history" aria-label="Review versions">
      <div className="dw-heading">
        <div>
          <span className="eyebrow">
            <History size={13} />
            REVIEW VERSIONS
          </span>
          <h3>
            {data
              ? `${data.pagination.total} published ${data.pagination.total === 1 ? "version" : "versions"}`
              : "Review history"}
          </h3>
        </div>
        {user?.id === post.user_id &&
          data?.current_revision_id &&
          !post.archived_at &&
          !post.locked_at &&
          !post.removed_at && (
            <button
              className="button secondary"
              disabled={loading}
              onClick={edit}
            >
              <Plus size={15} />
              {loading ? "Opening editor…" : "Share new revision"}
            </button>
          )}
      </div>
      <ErrorMessage error={error} />
      {error && (
        <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
          Retry review history
        </button>
      )}
      {!data && !error && <p role="status">Loading published versions…</p>}
      <div className="dw-history-list">
        {data?.items.map((r) => (
          <button key={r.id} onClick={() => setView(r.id)}>
            <span className="dw-version">v{r.number}</span>
            <span>
              <strong>
                {r.files.length} {r.files.length === 1 ? "file" : "files"}
                {r.id === data.current_revision_id ? " · Current" : ""}
              </strong>
              <small>{dateStamp(r.created)}</small>
            </span>
            <Eye size={16} />
          </button>
        ))}
      </div>
      <Pagination
        meta={data?.pagination}
        label="review versions"
        onPage={setPage}
      />
      {view && (
        <SnapshotDialog
          postId={post.id}
          snapshotId={view}
          currentId={data.current_revision_id}
          close={() => setView(null)}
        />
      )}
      {editing && (
        <PublishRevision
          key={`${user.id}:${post.id}`}
          base={editing}
          post={{ ...post, revision: data.post_revision }}
          user={user}
          close={() => setEditing(null)}
          published={(snapshot) => {
            setEditing(null);
            setPage(1);
            setRetry((n) => n + 1);
            onPublished?.(snapshot);
          }}
        />
      )}
    </section>
  );
}
