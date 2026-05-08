import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
} from "../api/departmentsApi";

function DepartmentsPage({ setActivePage }) {
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editDepartmentId, setEditDepartmentId] = useState(null);

  const emptyForm = {
    department_id: "",
    holding_name: "",
    organization_name: "",
    region_name: "",
    branch_name: "",
    department_name: "",
    is_active: true,
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const data = await getDepartments();
      setDepartments(data);
    } catch (err) {
      console.error("Помилка завантаження підрозділів:", err);
      alert("Помилка завантаження підрозділів");
    }
  };

  const openAddModal = () => {
    setEditDepartmentId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (department) => {
    setEditDepartmentId(department.department_id);
    setForm({
      department_id: department.department_id || "",
      holding_name: department.holding_name || "",
      organization_name: department.organization_name || "",
      region_name: department.region_name || "",
      branch_name: department.branch_name || "",
      department_name: department.department_name || "",
      is_active: department.is_active ?? true,
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

  const saveDepartment = async (e) => {
    e.preventDefault();

    try {
      if (editDepartmentId) {
        await updateDepartment(editDepartmentId, form);
      } else {
        await createDepartment(form);
      }

      setShowModal(false);
      setEditDepartmentId(null);
      setForm(emptyForm);
      await loadDepartments();
    } catch (err) {
      console.error("Помилка збереження підрозділу:", err);
      alert("Помилка збереження підрозділу");
    }
  };

  const handleDeactivate = async (department) => {
    const confirmed = window.confirm(
      `Деактивувати підрозділ ${department.department_id}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateDepartment(department.department_id);
      await loadDepartments();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації підрозділу");
    }
  };

  const filteredDepartments = departments.filter((item) =>
    `
      ${item.department_id}
      ${item.holding_name}
      ${item.organization_name}
      ${item.region_name}
      ${item.branch_name}
      ${item.department_name}
      ${item.is_active ? "активний" : "неактивний"}
    `
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Підрозділи</h2>
            <p>Довідник підрозділів для PnL / планування.</p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук підрозділу..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="primary" onClick={openAddModal}>
              + Додати підрозділ
            </Button>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID підрозділу</th>
              <th>Холдинг</th>
              <th>Організація</th>
              <th>Регіон</th>
              <th>Філія</th>
              <th>Підрозділ</th>
              <th>Активний</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {filteredDepartments.length === 0 && (
              <tr>
                <td colSpan="8" className="empty-row">
                  Підрозділів поки немає або нічого не знайдено.
                </td>
              </tr>
            )}

            {filteredDepartments.map((item) => (
              <tr key={item.department_id}>
                <td>{item.department_id}</td>
                <td>{item.holding_name}</td>
                <td>{item.organization_name}</td>
                <td>{item.region_name}</td>
                <td>{item.branch_name}</td>
                <td>{item.department_name}</td>
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
          title={editDepartmentId ? "Редагувати підрозділ" : "Додати підрозділ"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveDepartment}>
            <div className="form-grid">
              <div className="form-field">
                <label>ID підрозділу</label>
                <input
                  name="department_id"
                  value={form.department_id}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Холдинг</label>
                <input
                  name="holding_name"
                  value={form.holding_name}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Організація</label>
                <input
                  name="organization_name"
                  value={form.organization_name}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Регіон</label>
                <input
                  name="region_name"
                  value={form.region_name}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Філія</label>
                <input
                  name="branch_name"
                  value={form.branch_name}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field full">
                <label>Підрозділ</label>
                <input
                  name="department_name"
                  value={form.department_name}
                  onChange={handleChange}
                />
              </div>

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

export default DepartmentsPage;
