export function fieldGuidance(field, { wizard = false, project = false } = {}) {
  if (!field)
    return {
      detail: "",
      keys: wizard
        ? "Enter selects the highlighted action"
        : "Enter opens the preview",
    };
  let detail = field.hint || "";
  if (project && field.key === "help")
    detail =
      "Text and links are allowed. Dedicated links: People & links step.";
  if (["url", "repo", "demo_url"].includes(field.key) && !detail)
    detail = "Use a complete https:// or http:// URL.";
  if (["logo", "banner"].includes(field.key))
    return { detail, keys: "Ctrl+O selects an image · Tab next field" };
  if (field.key === "file")
    return { detail, keys: "Ctrl+O file · Ctrl+G Git diff · Tab next field" };
  const keys = field.options
    ? "← / → choose · Tab next field"
    : field.multiline
      ? "Space inserts a space · Enter adds a line · Tab next field"
      : "Space inserts a space · Enter / Tab next field";
  return { detail, keys };
}
export function stepControls(steps, index) {
  return [
    { id: "back", label: "← Back", enabled: index > 0 },
    {
      id: "next",
      label:
        index === steps.length - 1
          ? "Preview →"
          : "Next: " + steps[index + 1]?.label + " →",
      enabled: true,
    },
  ];
}
