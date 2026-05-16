import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getRegions,
  createRegion,
  updateRegion,
  deactivateRegion,
} from "../api/regionsApi";

function RegionsPage({ setActivePage }) {
  const [regions, setRegions] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editRegionId, setEditRegionId] = useState(null);

  const emptyForm = {
    region_id: "",
    region_name: "",
    is_active: true,
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const regData = await getRegions();
      setRegions(regData);
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
      region_id: region.region_id || "",
      region_name: region.region_name || "",
      is_active: region.is_active ?? true,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const saveRegion = async (e) => {
    e.preventDefault();

    try {
      if (editRegionId) {
        await updateRegion(editRegionId, form);
      } else {
        await createRegion(form);
      }

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
    const confirmed = window.confirm(
      `Деактивувати регіон ${region.region_id}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateRegion(region.region_id);
      await loadAllData();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації регіону");
    }
  };

  const filteredRegions = regions.filter((item) =>
    `${item.region_id} ${item.region_name} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Регіони</h2>
            <p>Довідник регіонів для системи планування.</p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук регіону..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="primary" onClick={openAddModal}>
              + Додати регіон
            </Button>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID регіону</th>
              <th>Назва регіону</th>
              <th>Активний</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {filteredRegions.length === 0 && (
              <tr>
                <td colSpan="4" className="empty-row">
                  Регіонів поки немає або нічого не знайдено.
                </td>
              </tr>
            )}

            {filteredRegions.map((item) => (
              <tr key={item.region_id}>
                <td>{item.region_id}</td>
                <td>{item.region_name}</td>
                  <td>
                  <span className={item.is_active ? "status active" : "status inactive"}>
                    {item.is_active ? "Активний" : "Неактивний"}
                  </span>
                </td>
                <td>
                  <button className="icon-btn edit" onClick={() => openEditModal(item)}>
                    ✎
                  </button>
                  <button className="icon-btn delete" onClick={() => handleDeactivate(item)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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
                  <input
                    name="region_id"
                    value={form.region_id}
                    readOnly
                  />
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
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Скасувати
              </Button>
              <Button variant="primary" type="submit">
                Зберегти
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default RegionsPage;