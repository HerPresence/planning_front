import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

const STORAGE_KEY = "planning_sidebar_groups";
const defaultGroups = { directories: true, planning: true, admin: false };

function loadGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") return { ...defaultGroups, ...saved };
  } catch {}
  return defaultGroups;
}

function Sidebar({ activePage, setActivePage }) {
  const { canView } = useAuth();
  const [groups, setGroups] = useState(loadGroups);

  const toggleGroup = (key) => {
    const next = { ...groups, [key]: !groups[key] };
    setGroups(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const item = (page, label, extra = []) => {
    if (!canView(page)) return null;
    const isActive = activePage === page || extra.includes(activePage);
    return (
      <div
        key={page}
        className={isActive ? "menu-item active" : "menu-item"}
        onClick={() => setActivePage(page)}
      >
        {label}
      </div>
    );
  };

  const GroupHeader = ({ groupKey, label }) => (
    <div className="menu-group-header" onClick={() => toggleGroup(groupKey)}>
      <span className="menu-group-label">{label}</span>
      <span className={`menu-group-arrow${groups[groupKey] ? " open" : ""}`}>▶</span>
    </div>
  );

  const dirItems = [
    item("articles",      "📄 Статті PnL",   ["articleImport"]),
    item("importSources", "🔗 Відповідність"),
    item("masterL2",      "📂 Master L2"),
    item("masterL1",      "📁 Master L1"),
    item("brands",        "🏷 Бренди"),
    item("departments",   "🏢 Підрозділи"),
    item("holdings",      "🏛 Холдинги"),
    item("organizations", "🏬 Організації"),
    item("regions",       "🌍 Регіони"),
    item("branches",      "🏪 Філії"),
    item("sources",       "🧾 Джерела"),
    item("pnlStructure",  "🧩 Структура PnL"),
  ].filter(Boolean);

  const planItems = [
    item("cashflow",      "💰 БДДС"),
    item("pnlData",       "📊 План / Факт PnL"),
    item("pnlImport",     "📥 Імпорт PnL"),
    item("factTurnover",  "🛒 Факт продажів"),
    item("budgets",       "📦 Бюджети витрат"),
  ].filter(Boolean);

  const adminItems = [
    item("users",       "👤 Користувачі"),
    item("roles",       "🔑 Ролі"),
    item("permissions", "🛡 Права доступу"),
    item("auditLog",    "📋 Журнал дій"),
    item("settings",    "⚙️ Налаштування"),
  ].filter(Boolean);

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-top">
          <span>Pro</span>
          <span>Tec</span>
        </div>
        <div className="logo-bottom">METRICORE</div>
      </div>

      <nav className="menu">
        {canView("home") && item("home", "📊 Головна")}

        {dirItems.length > 0 && (
          <>
            <GroupHeader groupKey="directories" label="Довідники" />
            {groups.directories && (
              <div className="menu-group-items">{dirItems}</div>
            )}
          </>
        )}

        {planItems.length > 0 && (
          <>
            <GroupHeader groupKey="planning" label="Планування" />
            {groups.planning && (
              <div className="menu-group-items">{planItems}</div>
            )}
          </>
        )}

        {adminItems.length > 0 && (
          <>
            <GroupHeader groupKey="admin" label="Адміністрування" />
            {groups.admin && (
              <div className="menu-group-items">{adminItems}</div>
            )}
          </>
        )}
      </nav>
    </aside>
  );
}

export default Sidebar;
