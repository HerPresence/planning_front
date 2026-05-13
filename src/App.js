import React, { useState } from "react";
import "./styles/theme.css";

import Sidebar from "./components/layout/Sidebar";
import PageHeader from "./components/layout/PageHeader";

import ArticlesPage from "./pages/ArticlesPage";
import ImportSourcesPage from "./pages/ImportSourcesPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import HoldingsPage from "./pages/HoldingsPage";
import OrganizationsPage from "./pages/OrganizationsPage";
import RegionsPage from "./pages/RegionsPage";
import BranchesPage from "./pages/BranchesPage";
import SourcesPage from "./pages/SourcesPage";
import PnlStructurePage from "./pages/PnlStructurePage";
import PnlDataPage from "./pages/PnlDataPage";
import PnlImportPage from "./pages/PnlImportPage";

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

      case "holdings":
        return <HoldingsPage setActivePage={setActivePage} />;

      case "organizations":
        return <OrganizationsPage setActivePage={setActivePage} />;

      case "regions":
        return <RegionsPage setActivePage={setActivePage} />;

      case "branches":
        return <BranchesPage setActivePage={setActivePage} />;

      case "sources":
        return <SourcesPage setActivePage={setActivePage} />;

      case "pnlStructure":
        return <PnlStructurePage setActivePage={setActivePage} />;

      case "pnlData":
        return <PnlDataPage setActivePage={setActivePage} />;

      case "pnlImport":
        return <PnlImportPage />;

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

      case "holdings":
        return "Холдинги";

      case "organizations":
        return "Організації";

      case "regions":
        return "Регіони";

      case "branches":
        return "Філії";

      case "sources":
        return "Джерела";

      case "pnlStructure":
        return "Структура PnL";

      case "pnlData":
        return "План / Факт PnL";

      case "pnlImport":
        return "Імпорт PnL";

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

      case "pnlData":
        return "Керування плановими та фактичними даними PnL";

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