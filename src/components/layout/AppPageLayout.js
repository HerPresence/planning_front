import React from "react";

// Thin wrapper that enforces consistent page slot ordering.
// Slots: header (DataCard title area), kpi, toolbar, children, footer.
function AppPageLayout({ header, kpi, toolbar, children, footer, className }) {
  return (
    <div className={className}>
      {header}
      {kpi}
      {toolbar}
      {children}
      {footer}
    </div>
  );
}

export default AppPageLayout;
