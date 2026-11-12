import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Runner } from "./extension-runtime";
import { layoutCSS, validatePackage } from "../extension-package.mjs";
import "./extension-playground.css";

function Playground() {
  const [pkg, setPkg] = useState(null),
    [active, setActive] = useState(null),
    [error, setError] = useState(""),
    [mode, setMode] = useState("dark"),
    [route, setRoute] = useState("feed"),
    [view, setView] = useState(null);
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "feed");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);
  useEffect(() => {
    let alive = true,
      busy = false;
    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch("/build"),
          next = await res.json();
        if (!res.ok) throw Error(next.error);
        validatePackage(next.manifest);
        if (alive) {
          setPkg(next);
          setError("");
          setActive((old) =>
            old
              ? JSON.stringify([...old.grants].sort()) !==
                JSON.stringify([...next.manifest.permissions].sort())
                ? null
                : { ...next, id: "playground", grants: old.grants }
              : null,
          );
        }
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        busy = false;
      }
    };
    read();
    const timer = setInterval(read, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const layout = (id, value) => {
    const e = document.querySelector(".devext-surface");
    for (const k of [
      "grid-template-areas",
      "grid-template-columns",
      "grid-template-rows",
      "gap",
    ])
      e.style.removeProperty(k);
    delete e.dataset.extensionLayout;
    if (value) {
      e.dataset.extensionLayout = "true";
      Object.assign(e.style, value);
    }
  };
  return (
    <>
      <section className="playground-controls">
        <strong>Devdevian SDK playground</strong>
        <span>Local sample UI · no accounts or production data</span>
        <button onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
          Switch theme
        </button>
        <button
          onClick={() => {
            setActive(null);
            setView(null);
          }}
        >
          Stop preview
        </button>
      </section>
      <div className="playground-review">
        <h1>{pkg?.name || "Building extension…"}</h1>
        <p>
          Review these capabilities before running your local code. Source
          changes reload automatically; changed permissions stop preview and
          require a fresh start.
        </p>
        <code>
          {pkg?.manifest.permissions.join(" · ") || "No capabilities"}
        </code>
        <button
          disabled={!pkg || !!active}
          onClick={() => {
            setView(null);
            setActive({
              ...pkg,
              id: "playground",
              grants: pkg.manifest.permissions,
            });
          }}
        >
          Start preview
        </button>
        <p role="status">{error}</p>
      </div>
      <div className="app devext-surface">
        <aside className="sidebar">
          <strong>devdevian.</strong>
          {["feed", "projects", "events", "profile"].map((x) => (
            <a key={x} href={"#" + x}>
              {x}
            </a>
          ))}
        </aside>
        <div className="main-shell">
          <nav className="topbar">
            A space for curious minds{" "}
            <button onClick={() => setView("Search sample")}>Search</button>
            <button onClick={() => setView("Notifications sample")}>
              Notifications
            </button>
          </nav>
          <main>
            <div className="devext-content">
              <h2>{route} · SDK fixtures</h2>
              <article className="post-card">
                <h3>Build something useful.</h3>
                <p>
                  This is a sample surface for testing CSS, layouts, commands,
                  panels and local storage. It is not a production forum.
                </p>
                <code>const idea = await community.review(code);</code>
              </article>
              <p>
                Check final layout and real account permissions with Preview in
                the hosted forum.
              </p>
            </div>
            <footer className="app-footer">
              Open source. A little room to experiment.
            </footer>
          </main>
        </div>
      </div>
      {view && (
        <div className="playground-dialog devext-surface">
          <section className="modal" role="dialog" aria-label={view}>
            <button onClick={() => setView(null)}>Close</button>
            <h2>{view}</h2>
            <p className="notification-item search-result">
              Local fixture. No production data was requested.
            </p>
          </section>
        </div>
      )}
      {active && (
        <Runner
          key={active.build}
          item={active}
          userId="sdk-playground"
          mode={mode}
          preview
          onError={(id, message) => setError(message)}
          onLayout={layout}
          onView={(id, r, title) => setView(`${title || r} · sample app view`)}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<Playground />);
