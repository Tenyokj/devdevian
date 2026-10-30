// Shared by server rendering and browser sharing; private conversations keep
// their authenticated app route and never acquire a public document URL.
export function conversationId(value) {
  const text = String(value ?? "");
  return /^[1-9]\d{0,14}$/.test(text) && Number.isSafeInteger(Number(text))
    ? Number(text)
    : null;
}
export function conversationSlug(title) {
  return (
    Array.from(
      String(title || "conversation")
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, ""),
    )
      .slice(0, 80)
      .join("")
      .replace(/-$/, "") || "conversation"
  );
}
export function conversationPath(post) {
  const id = conversationId(post?.id);
  if (!id) return null;
  return post.community_id
    ? "/app#post/" + id
    : `/conversation/${id}/${encodeURIComponent(conversationSlug(post.title))}`;
}
