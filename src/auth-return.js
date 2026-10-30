const key = "devdevian-conversation-return";
// A same-tab OAuth return is a short-lived, strictly local conversation path.
// Never accept an arbitrary URL, scheme-relative address or app redirect here.
export function validConversationReturn(path) {
  return (
    typeof path === "string" &&
    path.length <= 1200 &&
    /^\/conversation\/[1-9]\d{0,14}\/[\p{L}\p{N}%_-]+\?reply=1(?:&reply_to=[1-9]\d{0,14})?#reply$/u.test(
      path,
    ) &&
    !/%(?:2f|5c|0[ad])/i.test(path)
  );
}
export function rememberConversationReturn(path) {
  if (!validConversationReturn(path)) return;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ path, expires: Date.now() + 15 * 60 * 1000 }),
    );
  } catch {
    /* Sign-in still works when storage is unavailable. */
  }
}
export function takeConversationReturn() {
  try {
    const data = JSON.parse(sessionStorage.getItem(key) || "null");
    sessionStorage.removeItem(key);
    return data &&
      data.expires > Date.now() &&
      data.expires <= Date.now() + 15 * 60 * 1000 &&
      validConversationReturn(data.path)
      ? data.path
      : null;
  } catch {
    return null;
  }
}
export function clearConversationReturn() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Optional navigation state. */
  }
}
