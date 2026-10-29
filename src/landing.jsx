import { CLISection, CLIReview, PublicActivity } from "./landing-cli";
import StackRibbon from "./stack";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  Code2,
  MessageCircle,
  Users,
  Sparkles,
  Check,
  GitPullRequest,
  CalendarDays,
  Github,
  Plus,
  Copy,
  CheckCircle2,
  ShieldCheck,
  Image,
  Terminal,
  CircleDot,
} from "lucide-react";
import media from "./landing-media.json";
import "./landing.css";

const repository = "https://github.com/Tenyokj/devdevian";
const conversations = [
  {
    id: "question",
    label: "Questions",
    icon: MessageCircle,
    tag: "TypeScript · Question",
    title: "Why does this work locally, but fail in production?",
    text: "Share the context, the error, and what you've already tried. Give someone a useful starting point.",
    reply:
      "Could you share the response status? The request might be returning an error page instead of JSON.",
    outcome: "Mark the answer that helped",
    color: "#97bcff",
  },
  {
    id: "discussion",
    label: "Discussions",
    icon: Users,
    tag: "Architecture · Discussion",
    title: "When does a side project actually need a queue?",
    text: "Trade experiences, explain your decisions, and hear how other developers approach the same problem.",
    reply:
      "For us, the turning point was needing to retry work independently of the original request.",
    outcome: "Make room for another perspective",
    color: "#b5a0ff",
  },
  {
    id: "review",
    label: "Code reviews",
    icon: GitPullRequest,
    tag: "JavaScript · Code review",
    title: "A second pair of eyes on my error handling?",
    text: "Bring a focused snippet and the tradeoffs you're thinking about. Ask for feedback you can act on.",
    reply:
      "Check response.ok before parsing the body. A resolved fetch promise doesn't guarantee a successful HTTP response.",
    outcome: "Turn feedback into a better next version",
    color: "#e8b6ff",
  },
  {
    id: "showcase",
    label: "Show & tell",
    icon: Sparkles,
    tag: "Indie building · Show & tell",
    title: "My weekend project finally escaped localhost.",
    text: "Share what you made, explain who it's for, and ask people to try the part you're still figuring out.",
    reply:
      "The idea makes sense. I'd love to see a sample project before starting with a blank workspace.",
    outcome: "Keep the feedback with the project",
    color: "#8ce1d2",
  },
];
const questions = [
  [
    "What is Devdevian?",
    "Devdevian is a forum for programmers: a place for technical questions, thoughtful discussions, code feedback, and sharing what you're building. Conversations and communities are at the center of the experience.",
  ],
  [
    "Who is it for?",
    "Anyone who writes code or works with technology — from someone shipping their first project to an experienced developer reviewing a difficult tradeoff. You don't need a particular stack or experience level to join the conversation.",
  ],
  [
    "How are topics different from communities?",
    "Topics and technologies organize the public feed. Private communities are separate spaces: members need approval to join, and their conversations stay inside that community. Community owners and validators manage access and moderation.",
  ],
  [
    "Can I ask for code reviews or share a project?",
    "Yes. A code review can include context, a snippet, files, and links. Projects have their own presentation with screenshots, team members, and a linked feedback conversation. You can also share a smaller experiment as a Show & tell post.",
  ],
  [
    "Does Devdevian host my Git repositories?",
    "No. Keep your repositories on GitHub or another code host and link them in your posts or projects. Devdevian provides a place to discuss the work, find help, and keep feedback in context.",
  ],
  [
    "Is the project open source? Can I contribute?",
    "Yes. The source is available on GitHub under GPL v3. Any developer can propose an improvement, report a bug, or contribute code and design. Read CONTRIBUTING.md and SECURITY.md first; contributions follow the project's review and security rules.",
  ],
  [
    "Is Devdevian finished?",
    "It's live and in active development. The web forum and terminal client share the same account and conversations. Screens and workflows will evolve. Issues, ideas, and thoughtful contributions help shape what comes next.",
  ],
];
function GlowCard({ children, className = "", ...props }) {
  return (
    <div
      className={"landing-glow-card " + className}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const bounds = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty(
          "--pointer-x",
          `${e.clientX - bounds.left}px`,
        );
        e.currentTarget.style.setProperty(
          "--pointer-y",
          `${e.clientY - bounds.top}px`,
        );
      }}
      {...props}
    >
      {children}
    </div>
  );
}
function Screenshot({ name, label, compact = false }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={"landing-screenshot " + (compact ? "compact" : "")}>
      {media[name] && !failed ? (
        <img
          src={media[name]}
          alt={label}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="screenshot-placeholder"
          role="img"
          aria-label={label + " — screenshot coming soon"}
        >
          <div className="screenshot-wireframe" aria-hidden="true">
            <div className="wire-sidebar">
              <span />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="wire-content">
              <div className="wire-heading" />
              <div className="wire-card">
                <i />
                <span />
                <span />
              </div>
              <div className="wire-card short">
                <i />
                <span />
              </div>
            </div>
          </div>
          <div className="screenshot-placeholder-copy">
            <Image size={25} />
            <strong>{label}</strong>
            <span>A closer look, coming soon.</span>
          </div>
        </div>
      )}
      <figcaption>
        <span className="landing-status-dot" />
        {label}
        <span>
          {media[name] && !failed ? "PRODUCT PREVIEW" : "SCREENSHOT SPACE"}
        </span>
      </figcaption>
    </figure>
  );
}

// Keep native details semantics, including keyboard activation, while animating
// the measured height in both directions. Rapid clicks reverse from the current size.
function FAQItem({ children, ...props }) {
  const element = useRef(null);
  const animation = useRef(null);
  const desired = useRef(false);
  useEffect(() => () => animation.current?.cancel(), []);
  const toggle = (event) => {
    if (!event.target.closest("summary")) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !element.current.animate
    )
      return;
    event.preventDefault();
    const node = element.current;
    const start = node.getBoundingClientRect().height;
    desired.current = animation.current ? !desired.current : !node.open;
    animation.current?.cancel();
    node.open = true;
    const end = desired.current
      ? node.scrollHeight
      : node.querySelector("summary").getBoundingClientRect().height;
    node.style.overflow = "hidden";
    const current = node.animate(
      [{ height: start + "px" }, { height: end + "px" }],
      { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    animation.current = current;
    current.onfinish = () => {
      if (animation.current !== current) return;
      node.open = desired.current;
      node.style.overflow = "";
      animation.current = null;
    };
  };
  return (
    <details {...props} ref={element} onClick={toggle}>
      {children}
    </details>
  );
}

export default function Landing() {
  const root = useRef(null);
  const [active, setActive] = useState(0);
  const example = conversations[active];
  useEffect(() => {
    // Keep the landing dark without overwriting the forum's saved theme.
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.content;
    document.body.classList.add("landing-page");
    if (meta) meta.content = "#090c18";
    return () => {
      document.body.classList.remove("landing-page");
      if (meta) meta.content = previous;
    };
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!window.IntersectionObserver) return;
    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            reveal.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    element
      .querySelectorAll("[data-reveal]")
      .forEach((node) => reveal.observe(node));
    element.classList.add("motion-ready");
    // The particle field stops when the hero or browser tab is out of view.
    let heroVisible = true;
    const syncMotion = () =>
      element.classList.toggle("hero-paused", !heroVisible || document.hidden);
    const hero = new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      syncMotion();
    });
    hero.observe(element.querySelector(".landing-hero"));
    document.addEventListener("visibilitychange", syncMotion);
    return () => {
      reveal.disconnect();
      hero.disconnect();
      document.removeEventListener("visibilitychange", syncMotion);
    };
  }, []);
  return (
    <div className="landing" ref={root}>
      <a href="#explore" className="landing-skip">
        Skip to content
      </a>
      <div className="landing-opening">
        <nav className="landing-nav" aria-label="Main navigation">
          <a className="landing-brand" href="/" aria-label="Devdevian home">
            <img src="/devdevian-logo.png" alt="" />
            devdevian<span>.</span>
          </a>
          <div className="landing-nav-links">
            <a href="#cli">CLI</a>
            <a href="#explore">Explore</a>
            <a href="#community">Communities</a>
            <a href="#open-source">Open source</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="landing-nav-actions">
            <a
              href={repository}
              className="landing-github"
              aria-label="Devdevian on GitHub"
            >
              <Github size={21} />
            </a>
            <a className="landing-button small" href="/app">
              Enter the forum <ArrowUpRight size={16} />
            </a>
          </div>
        </nav>

        <section className="landing-hero" aria-label="Welcome to Devdevian">
          <div className="hero-haze" aria-hidden="true" />
          <div className="hero-particles" aria-hidden="true">
            {Array.from({ length: 64 }, (_, i) => (
              <i
                key={i}
                style={{
                  "--x": `${(i * 37.7) % 100}%`,
                  "--size": `${3 + ((i * 7) % 17)}px`,
                  "--duration": `${10 + ((i * 3.7) % 16)}s`,
                  "--delay": `${-((i * 2.3) % 26)}s`,
                  "--drift": `${((i * 31) % 160) - 80}px`,
                  "--alpha": 0.15 + (i % 5) * 0.09,
                }}
              />
            ))}
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="hero-logo-stage">
            <img
              className="hero-logo"
              src="/devdevian-logo.png"
              alt="Devdevian"
              fetchPriority="high"
            />
          </div>
          <div className="hero-caption">
            <span>CURIOUS MINDS. SHARED CONTEXT. BETTER CODE.</span>
            <a href="#explore" aria-label="Explore Devdevian">
              <ArrowDown size={20} />
            </a>
          </div>
          <div className="hero-bottom-glow" aria-hidden="true" />
        </section>
      </div>

      <div className="landing-world">
        <main className="landing-main" id="explore">
          <section className="landing-intro" data-reveal>
            <span className="landing-kicker">
              <span className="landing-status-dot" /> A FORUM FOR EVERY
              DEVELOPER
            </span>
            <h1>
              Less noise.
              <br />
              <em>More figuring it out together.</em>
            </h1>
            <div className="intro-bottom">
              <p>
                Devdevian puts the conversation first. Ask a real question.
                Share an unfinished idea. Find people who understand the problem
                — and want to help you solve it.
              </p>
              <div>
                <a className="landing-button" href="/app">
                  Explore the forum <ArrowUpRight size={18} />
                </a>
                <span className="development-note">
                  <CircleDot size={13} /> In active development · Fully open
                  source
                </span>
              </div>
            </div>
          </section>

          <CLISection />

          <section
            className="landing-showcase"
            data-reveal
            aria-labelledby="showcase-heading"
          >
            <div className="section-topline">
              <span className="landing-kicker">
                01 / A GOOD CONVERSATION IS A START
              </span>
              <span>YOUR STACK. YOUR QUESTIONS. YOUR PERSPECTIVE.</span>
            </div>
            <h2 id="showcase-heading">
              Bring the context.
              <br />
              <em>Find your next step.</em>
            </h2>
            <p className="section-description">
              One public forum. Different ways to move the work forward. Topics
              and technologies help the right people find the conversation.
            </p>
            <div
              className="conversation-tabs"
              role="tablist"
              aria-label="Explore conversation types"
            >
              {conversations.map((item, i) => (
                <button
                  key={item.id}
                  id={"demo-tab-" + item.id}
                  role="tab"
                  aria-selected={active === i}
                  aria-controls="conversation-example"
                  tabIndex={active === i ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => {
                    const next =
                      e.key === "ArrowRight"
                        ? (i + 1) % 4
                        : e.key === "ArrowLeft"
                          ? (i + 3) % 4
                          : e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? 3
                              : null;
                    if (next !== null) {
                      e.preventDefault();
                      setActive(next);
                      document
                        .getElementById("demo-tab-" + conversations[next].id)
                        ?.focus();
                    }
                  }}
                >
                  <item.icon size={17} />
                  {item.label}
                </button>
              ))}
            </div>
            <div
              className="conversation-example"
              id="conversation-example"
              role="tabpanel"
              aria-labelledby={"demo-tab-" + example.id}
              style={{ "--demo-accent": example.color }}
            >
              <GlowCard className="example-conversation" key={example.id}>
                <div className="example-label">
                  <span />
                  {example.tag}
                  <small>ILLUSTRATIVE EXAMPLE</small>
                </div>
                <h3>{example.title}</h3>
                <p>{example.text}</p>
                <div className="example-response">
                  <div className="example-avatar">
                    <Code2 size={19} />
                  </div>
                  <div>
                    <strong>Another developer's perspective</strong>
                    <p>{example.reply}</p>
                  </div>
                </div>
                <div className="example-outcome">
                  <CheckCircle2 size={16} />
                  {example.outcome}
                </div>
              </GlowCard>
              <div className="example-aside">
                <span className="mini-kicker">
                  A SPACE FOR THE WHOLE PROCESS
                </span>
                <p>
                  From <em>“I'm stuck”</em>
                  <br />
                  to <em>“that makes sense.”</em>
                </p>
                <span>
                  Code, files, images, and links.
                  <br />
                  Replies that stay with the question.
                </span>
                <a href="/app">
                  Start a conversation <ArrowRight size={17} />
                </a>
              </div>
            </div>
            <Screenshot name="feed" label="The public feed" />
          </section>

          <section className="landing-review" data-reveal>
            <div className="review-copy">
              <span className="landing-kicker">02 / A SECOND PAIR OF EYES</span>
              <h2>
                Better code starts
                <br />
                with <em>“what if?”</em>
              </h2>
              <p>
                Some problems need more than a quick reaction. Share a focused
                snippet, explain what matters, and make space for a useful
                review.
              </p>
              <ul>
                <li>
                  <Check size={16} /> Keep the code and its context together
                </li>
                <li>
                  <Check size={16} /> Reply, clarify, and follow up
                </li>
                <li>
                  <Check size={16} /> Mark the answer that moved things forward
                </li>
              </ul>
              <a className="landing-text-link" href="/app">
                Find a fresh perspective <ArrowUpRight size={17} />
              </a>
            </div>
            <CLIReview />
          </section>

          <section className="landing-paired-shots" data-reveal>
            <Screenshot
              name="conversation"
              label="A conversation, with code and replies"
              compact
            />
            <div className="screenshot-caption">
              <MessageCircle size={24} />
              <h3>The answer is only part of the story.</h3>
              <p>
                Keep the questions, follow-ups, and reasoning together, so the
                next person can learn from the whole conversation.
              </p>
            </div>
          </section>

          <section className="landing-community" id="community" data-reveal>
            <div className="section-topline">
              <span className="landing-kicker">03 / FIND YOUR PEOPLE</span>
              <Users size={21} />
            </div>
            <h2>
              A public square.
              <br />
              <em>A corner of your own.</em>
            </h2>
            <p className="section-description">
              Explore openly through topics. Build a closer circle in a private
              community. Two spaces, with a clear boundary between them.
            </p>
            <div className="community-feature-grid">
              <GlowCard className="community-feature">
                <div className="community-orbits" aria-hidden="true">
                  <span />
                  <span />
                  <Users size={35} />
                </div>
                <span className="mini-kicker">THE PRIVATE SPACE</span>
                <h3>
                  Good company.
                  <br />
                  On your terms.
                </h3>
                <p>
                  Membership requests, approved members, and conversations that
                  stay inside the community.
                </p>
                <a href="/app#communities">
                  Explore communities <ArrowUpRight size={17} />
                </a>
              </GlowCard>
              <div className="community-detail-stack">
                <GlowCard>
                  <ShieldCheck size={28} />
                  <h3>A little structure goes a long way.</h3>
                  <p>
                    Owners appoint validators to manage membership requests and
                    keep their community in order.
                  </p>
                </GlowCard>
                <GlowCard>
                  <CalendarDays size={28} />
                  <h3>Take the conversation live.</h3>
                  <p>
                    Organize a meetup, choose your timezone, and give attendees
                    a shared place to connect.
                  </p>
                  <a href="/app#events">
                    Explore events <ArrowUpRight size={16} />
                  </a>
                </GlowCard>
              </div>
            </div>
            <Screenshot name="community" label="Inside a private community" />
          </section>

          <section className="landing-projects" data-reveal>
            <div>
              <span className="landing-kicker">
                04 / PUT YOUR WORK OUT THERE
              </span>
              <h2>
                Your next project.
                <br />
                <em>Its first real feedback.</em>
              </h2>
              <p>
                Make room for the idea that hasn't found its people yet. Share
                the product, introduce the team, and tell other developers
                exactly where another perspective would help.
              </p>
              <div className="project-details">
                <span>
                  <Image size={17} /> Screenshots & demos
                </span>
                <span>
                  <Users size={17} /> The people behind it
                </span>
                <span>
                  <MessageCircle size={17} /> One feedback conversation
                </span>
              </div>
              <a className="landing-text-link" href="/app#projects">
                See what people are building <ArrowUpRight size={17} />
              </a>
            </div>
            <Screenshot
              name="project"
              label="A project and the people building it"
              compact
            />
          </section>

          <StackRibbon />
          <PublicActivity />

          <section className="landing-open-source" id="open-source" data-reveal>
            <div className="source-grid" aria-hidden="true" />
            <div className="open-source-heading">
              <span className="landing-kicker">
                <Github size={17} /> OPEN SOURCE, BY DESIGN
              </span>
              <span className="license-pill">GPL v3</span>
            </div>
            <h2>
              Made for developers.
              <br />
              <em>Open to your contribution.</em>
            </h2>
            <p>
              Devdevian is a forum in active development, with its source out in
              the open. Any developer can help improve it — through code,
              design, documentation, or a well-explained issue.
            </p>
            <div className="source-contributions">
              <span>
                <GitPullRequest size={17} /> Propose a change
              </span>
              <span>
                <CircleDot size={17} /> Report a bug
              </span>
              <span>
                <Code2 size={17} /> Improve the experience
              </span>
            </div>
            <div className="source-actions">
              <a className="landing-button" href={repository}>
                <Github size={18} /> Explore the source{" "}
                <ArrowUpRight size={16} />
              </a>
              <a
                className="landing-text-link"
                href={repository + "/blob/main/CONTRIBUTING.md"}
              >
                Read the contribution guide <ArrowRight size={16} />
              </a>
            </div>
            <p className="source-note">
              Contributions follow the project's published guidelines and review
              process. Start with the guide, then find a change you'd like to
              make.
            </p>
          </section>

          <section className="landing-faq" id="faq" data-reveal>
            <div>
              <span className="landing-kicker">
                A FEW THINGS YOU MIGHT WONDER
              </span>
              <h2>
                Good questions.
                <br />
                <em>Straight answers.</em>
              </h2>
              <a href={repository + "/issues"} className="landing-text-link">
                Have another question? <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="faq-list">
              {questions.map(([question, answer], i) => (
                <FAQItem key={question}>
                  <summary>
                    <span className="faq-number">0{i + 1}</span>
                    <span>{question}</span>
                    <Plus size={18} />
                  </summary>
                  <div className="faq-answer">
                    <p>{answer}</p>
                    {i === 5 && (
                      <a href={repository + "/blob/main/CONTRIBUTING.md"}>
                        Contribution guidelines <ArrowUpRight size={15} />
                      </a>
                    )}
                  </div>
                </FAQItem>
              ))}
            </div>
          </section>
        </main>

        <footer className="landing-footer">
          <div className="landing-footer-inner">
            <span className="landing-kicker">
              STILL BUILDING. ALREADY OPEN.
            </span>
            <h2>
              Bring your curiosity.
              <br />
              <em>Leave a little of what you know.</em>
            </h2>
            <div className="footer-actions">
              <a className="landing-button" href="/app">
                Enter Devdevian <ArrowUpRight size={19} />
              </a>
              <a href={repository} className="landing-text-link">
                <Github size={18} /> Build it with us <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="footer-bottom">
              <a className="landing-brand" href="/">
                <img src="/devdevian-logo.png" alt="" />
                devdevian<span>.</span>
              </a>
              <span>
                A forum for everyone who builds.
                <small>Open source · GPL v3 · In active development</small>
              </span>
            </div>
            <nav className="footer-directory" aria-label="Footer navigation">
              {[
                [
                  "Explore",
                  [
                    ["Public feed", "/app#feed"],
                    ["Communities", "/app#communities"],
                    ["Projects", "/app#projects"],
                    ["Events", "/app#events"],
                  ],
                ],
                [
                  "Build together",
                  [
                    ["Source on GitHub", repository],
                    [
                      "CLI documentation",
                      repository + "/blob/main/packages/cli/README.md",
                    ],
                    ["Documentation", repository + "/blob/main/docs/README.md"],
                    ["Contributing", repository + "/blob/main/CONTRIBUTING.md"],
                  ],
                ],
                [
                  "Good to know",
                  [
                    ["Privacy & Security", "/privacy"],
                    ["Terms of Use", "/terms"],
                    ["Questions & answers", "#faq"],
                    ["Report an issue", repository + "/issues"],
                  ],
                ],
              ].map(([label, links], index) => (
                <section className="footer-directory-group" key={label}>
                  <h3>
                    <span aria-hidden="true">0{index + 1}</span>
                    {label}
                  </h3>
                  {links.map(([text, href]) => (
                    <a href={href} key={text}>
                      <span>{text}</span>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </a>
                  ))}
                </section>
              ))}
            </nav>
            <div className="footer-colophon">
              <span>Built in the open. Made for the curious.</span>
              <a href="#">
                Back to top <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
