import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import { getHoldings } from "../api/holdingsApi";
import {
  getOrganizations,
  createOrganization,
  updateOrganization,
  deactivateOrganization,
} from "../api/organizationsApi";

function OrganizationsPage({ setActivePage }) {
  const [organizations, setOrganizations] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editOrganizationId, setEditOrganizationId] = useState(null);

  const emptyForm = {
    organization_id: "",
    holding_id: "",
    holding_name: "",
    organization_name: "",
    is_active: true,
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [organizationData, holdingData] = await Promise.all([
        getOrganizations(),
        getHoldings(),
      ]);
      setOrganizations(organizationData);
      setHoldings(holdingData);
    } catch (err) {
      console.error("Помилка завантаження організацій:", err);
      alert("Помилка завантаження організацій");
    }
  };

  const openAddModal = () => {
    setEditOrganizationId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (organization) => {
    setEditOrganizationId(organization.organization_id);
    setForm({
      organization_id: organization.organization_id || "",
      holding_id: organization.holding_id || "",
      holding_name: organization.holding_name || "",
      organization_name: organization.organization_name || "",
      is_active: organization.is_active ?? true,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === "holding_id") {
      const selectedHolding = holdings.find((item) => item.holding_id === Number(value));
      setForm({
        ...form,
        holding_id: value,
        holding_name: selectedHolding ? selectedHolding.holding_name : "",
      });
      return;
    }

    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const saveOrganization = async (e) => {
    e.preventDefault();

    try {
      if (editOrganizationId) {
        await updateOrganization(editOrganizationId, form);
      } else {
        await createOrganization(form);
      }

      setShowModal(false);
      setEditOrganizationId(null);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      console.error("Помилка збереження організації:", err);
      alert("Помилка збереження організації");
    }
  };

  const handleDeactivate = async (organization) => {
    const confirmed = window.confirm(
      `Деактивувати організацію ${organization.organization_id}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateOrganization(organization.organization_id);
      await loadData();
    } catch (err) {
      console.error("Помилка деактивації організації:", err);
      alert("Помилка деактивації організації");
    }
  };

  const filteredOrganizations = organizations.filter((item) =>
    `${item.organization_id} ${item.holding_id} ${item.holding_name} ${item.organization_name} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Організації</h2>
            <p>Довідник організацій для системи планування.</p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук організації..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="primary" onClick={openAddModal}>
              + Додати організацію
            </Button>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID організації</th>
              <th>ID холдингу</th>
              <th>Холдинг</th>
              <th>Назва організації</th>
              <th>Активний</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {filteredOrganizations.length === 0 && (
              <tr>
                <td colSpan="6" className="empty-row">
                  Організацій поки немає або нічого не знайдено.
                </td>
              </tr>
            )}

            {filteredOrganizations.map((item) => (
              <tr key={item.organization_id}>
                <td>{item.organization_id}</td>
                <td>{item.holding_id}</td>
                <td>{item.holding_name}</td>
                <td>{item.organization_name}</td>
                <td>
                  <span className={item.is_active ? "status active" : "status inactive"}>
                    {item.is_active ? "Активна" : "Неактивна"}
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
          title={editOrganizationId ? "Редагувати організацію" : "Додати організацію"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveOrganization}>
            <div className="form-grid">
              {editOrganizationId && (
                <div className="form-field">
                  <label>ID організації</label>
                  <input
                    name="organization_id"
                    value={form.organization_id}
                    readOnly
                  />
                </div>
              )}

              <div className="form-field full">
                <label>Холдинг</label>
                <select
                  name="holding_id"
                  value={form.holding_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Оберіть холдинг</option>
                  {holdings.map((holding) => (
                    <option key={holding.holding_id} value={holding.holding_id}>
                      {holding.holding_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field full">
                <label>Назва організації</label>
                <input
                  name="organization_name"
                  value={form.organization_name}
                  onChange={handleChange}
                  required
                />
              </div>

              {editOrganizationId && (
                <div className="form-field checkbox-field">
                  <label>
                    <input
                      name="is_active"
                      type="checkbox"
                      checked={form.is_active}
                      onChange={handleChange}
                    />
                    Активна
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

export default OrganizationsPage;
