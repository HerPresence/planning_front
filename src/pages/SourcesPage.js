import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getSources,
  createSource,
  updateSource,
  deactivateSource,
} from "../api/sourcesApi";

function SourcesPage({ setActivePage }) {
  const [sources, setSources] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editSourceId, setEditSourceId] = useState(null);

  const emptyForm = {
    source_id: "",
    source_name: "",
    source_type: "",
    is_active: true,
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const data = await getSources();
      setSources(data);
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
      source_id: source.source_id || "",
      source_name: source.source_name || "",
      source_type: source.source_type || "",
      is_active: source.is_active ?? true,
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

  const saveSource = async (e) => {
    e.preventDefault();

    try {
      if (editSourceId) {
        await updateSource(editSourceId, form);
      } else {
        await createSource(form);
      }

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
    const confirmed = window.confirm(
      `Деактивувати джерело ${source.source_id}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateSource(source.source_id);
      await loadSources();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації джерела");
    }
  };

  const filteredSources = sources.filter((item) =>
    `${item.source_id} ${item.source_name} ${item.source_type} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Джерела</h2>
            <p>Довідник джерел даних для системи планування.</p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук джерела..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="primary" onClick={openAddModal}>
              + Додати джерело
            </Button>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID джерела</th>
              <th>Назва джерела</th>
              <th>Тип джерела</th>
              <th>Активний</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {filteredSources.length === 0 && (
              <tr>
                <td colSpan="5" className="empty-row">
                  Джерел поки немає або нічого не знайдено.
                </td>
              </tr>
            )}

            {filteredSources.map((item) => (
              <tr key={item.source_id}>
                <td>{item.source_id}</td>
                <td>{item.source_name}</td>
                <td>{item.source_type}</td>
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
          title={editSourceId ? "Редагувати джерело" : "Додати джерело"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveSource}>
            <div className="form-grid">
              {editSourceId && (
                <div className="form-field">
                  <label>ID джерела</label>
                  <input
                    name="source_id"
                    value={form.source_id}
                    readOnly
                  />
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

export default SourcesPage;