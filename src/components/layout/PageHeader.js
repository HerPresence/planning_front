import React from "react";

function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      {children && <div className="actions-row">{children}</div>}
    </header>
  );
}

export default PageHeader;