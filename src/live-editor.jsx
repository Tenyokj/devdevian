import { tags } from "@lezer/highlight";
import React, { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
  bracketMatching,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
const languageExtension = (language) =>
  language === "python"
    ? python()
    : language === "json"
      ? json()
      : ["javascript", "typescript"].includes(language)
        ? javascript({ typescript: language === "typescript" })
        : [];
const colors = HighlightStyle.define([
  { tag: tags.keyword, color: "#cda0ff" },
  { tag: tags.string, color: "#f0c48a" },
  { tag: tags.number, color: "#80d6bd" },
  { tag: tags.bool, color: "#80d6bd" },
  { tag: tags.comment, color: "#8c9bb5", fontStyle: "italic" },
  { tag: tags.variableName, color: "#dce8ff" },
  { tag: tags.function(tags.variableName), color: "#83c5ff" },
  { tag: tags.typeName, color: "#7bd7e0" },
  { tag: tags.operator, color: "#c8d3e7" },
  { tag: tags.propertyName, color: "#aed2ff" },
]);
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "#111527",
    color: "#e6eaf5",
  },
  ".cm-scroller": {
    fontFamily: '"JetBrains Mono",ui-monospace,monospace',
    fontSize: "14px",
    lineHeight: "1.8",
  },
  ".cm-content": {
    padding: "18px 0",
    minHeight: "420px",
    caretColor: "var(--accent)",
  },
  ".cm-gutters": {
    backgroundColor: "#14182c",
    color: "#8f9bb4",
    borderRight: "1px solid var(--line)",
  },
  ".cm-line": { padding: "0 18px" },
  ".cm-activeLine": { backgroundColor: "rgb(var(--accent-rgb) / .06)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgb(var(--accent-rgb) / .22)",
  },
});
export function LiveEditor({ transport, language, editable }) {
  const root = useRef(null),
    view = useRef(null),
    permission = useRef(new Compartment());
  useEffect(() => {
    view.current = new EditorView({
      parent: root.current,
      state: EditorState.create({
        doc: transport.code.toString(),
        extensions: [
          lineNumbers(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          syntaxHighlighting(colors),
          languageExtension(language),
          editorTheme,
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap, indentWithTab]),
          permission.current.of([
            EditorState.readOnly.of(!editable),
            EditorView.editable.of(editable),
          ]),
          EditorState.transactionFilter.of((tr) =>
            tr.newDoc.length > 20000 ? [] : tr,
          ),
          yCollab(transport.code, transport.awareness),
          EditorView.contentAttributes.of({
            "aria-label": "Shared code editor",
            spellcheck: "false",
          }),
        ],
      }),
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [transport, language]);
  useEffect(() => {
    view.current?.dispatch({
      effects: permission.current.reconfigure([
        EditorState.readOnly.of(!editable),
        EditorView.editable.of(editable),
      ]),
    });
  }, [editable]);
  return <div className="live-code-editor" ref={root} />;
}
export function StaticCode({ code, language, label }) {
  const root = useRef(null);
  useEffect(() => {
    const view = new EditorView({
      parent: root.current,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          languageExtension(language),
          syntaxHighlighting(colors),
          editorTheme,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ "aria-label": label }),
        ],
      }),
    });
    return () => view.destroy();
  }, [code, language, label]);
  return <div className="live-code-editor" ref={root} />;
}
