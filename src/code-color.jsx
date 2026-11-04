import React, { useMemo } from "react";
import { codeTokens } from "./code-tokens.mjs";
import "./code-color.css";
export function useCodeTokens(code, path = "") {
  return useMemo(() => codeTokens(code || "", path), [code, path]);
}
export function CodeTokens({ tokens, text = "" }) {
  return (
    <>
      {tokens?.length
        ? tokens.map((token, i) => (
            <span key={i} className={token.classes}>
              {token.text}
            </span>
          ))
        : text || " "}
    </>
  );
}
