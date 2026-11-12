(async () => {
  await devdevian.panel.configure({
    placement: "right",
    title: "Focus Desk",
    width: 330,
    height: 560,
  });
  const root = document.getElementById("root");
  root.innerHTML = `<style>
    *{box-sizing:border-box}body{margin:0;background:#161225;color:#f2edff;font:15px/1.55 system-ui,sans-serif}
    body[data-mode=light]{background:#fcf8ff;color:#241c39}main{padding:22px}header{display:flex;justify-content:space-between;align-items:center}small{opacity:.65}h1{font-size:20px;margin:0}h2{font-size:14px;margin:24px 0 8px}
    .timer{padding:24px 0;text-align:center}output{display:block;font:500 54px/1.3 ui-monospace,monospace;color:#b99bff;font-variant-numeric:tabular-nums}body[data-mode=light] output{color:#7251ae}
    button,textarea{font:inherit;color:inherit;border:1px solid #9c80c64d;background:transparent;border-radius:12px}button{padding:8px 13px;cursor:pointer}button:hover{background:#9c80c622}button:focus-visible,textarea:focus-visible{outline:2px solid #aa8ce3;outline-offset:3px}.row{display:flex;gap:8px;justify-content:center;margin-top:12px}.primary{background:#7355ab;color:white}textarea{width:100%;height:160px;resize:vertical;padding:12px}p{font-size:12px;opacity:.7}.status{min-height:20px}button:disabled{opacity:.5}
    </style><main><header><h1>Focus Desk</h1><small>Just your space.</small></header><div class="timer"><small id="mode">Focus session</small><output id="time" aria-label="Time remaining">25:00</output><div class="row"><button id="toggle" class="primary">Start</button><button id="reset">Reset</button><button id="switch">Take a break</button></div><p id="timer-status" role="status"></p></div><h2><label for="note">A note for your next step</label></h2><textarea id="note" maxlength="3000" placeholder="What will you build next?"></textarea><p id="save-status" class="status" role="status"></p><button id="clear">Clear note</button><p>Saved on this device. No network access.<br>Keep passwords and secrets elsewhere.</p></main>`;
  const $ = (id) => document.getElementById(id);
  const applyMode = (mode) => {
    document.body.dataset.mode = mode;
  };
  applyMode((await devdevian.context()).mode);
  devdevian.onTheme(applyMode);
  let state = { break: false, remaining: 25 * 60, deadline: null };
  try {
    const saved = await devdevian.storage.get("timer");
    if (
      saved &&
      typeof saved.break === "boolean" &&
      Number.isFinite(saved.remaining) &&
      saved.remaining >= 0 &&
      saved.remaining <= 1500 &&
      (saved.deadline === null || Number.isFinite(saved.deadline))
    )
      state = saved;
    const note = await devdevian.storage.get("note");
    if (typeof note === "string") $("note").value = note.slice(0, 3000);
  } catch {
    $("save-status").textContent = "Could not load local storage.";
  }
  const remaining = () =>
    state.deadline === null
      ? state.remaining
      : Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
  const persistTimer = () =>
    devdevian.storage.set("timer", state).catch(() => {
      $("timer-status").textContent = "Timer state could not be saved.";
    });
  const draw = () => {
    const n = remaining();
    $("time").textContent =
      `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    $("toggle").textContent = state.deadline === null ? "Start" : "Pause";
    $("mode").textContent = state.break
      ? "A little breathing room"
      : "Focus session";
    $("switch").textContent = state.break ? "Back to focus" : "Take a break";
    if (!n && state.deadline !== null) {
      state.deadline = null;
      state.remaining = 0;
      $("timer-status").textContent = "Session complete. Take a breath.";
      persistTimer();
      $("toggle").textContent = "Start";
    }
  };
  $("toggle").onclick = () => {
    state.remaining = remaining();
    state.deadline =
      state.deadline === null
        ? Date.now() + (state.remaining || (state.break ? 300 : 1500)) * 1000
        : null;
    $("timer-status").textContent = "";
    persistTimer();
    draw();
  };
  $("reset").onclick = () => {
    state.remaining = state.break ? 300 : 1500;
    state.deadline = null;
    $("timer-status").textContent = "";
    persistTimer();
    draw();
  };
  $("switch").onclick = () => {
    state = {
      break: !state.break,
      remaining: state.break ? 1500 : 300,
      deadline: null,
    };
    $("timer-status").textContent = "";
    persistTimer();
    draw();
  };
  // Serialize saves so an older slow write cannot replace a newer note.
  let saveQueue = Promise.resolve(),
    revision = 0;
  const saveNote = () => {
    const text = $("note").value,
      current = ++revision;
    $("save-status").textContent = "Saving…";
    saveQueue = saveQueue
      .catch(() => {})
      .then(() => devdevian.storage.set("note", text))
      .then(
        () => {
          if (current === revision)
            $("save-status").textContent = "Saved on this device.";
        },
        () => {
          if (current === revision)
            $("save-status").textContent =
              "Could not save. Keep a copy before closing.";
        },
      );
  };
  $("note").oninput = saveNote;
  $("clear").onclick = () => {
    $("note").value = "";
    saveNote();
  };
  draw();
  setInterval(draw, 500);
})().catch((error) => {
  document.getElementById("root").textContent =
    "Focus Desk could not start. Disable and enable the extension to retry.";
  console.error(error);
});
