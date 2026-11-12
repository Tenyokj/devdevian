// Listing metadata is stored separately from executable capabilities and remains
// immutable with its release. Screenshots reference owned uploads, never raw HTML.
export function validateListing(value = {}) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          "full_description",
          "tags",
          "links",
          "screenshots",
          "changelog",
        ].includes(k),
    )
  )
    throw Error("Invalid extension listing fields.");
  if (
    value.changelog !== undefined &&
    (typeof value.changelog !== "string" ||
      value.changelog.length > 10000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.changelog))
  )
    throw Error("Changelog must be text of at most 10,000 characters.");
  const full_description = value.full_description ?? "",
    tags = value.tags ?? [],
    links = value.links ?? [],
    screenshots = value.screenshots ?? [];
  if (
    typeof full_description !== "string" ||
    full_description.length > 20000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(full_description)
  )
    throw Error("Full description must be text of at most 20,000 characters.");
  if (
    !Array.isArray(tags) ||
    tags.length > 8 ||
    tags.some(
      (t) =>
        typeof t !== "string" || !/^#?[a-zA-Z0-9][a-zA-Z0-9._-]{1,29}$/.test(t),
    )
  )
    throw Error(
      "Use up to 8 tags, 2–30 letters, digits, dots, underscores or hyphens each.",
    );
  if (
    !Array.isArray(links) ||
    links.length > 5 ||
    links.some((link) => {
      if (
        !link ||
        typeof link !== "object" ||
        Object.keys(link).some((k) => !["label", "url"].includes(k)) ||
        typeof link.label !== "string" ||
        !link.label.trim() ||
        link.label.length > 40 ||
        typeof link.url !== "string" ||
        link.url.length > 600
      )
        return true;
      try {
        const u = new URL(link.url);
        return (
          u.protocol !== "https:" || !!u.username || !!u.password || !u.hostname
        );
      } catch {
        return true;
      }
    })
  )
    throw Error(
      "Use up to 5 labeled HTTPS links without embedded credentials.",
    );
  if (
    !Array.isArray(screenshots) ||
    screenshots.length > 6 ||
    new Set(screenshots).size !== screenshots.length ||
    screenshots.some(
      (id) => typeof id !== "string" || !/^[-a-zA-Z0-9]{20,80}$/.test(id),
    )
  )
    throw Error("Choose up to 6 uploaded images.");
  return {
    full_description: full_description.trim(),
    tags: [...new Set(tags.map((t) => t.replace(/^#/, "").toLowerCase()))],
    links: links.map((l) => ({ label: l.label.trim(), url: l.url })),
    screenshots,
    ...(value.changelog ? { changelog: value.changelog.trim() } : {}),
  };
}
