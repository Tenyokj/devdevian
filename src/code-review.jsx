import React, { useEffect, useState } from "react";
import { api, dateStamp } from "./data";
import { Avatar, MD, ErrorMessage } from "./ui";
import { Pagination } from "./content";
import { Select } from "./controls";
import { CheckCircle2, RotateCcw, MessageSquareCode } from "lucide-react";

export function CodeReview({ post, user, requireUser, go }) {
  const [start, setStart] = useState(1),
    [end, setEnd] = useState(1),
    [body, setBody] = useState("");
  const [status, setStatus] = useState("all"),
    [version, setVersion] = useState("all"),
    [page, setPage] = useState(1),
    [snippetPage, setSnippetPage] = useState(1);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const lines = post.code ? post.code.split("\n") : [],
    paused = !!(post.archived_at || post.locked_at);
  useEffect(() => {
    setStart(1);
    setEnd(1);
    setPage(1);
    setSnippetPage(1);
    setData(null);
  }, [post.id, post.code]);
  useEffect(() => {
    let alive = true;
    setError("");
    setData(null);
    api(
      `/posts/${post.id}/code-reviews?status=${status}&version=${version}&page=${page}`,
    )
      .then((result) => alive && setData(result))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [post.id, post.code, user?.id, status, version, page, reload]);
  async function submit(e) {
    e.preventDefault();
    if (!user) {
      requireUser(() => {});
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${post.id}/code-reviews`, {
        method: "POST",
        body: {
          start_line: start,
          end_line: end,
          body,
          snippet_hash: data.snippet_hash,
        },
      });
      setBody("");
      setPage(1);
      setStatus("all");
      setVersion("all");
      setReload((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function resolve(item) {
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${post.id}/code-reviews/${item.id}`, {
        method: "PATCH",
        body: { resolved: !item.resolved, revision: item.revision },
      });
      setReload((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="code-review-workbench">
      <div className="line-review-heading">
        <MessageSquareCode size={18} />
        <strong>Review the snippet</strong>
      </div>
      <p className="muted">
        Select a line number. Shift-click another to select a range, or use the
        fields below. Feedback stays attached to this version of the code.
      </p>
      <div
        className="numbered-snippet"
        role="group"
        aria-label="Code snippet lines"
      >
        {lines
          .slice((snippetPage - 1) * 100, snippetPage * 100)
          .map((line, offset) => {
            const number = (snippetPage - 1) * 100 + offset + 1;
            return (
              <div
                key={number}
                className={
                  number >= start && number <= end
                    ? "snippet-line selected"
                    : "snippet-line"
                }
              >
                <button
                  type="button"
                  aria-label={`Select code line ${number}`}
                  aria-pressed={number >= start && number <= end}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      setStart(Math.min(start, number));
                      setEnd(Math.max(start, number));
                    } else {
                      setStart(number);
                      setEnd(number);
                    }
                  }}
                >
                  {number}
                </button>
                <code>{line || " "}</code>
              </div>
            );
          })}
      </div>
      <Pagination
        meta={{
          page: snippetPage,
          pages: Math.ceil(lines.length / 100),
          total: lines.length,
        }}
        onPage={setSnippetPage}
        label="code lines"
      />
      {!paused && post.code ? (
        <form className="line-feedback-form" onSubmit={submit}>
          <div className="line-range">
            <label>
              From line
              <input
                aria-label="Feedback start line"
                type="number"
                min="1"
                max={lines.length}
                required
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
            </label>
            <label>
              To line
              <input
                aria-label="Feedback end line"
                type="number"
                min={start}
                max={Math.min(lines.length, start + 49)}
                required
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
            </label>
            <span>Up to 50 lines per remark</span>
          </div>
          <label htmlFor={`line-feedback-${post.id}`}>
            What would you change?
          </label>
          <textarea
            id={`line-feedback-${post.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={2}
            maxLength={5000}
            rows={3}
            required
            placeholder="Explain the issue and suggest an improvement…"
          />
          <button
            className="button secondary"
            disabled={busy || !data || end < start || end - start >= 50}
          >
            {busy ? "Saving…" : "Add line feedback"}
          </button>
        </form>
      ) : (
        <p className="muted">
          {paused
            ? "New feedback is paused for this conversation."
            : "Add a code snippet to this publication to collect line feedback. Earlier remarks remain below."}
        </p>
      )}
      <div className="line-review-filters">
        <h3>Line feedback</h3>
        <Select
          aria-label="Line feedback status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </Select>
        <Select
          aria-label="Snippet version filter"
          value={version}
          onChange={(e) => {
            setVersion(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All snippet versions</option>
          <option value="current">Current snippet</option>
        </Select>
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {error && (
        <button
          type="button"
          className="text-button"
          onClick={() => setReload((v) => v + 1)}
        >
          Reload feedback
        </button>
      )}
      {!data && !error && <p role="status">Loading line feedback…</p>}
      {data?.items.length === 0 && (
        <p className="muted">
          No feedback matches these filters. A second pair of eyes can help.
        </p>
      )}
      {data?.items.map((item) => (
        <article
          className={
            "line-feedback-card" + (item.resolved ? " is-resolved" : "")
          }
          key={item.id}
        >
          <header>
            <button
              type="button"
              className="line-feedback-author"
              onClick={() => go("member/" + item.user_id)}
            >
              <Avatar name={item.name} image={item.author_avatar} />
              {item.name}
            </button>
            <time>{dateStamp(item.created)}</time>
          </header>
          <div className="line-feedback-meta">
            <strong>
              Lines {item.start_line}–{item.end_line}
            </strong>
            <span>{item.resolved ? "Resolved" : "Open"}</span>
            {item.outdated && (
              <span className="outdated-note">Earlier snippet version</span>
            )}
          </div>
          <pre aria-label="Reviewed code">
            <code>{item.quote}</code>
          </pre>
          <MD>{item.body}</MD>
          {item.updated_at && (
            <small className="muted">
              Status changed {dateStamp(item.updated_at)}
            </small>
          )}
          {user?.id === post.user_id && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => resolve(item)}
            >
              {item.resolved ? (
                <RotateCcw size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}{" "}
              {item.resolved ? "Reopen feedback" : "Mark resolved"}
            </button>
          )}
        </article>
      ))}
      <Pagination
        meta={data?.pagination}
        onPage={setPage}
        label="line feedback"
      />
      <p className="muted line-review-note">
        Resolving a remark does not accept a solution or close the conversation.
      </p>
    </div>
  );
}
