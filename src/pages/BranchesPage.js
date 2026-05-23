import React, { useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import {
  getBranches,
  createBranch,
  updateBranch,
  deactivateBranch,
} from "../api/branchesApi";
import { getRegions } from "../api/regionsApi";

function BranchesPage({ setActivePage }) {
  const { canEdit } = usePagePermission("branches");

  const [branches,     setBranches]     = useState([]);
  const [regions,      setRegions]      = useState([]);
  const [search,       setSearch]       = useState("");
  const [showModal,    setShowModal]    = useState(false);
  const [editBranchId, setEditBranchId] = useState(null);

  const emptyForm = { branch_id: "", branch_name: "", region_id: "", is_active: true };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      const [branchData, regionData] = await Promise.all([getBranches(), getRegions()]);
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
      branch_id:   branch.branch_id   || "",
      branch_name: branch.branch_name || "",
      region_id:   branch.region_id   || "",
      is_active:   branch.is_active   ?? true,
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };

  const saveBranch = async (e) => {
    e.preventDefault();
    try {
      if (editBranchId) { await updateBranch(editBranchId, form); }
      else              { await createBranch(form); }
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
    if (!window.confirm(`Деактивувати філію ${branch.branch_id}?`)) return;
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

  const filtered = branches.filter((item) =>
    `${item.branch_id} ${item.branch_name} ${item.region_id} ${getRegionName(item.region_id)} ${item.is_active ? "активний" : "неактивний"}`
      .toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: "branch_id",   header: "ID філії"      },
    { key: "region_id",   header: "ID регіону"    },
    { key: "_region_name", header: "Назва регіону", render: (row) => getRegionName(row.region_id) },
    { key: "branch_name", header: "Назва філії"   },
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
        title="Філії"
        subtitle="Довідник філій для системи планування."
        actions={canEdit && <Button variant="primary" onClick={openAddModal}>+ Додати філію</Button>}
      >
        <TableToolbar
          filters={[{
            key: "search", type: "search", label: "Пошук",
            value: search, onChange: setSearch, placeholder: "Пошук філії...",
          }]}
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey="branch_id"
          emptyMessage="Філій поки немає або нічого не знайдено."
        />
      </DataCard>

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
                  <input name="branch_id" value={form.branch_id} readOnly />
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
                <select name="region_id" value={form.region_id} onChange={handleChange}>
                  <option value="">Оберіть регіон</option>
                  {regions.map((r) => (
                    <option key={r.region_id} value={r.region_id}>{r.region_name}</option>
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
              <Button variant="secondary" onClick={() => setShowModal(false)}>Скасувати</Button>
              <Button variant="primary" type="submit">Зберегти</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default BranchesPage;
