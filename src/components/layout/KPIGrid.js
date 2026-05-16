import React from "react";

// cards: [{ label, value, variant }]
// variant: "total" | "pending" | "mapped" | "rejected" | undefined
function KPIGrid({ cards }) {
  if (!cards || cards.length === 0) return null;
  return (
    <div className="kpi-row">
      {cards.map((card, i) => (
        <div key={i} className={`kpi-card${card.variant ? ` kpi-${card.variant}` : ""}`}>
          <div className="kpi-value">{card.value ?? "—"}</div>
          <div className="kpi-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

export default KPIGrid;
