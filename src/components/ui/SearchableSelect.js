import React, { useState } from "react";

export default function SearchableSelect({
  options,
  value,
  onChange,
  getOptionValue,
  getOptionLabel,
  getSearchText,
  placeholder,
  disabled,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value
    ? options.find((o) => String(getOptionValue(o)) === String(value))
    : null;
  const displayText = selected ? getOptionLabel(selected) : "";

  const filtered = query.trim()
    ? options.filter((o) => {
        const hay = (
          getOptionLabel(o) + (getSearchText ? " " + getSearchText(o) : "")
        ).toLowerCase();
        return hay.includes(query.toLowerCase());
      })
    : options;

  const handleSelect = (opt) => {
    onChange(String(getOptionValue(opt)));
    setOpen(false);
    setQuery("");
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    if (!e.target.value) onChange("");
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={open ? query : displayText}
        onChange={handleChange}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Пошук..."}
        disabled={disabled}
        autoComplete="off"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "7px 10px",
          border: "1px solid #ddd",
          borderRadius: 4,
          fontSize: 14,
        }}
      />
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: 4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          maxHeight: 220,
          overflowY: "auto",
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "8px 12px", color: "#999", fontSize: 13 }}>
              Нічого не знайдено
            </div>
          ) : (
            filtered.slice(0, 100).map((opt) => {
              const val = String(getOptionValue(opt));
              const isSelected = String(value) === val;
              return (
                <div
                  key={val}
                  onMouseDown={() => handleSelect(opt)}
                  style={{
                    padding: "7px 12px",
                    fontSize: 14,
                    cursor: "pointer",
                    background: isSelected ? "#e8f4fd" : "transparent",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f7ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "#e8f4fd" : "transparent"; }}
                >
                  {getOptionLabel(opt)}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
