import React from "react";

function Sidebar({ activePage, setActivePage }) {
  const item = (page, label, extra = []) => {
    const isActive = activePage === page || extra.includes(activePage);
    return (
      <div
        className={isActive ? "menu-item active" : "menu-item"}
        onClick={() => setActivePage(page)}
      >
        {label}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-top">
          <span>Pro</span>
          <span>Tec</span>
        </div>
        <div className="logo-bottom">LOGISTIC</div>
      </div>

      <nav className="menu">
        {item("home", "📊 Головна")}

        <div className="menu-section">Довідники</div>

        {/* Статті — highlighted when on articles, import, or mapping sub-pages */}
        {item("articles", "📄 Статті PnL", ["articleImport"])}

        {item("importSources", "🔗 Відповідність")}
        {item("departments",   "🏢 Підрозділи")}
        {item("holdings",      "🏢 Холдинги")}
        {item("organizations", "🏬 Організації")}
        {item("regions",       "🌍 Регіони")}
        {item("branches",      "🏪 Філії")}
        {item("sources",       "🧾 Джерела")}
        {item("pnlStructure",  "🧩 Структура PnL")}

        <div className="menu-item" onClick={() => setActivePage("clients")}>
          👥 Клієнти
        </div>
        <div className="menu-item" onClick={() => setActivePage("brands")}>
          🏷️ Бренди
        </div>

        <div className="menu-section">Планування</div>

        <div className="menu-item" onClick={() => setActivePage("cashflow")}>
          💰 БДДС
        </div>

        {item("pnlData",   "📊 План / Факт PnL")}
        {item("pnlImport", "📥 Імпорт PnL")}

        <div className="menu-item" onClick={() => setActivePage("budgets")}>
          📦 Бюджети витрат
        </div>

        <div className="menu-section">Адміністрування</div>

        <div className="menu-item" onClick={() => setActivePage("users")}>
          👤 Користувачі
        </div>
        <div className="menu-item" onClick={() => setActivePage("settings")}>
          ⚙️ Налаштування
        </div>
      </nav>
    </aside>
  );
}

export default Sidebar;
