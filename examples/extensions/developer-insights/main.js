(async () => {
  const root = document.getElementById("root");
  // All interpolated account/topic/project text is escaped. SVG paths contain numbers only.
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const num = (n) => new Intl.NumberFormat("en").format(Number(n) || 0);
  const colors = [
    "#b69bff",
    "#77d8ca",
    "#ffbf81",
    "#f5a4cd",
    "#91b9ff",
    "#dbb4fa",
    "#d7da83",
    "#9ae0ed",
  ];
  const labels = {
    conversation: "Conversations",
    reply: "Discussion replies",
    code_feedback: "Code feedback",
    feedback_reply: "Feedback replies",
    formal_review: "Formal reviews",
    contribution: "Contribution submissions",
    task_update: "Task state changes",
    decision_update: "Decision revisions",
  };
  const style = `<style>
  *{box-sizing:border-box}body{margin:0;background:#12101f;color:#f3edff;font:14px/1.55 system-ui,sans-serif;--card:#1c182d;--line:#b49ad32e;--muted:#b4a9c7;--accent:#baa3ff;--soft:#b69bff16}body[data-mode=light]{background:#fbf9ff;color:#271b3b;--card:#fff;--line:#64468724;--muted:#776586;--accent:#7551bf;--soft:#7753bd0b}
  main{padding:24px;max-width:1600px;margin:auto}h1,h2,h3,p{margin:0}h1{font-size:clamp(24px,3.5vw,38px);letter-spacing:-1px;line-height:1.2}h2{font-size:15px;letter-spacing:-.2px}h3{font-size:14px}.eyebrow{font:10px ui-monospace,monospace;letter-spacing:2px;color:var(--accent);margin-bottom:9px}.muted,small{color:var(--muted)}.intro{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:22px}.intro p{margin-top:10px;max-width:620px}.pill{color:var(--accent);border:1px solid var(--line);border-radius:24px;padding:7px 12px;font-size:11px;white-space:nowrap}
  .controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0 22px}.controls label{display:flex;gap:7px;align-items:center;font-size:12px}button,select{font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px;cursor:pointer}button:hover{border-color:var(--accent);background:var(--soft)}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}button:disabled{opacity:.45;cursor:default}.controls small{margin-left:auto}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.metric,.card{border:1px solid var(--line);background:var(--card);border-radius:18px;padding:18px;min-width:0}.metric span{color:var(--muted);font-size:11px}.metric strong{display:block;font:600 32px/1.35 ui-monospace,monospace;letter-spacing:-1px;color:var(--accent);font-variant-numeric:tabular-nums}.metric small{font-size:10px}.card{margin-top:14px}.card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.card-head small{font-size:10px}.period{display:flex;gap:18px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--muted)}.period strong{color:var(--accent)}.chart{width:100%;display:block}.calendar{display:grid;grid-template-rows:repeat(7,10px);grid-auto-flow:column;grid-auto-columns:10px;gap:4px;overflow:auto;padding:2px;justify-content:start}.cell{border-radius:3px;background:var(--soft);border:1px solid var(--line)}.cell[data-level="1"]{background:#b69bff40}.cell[data-level="2"]{background:#b69bff77}.cell[data-level="3"]{background:#b69bffae}.cell[data-level="4"]{background:#b69bff}.legend{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:10px;font-size:10px;color:var(--muted)}.legend i{width:9px;height:9px;border-radius:2px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.two .card{height:calc(100% - 14px)}.donut-wrap{display:flex;align-items:center;gap:18px}.donut{width:130px;height:130px;flex-shrink:0}.rows{flex:1;min-width:0}.rows>div{display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:4px 0}.rows i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px}.bar{height:5px;background:var(--soft);border-radius:4px;margin:4px 0 10px;overflow:hidden}.bar>span{display:block;height:100%;border-radius:4px;background:var(--accent)}.project{padding:13px 0;border-top:1px solid var(--line);display:flex;align-items:center;gap:12px;justify-content:space-between}.project p{font-size:11px;color:var(--muted);margin-top:4px}.project button{text-align:left;max-width:100%;overflow-wrap:anywhere}.project small{font-size:10px}.facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.facts strong{display:block;font:600 20px ui-monospace,monospace;color:var(--accent)}.facts small{font-size:10px}.empty{padding:25px 0;color:var(--muted);font-size:12px}.foot{font-size:10px;color:var(--muted);margin-top:20px;border-top:1px solid var(--line);padding-top:14px}.pager{display:flex;gap:12px;align-items:center;justify-content:flex-end;margin-top:12px;font-size:11px}details{font-size:11px;color:var(--muted);margin-top:14px}summary{cursor:pointer}table{border-collapse:collapse;width:100%;font-size:11px}td,th{padding:5px;text-align:left;border-bottom:1px solid var(--line)}.table-scroll{max-height:200px;overflow:auto}.error{padding:18px;border:1px solid #ffbf8155;border-radius:14px;color:#ffbf81}.ready{animation:appear .25s ease-out}@keyframes appear{from{opacity:.5;transform:translateY(4px)}to{opacity:1;transform:none}}@media(max-width:700px){main{padding:16px}.intro{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.two{grid-template-columns:1fr}.controls small{margin-left:0;width:100%}.metric{padding:14px}.metric strong{font-size:27px}.facts{grid-template-columns:repeat(2,minmax(0,1fr))}.donut{width:110px;height:110px}.card{padding:15px}.card-head{align-items:flex-start}.project{align-items:flex-start}.period{gap:10px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style>`;
  let context = await devdevian.context(),
    person = null,
    days = 90,
    scope = "public",
    page = 1,
    sequence = 0,
    lastHeight = 0;
  const configure = (height) =>
    devdevian.panel.configure({
      placement: "profile",
      title: "Developer Insights",
      width: 1200,
      height,
    });
  await configure(1100);
  const resize = new ResizeObserver(() => {
    const height = Math.max(
      180,
      Math.min(
        3200,
        Math.ceil(
          document.querySelector("main")?.getBoundingClientRect().height ||
            1100,
        ) + 2,
      ),
    );
    if (Math.abs(height - lastHeight) > 12) {
      lastHeight = height;
      configure(height).catch(() => {});
    }
  });
  resize.observe(root);
  const setTheme = (mode) => {
    document.body.dataset.mode = mode;
  };
  setTheme(context.mode);
  devdevian.onTheme(setTheme);
  const shell = (body) => {
    root.innerHTML = style + `<main class="ready">${body}</main>`;
  };
  const metric = (label, value, note) =>
    `<div class="metric"><span>${label}</span><strong>${num(value)}</strong><small>${note}</small></div>`;
  const donut = (rows, total, caption) => {
    let offset = 0;
    const arcs = rows
      .map((r, i) => {
        const share = total ? r.count / total : 0,
          part = share * 100;
        const s = `<circle cx="60" cy="60" r="45" pathLength="100" fill="none" stroke="${colors[i % colors.length]}" stroke-width="11" stroke-dasharray="${part} ${100 - part}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
        offset += part;
        return s;
      })
      .join("");
    return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 120 120" role="img" aria-label="${esc(caption)}"><circle cx="60" cy="60" r="45" fill="none" stroke="var(--line)" stroke-width="11"/>${arcs}<text x="60" y="60" text-anchor="middle" fill="currentColor" font-size="20" font-family="monospace">${num(total)}</text><text x="60" y="75" text-anchor="middle" fill="var(--muted)" font-size="9">${esc(caption)}</text></svg><div class="rows">${rows.map((r, i) => `<div><span><i style="background:${colors[i % colors.length]}"></i>${esc(r.label)}</span><strong>${num(r.count)} · ${total ? Math.round((r.count / total) * 100) : 0}%</strong></div>`).join("") || '<p class="empty">No records yet.</p>'}</div></div>`;
  };
  function render(data) {
    const map = new Map(data.activity.map((x) => [x.day, x.count])),
      daily = [];
    for (let i = 0; i < days; i++) {
      const day = new Date(
        Date.parse(data.window.from + "T00:00:00Z") + i * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      daily.push({ day, count: map.get(day) || 0 });
    }
    const total = daily.reduce((s, d) => s + d.count, 0),
      active = daily.filter((d) => d.count > 0).length,
      max = Math.max(1, ...daily.map((d) => d.count));
    let best = 0,
      run = 0;
    for (const d of daily) {
      run = d.count ? run + 1 : 0;
      best = Math.max(best, run);
    }
    let current = 0,
      index = daily.length - 1;
    if (!daily[index].count) index--;
    for (; index >= 0 && daily[index].count; index--) current++;
    const points = daily.map(
        (d, i) =>
          `${((i / (days - 1)) * 680).toFixed(2)},${(150 - (d.count / max) * 125).toFixed(2)}`,
      ),
      path = points.join(" "),
      c = data.totals;
    const states = [
        "submitted",
        "changes_requested",
        "accepted",
        "withdrawn",
      ].map((state) => ({
        label: state.replaceAll("_", " "),
        count: data.contributions.find((c) => c.state === state)?.count || 0,
      })),
      contributions = states.reduce((s, r) => s + r.count, 0);
    shell(`<div class="intro"><div><p class="eyebrow">DEVELOPER INSIGHTS / REAL WORK</p><h1>${esc(data.person.name)}'s rhythm.</h1><p class="muted">A little perspective on conversations, reviews and work built together.</p></div><span class="pill">${data.scope === "all" ? "Your accessible work · private included" : "Public activity only"}</span></div>
    <div class="controls"><label>Activity window <select id="days">${[30, 90, 365].map((n) => `<option value="${n}" ${days === n ? "selected" : ""}>${n} days</option>`).join("")}</select></label><button id="refresh">Refresh</button>${data.own ? `<label><input id="private" type="checkbox" ${scope === "all" ? "checked" : ""}/>Include my accessible private work</label>` : ""}<small>Calendar in UTC · counters below are lifetime retained records</small></div>
    <div class="grid">${metric("Conversations", c.conversations, `${num(c.questions)} questions · ${num(c.review_requests)} review requests`)}${metric("Discussion replies", c.replies, "Retained replies, including nested replies")}${metric("Accepted solutions", c.accepted_solutions, "Answers currently marked as solutions")}${metric("Contributions", contributions, `${num(states[2].count)} currently accepted`)}${metric("Projects with work", c.projects_participated, `${num(c.projects_owned)} owned projects`)}${metric("Review actions", c.code_feedback + c.feedback_replies + c.formal_reviews, `${num(c.formal_reviews)} formal review outcomes`)}</div>
    <section class="card"><div class="card-head"><h2>Your activity calendar</h2><small>${esc(data.window.from)} — ${esc(data.window.to)}</small></div><div class="calendar" role="img" aria-label="${total} recorded actions across ${active} active days in the selected ${days}-day window">${daily.map((d) => `<div class="cell" data-level="${d.count ? Math.max(1, Math.ceil((d.count / max) * 4)) : 0}" title="${d.day}: ${num(d.count)} recorded actions"></div>`).join("")}</div><div class="legend">Less ${[0, 1, 2, 3, 4].map((n) => `<i style="background:${n ? "#b69bff" + ["", "40", "77", "ae", "ff"][n] : "var(--soft)"}"></i>`).join("")} More</div><div class="period"><span><strong>${num(total)}</strong> recorded actions</span><span><strong>${active}/${days} · ${Math.round((active / days) * 100)}%</strong> active days</span><span><strong>${current}</strong> current streak*</span><span><strong>${best}</strong> longest streak in this window</span></div></section>
    <section class="card"><div class="card-head"><h2>Activity over time</h2><small>Daily recorded actions · not reading time</small></div>${total ? `<svg class="chart" viewBox="0 0 680 180" role="img" aria-label="Daily activity, maximum ${max} actions"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b69bff" stop-opacity=".4"/><stop offset="1" stop-color="#b69bff" stop-opacity="0"/></linearGradient></defs>${[25, 87, 150].map((y) => `<line x1="0" y1="${y}" x2="680" y2="${y}" stroke="var(--line)" stroke-dasharray="3 5"/>`).join("")}<polygon points="0,150 ${path} 680,150" fill="url(#area)"/><polyline points="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/><text x="0" y="174" fill="var(--muted)" font-size="10">${daily[0].day}</text><text x="680" y="174" text-anchor="end" fill="var(--muted)" font-size="10">${daily.at(-1).day}</text></svg>` : '<p class="empty">No recorded activity in this window. Nothing is estimated.</p>'}<details><summary>Read the daily figures</summary><div class="table-scroll"><table><thead><tr><th>UTC date</th><th>Actions</th></tr></thead><tbody>${daily.map((d) => `<tr><td>${d.day}</td><td>${d.count}</td></tr>`).join("")}</tbody></table></div></details></section>
    <div class="two"><section class="card"><div class="card-head"><h2>How this window was spent</h2><small>Share of recorded actions</small></div>${donut(
      data.breakdown.map((r) => ({
        ...r,
        label: labels[r.category] || r.category,
      })),
      total,
      "actions",
    )}</section><section class="card"><div class="card-head"><h2>Contribution states</h2><small>Current lifetime states</small></div>${donut(states, contributions, "submissions")}<p class="muted" style="font-size:10px;margin-top:12px">${contributions ? Math.round((states[2].count / contributions) * 100) : 0}% accepted out of ${num(contributions)} retained submissions. Pending and withdrawn records are included in this denominator; this is not a quality score.</p></section></div>
    <div class="two"><section class="card"><div class="card-head"><h2>More of the picture</h2><small>Lifetime retained records</small></div><div class="facts">${[
      ["Discussions", c.discussions],
      ["Show & tell", c.showcases],
      ["Code feedback", c.code_feedback],
      ["Feedback replies", c.feedback_replies],
      ["Assigned tasks", c.assigned_tasks],
      ["Hosted events", c.hosted_events],
      ["Published extensions", c.published_extensions],
      ["Formal reviews", c.formal_reviews],
    ]
      .map(
        ([l, n]) => `<div><strong>${num(n)}</strong><small>${l}</small></div>`,
      )
      .join(
        "",
      )}</div></section><section class="card"><div class="card-head"><h2>Topics you bring to the table</h2><small>Authored conversations · top 8</small></div>${data.topics.length ? data.topics.map((t) => `<div class="rows"><div><span>${esc(t.name)}</span><strong>${num(t.count)}</strong></div></div><div class="bar"><span style="width:${(t.count / Math.max(1, c.conversations)) * 100}%"></span></div>`).join("") : '<p class="empty">No authored conversations in this scope yet.</p>'}</section></div>
    <section class="card"><div class="card-head"><h2>Tools in your conversations</h2><small>Declared stack · top 8 · not inferred expertise</small></div><div class="grid">${data.technologies.map((t) => `<div class="rows"><div><span>${esc(t.name)}</span><strong>${num(t.count)} posts</strong></div></div>`).join("") || '<p class="empty">No stack labels on authored conversations yet.</p>'}</div></section>
    <section class="card"><div class="card-head"><h2>Projects with your work</h2><small>${num(data.projects_total)} projects · lifetime attribution</small></div>${data.projects.length ? data.projects.map((pr) => `<div class="project"><div><button data-project="${pr.id}">${esc(pr.name)}</button><p>${esc(pr.roles)} · ${esc(pr.stage)}</p></div><small>${num(pr.contributions)} submissions<br/>${num(pr.accepted)} accepted</small></div>`).join("") : '<p class="empty">No visible project attribution yet. Permission to participate alone is not counted as work.</p>'}<div class="pager"><button id="prev" ${page <= 1 ? "disabled" : ""}>Previous</button><span>${page}/${data.project_pagination.pages}</span><button id="next" ${page >= data.project_pagination.pages ? "disabled" : ""}>Next</button></div></section>
    ${
      data.personal
        ? `<section class="card"><div class="card-head"><h2>Only you</h2><small>Personal counters · never shown to another viewer</small></div><div class="facts">${[
            ["Saved conversations", data.personal.bookmarks],
            ["Followed conversations", data.personal.following_conversations],
            ["Event RSVPs", data.personal.event_rsvps],
            ["Installed extensions", data.personal.installed_extensions],
          ]
            .map(
              ([l, n]) =>
                `<div><strong>${num(n)}</strong><small>${l}</small></div>`,
            )
            .join("")}</div></section>`
        : ""
    }
    <p class="foot">Counts reflect retained, currently readable records. Removed/deleted work is excluded. *Current streak ends today or yesterday in UTC and is bounded by this window. Reading time, visits, online hours and GitHub-wide activity are not tracked. Refresh to reflect changed permissions. This extension has no external network access.</p>`);
    document.getElementById("days").onchange = (e) => {
      days = Number(e.target.value);
      page = 1;
      load();
    };
    document.getElementById("refresh").onclick = () => load();
    const privateInput = document.getElementById("private");
    if (privateInput)
      privateInput.onchange = (e) => {
        scope = e.target.checked ? "all" : "public";
        page = 1;
        load();
      };
    document.getElementById("prev").onclick = () => {
      page--;
      load();
    };
    document.getElementById("next").onclick = () => {
      page++;
      load();
    };
    document
      .querySelectorAll("[data-project]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            devdevian.navigate("workspace/" + b.dataset.project)),
      );
  }
  async function load() {
    const current = ++sequence;
    if (!person) {
      shell(
        '<p class="eyebrow">DEVELOPER INSIGHTS</p><h2>Open a developer profile.</h2><p class="muted">Your statistics appear below its header.</p>',
      );
      return;
    }
    shell(
      '<p class="eyebrow">DEVELOPER INSIGHTS</p><h2 role="status">Loading recorded work…</h2>',
    );
    try {
      const data = await devdevian.data.get(
        `/users/${person}/insights?days=${days}&scope=${scope}&project_page=${page}`,
      );
      if (current === sequence) render(data);
    } catch (e) {
      if (current === sequence) {
        shell(
          `<h2>Could not load insights</h2><p class="error" role="alert">${esc(e.message)}</p><p class="muted">Requires Devdevian Browser/API 1.6 or newer. Your account must still be able to access the profile.</p><button id="retry">Try again</button>`,
        );
        document.getElementById("retry").onclick = () => load();
      }
    }
  }
  function changed(next) {
    setTheme(next.mode);
    const id = next.profile?.id || null;
    if (id === person) return;
    person = id;
    scope = "public";
    page = 1;
    load();
  }
  if (devdevian.onContext) devdevian.onContext(changed);
  await devdevian.commands.register(
    { id: "open-insights", title: "Open my insights", shortcut: "Alt+Shift+I" },
    () => devdevian.navigate("profile"),
  );
  changed(context);
  if (!person) await load();
})();
