// Keep legacy URL fields visible alongside labeled links, without repeating a URL.
export function conversationLinks(post = {}) {
  const seen = new Set();
  return [
    ...(post.links || []),
    ...(post.demo_url ? [{ label: "Demo", url: post.demo_url }] : []),
    ...(post.repo_url ? [{ label: "Repository", url: post.repo_url }] : []),
  ].filter((link) => {
    if (!link.url || seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}
