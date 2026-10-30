import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Github,
  Plus,
  Search,
  Terminal,
  Sparkles,
} from "lucide-react";
import FAQItem from "./accordion";
import { categories, questions, repository, updates } from "./content.mjs";
import "../landing.css";
import "./pages.css";

export const launchFilm = "https://www.youtube.com/watch?v=ssUCB1Jpf-Q";

function UpdateHistory() {
  const [channel, setChannel] = useState("All");
  const [enhanced, setEnhanced] = useState(false);
  // Keep cards mounted so incoming fragment links can reveal a filtered milestone.
  useEffect(() => {
    setEnhanced(true);
    const reveal = () => {
      if (updates.some((item) => "#" + item.id === location.hash)) {
        setChannel("All");
        requestAnimationFrame(() =>
          document
            .getElementById(location.hash.slice(1))
            ?.scrollIntoView({ block: "start" }),
        );
      }
    };
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return (
    <>
      <div
        className="public-toolbar"
        hidden={!enhanced}
        role="group"
        aria-label="Filter updates"
      >
        {["All", "Browser", "CLI"].map((item) => (
          <button
            key={item}
            aria-pressed={channel === item}
            onClick={() => setChannel(item)}
          >
            {item === "All" ? "All updates" : item}
          </button>
        ))}
        <span className="public-results" role="status">
          {
            updates.filter(
              (item) => channel === "All" || item.channel === channel,
            ).length
          }{" "}
          milestones
        </span>
      </div>
      <div className="updates-timeline">
        {updates.map((item) => (
          <article
            className="update-card"
            id={item.id}
            key={item.id}
            hidden={channel !== "All" && item.channel !== channel}
          >
            <div className="update-rail">
              <span className="update-icon" aria-hidden="true">
                {item.channel === "CLI" ? (
                  <Terminal size={21} />
                ) : (
                  <Sparkles size={21} />
                )}
              </span>
              <span>{item.channel}</span>
              <strong>{item.version}</strong>
            </div>
            <div className="update-body">
              <a
                className="update-permalink"
                href={"#" + item.id}
                aria-label={"Link to " + item.title}
              >
                #
              </a>
              <h2>{item.title}</h2>
              <p>{item.summary}</p>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>
                    <Check size={16} aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <a className="landing-text-link" href={item.link}>
                {item.label}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </article>
        ))}
      </div>
      <aside className="public-note">
        <Github size={24} aria-hidden="true" />
        <div>
          <h2>Built in the open. Recorded as we go.</h2>
          <p>
            This is a curated product history. The{" "}
            <a href={repository + "/blob/main/CHANGELOG.md"}>full changelog</a>{" "}
            and{" "}
            <a href={repository + "/blob/main/packages/cli/VERSIONS.md"}>
              CLI version log
            </a>{" "}
            contain patch details. Alpha npm versions and combined GitHub
            releases follow separate schedules.
          </p>
        </div>
      </aside>
    </>
  );
}

function Questions() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    setEnhanced(true);
    const reveal = () => {
      const item = questions.find((item) => "#" + item.id === location.hash);
      if (!item) return;
      setCategory("All");
      setQuery("");
      // Wait for filters to commit before scrolling to an incoming deep link.
      requestAnimationFrame(() => {
        const node = document.getElementById(item.id);
        if (node) {
          node.open = true;
          node.scrollIntoView({ block: "center" });
        }
      });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const normalized = query.trim().toLocaleLowerCase("en");
  const matches = (item) =>
    (category === "All" || item.category === category) &&
    (!normalized ||
      (item.question + " " + item.answer)
        .toLocaleLowerCase("en")
        .includes(normalized));
  const count = questions.filter(matches).length;
  return (
    <>
      {/* Without JavaScript all answers remain available, without non-working filters. */}
      <div className="faq-controls" hidden={!enhanced}>
        <label className="public-search">
          <Search size={21} aria-hidden="true" />
          <span className="public-sr-only">Search questions and answers</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search questions and answers…"
          />
        </label>
        <div
          className="public-toolbar"
          role="group"
          aria-label="Filter questions"
        >
          {["All", ...categories].map((item) => (
            <button
              key={item}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item === "All" ? "All questions" : item}
            </button>
          ))}
        </div>
        <p className="public-results" role="status">
          {count} {count === 1 ? "answer" : "answers"}
          {query.trim() ? " matching your search" : " to explore"}
        </p>
      </div>
      <div className="expanded-faq">
        {categories.map((group) => (
          <section
            key={group}
            hidden={
              !questions.some(
                (item) => item.category === group && matches(item),
              )
            }
            aria-label={group}
          >
            <h2>{group}</h2>
            <div className="faq-list">
              {questions
                .filter((item) => item.category === group)
                .map((item) => (
                  <FAQItem key={item.id} id={item.id} hidden={!matches(item)}>
                    <summary>
                      <span>{item.question}</span>
                      <Plus size={19} aria-hidden="true" />
                    </summary>
                    <div className="faq-answer">
                      <p>{item.answer}</p>
                      <div className="faq-answer-links">
                        {item.href && (
                          <a href={item.href}>
                            {item.label}
                            <ArrowUpRight size={15} aria-hidden="true" />
                          </a>
                        )}
                        <a
                          className="faq-permalink"
                          href={"#" + item.id}
                          aria-label={"Link to question: " + item.question}
                        >
                          Copyable link <span aria-hidden="true">#</span>
                        </a>
                      </div>
                    </div>
                  </FAQItem>
                ))}
            </div>
          </section>
        ))}
      </div>
      {count === 0 && (
        <div className="public-empty">
          <h2>No matching questions yet.</h2>
          <p>Try a shorter phrase, or browse all questions.</p>
          <button
            className="landing-button"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <aside className="public-note">
        <span className="update-icon" aria-hidden="true">
          ?
        </span>
        <div>
          <h2>Still have a question?</h2>
          <p>
            For a non-sensitive problem,{" "}
            <a href={repository + "/issues/new/choose"}>open a GitHub issue</a>.
            For privacy or security, write to{" "}
            <a href="mailto:dv842449@gmail.com">dv842449@gmail.com</a>. Please
            keep credentials out of public reports.
          </p>
        </div>
      </aside>
    </>
  );
}

export default function PublicPage({ type }) {
  const isFAQ = type === "faq";
  useEffect(() => {
    // Public pages must not overwrite the forum's saved appearance preference.
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.content;
    document.body.classList.add("landing-page");
    if (meta) meta.content = "#0e1025";
    return () => {
      document.body.classList.remove("landing-page");
      if (meta && previous) meta.content = previous;
    };
  }, []);
  return (
    <div className="landing public-page">
      <a className="landing-skip" href="#public-content">
        Skip to content
      </a>
      <nav className="public-nav" aria-label="Main navigation">
        <a className="landing-brand" href="/">
          <img src="/devdevian-logo.png" alt="" />
          devdevian<span>.</span>
        </a>
        <div>
          <a href="/updates" aria-current={!isFAQ ? "page" : undefined}>
            What’s new
          </a>
          <a href="/faq" aria-current={isFAQ ? "page" : undefined}>
            FAQ
          </a>
          <a className="landing-button small" href="/app">
            Enter the forum
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </nav>
      <main id="public-content">
        <header className="public-hero">
          <a className="public-back" href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to Devdevian
          </a>
          <span className="landing-kicker">
            {isFAQ
              ? "A LITTLE CONTEXT GOES A LONG WAY"
              : "SMALL STEPS. A SHARED DIRECTION."}
          </span>
          <h1>
            {isFAQ ? (
              <>
                Good questions.
                <br />
                <em>Clear answers.</em>
              </>
            ) : (
              <>
                Still building.
                <br />
                <em>Here’s what’s new.</em>
              </>
            )}
          </h1>
          <p>
            {isFAQ
              ? "The browser, the terminal, and everything between. Find your way around Devdevian."
              : "The forum and the terminal workspace, moving forward together. Explore what you can use today."}
          </p>
          <div className="public-hero-links">
            <a href={launchFilm} className="landing-text-link">
              Watch Devdevian in action
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <a
              href={repository + "/blob/main/packages/cli/README.md"}
              className="landing-text-link"
            >
              CLI documentation
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </header>
        {isFAQ ? <Questions /> : <UpdateHistory />}
      </main>
      <footer className="public-footer">
        <a className="landing-brand" href="/">
          <img src="/devdevian-logo.png" alt="" />
          devdevian<span>.</span>
        </a>
        <p>
          A forum for everyone who builds.
          <small>Open source · GPL v3 · In active development</small>
        </p>
        <nav aria-label="Footer navigation">
          <a href="/updates">What’s new</a>
          <a href="/faq">FAQ</a>
          <a href={repository}>GitHub</a>
          <a href="/privacy">Privacy & Security</a>
          <a href="/terms">Terms of Use</a>
        </nav>
      </footer>
    </div>
  );
}
