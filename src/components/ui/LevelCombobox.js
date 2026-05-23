import React, { useState } from "react";

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
    <div className="ss-wrap">
      <input
        type="text"
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Пошук або введіть назву..."}
        disabled={disabled}
        autoComplete="off"
        className={`ss-input${disabled ? " ss-input-disabled" : ""}`}
      />

      {showDropdown && (
        <div className="ss-dropdown">
          {filtered.slice(0, 80).map((o) => (
            <div
              key={o.id}
              onMouseDown={() => handleSelect(o.name)}
              className="ss-option"
            >
              {o.name}
            </div>
          ))}

          {showAdd && (
            <div
              onMouseDown={handleAdd}
              className={`ss-add-option${adding ? " ss-add-option-loading" : ""}`}
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
