import React from "react";

function Modal({ title, children, onClose, size = "normal" }) {
  return (
    <div className="modal-overlay">
      <div className={size === "large" ? "modal large" : "modal"}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

export default Modal;