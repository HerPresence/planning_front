import React, { useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";

import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
} from "../api/departmentsApi";
import { getHoldings }      from "../api/holdingsApi";
import { getOrganizations } from "../api/organizationsApi";
import { getRegions }       from "../api/regionsApi";
import { getBranches }      from "../api/branchesApi";

// ── Compact shared styles ─────────────────────────────────────────────────────

const thS = {
  padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
  fontWeight: 600, fontSize: 10, color: "#6b7280", background: "#f9fafb",
  position: "sticky", top: 0, whiteSpace: "nowrap",
};
const tdS  = { padding: "3px 8px", verticalAlign: "middle", fontSize: 11, lineHeight: 1.35 };
const selS = { padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12, background: "#fff", cursor: "pointer" };
const inpS = { padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 };
const lblS = { fontSize: 10, color: "#9ca3af", marginBottom: 2 };

// ── Node-type config ──────────────────────────────────────────────────────────

const NT_CFG = {
  root:         { label: "Root",         bg: "#f3f4f6", color: "#374151" },
  root_parent:  { label: "Root·Parent",  bg: "#dbeafe", color: "#1e40af" },
  leaf:         { label: "Leaf",         bg: "#d1fae5", color: "#065f46" },
  parent_child: { label: "Parent·Child", bg: "#ede9fe", color: "#7c3aed" },
};
const NT_TITLES = {
  root:         "Root: одиночний підрозділ без дочірніх",
  root_parent:  "Root·Parent: корінь ієрархії, має дочірні підрозділи",
  leaf:         "Leaf: кінцевий підрозділ, є батько, немає дочірніх",
  parent_child: "Parent·Child: проміжний вузол — є батько і дочірні",
};

function nodeTypeKey(row) {
  const hp = !!row.parent_department_id, hc = !!row.has_children;
  if (!hp && !hc) return "root";
  if (!hp &&  hc) return "root_parent";
  if ( hp && !hc) return "leaf";
  return "parent_child";
}

function NodeTypeBadge({ ntKey, level, childCount }) {
  const cfg = NT_CFG[ntKey] || NT_CFG.root;
  return (
    <span title={NT_TITLES[ntKey] || ""} style={{
      fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
      display: "inline-block", cursor: "help",
    }}>
      {cfg.label}
      <span style={{ opacity: 0.6, marginLeft: 3, fontWeight: 400 }}>L{level ?? "?"}</span>
      {childCount > 0 && (
        <span style={{ opacity: 0.55, marginLeft: 3, fontWeight: 400 }}>({childCount})</span>
      )}
    </span>
  );
}

// ── KPI pill ──────────────────────────────────────────────────────────────────

function KpiPill({ label, value, color, active, onClick }) {
  const c = color || "#374151";
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "baseline", gap: 5,
      padding: "3px 11px", borderRadius: 20, border: "none",
      background: active ? `${c}18` : "#f3f4f6",
      outline: active ? `2px solid ${c}` : "none",
      cursor: onClick ? "pointer" : "default", fontSize: 12, lineHeight: 1,
    }}>
      <span style={{ fontWeight: 700, fontSize: 15, color: c }}>{value}</span>
      <span style={{ color: active ? c : "#6b7280", fontWeight: active ? 600 : 400 }}>{label}</span>
    </button>
  );
}

// ── Icon button style ─────────────────────────────────────────────────────────

const iconBtn = (variant) => {
  const v = {
    blue: { bg: "#eff6ff", br: "#bfdbfe", cl: "#1d4ed8" },
    red:  { bg: "#fef2f2", br: "#fecaca", cl: "#dc2626" },
    gray: { bg: "#f9fafb", br: "#e5e7eb", cl: "#6b7280" },
  }[variant] || { bg: "#f9fafb", br: "#e5e7eb", cl: "#374151" };
  return {
    width: 26, height: 26, padding: 0, flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 700, border: `1px solid ${v.br}`,
    background: v.bg, color: v.cl, borderRadius: 4, cursor: "pointer",
  };
};

// ── Filter field wrapper ──────────────────────────────────────────────────────

function FC({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={lblS}>{label}</span>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function DepartmentsPage() {
  const { canEdit } = usePagePermission("departments");

  const [departments,      setDepartments]      = useState([]);
  const [holdings,         setHoldings]         = useState([]);
  const [organizations,    setOrganizations]    = useState([]);
  const [regions,          setRegions]          = useState([]);
  const [branches,         setBranches]         = useState([]);

  const [filterLevel,      setFilterLevel]      = useState("");
  const [filterNodeType,   setFilterNodeType]   = useState("");
  const [filterHolding,    setFilterHolding]    = useState("");
  const [filterOrg,        setFilterOrg]        = useState("");
  const [filterName,       setFilterName]       = useState("");
  const [filterRegion,     setFilterRegion]     = useState("");
  const [filterBranch,     setFilterBranch]     = useState("");
  const [filterParentId,   setFilterParentId]   = useState("");
  const [filterParentName, setFilterParentName] = useState("");
  const [filterActive,     setFilterActive]     = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showModal,        setShowModal]        = useState(false);
  const [editDepartmentId, setEditDepartmentId] = useState(null);
  const [formError,        setFormError]        = useState("");

  const emptyForm = {
    department_id: "", holding_name: "", organization_name: "",
    region_name: "", branch_name: "", department_name: "",
    parent_department_id: "", parent_department_name: "", is_active: true,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [depts, h, o, r, b] = await Promise.all([
        getDepartments(), getHoldings(), getOrganizations(), getRegions(), getBranches(),
      ]);
      setDepartments(depts); setHoldings(h); setOrganizations(o); setRegions(r); setBranches(b);
    } catch (err) {
      console.error("Помилка завантаження:", err);
    }
  };

  const loadDepartments = async () => {
    try { setDepartments(await getDepartments()); }
    catch (err) { console.error(err); }
  };

  const openAddModal = () => {
    setEditDepartmentId(null); setForm(emptyForm); setFormError(""); setShowModal(true);
  };

  const openEditModal = (d) => {
    setEditDepartmentId(d.department_id);
    setForm({
      department_id:          d.department_id          || "",
      holding_name:           d.holding_name           || "",
      organization_name:      d.organization_name      || "",
      region_name:            d.region_name            || "",
      branch_name:            d.branch_name            || "",
      department_name:        d.department_name        || "",
      parent_department_id:   d.parent_department_id   || "",
      parent_department_name: d.parent_department_name || "",
      is_active:              d.is_active              ?? true,
    });
    setFormError(""); setShowModal(true);
  };

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

  const saveDepartment = async (e) => {
    e.preventDefault();
    if (!form.department_name.trim()) { setFormError("Назва підрозділу є обов'язковою"); return; }
    const parentId = form.parent_department_id.trim();
    if (parentId) {
      if (editDepartmentId && parentId === editDepartmentId) {
        setFormError("Підрозділ не може бути власним батьком"); return;
      }
      if (!departments.some(d => d.department_id === parentId)) {
        setFormError(`Parent підрозділ «${parentId}» не знайдено в довіднику`); return;
      }
    }
    setFormError("");
    try {
      if (editDepartmentId) { await updateDepartment(editDepartmentId, form); }
      else                  { await createDepartment(form); }
      setShowModal(false); setEditDepartmentId(null); setForm(emptyForm);
      await loadDepartments();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) setFormError(detail.map(d => d.msg || JSON.stringify(d)).join("; "));
      else if (typeof detail === "string") setFormError(detail);
      else setFormError("Помилка збереження. Перевірте дані.");
    }
  };

  const handleDeactivate = async (dept) => {
    if (!window.confirm(`Деактивувати підрозділ ${dept.department_id}?`)) return;
    try { await deactivateDepartment(dept.department_id); await loadDepartments(); }
    catch (err) { console.error(err); alert("Помилка деактивації"); }
  };

  const resetFilters = () => {
    setFilterLevel(""); setFilterNodeType(""); setFilterHolding(""); setFilterOrg("");
    setFilterName(""); setFilterRegion(""); setFilterBranch("");
    setFilterParentId(""); setFilterParentName(""); setFilterActive("");
  };

  const uniq = (key) => [...new Set(departments.map(d => d[key]).filter(Boolean))].sort();

  const filtered = departments.filter(row => {
    if (filterLevel !== "" && String(row.hierarchy_level) !== filterLevel) return false;
    if (filterNodeType !== "" && nodeTypeKey(row) !== filterNodeType)       return false;
    if (filterHolding  && row.holding_name      !== filterHolding)          return false;
    if (filterOrg      && row.organization_name !== filterOrg)              return false;
    if (filterRegion   && row.region_name       !== filterRegion)           return false;
    if (filterBranch   && row.branch_name       !== filterBranch)           return false;
    if (filterParentId   && !(row.parent_department_id   || "").toLowerCase().includes(filterParentId.toLowerCase()))   return false;
    if (filterParentName && !(row.parent_department_name || "").toLowerCase().includes(filterParentName.toLowerCase())) return false;
    if (filterName     && !(row.department_name || "").toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterActive === "active"   && !row.is_active)  return false;
    if (filterActive === "inactive" &&  row.is_active)  return false;
    return true;
  });

  const advancedActiveCount = [
    filterRegion, filterBranch, filterParentId, filterParentName, filterActive,
  ].filter(Boolean).length;

  const totalActiveCount = [
    filterLevel, filterNodeType, filterHolding, filterOrg, filterName,
    filterRegion, filterBranch, filterParentId, filterParentName, filterActive,
  ].filter(Boolean).length;

  // KPI counts
  const totalCount    = departments.length;
  const activeCount   = departments.filter(d => d.is_active).length;
  const inactiveCount = departments.filter(d => !d.is_active).length;
  const ntCounts      = Object.fromEntries(
    Object.keys(NT_CFG).map(k => [k, departments.filter(d => nodeTypeKey(d) === k).length])
  );

  const thAct = { ...thS, position: "sticky", right: 0, zIndex: 3, background: "#f9fafb",
                  boxShadow: "-2px 0 5px rgba(0,0,0,0.07)" };

  const parentOptions = departments.filter(d => d.is_active !== false && d.department_id !== editDepartmentId);

  return (
    <>
      <div style={{ background: "#f9fafb", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "10px 20px", display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>Підрозділи</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>Довідник підрозділів для PnL / планування.</div>
          </div>
          {canEdit && (
            <button onClick={openAddModal} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "none",
              background: "#7c3aed", color: "#fff", cursor: "pointer", whiteSpace: "nowrap",
              boxShadow: "0 1px 4px rgba(124,58,237,0.25)",
            }}>
              + Додати підрозділ
            </button>
          )}
        </div>

        {/* ── KPI pills ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "6px 20px", display: "flex", flexWrap: "wrap",
                      gap: 5, alignItems: "center" }}>
          <KpiPill label="Всього" value={totalCount} />
          <KpiPill label="Активних"   value={activeCount}   color="#059669"
            active={filterActive === "active"}
            onClick={() => setFilterActive(filterActive === "active" ? "" : "active")} />
          <KpiPill label="Неактивних" value={inactiveCount} color="#dc2626"
            active={filterActive === "inactive"}
            onClick={() => setFilterActive(filterActive === "inactive" ? "" : "inactive")} />
          <span style={{ color: "#e5e7eb", margin: "0 4px" }}>|</span>
          {Object.entries(NT_CFG).map(([k, cfg]) => (
            <KpiPill key={k} label={cfg.label} value={ntCounts[k] || 0} color={cfg.color}
              active={filterNodeType === k}
              onClick={() => setFilterNodeType(filterNodeType === k ? "" : k)} />
          ))}
        </div>

        {/* ── Filters ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "7px 20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 10px", alignItems: "flex-end" }}>

            <FC label="Рівень">
              <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={{ ...selS, width: 68 }}>
                <option value="">Всі</option>
                <option value="0">0</option>
                <option value="1">1</option>
              </select>
            </FC>

            <FC label="Тип вузла">
              <select value={filterNodeType} onChange={e => setFilterNodeType(e.target.value)} style={{ ...selS, minWidth: 118 }}>
                <option value="">Всі</option>
                <option value="root">Root</option>
                <option value="root_parent">Root·Parent</option>
                <option value="leaf">Leaf</option>
                <option value="parent_child">Parent·Child</option>
              </select>
            </FC>

            <FC label="Холдинг">
              <select value={filterHolding} onChange={e => setFilterHolding(e.target.value)} style={{ ...selS, minWidth: 110 }}>
                <option value="">Всі</option>
                {uniq("holding_name").map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </FC>

            <FC label="Організація">
              <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)} style={{ ...selS, minWidth: 120 }}>
                <option value="">Всі</option>
                {uniq("organization_name").map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </FC>

            <FC label="Пошук підрозділу">
              <input value={filterName} onChange={e => setFilterName(e.target.value)}
                placeholder="ID або назва…" style={{ ...inpS, width: 170 }} />
            </FC>

            <button onClick={() => setShowAdvanced(v => !v)} style={{
              alignSelf: "flex-end", padding: "4px 10px", fontSize: 11, fontWeight: 600,
              borderRadius: 4, border: "1px solid #d1d5db", background: showAdvanced ? "#f0fdf4" : "#f9fafb",
              color: showAdvanced ? "#059669" : "#374151", cursor: "pointer", whiteSpace: "nowrap",
              outline: showAdvanced ? "2px solid #bbf7d0" : "none",
            }}>
              Розширені
              {advancedActiveCount > 0 && (
                <span style={{ marginLeft: 5, background: "#7c3aed", color: "#fff",
                               borderRadius: 10, padding: "0 5px", fontSize: 10 }}>
                  {advancedActiveCount}
                </span>
              )}
            </button>

          </div>

          {showAdvanced && (
            <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid #f3f4f6",
                          display: "flex", flexWrap: "wrap", gap: "5px 10px", alignItems: "flex-end" }}>

              <FC label="Регіон">
                <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ ...selS, minWidth: 110 }}>
                  <option value="">Всі</option>
                  {uniq("region_name").map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </FC>

              <FC label="Філія">
                <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={{ ...selS, minWidth: 110 }}>
                  <option value="">Всі</option>
                  {uniq("branch_name").map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </FC>

              <FC label="Parent ID">
                <input value={filterParentId} onChange={e => setFilterParentId(e.target.value)}
                  placeholder="Частина ID…" style={{ ...inpS, width: 130 }} />
              </FC>

              <FC label="Parent підрозділ">
                <input value={filterParentName} onChange={e => setFilterParentName(e.target.value)}
                  placeholder="Частина назви…" style={{ ...inpS, width: 160 }} />
              </FC>

              <FC label="Активний">
                <select value={filterActive} onChange={e => setFilterActive(e.target.value)} style={{ ...selS, width: 100 }}>
                  <option value="">Всі</option>
                  <option value="active">Активний</option>
                  <option value="inactive">Неактивний</option>
                </select>
              </FC>

              {totalActiveCount > 0 && (
                <button onClick={resetFilters} style={{
                  alignSelf: "flex-end", padding: "4px 10px", fontSize: 11, fontWeight: 600,
                  borderRadius: 4, border: "1px solid #fca5a5", background: "#fef2f2",
                  color: "#dc2626", cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  Очистити фільтри ({totalActiveCount})
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Count info ── */}
        <div style={{ padding: "3px 20px", fontSize: 10, color: "#9ca3af", background: "#fff",
                      borderBottom: "1px solid #e5e7eb" }}>
          Показано {filtered.length} з {totalCount} підрозділів
        </div>

        {/* ── Table ── */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 170 }}>ID підрозділу</th>
                <th style={{ ...thS, width: 130 }}>Тип · Рівень</th>
                <th style={{ ...thS, width: 200 }}>Parent</th>
                <th style={{ ...thS, width: 150 }}>Холдинг · Орг</th>
                <th style={{ ...thS, width: 160 }}>Регіон · Філія</th>
                <th style={thS}>Підрозділ</th>
                <th style={{ ...thS, width: 72 }}>Активний</th>
                <th style={{ ...thAct, width: 64, textAlign: "center" }}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...tdS, textAlign: "center", padding: "32px 0", color: "#9ca3af" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                    <div>Немає підрозділів за поточними фільтрами</div>
                  </td>
                </tr>
              )}
              {filtered.map(row => {
                const ntKey = nodeTypeKey(row);
                const rbg   = row.is_active ? "#fff" : "#fff5f5";
                const rg    = row.region_name  || "";
                const br    = row.branch_name  || "";

                return (
                  <tr key={row.department_id} style={{ background: rbg, borderBottom: "1px solid #f3f4f6" }}
                      onMouseEnter={e => { e.currentTarget.style.background = row.is_active ? "#fafafa" : "#fef2f2"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = rbg; }}>

                    {/* ID */}
                    <td style={tdS}>
                      <code style={{ fontSize: 10, background: "#f3f4f6", padding: "1px 5px",
                                     borderRadius: 3, color: "#374151", whiteSpace: "nowrap" }}>
                        {row.department_id}
                      </code>
                    </td>

                    {/* Тип · Рівень */}
                    <td style={{ ...tdS, whiteSpace: "nowrap" }}>
                      <NodeTypeBadge ntKey={ntKey} level={row.hierarchy_level} childCount={row.child_count || 0} />
                    </td>

                    {/* Parent */}
                    <td style={tdS}>
                      {row.parent_department_id ? (
                        <span title={row.parent_department_name || row.parent_department_id}>
                          <code style={{ fontSize: 10, background: "#f3f4f6", padding: "1px 4px",
                                         borderRadius: 3, color: "#374151", whiteSpace: "nowrap" }}>
                            {row.parent_department_id}
                          </code>
                          {row.parent_department_name && (
                            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1,
                                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 190 }}>
                              {row.parent_department_name}
                            </div>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "#d1d5db", fontSize: 10 }}>—</span>
                      )}
                    </td>

                    {/* Холдинг · Орг */}
                    <td style={{ ...tdS, maxWidth: 150 }}>
                      {row.holding_name && (
                        <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden",
                                      textOverflow: "ellipsis", fontSize: 11 }}>
                          {row.holding_name}
                        </div>
                      )}
                      {row.organization_name && (
                        <div style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap",
                                      overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.organization_name}
                        </div>
                      )}
                      {!row.holding_name && !row.organization_name && (
                        <span style={{ color: "#d1d5db", fontSize: 10 }}>—</span>
                      )}
                    </td>

                    {/* Регіон · Філія */}
                    <td style={{ ...tdS, maxWidth: 160 }}>
                      {(() => {
                        if (!rg && !br) return <span style={{ color: "#d1d5db", fontSize: 10 }}>—</span>;
                        return (
                          <>
                            {rg && (
                              <div style={{ whiteSpace: "nowrap", overflow: "hidden",
                                            textOverflow: "ellipsis", fontSize: 11 }}>
                                {rg}
                              </div>
                            )}
                            {br && (
                              <div style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap",
                                            overflow: "hidden", textOverflow: "ellipsis" }}>
                                {br}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>

                    {/* Підрозділ */}
                    <td style={{ ...tdS, maxWidth: 260 }}>
                      <span style={{ fontWeight: 500, display: "block", whiteSpace: "nowrap",
                                     overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.department_name || "—"}
                      </span>
                    </td>

                    {/* Активний */}
                    <td style={tdS}>
                      <span style={{
                        display: "inline-block", padding: "1px 6px", borderRadius: 4,
                        fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
                        background: row.is_active ? "#d1fae5" : "#fee2e2",
                        color:      row.is_active ? "#065f46" : "#991b1b",
                      }}>
                        {row.is_active ? "Активний" : "Неактивний"}
                      </span>
                    </td>

                    {/* Дії */}
                    <td style={{ ...tdS, textAlign: "center", position: "sticky", right: 0, zIndex: 1,
                                 background: rbg, boxShadow: "-2px 0 5px rgba(0,0,0,0.04)" }}>
                      <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                        {canEdit && (
                          <button onClick={() => openEditModal(row)} title="Редагувати" style={iconBtn("blue")}>✎</button>
                        )}
                        {canEdit && row.is_active && (
                          <button onClick={() => handleDeactivate(row)} title="Деактивувати" style={iconBtn("red")}>✕</button>
                        )}
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
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
                  placeholder="Оберіть холдинг…" />
              </div>

              <div className="form-field">
                <label>Організація</label>
                <SearchableSelect
                  options={organizations} value={form.organization_name}
                  onChange={val => setForm(p => ({ ...p, organization_name: val }))}
                  getOptionValue={o => o.organization_name} getOptionLabel={o => o.organization_name}
                  placeholder="Оберіть організацію…" />
              </div>

              <div className="form-field">
                <label>Регіон</label>
                <SearchableSelect
                  options={regions} value={form.region_name}
                  onChange={val => setForm(p => ({ ...p, region_name: val }))}
                  getOptionValue={r => r.region_name} getOptionLabel={r => r.region_name}
                  placeholder="Оберіть регіон…" />
              </div>

              <div className="form-field">
                <label>Філія</label>
                <SearchableSelect
                  options={branches} value={form.branch_name}
                  onChange={val => setForm(p => ({ ...p, branch_name: val }))}
                  getOptionValue={b => b.branch_name} getOptionLabel={b => b.branch_name}
                  placeholder="Оберіть філію…" />
              </div>

              <div className="form-field full">
                <label>Підрозділ *</label>
                <input name="department_name" value={form.department_name}
                  onChange={handleChange} placeholder="Назва підрозділу" />
              </div>

              {editDepartmentId && (
                <div className="form-field checkbox-field">
                  <label>
                    <input name="is_active" type="checkbox"
                      checked={form.is_active} onChange={handleChange} />
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
              <button type="button" onClick={() => setShowModal(false)}
                style={{ padding: "7px 16px", fontSize: 13, border: "1px solid #d1d5db",
                         borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151" }}>
                Скасувати
              </button>
              <button type="submit"
                style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600, border: "none",
                         borderRadius: 6, background: "#7c3aed", color: "#fff", cursor: "pointer" }}>
                Зберегти
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default DepartmentsPage;
