import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import DataCard from "../components/layout/DataCard";

const ACTION_LABELS = {
  login_success:     "Вхід",
  login_failed:      "Невдалий вхід",
  logout:            "Вихід",
  password_changed:  "Зміна пароля",
  password_reset:    "Скидання пароля",
  user_updated:      "Оновлення юзера",
  user_toggled:      "Активація/деактивація",
  permissions_updated: "Оновлення прав",
  sessions_revoked:  "Відкликання сесій",
  scope_updated:     "Обмеження даних",
};

function fmtDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleString("uk-UA", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function AuditLogPage() {
  const [items,    setItems]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [page,     setPage]     = useState(0);
  const limit = 50;

  const [fAction,   setFAction]   = useState("");
  const [fUser,     setFUser]     = useState("");
  const [fEntity,   setFEntity]   = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo,   setFDateTo]   = useState("");

  const load = useCallback(async (pg = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit, offset: pg * limit });
      if (fAction)   params.append("action",      fAction);
      if (fUser)     params.append("user_id",     fUser);
      if (fEntity)   params.append("entity_type", fEntity);
      if (fDateFrom) params.append("date_from",   fDateFrom);
      if (fDateTo)   params.append("date_to",     fDateTo);
      const res = await axios.get(`/api/admin/audit-log?${params}`);
      setItems(res.data.items);
      setTotal(res.data.total);
      setPage(pg);
    } catch {
      setError("Помилка завантаження журналу дій");
    } finally {
      setLoading(false);
    }
  }, [fAction, fUser, fEntity, fDateFrom, fDateTo]);

  useEffect(() => { load(0); }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <DataCard title="Журнал дій" subtitle="Аудит всіх дій в системі">
      {error && (
        <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Дія</label>
          <select
            value={fAction}
            onChange={(e) => setFAction(e.target.value)}
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, minWidth: 160 }}
          >
            <option value="">Всі дії</option>
            {Object.entries(ACTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>ID користувача</label>
          <input
            value={fUser}
            onChange={(e) => setFUser(e.target.value)}
            placeholder="напр. 5"
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, width: 100 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Тип сутності</label>
          <input
            value={fEntity}
            onChange={(e) => setFEntity(e.target.value)}
            placeholder="user, role..."
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, width: 120 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Від</label>
          <input
            type="date"
            value={fDateFrom}
            onChange={(e) => setFDateFrom(e.target.value)}
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>До</label>
          <input
            type="date"
            value={fDateTo}
            onChange={(e) => setFDateTo(e.target.value)}
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13 }}
          />
        </div>
        <button
          onClick={() => load(0)}
          style={{ padding: "7px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
        >
          Застосувати
        </button>
        <button
          onClick={() => { setFAction(""); setFUser(""); setFEntity(""); setFDateFrom(""); setFDateTo(""); }}
          style={{ padding: "7px 12px", background: "none", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
        >
          Скинути
        </button>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
        Знайдено: <strong>{total}</strong> записів
        {totalPages > 1 && ` · Сторінка ${page + 1} з ${totalPages}`}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Завантаження...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary, #f8f9fa)" }}>
                {["Час", "Користувач", "Дія", "Об'єкт", "ID об'єкта", "IP", "Деталі"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Записів не знайдено</td></tr>
              ) : items.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border-light, #eee)" }}>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    <div style={{ fontWeight: 500 }}>{row.user_email || "—"}</div>
                    {row.user_id && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>id:{row.user_id}</div>}
                  </td>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                      background: row.action?.includes("fail") || row.action?.includes("revok") ? "#fee2e2" : "#dbeafe",
                      color: row.action?.includes("fail") || row.action?.includes("revok") ? "#b91c1c" : "#1d4ed8",
                    }}>
                      {ACTION_LABELS[row.action] || row.action}
                    </span>
                  </td>
                  <td style={{ padding: "6px 10px", color: "var(--text-secondary)" }}>{row.entity_type || "—"}</td>
                  <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 12 }}>{row.entity_id ?? "—"}</td>
                  <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{row.ip_address || "—"}</td>
                  <td style={{ padding: "6px 10px", maxWidth: 200 }}>
                    {row.new_value ? (
                      <code style={{ fontSize: 11, background: "var(--bg-secondary, #f5f5f5)", padding: "2px 4px", borderRadius: 3, wordBreak: "break-all" }}>
                        {JSON.stringify(row.new_value)}
                      </code>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button onClick={() => load(0)}          disabled={page === 0}            style={pageBtnStyle(page === 0)}>«</button>
          <button onClick={() => load(page - 1)}   disabled={page === 0}            style={pageBtnStyle(page === 0)}>‹ Попередня</button>
          <button onClick={() => load(page + 1)}   disabled={page >= totalPages - 1} style={pageBtnStyle(page >= totalPages - 1)}>Наступна ›</button>
          <button onClick={() => load(totalPages - 1)} disabled={page >= totalPages - 1} style={pageBtnStyle(page >= totalPages - 1)}>»</button>
        </div>
      )}
    </DataCard>
  );
}

function pageBtnStyle(disabled) {
  return {
    padding: "5px 12px", border: "1px solid var(--border)", borderRadius: 4,
    background: disabled ? "var(--bg-secondary, #f5f5f5)" : "#fff",
    cursor: disabled ? "default" : "pointer", fontSize: 13,
    color: disabled ? "var(--text-muted)" : "var(--text-primary)",
  };
}

export default AuditLogPage;
