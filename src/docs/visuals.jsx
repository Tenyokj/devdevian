import React, { useState, useId } from "react";
import {
  BookOpen,
  Github,
  Code2,
  ArrowRight,
  Monitor,
  Terminal,
  LockKeyhole,
  Globe,
  ShieldCheck,
  Users,
} from "lucide-react";
export const glossary = {
  snapshot:
    "An immutable copy of the exact code submitted for a review. Older feedback stays attached to that version.",
  expected_version:
    "The version you read before editing. A conflicting write is rejected instead of overwriting newer work.",
  operation_key:
    "An identifier for one publication attempt, used to detect a repeated or uncertain operation.",
  "/bind":
    "Associates this local directory with a Devdevian project. It uploads no repository files and grants no permissions.",
  community_id:
    "The audience of a members-only conversation. Current community membership is still required.",
  APP_URL:
    "The public application origin used for links and authentication redirects.",
  DB_PATH:
    "The local SQLite database path. Use isolated paths for development and tests.",
};
export function Term({ children }) {
  const id = useId(),
    text = String(children).trim(),
    tip = glossary[text];
  return tip ? (
    <span className="docs-term">
      <code tabIndex={0} aria-describedby={id}>
        {children}
      </code>
      <span role="tooltip" id={id}>
        {tip}
      </span>
    </span>
  ) : (
    <code>{children}</code>
  );
}
export function remarkCallouts() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === "blockquote") {
        const first = node.children?.[0]?.children?.[0];
        const m =
          first?.type === "text" &&
          first.value.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*/);
        if (m) {
          first.value = first.value.slice(m[0].length);
          node.data = {
            ...node.data,
            hProperties: {
              ...node.data?.hProperties,
              "data-callout": m[1].toLowerCase(),
            },
          };
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
function SyncMap() {
  const [client, setClient] = useState("Browser"),
    id = useId();
  return (
    <figure className="docs-diagram docs-sync-map">
      <figcaption>
        <span className="docs-label">ONE ACCOUNT · TWO WAYS IN</span>
        <strong>Your context travels with you.</strong>
      </figcaption>
      <div
        className="docs-diagram-tabs"
        role="group"
        aria-label="Explore clients"
      >
        {["Browser", "Terminal"].map((c) => (
          <button
            key={c}
            onClick={() => setClient(c)}
            aria-pressed={client === c}
          >
            {c}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 700 300" role="img" aria-labelledby={id}>
        <title id={id}>
          Browser and terminal share forum conversations, code reviews and
          project Rooms through one API
        </title>
        <path
          className="diagram-wire"
          d="M190 95C270 95 220 150 290 150M510 210C440 210 480 150 410 150M350 203V245M350 98V50"
          fill="none"
        />
        <g className={"diagram-node " + (client === "Browser" ? "active" : "")}>
          <rect x="18" y="45" width="173" height="106" rx="12" />
          <path d="M18 72H191" stroke="var(--doc-line)" />
          <circle cx="33" cy="60" r="3" fill="var(--doc-pink)" />
          <circle cx="45" cy="60" r="3" fill="var(--doc-accent)" />
          <text x="104" y="104" textAnchor="middle">
            Browser
          </text>
          <text className="diagram-sub" x="104" y="127" textAnchor="middle">
            Ask · discuss · build
          </text>
        </g>
        <circle
          cx="350"
          cy="150"
          r="61"
          fill="var(--doc-panel-2)"
          stroke="var(--doc-accent)"
        />
        <text
          x="350"
          y="146"
          textAnchor="middle"
          fill="var(--doc-text)"
          fontSize="17"
          fontWeight="600"
        >
          devdevian.
        </text>
        <text
          x="350"
          y="167"
          textAnchor="middle"
          fill="var(--doc-muted)"
          fontSize="10"
        >
          SHARED API
        </text>
        <g
          className={"diagram-node " + (client === "Terminal" ? "active" : "")}
        >
          <rect x="509" y="161" width="173" height="106" rx="12" />
          <text x="532" y="193" fill="var(--doc-accent)">
            $ devdevian tui
          </text>
          <path
            d="M530 209H639M530 221H610M530 233H652"
            stroke="var(--doc-line)"
            strokeWidth="4"
          />
        </g>
        <text
          x="350"
          y="34"
          textAnchor="middle"
          fill="var(--doc-pink)"
          fontSize="11"
        >
          SAME CONVERSATIONS
        </text>
        <text
          x="350"
          y="266"
          textAnchor="middle"
          fill="var(--doc-mint)"
          fontSize="11"
        >
          SAME PERMISSIONS
        </text>
        <text
          x="350"
          y="286"
          textAnchor="middle"
          fill="var(--doc-muted)"
          fontSize="10"
        >
          Local drafts and preferences stay on your device.
        </text>
      </svg>
      <p aria-live="polite">
        {client === "Browser"
          ? "Start a conversation in the browser. Pick it up in the terminal with the same account."
          : "Publish selected code from your terminal. Continue the review in your browser."}
      </p>
    </figure>
  );
}
function TaskBoard() {
  const [step, setStep] = useState(0),
    labels = ["Open", "In progress", "Ready"];
  return (
    <figure className="docs-diagram docs-board-demo">
      <figcaption>
        <span className="docs-label">
          ILLUSTRATIVE ROOM · NO DATA IS PUBLISHED
        </span>
        <strong>From a useful question to reviewed work.</strong>
      </figcaption>
      <div className="docs-demo-board">
        {labels.map((l, i) => (
          <section key={l}>
            <header>
              <i className={"stage-" + i} />
              {l}
              <span>{step === i ? 1 : 0}</span>
            </header>
            {step === i ? (
              <article>
                <small>CODE REVIEW</small>
                <strong>Bound the retry loop</strong>
                <p>Keep cancellation and context together.</p>
                <footer>
                  <span>AM</span>
                  {step === 0
                    ? "Available to claim"
                    : step === 1
                      ? "Assigned to Alex"
                      : "Ready for review"}
                </footer>
              </article>
            ) : (
              <div className="docs-board-placeholder">
                {i < step ? "Work moved forward" : "No task here yet"}
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="docs-demo-controls">
        <button onClick={() => setStep((step + 1) % 3)}>
          {step === 2 ? "Reset example" : "Move to " + labels[step + 1]}
          <ArrowRight size={14} />
        </button>
        <span aria-live="polite">
          {step === 2
            ? "Ready is a task state. Acceptance is a separate action."
            : step === 1
              ? "An eligible assignee can move their own task."
              : "An eligible participant can pick up an open task."}
        </span>
      </div>
    </figure>
  );
}
function AccessMatrix() {
  const [mode, setMode] = useState(0),
    modes = [
      "Public · Open",
      "Public · Approved",
      "Community · Open",
      "Community · Approved",
    ];
  return (
    <figure className="docs-diagram docs-access-map">
      <figcaption>
        <span className="docs-label">TWO INDEPENDENT CONTROLS</span>
        <strong>Who sees it? Who joins the work?</strong>
      </figcaption>
      <div
        className="docs-diagram-tabs"
        role="group"
        aria-label="Explore access rules"
      >
        {modes.map((m, i) => (
          <button key={m} onClick={() => setMode(i)} aria-pressed={i === mode}>
            {m}
          </button>
        ))}
      </div>
      <div className="docs-access-grid">
        <div>
          <Globe size={27} />
          <small>CAN READ</small>
          <strong>{mode < 2 ? "Everyone" : "Current community members"}</strong>
          <p>Visibility follows the project’s audience.</p>
        </div>
        <div>
          <ShieldCheck size={27} />
          <small>CAN PARTICIPATE</small>
          <strong>
            {mode % 2
              ? "Owner + approved users"
              : mode < 2
                ? "Signed-in readers"
                : "Current community members"}
          </strong>
          <p>
            {mode % 2
              ? "Community membership is still required for private work."
              : "Existing owner and author rules still apply."}
          </p>
        </div>
      </div>
      <div className="docs-access-boundary">
        <LockKeyhole size={17} />
        <span>
          Approval never grants co-ownership or access to a GitHub repository.
        </span>
      </div>
    </figure>
  );
}
function ArchitectureMap() {
  const id = useId();
  return (
    <figure className="docs-diagram">
      <figcaption>
        <span className="docs-label">SYSTEM MAP</span>
        <strong>One server boundary. Explicit provider connections.</strong>
      </figcaption>
      <svg viewBox="0 0 700 380" role="img" aria-labelledby={id}>
        <title id={id}>
          Browser and CLI use Vercel API functions; server connects to
          authentication, Turso database, Supabase file storage, Brevo and
          GitHub App
        </title>
        {[
          [110, 65],
          [350, 40],
          [590, 65],
          [110, 310],
          [350, 340],
          [590, 310],
        ].map(([x, y], i) => (
          <path
            key={i}
            d={`M350 185 Q${x} 185 ${x} ${y}`}
            fill="none"
            className="diagram-wire"
          />
        ))}
        {[
          ["Browser", 110, 65],
          ["Terminal", 350, 40],
          ["Google / GitHub login", 590, 65],
          ["Turso · database", 110, 310],
          ["Supabase · files", 350, 340],
          ["Brevo / GitHub App", 590, 310],
        ].map(([label, x, y]) => (
          <g key={label} className="diagram-node">
            <rect x={x - 97} y={y - 23} width="194" height="46" rx="9" />
            <text x={x} y={y + 5} textAnchor="middle" style={{ fontSize: 12 }}>
              {label}
            </text>
          </g>
        ))}
        <g className="diagram-node active">
          <rect x="245" y="147" width="210" height="78" rx="16" />
          <text x="350" y="179" textAnchor="middle">
            Devdevian API
          </text>
          <text x="350" y="200" textAnchor="middle" className="diagram-sub">
            Authentication · permissions · work
          </text>
        </g>
      </svg>
      <p>
        Clients do not receive database or provider credentials. Repository
        access uses a separate GitHub App connection.
      </p>
    </figure>
  );
}
function ReviewMap() {
  return (
    <figure className="docs-diagram">
      <figcaption>
        <span className="docs-label">VERSION-BOUND FEEDBACK</span>
        <strong>New code. Original context preserved.</strong>
      </figcaption>
      <div className="docs-revision-map">
        <div>
          <span className="docs-revision-label">SNAPSHOT 01</span>
          <pre>
            <code>
              <span className="docs-removed">− retryForever(task)</span>
            </code>
          </pre>
          <aside>
            <span>↳</span> What happens on a permanent failure?
          </aside>
        </div>
        <div>
          <span className="docs-revision-label">SNAPSHOT 02</span>
          <pre>
            <code>
              <span className="docs-added">
                + retry(task, {"{ attempts: 3 }"})
              </span>
            </code>
          </pre>
          <aside>
            <span>↳</span> Earlier feedback remains attached to snapshot 01.
          </aside>
        </div>
      </div>
      <p>
        Publishing a new revision does not silently resolve old remarks or move
        an outcome to different code.
      </p>
    </figure>
  );
}
export function GuideVisual({ slug }) {
  if (["overview", "first-session"].includes(slug)) return <SyncMap />;
  if (slug === "rooms") return <TaskBoard />;
  if (slug === "participation") return <AccessMatrix />;
  if (slug === "architecture") return <ArchitectureMap />;
  if (slug === "review-flow") return <ReviewMap />;
  return null;
}
const captures = {
  overview: [
    "workspace-current.png",
    "Project overview: context, contributor credits and linked work.",
  ],
  rooms: [
    "room-current.png",
    "A project Room with tasks, assignees and working states.",
  ],
  "github-app": [
    "github-current.png",
    "GitHub Workspace with illustrative repository data in an isolated demo.",
  ],
  cli: [
    "cli-room-current.png",
    "The current terminal client connected to an isolated demonstration Room.",
  ],
  "review-flow": [
    "cli-review.png",
    "Human line feedback and exact code context in the terminal.",
  ],
  "first-session": [
    "conversation-screen.png",
    "A focused conversation keeps questions and useful answers together.",
  ],
  workspaces: [
    "workspace-current.png",
    "A project workspace connects its description to the next useful task.",
  ],
};
export function GuideCapture({ slug }) {
  const c = captures[slug];
  return c ? (
    <figure className="docs-capture">
      <img src={"/screenshots/" + c[0]} alt={c[1]} loading="lazy" />
      <figcaption>{c[1]}</figcaption>
    </figure>
  ) : null;
}
export function DocsHome() {
  return (
    <section className="docs-home">
      <div className="docs-label">THE DEVELOPER FIELD GUIDE</div>
      <h1>
        Less searching.
        <br />
        <em>More building together.</em>
      </h1>
      <p>
        Practical guides for your next conversation, your next review, and the
        project you can’t stop thinking about.
      </p>
      <div className="docs-home-paths">
        {[
          [
            BookIcon,
            "01",
            "Start here",
            "From your first account to a useful technical conversation.",
            "first-session",
          ],
          [
            Terminal,
            "02",
            "In your terminal",
            "Files, Git diff, human code reviews and a live workspace.",
            "cli",
          ],
          [
            Users,
            "03",
            "Build together",
            "Projects, Rooms, contributions and clear working permissions.",
            "rooms",
          ],
        ].map(([Icon, n, title, body, path]) => (
          <a href={"/docs/" + path} key={path}>
            <span>
              {n}
              <Icon size={27} />
            </span>
            <h2>{title}</h2>
            <p>{body}</p>
            <strong>
              Explore guide
              <ArrowRight size={15} />
            </strong>
          </a>
        ))}
      </div>
      <div className="docs-home-secondary">
        <div>
          <span className="docs-label">GO A LITTLE DEEPER</span>
          <h2>
            Understand the tools.
            <br />
            Keep the context.
          </h2>
        </div>
        <div>
          <a href="/docs/github-app">
            <GithubIcon />
            Connect GitHub
            <span>Repositories, issues, pull requests and checks.</span>
            <ArrowRight size={16} />
          </a>
          <a href="/docs/development">
            <CodeIcon />
            Contribute to Devdevian
            <span>Local setup, source navigation and verification.</span>
            <ArrowRight size={16} />
          </a>
          <a href="/docs/reliability">
            <ShieldCheck size={21} />
            Operate your instance
            <span>Deployment, encrypted backups and restore checks.</span>
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
      <div className="docs-home-peek">
        <div>
          <span className="docs-label">BROWSER + TERMINAL</span>
          <h2>A shared place for real work.</h2>
          <p>Explore the project workspace and the people moving it forward.</p>
          <a href="/docs/workspaces">
            Inside a workspace
            <ArrowRight size={15} />
          </a>
        </div>
        <img
          src="/screenshots/workspace-current.png"
          alt="Devdevian project overview with contributors and work requests"
          loading="lazy"
        />
      </div>
    </section>
  );
}
function BookIcon(p) {
  return <Monitor {...p} />;
}
function GithubIcon() {
  return <Github size={21} />;
}
function CodeIcon() {
  return <span aria-hidden="true">{"{}"}</span>;
}
