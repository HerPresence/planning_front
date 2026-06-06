import React, { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import SearchableSelect from "./ui/SearchableSelect";
import { getDepartments, updateDepartment } from "../api/departmentsApi";
import { getHoldings }      from "../api/holdingsApi";
import { getOrganizations } from "../api/organizationsApi";
import { getRegions }       from "../api/regionsApi";
import { getBranches }      from "../api/branchesApi";

/**
 * Standalone reusable department edit modal.
 * Props:
 *   departmentId  — ID of the master department to edit (required)
 *   initialData   — optional prefill object when departmentId row not yet in list
 *                   { department_name, holding_name, organization_name, region_name,
 *                     branch_name, parent_department_id, parent_department_name, is_active }
 *   onClose       — called when modal is closed without saving
 *   onSaved(form) — called after successful save with the updated form values
 */
export default function DepartmentEditModal({ departmentId, initialData, onClose, onSaved }) {
  const [form,          setForm]          = useState(null);
  const [error,         setError]         = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [holdings,      setHoldings]      = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [regions,       setRegions]       = useState([]);
  const [branches,      setBranches]      = useState([]);
  const [departments,   setDepartments]   = useState([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDepartments(), getHoldings(), getOrganizations(), getRegions(), getBranches(),
    ]).then(([depts, h, o, r, b]) => {
      setHoldings(h); setOrganizations(o); setRegions(r); setBranches(b); setDepartments(depts);

      const norm = (a, x) => (a || "").trim().toLowerCase() === (x || "").trim().toLowerCase();

      // Prefer live dept data from the full list; fall back to initialData for prefill
      const d = depts.find(dept => dept.department_id === departmentId) || initialData;
      if (!d) { setError(`Підрозділ ${departmentId} не знайдено в довіднику`); setLoading(false); return; }

      // Case-insensitive normalization (imported dept names may differ from dim_* names)
      const mH = h.find(x => norm(x.holding_name,      d.holding_name));
      const mO = o.find(x => norm(x.organization_name, d.organization_name));
      const mR = r.find(x => norm(x.region_name,       d.region_name));
      const mB = b.find(x => norm(x.branch_name,       d.branch_name));

      setForm({
        department_id:          departmentId,
        department_name:        d.department_name  || d.master_name || "",
        holding_name:           mH?.holding_name           || d.holding_name      || "",
        organization_name:      mO?.organization_name      || d.organization_name  || "",
        region_name:            mR?.region_name            || d.region_name       || "",
        branch_name:            mB?.branch_name            || d.branch_name       || "",
        parent_department_id:   d.parent_department_id   || "",
        parent_department_name: d.parent_department_name || "",
        is_active:              d.is_active !== false,
      });
    }).catch(() => setError("Помилка завантаження довідників"))
      .finally(() => setLoading(false));
  }, [departmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleParentSelect = (deptId) => {
    const p = departments.find(d => d.department_id === deptId);
    setForm(prev => ({
      ...prev,
      parent_department_id:   deptId || "",
      parent_department_name: p ? (p.department_name || "") : "",
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.department_name.trim()) { setError("Назва підрозділу є обов'язковою"); return; }
    const parentId = (form.parent_department_id || "").trim();
    if (parentId && parentId === departmentId) {
      setError("Підрозділ не може бути власним батьком"); return;
    }
    setSaving(true); setError(null);
    try {
      await updateDepartment(departmentId, form);
      onSaved(form);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join("; ")
          : typeof detail === "string" ? detail
          : "Помилка збереження. Перевірте дані."
      );
    } finally { setSaving(false); }
  };

  const parentOptions = departments.filter(
    d => d.is_active !== false && d.department_id !== departmentId
  );

  return (
    <Modal title="Редагувати підрозділ" onClose={onClose} size="large">
      {loading && (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#9ca3af" }}>
          Завантаження даних…
        </div>
      )}
      {!loading && !form && error && (
        <div className="error-message">{error}</div>
      )}
      {form && (
        <form onSubmit={handleSave}>
          <div className="form-grid">
            <div className="form-field">
              <label>ID підрозділу</label>
              <input value={form.department_id} readOnly
                style={{ background: "#f8f8f8", color: "#888" }}/>
            </div>

            <div className="form-field">
              <label>Батьківський підрозділ (Parent)</label>
              <SearchableSelect
                options={parentOptions}
                value={form.parent_department_id}
                onChange={handleParentSelect}
                getOptionValue={d => d.department_id}
                getOptionLabel={d => `${d.department_name}${d.organization_name ? " · " + d.organization_name : ""}`}
                getSearchText={d => d.department_id}
                placeholder="Оберіть батьківський підрозділ (необов'язково)…"
              />
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                Тип вузла зміниться автоматично після зміни parent.
              </div>
            </div>

            {form.parent_department_id && (
              <div className="form-field">
                <label>Parent ID</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code style={{ fontSize: 12, background: "#f3f4f6", padding: "4px 8px",
                                 borderRadius: 4, color: "#374151", flex: 1 }}>
                    {form.parent_department_id}
                  </code>
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, parent_department_id: "", parent_department_name: "" }))}
                    style={{ padding: "4px 10px", fontSize: 12, background: "#fee2e2",
                             border: "1px solid #fca5a5", borderRadius: 4, cursor: "pointer",
                             color: "#991b1b", whiteSpace: "nowrap" }}>
                    ✕ Очистити
                  </button>
                </div>
              </div>
            )}

            <div className="form-field">
              <label>Холдинг</label>
              <SearchableSelect
                options={holdings} value={form.holding_name}
                onChange={val => setForm(p => ({ ...p, holding_name: val }))}
                getOptionValue={h => h.holding_name} getOptionLabel={h => h.holding_name}
                placeholder="Оберіть холдинг…"/>
            </div>

            <div className="form-field">
              <label>Організація</label>
              <SearchableSelect
                options={organizations} value={form.organization_name}
                onChange={val => setForm(p => ({ ...p, organization_name: val }))}
                getOptionValue={o => o.organization_name} getOptionLabel={o => o.organization_name}
                placeholder="Оберіть організацію…"/>
            </div>

            <div className="form-field">
              <label>Регіон</label>
              <SearchableSelect
                options={regions} value={form.region_name}
                onChange={val => setForm(p => ({ ...p, region_name: val }))}
                getOptionValue={r => r.region_name} getOptionLabel={r => r.region_name}
                placeholder="Оберіть регіон…"/>
            </div>

            <div className="form-field">
              <label>Філія</label>
              <SearchableSelect
                options={branches} value={form.branch_name}
                onChange={val => setForm(p => ({ ...p, branch_name: val }))}
                getOptionValue={b => b.branch_name} getOptionLabel={b => b.branch_name}
                placeholder="Оберіть філію…"/>
            </div>

            <div className="form-field full">
              <label>Підрозділ *</label>
              <input name="department_name" value={form.department_name}
                onChange={handleChange} required
                placeholder="Назва підрозділу"/>
            </div>

            <div className="form-field checkbox-field">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input name="is_active" type="checkbox"
                  checked={!!form.is_active} onChange={handleChange}/>
                Активний
              </label>
            </div>
          </div>

          {error && (
            <div className="error-message" style={{ marginTop: 8, marginBottom: 0 }}>{error}</div>
          )}
          <div className="modal-actions">
            <button type="button" onClick={onClose}
              style={{ padding: "7px 16px", fontSize: 13, fontWeight: 500,
                       border: "1px solid #d1d5db", borderRadius: 5,
                       background: "#fff", color: "#374151", cursor: "pointer" }}>
              Скасувати
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600, border: "none",
                       borderRadius: 5, background: saving ? "#9ca3af" : "#7c3aed",
                       color: "#fff", cursor: saving ? "default" : "pointer" }}>
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
