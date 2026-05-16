import React from "react";
import LoadingState from "./LoadingState";
import EmptyState from "./EmptyState";
import Pagination from "../ui/Pagination";

// Column descriptor:
// {
//   key        — unique id (also used as row[key] for default cell value)
//   header     — column header text
//   render     — optional (row) => ReactNode  (overrides default row[key])
//   style      — td style object
//   thStyle    — th style object
//   cellTitle  — optional (row) => string  — sets title attribute on td
// }
//
// pagination: { page, pageSize, total, onChange } — optional
// rowKey: string field name OR (row, index) => key
// rowClassName: (row) => className string
// onRowClick: (row) => void — makes rows clickable
// stickyHeader: bool (default true)
// compact: bool (default true)

function DataTable({
  columns,
  rows,
  rowKey,
  rowClassName,
  onRowClick,
  loading,
  emptyMessage,
  stickyHeader = true,
  compact = true,
  pagination,
}) {
  if (loading) return <LoadingState />;
  if (!rows || rows.length === 0) return <EmptyState message={emptyMessage} />;

  const wrapClass = stickyHeader ? "table-wrap-sticky" : "table-wrap";
  const tableClass = `data-table${compact ? " compact" : ""}`;

  const getKey = (row, i) => {
    if (typeof rowKey === "function") return rowKey(row, i);
    if (typeof rowKey === "string")   return row[rowKey];
    return i;
  };

  return (
    <>
      <div className={wrapClass}>
        <table className={tableClass}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={col.thStyle}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const key       = getKey(row, i);
              const className = rowClassName ? rowClassName(row) : undefined;
              return (
                <tr
                  key={key}
                  className={className}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: "pointer" } : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={col.style}
                      title={col.cellTitle ? col.cellTitle(row) : undefined}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination && (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onChange={pagination.onChange}
        />
      )}
    </>
  );
}

export default DataTable;
