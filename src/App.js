import React, { useState } from "react";
import "./styles/theme.css";

import Sidebar from "./components/layout/Sidebar";
import PageHeader from "./components/layout/PageHeader";

import ArticlesPage from "./pages/ArticlesPage";
import ImportSourcesPage from "./pages/ImportSourcesPage";
import DepartmentsPage from "./pages/DepartmentsPage";

function App() {
  const [activePage, setActivePage] = useState("articles");

  const renderPage = () => {
    switch (activePage) {
      case "articles":
        return <ArticlesPage setActivePage={setActivePage} />;

      case "importSources":
        return <ImportSourcesPage setActivePage={setActivePage} />;

      case "departments":
        return <DepartmentsPage setActivePage={setActivePage} />;

      default:
        return (
          <section className="content-card">
            <h2>Розділ у розробці</h2>
          </section>
        );
    }
  };

  const getTitle = () => {
    switch (activePage) {
      case "articles":
        return "Довідник статей PnL";

      case "importSources":
        return "Відповідність полів імпорту";

      case "departments":
        return "Підрозділи";

      default:
        return "Система планування";
    }
  };

  const getSubtitle = () => {
    switch (activePage) {
      case "articles":
        return "Керування статтями";

      case "importSources":
        return "Мапінг колонок Google Sheets / Excel";

      case "departments":
        return "Керування довідником підрозділів";

      default:
        return "";
    }
  };

  return (
    <div className="app">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      <main className="main">
        <PageHeader title={getTitle()} subtitle={getSubtitle()} />

        {renderPage()}
      </main>
    </div>
  );
}

export default App;