import React from "react";

function PageHeader({ title, subtitle, children, userInfo, onLogout, onProfile }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {children && <div className="actions-row">{children}</div>}

        {userInfo && (
          <div className="user-info-bar">
            <span className="user-info-name">{userInfo.full_name}</span>
            {userInfo.is_admin && <span className="role-badge">Admin</span>}
            {onProfile && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={onProfile}
                title="Мій профіль"
              >
                Профіль
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={onLogout} title="Вийти">
              Вийти
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default PageHeader;
