import { ProjectParticipation } from "./project-access";
import React, { useEffect, useState } from "react";
import {
  Flag,
  CheckCircle2,
  Circle,
  ArrowUpRight,
  UserPlus,
  Pin,
  History,
  RefreshCw,
  Search,
  Activity,
} from "lucide-react";
import { api, dateStamp, types } from "./data";
import { MD, Modal, ErrorMessage } from "./ui";
import { Pagination } from "./content";
import { FlowDialog } from "./review-flow";
import "./rooms.css";
import { GitHubWorkDialog, GitHubTaskContext } from "./github-work";
const states = [
  ["open", "Open", Circle],
  ["in_progress", "In progress", Activity],
  ["ready", "Ready", CheckCircle2],
];
function useRoom(path, epoch = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!path) {
      setData(null);
      setError("");
      return;
    }
    const c = new AbortController();
    setData(null);
    setError("");
    api(path, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [path, epoch]);
  return { data, error };
}
function DecisionHistory({ project, id, close }) {
  const [page, setPage] = useState(1),
    { data, error } = useRoom(
      `/projects/${project}/room/decisions/${id}/history?page=${page}`,
    );
  return (
    <Modal title="Decision history" onClose={close}>
      <h2>How this decision evolved.</h2>
      <p>Published versions remain available to people with access.</p>
      <ErrorMessage error={error} />
      {!data && !error && <p role="status">Loading history…</p>}
      {data?.items.map((d) => (
        <article className="room-decision" key={d.id}>
          <small>
            v{d.version} · {d.author_name} · {dateStamp(d.created)}
            {d.archived ? " · Archived" : ""}
          </small>
          <h3>{d.title}</h3>
          <MD>{d.body}</MD>
        </article>
      ))}
      <Pagination
        meta={data?.pagination}
        label="decision history"
        onPage={setPage}
      />
    </Modal>
  );
}
function TaskColumn({
  project,
  state,
  label,
  Icon,
  user,
  owner,
  mine,
  search,
  epoch,
  paused,
  participate,
  openAction,
  openRequest,
  openGitHub,
}) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [mine, search]);
  const { data, error } = useRoom(
    `/projects/${project}/room/tasks?state=${state}&page=${page}&limit=6&mine=${mine ? "1" : "0"}&q=${encodeURIComponent(search)}`,
    epoch,
  );
  const canChange = (task) => !paused && !task.archived_at && !task.locked_at;
  return (
    <section
      className={`room-column room-${state}`}
      aria-label={`${label} tasks`}
    >
      <header>
        <span>
          <Icon size={15} />
          {label}
        </span>
        <strong>{data?.pagination.total ?? "–"}</strong>
      </header>
      <ErrorMessage error={error} />
      {!data && !error && <p role="status">Loading tasks…</p>}
      <div className="room-task-list">
        {data?.items.map((t) => (
          <article className="room-task" key={t.id}>
            <div className="room-task-type">
              <span>{types[t.kind]?.label || t.kind}</span>
              {t.community_id && <span>Private</span>}
            </div>
            <button className="room-task-title" onClick={() => openRequest(t)}>
              {t.title}
              <ArrowUpRight size={15} />
            </button>
            <p>{t.excerpt}</p>
            <div className="room-assignee">
              <span className="room-person">{t.assignee_name?.[0] || "+"}</span>
              {t.assignee_name ? (
                <span>
                  {t.assignee_name}
                  <small>@{t.assignee_username}</small>
                </span>
              ) : (
                <span>
                  {participate
                    ? "Available to pick up"
                    : "Unassigned · approval required"}
                </span>
              )}
            </div>
            <div className="room-task-actions">
              {user && (
                <button onClick={() => openGitHub(t)}>GitHub context</button>
              )}
              {canChange(t) &&
                (!t.assignee_name
                  ? participate && (
                      <button onClick={() => openAction(t, "claim")}>
                        Pick up task
                      </button>
                    )
                  : (owner || t.assignee_id === user?.id) && (
                      <button onClick={() => openAction(t, "release")}>
                        Release task
                      </button>
                    ))}
              {canChange(t) && owner && (
                <button
                  aria-label={`Assign ${t.title}`}
                  onClick={() => openAction(t, "assign")}
                >
                  <UserPlus size={14} />
                  Assign
                </button>
              )}
              {canChange(t) &&
                participate &&
                (owner || t.assignee_id === user?.id) &&
                states
                  .filter(([key]) => key !== state)
                  .map(([key, name]) => (
                    <button
                      key={key}
                      onClick={() => openAction(t, "state", key)}
                    >
                      {key === "ready" ? "Mark ready" : name}
                    </button>
                  ))}
            </div>
          </article>
        ))}
      </div>
      {data && !data.items.length && (
        <p className="room-column-empty">
          {mine
            ? "Nothing assigned to you here."
            : state === "open"
              ? "The next useful task starts here."
              : state === "ready"
                ? "Finished work will land here."
                : "Pick up an open task to get started."}
        </p>
      )}
      <Pagination
        meta={data?.pagination}
        label={`${label} tasks`}
        onPage={setPage}
      />
    </section>
  );
}
export function RoomSurface({
  project,
  user,
  requireUser,
  go,
  section = "room",
  onChange,
}) {
  const [epoch, setEpoch] = useState(0),
    [githubTask, setGitHubTask] = useState(null),
    [importIssue, setImportIssue] = useState(false),
    [dialog, setDialog] = useState(null),
    [history, setHistory] = useState(null),
    [mine, setMine] = useState(false),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [archived, setArchived] = useState(false);
  const room = useRoom(`/projects/${project.id}/room`, epoch);
  const decisions = useRoom(
    section === "decisions"
      ? `/projects/${project.id}/room/decisions?page=${page}&archived=${archived ? "1" : "0"}`
      : null,
    epoch,
  );
  const activity = useRoom(
    section === "room-activity"
      ? `/projects/${project.id}/room/activity?page=${page}`
      : null,
    epoch,
  );
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setPage(1);
    setArchived(false);
  }, [section]);
  const owner = !!room.data?.permissions.manage;
  const audience = project.community_id
    ? "Private project room"
    : "People who can access this room";
  const done = () => {
    setDialog(null);
    setEpoch((n) => n + 1);
    onChange?.();
  };
  function taskAction(task, action, state) {
    requireUser(() =>
      setDialog({
        title:
          action === "state"
            ? `Move task to ${states.find(([k]) => k === state)[1]}`
            : action === "claim"
              ? "Pick up this task"
              : action === "release"
                ? "Release this task"
                : "Assign a teammate",
        context:
          task.title +
          " · Assignment does not grant permission to edit the conversation.",
        audience: task.community_id ? "Approved community members" : audience,
        url: `/projects/${project.id}/room/tasks/${task.id}`,
        payload: {
          action,
          expected_version: task.work_version,
          ...(state ? { state } : {}),
        },
        values: action === "assign" ? { username: "" } : {},
        fields:
          action === "assign"
            ? [
                {
                  key: "username",
                  label: "Public username",
                  required: true,
                  max: 30,
                },
              ]
            : [],
        transform:
          action === "assign"
            ? (v) => ({ username: v.username.replace(/^@/, "").toLowerCase() })
            : undefined,
      }),
    );
  }
  function pin(decision = null, archive = null) {
    requireUser(() =>
      setDialog({
        title:
          archive === true
            ? "Archive decision"
            : archive === false
              ? "Restore decision"
              : decision
                ? "Edit pinned decision"
                : "Pin a decision",
        context: decision
          ? "Earlier versions remain in history. The original audience is preserved."
          : "Capture a conclusion and the reason behind it. Link private work to keep its decision private.",
        audience,
        url: `/projects/${project.id}/room/decisions${decision ? "/" + decision.id : ""}`,
        method: decision ? "PUT" : "POST",
        payload: {
          expected_version: decision?.version || 0,
          archived: archive ?? !!decision?.archived,
        },
        draftKey: `devdevian-room:${user.id}:${project.id}:decision:${decision?.id || "new"}:${decision?.version || 0}`,
        values: {
          title: decision?.title || "",
          body: decision?.body || "",
          post_id: decision?.post_id ? String(decision.post_id) : "",
          ...(!decision ? { operation_key: crypto.randomUUID() } : {}),
        },
        transform: (v) => ({
          ...v,
          post_id: v.post_id ? Number(v.post_id) : null,
        }),
        fields:
          archive !== null
            ? []
            : [
                { key: "title", label: "Decision", required: true, max: 140 },
                {
                  key: "body",
                  label: "Why this matters",
                  required: true,
                  multiline: true,
                  min: 2,
                  max: 6000,
                },
                ...(!decision
                  ? [
                      {
                        key: "post_id",
                        label: "Related work request ID (optional)",
                        max: 12,
                      },
                    ]
                  : []),
              ],
      }),
    );
  }
  if (room.error)
    return (
      <section className="room-empty">
        <h2>Couldn’t open this room.</h2>
        <ErrorMessage error={room.error} />
        <button
          className="button secondary"
          onClick={() => setEpoch((n) => n + 1)}
        >
          Try again
        </button>
      </section>
    );
  if (!room.data) return <p role="status">Opening project room…</p>;
  return (
    <section className="room-surface" aria-label={`${project.name} room`}>
      <div className="room-banner">
        <div className="room-orbit" aria-hidden="true">
          <Flag size={25} />
        </div>
        <div>
          <span className="eyebrow">A SHARED PLACE TO MOVE THINGS FORWARD</span>
          <h2>
            {section === "decisions"
              ? "Keep the reasons. Not just the result."
              : section === "room-activity"
                ? "A little progress, recorded."
                : "Good work starts with a clear next step."}
          </h2>
          <p>
            {section === "room"
              ? "Pick a task, keep the conversation close, and move it forward together."
              : section === "decisions"
                ? "Decisions stay findable, with their original context and edit history."
                : "Tasks, decisions, revisions and review outcomes — visible to the right people."}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh room"
          onClick={() => setEpoch((n) => n + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <ProjectParticipation project={project} user={user} onChange={done} />
      {room.data.paused && (
        <p className="dw-notice">
          This room is paused. Published work is still readable.
        </p>
      )}
      {section === "room" && (
        <>
          <div className="room-goal">
            <small>THE GOAL</small>
            <MD>{room.data.project.goal || room.data.project.description}</MD>
            <a href={`#workspace/${project.id}/decisions`}>
              Pinned decisions <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="room-toolbar">
            {owner && !room.data.paused && (
              <button
                className="button secondary"
                onClick={() => setImportIssue(true)}
              >
                Import GitHub issue
              </button>
            )}
            <label>
              <Search size={16} />
              <input
                aria-label="Search room tasks"
                placeholder="Find your next task…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {user && (
              <button
                aria-pressed={mine}
                className={mine ? "active" : ""}
                onClick={() => setMine(!mine)}
              >
                Assigned to me
              </button>
            )}
          </div>
          <div className="room-board">
            {states.map(([state, label, Icon]) => (
              <TaskColumn
                key={state}
                {...{ state, label, Icon, user, mine, search, epoch }}
                project={project.id}
                openGitHub={setGitHubTask}
                paused={room.data.paused}
                participate={room.data.permissions.participate}
                owner={owner && !room.data.paused}
                openAction={room.data.paused ? () => {} : taskAction}
                openRequest={(t) =>
                  go(
                    t.kind === "review"
                      ? `workspace/${project.id}/review/${t.id}`
                      : `post/${t.id}`,
                  )
                }
              />
            ))}
          </div>
          <div className="room-footnote">
            <Pin size={16} />
            <span>
              Made a useful call?{" "}
              <a href={`#workspace/${project.id}/decisions`}>
                Keep it in Decisions.
              </a>
            </span>
          </div>
        </>
      )}
      {section === "decisions" && (
        <>
          <div className="room-toolbar">
            <button
              aria-pressed={archived}
              onClick={() => {
                setArchived(!archived);
                setPage(1);
              }}
            >
              {archived ? "Show pinned" : "Show archived"}
            </button>
            {owner && (
              <button className="button primary" onClick={() => pin()}>
                <Pin size={15} />
                Pin a decision
              </button>
            )}
          </div>
          <ErrorMessage error={decisions.error} />
          {!decisions.data && !decisions.error && (
            <p role="status">Loading decisions…</p>
          )}
          <div className="room-decisions">
            {decisions.data?.items.map((d) => (
              <article className="room-decision" key={d.id}>
                <small>
                  <Pin size={13} />
                  {d.archived ? "Archived decision" : "Pinned decision"} · v
                  {d.version}
                </small>
                <h3>{d.title}</h3>
                <MD>{d.body}</MD>
                {d.post_id && (
                  <a className="text-button" href={"#post/" + d.post_id}>
                    Related work #{d.post_id} <ArrowUpRight size={13} />
                  </a>
                )}
                <div className="room-decision-footer">
                  <span>
                    {d.author_name} · {dateStamp(d.updated_at)}
                  </span>
                  <button onClick={() => setHistory(d.id)}>
                    <History size={14} />
                    History
                  </button>
                  {owner && (
                    <>
                      <button onClick={() => pin(d)}>Edit</button>
                      <button onClick={() => pin(d, !d.archived)}>
                        {d.archived ? "Restore" : "Archive"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          {decisions.data && !decisions.data.items.length && (
            <div className="room-empty">
              <Pin size={26} />
              <h3>
                {archived
                  ? "No archived decisions."
                  : "Make the useful conclusions easy to find."}
              </h3>
              <p>
                Record what you chose and why. Keep a private decision linked to
                its private work request.
              </p>
            </div>
          )}
          <Pagination
            meta={decisions.data?.pagination}
            onPage={setPage}
            label="room decisions"
          />
        </>
      )}
      {section === "room-activity" && (
        <>
          <ErrorMessage error={activity.error} />
          {!activity.data && !activity.error && (
            <p role="status">Loading room activity…</p>
          )}
          <div className="room-timeline">
            {activity.data?.items.map((e) => (
              <article key={e.id}>
                <span
                  className={
                    "room-event-dot " +
                    (e.type.startsWith("decision") ? "room-event-decision" : "")
                  }
                />
                <div>
                  <strong>{e.actor_name}</strong>
                  <p>
                    {e.type.replaceAll("_", " ")}
                    {e.revision_number ? " · v" + e.revision_number : ""}
                  </p>
                  {e.post_id && (
                    <a href={"#post/" + e.post_id}>
                      {e.title}
                      <ArrowUpRight size={13} />
                    </a>
                  )}
                  <small>{dateStamp(e.created)}</small>
                </div>
              </article>
            ))}
          </div>
          {activity.data && !activity.data.items.length && (
            <div className="room-empty">
              <Activity size={26} />
              <h3>Progress will show up here.</h3>
              <p>Pick up a task, pin a decision or share a review revision.</p>
            </div>
          )}
          <Pagination
            meta={activity.data?.pagination}
            onPage={setPage}
            label="room activity"
          />
        </>
      )}
      {importIssue && (
        <GitHubWorkDialog
          project={project}
          close={() => setImportIssue(false)}
          done={done}
        />
      )}
      {githubTask && (
        <GitHubTaskContext
          project={project}
          task={githubTask}
          close={() => setGitHubTask(null)}
          done={done}
        />
      )}
      {dialog && (
        <FlowDialog plan={dialog} close={() => setDialog(null)} done={done} />
      )}{" "}
      {history && (
        <DecisionHistory
          project={project.id}
          id={history}
          close={() => setHistory(null)}
        />
      )}
    </section>
  );
}
