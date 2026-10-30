import React from "react";
import { renderToString } from "react-dom/server";
import ConversationPage from "./conversation";
export function renderConversation(seed) {
  return renderToString(<ConversationPage seed={seed} />);
}
