import React, { useEffect, useState } from "react";
import {
  GitPullRequest,
  GitBranch,
  CircleDot,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { api, dateStamp } from "./data";
import { MD, Modal, ErrorMessage } from "./ui";
import "./github-work.css";
const root = (id, task) =>
  task
    ? `/projects/${id}/room/tasks/${task}/github`
    : `/projects/${id}/github/issues`;
export function GitHubWorkDialog({
  project,
  task = null,
  initialURL = "",
  close,
  done,
}) {
  const [url, setURL] = useState(initialURL),
    [preview, setPreview] = useState(null),
    [share, setShare] = useState(false),
    [contribution, setContribution] = useState(""),
    [checkedContribution, setCheckedContribution] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [operation] = useState(() => crypto.randomUUID());
  const clear = () => {
    setPreview(null);
    setShare(false);
    setCheckedContribution(null);
    setError("");
  };
  async function inspect() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const d = await api(root(project.id, task?.id) + "/preview", {
        method: "POST",
        body: { url },
      });
      let c = null;
      if (task && contribution) {
        const result = await api(
          `/projects/${project.id}/contributions/${Number(contribution)}`,
        );
        c = result.contribution;
        if (c.post_id !== task.id)
          throw Error("Choose a contribution for this task.");
      }
      setCheckedContribution(c);
      setPreview(d);
      setShare(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await api(
        root(project.id, task?.id) + (task ? "" : "/import"),
        {
          method: "POST",
          body: {
            url: preview.ticket.url,
            fingerprint: preview.ticket.fingerprint,
            operation_key: operation,
            share_private: share,
            ...(task
              ? {
                  expected_version: preview.expected_version,
                  task_version: preview.task_version,
                  ...(checkedContribution
                    ? {
                        contribution_id: checkedContribution.id,
                        contribution_revision: checkedContribution.revision,
                      }
                    : {}),
                }
              : {}),
          },
        },
      );
      done?.(result);
      close();
    } catch (e) {
      setError(e.message);
      if (e.status === 409) setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        task ? "Link a GitHub pull request" : "Bring an issue into your room"
      }
      onClose={close}
    >
      <div className="github-work-dialog">
        <div className="github-work-heading">
          <GitBranch size={25} />
          <span>GITHUB → DEVDEVIAN</span>
        </div>
        <h2>
          {task
            ? "Give this task its next step."
            : "An issue. A shared next step."}
        </h2>
        <p>
          {task
            ? "Link a PR to this task and, optionally, one exact contribution revision. Merging does not accept a result or mark the task ready."
            : "Preview the issue, then create a saved conversation on this room’s board. Future GitHub edits won’t overwrite your task."}
        </p>
        <label>
          {task ? "Pull request URL" : "Issue URL"}
          <input
            value={url}
            onChange={(e) => {
              setURL(e.target.value);
              clear();
            }}
            placeholder={`https://github.com/owner/repo/${task ? "pull" : "issues"}/123`}
          />
        </label>
        {task && (
          <label>
            Contribution ID (optional)
            <input
              inputMode="numeric"
              value={contribution}
              onChange={(e) => {
                setContribution(e.target.value);
                clear();
              }}
              placeholder="Leave blank to link only to the task"
            />
          </label>
        )}
        <ErrorMessage error={error} />
        <button
          className="button secondary"
          disabled={busy || !url.trim()}
          onClick={inspect}
        >
          {busy ? "Checking…" : "Preview from GitHub"}
        </button>
        {preview && (
          <section className="github-work-preview">
            <span className="github-work-status">
              <CircleDot size={15} />
              {preview.ticket.private ? "Private" : "Public"} ·{" "}
              {preview.ticket.merged ? "Merged" : preview.ticket.state}
            </span>
            <h3>
              #{preview.ticket.number} · {preview.ticket.title}
            </h3>
            <MD>{preview.ticket.body || "No description."}</MD>
            {preview.ticket.head && (
              <code>PR revision {preview.ticket.head.slice(0, 12)}</code>
            )}
            {checkedContribution && (
              <p>
                Contribution #{checkedContribution.id} · revision{" "}
                {checkedContribution.revision}
              </p>
            )}
            <p>
              <ShieldCheck size={14} />{" "}
              {preview.ticket.private
                ? "Saved for the approved members of this private community."
                : "Saved in this project room’s audience."}
            </p>
            {preview.ticket.private && (
              <label className="github-work-consent">
                <input
                  type="checkbox"
                  checked={share}
                  onChange={(e) => setShare(e.target.checked)}
                />
                I understand that approved community members can read this saved
                copy, including members without GitHub access.
              </label>
            )}
            <button
              className="button primary"
              disabled={busy || (preview.ticket.private && !share)}
              onClick={submit}
            >
              {task ? "Confirm PR link" : "Import as room task"}
              <ArrowRight size={16} />
            </button>
          </section>
        )}
      </div>
    </Modal>
  );
}
export function GitHubTaskContext({ project, task, close, done }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [editing, setEditing] = useState(false),
    [history, setHistory] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    api(root(project.id, task.id), { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [project.id, task.id, epoch]);
  async function loadHistory(page = 1) {
    try {
      setHistory(
        await api(root(project.id, task.id) + "/history?page=" + page),
      );
    } catch (e) {
      setError(e.message);
    }
  }
  if (editing)
    return (
      <GitHubWorkDialog
        project={project}
        task={task}
        initialURL={data?.binding?.url || ""}
        close={() => {
          setEditing(false);
          setEpoch((n) => n + 1);
        }}
        done={done}
      />
    );
  return (
    <Modal title="Task · GitHub context" onClose={close}>
      <div className="github-work-dialog">
        <h2>{task.title}</h2>
        <p>
          GitHub state and Devdevian decisions stay separate. Live data uses
          your own GitHub access.
        </p>
        <ErrorMessage error={error} />
        {!data && !error && <p role="status">Checking GitHub context…</p>}
        {data?.source && (
          <section className="github-work-preview">
            <small>IMPORTED ISSUE · SAVED COPY</small>
            <h3>
              <a href={data.source.url} target="_blank" rel="noreferrer">
                #{data.source.number} · {data.source.title} ↗
              </a>
            </h3>
            <p>
              The original issue was {data.source.state} when imported. The room
              task has its own workflow.
            </p>
          </section>
        )}
        {data?.live && (
          <section
            className={`github-work-preview github-pr-${data.live.merged ? "merged" : data.live.state}`}
          >
            <span className="github-work-status">
              <GitPullRequest size={17} />
              {data.live.merged
                ? "Merged"
                : data.live.draft
                  ? "Draft"
                  : data.live.state}
            </span>
            <h3>
              <a href={data.live.url} target="_blank" rel="noreferrer">
                PR #{data.live.number} · {data.live.title} ↗
              </a>
            </h3>
            <code>{data.live.head.slice(0, 12)}</code>
            <p>
              Review: {data.live.review.state.replaceAll("_", " ")}
              {data.live.review.partial
                ? " · Partial list; open GitHub for the latest verdicts."
                : " · Current PR head"}
            </p>
            <p>
              Checks: {data.live.checks.state} · {data.live.checks.total} check
              runs
            </p>
            <div className="github-check-chips">
              {data.live.checks.runs.map((c, i) => (
                <span key={i} data-result={c.conclusion || c.status}>
                  {c.name} · {c.conclusion || c.status}
                </span>
              ))}
            </div>
            {data.live.checks.has_more && (
              <p>
                Showing the first 20 check runs. Open GitHub for the full list.
              </p>
            )}
            <small>Checked {dateStamp(data.live.checked_at)}</small>
            {data.binding.contribution_id && (
              <p>
                Linked to contribution #{data.binding.contribution_id}, revision{" "}
                {data.binding.contribution_revision}.
              </p>
            )}
          </section>
        )}
        {data && !data.binding && <p>No pull request linked yet.</p>}
        <div className="github-work-actions">
          <button
            className="button secondary"
            onClick={() => setEpoch((n) => n + 1)}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {data?.permissions.manage && (
            <button className="button primary" onClick={() => setEditing(true)}>
              Link pull request
            </button>
          )}
          {data?.binding && (
            <button
              onClick={async () => {
                try {
                  await loadHistory();
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Link history
            </button>
          )}
        </div>
        {history && (
          <div className="github-work-actions">
            <button
              disabled={history.page <= 1}
              onClick={() => loadHistory(history.page - 1)}
            >
              Previous history
            </button>
            <span>Page {history.page}</span>
            <button
              disabled={!history.has_next}
              onClick={() => loadHistory(history.page + 1)}
            >
              Next history
            </button>
          </div>
        )}
        {history?.items.map((h) => (
          <p key={h.version}>
            v{h.version} ·{" "}
            <a href={h.url} target="_blank" rel="noreferrer">
              PR ↗
            </a>{" "}
            · {h.head.slice(0, 10)} · {dateStamp(h.created)}
          </p>
        ))}
      </div>
    </Modal>
  );
}
