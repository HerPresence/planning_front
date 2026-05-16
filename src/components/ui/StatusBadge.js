import React from "react";

export const STATUS_LABELS = {
  pending:  { label: "Не прив'язано", color: "#856404", bg: "#fff8e1" },
  mapped:   { label: "Прив'язано",    color: "#155724", bg: "#d4edda" },
  auto:     { label: "Авто",          color: "#004085", bg: "#cce5ff" },
  rejected: { label: "Відхилено",     color: "#721c24", bg: "#f8d7da" },
};

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.pending;
  return (
    <span
      className="status-badge"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}44` }}
    >
      {s.label}
    </span>
  );
}

export default StatusBadge;
