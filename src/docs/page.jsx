import React, { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Github,
  Menu,
  Search,
  Terminal,
  X,
} from "lucide-react";
import {
  documents,
  docGroups,
  docPath,
  docLink,
  headingId,
} from "./content.mjs";
import "./style.css";
import "highlight.js/styles/github-dark.css";
const textOf = (value) =>
  Array.isArray(value)
    ? value.map(textOf).join("")
    : typeof value === "object" && value
      ? textOf(value.props?.children)
      : String(value ?? "");
function CodeBlock({ children }) {
  const ref = useRef(null),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="docs-code">
      <button
        aria-label="Copy code"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(ref.current.textContent);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}
export default function DocsPage({ slug = "overview" }) {
  const doc = documents.find((d) => d.slug === slug),
    [query, setQuery] = useState(""),
    [menu, setMenu] = useState(false),
    input = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setMenu(false);
        setQuery("");
      }
      if (
        e.key === "/" &&
        !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (!doc)
    return (
      <div className="docs-site">
        <main className="docs-missing">
          <BookOpen />
          <h1>That guide isn’t here.</h1>
          <p>Find a guide in the documentation index.</p>
          <a href="/docs">
            Open documentation <ArrowRight size={16} />
          </a>
        </main>
      </div>
    );
  const index = documents.indexOf(doc),
    toc = [...doc.body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = terms.length
    ? documents.filter((d) =>
        terms.every((t) => (d.title + " " + d.body).toLowerCase().includes(t)),
      )
    : [];
  const heading =
    (level) =>
    ({ children }) =>
      React.createElement(
        "h" + level,
        { id: headingId(textOf(children)) },
        children,
      );
  return (
    <div className="docs-site">
      <a className="docs-skip" href="#docs-article">
        Skip to content
      </a>
      <header className="docs-top">
        <a className="docs-brand" href="/">
          <img src="/devdevian-logo.png" alt="" />
          devdevian<span>.</span>
          <em>docs</em>
        </a>
        <div className="docs-search">
          <Search size={16} />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a guide, command, or concept…"
            aria-label="Search documentation"
          />
          <kbd>/</kbd>
        </div>
        <a href="/app" className="docs-open">
          Open forum <ArrowUpRight size={15} />
        </a>
        <button
          className="docs-menu"
          aria-label="Toggle documentation navigation"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      {terms.length > 0 && (
        <section
          className="docs-results"
          aria-label="Documentation search results"
        >
          <header>
            <strong>{results.length} guides found</strong>
            <button onClick={() => setQuery("")} aria-label="Close search">
              <X size={17} />
            </button>
          </header>
          {results.length ? (
            results.map((d) => (
              <a key={d.slug} href={docPath(d.slug)}>
                <small>{d.group}</small>
                <strong>{d.title}</strong>
                <p>
                  {d.body
                    .replace(/^#+ .+\n/, "")
                    .replace(/[#*`\[\]]/g, "")
                    .trim()
                    .slice(0, 170)}
                  …
                </p>
              </a>
            ))
          ) : (
            <p>
              No matching guide. Try “password”, “diff”, or “participation”.
            </p>
          )}
        </section>
      )}
      <div className="docs-layout">
        <aside
          className={"docs-sidebar " + (menu ? "is-open" : "")}
          aria-label="Documentation navigation"
        >
          <div className="docs-sidebar-intro">
            <BookOpen size={17} />
            <span>A developer’s field guide</span>
          </div>
          {docGroups.map(([group, entries]) => (
            <nav key={group} aria-label={group}>
              <h2>{group}</h2>
              {entries.map(([id, title]) => (
                <a
                  aria-current={id === slug ? "page" : undefined}
                  key={id}
                  href={docPath(id)}
                >
                  {title}
                  {id === slug && <span />}
                </a>
              ))}
            </nav>
          ))}
          <a
            className="docs-source"
            href="https://github.com/Tenyokj/devdevian"
          >
            <Github size={16} />
            Open source · GPL v3
          </a>
        </aside>
        <main id="docs-article" className="docs-article">
          <div className="docs-eyebrow">
            <span />
            {doc.group}{" "}
            <span className="docs-version">Browser 0.10 · CLI 0.22 alpha</span>
          </div>
          {slug === "overview" && (
            <div className="docs-hero-art" aria-hidden="true">
              <span>{"{ }"}</span>
              <Terminal />
              <i />
              <b>CODE · CONTEXT · PEOPLE</b>
            </div>
          )}
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              h1: heading(1),
              h2: heading(2),
              h3: heading(3),
              pre: CodeBlock,
              a: ({ href, children }) => (
                <a href={docLink(href, doc.source)}>{children}</a>
              ),
              table: ({ children }) => (
                <div className="docs-table">
                  <table>{children}</table>
                </div>
              ),
              img: ({ src, alt }) => (
                <img
                  src={
                    src?.startsWith("http")
                      ? src
                      : "https://raw.githubusercontent.com/Tenyokj/devdevian/main/" +
                        new URL(
                          src,
                          "https://docs.local/" + doc.source,
                        ).pathname.slice(1)
                  }
                  alt={alt || ""}
                  loading="lazy"
                />
              ),
            }}
          >
            {doc.body}
          </Markdown>
          <footer className="docs-article-footer">
            <p>
              Something unclear?{" "}
              <a
                href={
                  "https://github.com/Tenyokj/devdevian/edit/main/" + doc.source
                }
              >
                Improve this guide <ArrowUpRight size={13} />
              </a>
            </p>
            <div>
              {index > 0 && (
                <a href={docPath(documents[index - 1].slug)}>
                  <small>Previous guide</small>
                  {documents[index - 1].title}
                </a>
              )}
              {index < documents.length - 1 && (
                <a href={docPath(documents[index + 1].slug)}>
                  <small>Up next</small>
                  {documents[index + 1].title}
                  <ArrowRight size={17} />
                </a>
              )}
            </div>
          </footer>
        </main>
        <aside className="docs-toc">
          <span>ON THIS PAGE</span>
          <nav aria-label="On this page">
            {toc.map((t) => (
              <a key={t} href={"#" + headingId(t)}>
                {t}
              </a>
            ))}
          </nav>
          <div>
            <Terminal size={20} />
            <strong>
              Your forum.
              <br />
              Your terminal.
            </strong>
            <a href="/docs/cli">
              Explore the CLI <ArrowRight size={14} />
            </a>
          </div>
          <a href="/updates">
            What’s new <ArrowUpRight size={14} />
          </a>
          <a href="/faq">
            Quick answers <ArrowUpRight size={14} />
          </a>
        </aside>
      </div>
      <footer className="docs-bottom">
        <span>Built in the open. Written for people who build.</span>
        <a href="/privacy">Privacy & Security</a>
        <a href="/terms">Terms</a>
        <a href="https://github.com/Tenyokj/devdevian/issues/new/choose">
          Report an issue <ArrowUpRight size={13} />
        </a>
      </footer>
    </div>
  );
}
