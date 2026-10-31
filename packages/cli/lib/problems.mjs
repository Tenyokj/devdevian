import { clean } from "./client.mjs";
export function problemMessage(error) {
  const detail = clean(error.message || "Unexpected error.");
  if (error.status === 401)
    return "Session expired or revoked. Ctrl+L reconnects; your draft is kept locally.";
  if (error.status === 403)
    return (
      "Access denied. Check your community membership or account permissions. " +
      detail
    );
  if (error.status === 404)
    return (
      "Content unavailable: it may have been removed or is private. Esc goes back. " +
      detail
    );
  if (error.status === 429)
    return (
      "Rate limit reached. Wait before trying again; writes are not retried automatically. " +
      detail
    );
  if (error.status >= 500)
    return (
      "Server temporarily unavailable. Shift+R retries a view; check before retrying a write. " +
      detail
    );
  if (error.code === "NETWORK" || error.code === "TIMEOUT")
    return detail + " Shift+R retries a view. Your draft remains editable.";
  return detail;
}

// Script commands need shell instructions, not shortcuts for the live workspace.
export function commandProblemMessage(error) {
  const detail = clean(error.message || "Unexpected error.");
  if (error.status === 401)
    return "Session expired or revoked. Run devdevian login to reconnect; local drafts are kept.";
  if (
    error.code === "NETWORK" ||
    error.code === "TIMEOUT" ||
    error.status >= 500
  )
    return (
      detail +
      " Run devdevian doctor to check the connection. Before retrying a write, check whether it was already published."
    );
  if (error.status === 429)
    return (
      detail +
      " Wait before trying again. Requests are not retried automatically."
    );
  return detail;
}
