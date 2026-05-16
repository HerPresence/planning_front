import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
} from "../api/departmentsApi";
import { getHoldings }       from "../api/holdingsApi";
import { getOrganizations }  from "../api/organizationsApi";
import { getRegions }        from "../api/regionsApi";
import { getBranches }       from "../api/branchesApi";

function DepartmentsPage({ setActivePage }) {
  const [departments,      setDepartments]      = useState([]);
  const [holdings,         setHoldings]         = useState([]);
  const [organizations,    setOrganizations]    = useState([]);
  const [regions,          setRegions]          = useState([]);
  const [branches,         setBranches]         = useState([]);
  const [search,           setSearch]           = useState("");
  const [showModal,        setShowModal]        = useState(false);
  const [editDepartmentId, setEditDepartmentId] = useState(null);
  const [formError,        setFormError]        = useState("");

  const emptyForm = {
    department_id: "", holding_name: "", organization_name: "",
    region_name: "", branch_name: "", department_name: "", is_active: true,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [depts, h, o, r, b] = await Promise.all([
        getDepartments(), getHoldings(), getOrganizations(), getRegions(), getBranches(),
      ]);
      setDepartments(depts);
      setHoldings(h);
      setOrganizations(o);
      setRegions(r);
      setBranches(b);
    } catch (err) {
      console.error("Помилка завантаження:", err);
      alert("Помилка завантаження даних");
    }
  };

  const loadDepartments = async () => {
    try {
      setDepartments(await getDepartments());
    } catch (err) {
      console.error("Помилка завантаження підрозділів:", err);
    }
  };

  const openAddModal = () => {
    setEditDepartmentId(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (department) => {
    setEditDepartmentId(department.department_id);
    setForm({
      department_id:     department.department_id     || "",
      holding_name:      department.holding_name      || "",
      organization_name: department.organization_name || "",
      region_name:       department.region_name       || "",
      branch_name:       department.branch_name       || "",
      department_name:   department.department_name   || "",
      is_active:         department.is_active         ?? true,
    });
    setFormError("");
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const saveDepartment = async (e) => {
    e.preventDefault();
    if (!form.department_name.trim()) {
      setFormError("Назва підрозділу є обов'язковою");
      return;
    }
    setFormError("");
    try {
      if (editDepartmentId) { await updateDepartment(editDepartmentId, form); }
      else                  { await createDepartment(form); }
      setShowModal(false);
      setEditDepartmentId(null);
      setForm(emptyForm);
      await loadDepartments();
    } catch (err) {
      console.error("Помилка збереження підрозділу:", err);
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        setFormError(detail.map((d) => d.msg || JSON.stringify(d)).join("; "));
      } else if (typeof detail === "string") {
        setFormError(detail);
      } else {
        setFormError("Помилка збереження. Перевірте дані.");
      }
    }
  };

  const handleDeactivate = async (department) => {
    if (!window.confirm(`Деактивувати підрозділ ${department.department_id}?`)) return;
    try {
      await deactivateDepartment(department.department_id);
      await loadDepartments();
    } catch (err) {
      console.error("Помилка деактивації:", err);
      alert("Помилка деактивації підрозділу");
    }
  };

  const filtered = departments.filter((item) =>
    [
      item.department_id, item.holding_name, item.organization_name,
      item.region_name, item.branch_name, item.department_name,
      item.is_active ? "активний" : "неактивний",
    ].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { key: "department_id",     header: "ID підрозділу" },
    { key: "holding_name",      header: "Холдинг"       },
    { key: "organization_name", header: "Організація"   },
    { key: "region_name",       header: "Регіон"        },
    { key: "branch_name",       header: "Філія"         },
    { key: "department_name",   header: "Підрозділ"     },
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
        title="Підрозділи"
        subtitle="Довідник підрозділів для PnL / планування."
        actions={<Button variant="primary" onClick={openAddModal}>+ Додати підрозділ</Button>}
      >
        <TableToolbar
          filters={[{
            key: "search", type: "search", label: "Пошук",
            value: search, onChange: setSearch, placeholder: "Пошук підрозділу...",
          }]}
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey="department_id"
          emptyMessage="Підрозділів поки немає або нічого не знайдено."
        />
      </DataCard>

      {showModal && (
        <Modal
          title={editDepartmentId ? "Редагувати підрозділ" : "Додати підрозділ"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveDepartment}>
            <div className="form-grid">
              {editDepartmentId && (
                <div className="form-field">
                  <label>ID підрозділу</label>
                  <input name="department_id" value={form.department_id} readOnly />
                </div>
              )}
              <div className="form-field">
                <label>Холдинг</label>
                <SearchableSelect
                  options={holdings}
                  value={form.holding_name}
                  onChange={(val) => setForm((prev) => ({ ...prev, holding_name: val }))}
                  getOptionValue={(h) => h.holding_name}
                  getOptionLabel={(h) => h.holding_name}
                  placeholder="Оберіть холдинг..."
                />
              </div>
              <div className="form-field">
                <label>Організація</label>
                <SearchableSelect
                  options={organizations}
                  value={form.organization_name}
                  onChange={(val) => setForm((prev) => ({ ...prev, organization_name: val }))}
                  getOptionValue={(o) => o.organization_name}
                  getOptionLabel={(o) => o.organization_name}
                  placeholder="Оберіть організацію..."
                />
              </div>
              <div className="form-field">
                <label>Регіон</label>
                <SearchableSelect
                  options={regions}
                  value={form.region_name}
                  onChange={(val) => setForm((prev) => ({ ...prev, region_name: val }))}
                  getOptionValue={(r) => r.region_name}
                  getOptionLabel={(r) => r.region_name}
                  placeholder="Оберіть регіон..."
                />
              </div>
              <div className="form-field">
                <label>Філія</label>
                <SearchableSelect
                  options={branches}
                  value={form.branch_name}
                  onChange={(val) => setForm((prev) => ({ ...prev, branch_name: val }))}
                  getOptionValue={(b) => b.branch_name}
                  getOptionLabel={(b) => b.branch_name}
                  placeholder="Оберіть філію..."
                />
              </div>
              <div className="form-field full">
                <label>Підрозділ *</label>
                <input
                  name="department_name"
                  value={form.department_name}
                  onChange={handleChange}
                  placeholder="Назва підрозділу"
                />
              </div>
              {editDepartmentId && (
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
            {formError && (
              <div className="error-message" style={{ marginTop: 8, marginBottom: 0 }}>
                {formError}
              </div>
            )}
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

export default DepartmentsPage;
