import React, { useState } from "react";
import "./styles/theme.css";

import { AuthProvider, useAuth } from "./contexts/AuthContext";

import Sidebar from "./components/layout/Sidebar";
import PageHeader from "./components/layout/PageHeader";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";

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
import FactTurnoverPage from "./pages/FactTurnoverPage";
import MasterL1Page from "./pages/MasterL1Page";
import MasterL2Page from "./pages/MasterL2Page";
import UsersPage from "./pages/UsersPage";
import RolesPage from "./pages/RolesPage";
import PermissionsPage from "./pages/PermissionsPage";
import AuditLogPage from "./pages/AuditLogPage";
import BrandsPage from "./pages/BrandsPage";
import ImportDataPage from "./pages/ImportDataPage";
import ArticleSourceMappingPage from "./pages/ArticleSourceMappingPage";
import BrandSourceMappingPage from "./pages/BrandSourceMappingPage";
import DepartmentSourceMappingPage from "./pages/DepartmentSourceMappingPage";

function AppContent() {
  const { currentUser, loading, logout, forceChangePassword } = useAuth();

  const [activePage, setActivePage] = useState("articles");

  const [importInitialTab,      setImportInitialTab]      = useState("sources");
  const [importInitialSourceId, setImportInitialSourceId] = useState("");
  const [deptMappingSourceId,   setDeptMappingSourceId]   = useState("");

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--text-muted)", fontSize: 16 }}>
        Завантаження...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  // Force password change — no sidebar, only the change form
  if (forceChangePassword) {
    return <ProfilePage forceMode={true} />;
  }

  const navigateTo = (page, params = {}) => {
    if (page === "importSources") {
      setImportInitialTab(params.tab || "sources");
      setImportInitialSourceId(params.sourceId || "");
    }
    if (page === "departmentSourceMapping") {
      setDeptMappingSourceId(params.sourceId || "");
    }
    setActivePage(page);
  };

  const renderPage = () => {
    switch (activePage) {
      case "profile":
        return <ProfilePage />;

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

      case "departments":    return <DepartmentsPage    setActivePage={navigateTo} />;
      case "holdings":       return <HoldingsPage       setActivePage={navigateTo} />;
      case "organizations":  return <OrganizationsPage  setActivePage={navigateTo} />;
      case "regions":        return <RegionsPage        setActivePage={navigateTo} />;
      case "branches":       return <BranchesPage       setActivePage={navigateTo} />;
      case "sources":        return <SourcesPage        setActivePage={navigateTo} />;
      case "pnlStructure":   return <PnlStructurePage   setActivePage={navigateTo} />;
      case "pnlData":        return <PnlDataPage        setActivePage={navigateTo} />;
      case "pnlImport":      return <PnlImportPage />;
      case "articleImport":  return <ArticleImportPage  setActivePage={navigateTo} />;
      case "factTurnover":   return <FactTurnoverPage />;
      case "masterL1":       return <MasterL1Page />;
      case "masterL2":       return <MasterL2Page />;
      case "users":          return <UsersPage />;
      case "roles":          return <RolesPage />;
      case "permissions":    return <PermissionsPage />;
      case "auditLog":       return <AuditLogPage />;
      case "brands":                return <BrandsPage />;
      case "importData":            return <ImportDataPage setActivePage={navigateTo} />;
      case "articleSourceMapping":  return <ArticleSourceMappingPage setActivePage={navigateTo} />;
      case "brandSourceMapping":      return <BrandSourceMappingPage />;
      case "departmentSourceMapping": return <DepartmentSourceMappingPage initialSourceId={deptMappingSourceId} setActivePage={navigateTo} />;

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
      case "profile":        return "Мій профіль";
      case "articles":       return "Довідник статей PnL";
      case "importSources":  return "Відповідність полів імпорту";
      case "departments":    return "Підрозділи";
      case "holdings":       return "Холдинги";
      case "organizations":  return "Організації";
      case "regions":        return "Регіони";
      case "branches":       return "Філії";
      case "sources":        return "Джерела";
      case "pnlStructure":   return "Структура PnL";
      case "pnlData":        return "План / Факт PnL";
      case "pnlImport":      return "Імпорт PnL";
      case "articleImport":  return "Імпорт статей PnL";
      case "factTurnover":   return "Факт товарообороту";
      case "masterL1":       return "Master L1";
      case "masterL2":       return "Master L2";
      case "users":          return "Користувачі";
      case "roles":          return "Ролі";
      case "permissions":    return "Права доступу";
      case "auditLog":       return "Журнал дій";
      case "brands":                return "Бренди";
      case "importData":            return "Імпорт даних";
      case "articleSourceMapping":  return "Відповідність статей";
      case "brandSourceMapping":      return "Відповідність брендів";
      case "departmentSourceMapping": return "Відповідність підрозділів";
      default:               return "Система планування";
    }
  };

  const getSubtitle = () => {
    switch (activePage) {
      case "profile":       return "Особисті дані та безпека облікового запису";
      case "articles":      return "Керування статтями";
      case "importSources": return "Мапінг колонок Google Sheets / Excel";
      case "departments":   return "Керування довідником підрозділів";
      case "pnlData":       return "Керування плановими та фактичними даними PnL";
      case "masterL1":      return "Підгрупи для класифікації статей PnL";
      case "masterL2":      return "Батьківські групи для Master L1";
      case "users":         return "Керування обліковими записами";
      case "roles":         return "Групи прав доступу";
      case "permissions":   return "Налаштування прав по розділах меню";
      case "auditLog":      return "Перегляд журналу дій користувачів";
      default:              return "";
    }
  };

  return (
    <div className="app">
      <Sidebar activePage={activePage} setActivePage={navigateTo} />

      <main className="main">
        <PageHeader
          title={getTitle()}
          subtitle={getSubtitle()}
          userInfo={currentUser}
          onLogout={logout}
          onProfile={() => navigateTo("profile")}
        />

        {renderPage()}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
