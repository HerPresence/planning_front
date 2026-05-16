import React from "react";

function PageSection({ children, className }) {
  return (
    <section className={`content-card${className ? ` ${className}` : ""}`}>
      {children}
    </section>
  );
}

export default PageSection;
