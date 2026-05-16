import React from "react";
import TableFilters from "./TableFilters";
import Button from "../ui/Button";

// Full filter + action toolbar above a table.
// filters   — array of filter descriptors (see TableFilters)
// pageSize  — { value, onChange, options? } — renders a rows-per-page selector
// actions   — [{ label, onClick, disabled?, variant?, title? }]
function TableToolbar({ filters, pageSize, actions }) {
  return (
    <div className="filter-bar">
      {filters && <TableFilters filters={filters} />}

      <div className="filter-actions">
        {pageSize && (
          <select
            className="page-size-select"
            value={pageSize.value}
            onChange={(e) => pageSize.onChange(Number(e.target.value))}
            title="Рядків на сторінку"
          >
            {(pageSize.options || [25, 50, 100]).map((n) => (
              <option key={n} value={n}>
                {n} / стор.
              </option>
            ))}
          </select>
        )}

        {(actions || []).map((action, i) => (
          <Button
            key={i}
            variant={action.variant || "secondary"}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default TableToolbar;
