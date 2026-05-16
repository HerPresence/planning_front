import React from "react";

function Pagination({ page, pageSize, total, onChange }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const rangeSet = new Set([1, totalPages]);
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    rangeSet.add(i);
  }
  const pages = [...rangeSet].sort((a, b) => a - b);

  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <button className="pg-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹
      </button>

      {pages.map((p, i) => {
        const prev = pages[i - 1];
        return (
          <React.Fragment key={p}>
            {prev && p - prev > 1 && <span className="pg-ellipsis">…</span>}
            <button
              className={`pg-btn${page === p ? " pg-active" : ""}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          </React.Fragment>
        );
      })}

      <button className="pg-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        ›
      </button>

      <span className="pg-info">
        {start}–{end} з {total}
      </span>
    </div>
  );
}

export default Pagination;
