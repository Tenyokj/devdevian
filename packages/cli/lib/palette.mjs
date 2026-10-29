import { navigation } from "./tui-data.mjs";
import { clean } from "./client.mjs";
export function paletteItems({
  query = "",
  actions = [],
  history = [],
  route = {},
} = {}) {
  const items = actions.map((action) => ({
    ...action,
    id: "action:" + action.id,
    group: "This view",
  }));
  navigation.forEach(([id, label, description], index) =>
    items.push({ id: "nav:" + index, label, description, group: "Go to" }),
  );
  for (const [kind, label] of [
    ["discussion", "Start a discussion"],
    ["question", "Ask a question"],
    ["review", "Request a code review"],
    ["showcase", "Share what you built"],
    ["project", "Create a project"],
    ["event", "Create an event"],
  ])
    items.push({ id: "create:" + kind, label, group: "Create" });
  const seen = new Set([JSON.stringify(route)]);
  [...history].reverse().forEach((item) => {
    const key = JSON.stringify(item.route);
    if (!seen.has(key) && item.route.view !== "help") {
      seen.add(key);
      if (seen.size <= 9)
        items.push({
          id: "recent:" + key,
          label: clean(item.label || item.route.view),
          group: "Recent",
          route: item.route,
        });
    }
  });
  const q = clean(query).trim().replace(/^\//, "");
  const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const result = items.filter((item) =>
    words.every((word) =>
      `${item.label} ${item.description || ""} ${item.group}`
        .toLocaleLowerCase()
        .includes(word),
    ),
  );
  const direct = q.match(/^(?:open|project|event)\s+([1-9]\d*)$/i);
  if (direct && Number.isSafeInteger(Number(direct[1])))
    result.unshift({
      id: "command",
      command: "/" + q.toLowerCase(),
      label: "Open " + q,
      group: "Command",
    });
  if (/^pr https:\/\/github\.com\//i.test(q))
    result.unshift({
      id: "command",
      command: "/pr " + q.replace(/^pr\s+/i, ""),
      label: "Read public GitHub PR",
      group: "Command",
    });
  if (q)
    result.push({
      id: "search",
      query: q,
      label: "Search forum for “" + q + "”",
      group: "Search",
    });
  return result;
}
