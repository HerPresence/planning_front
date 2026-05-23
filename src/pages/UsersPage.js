import React, { useCallback, useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";
import { useAuth } from "../contexts/AuthContext";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import { getUsers, createUser, updateUser, toggleUser, resetUserPassword, getUserScope, setUserScope } from "../api/usersApi";
import { getRoles } from "../api/rolesApi";
import { getHoldings } from "../api/holdingsApi";
import { getOrganizations } from "../api/organizationsApi";
import { getRegions } from "../api/regionsApi";
import { getBranches } from "../api/branchesApi";
import { getDepartments } from "../api/departmentsApi";

function UsersPage() {
  const { canEdit, canCreate } = usePagePermission("users");
  const { currentUser } = useAuth();
  const [records,       setRecords]      = useState([]);
  const [allRoles,      setAllRoles]     = useState([]);
  const [loading,       setLoading]      = useState(false);
  const [error,         setError]        = useState(null);
  const [success,       setSuccess]      = useState(null);

  const [search,        setSearch]       = useState("");
  const [filterActive,  setFilterActive] = useState("all");

  const [showModal,     setShowModal]    = useState(false);
  const [editId,        setEditId]       = useState(null);
  const [formName,      setFormName]     = useState("");
  const [formEmail,     setFormEmail]    = useState("");
  const [formPassword,  setFormPassword] = useState("");
  const [formRoleIds,   setFormRoleIds]  = useState([]);
  const [formError,     setFormError]    = useState(null);
  const [saving,        setSaving]       = useState(false);

  const [showResetModal,      setShowResetModal]      = useState(false);
  const [resetTargetUser,     setResetTargetUser]     = useState(null);
  const [resetNewPw,          setResetNewPw]          = useState("");
  const [resetConfirmPw,      setResetConfirmPw]      = useState("");
  const [resetForce,          setResetForce]          = useState(true);
  const [resetError,          setResetError]          = useState(null);
  const [resetSaving,         setResetSaving]         = useState(false);

  const [showScopeModal,  setShowScopeModal]  = useState(false);
  const [scopeUser,       setScopeUser]       = useState(null);
  const [scopeRules,      setScopeRules]      = useState([]);
  const [scopeNewType,    setScopeNewType]    = useState("holding");
  const [scopeNewValue,   setScopeNewValue]   = useState("");
  const [scopeNewCanEdit, setScopeNewCanEdit] = useState(false);
  const [scopeDimData,    setScopeDimData]    = useState({});
  const [scopeLoading,    setScopeLoading]    = useState(false);
  const [scopeSaving,     setScopeSaving]     = useState(false);
  const [scopeError,      setScopeError]      = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [users, roles] = await Promise.all([getUsers(), getRoles()]);
      setRecords(users);
      setAllRoles(roles.filter((r) => r.is_active));
    } catch {
      setError("Помилка завантаження даних");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = records.filter((r) => {
    if (filterActive === "active"   && !r.is_active) return false;
    if (filterActive === "inactive" &&  r.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.full_name.toLowerCase().includes(q) &&
        !r.email.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const openCreate = () => {
    setEditId(null);
    setFormName(""); setFormEmail(""); setFormPassword(""); setFormRoleIds([]);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (rec) => {
    setEditId(rec.id);
    setFormName(rec.full_name);
    setFormEmail(rec.email);
    setFormPassword("");
    setFormRoleIds(rec.role_ids || []);
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setFormError(null); };

  const openResetModal = (rec) => {
    setResetTargetUser(rec);
    setResetNewPw(""); setResetConfirmPw(""); setResetForce(true); setResetError(null);
    setShowResetModal(true);
  };
  const closeResetModal = () => { setShowResetModal(false); setResetError(null); };

  const SCOPE_TYPES = [
    { value: "holding",      label: "Холдинг",      field: "holding_name" },
    { value: "organization", label: "Організація",  field: "organization_name" },
    { value: "region",       label: "Регіон",       field: "region_name" },
    { value: "branch",       label: "Філія",        field: "branch_name" },
    { value: "department",   label: "Підрозділ",    field: "department_name" },
  ];

  const openScopeModal = async (rec) => {
    setScopeUser(rec);
    setScopeRules([]);
    setScopeNewType("holding");
    setScopeNewValue("");
    setScopeNewCanEdit(false);
    setScopeError(null);
    setShowScopeModal(true);
    setScopeLoading(true);
    try {
      const [scope, holdings, orgs, regions, branches, depts] = await Promise.all([
        getUserScope(rec.id),
        getHoldings(),
        getOrganizations(),
        getRegions(),
        getBranches(),
        getDepartments(),
      ]);
      setScopeRules(scope.map((s) => ({ ...s, can_edit: !!s.can_edit })));
      setScopeDimData({
        holding:      holdings.map((x) => x.holding_name).filter(Boolean),
        organization: orgs.map((x) => x.organization_name).filter(Boolean),
        region:       regions.map((x) => x.region_name).filter(Boolean),
        branch:       branches.map((x) => x.branch_name).filter(Boolean),
        department:   depts.map((x) => x.department_name).filter(Boolean),
      });
    } catch {
      setScopeError("Помилка завантаження даних");
    } finally {
      setScopeLoading(false);
    }
  };

  const closeScopeModal = () => { setShowScopeModal(false); setScopeError(null); };

  const addScopeRule = () => {
    if (!scopeNewValue.trim()) return;
    const exists = scopeRules.some(
      (r) => r.scope_type === scopeNewType && r.scope_value === scopeNewValue.trim()
    );
    if (exists) return;
    setScopeRules((prev) => [...prev, { scope_type: scopeNewType, scope_value: scopeNewValue.trim(), can_edit: scopeNewCanEdit }]);
    setScopeNewValue("");
    setScopeNewCanEdit(false);
  };

  const removeScopeRule = (idx) => {
    setScopeRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleScopeCanEdit = (idx) => {
    setScopeRules((prev) => prev.map((r, i) => i === idx ? { ...r, can_edit: !r.can_edit } : r));
  };

  const handleScopeTypeChange = (type) => {
    setScopeNewType(type);
    setScopeNewValue("");
  };

  const handleScopeSave = async () => {
    setScopeSaving(true);
    setScopeError(null);
    try {
      await setUserScope(scopeUser.id, scopeRules.map(({ scope_type, scope_value, can_edit }) => ({ scope_type, scope_value, can_edit: !!can_edit })));
      setSuccess(`Обмеження даних для «${scopeUser.full_name}» збережено`);
      closeScopeModal();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setScopeError(typeof detail === "string" ? detail : "Помилка збереження");
    } finally {
      setScopeSaving(false);
    }
  };

  const handleResetSave = async (e) => {
    e.preventDefault();
    if (resetNewPw !== resetConfirmPw) { setResetError("Паролі не співпадають"); return; }
    setResetSaving(true); setResetError(null);
    try {
      await resetUserPassword(resetTargetUser.id, {
        new_password: resetNewPw,
        confirm_password: resetConfirmPw,
        force_change_password: resetForce,
      });
      setSuccess(`Пароль для «${resetTargetUser.full_name}» скинуто`);
      closeResetModal();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setResetError(typeof detail === "string" ? detail : "Помилка скидання пароля");
    } finally {
      setResetSaving(false);
    }
  };

  const toggleRoleId = (roleId) => {
    setFormRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name  = formName.trim();
    const email = formEmail.trim();
    if (!name)  { setFormError("ПІБ обов'язкове"); return; }
    if (!email) { setFormError("Email обов'язковий"); return; }
    if (!editId && formPassword.length < 6) { setFormError("Пароль мінімум 6 символів"); return; }
    setSaving(true); setFormError(null);
    try {
      if (editId) {
        await updateUser(editId, { full_name: name, email, role_ids: formRoleIds });
        setSuccess(`Користувача «${name}» оновлено`);
      } else {
        await createUser({ full_name: name, email, password: formPassword, role_ids: formRoleIds });
        setSuccess(`Користувача «${name}» створено`);
      }
      closeModal();
      await loadAll();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setFormError(typeof detail === "string" ? detail : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rec) => {
    const action = rec.is_active ? "деактивувати" : "активувати";
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} «${rec.full_name}»?`)) return;
    try {
      await toggleUser(rec.id);
      setSuccess(`«${rec.full_name}» ${rec.is_active ? "деактивовано" : "активовано"}`);
      await loadAll();
    } catch {
      setError("Помилка зміни статусу");
    }
  };

  const columns = [
    {
      key: "id",
      header: "ID",
      style: { width: 50, color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" },
    },
    {
      key: "full_name",
      header: "ПІБ",
      style: { fontWeight: 500 },
    },
    {
      key: "email",
      header: "Email",
      style: { color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 13 },
    },
    {
      key: "_roles",
      header: "Ролі",
      render: (r) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(r.roles || []).map((role) => (
            <span key={role} className="role-badge">{role}</span>
          ))}
        </div>
      ),
    },
    {
      key: "_status",
      header: "Статус",
      style: { width: 110 },
      render: (r) => (
        <span className={`status ${r.is_active ? "active" : "inactive"}`}>
          {r.is_active ? "Активний" : "Неактивний"}
        </span>
      ),
    },
    {
      key: "_actions",
      header: "Дії",
      thStyle: { textAlign: "center", width: 100 },
      style:   { textAlign: "center", whiteSpace: "nowrap" },
      render: (r) => (
        <>
          {canEdit && <button className="icon-btn edit" onClick={() => openEdit(r)} title="Редагувати">✎</button>}
          {canEdit && (
            <button
              className="icon-btn"
              onClick={() => openResetModal(r)}
              title="Скинути пароль"
              style={{ marginLeft: 4, color: "var(--info)", borderColor: "var(--info-border)" }}
            >
              🔑
            </button>
          )}
          {canEdit && (
            <button
              className="icon-btn"
              onClick={() => openScopeModal(r)}
              title="Обмеження даних"
              style={{ marginLeft: 4, color: "var(--warning, #b45309)", borderColor: "var(--warning-border, #fcd34d)" }}
            >
              🗂
            </button>
          )}
          {canEdit && (
            <button
              className={`icon-btn ${r.is_active ? "delete" : "edit"}`}
              onClick={() => handleToggle(r)}
              title={r.is_active ? "Деактивувати" : "Активувати"}
              style={{ marginLeft: 4 }}
            >
              {r.is_active ? "✕" : "✓"}
            </button>
          )}
        </>
      ),
    },
  ];

  const toolbar = [
    {
      key: "status",
      type: "select",
      label: "Статус",
      value: filterActive,
      onChange: setFilterActive,
      options: [
        { value: "all",      label: "Всі"       },
        { value: "active",   label: "Активні"   },
        { value: "inactive", label: "Неактивні" },
      ],
    },
    {
      key: "search",
      type: "search",
      label: "Пошук",
      value: search,
      onChange: setSearch,
      placeholder: "ПІБ або email...",
    },
  ];

  const totalActive   = records.filter((r) =>  r.is_active).length;
  const totalInactive = records.filter((r) => !r.is_active).length;

  return (
    <DataCard
      title="Користувачі"
      subtitle="Керування обліковими записами системи."
      actions={
        (canEdit || canCreate) && <Button variant="primary" onClick={openCreate}>+ Додати користувача</Button>
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

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="kpi-card kpi-total" style={{ minWidth: 120, flex: "0 1 auto" }}>
          <div className="kpi-value">{records.length}</div>
          <div className="kpi-label">Всього</div>
        </div>
        <div className="kpi-card kpi-mapped" style={{ minWidth: 120, flex: "0 1 auto" }}>
          <div className="kpi-value">{totalActive}</div>
          <div className="kpi-label">Активних</div>
        </div>
        <div className="kpi-card" style={{ minWidth: 120, flex: "0 1 auto", borderLeftColor: "var(--gray-400)" }}>
          <div className="kpi-value" style={{ color: "var(--text-muted)" }}>{totalInactive}</div>
          <div className="kpi-label">Неактивних</div>
        </div>
      </div>

      <TableToolbar filters={toolbar} />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        rowClassName={(r) => (!r.is_active ? "row-inactive" : "")}
        loading={loading}
        emptyMessage={
          search || filterActive !== "all"
            ? "За вказаними фільтрами записів не знайдено"
            : "Немає жодного користувача. Натисніть «+ Додати користувача»."
        }
      />

      {showModal && (
        <Modal
          title={editId ? "Редагувати користувача" : "Новий користувач"}
          onClose={closeModal}
        >
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-field full">
                <label>ПІБ *</label>
                <input
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Іванов Іван Іванович"
                  required
                />
              </div>
              <div className="form-field full">
                <label>Email *</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              {!editId && (
                <div className="form-field full">
                  <label>Пароль * (мін. 6 символів)</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              )}
              {allRoles.length > 0 && (
                <div className="form-field full">
                  <label>Ролі</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 4 }}>
                    {allRoles
                      .filter((role) => currentUser?.is_admin || role.role_name !== "Admin")
                      .map((role) => (
                        <label key={role.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 400 }}>
                          <input
                            type="checkbox"
                            checked={formRoleIds.includes(role.id)}
                            onChange={() => toggleRoleId(role.id)}
                          />
                          {role.role_name}
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>
            {formError && (
              <div className="error-message" style={{ marginTop: 12, marginBottom: 0 }}>
                {formError}
              </div>
            )}
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={closeModal}>Скасувати</Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Збереження..." : editId ? "Зберегти" : "Створити"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {showResetModal && (
        <Modal
          title={`Скинути пароль — ${resetTargetUser?.full_name}`}
          onClose={closeResetModal}
        >
          <form onSubmit={handleResetSave}>
            <div className="form-grid">
              <div className="form-field full">
                <label>Новий пароль *</label>
                <input
                  autoFocus
                  type="password"
                  value={resetNewPw}
                  onChange={(e) => { setResetNewPw(e.target.value); setResetError(null); }}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="form-field full">
                <label>Підтвердження пароля *</label>
                <input
                  type="password"
                  value={resetConfirmPw}
                  onChange={(e) => { setResetConfirmPw(e.target.value); setResetError(null); }}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="form-field full">
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={resetForce}
                    onChange={(e) => setResetForce(e.target.checked)}
                  />
                  Вимагати зміну пароля при наступному вході
                </label>
              </div>
            </div>
            {resetError && (
              <div className="error-message" style={{ marginTop: 12, marginBottom: 0 }}>{resetError}</div>
            )}
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={closeResetModal}>Скасувати</Button>
              <Button variant="primary" type="submit" disabled={resetSaving}>
                {resetSaving ? "Збереження..." : "Зберегти"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {showScopeModal && (
        <Modal
          title={`Обмеження даних — ${scopeUser?.full_name}`}
          onClose={closeScopeModal}
        >
          {scopeLoading ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>Завантаження...</div>
          ) : (
            <>
              <p style={{ marginTop: 0, marginBottom: 12, color: "var(--text-secondary)", fontSize: 13 }}>
                {scopeRules.length === 0
                  ? "Обмежень немає — користувач бачить та редагує всі дані."
                  : "Перегляд та редагування обмежені правилами нижче. Правило дозволяє перегляд; «Ред.» — також запис."}
              </p>

              {scopeRules.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-secondary, #f8f9fa)" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Тип</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>Значення</th>
                      <th style={{ padding: "6px 8px", textAlign: "center", width: 70, borderBottom: "1px solid var(--border)" }}>Перегляд</th>
                      <th style={{ padding: "6px 8px", textAlign: "center", width: 60, borderBottom: "1px solid var(--border)" }}>Ред.</th>
                      <th style={{ padding: "6px 8px", width: 36, borderBottom: "1px solid var(--border)" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopeRules.map((rule, idx) => {
                      const typeLabel = SCOPE_TYPES.find((t) => t.value === rule.scope_type)?.label || rule.scope_type;
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border-light, #eee)" }}>
                          <td style={{ padding: "5px 8px" }}>{typeLabel}</td>
                          <td style={{ padding: "5px 8px", fontFamily: "var(--font-mono)", fontSize: 12 }}>{rule.scope_value}</td>
                          <td style={{ padding: "5px 8px", textAlign: "center" }}>
                            <span style={{ color: "var(--success, #16a34a)", fontWeight: 600 }}>✓</span>
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={!!rule.can_edit}
                              onChange={() => toggleScopeCanEdit(idx)}
                              title="Дозволити редагування"
                              style={{ cursor: "pointer", width: 15, height: 15 }}
                            />
                          </td>
                          <td style={{ padding: "5px 8px", textAlign: "center" }}>
                            <button
                              className="icon-btn delete"
                              onClick={() => removeScopeRule(idx)}
                              title="Видалити правило"
                              style={{ fontSize: 11 }}
                            >✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div style={{ background: "var(--bg-secondary, #f8f9fa)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", marginBottom: 4 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, fontWeight: 500 }}>Додати правило</div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: "0 0 130px" }}>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Тип</label>
                    <select
                      value={scopeNewType}
                      onChange={(e) => handleScopeTypeChange(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13 }}
                    >
                      {SCOPE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Значення</label>
                    {(scopeDimData[scopeNewType] || []).length > 0 ? (
                      <select
                        value={scopeNewValue}
                        onChange={(e) => setScopeNewValue(e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13 }}
                      >
                        <option value="">— оберіть —</option>
                        {(scopeDimData[scopeNewType] || [])
                          .filter((v) => !scopeRules.some((r) => r.scope_type === scopeNewType && r.scope_value === v))
                          .map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                      </select>
                    ) : (
                      <input
                        value={scopeNewValue}
                        onChange={(e) => setScopeNewValue(e.target.value)}
                        placeholder="Введіть значення..."
                        style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, boxSizing: "border-box" }}
                      />
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 2 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer", fontWeight: 400, whiteSpace: "nowrap" }}>
                      <input
                        type="checkbox"
                        checked={scopeNewCanEdit}
                        onChange={(e) => setScopeNewCanEdit(e.target.checked)}
                        style={{ width: 14, height: 14 }}
                      />
                      Ред.
                    </label>
                  </div>
                  <Button variant="secondary" onClick={addScopeRule} disabled={!scopeNewValue.trim()}>
                    + Додати
                  </Button>
                </div>
              </div>

              {scopeError && (
                <div className="error-message" style={{ marginTop: 12, marginBottom: 0 }}>{scopeError}</div>
              )}
              <div className="modal-actions">
                <Button variant="secondary" type="button" onClick={closeScopeModal}>Скасувати</Button>
                <Button variant="primary" onClick={handleScopeSave} disabled={scopeSaving}>
                  {scopeSaving ? "Збереження..." : "Зберегти"}
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </DataCard>
  );
}

export default UsersPage;
