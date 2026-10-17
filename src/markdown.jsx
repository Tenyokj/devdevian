import React, { useState, useEffect } from "react";
import { api } from "./data";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
function mentions() {
  return (tree) => {
    function walk(node) {
      if (["code", "inlineCode", "link", "linkReference"].includes(node.type))
        return;
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") {
          walk(child);
          return [child];
        }
        const parts = [];
        const re = /(^|\s)@([a-zA-Z][a-zA-Z0-9_]{2,29})\b/g;
        let last = 0,
          m;
        while ((m = re.exec(child.value))) {
          const start = m.index + m[1].length;
          if (start > last)
            parts.push({ type: "text", value: child.value.slice(last, start) });
          parts.push({
            type: "link",
            url: "#handle/" + m[2],
            children: [{ type: "text", value: "@" + m[2] }],
          });
          last = start + m[2].length + 1;
        }
        if (last < child.value.length)
          parts.push({ type: "text", value: child.value.slice(last) });
        return parts.length ? parts : [child];
      });
    }
    walk(tree);
  };
}
function Mention({ href, children }) {
  const [person, setPerson] = useState(null);
  useEffect(() => {
    let alive = true;
    api("/handles/" + encodeURIComponent(href.slice(8)))
      .then((p) => alive && setPerson(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [href]);
  return (
    <a
      className="inline-mention"
      href={person ? "#member/" + person.id : href}
      title={person?.name}
    >
      {person?.avatar && <img src={"/api/uploads/" + person.avatar} alt="" />}
      {children}
    </a>
  );
}
export default function MarkdownContent({ children }) {
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm, mentions]}
        rehypePlugins={[rehypeHighlight]}
        skipHtml
        components={{
          a: ({ node, ...props }) =>
            props.href?.startsWith("#handle/") ? (
              <Mention {...props} />
            ) : (
              <a
                {...props}
                target={props.href?.startsWith("#") ? undefined : "_blank"}
                rel="noopener noreferrer"
              />
            ),
          img: ({ node, ...props }) => (
            <img {...props} loading="lazy" referrerPolicy="no-referrer" />
          ),
        }}
      >
        {children || ""}
      </Markdown>
    </div>
  );
}
