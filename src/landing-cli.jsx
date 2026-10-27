import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Terminal,
  Check,
  Copy,
  GitPullRequest,
  FolderCode,
  Palette,
} from "lucide-react";
const docs =
  "https://github.com/Tenyokj/devdevian/blob/main/packages/cli/README.md";
export const reviewCommand =
  'devdevian review create --file src/retry.ts --lines 1:18 --title "Review my retry strategy" --focus "Timeouts and idempotency"';
const views = [
  {
    name: "Your workspace",
    image: "/screenshots/cli-feed.png",
    alt: "Devdevian CLI public feed with keyboard navigation and conversation cards",
    text: "Your account. Your conversations. Right where you build.",
  },
  {
    name: "Human code review",
    image: "/screenshots/cli-review.png",
    alt: "Devdevian terminal code review showing source lines beside developer feedback",
    text: "Select a file or Git diff. Keep the code and the conversation side by side.",
  },
  {
    name: "Make it yours",
    image: "/screenshots/cli-appearance.png",
    alt: "Devdevian CLI Appearance workspace with theme, accent and layout options",
    text: "Four themes, custom accents and compact layouts. Meet Devi, your terminal companion.",
  },
];
export function CopyCommand({ value, label = "Copy install command" }) {
  const [copied, setCopied] = useState(false),
    timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
export function CLISection() {
  const [active, setActive] = useState(0);
  return (
    <section
      className="landing-cli"
      id="cli"
      data-reveal
      aria-labelledby="cli-heading"
    >
      <div className="cli-heading-row">
        <span className="landing-kicker">
          <Terminal size={16} /> YOUR FORUM. NOW IN YOUR TERMINAL.
        </span>
        <span className="cli-alpha">CLI · PUBLIC ALPHA</span>
      </div>
      <div className="cli-intro-grid">
        <h2 id="cli-heading">
          Stay in your flow.
          <br />
          <em>Bring your people with you.</em>
        </h2>
        <div>
          <p>
            Ask a question, review real code, share a project or find your next
            meetup. Devdevian CLI connects to the same forum, with the same
            account. Open it inside VS Code, over SSH or in your favorite
            terminal.
          </p>
          <a className="landing-text-link" href={docs}>
            Meet the CLI · setup & documentation <ArrowUpRight size={17} />
          </a>
        </div>
      </div>
      <div className="cli-install">
        <span aria-hidden="true">$</span>
        <code>npm install -g @tenyokjs/devdevian-cli@alpha</code>
        <CopyCommand value="npm install -g @tenyokjs/devdevian-cli@alpha" />
      </div>
      <p className="cli-start-note">
        Node.js 24+ · Run <code>devdevian tui</code> · Authorize securely in
        your browser
      </p>
      <div
        className="cli-tabs"
        role="tablist"
        aria-label="Explore the terminal workspace"
      >
        {views.map((view, i) => (
          <button
            key={view.name}
            id={"cli-tab-" + i}
            role="tab"
            aria-selected={active === i}
            aria-controls="cli-preview"
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              let next =
                e.key === "ArrowRight"
                  ? (i + 1) % 3
                  : e.key === "ArrowLeft"
                    ? (i + 2) % 3
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 2
                        : null;
              if (next !== null) {
                e.preventDefault();
                setActive(next);
                document.getElementById("cli-tab-" + next)?.focus();
              }
            }}
          >
            {view.name}
          </button>
        ))}
      </div>
      <div
        className="cli-preview"
        role="tabpanel"
        id="cli-preview"
        aria-labelledby={"cli-tab-" + active}
      >
        <img
          key={active}
          src={views[active].image}
          alt={views[active].alt}
          loading="lazy"
          width="1440"
          height="830"
        />
        <div className="cli-preview-caption">
          <span className="landing-status-dot" />
          {views[active].text}
          <small>ACTUAL CLI · DEMONSTRATION DATA</small>
        </div>
      </div>
      <div className="cli-capabilities">
        <span>
          <GitPullRequest size={18} /> Files & Git diffs
        </span>
        <span>
          <FolderCode size={18} /> Projects & Events
        </span>
        <span>
          <Palette size={18} /> Themes & Devi
        </span>
        <a href="https://www.npmjs.com/package/@tenyokjs/devdevian-cli">
          View on npm <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
export function CLIReview() {
  const [command, setCommand] = useState(false);
  return (
    <div className="landing-code-card cli-review-card">
      <div className="code-card-heading">
        <span>
          <Terminal size={15} /> devdevian · human code review
        </span>
        <CopyCommand value={reviewCommand} label="Copy review command" />
      </div>
      <div
        className="cli-review-switch"
        role="group"
        aria-label="Code review preview"
      >
        <button aria-pressed={!command} onClick={() => setCommand(false)}>
          Live workspace
        </button>
        <button aria-pressed={command} onClick={() => setCommand(true)}>
          From the command line
        </button>
      </div>
      {command ? (
        <div className="cli-command-example">
          <span className="mini-kicker">
            A FILE YOU CHOOSE. FEEDBACK FROM PEOPLE.
          </span>
          <pre>
            <code>
              <span className="syntax-keyword">$ devdevian</span>
              {
                ' review create \\\n  --file src/retry.ts \\\n  --lines 1:18 \\\n  --title "Review my retry strategy" \\\n  --focus "Timeouts and idempotency"'
              }
            </code>
          </pre>
          <p>
            Preview the selected snippet and confirm before publishing. Continue
            the conversation in your terminal or browser.
          </p>
        </div>
      ) : (
        <img
          src="/screenshots/cli-review.png"
          alt="Devdevian CLI source review and line-specific feedback in a split terminal workspace"
          loading="lazy"
          width="1440"
          height="830"
        />
      )}
      <a href={docs} className="cli-review-docs">
        Files, diffs, line comments & replies <ArrowUpRight size={16} />
      </a>
    </div>
  );
}
// One request at a time, only while visible. Never infer private activity or show a fake zero.
export function PublicActivity() {
  const root = useRef(null),
    [value, setValue] = useState(null),
    [status, setStatus] = useState("loading");
  useEffect(() => {
    let visible = false,
      stopped = false,
      controller,
      timer,
      busy = false;
    const clear = () => {
      clearTimeout(timer);
      controller?.abort();
    };
    const refresh = async () => {
      if (stopped || !visible || document.hidden || busy) return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch("/api/public-stats", {
          credentials: "omit",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw Error("Unavailable");
        const data = await response.json();
        if (!Number.isSafeInteger(data.conversations) || data.conversations < 0)
          throw Error("Invalid count");
        if (!stopped) {
          setValue(data.conversations);
          setStatus("live");
        }
      } catch (e) {
        if (!stopped && visible && !document.hidden) setStatus("unavailable");
      } finally {
        clearTimeout(timeout);
        busy = false;
        if (!stopped && visible && !document.hidden)
          timer = setTimeout(refresh, 30000);
      }
    };
    const sync = () => {
      clear();
      if (visible && !document.hidden) refresh();
    };
    const observer = window.IntersectionObserver
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          sync();
        })
      : null;
    if (observer) observer.observe(root.current);
    else {
      visible = true;
      refresh();
    }
    document.addEventListener("visibilitychange", sync);
    return () => {
      stopped = true;
      clear();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const formatted =
    value === null ? "—" : new Intl.NumberFormat("en-US").format(value);
  return (
    <section
      className="landing-activity"
      ref={root}
      aria-labelledby="activity-heading"
      data-reveal
    >
      <div>
        <span className="landing-kicker">
          <span className="landing-status-dot" /> BUILT ONE CONVERSATION AT A
          TIME
        </span>
        <h2 id="activity-heading">
          A question today.
          <br />
          <em>Someone's next step tomorrow.</em>
        </h2>
        <p>
          From the browser to the terminal, every public conversation has a
          place here.
        </p>
      </div>
      <div className="activity-counter">
        <div
          className="activity-number"
          role="status"
          aria-live="polite"
          aria-label={
            value === null
              ? status === "loading"
                ? "Loading public conversation count"
                : "Conversation count currently unavailable"
              : `${formatted} public conversations`
          }
        >
          <span aria-hidden="true">
            {[...formatted].map((digit, i) =>
              /\d/.test(digit) ? (
                <span className="activity-digit" key={formatted.length - 1 - i}>
                  <span
                    className="activity-reel"
                    style={{ "--digit": Number(digit) }}
                  >
                    {Array.from({ length: 10 }, (_, n) => (
                      <span key={n}>{n}</span>
                    ))}
                  </span>
                </span>
              ) : (
                <span className="activity-separator" key={"s" + i}>
                  {digit}
                </span>
              ),
            )}
          </span>
        </div>
        <strong>public conversations</strong>
        <small>
          {status === "live"
            ? "Updates about every 30 seconds"
            : value === null
              ? status === "loading"
                ? "Connecting to the forum"
                : "Count temporarily unavailable"
              : "Showing the last available count"}{" "}
          · Private communities stay private
        </small>
      </div>
    </section>
  );
}
