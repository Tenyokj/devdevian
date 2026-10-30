import React, { useEffect, useRef } from "react";

// Keep native details semantics, including keyboard activation, while animating
// the measured height in both directions. Rapid clicks reverse from the current size.
export default function FAQItem({ children, ...props }) {
  const element = useRef(null);
  const animation = useRef(null);
  const desired = useRef(false);
  useEffect(() => () => animation.current?.cancel(), []);
  const toggle = (event) => {
    if (!event.target.closest("summary")) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !element.current.animate
    )
      return;
    event.preventDefault();
    const node = element.current;
    const start = node.getBoundingClientRect().height;
    desired.current = animation.current ? !desired.current : !node.open;
    animation.current?.cancel();
    node.open = true;
    const end = desired.current
      ? node.scrollHeight
      : node.querySelector("summary").getBoundingClientRect().height;
    node.style.overflow = "hidden";
    const current = node.animate(
      [{ height: start + "px" }, { height: end + "px" }],
      { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    animation.current = current;
    current.onfinish = () => {
      if (animation.current !== current) return;
      node.open = desired.current;
      node.style.overflow = "";
      animation.current = null;
    };
  };
  return (
    <details {...props} ref={element} onClick={toggle}>
      {children}
    </details>
  );
}
