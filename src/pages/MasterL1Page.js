import React, { useEffect, useState, useCallback } from "react";
import { usePagePermission } from "../hooks/usePagePermission";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import {
  getMasterL1List,
  createMasterL1,
  updateMasterL1,
  toggleMasterL1,
} from "../api/masterL1Api";
import { getMasterL2List } from "../api/masterL2Api";

function MasterL1Page() {
  const { canEdit } = usePagePermission("masterL1");

  const [records,      setRecords]      = useState([]);
  const [l2Options,    setL2Options]    = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [success,      setSuccess]      = useState(null);

  const [search,       setSearch]       = useState("");
  const [filterActive, setFilterActive] = useState("all");
  const [filterL2,     setFilterL2]     = useState("");

  const [showModal,    setShowModal]    = useState(false);
  const [editId,       setEditId]       = useState(null);
  const [formName,     setFormName]     = useState("");
  const [formL2Id,     setFormL2Id]     = useState("");
  const [formError,    setFormError]    = useState(null);
  const [saving,       setSaving]       = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l1data, l2data] = await Promise.all([
        getMasterL1List(null, true),
        getMasterL2List(false),
      ]);
      setRecords(l1data);
      setL2Options(l2data);
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
    if (filterL2 && String(r.level2_id) !== filterL2) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !(r.level2_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const openCreate = () => {
    setEditId(null);
    setFormName("");
    setFormL2Id(filterL2 || "");
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (rec) => {
    setEditId(rec.id);
    setFormName(rec.name);
    setFormL2Id(String(rec.level2_id));
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setFormError(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name)     { setFormError("Назва не може бути порожньою"); return; }
    if (!formL2Id) { setFormError("Оберіть Master L2"); return; }
    setSaving(true);
    setFormError(null);
    try {
      if (editId) {
        await updateMasterL1(editId, name, Number(formL2Id));
        setSuccess(`Master L1 «${name}» оновлено`);
      } else {
        const res = await createMasterL1(Number(formL2Id), name);
        if (res.created === false) {
          setFormError(`Master L1 «${name}» вже існує в цьому Master L2`);
          return;
        }
        setSuccess(`Master L1 «${name}» створено`);
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
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} «${rec.name}»?`)) return;
    try {
      await toggleMasterL1(rec.id);
      setSuccess(`«${rec.name}» ${rec.is_active ? "деактивовано" : "активовано"}`);
      await loadAll();
    } catch {
      setError("Помилка зміни статусу");
    }
  };

  const columns = [
    {
      key: "id",
      header: "ID",
      style: { width: 60, color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" },
    },
    {
      key: "level2_name",
      header: "Master L2",
      style: { maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-secondary)" },
    },
    {
      key: "name",
      header: "Назва Master L1",
      style: { fontWeight: 500 },
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
      thStyle: { textAlign: "center", width: 140 },
      style:   { textAlign: "center", whiteSpace: "nowrap" },
      render: (r) => (
        <>
          {canEdit && <button className="icon-btn edit" onClick={() => openEdit(r)} title="Редагувати">✎</button>}
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

  const l2FilterOptions = [
    { value: "", label: "Всі Master L2" },
    ...l2Options.map((l) => ({ value: String(l.id), label: l.name })),
  ];

  const toolbar = [
    {
      key: "l2",
      type: "select",
      label: "Master L2",
      value: filterL2,
      onChange: setFilterL2,
      options: l2FilterOptions,
    },
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
      placeholder: "Назва або Master L2...",
    },
  ];

  const totalActive   = records.filter((r) =>  r.is_active).length;
  const totalInactive = records.filter((r) => !r.is_active).length;

  return (
    <DataCard
      title="Довідник Master L1"
      subtitle="Підгрупи, прив'язані до Master L2. Використовуються при класифікації статей PnL."
      actions={
        <Button variant="primary" onClick={openCreate}>
          + Додати Master L1
        </Button>
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
          search || filterActive !== "all" || filterL2
            ? "За вказаними фільтрами записів не знайдено"
            : "Немає жодного запису Master L1. Натисніть «+ Додати Master L1»."
        }
      />

      {showModal && (
        <Modal
          title={editId ? "Редагувати Master L1" : "Новий Master L1"}
          onClose={closeModal}
        >
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-field full">
                <label>Master L2 (батьківська група) *</label>
                <select
                  value={formL2Id}
                  onChange={(e) => setFormL2Id(e.target.value)}
                  required
                >
                  <option value="">— Оберіть Master L2 —</option>
                  {l2Options.map((l) => (
                    <option key={l.id} value={String(l.id)}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field full">
                <label>Назва Master L1 *</label>
                <input
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Введіть назву Master L1..."
                  required
                />
              </div>
            </div>
            {formError && (
              <div className="error-message" style={{ marginTop: 12, marginBottom: 0 }}>
                {formError}
              </div>
            )}
            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={closeModal}>
                Скасувати
              </Button>
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

export default MasterL1Page;
