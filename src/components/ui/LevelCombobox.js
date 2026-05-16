import React, { useState } from "react";

// Combobox for PnL Level 1 / Level 2 selection.
// Shows existing options as a searchable dropdown.
// If typed text has no exact match, shows "+ Додати ... у довідник" action.
//
// Props:
//   options    — [{ id, name }]
//   value      — current name string stored in form
//   onChange   — (name) => void   — every keystroke + on select
//   onSelect   — (name) => void   — only when user picks from dropdown (use to reset child)
//   onAdd      — async (name) => void — called when user clicks "+ Add"
//   disabled   — bool
//   placeholder
//   addLabel   — short description appended after «name», e.g. "у довідник Level 2"
export default function LevelCombobox({
  options,
  value,
  onChange,
  onSelect,
  onAdd,
  disabled,
  placeholder,
  addLabel,
}) {
  const [open,   setOpen]   = useState(false);
  const [adding, setAdding] = useState(false);

  const trimmed    = (value || "").trim();
  const filtered   = trimmed
    ? options.filter((o) => o.name.toLowerCase().includes(trimmed.toLowerCase()))
    : options;
  const exactMatch = options.some(
    (o) => o.name.toLowerCase() === trimmed.toLowerCase()
  );
  const showAdd      = trimmed.length > 0 && !exactMatch && !!onAdd;
  const showDropdown = open && !disabled && (filtered.length > 0 || showAdd);

  const handleSelect = (name) => {
    onChange(name);
    if (onSelect) onSelect(name);
    setOpen(false);
  };

  const handleAdd = async () => {
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      await onAdd(trimmed);
    } finally {
      setAdding(false);
      setOpen(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Пошук або введіть назву..."}
        disabled={disabled}
        autoComplete="off"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "11px",
          border: "1px solid #ccc",
          borderRadius: 7,
          fontSize: 14,
          fontFamily: "Arial, sans-serif",
          background: disabled ? "#f4f4f4" : "#fff",
          color: disabled ? "#aaa" : "#222",
        }}
      />

      {showDropdown && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 2px)",
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: 6,
          boxShadow: "0 4px 14px rgba(0,0,0,0.14)",
          maxHeight: 210,
          overflowY: "auto",
        }}>
          {filtered.slice(0, 80).map((o) => (
            <div
              key={o.id}
              onMouseDown={() => handleSelect(o.name)}
              style={{
                padding: "8px 12px",
                fontSize: 14,
                cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f7ff")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              {o.name}
            </div>
          ))}

          {showAdd && (
            <div
              onMouseDown={handleAdd}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                cursor: adding ? "default" : "pointer",
                color: adding ? "#999" : "#0366d6",
                fontWeight: 600,
                background: "#f0f7ff",
                borderTop: filtered.length > 0 ? "1px solid #e0e8f0" : "none",
              }}
            >
              {adding
                ? "Додавання..."
                : `+ Додати «${trimmed}» ${addLabel || "у довідник"}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
