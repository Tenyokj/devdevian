import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Code2,
  FolderGit2,
  LayoutDashboard,
  GitPullRequest,
  Plus,
  Search,
  MessageSquare,
  Link2,
  LockKeyhole,
  RefreshCw,
  Terminal,
  CheckCircle2,
} from "lucide-react";
import { api, dateStamp, types } from "./data";
import { Avatar, ErrorMessage, MD, Modal } from "./ui";
import { Select } from "./controls";
import { Pagination } from "./content";
import { CodeReview } from "./code-review";
import {
  workspaceDraftKey,
  readWorkspaceDraft,
  saveWorkspaceDraft,
} from "./workspace-model.mjs";
import "./workspaces.css";
const labels = { open: "Open", in_progress: "In progress", ready: "Ready" };
const itemsOf = (value) => value.items || value;

function RequestDialog({ project, user, communities, close, done }) {
  const key = workspaceDraftKey(user.id, `request:${project.id}`);
  const [draft, setDraft] = useState(() => {
    try {
      return (
        readWorkspaceDraft(sessionStorage, key) || {
          title: "",
          body: "",
          kind: "question",
          community_id: "",
          code: "",
          review_focus: "",
        }
      );
    } catch {
      return {
        title: "",
        body: "",
        kind: "question",
        community_id: "",
        code: "",
        review_focus: "",
      };
    }
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [stored, setStored] = useState(true);
  const alive = useRef(true),
    cleared = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!cleared.current) {
      try {
        setStored(saveWorkspaceDraft(sessionStorage, key, draft));
      } catch {
        setStored(false);
      }
    }
  }, [key, draft]);
  const change = (field) => (e) => {
    setDraft({ ...draft, [field]: e.target.value });
    setPreview(false);
  };
  const valid =
    draft.title?.trim().length >= 5 &&
    draft.body?.trim().length >= 10 &&
    (draft.kind !== "review" ||
      (draft.code?.trim().length >= 10 &&
        draft.review_focus?.trim().length >= 10));
  async function publish() {
    if (busy || (!preview && !draft.created_id)) return;
    setBusy(true);
    setError("");
    let created = draft.created_id;
    try {
      if (!created) {
        const post = await api("/posts", {
          method: "POST",
          body: {
            title: draft.title,
            body: draft.body,
            kind: draft.kind,
            topic: project.topic,
            code: draft.kind === "review" ? draft.code : "",
            review_focus: draft.kind === "review" ? draft.review_focus : "",
            community_id: draft.community_id || null,
          },
        });
        created = post.id;
        // Record the published ID before linking. A link failure must never
        // turn the next click into another conversation publication.
        const next = { ...draft, created_id: created };
        setDraft(next);
        try {
          saveWorkspaceDraft(sessionStorage, key, next);
        } catch {
          /* Kept in editor memory. */
        }
      }
      const association = await api(
        `/projects/${project.id}/work-requests/${created}`,
      );
      if (!association.linked)
        await api(`/projects/${project.id}/work-requests/${created}`, {
          method: "PUT",
          body: { state: "open", expected_version: association.version },
        });
      cleared.current = true;
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* The server saved the request. */
      }
      if (alive.current) done(created, draft.kind);
    } catch (e) {
      if (alive.current)
        setError(
          (created
            ? "Conversation published. Linking is not confirmed; retry linking without creating another conversation. "
            : "") + e.message,
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal
      title="New work request"
      onClose={() => !busy && close()}
      dismissible={!busy}
      wide
      className="dw-dialog"
    >
      <span className="eyebrow">{project.name}</span>
      <h2>Make the next step clear.</h2>
      <p className="dw-draft" role="status">
        {stored
          ? "Draft saved in this browser tab for this account."
          : "Tab storage is unavailable. Keep the editor open to retain your draft."}
      </p>
      {!draft.created_id && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setDraft({
              title: "",
              body: "",
              kind: "question",
              community_id: "",
              code: "",
              review_focus: "",
            });
            setPreview(false);
            setError("");
            try {
              sessionStorage.removeItem(key);
            } catch {}
          }}
        >
          Discard request draft
        </button>
      )}
      {draft.created_id ? (
        <div className="dw-notice">
          <CheckCircle2 size={18} />
          <p>
            Your conversation #{draft.created_id} is already published. The next
            step only links it to this project.
          </p>
          <a href={"#post/" + draft.created_id}>
            Open published conversation <ArrowUpRight size={14} />
          </a>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              cleared.current = true;
              try {
                sessionStorage.removeItem(key);
              } catch {}
              close();
            }}
          >
            Leave conversation unlinked
          </button>
        </div>
      ) : !preview ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setPreview(true);
          }}
        >
          <div className="dw-form-grid">
            <label>
              Request type
              <Select
                value={draft.kind}
                onChange={change("kind")}
                aria-label="Work request type"
              >
                {["question", "discussion", "review"].map((k) => (
                  <option value={k} key={k}>
                    {types[k].label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Audience
              <Select
                value={draft.community_id}
                onChange={change("community_id")}
                aria-label="Work request audience"
              >
                <option value="">Public conversation</option>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · private
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <p className="muted">
            Private requests remain visible only to approved community members,
            even on a public project.
          </p>
          <label>
            Title
            <input
              aria-label="Work request title"
              required
              minLength={5}
              maxLength={160}
              value={draft.title}
              onChange={change("title")}
            />
          </label>
          <label>
            What do you need help with?
            <textarea
              aria-label="Work request message"
              required
              minLength={10}
              maxLength={15000}
              rows={5}
              value={draft.body}
              onChange={change("body")}
            />
          </label>
          {draft.kind === "review" && (
            <>
              <label>
                Code snippet
                <textarea
                  className="dw-editor"
                  aria-label="Work request code"
                  required
                  minLength={10}
                  maxLength={20000}
                  rows={7}
                  value={draft.code}
                  onChange={change("code")}
                  spellCheck="false"
                />
              </label>
              <label>
                Review focus
                <textarea
                  aria-label="Work request review focus"
                  required
                  minLength={10}
                  maxLength={1500}
                  rows={3}
                  value={draft.review_focus}
                  onChange={change("review_focus")}
                />
              </label>
            </>
          )}
          <div className="dw-bottom">
            <button className="button primary" disabled={!valid}>
              Preview request
            </button>
          </div>
        </form>
      ) : (
        <section aria-label="Work request preview">
          <span className="dw-badge">
            {draft.community_id ? "Private community" : "Public conversation"}
          </span>
          <h3>{draft.title}</h3>
          <MD>{draft.body}</MD>
          {draft.kind === "review" && (
            <>
              <p>{draft.review_focus}</p>
              <pre className="dw-preview-file">
                <code>{draft.code}</code>
              </pre>
            </>
          )}
        </section>
      )}
      <ErrorMessage error={error} />
      {(preview || draft.created_id) && (
        <div className="dw-toolbar dw-bottom">
          {!draft.created_id && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPreview(false)}
            >
              Back to editing
            </button>
          )}
          <button className="button primary" disabled={busy} onClick={publish}>
            {busy
              ? "Saving…"
              : draft.created_id
                ? "Retry linking request"
                : "Publish and link request"}
          </button>
        </div>
      )}
    </Modal>
  );
}
function LinkRequest({ project, close, done }) {
  const [posts, setPosts] = useState(null),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPosts(null);
    setError("");
    setSelected("");
    api("/posts?author=me&limit=12&page=" + page, { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setPosts(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [page, retry]);
  async function link(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const current = await api(
        `/projects/${project.id}/work-requests/${selected}`,
      );
      if (!current.linked)
        await api(`/projects/${project.id}/work-requests/${selected}`, {
          method: "PUT",
          body: { state: "open", expected_version: current.version },
        });
      if (alive.current) done();
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal
      title="Link a conversation"
      onClose={() => !busy && close()}
      dismissible={!busy}
      className="dw-dialog"
    >
      <h2>Bring existing work together.</h2>
      <p>
        You can link your own conversations. Their replies, visibility and
        original links stay the same.
      </p>
      <form onSubmit={link}>
        <div className="dw-link-list">
          {posts &&
            itemsOf(posts)
              .filter(
                (p) =>
                  p.id !== project.post_id &&
                  !p.project &&
                  !p.archived_at &&
                  !p.locked_at,
              )
              .map((p) => (
                <label key={p.id}>
                  <input
                    type="radio"
                    name="request"
                    value={p.id}
                    checked={selected === String(p.id)}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={busy}
                  />
                  <span>
                    <strong>{p.title}</strong>
                    <small>
                      {types[p.kind]?.label} ·{" "}
                      {p.community_id ? "Private" : "Public"}
                    </small>
                  </span>
                </label>
              ))}
        </div>
        {!posts && !error && <p role="status">Loading your conversations…</p>}
        {posts && !itemsOf(posts).length && (
          <p>No conversations yet. Create a work request instead.</p>
        )}
        <Pagination
          meta={posts?.pagination}
          label="your conversations"
          onPage={setPage}
        />
        <ErrorMessage error={error} />
        {error && (
          <button
            type="button"
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Reload conversations
          </button>
        )}
        <button className="button primary" disabled={busy || !selected}>
          {busy ? "Linking…" : "Link selected conversation"}
        </button>
      </form>
    </Modal>
  );
}
function UnlinkRequest({ projectId, request, close, done }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function unlink() {
    setBusy(true);
    setError("");
    try {
      await api(`/projects/${projectId}/work-requests/${request.id}`, {
        method: "DELETE",
        body: { expected_version: request.work_version },
      });
      if (alive.current) done();
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal
      title="Unlink work request"
      onClose={() => !busy && close()}
      dismissible={!busy}
      className="dw-dialog"
    >
      <h2>Remove this project link?</h2>
      <p>{request.title}</p>
      <p>
        The conversation, code versions and replies stay available at their
        original address.
      </p>
      <ErrorMessage error={error} />
      <div className="dw-bottom">
        <button className="button secondary" disabled={busy} onClick={close}>
          Keep linked
        </button>
        <button className="button primary" disabled={busy} onClick={unlink}>
          {busy ? "Unlinking…" : "Unlink request"}
        </button>
      </div>
    </Modal>
  );
}

function WorkspaceReview({ projectId, postId, user, requireUser, go }) {
  const [post, setPost] = useState(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPost(null);
    setError("");
    Promise.all([
      api(`/posts/${postId}`, { signal: controller.signal }),
      api(`/projects/${projectId}/work-requests/${postId}`, {
        signal: controller.signal,
      }),
    ])
      .then(([p, link]) => {
        if (!link.linked || p.kind !== "review")
          throw Error("This review is not linked to this workspace.");
        if (!controller.signal.aborted) setPost(p);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [projectId, postId, user?.id, retry]);
  return (
    <section className="dw-review" aria-label="Workspace code review">
      <ErrorMessage error={error} />
      {error && (
        <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
          Retry review
        </button>
      )}
      {!post && !error && <p role="status">Opening the review…</p>}
      {post && (
        <>
          <div className="dw-heading">
            <div>
              <span className="eyebrow">CODE REVIEW · #{post.id}</span>
              <h2>{post.title}</h2>
            </div>
            <a className="text-button" href={"#post/" + post.id}>
              Full conversation <ArrowUpRight size={15} />
            </a>
          </div>
          <MD>{post.body}</MD>
          <p className="dw-focus">{post.review_focus}</p>
          <CodeReview
            onPublished={(snapshot) =>
              setPost((p) => ({
                ...p,
                code: snapshot.code,
                review_focus: snapshot.review_focus,
                revision: snapshot.post_revision,
                github_context: snapshot.context.github_context,
                review_files: snapshot.files,
              }))
            }
            key={post.id}
            post={post}
            user={user}
            requireUser={requireUser}
            go={go}
          />
        </>
      )}
    </section>
  );
}

export function Workspace({
  id,
  route,
  user,
  requireUser,
  go,
  communities = [],
}) {
  const parts = route.split("/"),
    tab = parts[2] || "overview",
    reviewId = parts[3];
  const [workspace, setWorkspace] = useState(null),
    [requests, setRequests] = useState(null),
    [error, setError] = useState(""),
    [listError, setListError] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [state, setState] = useState(labels[parts[3]] ? parts[3] : ""),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [dialog, setDialog] = useState(""),
    [busy, setBusy] = useState(null),
    [unlinking, setUnlinking] = useState(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api(`/projects/${id}/workspace`, { signal: controller.signal })
      .then((r) => {
        if (r.capabilities?.work_requests !== 1)
          throw Error("This server does not support Workspaces yet.");
        if (!controller.signal.aborted) setWorkspace(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setWorkspace(null);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, [id, user?.id, reload]);
  useEffect(() => {
    const controller = new AbortController();
    setRequests(null);
    setListError("");
    const params = new URLSearchParams({
      page,
      q: search,
      ...(state ? { state } : {}),
      ...(tab === "review" ? { kind: "review" } : {}),
    });
    api(`/projects/${id}/work-requests?${params}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setRequests(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setListError(e.message);
      });
    return () => controller.abort();
  }, [id, user?.id, page, search, state, reload, tab]);
  const refresh = () => setReload((n) => n + 1);
  async function changeState(request, next) {
    setBusy(request.id);
    setListError("");
    try {
      await api(`/projects/${id}/work-requests/${request.id}`, {
        method: "PATCH",
        body: { state: next, expected_version: request.work_version },
      });
      if (alive.current) refresh();
    } catch (e) {
      if (alive.current) setListError(e.message);
    } finally {
      if (alive.current) setBusy(null);
    }
  }
  if (error)
    return (
      <section className="dw-empty">
        <h1>Couldn’t open this workspace.</h1>
        <ErrorMessage error={error} />
        <button className="button secondary" onClick={refresh}>
          Try again
        </button>
        <a className="text-button" href="#projects">
          Back to Projects
        </a>
      </section>
    );
  if (!workspace)
    return (
      <div className="loading-state" role="status">
        <span className="spinner" />
        Opening workspace…
      </div>
    );
  const { project, counts, permissions } = workspace;
  const openRequest = (r) =>
    go(r.kind === "review" ? `workspace/${id}/review/${r.id}` : `post/${r.id}`);
  const list =
    requests?.items.filter((r) => tab !== "review" || r.kind === "review") ||
    [];
  return (
    <div className="dw-workspace" aria-label={project.name + " workspace"}>
      <aside className="dw-nav">
        <a className="back-link" href="#projects">
          <ArrowLeft size={14} />
          Projects
        </a>
        <div className="dw-project-mark">
          <FolderGit2 size={25} />
          <strong>{project.name}</strong>
          <small>Project workspace</small>
        </div>
        <nav aria-label="Workspace navigation">
          {[
            ["overview", "Overview", LayoutDashboard],
            ["work", "Work requests", GitPullRequest],
            ["review", "Code review", Code2],
          ].map(([key, label, Icon]) => (
            <a
              href={`#workspace/${id}/${key}`}
              key={key}
              aria-current={tab === key ? "page" : undefined}
            >
              <Icon size={17} />
              {label}
              {key === "work" && <small>{counts.total}</small>}
            </a>
          ))}
        </nav>
        <div className="dw-nav-note">
          <LockKeyhole size={16} />
          <p>Private requests keep their community permissions.</p>
        </div>
        <a className="text-button" href={"#post/" + project.post_id}>
          Project introduction <ArrowUpRight size={14} />
        </a>
      </aside>
      <div className="dw-main">
        <header className="dw-hero">
          <div>
            <span className="eyebrow">PROJECT WORKSPACE · {project.stage}</span>
            <h1>
              {project.name}
              <span>.</span>
            </h1>
            <p>{project.description}</p>
          </div>
          {permissions.manage_requests && (
            <div className="dw-actions">
              <button
                className="button primary"
                onClick={() => requireUser(() => setDialog("new"))}
              >
                <Plus size={16} />
                New work request
              </button>
              <button className="text-button" onClick={() => setDialog("link")}>
                <Link2 size={15} />
                Link a conversation
              </button>
            </div>
          )}
        </header>
        {tab === "overview" && (
          <>
            <div className="dw-stats">
              {Object.entries(labels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    setState(key);
                    setPage(1);
                    go(`workspace/${id}/work/${key}`);
                  }}
                >
                  <span>{label}</span>
                  <strong>{counts[key]}</strong>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </div>
            <div className="dw-context">
              <div>
                <span className="eyebrow">THE NEXT USEFUL STEP</span>
                <h2>
                  A little context.
                  <br />
                  Better contributions.
                </h2>
                <MD>{project.help}</MD>
              </div>
              <div className="dw-context-links">
                {project.repo && (
                  <a href={project.repo} target="_blank" rel="noreferrer">
                    Source repository <ArrowUpRight size={17} />
                  </a>
                )}
                {project.url && (
                  <a href={project.url} target="_blank" rel="noreferrer">
                    Visit the project <ArrowUpRight size={17} />
                  </a>
                )}
                <a href={"#post/" + project.post_id}>
                  Project updates & discussion <MessageSquare size={17} />
                </a>
                <p>
                  <Terminal size={17} />
                  One account. The same conversations in your browser and
                  terminal.
                </p>
              </div>
            </div>
          </>
        )}
        {tab === "review" && reviewId ? (
          <WorkspaceReview
            key={`${user?.id || "guest"}:${reviewId}`}
            projectId={id}
            postId={reviewId}
            user={user}
            requireUser={requireUser}
            go={go}
          />
        ) : (
          <section className="dw-requests" aria-label="Workspace requests">
            <div className="dw-heading">
              <div>
                <span className="eyebrow">BUILD IN GOOD COMPANY</span>
                <h2>
                  {tab === "review"
                    ? "A second pair of eyes."
                    : tab === "overview"
                      ? "Work worth sharing."
                      : "One place for the next step."}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Refresh workspace requests"
                onClick={refresh}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <div className="dw-toolbar">
              <label className="dw-search">
                <Search size={16} />
                <input
                  aria-label="Search workspace requests"
                  placeholder="Find a request…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <Select
                aria-label="Work request status"
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {Object.entries(labels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <ErrorMessage error={listError} />
            {listError && (
              <button className="text-button" onClick={refresh}>
                Reload requests
              </button>
            )}
            {!requests && !listError && (
              <p role="status">Loading visible requests…</p>
            )}
            <div className="dw-request-grid">
              {list.map((r) => (
                <article className="dw-request" key={r.id}>
                  <div className="dw-request-meta">
                    <span>{types[r.kind]?.label || r.kind}</span>
                    {r.community_id && (
                      <span>
                        <LockKeyhole size={12} />
                        Private
                      </span>
                    )}
                    <span className={"dw-state dw-" + r.state}>
                      {labels[r.state]}
                    </span>
                  </div>
                  <button
                    className="dw-request-title"
                    onClick={() => openRequest(r)}
                  >
                    <h3>{r.title}</h3>
                    <ArrowUpRight size={17} />
                  </button>
                  <p>{r.excerpt}</p>
                  <footer>
                    <button
                      className="dw-author"
                      onClick={() => go("member/" + r.user_id)}
                    >
                      <Avatar
                        name={r.author_name || "Developer"}
                        size="small"
                      />
                      <span>
                        {r.author_name}
                        <small>{dateStamp(r.created)}</small>
                      </span>
                    </button>
                    <span>
                      <MessageSquare size={13} />
                      {r.reply_count}
                    </span>
                  </footer>
                  {permissions.manage_requests && (
                    <label className="dw-state-control">
                      Request status
                      <Select
                        aria-label={`Status of ${r.title}`}
                        value={r.state}
                        disabled={busy === r.id}
                        onChange={(e) => changeState(r, e.target.value)}
                      >
                        {Object.entries(labels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  {permissions.manage_requests && (
                    <button
                      className="text-button dw-unlink"
                      aria-label={`Unlink ${r.title}`}
                      onClick={() => setUnlinking(r)}
                    >
                      Unlink
                    </button>
                  )}
                </article>
              ))}
            </div>
            {requests && !list.length && (
              <div className="dw-empty">
                <GitPullRequest size={28} />
                <h3>
                  {search || state
                    ? "No matching requests."
                    : tab === "review"
                      ? "The next review starts here."
                      : "A project begins with a useful question."}
                </h3>
                <p>
                  {search || state
                    ? "Try a different search or status."
                    : "Link an existing conversation or share a focused work request."}
                </p>
                {permissions.manage_requests && (
                  <button
                    className="button secondary"
                    onClick={() => setDialog("new")}
                  >
                    Create a work request
                  </button>
                )}
              </div>
            )}
            <Pagination
              meta={requests?.pagination}
              label="work requests"
              onPage={setPage}
            />
          </section>
        )}
      </div>
      {unlinking && (
        <UnlinkRequest
          projectId={id}
          request={unlinking}
          close={() => setUnlinking(null)}
          done={() => {
            setUnlinking(null);
            refresh();
          }}
        />
      )}
      {dialog === "new" && (
        <RequestDialog
          key={`${user.id}:${id}`}
          project={project}
          user={user}
          communities={communities}
          close={() => setDialog("")}
          done={(post, kind) => {
            setDialog("");
            refresh();
            go(
              kind === "review"
                ? `workspace/${id}/review/${post}`
                : `post/${post}`,
            );
          }}
        />
      )}
      {dialog === "link" && (
        <LinkRequest
          project={project}
          close={() => setDialog("")}
          done={() => {
            setDialog("");
            refresh();
          }}
        />
      )}
    </div>
  );
}
