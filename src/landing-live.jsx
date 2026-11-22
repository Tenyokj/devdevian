import React, { useState } from "react";
import { Radio, ArrowUpRight, Users, Code2, CheckCircle2 } from "lucide-react";
import "./landing-live.css";
const views = [
  {
    id: "shared",
    label: "Work together",
    image: "live-shared.webp",
    title: "Two perspectives. One shared document.",
    text: "Edit a focused snippet, see each other’s cursors and talk beside the code.",
  },
  {
    id: "outcome",
    label: "Keep the outcome",
    image: "live-result.webp",
    title: "The next step belongs with the conversation.",
    text: "Save the final snapshot and summary. Preview before publishing a reply to the original discussion.",
  },
];
export default function LiveShowcase() {
  const [selected, setSelected] = useState(0),
    view = views[selected];
  return (
    <section
      className="landing-live"
      id="live"
      data-reveal
      aria-labelledby="landing-live-title"
    >
      <div className="landing-live-heading">
        <span className="landing-kicker">
          <Radio size={16} /> INTRODUCING DEVDEVIAN LIVE
        </span>
        <h2 id="landing-live-title">
          Don’t just discuss it.
          <br />
          <em>Work through it. Together.</em>
        </h2>
        <p>
          Turn a conversation into a shared coding session. Bring someone in,
          explore the problem and keep a useful result.
        </p>
        <div className="landing-live-actions">
          <a className="landing-button" href="/app#live">
            Open Live sessions <ArrowUpRight size={18} />
          </a>
          <a className="landing-text-link" href="/docs/live">
            How Live works <ArrowUpRight size={17} />
          </a>
        </div>
      </div>
      <div className="landing-live-principles">
        {[
          [
            Users,
            "Invite your people",
            "Host, editor and viewer roles. Existing community and project permissions still apply.",
          ],
          [
            Code2,
            "Build a shared understanding",
            "Code, cursors, chat and the original snippet beside your changes.",
          ],
          [
            CheckCircle2,
            "Leave a useful next step",
            "A saved outcome, with a separate confirmation before sharing it back.",
          ],
        ].map(([Icon, title, text]) => (
          <div key={title}>
            <Icon size={22} />
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <div
        className="landing-live-tabs"
        role="group"
        aria-label="Explore Live sessions"
      >
        {views.map((v, i) => (
          <button
            key={v.id}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            {v.label}
          </button>
        ))}
        <span>
          <i /> Invited participants only
        </span>
      </div>
      <figure key={view.id}>
        <img
          src={"/screenshots/" + view.image}
          width="1600"
          height="900"
          loading="lazy"
          alt={
            view.id === "shared"
              ? "Two local demo developers collaborating in Devdevian Live, with shared code and session chat"
              : "A Live session outcome published as a reply in its original conversation"
          }
        />
        <figcaption>
          <strong>{view.title}</strong>
          <p>{view.text}</p>
          <small>LOCAL DEMO · ILLUSTRATIVE ACCOUNTS</small>
        </figcaption>
      </figure>
      <p className="landing-live-boundary">
        Browser-based · Changes sync in a few seconds · No code execution
      </p>
    </section>
  );
}
