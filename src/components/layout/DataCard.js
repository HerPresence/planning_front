import React from "react";
import PageToolbar from "./PageToolbar";

function DataCard({ children, title, subtitle, actions, className }) {
  const hasHeader = title || subtitle || actions;
  return (
    <section className={`content-card${className ? ` ${className}` : ""}`}>
      {hasHeader && (
        <PageToolbar title={title} subtitle={subtitle} actions={actions} />
      )}
      {children}
    </section>
  );
}

export default DataCard;
