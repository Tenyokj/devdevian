import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, ArrowUpRight } from "lucide-react";
const stack = [
  ["supabase", "Supabase", "File storage", "https://supabase.com/"],
  ["turso", "Turso", "Database", "https://turso.tech/"],
  ["vercel", "Vercel", "Hosting", "https://vercel.com/"],
  ["react", "React", "Interface", "https://react.dev/"],
  ["vite", "Vite", "Build tooling", "https://vite.dev/"],
  ["nodedotjs", "Node.js", "Server runtime", "https://nodejs.org/"],
  [
    "github",
    "GitHub",
    "Source & sign-in",
    "https://github.com/Tenyokj/devdevian",
  ],
  ["google", "Google", "Sign-in", "https://developers.google.com/identity"],
  ["brevo", "Brevo", "Verification email", "https://www.brevo.com/"],
];
export default function StackRibbon() {
  const track = useRef(null),
    animation = useRef(null),
    ramp = useRef(null);
  const [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const node = track.current;
    const start = () => {
      const previous = animation.current;
      const progress = previous ? Number(previous.currentTime || 0) / 72000 : 0;
      previous?.cancel();
      const next = node.animate(
        [
          { transform: "translateX(0)" },
          {
            transform: `translateX(-${node.firstElementChild.getBoundingClientRect().width}px)`,
          },
        ],
        { duration: 72000, iterations: Infinity, easing: "linear" },
      );
      next.currentTime = progress * 72000;
      next.playbackRate = previous?.playbackRate ?? 1;
      animation.current = next;
    };
    start();
    const resize = new ResizeObserver(start);
    resize.observe(node.firstElementChild);
    return () => {
      resize.disconnect();
      animation.current?.cancel();
      animation.current = null;
      cancelAnimationFrame(ramp.current);
    };
  }, [reduced]);
  useEffect(() => {
    const current = animation.current;
    if (!current) return;
    cancelAnimationFrame(ramp.current);
    const start = current.playbackRate,
      target = paused || focused ? 0 : hovered ? 0.12 : 1,
      began = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - began) / 420);
      current.playbackRate = start + (target - start) * (1 - (1 - t) ** 3);
      if (t < 1) ramp.current = requestAnimationFrame(tick);
    };
    ramp.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ramp.current);
  }, [paused, hovered, focused, reduced]);
  return (
    <section
      className={"stack-ribbon" + (reduced ? " is-static" : "")}
      aria-labelledby="stack-heading"
      data-reveal
    >
      <div className="stack-intro">
        <span className="landing-kicker">BUILT WITH GOOD TOOLS</span>
        <h2 id="stack-heading">
          Open ideas.
          <br />
          <em>Solid foundations.</em>
        </h2>
        <p>The services and open-source tools behind Devdevian.</p>
        {!reduced && (
          <button
            className="stack-motion"
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}{" "}
            {paused ? "Resume motion" : "Pause motion"}
          </button>
        )}
      </div>
      <div
        className="stack-window"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
        }}
      >
        <div className="stack-track" ref={track}>
          {[0, 1].map((copy) => (
            <div
              className="stack-group"
              key={copy}
              aria-hidden={copy === 1 ? true : undefined}
            >
              {stack.map(([icon, name, role, url]) => (
                <a
                  className="stack-item"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={icon}
                  tabIndex={copy === 1 ? -1 : 0}
                >
                  <img
                    src={"/brands/" + icon + ".svg"}
                    alt=""
                    width="40"
                    height="40"
                  />
                  <span>
                    <strong>{name}</strong>
                    <small>{role}</small>
                  </span>
                  <ArrowUpRight size={17} />
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="stack-caption">
        The stack behind an independent, open-source forum.
      </p>
    </section>
  );
}
