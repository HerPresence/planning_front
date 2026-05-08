import React from "react";

function Sidebar({ activePage, setActivePage }) {
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
        <div
          className={activePage === "home" ? "menu-item active" : "menu-item"}
          onClick={() => setActivePage("home")}
        >
          📊 Головна
        </div>

        <div className="menu-section">Довідники</div>

        <div
          className={activePage === "articles" ? "menu-item active" : "menu-item"}
          onClick={() => setActivePage("articles")}
        >
          📄 Статті PnL
        </div>

        <div
          className={
            activePage === "importSources" ? "menu-item active" : "menu-item"
          }
          onClick={() => setActivePage("importSources")}
        >
          🔗 Відповідність
        </div>

        <div
          className={activePage === "departments" ? "menu-item active" : "menu-item"}
          onClick={() => setActivePage("departments")}
        >
          🏢 Підрозділи
        </div>

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

        <div className="menu-item" onClick={() => setActivePage("pnl")}>
          📈 PnL
        </div>

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