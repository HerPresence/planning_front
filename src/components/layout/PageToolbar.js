import React from "react";

function PageToolbar({ title, subtitle, actions, className }) {
  return (
    <div className={`card-top${className ? ` ${className}` : ""}`}>
      {(title || subtitle) && (
        <div className="card-title-block">
          {title && <h2>{title}</h2>}
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
      {actions && <div className="actions-row">{actions}</div>}
    </div>
  );
}

export default PageToolbar;
