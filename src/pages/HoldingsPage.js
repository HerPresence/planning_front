import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getHoldings,
  createHolding,
  updateHolding,
  deactivateHolding,
} from "../api/holdingsApi";

function HoldingsPage({ setActivePage }) {
  const [holdings, setHoldings] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editHoldingId, setEditHoldingId] = useState(null);

  const emptyForm = {
    holding_id: "",
    holding_name: "",
    is_active: true,
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadHoldings();
  }, []);

  const loadHoldings = async () => {
    try {
      const data = await getHoldings();
      setHoldings(data);
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
      holding_id: holding.holding_id || "",
      holding_name: holding.holding_name || "",
      is_active: holding.is_active ?? true,
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

  const saveHolding = async (e) => {
    e.preventDefault();

    try {
      if (editHoldingId) {
        await updateHolding(editHoldingId, form);
      } else {
        await createHolding(form);
      }

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
    const confirmed = window.confirm(
      `Деактивувати холдинг ${holding.holding_id}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateHolding(holding.holding_id);
      await loadHoldings();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації холдингу");
    }
  };

  const filteredHoldings = holdings.filter((item) =>
    `${item.holding_id} ${item.holding_name} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Холдинги</h2>
            <p>Довідник холдингів для системи планування.</p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук холдингу..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="primary" onClick={openAddModal}>
              + Додати холдинг
            </Button>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID холдингу</th>
              <th>Назва холдингу</th>
              <th>Активний</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {filteredHoldings.length === 0 && (
              <tr>
                <td colSpan="4" className="empty-row">
                  Холдингів поки немає або нічого не знайдено.
                </td>
              </tr>
            )}

            {filteredHoldings.map((item) => (
              <tr key={item.holding_id}>
                <td>{item.holding_id}</td>
                <td>{item.holding_name}</td>
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
          title={editHoldingId ? "Редагувати холдинг" : "Додати холдинг"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveHolding}>
            <div className="form-grid">
              {editHoldingId && (
                <div className="form-field">
                  <label>ID холдингу</label>
                  <input
                    name="holding_id"
                    value={form.holding_id}
                    readOnly
                  />
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

export default HoldingsPage;