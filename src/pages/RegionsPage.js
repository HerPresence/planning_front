import React, { useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import {
  getRegions,
  createRegion,
  updateRegion,
  deactivateRegion,
} from "../api/regionsApi";

function RegionsPage({ setActivePage }) {
  const { canEdit } = usePagePermission("regions");

  const [regions,      setRegions]      = useState([]);
  const [search,       setSearch]       = useState("");
  const [showModal,    setShowModal]    = useState(false);
  const [editRegionId, setEditRegionId] = useState(null);

  const emptyForm = { region_id: "", region_name: "", is_active: true };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setRegions(await getRegions());
    } catch (err) {
      console.error("Помилка завантаження даних:", err);
      alert("Помилка завантаження даних");
    }
  };

  const openAddModal = () => {
    setEditRegionId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (region) => {
    setEditRegionId(region.region_id);
    setForm({
      region_id:   region.region_id   || "",
      region_name: region.region_name || "",
      is_active:   region.is_active   ?? true,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const saveRegion = async (e) => {
    e.preventDefault();
    try {
      if (editRegionId) { await updateRegion(editRegionId, form); }
      else              { await createRegion(form); }
      setShowModal(false);
      setEditRegionId(null);
      setForm(emptyForm);
      await loadAllData();
    } catch (err) {
      console.error("Помилка збереження регіону:", err);
      alert("Помилка збереження регіону");
    }
  };

  const handleDeactivate = async (region) => {
    if (!window.confirm(`Деактивувати регіон ${region.region_id}?`)) return;
    try {
      await deactivateRegion(region.region_id);
      await loadAllData();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації регіону");
    }
  };

  const filtered = regions.filter((item) =>
    `${item.region_id} ${item.region_name} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: "region_id",   header: "ID регіону"    },
    { key: "region_name", header: "Назва регіону" },
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
          {canEdit && <button className="icon-btn edit"   onClick={() => openEditModal(row)}>✎</button>}
          {canEdit && <button className="icon-btn delete" onClick={() => handleDeactivate(row)}>×</button>}
        </>
      ),
    },
  ];

  return (
    <>
      <DataCard
        title="Регіони"
        subtitle="Довідник регіонів для системи планування."
        actions={canEdit && <Button variant="primary" onClick={openAddModal}>+ Додати регіон</Button>}
      >
        <TableToolbar
          filters={[{
            key: "search", type: "search", label: "Пошук",
            value: search, onChange: setSearch, placeholder: "Пошук регіону...",
          }]}
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey="region_id"
          emptyMessage="Регіонів поки немає або нічого не знайдено."
        />
      </DataCard>

      {showModal && (
        <Modal
          title={editRegionId ? "Редагувати регіон" : "Додати регіон"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveRegion}>
            <div className="form-grid">
              {editRegionId && (
                <div className="form-field">
                  <label>ID регіону</label>
                  <input name="region_id" value={form.region_id} readOnly />
                </div>
              )}
              <div className="form-field full">
                <label>Назва регіону *</label>
                <input
                  name="region_name"
                  value={form.region_name}
                  onChange={handleChange}
                  required
                />
              </div>
              {editRegionId && (
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

export default RegionsPage;
