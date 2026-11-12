import { validatePackage } from "../extension-package.mjs";
export const extensionDraftKey = (userId) =>
  `devdevian-extension-draft:v1:${userId}`;
const strings = {
  name: 60,
  slug: 48,
  version: 30,
  description: 1200,
  full_description: 20000,
  changelog: 10000,
  tags: 300,
};
function fields(value = {}) {
  const result = {};
  for (const [key, max] of Object.entries(strings))
    result[key] =
      typeof value[key] === "string" ? value[key].slice(0, max) : "";
  result.links = Array.isArray(value.links)
    ? value.links
        .slice(0, 5)
        .filter(
          (x) => x && typeof x.label === "string" && typeof x.url === "string",
        )
        .map((x) => ({ label: x.label.slice(0, 40), url: x.url.slice(0, 600) }))
    : [];
  result.screenshots = Array.isArray(value.screenshots)
    ? value.screenshots
        .filter((x) => typeof x === "string" && /^[-a-zA-Z0-9]{20,80}$/.test(x))
        .slice(0, 6)
    : [];
  return result;
}
export function readExtensionDraft(storage, userId) {
  if (!userId) return null;
  try {
    const saved = JSON.parse(storage.getItem(extensionDraftKey(userId)));
    if (!saved) return null;
    if (
      saved.version !== 1 ||
      !Number.isFinite(saved.savedAt) ||
      Date.now() - saved.savedAt > 30 * 86400000 ||
      saved.savedAt > Date.now() + 60000
    ) {
      storage.removeItem(extensionDraftKey(userId));
      return null;
    }
    const pkg = saved.pkg
      ? { manifest: validatePackage(saved.pkg.manifest) }
      : null;
    return { draft: fields(saved.draft), pkg };
  } catch {
    return null;
  }
}
export function saveExtensionDraft(storage, userId, draft, pkg) {
  if (!userId) return false;
  const data = fields(draft),
    meaningful =
      !!pkg ||
      Object.entries(data).some(([key, value]) =>
        key === "version"
          ? value && value !== "1.0.0"
          : Array.isArray(value)
            ? value.length
            : value.trim(),
      );
  try {
    if (!meaningful) storage?.removeItem?.(extensionDraftKey(userId));
    else
      storage.setItem(
        extensionDraftKey(userId),
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          draft: data,
          pkg: pkg ? { manifest: validatePackage(pkg.manifest) } : null,
        }),
      );
    return true;
  } catch {
    return false;
  }
}
// Survives in-app navigation without storing a privileged action in a URL.
const resume = new Set();
export function requestExtensionResume(userId) {
  if (resume.size >= 10) resume.clear();
  resume.add(userId);
}
export function consumeExtensionResume(userId) {
  return resume.delete(userId);
}
export function extensionDraftStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
