import React, { useEffect, useState } from "react";
import { api, dateStamp } from "./data";
import { MD, Modal, ErrorMessage } from "./ui";
import { Pagination } from "./content";
import { FlowDialog } from "./review-flow";
import "./contributions.css";
import { GitHubTaskContext } from "./github-work";
const labels = {
  submitted: "Awaiting review",
  changes_requested: "Changes requested",
  accepted: "Accepted",
  withdrawn: "Withdrawn",
};
function Pull({ pull }) {
  return (
    pull && (
      <div className="contribution-pr">
        <a href={pull.url} target="_blank" rel="noreferrer">
          PR #{pull.number} · {pull.title} ↗
        </a>
        <span>
          {pull.state} · {pull.head.slice(0, 10)}
        </span>
        <small>
          Checked {dateStamp(pull.fetched_at)} · This revision is pinned.
          Merging a PR does not accept this contribution.
        </small>
      </div>
    )
  );
}
function Submit({ project, user, task, previous, close, done }) {
  const draftKey = `contribution:${user.id}:${project.id}:${task.id}:${previous?.version || 0}`;
  const [body, setBody] = useState(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(draftKey));
      if (
        Number.isFinite(d?.saved) &&
        d.saved <= Date.now() + 60000 &&
        d.saved > Date.now() - 86400000
      )
        return String(d.body || "").slice(0, 6000);
    } catch {}
    return previous?.body || "";
  });
  const [url, setUrl] = useState(previous?.pull?.url || ""),
    [checked, setChecked] = useState(null),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [operation] = useState(() => {
      try {
        const d = JSON.parse(sessionStorage.getItem(draftKey));
        if (
          Number.isFinite(d?.saved) &&
          d.saved <= Date.now() + 60000 &&
          d.saved > Date.now() - 86400000 &&
          /^[a-zA-Z0-9-]{16,80}$/.test(d.operation)
        )
          return d.operation;
      } catch {}
      return crypto.randomUUID();
    });
  useEffect(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ saved: Date.now(), body, operation }),
      );
    } catch {}
  }, [body, draftKey, operation]);
  async function check() {
    setBusy(true);
    setError("");
    try {
      setChecked(
        await api(`/projects/${project.id}/contributions/github`, {
          method: "POST",
          body: { url },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/projects/${project.id}/contributions`, {
        method: "POST",
        body: {
          post_id: task.id,
          body,
          operation_key: operation,
          expected_version: previous?.version || 0,
          pull_token: checked?.token || null,
        },
      });
      sessionStorage.removeItem(draftKey);
      done();
    } catch (e) {
      setError(e.message + " Your description is kept.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Submit work"
      onClose={() => !busy && close()}
      dismissible={!busy}
    >
      <h2>Show what changed.</h2>
      <p>
        {task.title} ·{" "}
        {task.community_id ? "Private community" : "Public project"}
      </p>
      {preview ? (
        <>
          <MD>{body}</MD>
          <Pull pull={checked?.pull} />
          <div className="rf-actions">
            <button disabled={busy} onClick={() => setPreview(false)}>
              Back to editing
            </button>
            <button className="button primary" disabled={busy} onClick={save}>
              {busy ? "Submitting…" : "Confirm submission"}
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPreview(true);
          }}
        >
          <label className="rf-field">
            Result and how to verify it
            <textarea
              aria-label="Result and how to verify it"
              required
              minLength={2}
              maxLength={6000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
            />
          </label>
          <label className="rf-field">
            Public GitHub PR (optional)
            <input
              aria-label="Public GitHub PR (optional)"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setChecked(null);
              }}
              maxLength={250}
            />
          </label>
          {url && (
            <button type="button" disabled={busy} onClick={check}>
              {busy ? "Checking…" : "Check public PR"}
            </button>
          )}
          <Pull pull={checked?.pull} />
          <p className="muted">
            Submit a result for the project owner to review. Only public PR
            metadata is checked; GitHub authorship is not verified.
          </p>
          <button
            className="button primary"
            disabled={busy || (!!url && !checked)}
          >
            Preview submission
          </button>
        </form>
      )}
      <ErrorMessage error={error} />
    </Modal>
  );
}
export function Contributions({ project, user, onChange, targetPost = null }) {
  const [data, setData] = useState(null),
    [githubTask, setGitHubTask] = useState(null),
    [tasks, setTasks] = useState(null),
    [page, setPage] = useState(1),
    [taskPage, setTaskPage] = useState(1),
    [epoch, setEpoch] = useState(0),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState(null),
    [history, setHistory] = useState(null),
    [historyPage, setHistoryPage] = useState(1),
    [historyData, setHistoryData] = useState(null),
    [live, setLive] = useState({});
  const root = `/projects/${project.id}/contributions`;
  const refresh = () => {
    setDialog(null);
    setEpoch((n) => n + 1);
    onChange?.();
  };
  useEffect(() => {
    const c = new AbortController();
    setError("");
    setData(null);
    api(`${root}?page=${page}${targetPost ? "&post=" + targetPost : ""}`, {
      signal: c.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    if (user)
      api(
        `/projects/${project.id}/room/tasks?mine=1&limit=6&page=${taskPage}`,
        {
          signal: c.signal,
        },
      )
        .then(setTasks)
        .catch(() => {});
    return () => c.abort();
  }, [root, page, taskPage, epoch, user?.id, targetPost]);
  useEffect(() => {
    if (!history) return;
    const c = new AbortController();
    setHistoryData(null);
    api(`${root}/${history.id}/history?page=${historyPage}`, {
      signal: c.signal,
    })
      .then(setHistoryData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [history, historyPage, root]);
  async function action(c, state) {
    setError("");
    try {
      const d = await api(`${root}/${c.id}`);
      const permission = state === "withdrawn" ? "withdraw" : "review";
      if (!d.permissions[permission])
        throw Error(
          "This action is no longer available. Reload the contributions.",
        );
      const row = d.contribution;
      if (row.version !== c.version)
        throw Error(
          "This result changed since you opened it. Reload before reviewing.",
        );
      setDialog({
        title:
          state === "accepted"
            ? "Accept result"
            : state === "withdrawn"
              ? "Withdraw result"
              : "Request changes",
        context: `${row.task_title} · result v${row.revision}${row.pull ? " · PR head " + row.pull.head.slice(0, 10) : ""}`,
        audience: "People with access to this task",
        url: `${root}/${row.id}`,
        payload: {
          state,
          expected_version: row.version,
          expected_revision: row.revision,
        },
        values: { body: "" },
        fields: [
          {
            key: "body",
            label: "Decision and next steps",
            multiline: true,
            required: true,
            min: 2,
            max: 6000,
          },
        ],
      });
    } catch (e) {
      setError(e.message);
    }
  }
  async function submit(t) {
    try {
      const access = await api(`/projects/${project.id}/participation`);
      if (!access.can_participate)
        throw Error("Only approved project contributors can submit work.");
      const rows = await api(`${root}?mine=1&post=${t.id}`);
      const prev = rows.items[0];
      if (prev && ["submitted", "accepted"].includes(prev.state))
        throw Error(
          "This result is already submitted or accepted. Withdraw a pending result before replacing it.",
        );
      setDialog({ task: t, previous: prev });
    } catch (e) {
      setError(e.message);
    }
  }
  async function check(c) {
    try {
      const r = await api(root + "/github", {
        method: "POST",
        body: { url: c.pull.url },
      });
      setLive((v) => ({ ...v, [c.id]: r.pull }));
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="contributions" aria-label="Contributions">
      <header>
        <span className="eyebrow">BUILD · SUBMIT · REVIEW</span>
        <h2>Work worth bringing back.</h2>
        <p>
          Submit a result. Get feedback. Keep each revision and decision
          together.
        </p>
      </header>
      <ErrorMessage error={error} />
      {user &&
        tasks?.items
          .filter((t) => !t.archived_at && !t.locked_at)
          .map((t) => (
            <button
              className="button secondary"
              key={t.id}
              onClick={() => submit(t)}
            >
              Submit work · {t.title}
            </button>
          ))}
      {user && (
        <Pagination
          meta={tasks?.pagination}
          label="assigned tasks"
          onPage={setTaskPage}
        />
      )}
      {!data && !error && <p role="status">Loading contributions…</p>}
      {data?.items.length === 0 && (
        <p>
          Nothing submitted yet. Pick up a task from the Room board to
          contribute.
        </p>
      )}
      {data?.items.map((c) => (
        <article
          className={`contribution-card contribution-${c.state}`}
          key={c.id}
        >
          <header>
            <span className="contribution-state">{labels[c.state]}</span>
            <small>
              v{c.revision} · {c.author_name} · {dateStamp(c.updated_at)}
            </small>
          </header>
          <h3>
            <a href={`#post/${c.post_id}`}>{c.task_title}</a>
          </h3>
          <MD>{c.body}</MD>
          <Pull pull={c.pull} />
          {live[c.id] && (
            <p role="status">
              {live[c.id].head !== c.pull.head
                ? "PR has new commits. This review still refers to the pinned revision."
                : "PR head matches this submission."}{" "}
              Latest checked state: {live[c.id].state}. Checked{" "}
              {dateStamp(live[c.id].fetched_at)}.
            </p>
          )}
          <div className="rf-actions">
            {user && (
              <button
                onClick={() =>
                  setGitHubTask({ id: c.post_id, title: c.task_title })
                }
              >
                Task PR & checks
              </button>
            )}
            <button
              onClick={() => {
                setHistory(c);
                setHistoryPage(1);
              }}
            >
              Revision history
            </button>
            {user && c.pull && (
              <button onClick={() => check(c)}>Check PR status</button>
            )}
            {user?.id === project.user_id &&
              c.user_id !== user?.id &&
              c.state === "submitted" && (
                <>
                  <button onClick={() => action(c, "accepted")}>
                    Accept result
                  </button>
                  <button onClick={() => action(c, "changes_requested")}>
                    Request changes
                  </button>
                </>
              )}
            {user?.id === c.user_id && c.state === "submitted" && (
              <button onClick={() => action(c, "withdrawn")}>Withdraw</button>
            )}
          </div>
        </article>
      ))}
      <Pagination
        meta={data?.pagination}
        label="contributions"
        onPage={setPage}
      />
      {dialog?.task ? (
        <Submit
          project={project}
          user={user}
          task={dialog.task}
          previous={dialog.previous}
          close={() => setDialog(null)}
          done={refresh}
        />
      ) : (
        dialog && (
          <FlowDialog
            plan={{
              ...dialog,
              draftKey: `contribution-decision:${user?.id}:${dialog.url}:${dialog.payload.expected_version}:${dialog.payload.state}`,
            }}
            close={() => setDialog(null)}
            done={refresh}
          />
        )
      )}
      {githubTask && (
        <GitHubTaskContext
          project={project}
          task={githubTask}
          close={() => setGitHubTask(null)}
          done={refresh}
        />
      )}
      {history && (
        <Modal title="Contribution history" onClose={() => setHistory(null)}>
          {!historyData && <p role="status">Loading history…</p>}
          {historyData?.items.map((r) => (
            <article className="contribution-card" key={r.id}>
              <h3>Result v{r.revision}</h3>
              <small>{dateStamp(r.created)}</small>
              <MD>{r.body}</MD>
              <Pull pull={r.pull} />
              {historyData.events
                .filter((e) => e.revision === r.revision)
                .map((e) => (
                  <div className="contribution-decision" key={e.id}>
                    <strong>
                      {labels[e.state]} · {e.actor_name}
                    </strong>
                    <small>{dateStamp(e.created)}</small>
                    {e.body && <MD>{e.body}</MD>}
                  </div>
                ))}
            </article>
          ))}
          <Pagination
            meta={historyData?.pagination}
            label="contribution history"
            onPage={setHistoryPage}
          />
        </Modal>
      )}
    </section>
  );
}
