import React from "react";

function PageHeader({ title, subtitle, children }) {
  return (
    <header className="header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="header-actions">{children}</div>
    </header>
  );
}

export default PageHeader;