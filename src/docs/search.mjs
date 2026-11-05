// Search is local: match complete query terms against a guide and its sections.
// Return real section URLs and contextual excerpts rather than generic intros.
export function searchGuides(documents, query, pathFor, idFor) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = [];
  for (const doc of documents) {
    const sections = doc.body.split(/\n(?=## )/);
    let best = null;
    for (const section of sections) {
      const heading = section.match(/^## (.+)/)?.[1] || "";
      const plain = section
        .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#*`>|]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const haystack = (doc.title + " " + heading + " " + plain).toLowerCase();
      if (!terms.every((t) => haystack.includes(t))) continue;
      const rank = terms.reduce(
        (n, t) =>
          n +
          (doc.title.toLowerCase().includes(t) ? 8 : 0) +
          (heading.toLowerCase().includes(t) ? 5 : 0),
        0,
      );
      const start = Math.max(0, plain.toLowerCase().indexOf(terms[0]) - 50);
      const hit = {
        ...doc,
        section: heading,
        href: pathFor(doc.slug) + (heading ? "#" + idFor(heading) : ""),
        excerpt:
          (start ? "…" : "") +
          plain.slice(start, start + 190) +
          (plain.length > start + 190 ? "…" : ""),
        rank,
      };
      if (!best || hit.rank > best.rank) best = hit;
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => b.rank - a.rank).slice(0, 15);
}

export function rehypeSearchHighlights({ query = "" } = {}) {
  const terms = query.trim().slice(0, 120).split(/\s+/).filter(Boolean);
  if (!terms.length) return () => {};
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp("(" + escaped.join("|") + ")", "gi"),
    exact = new RegExp("^(?:" + escaped.join("|") + ")$", "i");
  return (tree) => {
    const walk = (node) => {
      if (!node.children || node.tagName === "mark") return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") {
          walk(child);
          return [child];
        }
        return child.value
          .split(pattern)
          .filter(Boolean)
          .map((value) =>
            exact.test(value)
              ? {
                  type: "element",
                  tagName: "mark",
                  properties: { className: ["docs-search-hit"] },
                  children: [{ type: "text", value }],
                }
              : { type: "text", value },
          );
      });
    };
    walk(tree);
  };
}
