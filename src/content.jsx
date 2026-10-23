import React, { useState, useEffect, createContext, useContext } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Paperclip,
  X,
  FileText,
  LockKeyhole,
  MessageCircle,
  PenLine,
  Check,
  ChevronDown,
  Link as LinkIcon,
} from "lucide-react";
import { api, readAPIResponse, dateStamp } from "./data";
import { Avatar, MD, ErrorMessage } from "./ui";
export function Pagination({ meta, onPage, label = "items" }) {
  if (!meta || meta.pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={`${label} pagination`}>
      <span>
        {meta.total} {label} · Page {meta.page} of {meta.pages}
      </span>
      <div>
        <button
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          aria-label={`Previous ${label} page`}
        >
          <ChevronLeft size={16} />
        </button>
        {[...new Set([1, meta.pages, meta.page - 1, meta.page, meta.page + 1])]
          .filter((p) => p >= 1 && p <= meta.pages)
          .sort((a, b) => a - b)
          .map((p, i, all) => (
            <React.Fragment key={p}>
              {i > 0 && p > all[i - 1] + 1 && <span>…</span>}
              <button
                className={p === meta.page ? "selected" : ""}
                aria-current={p === meta.page ? "page" : undefined}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            </React.Fragment>
          ))}
        <button
          disabled={meta.page >= meta.pages}
          onClick={() => onPage(meta.page + 1)}
          aria-label={`Next ${label} page`}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
export function AttachmentPicker({ files, onChange, onBusy }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="attachment-picker">
      <label className="attachment-input">
        <Paperclip size={15} />
        {busy ? "Uploading…" : "Attach photos or files"}
        <input
          type="file"
          multiple
          disabled={busy || files.length >= 5}
          accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.zip,.txt,.md,.json,.js,.jsx,.ts,.tsx,.py,.rs,.sol,.css,.csv,.log,.yml,.yaml"
          onChange={async (e) => {
            const selected = [...e.target.files];
            e.target.value = "";
            setError("");
            if (selected.length + files.length > 5) {
              setError("Up to 5 files per message.");
              return;
            }
            if (selected.some((f) => !f.size || f.size > 4 * 1024 * 1024)) {
              setError("Files must be non-empty and at most 4 MB each.");
              return;
            }
            setBusy(true);
            onBusy?.(true);
            try {
              const uploaded = [];
              for (const f of selected) {
                const r = await fetch("/api/uploads", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/octet-stream",
                    "X-Filename": encodeURIComponent(f.name),
                  },
                  body: f,
                  signal: AbortSignal.timeout(30000),
                });
                const d = await readAPIResponse(r);
                uploaded.push(d);
                onChange([...files, ...uploaded]);
              }
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
              onBusy?.(false);
            }
          }}
        />
      </label>
      <small>5 files · 4 MB each · photos, PDF, ZIP, text/code</small>
      {files.length > 0 && (
        <div className="selected-files">
          {files.map((f) => (
            <div key={f.id}>
              {f.mime.startsWith("image/") ? (
                <img src={f.url} alt={f.name} />
              ) : (
                <FileText size={18} />
              )}
              <span>{f.name}</span>
              <button
                type="button"
                onClick={() =>
                  onChange(files.filter((item) => item.id !== f.id))
                }
                aria-label={"Remove " + f.name}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}
export function Attachments({ files = [], compact = false }) {
  if (!files.length) return null;
  const images = files.filter((f) => f.mime.startsWith("image/"));
  const docs = files.filter((f) => !f.mime.startsWith("image/"));
  return (
    <div className={"attachments " + (compact ? "compact" : "")}>
      <div className="attached-images">
        {(compact ? images.slice(0, 1) : images).map((f) => (
          <a href={f.url} target="_blank" rel="noreferrer" key={f.id}>
            <img src={f.url} alt={f.name} loading="lazy" />
          </a>
        ))}
      </div>
      {compact && images.length > 1 && (
        <span className="more-images">+{images.length - 1} more images</span>
      )}
      {docs.length > 0 && (
        <div className="attached-documents">
          {(compact ? docs.slice(0, 2) : docs).map((f) => (
            <a href={f.url} key={f.id} download>
              <Paperclip size={14} />
              <span>{f.name}</span>
              <small>{Math.ceil(f.size / 1024)} KB</small>
            </a>
          ))}
          {compact && docs.length > 2 && (
            <small>+{docs.length - 2} files</small>
          )}
        </div>
      )}
    </div>
  );
}
const ReplyContext = createContext(null);
export function ReplyThreads(props) {
  return (
    <ReplyContext.Provider value={props}>
      <ReplyBranch />
    </ReplyContext.Provider>
  );
}
function ReplyBranch({ parent = null, depth = 0 }) {
  const { post } = useContext(ReplyContext),
    path = post.reply_path || [];
  const desired = path.find((r) => r.parent_id === parent)?.page || 1;
  const [page, setPage] = useState(
      parent === null ? post.reply_pagination?.page || desired : desired,
    ),
    [data, setData] = useState(
      parent === null
        ? Object.assign([...post.replies], {
            pagination: post.reply_pagination,
          })
        : null,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api(
      `/posts/${post.id}/replies?page=${page}&limit=10${parent ? "&parent_id=" + parent : ""}`,
    )
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, parent, post]);
  return (
    <div
      className={depth ? "nested-replies" : ""}
      style={
        depth > 4 ? { marginLeft: 0, paddingLeft: 0, borderLeft: 0 } : undefined
      }
    >
      <ErrorMessage error={error} />
      {loading && !data && <p className="reply-loading">Loading replies…</p>}
      {data?.map((r) => (
        <ReplyRow key={r.id} r={r} depth={depth} />
      ))}
      <Pagination
        meta={data?.pagination}
        label={depth ? "thread replies" : "replies"}
        onPage={(p) => {
          setPage(p);
          setData(null);
        }}
      />
    </div>
  );
}
function ReplyRow({ r, depth }) {
  const { post, user, go, onReply, onEdit, onSolve, requireUser } =
    useContext(ReplyContext);
  const [expanded, setExpanded] = useState(
    (post.reply_path || []).some((p) => p.parent_id === r.id),
  );
  const target = post.reply_path?.at(-1)?.id === r.id;
  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById("reply-" + r.id);
      const reduced =
        user?.preferences?.reduce_motion ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [target, r.id, user?.preferences?.reduce_motion]);
  return (
    <article
      id={"reply-" + r.id}
      tabIndex={target ? -1 : undefined}
      aria-current={target ? "location" : undefined}
      className={
        "reply " +
        (target ? "is-targeted " : "") +
        (post.accepted_reply_id === r.id ? "accepted" : "")
      }
    >
      <div className="reply-heading">
        <button
          className="post-author"
          onClick={() => go("member/" + r.user_id)}
        >
          <Avatar name={r.name} image={r.author_avatar} size="small" />
          <span>{r.name}</span>
        </button>
        <span>
          {dateStamp(r.created)}
          {r.updated_at && (
            <span className="edited-timestamp">
              Edited {dateStamp(r.updated_at)}
            </span>
          )}
        </span>
        {post.accepted_reply_id === r.id && (
          <span className="resolved-badge">
            <Check size={12} />
            {post.kind === "review" ? "Review addressed" : "Accepted solution"}
          </span>
        )}
      </div>
      {target && <span className="linked-reply-label">Linked reply</span>}
      <MD>{r.body}</MD>
      <Attachments files={r.attachments} />
      <div className="reply-actions">
        <a
          href={`#post/${post.id}/reply/${r.id}`}
          aria-label="Link to this reply"
        >
          <LinkIcon size={13} /> Link
        </a>
        <button
          disabled={!!(post.archived_at || post.locked_at)}
          onClick={() => requireUser(() => onReply(r))}
        >
          <MessageCircle size={13} />
          Reply
        </button>
        {user?.id === r.user_id && (
          <button onClick={() => onEdit({ content: r, reply: true })}>
            <PenLine size={13} />
            Edit reply
          </button>
        )}
        {user?.id === post.user_id &&
          ["question", "review"].includes(post.kind) && (
            <button onClick={() => onSolve(r)}>
              <Check size={13} />
              {post.accepted_reply_id === r.id
                ? "Unmark"
                : post.kind === "review"
                  ? "Mark review addressed"
                  : "Mark as solution"}
            </button>
          )}
        {r.children_count > 0 && (
          <button
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown size={13} />
            {expanded ? "Hide" : `Show ${r.children_count}`} replies
          </button>
        )}
      </div>
      {expanded && <ReplyBranch parent={r.id} depth={depth + 1} />}
    </article>
  );
}
