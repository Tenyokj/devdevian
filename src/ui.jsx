import { createPortal } from "react-dom";
import { TaxonomyPicker } from "./controls";
import React, { useEffect, useRef, lazy, Suspense } from "react";
import { X, ArrowUpRight, ArrowRight, Code2 } from "lucide-react";
const MarkdownContent = lazy(() => import("./markdown.jsx"));
export function Brand() {
  return (
    <a href="#feed" className="brand" aria-label="Devdevian home">
      <img className="brand-logo" src="/devdevian-logo.png" alt="" />
      <span>
        devdevian<span className="brand-period">.</span>
      </span>
    </a>
  );
}
export function Avatar({ name = "D", size = "", onClick, image }) {
  const colors = ["purple", "blue", "green", "orange", "pink"];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  const props = {
    className: `avatar ${image ? "has-image" : color} ${size}`,
    title: name,
    children: image ? (
      <img src={"/api/uploads/" + image} alt="" />
    ) : (
      name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    ),
  };
  return onClick ? (
    <button {...props} onClick={onClick} />
  ) : (
    <span {...props} />
  );
}
export function MD({ children }) {
  return (
    <Suspense
      fallback={<div className="markdown">Loading formatted content…</div>}
    >
      <MarkdownContent>{children}</MarkdownContent>
    </Suspense>
  );
}
export function Empty({
  icon: Icon = Code2,
  title,
  description,
  action,
  onClick,
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={26} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button primary" onClick={onClick}>
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
export function PageTitle({ eyebrow, title, description, action, onClick }) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && (
        <button className="button primary" onClick={onClick}>
          {action}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = "",
  dismissible = true,
}) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const target = ref.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (
      target.querySelector('input:not([type="hidden"]),textarea') ||
      target.querySelector("button")
    )?.focus();
    const handle = (e) => {
      if (
        ref.current?.parentElement !==
        document
          .querySelectorAll("[data-modal-overlay]")
          .item(document.querySelectorAll("[data-modal-overlay]").length - 1)
      )
        return;
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const elements = [
          ...target.querySelectorAll(
            'button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]',
          ),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handle);
      previous?.focus?.();
    };
  }, [dismissible]);
  return createPortal(
    <div
      className="modal-overlay"
      data-modal-overlay
      onClick={dismissible ? onClose : undefined}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide " : "") + className}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <span className="eyebrow">DEVDEVIAN / {title}</span>
          {dismissible && (
            <button
              className="icon-button"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
          )}
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorMessage({ error }) {
  return error ? (
    <div className="form-error" role="alert">
      {error}
    </div>
  ) : null;
}
export function TopicSelect({
  communities,
  defaultValue = "web",
  name = "topic",
}) {
  return (
    <TaxonomyPicker
      initial={communities}
      defaultValue={defaultValue}
      name={name}
    />
  );
}
