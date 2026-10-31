import { FeedbackActions, FeedbackReplies } from "./feedback-thread";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { api, dateStamp } from "./data";
import { Avatar, MD, ErrorMessage } from "./ui";
import { Pagination } from "./content";
import { Select } from "./controls";
import { CheckCircle2, RotateCcw, MessageSquareCode } from "lucide-react";

import { reviewNavigation, reviewFileForRange } from "./review-navigation.mjs";

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
  const [fileIndex, setFileIndex] = useState(0);
  const [pendingLine, setPendingLine] = useState(null);
  const snippet = useRef(null);
  const [jumpToTarget, setJumpToTarget] = useState(true);
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const parts = hash.split("/"),
    targetId = parts[2] === "review" ? parts[3] : null,
    targetReply = parts[4] === "reply" ? parts[5] : null;
  const lines = post.code ? post.code.split("\n") : [],
    paused = !!(post.archived_at || post.locked_at);
  const files = useMemo(
    () => reviewNavigation(post.code, post.github_context),
    [post.code, post.github_context],
  );
  const file = files[fileIndex] || files[0];
  const first = file?.patch_start || 1;
  const last = file?.patch_end || lines.length;
  const pageStart = first + (snippetPage - 1) * 100;
  const hunks = file?.hunks || [];
  const activeHunk = hunks.findLastIndex((h) => h.line <= start);
  function showLine(line, endLine = line) {
    const index = files.findIndex(
      (f) => line >= f.patch_start && line <= f.patch_end,
    );
    setFileIndex(Math.max(0, index));
    setSnippetPage(
      Math.floor((line - (files[index]?.patch_start || 1)) / 100) + 1,
    );
    setStart(line);
    setEnd(endLine);
    setPendingLine(line);
  }
  useEffect(() => {
    if (pendingLine === null) return;
    const button = snippet.current?.querySelector(
      `[data-line="${pendingLine}"]`,
    );
    if (button) {
      button.scrollIntoView({ block: "nearest", inline: "nearest" });
      button.focus({ preventScroll: true });
      setPendingLine(null);
    }
  }, [pendingLine, fileIndex, snippetPage]);
  useEffect(() => {
    setFileIndex(0);
    setPendingLine(null);
    setStart(1);
    setEnd(1);
    setPage(1);
    setSnippetPage(1);
    setData(null);
  }, [post.id, post.code]);
  useEffect(() => {
    if (targetId) {
      setJumpToTarget(true);
      setStatus("all");
      setVersion("all");
      setPage(1);
    }
  }, [targetId]);
  useEffect(() => {
    let alive = true;
    setError("");
    setData(null);
    api(
      `/posts/${post.id}/code-reviews?status=${status}&version=${version}&page=${page}${targetId && jumpToTarget ? "&target_id=" + targetId : ""}`,
    )
      .then((result) => alive && setData(result))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [
    post.id,
    post.code,
    user?.id,
    status,
    version,
    page,
    reload,
    targetId,
    jumpToTarget,
  ]);
  useEffect(() => {
    if (!data || !targetId) return;
    const element = document.getElementById("code-review-" + targetId);
    if (element && !targetReply) {
      element.scrollIntoView({ block: "center" });
      element.focus({ preventScroll: true });
    }
  }, [data, targetId, targetReply]);
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
      {file && (
        <div
          className="review-navigation"
          aria-label="Published patch navigation"
        >
          <Select
            aria-label="Review file"
            value={String(fileIndex)}
            onChange={(e) =>
              showLine(files[Number(e.target.value)].patch_start)
            }
          >
            {files.map((f, i) => (
              <option key={f.path} value={i}>
                {f.path}
              </option>
            ))}
          </Select>
          <div className="review-hunk-controls">
            <button
              type="button"
              className="text-button"
              disabled={activeHunk <= 0}
              onClick={() => showLine(hunks[activeHunk - 1].line)}
            >
              Previous hunk
            </button>
            <Select
              aria-label="Review change"
              value={activeHunk < 0 ? "" : String(hunks[activeHunk].line)}
              onChange={(e) => showLine(Number(e.target.value))}
            >
              <option value="">Choose a change</option>
              {hunks.map((h) => (
                <option key={h.line} value={h.line}>
                  {h.label}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className="text-button"
              disabled={activeHunk >= hunks.length - 1}
              onClick={() => showLine(hunks[activeHunk + 1].line)}
            >
              Next hunk
            </button>
          </div>
          <p>
            Published lines {first}–{last} · + added · − removed. Numbers refer
            to this snapshot.
          </p>
        </div>
      )}
      <div
        className="numbered-snippet"
        ref={snippet}
        role="group"
        aria-label="Code snippet lines"
      >
        {lines
          .slice(pageStart - 1, Math.min(pageStart + 99, last))
          .map((line, offset) => {
            const number = pageStart + offset;
            const kind = file
              ? line.startsWith("@@ ") || number < first + 2
                ? "header"
                : line.startsWith("+")
                  ? "added"
                  : line.startsWith("-")
                    ? "removed"
                    : "context"
              : "plain";
            return (
              <div
                key={number}
                className={`snippet-line diff-${kind}${number >= start && number <= end ? " selected" : ""}`}
              >
                <button
                  type="button"
                  data-line={number}
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
          pages: Math.ceil((last - first + 1) / 100),
          total: last - first + 1,
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
            setJumpToTarget(false);
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
            setJumpToTarget(false);
            setVersion(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All snippet versions</option>
          <option value="current">Current snippet</option>
        </Select>
      </div>
      <ErrorMessage error={error} />
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
          id={"code-review-" + item.id}
          tabIndex={-1}
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
            {!item.outdated &&
              reviewFileForRange(files, item.start_line, item.end_line) && (
                <code className="review-feedback-file">
                  {
                    reviewFileForRange(files, item.start_line, item.end_line)
                      .path
                  }
                </code>
              )}
            {!item.outdated &&
              !item.deleted_at &&
              item.start_line >= 1 &&
              item.end_line <= lines.length && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => showLine(item.start_line, item.end_line)}
                >
                  Show in code
                </button>
              )}
            {item.outdated && (
              <span className="outdated-note">Earlier snippet version</span>
            )}
          </div>
          {!item.deleted_at && (
            <pre aria-label="Reviewed code">
              <code>{item.quote}</code>
            </pre>
          )}
          {item.deleted_at ? (
            <p className="muted">
              This feedback was deleted. Its discussion is preserved.
            </p>
          ) : (
            <MD>{item.body}</MD>
          )}
          {item.edited_at && !item.deleted_at && (
            <small>Edited {dateStamp(item.edited_at)}</small>
          )}
          {item.updated_at && (
            <small className="muted">
              Status changed {dateStamp(item.updated_at)}
            </small>
          )}
          {!item.deleted_at && user?.id === post.user_id && (
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
          <FeedbackActions
            row={item}
            user={user}
            url={`/posts/${post.id}/code-reviews/${item.id}`}
            reportUrl={`/posts/${post.id}/code-reviews/${item.id}/report`}
            onChange={() => setReload((v) => v + 1)}
          />
          <FeedbackReplies
            item={item}
            post={post}
            user={user}
            requireUser={requireUser}
            targetReply={Number(targetId) === item.id ? targetReply : null}
          />
        </article>
      ))}
      <Pagination
        meta={data?.pagination}
        onPage={(p) => {
          setJumpToTarget(false);
          setPage(p);
        }}
        label="line feedback"
      />
      <p className="muted line-review-note">
        Resolving a remark does not accept a solution or close the conversation.
      </p>
    </div>
  );
}
