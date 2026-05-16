import React from "react";

function EmptyState({ message, icon }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <div className="empty-state-message">
        {message || "Даних не знайдено"}
      </div>
    </div>
  );
}

export default EmptyState;
