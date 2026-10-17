import React, { useState } from "react";
import { ArrowUpRight, ArrowRight, Code2, MessageCircle, Users, Sparkles, Sun, Moon, Check, GitPullRequest, CalendarDays, ChevronRight } from "lucide-react";
import "./landing.css";

const paths = [
  { icon: MessageCircle, label: "Find an answer", title: "That bug has met its match.", text: "Ask a focused question, add your code and context, then mark the answer that got you unstuck.", color: "blue", example: "How do you handle retries without duplicate payments?", tag: "Backend · Question" },
  { icon: GitPullRequest, label: "Get another perspective", title: "A second pair of eyes changes things.", text: "Share a snippet, explain the tradeoffs, and invite a thoughtful code review from other builders.", color: "violet", example: "A second look at my async queue implementation", tag: "TypeScript · Code review" },
  { icon: Sparkles, label: "Build in the open", title: "Your side project deserves company.", text: "Give your project a home. Share screenshots, introduce your team, and ask for the feedback you actually need.", color: "green", example: "I made a tiny tool to make release notes less painful", tag: "Indie builders · Show & tell" },
];

export default function Landing() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "dark");
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem("devdevian-theme", next); } catch {}
    setTheme(next);
  };
  return <div className="landing">
    <nav className="landing-nav" aria-label="Main navigation">
      <a className="landing-brand" href="/" aria-label="Devdevian home"><img src="/devdevian-logo.png" alt="" />devdevian<span>.</span></a>
      <div className="landing-nav-links"><a href="#possibilities">Explore</a><a href="#your-people">Your people</a><a href="#how-it-works">How it works</a></div>
      <div className="landing-nav-actions"><button className="landing-theme" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>{theme === "dark" ? <Sun size={19}/> : <Moon size={19}/>}</button><a className="landing-button small" href="/app">Open app <ArrowUpRight size={16}/></a></div>
    </nav>
    <main className="landing-main">
      <section className="landing-hero">
        <div className="landing-hero-copy"><span className="landing-kicker"><span/> THE DEVELOPER COMMONS · EARLY VERSION</span>
          <h1>Good code starts<br/>with <em>good company.</em></h1>
          <p>A home for your questions, your next idea, and the people who get it. Find your corner of the developer internet.</p>
          <div className="landing-hero-actions"><a className="landing-button" href="/app">Find your people <ArrowUpRight size={19}/></a><a className="landing-text-link" href="#possibilities">Take a look around <ArrowRight size={16}/></a></div>
          <div className="landing-hero-footnote"><Code2 size={16}/> Less shouting into the void. More building together.</div>
        </div>
        <div className="landing-preview" aria-label="Illustrative preview of a developer conversation">
          <div className="landing-preview-top"><span className="preview-dots"><i/><i/><i/></span><span>your next good conversation</span><Code2 size={16}/></div>
          <div className="landing-preview-body"><div className="preview-topic"><span className="preview-dot"/> TypeScript <span> / </span> Code review</div>
            <h2>It works on my machine.<br/>Let's make it work everywhere.</h2>
            <p>Trying to make this worker a little more resilient. What would you change?</p>
            <pre><code><span>async function</span> shipSomething() {"{"}<br/>  <span>const</span> idea = <b>await</b> build();<br/>  <b>return</b> community.review(idea);<br/>{"}"}</code></pre>
            <div className="preview-reply"><span className="preview-avatar"><Code2 size={18}/></span><div><strong>A fresh perspective</strong><p>What happens if the request succeeds, but the response never arrives?</p></div></div>
            <div className="preview-footer"><span><Check size={14}/> A little context goes a long way.</span><MessageCircle size={17}/></div>
          </div><span className="preview-label">ILLUSTRATIVE CONVERSATION</span>
        </div>
      </section>
      <div className="landing-topic-strip" aria-label="Topics to explore">{["Web development", "AI & ML", "Open source", "Web3", "DevOps", "Indie building"].map((t,i)=><a key={t} href="/app"><span>0{i+1}</span>{t}<ArrowUpRight size={14}/></a>)}</div>
      <section className="landing-section" id="possibilities"><div className="landing-section-heading"><span className="landing-kicker">COME WITH A QUESTION. LEAVE WITH MOMENTUM.</span><h2>Whatever you're building,<br/>you don't have to build alone.</h2></div>
        <div className="landing-paths">{paths.map(({icon:Icon,...p},i)=><article className={"landing-path "+p.color} key={p.label}><div className="landing-path-top"><Icon size={24}/><span>0{i+1} / {p.label}</span></div><h3>{p.title}</h3><p>{p.text}</p><a className="landing-example" href="/app"><small>{p.tag}</small><strong>{p.example}</strong><ArrowUpRight size={19}/></a></article>)}</div>
      </section>
      <section className="landing-community" id="your-people"><div><span className="landing-kicker">A PUBLIC SQUARE. A SPACE OF YOUR OWN.</span><h2>Big ideas.<br/><em>Smaller circles.</em></h2><p>Explore the public feed through topics and technologies. When you need a more focused space, create a private community with membership approval and its own validators.</p><a className="landing-button" href="/app#communities">Find your corner <Users size={18}/></a></div>
        <div className="landing-circles"><div className="landing-circle circle-one"><Code2 size={28}/><strong>Your next project</strong><span>Questions · Feedback · Progress</span></div><div className="landing-circle circle-two"><Users size={25}/><strong>Your kind of people</strong><span>Private, member-only spaces</span></div><span className="circle-note">Public conversations stay public.<br/>Private conversations stay in your community.</span></div>
      </section>
      <section className="landing-section landing-steps" id="how-it-works"><div className="landing-section-heading"><span className="landing-kicker">MAKE YOURSELF AT HOME</span><h2>From “hello” to<br/>“let's build this.”</h2></div><ol><li><span>01</span><div><h3>Make it yours.</h3><p>Choose a permanent @username. Add your story, your links, and what you're working on.</p></div></li><li><span>02</span><div><h3>Start somewhere.</h3><p>Follow a conversation, join a community, or put your first question out there.</p></div></li><li><span>03</span><div><h3>Keep showing up.</h3><p>Share progress, offer a code review, or join an event with fellow developers.</p></div><CalendarDays size={23}/></li></ol></section>
      <section className="landing-final"><span className="landing-kicker">A WORK IN GOOD COMPANY</span><h2>The next great thing<br/>might start with <em>“hey.”</em></h2><a className="landing-button" href="/app">Open Devdevian <ArrowUpRight size={20}/></a><p>Explore the early version. Bring your curiosity.</p></section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="/"><img src="/devdevian-logo.png" alt=""/>devdevian<span>.</span></a><span>Made for people who make things.</span><a href="/app">See you inside <ChevronRight size={14}/></a></footer>
  </div>;
}
