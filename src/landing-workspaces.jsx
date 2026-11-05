import React, { useState } from "react";
import {
  ArrowUpRight,
  FolderGit2,
  Github,
  Users,
  Terminal,
} from "lucide-react";
import "./landing-workspaces.css";
const views = [
  [
    "room",
    "Project Rooms",
    "room-current.png",
    "A place for the work between conversations.",
    "Take a task, keep context, and bring a useful result back to the team.",
    "/docs/rooms",
    Users,
  ],
  [
    "github",
    "GitHub Workspace",
    "github-current.png",
    "Your repository, beside the conversation.",
    "Inspect pull requests, exact changes and checks before sharing selected code for a human review.",
    "/docs/github-app",
    Github,
  ],
  [
    "terminal",
    "Terminal workspace",
    "cli-room-current.png",
    "Keep building. Stay in your terminal.",
    "The same project Rooms, tasks and permissions, without leaving your working directory.",
    "/docs/cli",
    Terminal,
  ],
];
export default function WorkspaceShowcase() {
  const [selected, setSelected] = useState(0),
    view = views[selected];
  return (
    <section className="landing-workspace-showcase" data-reveal>
      <div className="workspace-showcase-heading">
        <span className="landing-kicker">CONVERSATIONS → SHARED WORK</span>
        <h2>
          Good context.
          <br />
          <em>Real momentum.</em>
        </h2>
        <p>
          Projects, GitHub and your terminal. A clearer place for the next
          useful step.
        </p>
      </div>
      <div
        className="workspace-showcase-tabs"
        role="group"
        aria-label="Explore project workspaces"
      >
        {views.map(([id, label, , , , , Icon], i) => (
          <button
            key={id}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      <figure key={view[0]}>
        <img
          src={"/screenshots/" + view[2]}
          alt={view[1] + " in an isolated Devdevian demonstration workspace"}
          width={view[0] === "terminal" ? 1440 : 1512}
          height={view[0] === "terminal" ? 830 : 1100}
          loading="lazy"
        />
        <figcaption>
          <div>
            <strong>{view[3]}</strong>
            <p>{view[4]}</p>
            <small>
              ISOLATED DEMONSTRATION
              {view[0] === "github" ? " · ILLUSTRATIVE GITHUB DATA" : ""}
            </small>
          </div>
          <a href={view[5]}>
            Explore the guide
            <ArrowUpRight size={17} />
          </a>
        </figcaption>
      </figure>
    </section>
  );
}
