// Serial, cancellable polling: network failures never retry a mutation.
export function liveLoop(
  work,
  {
    schedule = setTimeout,
    cancel = clearTimeout,
    now = Date.now,
    activity = () => now(),
    active = 45000,
    idle = 180000,
    onError = () => {},
  } = {},
) {
  const controller = new AbortController();
  let timer,
    failures = 0,
    stopped = false;
  async function run() {
    try {
      await work(controller.signal);
      failures = 0;
    } catch (error) {
      if (stopped) return;
      failures++;
      onError(error);
      if (error.status === 401 || error.status === 403) {
        stop();
        return;
      }
    }
    if (stopped) return;
    const base = now() - activity() > 120000 ? idle : active;
    timer = schedule(run, Math.min(300000, base * 2 ** Math.min(failures, 3)));
  }
  function stop() {
    stopped = true;
    cancel(timer);
    controller.abort();
  }
  timer = schedule(run, 0);
  return stop;
}
export function anchoredIndex(previous, next, index) {
  const row = previous?.[index];
  if (row) {
    const found = next.findIndex(
      (item) => item.id === row.id && item.entryType === row.entryType,
    );
    if (found >= 0) return found;
  }
  return Math.max(0, Math.min(index, next.length - 1));
}
