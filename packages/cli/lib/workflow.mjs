import { clean } from "./client.mjs";
// Steps only organize local input. The existing full validation/preview still gates writes.
export function formSteps(form, fields) {
  let groups;
  if (form.kind === "publication")
    groups = [
      ["About", ["kind", "title", "topic", "community_id"]],
      ["Content", ["file", "lines", "review_focus", "demo_url", "body"]],
    ];
  else if (form.kind === "catalog")
    groups =
      form.entity === "project"
        ? [
            ["Basics", ["name", "tagline", "topic", "stage", "stack"]],
            ["Story", ["description", "help", "problem", "audience"]],
            ["People & links", ["url", "repo", "team", "links"]],
            ["Images", ["logo", "screenshots"]],
          ]
        : [
            [
              "Schedule",
              ["title", "topic", "local_start", "timezone", "duration"],
            ],
            ["Details", ["url", "description", "links"]],
            ["Banner", ["banner"]],
          ];
  else return [];
  return groups
    .map(([label, keys]) => ({
      label,
      indexes: fields.flatMap((field, i) =>
        keys.includes(field.key) ? [i] : [],
      ),
    }))
    .filter((step) => step.indexes.length);
}
export function stepAt(steps, active, length) {
  return Math.max(
    0,
    active === length
      ? steps.length - 1
      : steps.findIndex((step) => step.indexes.includes(active)),
  );
}
export const rowText = (row) =>
  clean(
    typeof row === "string"
      ? row
      : (row.text ?? row.spans?.map((s) => s.text).join("") ?? ""),
  );
export function readingMatches(rows, query) {
  const term = clean(query).normalize("NFKC").toLocaleLowerCase();
  return term
    ? rows.flatMap((row, i) =>
        rowText(row).normalize("NFKC").toLocaleLowerCase().includes(term)
          ? [i]
          : [],
      )
    : [];
}
export function nextReadingMatch(matches, offset, direction = 1) {
  if (!matches.length) return offset;
  return direction > 0
    ? (matches.find((n) => n > offset) ?? matches[0])
    : ([...matches].reverse().find((n) => n < offset) ?? matches.at(-1));
}
export class ReadingMemory {
  constructor(limit = 80) {
    this.limit = limit;
    this.items = new Map();
  }
  save(key, offset, rows) {
    this.items.delete(key);
    this.items.set(key, { offset, anchor: rowText(rows[offset] || "") });
    while (this.items.size > this.limit)
      this.items.delete(this.items.keys().next().value);
  }
  restore(key, rows, height) {
    const entry = this.items.get(key);
    if (!entry) return 0;
    let offset = entry.offset;
    if (entry.anchor && rowText(rows[offset] || "") !== entry.anchor) {
      const found = rows.findIndex((row) => rowText(row) === entry.anchor);
      if (found >= 0) offset = found;
    }
    return Math.max(0, Math.min(offset, rows.length - height));
  }
  clear() {
    this.items.clear();
  }
}
