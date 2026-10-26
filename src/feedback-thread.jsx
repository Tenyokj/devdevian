import React, { useState, useEffect, useCallback } from "react";
import { api, dateStamp } from "./data";
import { MD, Avatar, Modal, ErrorMessage } from "./ui";
import { Pagination } from "./content";
import { Select } from "./controls";

export function FeedbackActions({
  row,
  user,
  url,
  reportUrl,
  replyId = 0,
  onChange,
}) {
  const [action, setAction] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const close = useCallback(() => {
    if (!busy) setAction("");
  }, [busy]);
  if (!user || row.deleted_at) return null;
  return (
    <>
      <div className="feedback-actions">
        {row.user_id === user.id && (
          <>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setText(row.body);
                setError("");
                setAction("edit");
              }}
            >
              Edit feedback
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setError("");
                setAction("delete");
              }}
            >
              Delete feedback
            </button>
          </>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setText("");
            setError("");
            setAction("report");
          }}
        >
          Report feedback
        </button>
      </div>
      {action && (
        <Modal
          title={
            action === "edit"
              ? "Edit feedback"
              : action === "delete"
                ? "Delete feedback?"
                : "Report feedback"
          }
          onClose={close}
        >
          <h2>
            {action === "delete"
              ? "Delete your feedback?"
              : action === "edit"
                ? "Improve your feedback."
                : "Help keep this space useful."}
          </h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api(action === "report" ? reportUrl : url, {
                  method:
                    action === "report"
                      ? "POST"
                      : action === "delete"
                        ? "DELETE"
                        : "PATCH",
                  body:
                    action === "report"
                      ? { reason: text, reply_id: replyId }
                      : {
                          revision: row.revision,
                          ...(action === "edit" ? { body: text } : {}),
                        },
                });
                if (action !== "report") await onChange();
                setAction("");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {action === "delete" ? (
              <p>
                Your text will be removed. Other members’ replies remain in the
                thread.
              </p>
            ) : (
              <label>
                {action === "report" ? "Reason for reporting" : "Your feedback"}
                <textarea
                  aria-label={
                    action === "report"
                      ? "Feedback report reason"
                      : "Edit feedback text"
                  }
                  rows={5}
                  required
                  minLength={action === "report" ? 5 : 2}
                  maxLength={action === "report" ? 1000 : 5000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
            )}
            <ErrorMessage error={error} />
            <button className="button primary" disabled={busy}>
              {busy
                ? "Saving…"
                : action === "report"
                  ? "Submit report"
                  : action === "delete"
                    ? "Confirm deletion"
                    : "Save feedback"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function FeedbackReplies({
  item,
  post,
  user,
  requireUser,
  targetReply,
  onChanged,
}) {
  const [open, setOpen] = useState(!!targetReply),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [epoch, setEpoch] = useState(0),
    [jump, setJump] = useState(targetReply || null);
  const url = `/posts/${post.id}/code-reviews/${item.id}`;
  useEffect(() => {
    if (targetReply) {
      setOpen(true);
      setJump(targetReply);
    }
  }, [targetReply]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    api(url + `/replies?page=${page}${jump ? "&target_id=" + jump : ""}`)
      .then((r) => {
        if (alive) {
          setData(r);
          setError("");
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, page, epoch, jump, url, user?.id]);
  useEffect(() => {
    if (!data || !targetReply) return;
    const element = document.getElementById("feedback-reply-" + targetReply);
    if (element) {
      element.scrollIntoView({ block: "center" });
      element.focus({ preventScroll: true });
    }
  }, [data, targetReply]);
  const reload = async () => {
    setEpoch((v) => v + 1);
    onChanged?.();
  };
  return (
    <div className="feedback-thread">
      <button
        type="button"
        className="text-button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide thread" : "Discuss feedback"}
      </button>
      {open && (
        <>
          <ErrorMessage error={error} />
          {error && (
            <button type="button" onClick={() => setEpoch((v) => v + 1)}>
              Reload thread
            </button>
          )}
          {!data && !error && <p role="status">Loading feedback replies…</p>}
          {data?.map((r) => (
            <article
              key={r.id}
              id={"feedback-reply-" + r.id}
              tabIndex={-1}
              className={
                "feedback-thread-reply" +
                (Number(targetReply) === r.id ? " is-targeted" : "")
              }
            >
              <header>
                <Avatar name={r.name} image={r.author_avatar} />
                <strong>{r.name}</strong>
                <time>{dateStamp(r.created)}</time>
              </header>
              {r.deleted_at ? (
                <p className="muted">This reply was deleted.</p>
              ) : (
                <MD>{r.body}</MD>
              )}
              {r.edited_at && !r.deleted_at && (
                <small>Edited {dateStamp(r.edited_at)}</small>
              )}
              <FeedbackActions
                row={r}
                user={user}
                url={url + "/replies/" + r.id}
                reportUrl={url + "/report"}
                replyId={r.id}
                onChange={reload}
              />
            </article>
          ))}
          <Pagination
            meta={data?.pagination}
            onPage={(p) => {
              setPage(p);
              setJump(null);
            }}
            label={"feedback replies " + item.id}
          />
          {!(post.archived_at || post.locked_at) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!user) {
                  requireUser(() => {});
                  return;
                }
                setBusy(true);
                try {
                  const reply = await api(url + "/replies", {
                    method: "POST",
                    body: { body },
                  });
                  setBody("");
                  setJump(reply.id);
                  setEpoch((v) => v + 1);
                  setError("");
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor={"feedback-answer-" + item.id}>
                Reply to this feedback
              </label>
              <textarea
                id={"feedback-answer-" + item.id}
                rows={3}
                minLength={2}
                maxLength={5000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
              <button className="button secondary" disabled={busy}>
                {busy ? "Sending…" : "Send feedback reply"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
export function FeedbackModeration({ scope }) {
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState("open"),
    [data, setData] = useState(null),
    [selected, setSelected] = useState(null),
    [note, setNote] = useState(""),
    [decision, setDecision] = useState("dismissed"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [epoch, setEpoch] = useState(0);
  const close = useCallback(() => {
    if (!busy) setSelected(null);
  }, [busy]);
  useEffect(() => {
    let alive = true;
    setData(null);
    api(
      `/moderation/code-feedback?scope=${scope}&filter=${filter}&page=${page}`,
    )
      .then((r) => {
        if (alive) {
          setData(r);
          setError("");
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [scope, page, filter, epoch]);
  return (
    <section className="feedback-moderation">
      <h2>Reported code feedback</h2>
      <p>
        Reports about individual remarks and replies. Decisions affect the
        selected feedback, not the whole publication.
      </p>
      <Select
        aria-label="Feedback report status"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setPage(1);
        }}
      >
        <option value="open">Needs review</option>
        <option value="reviewed">Reviewed</option>
      </Select>
      <ErrorMessage error={error} />
      {!data && !error && <p>Loading feedback reports…</p>}
      {data?.length === 0 && <p>No feedback reports match this filter.</p>}
      {data?.map((r) => (
        <article className="report-card" key={r.id}>
          <h3>{r.post_title}</h3>
          <span>
            {r.reply_id ? "Reply" : "Remark"} · {r.status}
          </span>
          <MD>{r.reported_body || "This feedback was deleted."}</MD>
          <p>Report: {r.reason}</p>
          <small>
            {r.reporter_name} · {dateStamp(r.created)}
          </small>
          <p>{r.review_note}</p>
          <a
            className="text-button"
            href={`#post/${r.post_id}/review/${r.review_id}${r.reply_id ? "/reply/" + r.reply_id : ""}`}
          >
            Open reported feedback
          </a>
          {r.status === "open" && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSelected(r);
                setNote("");
                setDecision("dismissed");
              }}
            >
              Review feedback report
            </button>
          )}
        </article>
      ))}
      <Pagination
        meta={data?.pagination}
        onPage={setPage}
        label="feedback reports"
      />
      {selected && (
        <Modal title="Review feedback report" onClose={close}>
          <h2>Review the selected feedback.</h2>
          <MD>{selected.reported_body || "Deleted feedback"}</MD>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/moderation/code-feedback/" + selected.id, {
                  method: "PATCH",
                  body: {
                    status: decision === "hide" ? "resolved" : decision,
                    remove: decision === "hide",
                    note,
                  },
                });
                setSelected(null);
                setEpoch((v) => v + 1);
                setError("");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Select
              aria-label="Feedback moderation decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="dismissed">Dismiss · no issue found</option>
              <option value="resolved">Resolve · record decision</option>
              <option value="hide">Resolve · remove selected feedback</option>
            </Select>
            <label>
              Decision note
              <textarea
                aria-label="Feedback moderation note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                minLength={5}
                maxLength={1000}
                required
              />
            </label>
            <ErrorMessage error={error} />
            <button className="button primary" disabled={busy}>
              Save feedback decision
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
