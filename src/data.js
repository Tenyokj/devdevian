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
export async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.error || "Something went wrong. Please try again.",
    );
    error.status = response.status;
    throw error;
  }
  if (data.posts?.items && data.posts.pagination)
    data.posts = Object.assign(data.posts.items, {
      pagination: data.posts.pagination,
    });
  if (data.items && data.pagination && Object.keys(data).length === 2)
    return Object.assign(data.items, { pagination: data.pagination });
  return data;
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
