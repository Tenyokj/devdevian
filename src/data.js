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
export const demoPosts = [
  {
    id: "demo-1",
    demo: true,
    name: "Maya Chen",
    role: "Frontend developer",
    kind: "question",
    topic: "web",
    title: "How do you decide when a React component needs to be split?",
    body: "I’m refactoring a dashboard and keep going back and forth between smaller components and keeping related logic together. What signals do you look for beyond just the number of lines?",
    stack: "React, TypeScript",
    status: "open",
    reply_count: 0,
    vote_count: 0,
  },
  {
    id: "demo-2",
    demo: true,
    name: "Alex Rivera",
    role: "Indie builder",
    kind: "showcase",
    topic: "indie",
    title: "Built a tiny tool to turn my messy notes into a changelog",
    body: "A weekend experiment that finally escaped my localhost. I’d love feedback on the first-run experience — does the workflow make sense without a tutorial?",
    stack: "Next.js, SQLite",
    status: "open",
    reply_count: 0,
    vote_count: 0,
  },
  {
    id: "demo-3",
    demo: true,
    name: "Sam Okafor",
    role: "Backend engineer",
    kind: "review",
    topic: "devops",
    title: "Looking for a second pair of eyes on my retry logic",
    body: "Trying to make this worker a little more resilient. Especially curious about backoff, timeouts, and what happens when everything fails at once.\n\n```ts\nasync function retry<T>(task: () => Promise<T>, n = 3) {\n  for (let attempt = 0; attempt < n; attempt++) {\n    try { return await task(); }\n    catch (error) {\n      if (attempt === n - 1) throw error;\n      await new Promise(r => setTimeout(r, 2 ** attempt * 500));\n    }\n  }\n}\n```",
    stack: "TypeScript, Node.js",
    status: "open",
    reply_count: 0,
    vote_count: 0,
  },
  {
    id: "demo-4",
    demo: true,
    name: "Lena Park",
    role: "ML engineer",
    kind: "discussion",
    topic: "ai",
    title: "What’s one AI feature you shipped that people actually use?",
    body: "Less interested in the model benchmark, more interested in the boring, useful thing that made someone’s day easier. What did you learn after shipping it?",
    stack: "AI, Product",
    status: "open",
    reply_count: 0,
    vote_count: 0,
  },
];
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
