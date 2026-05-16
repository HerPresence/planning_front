import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import {
  getHoldings,
  createHolding,
  updateHolding,
  deactivateHolding,
} from "../api/holdingsApi";

function HoldingsPage({ setActivePage }) {
  const [holdings,      setHoldings]      = useState([]);
  const [search,        setSearch]        = useState("");
  const [showModal,     setShowModal]     = useState(false);
  const [editHoldingId, setEditHoldingId] = useState(null);

  const emptyForm = { holding_id: "", holding_name: "", is_active: true };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadHoldings(); }, []);

  const loadHoldings = async () => {
    try {
      setHoldings(await getHoldings());
    } catch (err) {
      console.error("Помилка завантаження холдингів:", err);
      alert("Помилка завантаження холдингів");
    }
  };

  const openAddModal = () => {
    setEditHoldingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (holding) => {
    setEditHoldingId(holding.holding_id);
    setForm({
      holding_id:   holding.holding_id   || "",
      holding_name: holding.holding_name || "",
      is_active:    holding.is_active    ?? true,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const saveHolding = async (e) => {
    e.preventDefault();
    try {
      if (editHoldingId) { await updateHolding(editHoldingId, form); }
      else               { await createHolding(form); }
      setShowModal(false);
      setEditHoldingId(null);
      setForm(emptyForm);
      await loadHoldings();
    } catch (err) {
      console.error("Помилка збереження холдингу:", err);
      alert("Помилка збереження холдингу");
    }
  };

  const handleDeactivate = async (holding) => {
    if (!window.confirm(`Деактивувати холдинг ${holding.holding_id}?`)) return;
    try {
      await deactivateHolding(holding.holding_id);
      await loadHoldings();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації холдингу");
    }
  };

  const filtered = holdings.filter((item) =>
    `${item.holding_id} ${item.holding_name} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: "holding_id",   header: "ID холдингу"    },
    { key: "holding_name", header: "Назва холдингу" },
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
        title="Холдинги"
        subtitle="Довідник холдингів для системи планування."
        actions={<Button variant="primary" onClick={openAddModal}>+ Додати холдинг</Button>}
      >
        <TableToolbar
          filters={[{
            key: "search", type: "search", label: "Пошук",
            value: search, onChange: setSearch, placeholder: "Пошук холдингу...",
          }]}
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey="holding_id"
          emptyMessage="Холдингів поки немає або нічого не знайдено."
        />
      </DataCard>

      {showModal && (
        <Modal
          title={editHoldingId ? "Редагувати холдинг" : "Додати холдинг"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveHolding}>
            <div className="form-grid">
              {editHoldingId && (
                <div className="form-field">
                  <label>ID холдингу</label>
                  <input name="holding_id" value={form.holding_id} readOnly />
                </div>
              )}
              <div className="form-field full">
                <label>Назва холдингу *</label>
                <input
                  name="holding_name"
                  value={form.holding_name}
                  onChange={handleChange}
                  required
                />
              </div>
              {editHoldingId && (
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

export default HoldingsPage;
