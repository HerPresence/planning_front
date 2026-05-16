import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getBranches,
  createBranch,
  updateBranch,
  deactivateBranch,
} from "../api/branchesApi";

import { getRegions } from "../api/regionsApi";

function BranchesPage({ setActivePage }) {
  const [branches, setBranches] = useState([]);
  const [regions, setRegions] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editBranchId, setEditBranchId] = useState(null);

  const emptyForm = {
    branch_id: "",
    branch_name: "",
    region_id: "",
    is_active: true,
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [branchData, regionData] = await Promise.all([
        getBranches(),
        getRegions(),
      ]);
      setBranches(branchData);
      setRegions(regionData);
    } catch (err) {
      console.error("Помилка завантаження даних:", err);
      alert("Помилка завантаження даних");
    }
  };

  const openAddModal = () => {
    setEditBranchId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (branch) => {
    setEditBranchId(branch.branch_id);
    setForm({
      branch_id: branch.branch_id || "",
      branch_name: branch.branch_name || "",
      region_id: branch.region_id || "",
      is_active: branch.is_active ?? true,
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

  const saveBranch = async (e) => {
    e.preventDefault();

    try {
      if (editBranchId) {
        await updateBranch(editBranchId, form);
      } else {
        await createBranch(form);
      }

      setShowModal(false);
      setEditBranchId(null);
      setForm(emptyForm);
      await loadAllData();
    } catch (err) {
      console.error("Помилка збереження філії:", err);
      alert("Помилка збереження філії");
    }
  };

  const handleDeactivate = async (branch) => {
    const confirmed = window.confirm(
      `Деактивувати філію ${branch.branch_id}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateBranch(branch.branch_id);
      await loadAllData();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації філії");
    }
  };

  const getRegionName = (regionId) => {
    const region = regions.find((r) => r.region_id === regionId);
    return region ? region.region_name : "";
  };

  const filteredBranches = branches.filter((item) =>
    `${item.branch_id} ${item.branch_name} ${item.region_id} ${getRegionName(item.region_id)} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Філії</h2>
            <p>Довідник філій для системи планування.</p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук філії..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="primary" onClick={openAddModal}>
              + Додати філію
            </Button>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID філії</th>
              <th>ID регіону</th>
              <th>Назва регіону</th>
              <th>Назва філії</th>
              <th>Активний</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {filteredBranches.length === 0 && (
              <tr>
                <td colSpan="6" className="empty-row">
                  Філій поки немає або нічого не знайдено.
                </td>
              </tr>
            )}

            {filteredBranches.map((item) => (
              <tr key={item.branch_id}>
                <td>{item.branch_id}</td>
                <td>{item.region_id}</td>
                <td>{getRegionName(item.region_id)}</td>
                <td>{item.branch_name}</td>
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
          title={editBranchId ? "Редагувати філію" : "Додати філію"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveBranch}>
            <div className="form-grid">
              {editBranchId && (
                <div className="form-field">
                  <label>ID філії</label>
                  <input
                    name="branch_id"
                    value={form.branch_id}
                    readOnly
                  />
                </div>
              )}

              <div className="form-field full">
                <label>Назва філії *</label>
                <input
                  name="branch_name"
                  value={form.branch_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field full">
                <label>Регіон</label>
                <select
                  name="region_id"
                  value={form.region_id}
                  onChange={handleChange}
                >
                  <option value="">Оберіть регіон</option>
                  {regions.map((r) => (
                    <option key={r.region_id} value={r.region_id}>
                      {r.region_name}
                    </option>
                  ))}
                </select>
              </div>

              {editBranchId && (
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

export default BranchesPage;
