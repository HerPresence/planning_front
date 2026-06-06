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
  // Show stored value as fallback when no option matches (e.g. imported data with name mismatch)
  const displayText = selected ? getOptionLabel(selected) : ((!open && value) ? String(value) : "");

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
    <div className="ss-wrap">
      <input
        type="text"
        value={open ? query : displayText}
        onChange={handleChange}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Пошук..."}
        disabled={disabled}
        autoComplete="off"
        className="ss-input"
      />
      {open && (
        <div className="ss-dropdown">
          {filtered.length === 0 ? (
            <div className="ss-empty">Нічого не знайдено</div>
          ) : (
            filtered.slice(0, 100).map((opt) => {
              const val = String(getOptionValue(opt));
              const isSelected = String(value) === val;
              return (
                <div
                  key={val}
                  onMouseDown={() => handleSelect(opt)}
                  className={`ss-option${isSelected ? " ss-option-selected" : ""}`}
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
