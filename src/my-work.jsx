import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ArrowUpRight,
  GitPullRequest,
  RotateCcw,
  Clock3,
  Layers3,
  Inbox,
} from "lucide-react";
import { api, dateStamp } from "./data";
import { ErrorMessage, Modal } from "./ui";
import { Pagination } from "./content";
import { ReviewFlowPanel } from "./review-flow";
import { Contributions } from "./contributions";
import { GitHubTaskContext } from "./github-work";
import { recentConversations, localWorkDrafts, workStorage } from "./work-memory";
import "./my-work.css";
const tabs = [
  ["attention", "Next up"],
  ["tasks", "My tasks"],
  ["results", "Results"],
  ["continue", "Continue"],
];
function WorkDialog({ item, user, close, changed }) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    const path =
      item.type === "result"
        ? `/projects/${item.project_id}`
        : `/posts/${item.post_id}`;
    api(path, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [item.id]);
  return (
    <Modal title={item.action} wide onClose={close}>
      <a href={"#post/" + item.post_id} onClick={close}>
        Open conversation ↗
      </a>
      <ErrorMessage error={error} />
      {!data && !error && <p role="status">Checking current access…</p>}
      {data &&
        (item.type === "result" ? (
          <Contributions
            project={data}
            user={user}
            targetPost={item.post_id}
            onChange={changed}
          />
        ) : (
          <ReviewFlowPanel
            post={data}
            user={user}
            targetRequest={item.target_id}
            refreshToken={0}
          />
        ))}
    </Modal>
  );
}
export function MyWork({
  user,
  requireUser,
  section = "attention",
  go,
  onDraft,
}) {
  const selected = tabs.some(([k]) => k === section) ? section : "attention";
  const [page, setPage] = useState(1),
    [epoch, setEpoch] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState(null),
    [github, setGitHub] = useState(null),
    [recent, setRecent] = useState(null),
    [resumeError, setResumeError] = useState(""),
    [drafts, setDrafts] = useState([]);
  useEffect(() => setPage(1), [selected]);
  useEffect(() => {
    setData(null);
    setError("");
    if (!user || selected === "continue") return;
    const c = new AbortController();
    api(`/my-work?section=${selected}&page=${page}`, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [user?.id, selected, page, epoch]);
  useEffect(() => {
    setRecent(null);
    setResumeError("");
    setDrafts([]);
    if (!user || selected !== "continue") return;
    setDrafts(localWorkDrafts(workStorage(), user.id));
    const rows = recentConversations(workStorage(), user.id);
    const c = new AbortController();
    api(
      "/my-work/recent?" +
        new URLSearchParams({ ids: rows.map((r) => r.id).join(",") }),
      { signal: c.signal },
    )
      .then((d) => {
        if (!c.signal.aborted) setRecent(d.items);
      })
      .catch((e) => {
        if (!c.signal.aborted) setResumeError(e.message);
      });
    return () => c.abort();
  }, [user?.id, selected, epoch]);
  if (!user)
    return (
      <section className="work-empty">
        <Inbox size={30} />
        <h2>A place for your next step.</h2>
        <p>Sign in to see your tasks, reviews and saved progress.</p>
        <button
          className="button primary"
          onClick={() => requireUser(() => {})}
        >
          Sign in
        </button>
      </section>
    );
  async function open(row) {
    if (
      row.type === "result" ||
      row.type === "request" ||
      row.type === "outcome"
    ) {
      setDialog(row);
      return;
    }
    go(
      `post/${row.post_id}${row.type === "remark" ? "/review/" + row.target_id : ""}`,
    );
  }
  async function showGitHub(row) {
    setError("");
    try {
      const project = await api(`/projects/${row.project_id}`);
      setGitHub({ project, task: { id: row.post_id, title: row.title } });
    } catch (e) {
      setError(e.message);
    }
  }
  async function resume(draft) {
    try {
      if (draft.data.community_id) {
        const c = await api(
          "/communities/" + encodeURIComponent(draft.data.community_id),
        );
        if (!c.is_member)
          throw Error("This community draft needs current membership.");
      }
      onDraft(draft.data);
    } catch (e) {
      setResumeError(e.message);
    }
  }
  return (
    <section className="my-work" aria-label="My work">
      <header className="work-hero">
        <div className="work-mark" aria-hidden="true">
          <Layers3 size={30} />
        </div>
        <div>
          <span className="eyebrow">YOUR WORK · A CLEAR NEXT STEP</span>
          <h1>Pick up where it matters.</h1>
          <p>
            Reviews to answer, work to move forward, and a little room to focus.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh my work"
          onClick={() => setEpoch((n) => n + 1)}
        >
          <RotateCcw size={18} />
        </button>
      </header>
      <nav className="work-tabs" aria-label="My work sections">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            aria-current={selected === key ? "page" : undefined}
            onClick={() => go("work/" + key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="work-summary">
        <CheckCircle2 size={18} />
        <span>
          {selected === "attention"
            ? "A next step for every request. Completed actions leave this queue."
            : selected === "tasks"
              ? "Your assignments, with their project and current task state."
              : selected === "results"
                ? "Your submitted results and work you can review."
                : "Drafts and recent conversations stay local to this account and device."}
        </span>
      </div>
      {selected === "continue" ? (
        <div className="work-resume">
          <section>
            <h2>Local drafts</h2>
            {drafts.length ? (
              drafts.map((d) => (
                <article className="work-card" key={d.key}>
                  <small>
                    {d.data.community_id
                      ? "Private community draft"
                      : "Public draft"}
                  </small>
                  <h3>{d.title}</h3>
                  <button onClick={() => resume(d)}>
                    Resume draft <ArrowUpRight size={15} />
                  </button>
                </article>
              ))
            ) : (
              <p className="work-quiet">
                Your next unfinished thought will be here.
              </p>
            )}
          </section>
          <section>
            <h2>Recently opened</h2>
            <ErrorMessage error={resumeError} />
            {recent === null && !resumeError && (
              <p role="status">Checking recent conversations…</p>
            )}
            {recent?.map((r) => (
              <article className="work-card" key={r.id}>
                <small>
                  {r.community_id ? "Private community" : "Public conversation"}
                </small>
                <h3>{r.title}</h3>
                <button onClick={() => go("post/" + r.id)}>
                  Continue reading <ArrowUpRight size={15} />
                </button>
              </article>
            ))}
            {recent?.length === 0 && (
              <p className="work-quiet">
                Open a conversation to find your way back here.
              </p>
            )}
          </section>
        </div>
      ) : (
        <>
          <ErrorMessage error={error} />
          {error && (
            <button
              className="button secondary"
              onClick={() => setEpoch((n) => n + 1)}
            >
              Retry this section
            </button>
          )}
          {!data && !error && <p role="status">Finding your next steps…</p>}
          {!!data?.unavailable?.length && (
            <p className="work-notice">
              Some sources are unavailable: {data.unavailable.join(", ")}.
              Available items are shown below.
            </p>
          )}
          <div className="work-grid">
            {data?.items.map((r) => (
              <article className={`work-card work-${r.type}`} key={r.id}>
                <div className="work-card-meta">
                  <span>{r.state.replaceAll("_", " ")}</span>
                  <small>
                    {r.community_id ? "Private" : "Public"}
                    {r.revision_number ? " · v" + r.revision_number : ""}
                  </small>
                </div>
                {r.project_name && <small>{r.project_name}</small>}
                <h3>{r.title}</h3>
                <div className="work-card-footer">
                  <span>
                    <Clock3 size={12} />
                    {dateStamp(r.updated_at)}
                  </span>
                  <button
                    className="work-primary-action"
                    onClick={() => open(r)}
                  >
                    {r.action}
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                {r.project_id && (
                  <div className="work-card-extra">
                    <button
                      onClick={() => go(`workspace/${r.project_id}/room`)}
                    >
                      Project room
                    </button>
                    <button onClick={() => showGitHub(r)}>
                      <GitPullRequest size={13} /> PR & checks
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {data && !data.items.length && (
            <div className="work-empty">
              <CheckCircle2 size={32} />
              <h2>
                {selected === "attention"
                  ? "Nothing is waiting on you."
                  : selected === "tasks"
                    ? "A clear board."
                    : "No results here yet."}
              </h2>
              <p>
                {selected === "attention"
                  ? "Pick up a task or continue a conversation when you’re ready."
                  : "Your work will appear here as it moves through a project room."}
              </p>
              <button onClick={() => go("projects")}>
                Explore projects <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          <Pagination
            meta={data?.pagination}
            onPage={setPage}
            label="work items"
          />
        </>
      )}
      {dialog && (
        <WorkDialog
          item={dialog}
          user={user}
          close={() => {
            setDialog(null);
            setEpoch((n) => n + 1);
          }}
          changed={() => setEpoch((n) => n + 1)}
        />
      )}
      {github && (
        <GitHubTaskContext
          {...github}
          close={() => setGitHub(null)}
          done={() => setEpoch((n) => n + 1)}
        />
      )}
    </section>
  );
}
