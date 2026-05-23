import React, { useCallback, useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import { getRoles, createRole, updateRole, toggleRole } from "../api/rolesApi";

function RolesPage() {
  const [records,      setRecords]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [success,      setSuccess]      = useState(null);

  const [search,       setSearch]       = useState("");
  const [filterActive, setFilterActive] = useState("all");

  const [showModal,    setShowModal]    = useState(false);
  const [editId,       setEditId]       = useState(null);
  const [formName,     setFormName]     = useState("");
  const [formDesc,     setFormDesc]     = useState("");
  const [formError,    setFormError]    = useState(null);
  const [saving,       setSaving]       = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await getRoles());
    } catch {
      setError("Помилка завантаження ролей");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = records.filter((r) => {
    if (filterActive === "active"   && !r.is_active) return false;
    if (filterActive === "inactive" &&  r.is_active) return false;
    if (search && !r.role_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCreate = () => {
    setEditId(null); setFormName(""); setFormDesc(""); setFormError(null); setShowModal(true);
  };

  const openEdit = (rec) => {
    setEditId(rec.id); setFormName(rec.role_name); setFormDesc(rec.description || "");
    setFormError(null); setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setFormError(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name) { setFormError("Назва ролі обов'язкова"); return; }
    setSaving(true); setFormError(null);
    try {
      if (editId) {
        await updateRole(editId, { role_name: name, description: formDesc.trim() });
        setSuccess(`Роль «${name}» оновлено`);
      } else {
        await createRole({ role_name: name, description: formDesc.trim() });
        setSuccess(`Роль «${name}» створено`);
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
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} «${rec.role_name}»?`)) return;
    try {
      await toggleRole(rec.id);
      setSuccess(`«${rec.role_name}» ${rec.is_active ? "деактивовано" : "активовано"}`);
      await loadAll();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Помилка зміни статусу");
    }
  };

  const columns = [
    {
      key: "id",
      header: "ID",
      style: { width: 50, color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" },
    },
    {
      key: "role_name",
      header: "Назва ролі",
      style: { fontWeight: 500 },
    },
    {
      key: "description",
      header: "Опис",
      style: { color: "var(--text-secondary)" },
    },
    {
      key: "_status",
      header: "Статус",
      style: { width: 110 },
      render: (r) => (
        <span className={`status ${r.is_active ? "active" : "inactive"}`}>
          {r.is_active ? "Активна" : "Неактивна"}
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
          <button className="icon-btn edit" onClick={() => openEdit(r)} title="Редагувати">✎</button>
          <button
            className={`icon-btn ${r.is_active ? "delete" : "edit"}`}
            onClick={() => handleToggle(r)}
            title={r.is_active ? "Деактивувати" : "Активувати"}
            style={{ marginLeft: 4 }}
            disabled={r.role_name === "Admin"}
          >
            {r.is_active ? "✕" : "✓"}
          </button>
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
      placeholder: "Назва ролі...",
    },
  ];

  const totalActive   = records.filter((r) =>  r.is_active).length;
  const totalInactive = records.filter((r) => !r.is_active).length;

  return (
    <DataCard
      title="Ролі"
      subtitle="Групи прав доступу. Кожен користувач може мати кілька ролей."
      actions={
        <Button variant="primary" onClick={openCreate}>+ Додати роль</Button>
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
            ? "За вказаними фільтрами ролей не знайдено"
            : "Немає жодної ролі. Натисніть «+ Додати роль»."
        }
      />

      {showModal && (
        <Modal
          title={editId ? "Редагувати роль" : "Нова роль"}
          onClose={closeModal}
        >
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-field full">
                <label>Назва ролі *</label>
                <input
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Наприклад: Viewer, Editor, Manager..."
                  required
                />
              </div>
              <div className="form-field full">
                <label>Опис</label>
                <input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Короткий опис ролі..."
                />
              </div>
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
    </DataCard>
  );
}

export default RolesPage;
