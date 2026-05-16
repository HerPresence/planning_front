import React from "react";

function LoadingState({ message }) {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <span className="loading-message">{message || "Завантаження..."}</span>
    </div>
  );
}

export default LoadingState;
