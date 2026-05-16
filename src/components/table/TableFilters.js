import React from "react";

// Renders a list of filter controls (selects and search inputs).
// filters: [{
//   key, type ("select" | "search"), label,
//   value, onChange(value),
//   options: [{ value, label }],   // for type="select"
//   placeholder,                   // for type="search"
//   minWidth,
// }]
function TableFilters({ filters }) {
  if (!filters || filters.length === 0) return null;
  return (
    <>
      {filters.map((f, i) => (
        <div
          key={f.key || i}
          className={`filter-group${f.type === "search" ? " search-group" : ""}`}
          style={f.minWidth ? { minWidth: f.minWidth } : undefined}
        >
          <label>{f.label}</label>
          {f.type === "search" ? (
            <input
              type="text"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder || "Пошук..."}
            />
          ) : (
            <select value={f.value} onChange={(e) => f.onChange(e.target.value)}>
              {(f.options || []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </>
  );
}

export default TableFilters;
