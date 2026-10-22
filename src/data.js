export const types = {
  question: {
    label: "Question",
    verb: "Ask a question",
    color: "blue",
    description: "Get unstuck with a little help from the community.",
  },
  discussion: {
    label: "Discussion",
    verb: "Start a discussion",
    color: "violet",
    description: "A fresh perspective starts with a good conversation.",
  },
  review: {
    label: "Code review",
    verb: "Request a review",
    color: "orange",
    description: "Share context, a snippet, and what you want reviewed.",
  },
  showcase: {
    label: "Show & tell",
    verb: "Share what you built",
    color: "green",
    description: "Small experiment or big launch — show us your work.",
  },
};
// Vercel and proxies may return plain text or HTML when a function is down.
// Never expose their payload as a JSON syntax error (or display HTML to users).
export async function readAPIResponse(response) {
  let data;
  try {
    data = JSON.parse(await response.text());
  } catch {
    data = null;
  }
  if (!response.ok || data === null) {
    const error = new Error(
      (data && typeof data.error === "string" && data.error) ||
        (response.status >= 500
          ? "The service is temporarily unavailable. Please try again shortly."
          : "Unexpected server response. Please try again."),
    );
    error.status = response.ok ? 502 : response.status;
    error.requestId = data?.request_id || response.headers?.get("x-request-id");
    if (error.status >= 500 && error.requestId)
      error.message += " Reference: " + error.requestId;
    throw error;
  }
  return data;
}
const pendingGets = new Map();
export async function api(path, options = {}) {
  const isGet = !options.method || options.method === "GET";
  if (!isGet) pendingGets.clear();
  // Only identical in-flight reads are shared. No private responses are cached
  // across account changes, and mutations are never automatically replayed.
  if (isGet && !options.signal && pendingGets.has(path))
    return pendingGets.get(path);
  const work = async () => {
    let response;
    const timeout = AbortSignal.timeout(20000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    try {
      response = await fetch("/api" + path, {
        ...options,
        signal,
        headers: { "Content-Type": "application/json", ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (e) {
      if (options.signal?.aborted) throw e;
      throw new Error(
        timeout.aborted
          ? "The server took too long to respond. Please try again."
          : "Could not reach the service. Check your connection and try again.",
      );
    }
    const data = await readAPIResponse(response);
    if (data.posts?.items && data.posts.pagination)
      data.posts = Object.assign(data.posts.items, {
        pagination: data.posts.pagination,
      });
    if (data.items && data.pagination && Object.keys(data).length === 2)
      return Object.assign(data.items, { pagination: data.pagination });
    return data;
  };
  const promise = work();
  if (isGet && !options.signal) pendingGets.set(path, promise);
  try {
    return await promise;
  } finally {
    if (pendingGets.get(path) === promise) pendingGets.delete(path);
  }
}
export const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export function dateTime(date, zone = localZone) {
  return new Intl.DateTimeFormat("en", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
}
export function dateOnly(date) {
  return date
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
        new Date(date.includes("T") ? date : date.replace(" ", "T") + "Z"),
      )
    : "Example";
}
export function tags(value) {
  return value
    ? value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
}
