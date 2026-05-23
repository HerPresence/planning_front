import React, { useCallback, useEffect, useState } from "react";

import Button from "../components/ui/Button";
import DataCard from "../components/layout/DataCard";

import axios from "axios";
import { getRoles } from "../api/rolesApi";
import { getRolePermissions, updateRolePermissions } from "../api/permissionsApi";

const GROUP_LABELS = {
  directories: "Довідники",
  planning:    "Планування",
  admin:       "Адміністрування",
};

// Pages where editing existing records is admin-only (backend enforces this).
// Non-admins can receive can_create but NOT can_edit for these pages.
const ADMIN_ONLY_EDIT = new Set(["users", "roles", "permissions"]);

function PermissionsPage() {
  const [roles,       setRoles]       = useState([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [items,       setItems]       = useState([]);
  const [perms,       setPerms]       = useState({});
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [success,     setSuccess]     = useState(null);
  const [templates,   setTemplates]   = useState([]);
  const [tmplId,      setTmplId]      = useState("");
  const [applying,    setApplying]    = useState(false);

  useEffect(() => {
    axios.get("/api/admin/permission-templates")
      .then((r) => setTemplates(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getRoles()
      .then((data) => setRoles(data.filter((r) => r.is_active)))
      .catch(() => setError("Помилка завантаження ролей"));
  }, []);

  const loadPermissions = useCallback(async (roleId) => {
    if (!roleId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getRolePermissions(roleId);
      setItems(data);
      const map = {};
      data.forEach((p) => {
        map[p.menu_key] = { can_view: p.can_view, can_edit: p.can_edit, can_create: p.can_create ?? false };
      });
      setPerms(map);
    } catch {
      setError("Помилка завантаження прав доступу");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRoleChange = (e) => {
    const val = e.target.value;
    setSelectedRole(val);
    setSuccess(null);
    loadPermissions(val);
  };

  const handleViewChange = (menuKey, checked) => {
    setPerms((prev) => ({
      ...prev,
      [menuKey]: {
        can_view:   checked,
        can_edit:   checked ? prev[menuKey]?.can_edit   : false,
        can_create: checked ? prev[menuKey]?.can_create : false,
      },
    }));
  };

  const handleEditChange = (menuKey, checked) => {
    setPerms((prev) => ({
      ...prev,
      [menuKey]: {
        can_view:   checked ? true : prev[menuKey]?.can_view,
        can_edit:   checked,
        can_create: checked ? true : prev[menuKey]?.can_create,
      },
    }));
  };

  const handleCreateChange = (menuKey, checked) => {
    setPerms((prev) => ({
      ...prev,
      [menuKey]: {
        can_view:   checked ? true : prev[menuKey]?.can_view,
        can_edit:   prev[menuKey]?.can_edit ?? false,
        can_create: checked,
      },
    }));
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const permissions = items.map((item) => ({
        menu_key:   item.menu_key,
        can_view:   perms[item.menu_key]?.can_view   ?? false,
        can_edit:   perms[item.menu_key]?.can_edit   ?? false,
        can_create: perms[item.menu_key]?.can_create ?? false,
      }));
      await updateRolePermissions(selectedRole, permissions);
      setSuccess("Права доступу збережено");
    } catch {
      setError("Помилка збереження прав");
    } finally {
      setSaving(false);
    }
  };

  // Group items by parent_key
  const grouped = {};
  const ungrouped = [];
  items.forEach((item) => {
    if (!item.parent_key) {
      ungrouped.push(item);
    } else {
      if (!grouped[item.parent_key]) grouped[item.parent_key] = [];
      grouped[item.parent_key].push(item);
    }
  });
  const groupOrder = ["directories", "planning", "admin"];

  const renderRow = (item) => {
    const p = perms[item.menu_key] || { can_view: false, can_edit: false, can_create: false };
    const adminOnlyEdit = ADMIN_ONLY_EDIT.has(item.menu_key);
    return (
      <tr key={item.menu_key}>
        <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
          {item.parent_key ? GROUP_LABELS[item.parent_key] || item.parent_key : "—"}
        </td>
        <td style={{ fontWeight: 500 }}>{item.menu_name}</td>
        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{item.menu_key}</td>
        <td style={{ textAlign: "center" }}>
          <input
            type="checkbox"
            className="perm-checkbox"
            checked={p.can_view}
            onChange={(e) => handleViewChange(item.menu_key, e.target.checked)}
          />
        </td>
        <td style={{ textAlign: "center" }}>
          <input
            type="checkbox"
            className="perm-checkbox"
            checked={p.can_create}
            onChange={(e) => handleCreateChange(item.menu_key, e.target.checked)}
          />
        </td>
        <td style={{ textAlign: "center" }}>
          {adminOnlyEdit ? (
            <span
              title="Редагування існуючих записів — тільки для адміністратора системи"
              style={{
                display: "inline-block", fontSize: 10, color: "var(--text-muted)",
                border: "1px solid var(--border)", borderRadius: 3,
                padding: "1px 5px", cursor: "help", whiteSpace: "nowrap",
              }}
            >
              тільки адмін
            </span>
          ) : (
            <input
              type="checkbox"
              className="perm-checkbox"
              checked={p.can_edit}
              onChange={(e) => handleEditChange(item.menu_key, e.target.checked)}
            />
          )}
        </td>
      </tr>
    );
  };

  const renderGroupHeader = (label) => (
    <tr key={`hdr-${label}`} className="perm-group-header">
      <td colSpan={6} style={{ fontWeight: 700, color: "var(--brand)", fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", padding: "10px 12px 4px" }}>
        {label}
      </td>
    </tr>
  );

  const handleApplyTemplate = async () => {
    if (!selectedRole || !tmplId) return;
    setApplying(true); setError(null); setSuccess(null);
    try {
      await axios.post(`/api/admin/roles/${selectedRole}/apply-template/${tmplId}`);
      await loadPermissions(selectedRole);
      setSuccess(`Шаблон «${templates.find((t) => String(t.id) === tmplId)?.name}» застосовано. Перевірте та збережіть.`);
      setTmplId("");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Помилка застосування шаблону");
    } finally {
      setApplying(false);
    }
  };

  const selectedRoleName = roles.find((r) => String(r.id) === String(selectedRole))?.role_name || "";

  return (
    <DataCard
      title="Права доступу"
      subtitle="Налаштування прав для кожної ролі по розділах меню."
      actions={
        selectedRole && (
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Збереження..." : "Зберегти права"}
          </Button>
        )
      }
    >
      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c33", fontWeight: 700, fontSize: 16 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="success-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--success)", fontWeight: 700, fontSize: 16 }}>✕</button>
        </div>
      )}

      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <label style={{ fontWeight: 500, whiteSpace: "nowrap" }}>Оберіть роль:</label>
        <select
          value={selectedRole}
          onChange={handleRoleChange}
          style={{ minWidth: 220 }}
        >
          <option value="">— Виберіть роль —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.role_name}</option>
          ))}
        </select>
        {selectedRoleName && (
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Редагуємо права: <strong>{selectedRoleName}</strong>
          </span>
        )}
      </div>

      {selectedRole && templates.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", background: "var(--bg-secondary, #f8f9fa)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>Шаблон прав:</span>
          <select
            value={tmplId}
            onChange={(e) => setTmplId(e.target.value)}
            style={{ minWidth: 200, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13 }}
          >
            <option value="">— оберіть шаблон —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
            ))}
          </select>
          <Button variant="secondary" onClick={handleApplyTemplate} disabled={!tmplId || applying}>
            {applying ? "Застосування..." : "Застосувати"}
          </Button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Після застосування перевірте та натисніть «Зберегти права»</span>
        </div>
      )}

      {!selectedRole && (
        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
          Виберіть роль зі списку, щоб налаштувати права доступу
        </div>
      )}

      {selectedRole && loading && (
        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
          Завантаження...
        </div>
      )}

      {selectedRole && !loading && items.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table perm-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Розділ</th>
                <th>Пункт меню</th>
                <th style={{ width: 140 }}>Route</th>
                <th style={{ width: 90, textAlign: "center" }}>Перегляд</th>
                <th style={{ width: 90, textAlign: "center" }}>Створення</th>
                <th style={{ width: 100, textAlign: "center" }}>Редагування</th>
              </tr>
            </thead>
            <tbody>
              {ungrouped.map(renderRow)}
              {groupOrder.map((gk) =>
                grouped[gk]
                  ? [renderGroupHeader(GROUP_LABELS[gk] || gk), ...grouped[gk].map(renderRow)]
                  : null
              )}
            </tbody>
          </table>
        </div>
      )}
    </DataCard>
  );
}

export default PermissionsPage;
