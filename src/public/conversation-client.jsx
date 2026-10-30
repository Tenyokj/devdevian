import React from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import ConversationPage from "./conversation";
export function mountConversation() {
  const root = document.getElementById("root");
  const data = document.getElementById("conversation-data");
  if (!data) {
    root.innerHTML =
      '<main style="padding:10vh 8vw"><h1>Open this conversation through the Devdevian server.</h1><a href="/app">Open the forum</a></main>';
    return;
  }
  const page = <ConversationPage seed={JSON.parse(data.textContent)} />;
  if (root.dataset.prerender === "conversation") hydrateRoot(root, page);
  else createRoot(root).render(page);
}
if (!import.meta.env.SSR && document.getElementById("conversation-data"))
  mountConversation();
