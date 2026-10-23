// Private text stays in this browser. Never put passwords, tokens or uploaded
// file references here. Account IDs and entry points isolate different drafts.
export function draftKey(userId, audience) {
  return `devdevian-draft:v1:${userId}:${audience || "public"}`;
}
export function readDraft(storage, key) {
  try {
    const saved = JSON.parse(storage.getItem(key));
    if (
      !saved ||
      saved.version !== 1 ||
      !Number.isFinite(saved.savedAt) ||
      saved.savedAt > Date.now() + 60000 ||
      Date.now() - saved.savedAt > 30 * 86400000
    ) {
      storage.removeItem(key);
      return null;
    }
    const data = saved.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const fields = {};
    for (const [name, max] of Object.entries({
      title: 160,
      body: 15000,
      code: 20000,
      review_focus: 1500,
      topic: 100,
      stack: 150,
      community_id: 100,
      kind: 20,
    })) {
      if (typeof data[name] === "string")
        fields[name] = data[name].slice(0, max);
    }
    fields.details = {
      links: Array.isArray(data.details?.links)
        ? data.details.links
            .slice(0, 20)
            .filter(
              (l) => typeof l?.label === "string" && typeof l?.url === "string",
            )
            .map((l) => ({
              label: l.label.slice(0, 100),
              url: l.url.slice(0, 1000),
            }))
        : [],
    };
    return fields;
  } catch {
    return null;
  }
}
export function saveDraft(storage, key, data) {
  const meaningful = [data.title, data.body, data.code, data.review_focus].some(
    (v) => typeof v === "string" && v.trim(),
  );
  if (!meaningful) storage.removeItem(key);
  else {
    const text = {};
    for (const name of [
      "title",
      "body",
      "code",
      "review_focus",
      "topic",
      "stack",
      "community_id",
      "kind",
    ])
      if (typeof data[name] === "string") text[name] = data[name];
    text.details = {
      links: (data.details?.links || []).map(({ label, url }) => ({
        label,
        url,
      })),
    };
    storage.setItem(
      key,
      JSON.stringify({ version: 1, savedAt: Date.now(), data: text }),
    );
  }
  return meaningful;
}
