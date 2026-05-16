import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import {
  getSources,
  createSource,
  updateSource,
  deactivateSource,
} from "../api/sourcesApi";

function SourcesPage({ setActivePage }) {
  const [sources,      setSources]      = useState([]);
  const [search,       setSearch]       = useState("");
  const [showModal,    setShowModal]    = useState(false);
  const [editSourceId, setEditSourceId] = useState(null);

  const emptyForm = { source_id: "", source_name: "", source_type: "", is_active: true };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadSources(); }, []);

  const loadSources = async () => {
    try {
      setSources(await getSources());
    } catch (err) {
      console.error("Помилка завантаження джерел:", err);
      alert("Помилка завантаження джерел");
    }
  };

  const openAddModal = () => {
    setEditSourceId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (source) => {
    setEditSourceId(source.source_id);
    setForm({
      source_id:   source.source_id   || "",
      source_name: source.source_name || "",
      source_type: source.source_type || "",
      is_active:   source.is_active   ?? true,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const saveSource = async (e) => {
    e.preventDefault();
    try {
      if (editSourceId) { await updateSource(editSourceId, form); }
      else              { await createSource(form); }
      setShowModal(false);
      setEditSourceId(null);
      setForm(emptyForm);
      await loadSources();
    } catch (err) {
      console.error("Помилка збереження джерела:", err);
      alert("Помилка збереження джерела");
    }
  };

  const handleDeactivate = async (source) => {
    if (!window.confirm(`Деактивувати джерело ${source.source_id}?`)) return;
    try {
      await deactivateSource(source.source_id);
      await loadSources();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації джерела");
    }
  };

  const filtered = sources.filter((item) =>
    `${item.source_id} ${item.source_name} ${item.source_type} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: "source_id",   header: "ID джерела"    },
    { key: "source_name", header: "Назва джерела" },
    { key: "source_type", header: "Тип джерела"   },
    {
      key: "_status", header: "Активний",
      render: (row) => (
        <span className={row.is_active ? "status active" : "status inactive"}>
          {row.is_active ? "Активний" : "Неактивний"}
        </span>
      ),
    },
    {
      key: "_actions", header: "Дії",
      thStyle: { textAlign: "center" },
      style:   { textAlign: "center", whiteSpace: "nowrap" },
      render: (row) => (
        <>
          <button className="icon-btn edit"   onClick={() => openEditModal(row)}>✎</button>
          <button className="icon-btn delete" onClick={() => handleDeactivate(row)}>×</button>
        </>
      ),
    },
  ];

  return (
    <>
      <DataCard
        title="Джерела"
        subtitle="Довідник джерел даних для системи планування."
        actions={<Button variant="primary" onClick={openAddModal}>+ Додати джерело</Button>}
      >
        <TableToolbar
          filters={[{
            key: "search", type: "search", label: "Пошук",
            value: search, onChange: setSearch, placeholder: "Пошук джерела...",
          }]}
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey="source_id"
          emptyMessage="Джерел поки немає або нічого не знайдено."
        />
      </DataCard>

      {showModal && (
        <Modal
          title={editSourceId ? "Редагувати джерело" : "Додати джерело"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveSource}>
            <div className="form-grid">
              {editSourceId && (
                <div className="form-field">
                  <label>ID джерела</label>
                  <input name="source_id" value={form.source_id} readOnly />
                </div>
              )}
              <div className="form-field full">
                <label>Назва джерела *</label>
                <input
                  name="source_name"
                  value={form.source_name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-field full">
                <label>Тип джерела</label>
                <input
                  name="source_type"
                  value={form.source_type}
                  onChange={handleChange}
                  placeholder="Наприклад: Google Sheets, Excel, API"
                />
              </div>
              {editSourceId && (
                <div className="form-field checkbox-field">
                  <label>
                    <input
                      name="is_active"
                      type="checkbox"
                      checked={form.is_active}
                      onChange={handleChange}
                    />
                    Активний
                  </label>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Скасувати</Button>
              <Button variant="primary" type="submit">Зберегти</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default SourcesPage;
