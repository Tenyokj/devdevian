import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Code2,
  Command,
  Copy,
  FileCode2,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Terminal,
  Users,
  X,
} from "lucide-react";
import logo from "../../public/devdevian-logo.png";
import {
  files,
  snapshots,
  initialRequests,
  initialReview,
  addRemark,
  publishRevision,
  threadCounts,
  compareLines,
} from "./model.mjs";
import "./style.css";

const navItems = [
  ["overview", "Overview", LayoutDashboard],
  ["work", "Work requests", GitPullRequest],
  ["review", "Code review", Code2],
  ["decisions", "Context & decisions", BookOpen],
  ["activity", "Activity", Activity],
];
const initialDecisions = [
  {
    id: 1,
    title: "Safe replay is a caller contract",
    body: "Retry only operations that are safe to repeat. Use an idempotency key when the service supports one. A retry predicate alone does not make a write idempotent.",
    label: "Architecture",
    author: "Sam Chen",
  },
  {
    id: 2,
    title: "Small changes, enough context",
    body: "Keep implementation and its regression test in one review. Capture the reason for a decision here, so the next contributor can catch up.",
    label: "Working agreement",
    author: "Alex Morgan",
  },
];
const initialActivity = [
  {
    id: 3,
    title: "Sam requested changes",
    text: "Make retries safe under timeouts · v1",
    icon: MessageSquare,
    time: "12 min ago",
    target: "review",
  },
  {
    id: 2,
    title: "Jamie added a review remark",
    text: "Cover permanent failures with a regression test",
    icon: Code2,
    time: "24 min ago",
    target: "review",
  },
  {
    id: 1,
    title: "A decision worth keeping",
    text: "Safe replay is a caller contract",
    icon: BookOpen,
    time: "1 hour ago",
    target: "decisions",
  },
];
const Avatar = ({ initials = "AM", className = "" }) => (
  <span className={`avatar avatar-${initials.toLowerCase()} ${className}`}>
    {initials}
  </span>
);
const Badge = ({ children, tone = "muted" }) => (
  <span className={`badge ${tone}`}>{children}</span>
);
const statusTone = (status) =>
  ({
    "Changes requested": "amber",
    "Awaiting re-review": "purple",
    Ready: "green",
    Open: "blue",
    "In progress": "purple",
  })[status] || "muted";

function Dialog({
  title,
  eyebrow = "ORBIT QUEUE",
  children,
  close,
  wide = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement,
      dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [nav, setNav] = useState("overview"),
    [mobileNav, setMobileNav] = useState(false);
  const [requests, setRequests] = useState(() =>
    structuredClone(initialRequests),
  );
  const [review, setReview] = useState(initialReview),
    [revision, setRevision] = useState("v1"),
    [file, setFile] = useState(files[0]);
  const [line, setLine] = useState(6),
    [mode, setMode] = useState("snapshot"),
    [threadFilter, setThreadFilter] = useState("all");
  const [drafts, setDrafts] = useState({}),
    [replyDrafts, setReplyDrafts] = useState({});
  const [decisions, setDecisions] = useState(() =>
    structuredClone(initialDecisions),
  );
  const [activity, setActivity] = useState(initialActivity),
    [seen, setSeen] = useState(0);
  const [modal, setModal] = useState(null),
    [query, setQuery] = useState(""),
    [type, setType] = useState("All requests");
  const [notice, setNotice] = useState("");
  const toastTimer = useRef(null),
    main = useRef(null);
  const featured = requests.find((r) => r.id === 14),
    counts = threadCounts(review);
  const unseen = activity.filter((a) => a.id > seen).length;
  const go = (page) => {
    setNav(page);
    setMobileNav(false);
    setModal(null);
    main.current?.focus();
    window.scrollTo({ top: 0 });
  };
  const toast = (text) => {
    clearTimeout(toastTimer.current);
    setNotice(text);
    toastTimer.current = setTimeout(() => setNotice(""), 3500);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal({ kind: "search" });
      }
      if (e.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const log = (title, text, target, Icon = Activity) =>
    setActivity((rows) => [
      {
        id: Math.max(...rows.map((a) => a.id)) + 1,
        title,
        text,
        time: "Just now",
        icon: Icon,
        target,
      },
      ...rows,
    ]);
  const publish = () => {
    if (review.currentRevision === "v2") return;
    setReview(publishRevision);
    setRevision("v2");
    setMode("compare");
    setLine(1);
    setRequests((rows) =>
      rows.map((r) =>
        r.id === 14
          ? { ...r, status: "Awaiting re-review", updated: "Just now" }
          : r,
      ),
    );
    log(
      "You shared revision v2",
      "Implementation and regression test · ready for another look",
      "review",
      GitBranch,
    );
    toast(
      "Revision v2 shared in this sample workspace. Earlier remarks kept their v1 quotes.",
    );
  };
  const openRequest = (request) =>
    request.id === 14
      ? go("review")
      : setModal({ kind: "request", id: request.id });
  const reset = () => {
    setRequests(structuredClone(initialRequests));
    setReview(initialReview());
    setRevision("v1");
    setFile(files[0]);
    setLine(6);
    setMode("snapshot");
    setThreadFilter("all");
    setDrafts({});
    setReplyDrafts({});
    setDecisions(structuredClone(initialDecisions));
    setActivity(initialActivity);
    setSeen(0);
    setQuery("");
    setType("All requests");
    go("overview");
    toast("Sample workspace reset.");
  };
  const showThread = (thread) => {
    setRevision(thread.revision);
    setFile(thread.file);
    setLine(thread.line);
    setMode("snapshot");
    requestAnimationFrame(() =>
      document
        .getElementById(`code-line-${thread.line}`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  };
  const visible = requests.filter(
    (r) =>
      (type === "All requests" || r.type === type) &&
      `${r.title} ${r.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const draftKey = `${revision}:${file}:${line}`;
  const reviewThreads = review.threads.filter(
    (t) =>
      threadFilter === "all" ||
      (threadFilter === "open"
        ? !t.resolved && t.revision === review.currentRevision
        : t.revision !== review.currentRevision),
  );
  const pageTitle = navItems.find(([id]) => id === nav)?.[1];
  return (
    <div className="app">
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>
      <aside
        className={`sidebar ${mobileNav ? "mobile-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <img src={logo} alt="" />
          <strong>
            devdevian<span>.</span>
          </strong>
        </a>
        <button
          className="space-switch"
          aria-label="Project workspace details"
          onClick={() => setModal({ kind: "repo" })}
        >
          <span className="project-icon small">
            <FolderGit2 size={19} />
          </span>
          <div>
            <strong>Orbit Queue</strong>
            <small>Public project workspace</small>
          </div>
          <ChevronDown size={15} />
        </button>
        <span className="nav-caption">YOUR WORKSPACE</span>
        <nav>
          {navItems.map(([id, label, Icon]) => (
            <button
              key={id}
              className={nav === id ? "nav-item active" : "nav-item"}
              aria-current={nav === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "work" && (
                <small>
                  {requests.filter((r) => r.status !== "Ready").length}
                </small>
              )}
              {id === "activity" && unseen > 0 && <span className="new-dot" />}
            </button>
          ))}
        </nav>
        <span className="nav-caption context-label">PROJECT CONTEXT</span>
        <button
          className="nav-item repo-link"
          onClick={() => setModal({ kind: "repo" })}
        >
          <GitBranch size={17} />
          <span>orbit / queue</span>
          <ArrowUpRight size={14} />
        </button>
        <button
          className="nav-item"
          onClick={() => setModal({ kind: "people" })}
        >
          <Users size={17} />
          <span>People</span>
          <small>3</small>
        </button>
        <div className="sidebar-bottom">
          <div className="preview-note">
            <span className="live-dot" /> WORKSPACES / 0.2 CONCEPT
            <p>A space for the work behind the conversation.</p>
            <button onClick={reset}>
              Reset sample workspace <ArrowRight size={13} />
            </button>
          </div>
          <button
            className="account"
            onClick={() => setModal({ kind: "people" })}
          >
            <Avatar />
            <span>
              <strong>
                Alex Morgan <small>You</small>
              </strong>
              <small>Project owner · sample account</small>
            </span>
          </button>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav((v) => !v)}
            >
              <Menu size={20} />
            </button>
            <span>Projects</span>
            <ChevronRight size={13} />
            <strong>Orbit Queue</strong>
            <Badge tone="purple">Preview</Badge>
          </div>
          <button
            className="search-trigger"
            onClick={() => setModal({ kind: "search" })}
          >
            <Search size={15} />
            <span>Find your next step</span>
            <kbd>
              <Command size={11} /> K
            </kbd>
          </button>
          <Avatar />
        </header>
        <main
          ref={main}
          id="workspace-main"
          tabIndex={-1}
          className={`main ${nav === "review" ? "review-main" : ""}`}
        >
          {nav !== "review" && (
            <div className="page-heading">
              <div>
                <span className="eyebrow">PROJECT WORKSPACE</span>
                <h1>{nav === "overview" ? "Orbit Queue" : pageTitle}</h1>
                <p>
                  {
                    {
                      overview:
                        "A tiny job queue. Built with a little help from each other.",
                      work: "A clear next step, with the context to take it.",
                      decisions: "Keep the why close to the work.",
                      activity: "Pick up where the conversation moved forward.",
                    }[nav]
                  }
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="button secondary"
                  onClick={() => setModal({ kind: "terminal" })}
                >
                  <Terminal size={16} />
                  <span>Terminal view</span>
                </button>
                <button
                  className="button primary"
                  onClick={() => setModal({ kind: "new-request" })}
                >
                  <Plus size={16} />
                  New request
                </button>
              </div>
            </div>
          )}
          {nav === "overview" && (
            <>
              <section className="project-hero">
                <div>
                  <Badge tone="green">
                    <span className="live-dot" /> Building in the open
                  </Badge>
                  <h2>
                    The code is only
                    <br />
                    half the story<span>.</span>
                  </h2>
                  <p>
                    Bring the questions, the rough edges, and the next version.
                    Let’s figure it out together.
                  </p>
                  <div className="hero-bottom">
                    <div className="avatar-stack">
                      <Avatar />
                      <Avatar initials="SC" />
                      <Avatar initials="JP" />
                    </div>
                    <button onClick={() => setModal({ kind: "people" })}>
                      3 people building <ArrowUpRight size={13} />
                    </button>
                    <span className="hero-divider" />
                    <span>
                      <GitBranch size={14} /> TypeScript · Node.js
                    </span>
                  </div>
                </div>
                <div className="orbit-graphic" aria-hidden="true">
                  <div className="orbit-ring ring-one" />
                  <div className="orbit-ring ring-two" />
                  <div className="orbit-core">
                    <img src={logo} alt="" />
                  </div>
                  <span className="orbit-chip chip-code">
                    <Code2 size={16} /> The code
                  </span>
                  <span className="orbit-chip chip-context">
                    <BookOpen size={16} /> The context
                  </span>
                  <span className="orbit-chip chip-people">
                    <Users size={16} /> The people
                  </span>
                  <span className="orbit-star">✳</span>
                </div>
              </section>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">PICK UP THE THREAD</span>
                  <h2>A good place to jump in.</h2>
                </div>
                <button className="text-link" onClick={() => go("work")}>
                  All work requests <ArrowRight size={15} />
                </button>
              </div>
              <div className="overview-grid">
                <div className="main-column">
                  <section className="featured-card">
                    <div className="card-topline">
                      <span className="type-label">
                        <GitPullRequest size={16} /> CODE REVIEW / #14
                      </span>
                      <Badge tone={statusTone(featured.status)}>
                        {featured.status}
                      </Badge>
                    </div>
                    <h3>{featured.title}</h3>
                    <p>{featured.description}</p>
                    <div className="review-path">
                      <span className="path-step done">
                        <Check size={13} /> v1 shared
                      </span>
                      <i />
                      <span
                        className={
                          review.currentRevision === "v2"
                            ? "path-step done"
                            : "path-step current"
                        }
                      >
                        <MessageSquare size={13} /> Feedback
                      </span>
                      <i />
                      <span
                        className={
                          review.currentRevision === "v2"
                            ? "path-step current"
                            : "path-step"
                        }
                      >
                        <GitBranch size={13} /> Next revision
                      </span>
                    </div>
                    <div className="card-footer">
                      <span>
                        <Avatar initials="SC" /> {review.threads.length} remarks
                        in the conversation
                      </span>
                      <button
                        className="button primary"
                        onClick={() => go("review")}
                      >
                        Open review <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </section>
                  <div className="small-request-grid">
                    {requests
                      .filter((r) => [12, 13].includes(r.id))
                      .map((request) => (
                        <button
                          className="small-request"
                          key={request.id}
                          onClick={() => openRequest(request)}
                        >
                          <span className="type-label">
                            {request.type === "Question" ? (
                              <MessageSquare size={16} />
                            ) : (
                              <Users size={16} />
                            )}
                            {request.type}
                          </span>
                          <h3>{request.title}</h3>
                          <p>{request.description}</p>
                          <span className="small-request-foot">
                            <Badge tone={statusTone(request.status)}>
                              {request.status}
                            </Badge>
                            <ArrowUpRight size={17} />
                          </span>
                        </button>
                      ))}
                  </div>
                  <div className="terminal-callout">
                    <span className="terminal-symbol">
                      <Terminal size={22} />
                    </span>
                    <div>
                      <strong>Same project. Your kind of workspace.</strong>
                      <p>
                        See how this could feel inside your editor’s terminal.
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Explore terminal concept"
                      onClick={() => setModal({ kind: "terminal" })}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  </div>
                </div>
                <aside className="context-rail">
                  <section className="rail-card">
                    <div className="rail-heading">
                      <BookOpen size={16} />
                      <h3>A little context goes a long way.</h3>
                    </div>
                    <span className="tiny-label">PINNED DECISION</span>
                    <h4>{decisions[0].title}</h4>
                    <p>{decisions[0].body}</p>
                    <button
                      className="text-link"
                      onClick={() => go("decisions")}
                    >
                      Read the project context <ArrowRight size={14} />
                    </button>
                  </section>
                  <section className="rail-card activity-card">
                    <div className="rail-heading">
                      <Activity size={16} />
                      <h3>Since your last visit</h3>
                      <span className="count-badge">{unseen}</span>
                    </div>
                    {activity.slice(0, 3).map((a) => (
                      <button
                        className="mini-activity"
                        key={a.id}
                        onClick={() => go(a.target)}
                      >
                        <span className="activity-marker" />
                        <span>
                          <strong>{a.title}</strong>
                          <small>{a.time}</small>
                        </span>
                      </button>
                    ))}
                    <button
                      className="text-link"
                      onClick={() => go("activity")}
                    >
                      See the whole story <ArrowRight size={14} />
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}
          {nav === "work" && (
            <section className="work-section">
              <div className="work-toolbar">
                <div
                  className="filter-tabs"
                  role="group"
                  aria-label="Request type"
                >
                  {[
                    "All requests",
                    "Code review",
                    "Question",
                    "Help wanted",
                  ].map((t) => (
                    <button
                      key={t}
                      aria-pressed={type === t}
                      className={type === t ? "selected" : ""}
                      onClick={() => setType(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <label className="search-box">
                  <Search size={15} />
                  <input
                    aria-label="Find a request"
                    placeholder="Find a request…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="request-list">
                {visible.map((r) => (
                  <button
                    className="request-row"
                    key={r.id}
                    onClick={() => openRequest(r)}
                  >
                    <span
                      className={`request-type-icon ${r.type === "Code review" ? "purple" : "blue"}`}
                    >
                      {r.type === "Code review" ? (
                        <GitPullRequest size={20} />
                      ) : (
                        <MessageSquare size={20} />
                      )}
                    </span>
                    <span className="request-row-main">
                      <small>
                        {r.type} <span>· #{r.id}</span>
                      </small>
                      <strong>{r.title}</strong>
                      <span className="request-tags">
                        {r.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </span>
                    </span>
                    <span className="request-row-side">
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      <small>{r.updated}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
                {!visible.length && (
                  <div className="empty-state">
                    <Search size={25} />
                    <h3>No requests match.</h3>
                    <p>Try another word or start with all requests.</p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setQuery("");
                        setType("All requests");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
              <p className="section-note">
                {requests.filter((r) => r.status === "Ready").length} request
                ready · A little progress is still progress.
              </p>
            </section>
          )}
          {nav === "review" && (
            <>
              <button className="back-link" onClick={() => go("work")}>
                <ArrowLeft size={15} /> Work requests <span>/ #14</span>
              </button>
              <div className="review-heading">
                <div>
                  <div className="card-topline">
                    <span className="eyebrow">CODE REVIEW / #14</span>
                    <Badge tone={statusTone(featured.status)}>
                      {featured.status}
                    </Badge>
                  </div>
                  <h1>{featured.title}</h1>
                  <p>
                    Make failure handling explicit. Keep the implementation and
                    its test in one conversation.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={review.currentRevision === "v2"}
                  onClick={publish}
                >
                  <GitBranch size={16} />
                  {review.currentRevision === "v1"
                    ? "Share revision v2"
                    : "v2 is current"}
                </button>
              </div>
              <div className="revision-banner">
                <div className="revision-pills">
                  {[
                    "v1",
                    ...(review.currentRevision === "v2" ? ["v2"] : []),
                  ].map((v) => (
                    <button
                      className={revision === v ? "selected" : ""}
                      key={v}
                      aria-pressed={revision === v}
                      onClick={() => {
                        setRevision(v);
                        setLine(1);
                        if (v === "v1") setMode("snapshot");
                      }}
                    >
                      <GitBranch size={13} />
                      {v}
                      <span>
                        {v === review.currentRevision ? "Current" : "Earlier"}
                      </span>
                    </button>
                  ))}
                </div>
                <span className="snapshot-hint">
                  {review.currentRevision === "v1"
                    ? "A shared snapshot. A conversation that keeps moving."
                    : "New code, same conversation. v1 remarks keep their original quotes."}
                </span>
                <button
                  className="text-link"
                  onClick={() => setModal({ kind: "revision-info" })}
                >
                  How revisions work <ArrowUpRight size={13} />
                </button>
              </div>
              <div className="review-grid">
                <aside className="file-tree">
                  <span className="nav-caption">
                    CHANGED FILES <b>2</b>
                  </span>
                  {files.map((path) => (
                    <button
                      className={file === path ? "file selected" : "file"}
                      key={path}
                      onClick={() => {
                        setFile(path);
                        setLine(1);
                      }}
                    >
                      <FileCode2 size={15} />
                      <span>{path}</span>
                      <small>M</small>
                    </button>
                  ))}
                  <div className="review-context">
                    <BookOpen size={15} />
                    <strong>Before you review</strong>
                    <p>
                      Safe replay is a caller contract. A retry predicate is
                      only part of the story.
                    </p>
                    <button
                      className="text-link"
                      onClick={() => go("decisions")}
                    >
                      Project context <ArrowRight size={13} />
                    </button>
                  </div>
                </aside>
                <section className="code-panel" aria-label="Revision code">
                  <div className="code-toolbar">
                    <span>
                      <FileCode2 size={15} />
                      {file}
                    </span>
                    <span className="segmented">
                      <button
                        className={mode === "snapshot" ? "selected" : ""}
                        onClick={() => setMode("snapshot")}
                      >
                        Snapshot
                      </button>
                      <button
                        className={mode === "compare" ? "selected" : ""}
                        disabled={revision === "v1"}
                        onClick={() => setMode("compare")}
                      >
                        v1 → v2
                      </button>
                    </span>
                  </div>
                  <div
                    className="code-scroll"
                    role="group"
                    aria-label="Snapshot lines"
                  >
                    {(mode === "compare" && revision === "v2"
                      ? compareLines(snapshots.v1[file], snapshots.v2[file])
                      : snapshots[revision][file]
                          .split("\n")
                          .map((text, i) => ({
                            text,
                            kind: "context",
                            next: i + 1,
                          }))
                    ).map((row, i) => (
                      <div
                        id={row.next ? `code-line-${row.next}` : undefined}
                        key={i}
                        className={`code-row ${row.kind} ${row.next === line ? "selected" : ""}`}
                      >
                        <span className="old-line">
                          {mode === "compare" ? row.old : ""}
                        </span>
                        <button
                          disabled={!row.next}
                          aria-label={
                            row.next
                              ? `Comment on line ${row.next}`
                              : "Removed line"
                          }
                          aria-pressed={row.next === line}
                          onClick={() => setLine(row.next)}
                        >
                          {row.next || "−"}
                        </button>
                        <code>
                          <span className="diff-sign">
                            {row.kind === "added"
                              ? "+"
                              : row.kind === "removed"
                                ? "−"
                                : " "}
                          </span>
                          {row.text || " "}
                        </code>
                      </div>
                    ))}
                  </div>
                  <div className="code-panel-footer">
                    <span>
                      <GitBranch size={12} />
                      {revision} snapshot
                    </span>
                    <span>
                      {mode === "compare"
                        ? "Select a v2 line to comment"
                        : "Select a line to start a remark"}
                    </span>
                  </div>
                  <form
                    className="remark-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      try {
                        setReview((state) =>
                          addRemark(state, {
                            revision,
                            file,
                            line,
                            body: drafts[draftKey],
                          }),
                        );
                        setDrafts((d) => ({ ...d, [draftKey]: "" }));
                        log(
                          "You added a line remark",
                          `${file} · ${revision}`,
                          "review",
                          MessageSquare,
                        );
                        toast("Remark added to " + revision + ".");
                      } catch (error) {
                        toast(error.message);
                      }
                    }}
                  >
                    <label htmlFor="remark-body">
                      <MessageSquare size={14} /> Your remark{" "}
                      <span>
                        {revision} · line {line}
                      </span>
                    </label>
                    <textarea
                      id="remark-body"
                      value={drafts[draftKey] || ""}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [draftKey]: e.target.value }))
                      }
                      placeholder="A question, an edge case, a better way…"
                      maxLength={1000}
                      required
                      rows={3}
                    />
                    <div>
                      <span>Attached to this exact snapshot.</span>
                      <button className="button secondary" type="submit">
                        Add remark <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </form>
                </section>
                <aside className="review-discussion">
                  <div className="discussion-heading">
                    <h2>The conversation</h2>
                    <MessageSquare size={17} />
                  </div>
                  <div className="tiny-label">
                    CURRENT REVISION · {review.currentRevision}
                  </div>
                  <div className="summary-counts">
                    <span>
                      <i className="purple-dot" />
                      {counts.open} open
                    </span>
                    <span>{counts.resolved} resolved</span>
                    <span>{counts.earlier} earlier</span>
                  </div>
                  <div
                    className="thread-filters"
                    role="group"
                    aria-label="Remark filter"
                  >
                    {[
                      ["all", "All"],
                      ["open", "Current open"],
                      ["earlier", "Earlier"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={threadFilter === id ? "selected" : ""}
                        aria-pressed={threadFilter === id}
                        onClick={() => setThreadFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="thread-list">
                    {reviewThreads.map((t) => (
                      <article
                        className={`thread ${t.resolved ? "resolved" : ""}`}
                        key={t.id}
                        data-testid={`thread-${t.id}`}
                      >
                        <header>
                          <Avatar initials={t.initials} />
                          <strong>{t.author}</strong>
                          {t.resolved ? (
                            <CheckCheck size={15} />
                          ) : (
                            <span className="purple-dot" />
                          )}
                        </header>
                        <button
                          className="thread-location"
                          onClick={() => showThread(t)}
                        >
                          <FileCode2 size={12} />
                          <span>
                            {t.file.split("/").at(-1)}:{t.line}
                          </span>
                          <Badge
                            tone={
                              t.revision !== review.currentRevision
                                ? "amber"
                                : "muted"
                            }
                          >
                            {t.revision}
                            {t.revision !== review.currentRevision
                              ? " · Earlier"
                              : ""}
                          </Badge>
                        </button>
                        <pre>{t.quote.trim()}</pre>
                        <p>{t.body}</p>
                        {t.replies.map((r, i) => (
                          <div className="thread-reply" key={i}>
                            <strong>You</strong>
                            <p>{r}</p>
                          </div>
                        ))}
                        <div className="thread-actions">
                          <button
                            onClick={() =>
                              setReview((state) => ({
                                ...state,
                                threads: state.threads.map((n) =>
                                  n.id === t.id
                                    ? { ...n, resolved: !n.resolved }
                                    : n,
                                ),
                              }))
                            }
                          >
                            {t.resolved ? "Reopen" : "Mark addressed"}
                          </button>
                          <button onClick={() => showThread(t)}>
                            View {t.revision} <ArrowUpRight size={12} />
                          </button>
                        </div>
                        <form
                          className="thread-reply-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!replyDrafts[t.id]?.trim()) return;
                            setReview((state) => ({
                              ...state,
                              threads: state.threads.map((n) =>
                                n.id === t.id
                                  ? {
                                      ...n,
                                      replies: [
                                        ...n.replies,
                                        replyDrafts[t.id].trim(),
                                      ],
                                    }
                                  : n,
                              ),
                            }));
                            setReplyDrafts((d) => ({ ...d, [t.id]: "" }));
                            toast("Reply added to this remark.");
                          }}
                        >
                          <input
                            aria-label={`Reply to remark ${t.id}`}
                            placeholder="Continue the thought…"
                            value={replyDrafts[t.id] || ""}
                            onChange={(e) =>
                              setReplyDrafts((d) => ({
                                ...d,
                                [t.id]: e.target.value,
                              }))
                            }
                            maxLength={500}
                            required
                          />
                          <button
                            className="icon-button"
                            aria-label={`Send reply to remark ${t.id}`}
                          >
                            <ArrowRight size={15} />
                          </button>
                        </form>
                      </article>
                    ))}
                    {!reviewThreads.length && (
                      <div className="empty-state compact">
                        <MessageSquare size={22} />
                        <h3>A fresh pair of eyes?</h3>
                        <p>
                          {threadFilter === "earlier"
                            ? "No earlier-version remarks yet."
                            : "Select a line to add the first remark on this version."}
                        </p>
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </>
          )}
          {nav === "decisions" && (
            <section>
              <div className="context-intro">
                <BookOpen size={24} />
                <div>
                  <h2>The why, alongside the what.</h2>
                  <p>
                    Small, shared notes that help the next person make a good
                    decision.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setModal({ kind: "decision" })}
                >
                  <Plus size={15} />
                  Pin a decision
                </button>
              </div>
              <div className="decision-grid">
                {decisions.map((d, i) => (
                  <article className="decision-card" key={d.id}>
                    <div>
                      <span className="decision-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Badge>{d.label}</Badge>
                    </div>
                    <h2>{d.title}</h2>
                    <p>{d.body}</p>
                    <footer>
                      <Avatar
                        initials={d.author === "Sam Chen" ? "SC" : "AM"}
                      />
                      {d.author}
                      <span>Pinned context</span>
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          )}
          {nav === "activity" && (
            <section>
              <div className="activity-summary">
                <span>
                  <span className="live-dot" />
                  {unseen
                    ? `${unseen} updates since your last visit`
                    : "You’re all caught up"}
                </span>
                <button
                  className="text-link"
                  disabled={!unseen}
                  onClick={() => {
                    setSeen(Math.max(...activity.map((a) => a.id)));
                    toast("Activity marked as seen.");
                  }}
                >
                  <CheckCheck size={15} />
                  Mark as seen
                </button>
              </div>
              <div className="activity-timeline">
                {activity.map((a) => (
                  <button
                    className={`timeline-item ${a.id > seen ? "unseen" : ""}`}
                    key={a.id}
                    onClick={() => go(a.target)}
                  >
                    <span className="timeline-icon">
                      <a.icon size={20} />
                    </span>
                    <span>
                      <small>
                        {a.time}
                        {a.id > seen ? " · New" : ""}
                      </small>
                      <strong>{a.title}</strong>
                      <p>{a.text}</p>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
            </section>
          )}
          <footer className="workspace-footer">
            <span>
              <img src={logo} alt="" />A work in good company.
            </span>
            <span>
              Sample workspace <i /> Changes reset on reload{" "}
              <button onClick={reset}>Reset</button>
            </span>
          </footer>
        </main>
      </div>
      <div className={`toast ${notice ? "visible" : ""}`} role="status">
        {notice && (
          <>
            <Check size={16} />
            {notice}
          </>
        )}
      </div>
      {modal && (
        <Dialog
          key={modal.kind}
          title={
            {
              "new-request": "Give the next step some context.",
              terminal: "Your project. In your terminal.",
              people: "Good company, right here.",
              repo: "The repository behind the work.",
              decision: "Leave a little of what you know.",
              "revision-info": "The code moves. The context stays.",
              search: "Where would you like to go?",
              request: requests.find((r) => r.id === modal.id)?.title,
            }[modal.kind]
          }
          close={() => setModal(null)}
          wide={modal.kind === "terminal"}
        >
          {modal.kind === "new-request" && (
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                const title = values.get("title").trim();
                if (
                  title.length < 5 ||
                  values.get("description").trim().length < 10
                ) {
                  toast("Add a clear title and a little more context.");
                  return;
                }
                setRequests((rows) => [
                  {
                    id: Math.max(...rows.map((r) => r.id)) + 1,
                    title,
                    description: values.get("description").trim(),
                    type: values.get("type"),
                    status: "Open",
                    author: "You",
                    initials: "AM",
                    updated: "Just now",
                    tags: [],
                  },
                  ...rows,
                ]);
                log("You opened a work request", title, "work", GitPullRequest);
                setQuery("");
                setType("All requests");
                go("work");
                toast("Request created in the sample workspace.");
              }}
            >
              <label>
                What kind of help?
                <select name="type">
                  <option>Question</option>
                  <option>Code review</option>
                  <option>Help wanted</option>
                </select>
              </label>
              <label>
                A clear next step
                <input
                  name="title"
                  placeholder="What would another pair of eyes help with?"
                  required
                  minLength={5}
                  maxLength={120}
                />
              </label>
              <label>
                A little context
                <textarea
                  name="description"
                  placeholder="What are you trying to do? What have you tried?"
                  required
                  minLength={10}
                  maxLength={1500}
                  rows={4}
                />
              </label>
              <p className="form-note">
                This prototype keeps your request in this browser session.
              </p>
              <button className="button primary">
                Create request <ArrowRight size={15} />
              </button>
            </form>
          )}
          {modal.kind === "people" && (
            <div className="people-list">
              {[
                ["AM", "Alex Morgan", "You · Project owner"],
                ["SC", "Sam Chen", "Contributor · Architecture"],
                ["JP", "Jamie Park", "Contributor · Testing"],
              ].map(([initials, name, role]) => (
                <div key={name}>
                  <Avatar initials={initials} />
                  <span>
                    <strong>{name}</strong>
                    <small>{role}</small>
                  </span>
                  <Badge tone="green">Contributor</Badge>
                </div>
              ))}
              <p className="form-note">
                Sample people for this concept. Production roles and access will
                reuse project and community rules.
              </p>
            </div>
          )}
          {modal.kind === "repo" && (
            <div className="repo-details">
              <span className="project-icon">
                <FolderGit2 size={28} />
              </span>
              <h3>orbit / queue</h3>
              <p>A small, dependable job queue for Node.js applications.</p>
              <dl>
                <div>
                  <dt>Repository</dt>
                  <dd>Example repository</dd>
                </div>
                <div>
                  <dt>Main branch</dt>
                  <dd>
                    <GitBranch size={13} />
                    main
                  </dd>
                </div>
                <div>
                  <dt>Stack</dt>
                  <dd>TypeScript · Node.js</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>Public project</dd>
                </div>
              </dl>
              <p className="form-note">
                Repository connections are a planned part of 0.2. This preview
                makes no GitHub requests.
              </p>
              <button className="button secondary" onClick={() => go("review")}>
                Explore the sample review <ArrowRight size={15} />
              </button>
            </div>
          )}
          {modal.kind === "revision-info" && (
            <div className="revision-info">
              <p>
                Each shared revision is an immutable snapshot of the selected
                files. A remark belongs to a file, line and revision — so a
                later edit cannot quietly change what someone reviewed.
              </p>
              <ol>
                <li>Read the v1 feedback.</li>
                <li>Share the prepared v2 snapshot.</li>
                <li>Compare implementation and regression test.</li>
                <li>Open an earlier remark to see its original code.</li>
                <li>
                  Add a new v2 remark, reply or explicitly mark one addressed.
                </li>
              </ol>
              <p className="form-note">
                The prepared v2 is sample data. Sharing it does not
                automatically resolve earlier remarks or publish anything to
                GitHub.
              </p>
            </div>
          )}
          {modal.kind === "decision" && (
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                const title = values.get("title").trim();
                if (title.length < 5 || values.get("body").trim().length < 10) {
                  toast("Add a clear decision and its reason.");
                  return;
                }
                setDecisions((rows) => [
                  ...rows,
                  {
                    id: Date.now(),
                    title,
                    body: values.get("body").trim(),
                    label: "Decision",
                    author: "You",
                  },
                ]);
                log(
                  "You pinned a project decision",
                  title,
                  "decisions",
                  BookOpen,
                );
                setModal(null);
                toast("Decision pinned in the sample workspace.");
              }}
            >
              <label>
                Decision title
                <input
                  name="title"
                  required
                  minLength={5}
                  maxLength={120}
                  placeholder="What should the next contributor know?"
                />
              </label>
              <label>
                The reason behind it
                <textarea
                  name="body"
                  rows={5}
                  required
                  minLength={10}
                  maxLength={1500}
                  placeholder="Describe the decision, the trade-off, and why it matters."
                />
              </label>
              <button className="button primary">
                Pin decision <BookOpen size={15} />
              </button>
            </form>
          )}
          {modal.kind === "search" && (
            <QuickSearch
              go={go}
              requests={requests}
              openRequest={openRequest}
            />
          )}
          {modal.kind === "request" && (
            <RequestDetails
              request={requests.find((r) => r.id === modal.id)}
              addMessage={(body) => {
                setRequests((rows) =>
                  rows.map((r) =>
                    r.id === modal.id
                      ? { ...r, messages: [...(r.messages || []), body] }
                      : r,
                  ),
                );
                log(
                  "You replied to a work request",
                  requests.find((r) => r.id === modal.id).title,
                  "work",
                  MessageSquare,
                );
              }}
              change={(status) => {
                setRequests((rows) =>
                  rows.map((r) =>
                    r.id === modal.id
                      ? { ...r, status, updated: "Just now" }
                      : r,
                  ),
                );
                toast("Request status updated.");
              }}
            />
          )}
          {modal.kind === "terminal" && (
            <TerminalConcept
              requests={requests}
              review={review}
              openReview={() => go("review")}
              openRequest={openRequest}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}
function QuickSearch({ go, requests, openRequest }) {
  const [search, setSearch] = useState("");
  return (
    <div className="quick-search">
      <label className="search-box">
        <Search size={18} />
        <input
          autoFocus
          aria-label="Search workspace"
          placeholder="Requests, decisions, activity…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <span className="tiny-label">GO TO</span>
      {navItems
        .filter(([, label]) =>
          label.toLowerCase().includes(search.toLowerCase()),
        )
        .map(([id, label, Icon]) => (
          <button className="quick-result" key={id} onClick={() => go(id)}>
            <Icon size={18} />
            {label}
            <ArrowRight size={15} />
          </button>
        ))}
      <span className="tiny-label">WORK REQUESTS</span>
      {requests
        .filter((r) => r.title.toLowerCase().includes(search.toLowerCase()))
        .map((r) => (
          <button
            className="quick-result"
            key={r.id}
            onClick={() => openRequest(r)}
          >
            <GitPullRequest size={17} />
            <span>{r.title}</span>
            <small>#{r.id}</small>
          </button>
        ))}
    </div>
  );
}
function RequestDetails({ request, change, addMessage }) {
  const [message, setMessage] = useState("");
  return (
    <div className="request-details">
      <div className="detail-meta">
        <Badge tone="purple">{request.type}</Badge>
        <label>
          Status
          <select
            aria-label="Request status"
            value={request.status}
            onChange={(e) => change(e.target.value)}
          >
            {["Open", "In progress", "Ready"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p>{request.description}</p>
      <span className="detail-author">
        <Avatar initials={request.initials} />
        {request.author}
      </span>
      <h3>Continue the conversation</h3>
      {(request.messages || []).map((m, i) => (
        <div className="thread-reply" key={i}>
          <strong>You</strong>
          <p>{m}</p>
        </div>
      ))}
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim()) {
            addMessage(message.trim());
            setMessage("");
          }
        }}
      >
        <label>
          Your message
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={1000}
            placeholder="Ask a question or offer a next step."
          />
        </label>
        <button className="button secondary">
          Add a message <ArrowRight size={15} />
        </button>
      </form>
    </div>
  );
}
function TerminalConcept({ requests, review, openReview, openRequest }) {
  const [selected, setSelected] = useState(0),
    [copied, setCopied] = useState(false);
  const rows = requests.filter((r) => r.status !== "Ready");
  return (
    <div>
      <p className="terminal-intro">
        Stay close to the code. The same project context, with a little less
        chrome.
      </p>
      <div
        className="terminal-window"
        tabIndex={0}
        role="group"
        aria-label="Terminal concept"
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            setSelected(
              (v) =>
                (v + (e.key === "ArrowUp" ? rows.length - 1 : 1)) % rows.length,
            );
          }
          if (e.key === "Enter") {
            e.preventDefault();
            openRequest(rows[selected]);
          }
        }}
      >
        <div className="terminal-window-bar">
          <span>
            <i />
            <i />
            <i />
          </span>
          <small>VS Code / Terminal · workspace concept</small>
        </div>
        <div className="terminal-content">
          <span className="term-command">❯ devdevian tui</span>
          <div className="term-brand">
            ✳ DEVDEVIAN <span>Orbit Queue</span>
          </div>
          <p className="term-muted">
            WORK REQUESTS <span>↑ ↓ select · Enter opens request</span>
          </p>
          {rows.map((r, i) => (
            <button
              className={selected === i ? "term-row selected" : "term-row"}
              key={r.id}
              onClick={() => setSelected(i)}
            >
              <span>
                {selected === i ? "›" : " "} #{r.id}
              </span>
              <strong>{r.title}</strong>
              <small>{r.status}</small>
            </button>
          ))}
          <div className="term-context">
            <span className="term-accent">PINNED CONTEXT</span>
            <p>Safe replay is a caller contract.</p>
            <span className="term-muted">
              Current snapshot {review.currentRevision} · same conversation in
              the browser
            </span>
          </div>
          <div className="term-prompt">
            › <span>Where does the next good idea start?</span>
            <b />
          </div>
        </div>
      </div>
      <div className="terminal-actions">
        <span>
          Proposed workspace view for 0.2.
          <br />
          The published CLI remains available today.
        </span>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                "npm install -g @tenyokjs/devdevian-cli@alpha",
              );
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy CLI install"}
        </button>
        <button className="button primary" onClick={openReview}>
          Open browser review <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
