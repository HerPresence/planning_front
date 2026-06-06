import React, { useState } from "react";

/**
 * Tiny inline copy button for table cells.
 * Props:
 *   value       — full text to copy (if falsy, renders nothing)
 *   style       — optional extra style overrides
 */
export default function CopyCellButton({ value, style }) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  const fallbackCopy = (text) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;top:0;left:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const text = String(value);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Скопійовано!" : `Копіювати: ${value}`}
      style={{
        flexShrink: 0,
        padding: "0 3px",
        height: 14,
        fontSize: 10,
        lineHeight: 1,
        border: `1px solid ${copied ? "#6ee7b7" : "#e2e8f0"}`,
        borderRadius: 3,
        background: copied ? "#d1fae5" : "#f8fafc",
        color: copied ? "#065f46" : "#94a3b8",
        cursor: "pointer",
        verticalAlign: "middle",
        transition: "border-color .12s, background .12s, color .12s",
        display: "inline-flex",
        alignItems: "center",
        ...style,
      }}
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}
