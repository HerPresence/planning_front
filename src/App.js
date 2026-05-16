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
import ArticleImportPage from "./pages/ArticleImportPage";

function App() {
  const [activePage, setActivePage] = useState("articles");

  // Params for importSources navigation (tab + pre-selected source)
  const [importInitialTab,      setImportInitialTab]      = useState("sources");
  const [importInitialSourceId, setImportInitialSourceId] = useState("");

  const navigateTo = (page, params = {}) => {
    if (page === "importSources") {
      setImportInitialTab(params.tab || "sources");
      setImportInitialSourceId(params.sourceId || "");
    }
    setActivePage(page);
  };

  const renderPage = () => {
    switch (activePage) {
      case "articles":
        return <ArticlesPage setActivePage={navigateTo} />;

      case "importSources":
        return (
          <ImportSourcesPage
            setActivePage={navigateTo}
            initialTab={importInitialTab}
            initialSourceId={importInitialSourceId}
          />
        );

      case "departments":
        return <DepartmentsPage setActivePage={navigateTo} />;

      case "holdings":
        return <HoldingsPage setActivePage={navigateTo} />;

      case "organizations":
        return <OrganizationsPage setActivePage={navigateTo} />;

      case "regions":
        return <RegionsPage setActivePage={navigateTo} />;

      case "branches":
        return <BranchesPage setActivePage={navigateTo} />;

      case "sources":
        return <SourcesPage setActivePage={navigateTo} />;

      case "pnlStructure":
        return <PnlStructurePage setActivePage={navigateTo} />;

      case "pnlData":
        return <PnlDataPage setActivePage={navigateTo} />;

      case "pnlImport":
        return <PnlImportPage />;

      case "articleImport":
        return <ArticleImportPage setActivePage={navigateTo} />;

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
      case "articles":            return "Довідник статей PnL";
      case "importSources":       return "Відповідність полів імпорту";
      case "departments":         return "Підрозділи";
      case "holdings":            return "Холдинги";
      case "organizations":       return "Організації";
      case "regions":             return "Регіони";
      case "branches":            return "Філії";
      case "sources":             return "Джерела";
      case "pnlStructure":        return "Структура PnL";
      case "pnlData":             return "План / Факт PnL";
      case "pnlImport":           return "Імпорт PnL";
      case "articleImport":       return "Імпорт статей PnL";
      default:                    return "Система планування";
    }
  };

  const getSubtitle = () => {
    switch (activePage) {
      case "articles":            return "Керування статтями";
      case "importSources":       return "Мапінг колонок Google Sheets / Excel";
      case "departments":         return "Керування довідником підрозділів";
      case "pnlData":             return "Керування плановими та фактичними даними PnL";
      default:                    return "";
    }
  };

  return (
    <div className="app">
      <Sidebar activePage={activePage} setActivePage={navigateTo} />

      <main className="main">
        <PageHeader title={getTitle()} subtitle={getSubtitle()} />

        {renderPage()}
      </main>
    </div>
  );
}

export default App;
