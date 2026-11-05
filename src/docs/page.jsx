import React, { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  FileText,
  Github,
  Info,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  documents,
  docGroups,
  docPath,
  docLink,
  headingId,
} from "./content.mjs";
import { searchGuides, rehypeSearchHighlights } from "./search.mjs";
import {
  DocsHome,
  GuideVisual,
  GuideCapture,
  Term,
  remarkCallouts,
} from "./visuals";
import "./style.css";
const textOf = (v) =>
  Array.isArray(v)
    ? v.map(textOf).join("")
    : v && typeof v === "object"
      ? textOf(v.props?.children)
      : String(v ?? "");
function CopyAction({ value, label = "Copy code", compact = false }) {
  const [state, setState] = useState("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <button
      className={"docs-copy " + (state === "copied" ? "copied" : "")}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            typeof value === "function" ? value() : value,
          );
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
    >
      {state === "copied" ? <Check size={16} /> : <Copy size={16} />}
      <span role="status">
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy unavailable"
            : compact
              ? "Copy"
              : label}
      </span>
    </button>
  );
}
function CodeBlock({ children }) {
  const ref = useRef(null),
    language = String(children?.props?.className || "text").replace(
      "language-",
      "",
    );
  return (
    <div className="docs-code">
      <header>
        <span>
          <Code2 size={16} />
          {language === "sh" ? "Terminal" : language}
        </span>
        <CopyAction compact value={() => ref.current.textContent} />
      </header>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}
function Highlight({ text, query }) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  return text
    .split(new RegExp("(" + words.join("|") + ")", "gi"))
    .map((s, i) =>
      words.some((w) => new RegExp("^" + w + "$", "i").test(s)) ? (
        <mark key={i}>{s}</mark>
      ) : (
        s
      ),
    );
}
function SearchDialog({ close, trigger }) {
  const ref = useRef(null),
    input = useRef(null),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const results = query.trim()
    ? searchGuides(documents, query, docPath, headingId)
    : documents
        .filter((d) =>
          ["first-session", "cli", "rooms", "github-app"].includes(d.slug),
        )
        .map((d) => ({
          ...d,
          section: "",
          href: docPath(d.slug),
          excerpt: d.group,
        }));
  const resultURL = (d) => {
    const [path, hash] = d.href.split("#");
    return query.trim()
      ? path +
          "?highlight=" +
          encodeURIComponent(query.trim().slice(0, 120)) +
          (hash ? "#" + hash : "")
      : d.href;
  };
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    input.current?.focus();
    return () => {
      dialog.close();
      trigger.current?.focus();
    };
  }, []);
  useEffect(() => {
    document
      .getElementById("docs-result-" + active)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const onKey = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(
        (n) =>
          (n + (e.key === "ArrowDown" ? 1 : -1) + Math.max(results.length, 1)) %
          Math.max(results.length, 1),
      );
    }
    if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      location.assign(resultURL(results[active]));
    }
  };
  return (
    <dialog
      ref={ref}
      className="docs-search-dialog"
      aria-label="Search documentation"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        const r = ref.current.getBoundingClientRect();
        if (
          e.target === ref.current &&
          (e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom)
        )
          close();
      }}
    >
      <div className="docs-search-field">
        <Search size={22} />
        <input
          ref={input}
          role="combobox"
          aria-label="Search documentation"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="docs-search-list"
          aria-activedescendant={
            results.length ? "docs-result-" + active : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder="Search guides, commands, and concepts…"
        />
        <button onClick={close} aria-label="Close search">
          <X size={19} />
        </button>
      </div>
      <div className="docs-search-meta">
        <span>{query.trim() ? "SEARCH RESULTS" : "QUICK START"}</span>
        <span>
          {query.trim()
            ? results.length + " matches"
            : documents.length + " guides"}
        </span>
      </div>
      <div
        id="docs-search-list"
        className="docs-results"
        role="listbox"
        aria-label="Documentation search results"
      >
        {results.length ? (
          results.map((d, i) => (
            <React.Fragment key={d.slug}>
              {(i === 0 || d.group !== results[i - 1].group) && (
                <div className="docs-result-group">{d.group}</div>
              )}
              <a
                id={"docs-result-" + i}
                role="option"
                aria-selected={active === i}
                href={resultURL(d)}
                onMouseMove={() => setActive(i)}
              >
                <span className="docs-result-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>
                    <Highlight text={d.title} query={query} />
                  </strong>
                  {d.section && (
                    <small>
                      <ChevronRight size={12} />
                      <Highlight text={d.section} query={query} />
                    </small>
                  )}
                  <p>
                    <Highlight text={d.excerpt} query={query} />
                  </p>
                </span>
                <ArrowRight size={17} />
              </a>
            </React.Fragment>
          ))
        ) : (
          <div className="docs-search-empty">
            <Search size={30} />
            <h3>No matching guide</h3>
            <p>Try “password”, “diff”, “participation”, or fewer words.</p>
          </div>
        )}
      </div>
      <footer>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> Navigate
        </span>
        <span>
          <kbd>↵</kbd> Open guide
        </span>
        <span>
          <kbd>esc</kbd> Close
        </span>
      </footer>
    </dialog>
  );
}
const icons = [BookOpen, UsersIcon, Terminal, Github, Code2];
function UsersIcon(props) {
  return <PanelLeftOpen {...props} />;
}
export default function DocsPage({ slug = "home" }) {
  const isHome = slug === "home";
  const doc = isHome
      ? {
          title: "Documentation",
          group: "Start here",
          body: "",
          source: "docs/site/overview.md",
        }
      : documents.find((d) => d.slug === slug),
    [menu, setMenu] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [theme, setTheme] = useState("dark"),
    [search, setSearch] = useState(false),
    [activeHeading, setActiveHeading] = useState(""),
    [highlight, setHighlight] = useState(""),
    [indicator, setIndicator] = useState({ top: 0, height: 0 }),
    tocRef = useRef(null),
    trigger = useRef(null);
  useEffect(() => {
    setTheme(document.documentElement.dataset.docsTheme || "dark");
    setCollapsed(document.documentElement.dataset.docsSidebar === "collapsed");
    const key = (e) => {
      if (
        (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" &&
          !/INPUT|TEXTAREA/.test(document.activeElement?.tagName))
      ) {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const headings = [...document.querySelectorAll(".docs-article h2")];
    const update = () => {
      const visible = headings.filter(
        (h) => h.getBoundingClientRect().top < 200,
      );
      setActiveHeading((visible.at(-1) || headings[0])?.id || "");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [slug]);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.docsTheme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#100a18" : "#fcfaff");
    try {
      localStorage.setItem("devdevian-docs-theme", next);
    } catch {}
  };
  const toggleSidebar = () => {
    if (innerWidth <= 900) {
      setMenu(!menu);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.dataset.docsSidebar = next
      ? "collapsed"
      : "expanded";
    try {
      localStorage.setItem(
        "devdevian-docs-sidebar",
        next ? "collapsed" : "expanded",
      );
    } catch {}
  };
  useEffect(() => {
    setHighlight(
      (new URLSearchParams(location.search).get("highlight") || "")
        .trim()
        .slice(0, 120),
    );
  }, []);
  useEffect(() => {
    if (!highlight) return;
    const timer = requestAnimationFrame(() => {
      let target;
      let anchor;
      try {
        anchor = document.getElementById(
          decodeURIComponent(location.hash.slice(1)),
        );
      } catch {
        /* An invalid fragment cannot block reading a guide. */
      }
      if (anchor) {
        target = anchor.querySelector(".docs-search-hit");
        let next = anchor.nextElementSibling;
        while (!target && next && !/^H[12]$/.test(next.tagName)) {
          target = next.querySelector(".docs-search-hit");
          next = next.nextElementSibling;
        }
      }
      target ||= document.querySelector(".docs-article .docs-search-hit");
      target?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [highlight]);
  useEffect(() => {
    const measure = () => {
      const a = tocRef.current?.querySelector("[aria-current=location]");
      if (a) setIndicator({ top: a.offsetTop, height: a.offsetHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeHeading]);
  if (!doc)
    return (
      <div className="docs-site">
        <main className="docs-missing">
          <BookOpen />
          <h1>That guide isn’t here.</h1>
          <a href="/docs">
            Open documentation <ArrowRight size={17} />
          </a>
        </main>
      </div>
    );
  const index = documents.indexOf(doc),
    toc = [...doc.body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const heading =
    (level) =>
    ({ children }) =>
      React.createElement(
        "h" + level,
        { id: headingId(textOf(children)) },
        children,
        level > 1 ? (
          <a
            className="docs-heading-anchor"
            href={"#" + headingId(textOf(children))}
            aria-label={"Link to " + textOf(children)}
          >
            #
          </a>
        ) : null,
      );
  const components = {
    h1: heading(1),
    h2: heading(2),
    h3: heading(3),
    pre: CodeBlock,
    code: ({ className, children }) =>
      className || String(children).includes("\n") ? (
        <code className={className}>{children}</code>
      ) : (
        <Term>{children}</Term>
      ),
    a: ({ href, children }) => (
      <a href={docLink(href, doc.source)}>{children}</a>
    ),
    blockquote: ({ node, children }) => {
      const type = node.properties?.["data-callout"] || "note";
      return (
        <aside className={"docs-callout " + type} role="note">
          {type === "warning" ? (
            <TriangleAlert size={21} />
          ) : (
            <Info size={21} />
          )}
          <div>
            <strong>
              {
                {
                  note: "Good to know",
                  tip: "Practical tip",
                  warning: "Before you continue",
                  important: "Important",
                }[type]
              }
            </strong>
            {children}
          </div>
        </aside>
      );
    },
    table: ({ children }) => (
      <div className="docs-table">
        <table>{children}</table>
      </div>
    ),
    img: ({ src, alt }) => {
      const local = src?.match(/public\/(screenshots\/[^?#]+)/)?.[1];
      return (
        <img
          src={
            local
              ? "/" + local
              : src?.startsWith("http")
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
      );
    },
  };
  const split = doc.body.search(/\n## /),
    intro = split < 0 ? doc.body : doc.body.slice(0, split),
    rest = split < 0 ? "" : doc.body.slice(split);
  const md = (body) => (
    <Markdown
      remarkPlugins={[remarkGfm, remarkCallouts]}
      rehypePlugins={[
        rehypeHighlight,
        [rehypeSearchHighlights, { query: highlight }],
      ]}
      components={components}
    >
      {body}
    </Markdown>
  );
  return (
    <div className="docs-site">
      <a className="docs-skip" href="#docs-article">
        Skip to content
      </a>
      <header className="docs-top">
        <a className="docs-brand" href="/docs">
          <img src="/devdevian-logo.png" alt="" />
          devdevian<span>.</span>
          <em>docs</em>
        </a>
        <nav aria-label="Project resources">
          <a href="/app">
            Forum <ArrowUpRight size={13} />
          </a>
          <a href="https://github.com/Tenyokj/devdevian">
            GitHub <ArrowUpRight size={13} />
          </a>
          <a href="/updates">What’s new</a>
        </nav>
        <button
          ref={trigger}
          className="docs-search-trigger"
          onClick={() => setSearch(true)}
          aria-label="Open documentation search"
        >
          <Search size={18} />
          <span>Search documentation</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          className="docs-theme-toggle"
          aria-label={
            theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
          }
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={21} /> : <Moon size={21} />}
        </button>
      </header>
      <div className="docs-subnav">
        <button
          className="docs-sidebar-toggle"
          onClick={toggleSidebar}
          aria-label="Toggle documentation navigation"
          aria-expanded={!collapsed || menu}
        >
          {collapsed ? (
            <PanelLeftOpen size={20} />
          ) : (
            <PanelLeftClose size={20} />
          )}
        </button>
        <nav aria-label="Documentation sections">
          {[
            ["Guides", "overview", BookOpen],
            ["Terminal", "cli", Terminal],
            ["GitHub", "github-app", Github],
            ["Developers", "development", Code2],
          ].map(([label, id, Icon]) => (
            <a
              key={id}
              href={docPath(id)}
              className={
                (
                  id === "overview"
                    ? ["Start here", "Build together"].includes(doc.group)
                    : doc.group ===
                      (id === "cli"
                        ? "Terminal"
                        : id === "github-app"
                          ? "GitHub"
                          : "Develop & operate")
                )
                  ? "active"
                  : ""
              }
            >
              <Icon size={17} />
              {label}
            </a>
          ))}
        </nav>
        <span>OPEN SOURCE · ALWAYS BUILDING</span>
      </div>
      <div className="docs-layout">
        <aside
          className={"docs-sidebar " + (menu ? "is-open" : "")}
          aria-label="Documentation navigation"
        >
          <div className="docs-sidebar-title">
            <span>DOCUMENTATION</span>
            <button
              onClick={() => setMenu(false)}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
          <a
            className="docs-home-nav"
            href="/docs"
            aria-current={isHome ? "page" : undefined}
          >
            <BookOpen size={16} />
            Documentation home
          </a>
          {docGroups.map(([group, entries], i) => {
            const Icon = icons[i];
            return (
              <details className="docs-nav-group" key={group} open>
                <summary>
                  <Icon size={17} />
                  <span>{group}</span>
                  <small>{entries.length}</small>
                  <ChevronDown size={15} />
                </summary>
                <nav aria-label={group}>
                  {entries.map(([id, title]) => (
                    <a
                      aria-current={slug === id ? "page" : undefined}
                      key={id}
                      href={docPath(id)}
                    >
                      {title}
                    </a>
                  ))}
                </nav>
              </details>
            );
          })}
          <div className="docs-sidebar-resources">
            <span>ELSEWHERE</span>
            <a href="https://github.com/Tenyokj/devdevian">
              <Github size={16} />
              Source code
              <ArrowUpRight size={13} />
            </a>
            <a href="https://www.npmjs.com/package/@tenyokjs/devdevian-cli">
              <Terminal size={16} />
              npm package
              <ArrowUpRight size={13} />
            </a>
            <a href="https://www.youtube.com/watch?v=ssUCB1Jpf-Q">
              <FileText size={16} />
              Watch the demo
              <ArrowUpRight size={13} />
            </a>
            <a href="https://github.com/Tenyokj/devdevian/issues/new/choose">
              <Info size={16} />
              Report an issue
              <ArrowUpRight size={13} />
            </a>
          </div>
        </aside>
        {menu && (
          <button
            className="docs-nav-scrim"
            aria-label="Close navigation overlay"
            onClick={() => setMenu(false)}
          />
        )}
        <main id="docs-article" className="docs-article">
          <div className="docs-breadcrumb">
            <a href="/docs">Devdevian Docs</a>
            <ChevronRight size={14} />
            <span>{doc.group}</span>
          </div>
          {isHome ? (
            <DocsHome />
          ) : (
            <>
              {highlight && (
                <div className="docs-highlight-notice">
                  Matches for <strong>{highlight}</strong>
                  <button
                    onClick={() => {
                      setHighlight("");
                      history.replaceState(
                        null,
                        "",
                        location.pathname + location.hash,
                      );
                    }}
                  >
                    Clear highlights
                    <X size={13} />
                  </button>
                </div>
              )}
              {md(intro)}
              <div className="docs-page-actions">
                <CopyAction value={doc.body} label="Copy Markdown" />
                <a
                  href={
                    "https://github.com/Tenyokj/devdevian/blob/main/" +
                    doc.source
                  }
                >
                  <Github size={16} />
                  View source
                  <ArrowUpRight size={13} />
                </a>
                <span>
                  {Math.max(1, Math.ceil(doc.body.split(/\s+/).length / 220))}{" "}
                  min read
                </span>
              </div>
              <GuideVisual slug={slug} />
              {md(rest)}
              <GuideCapture slug={slug} />
              <footer className="docs-article-footer">
                <p>
                  Better docs are built together.{" "}
                  <a
                    href={
                      "https://github.com/Tenyokj/devdevian/edit/main/" +
                      doc.source
                    }
                  >
                    Improve this guide <ArrowUpRight size={14} />
                  </a>
                </p>
                <div>
                  {index > 0 && (
                    <a href={docPath(documents[index - 1].slug)}>
                      <small>
                        <ArrowLeft size={13} />
                        Previous
                      </small>
                      {documents[index - 1].title}
                    </a>
                  )}
                  {index < documents.length - 1 && (
                    <a href={docPath(documents[index + 1].slug)}>
                      <small>
                        Next
                        <ArrowRight size={13} />
                      </small>
                      {documents[index + 1].title}
                    </a>
                  )}
                </div>
              </footer>
            </>
          )}
        </main>
        {!isHome && (
          <aside className="docs-toc">
            <div>
              <Menu size={16} />
              On this page
            </div>
            <nav aria-label="On this page" ref={tocRef}>
              <span
                className="docs-toc-indicator"
                style={{
                  transform: `translateY(${indicator.top}px)`,
                  height: indicator.height,
                }}
              />
              {toc.map((t) => (
                <a
                  key={t}
                  href={"#" + headingId(t)}
                  onClick={() => setActiveHeading(headingId(t))}
                  aria-current={
                    activeHeading === headingId(t) ? "location" : undefined
                  }
                >
                  {t}
                </a>
              ))}
            </nav>
            <a
              href={
                "https://github.com/Tenyokj/devdevian/edit/main/" + doc.source
              }
            >
              <Github size={16} />
              Edit this page
            </a>
            <a href="#docs-article">
              <ArrowRight className="docs-up" size={16} />
              Back to top
            </a>
            <div className="docs-toc-card">
              <Terminal size={23} />
              <strong>
                Good company.
                <br />
                In your terminal.
              </strong>
              <a href="/docs/cli">
                Meet the CLI <ArrowRight size={16} />
              </a>
            </div>
          </aside>
        )}
      </div>
      <footer className="docs-resource-footer">
        <div className="docs-footer-intro">
          <a className="docs-brand" href="/docs">
            <img src="/devdevian-logo.png" alt="" />
            devdevian<span>.</span>
            <em>docs</em>
          </a>
          <p>
            Good code. Good questions.
            <br />A little help from good company.
          </p>
          <small>Open source · GPL v3 · In active development</small>
        </div>
        <div>
          <h2>Explore</h2>
          <a href="/">
            Website
            <ArrowUpRight size={13} />
          </a>
          <a href="/app">
            Open the forum
            <ArrowUpRight size={13} />
          </a>
          <a href="/docs">Documentation home</a>
          <a href="/updates">What’s new</a>
          <a href="/faq">FAQ</a>
        </div>
        <div>
          <h2>Build</h2>
          <a href="https://github.com/Tenyokj/devdevian">
            GitHub repository
            <ArrowUpRight size={13} />
          </a>
          <a href="https://www.npmjs.com/package/@tenyokjs/devdevian-cli">
            npm package
            <ArrowUpRight size={13} />
          </a>
          <a href="/docs/contributing">Contributing</a>
          <a href="/docs/development">Local development</a>
          <a href="https://github.com/Tenyokj/devdevian/issues/new/choose">
            Report an issue
            <ArrowUpRight size={13} />
          </a>
        </div>
        <div>
          <h2>Resources</h2>
          <a href="https://www.youtube.com/watch?v=ssUCB1Jpf-Q">
            Watch the demo
            <ArrowUpRight size={13} />
          </a>
          <a href="https://dev.to/daniil_volkov_74d11cacfb0/i-built-an-open-source-developer-forum-you-can-use-from-your-terminal-3anc">
            The story on DEV
            <ArrowUpRight size={13} />
          </a>
          <a href="/privacy">Privacy & Security</a>
          <a href="/terms">Terms of Use</a>
          <a href="/docs/security">Report a vulnerability</a>
        </div>
        <div className="docs-footer-bottom">
          <span>A developer forum. Built in the open.</span>
          <a href="#docs-article">Back to top ↑</a>
        </div>
      </footer>
      {search && (
        <SearchDialog trigger={trigger} close={() => setSearch(false)} />
      )}
    </div>
  );
}
