import React, { useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";

import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  bulkUpdateFilteredDepartments,
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

const AUTO_TOOLTIP = "Тип вузла визначається автоматично. Щоб змінити тип — змініть батьківський підрозділ або дочірні підрозділи.";

const NT_CFG = {
  root:         { label: "• Самостійний", bg: "#f3f4f6", color: "#374151" },
  root_parent:  { label: "🌳 Верхній вузол",  bg: "#dbeafe", color: "#1e40af" },
  leaf:         { label: "📄 Кінцевий",        bg: "#d1fae5", color: "#065f46" },
  parent_child: { label: "📂 Проміжний",       bg: "#ede9fe", color: "#7c3aed" },
};
const NT_TITLES = {
  root:         `Самостійний вузол: немає батьківського підрозділу і немає дочірніх.\n${AUTO_TOOLTIP}`,
  root_parent:  `Верхній вузол: немає батьківського підрозділу, але є дочірні.\n${AUTO_TOOLTIP}`,
  leaf:         `Кінцевий підрозділ: є батьківський підрозділ, немає дочірніх.\n${AUTO_TOOLTIP}`,
  parent_child: `Проміжний вузол: є батьківський підрозділ і є дочірні.\n${AUTO_TOOLTIP}`,
};

function nodeTypeKey(row) {
  const hp = !!row.parent_department_id, hc = !!row.has_children;
  if (!hp && !hc) return "root";
  if (!hp &&  hc) return "root_parent";
  if ( hp && !hc) return "leaf";
  return "parent_child";
}

function NodeTypeBadge({ ntKey, childCount, onClickChildren }) {
  const cfg = NT_CFG[ntKey] || NT_CFG.root;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span title={NT_TITLES[ntKey] || AUTO_TOOLTIP} style={{
        fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
        background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
        display: "inline-block", cursor: "help",
      }}>
        {cfg.label}
      </span>
      {childCount > 0 && (
        <button onClick={onClickChildren} title={`Показати ${childCount} дочірніх підрозділів`}
          style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, border: "1px solid #e5e7eb",
                   background: "#f9fafb", color: "#6b7280", cursor: "pointer", whiteSpace: "nowrap" }}>
          {childCount} дочірніх
        </button>
      )}
    </span>
  );
}

// ── Hierarchy help modal ──────────────────────────────────────────────────────

function HierarchyHelpModal({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 560, width: "96%",
                    maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "flex-start" }}>
          <strong style={{ fontSize: 15 }}>Як працює ієрархія підрозділів</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.7, marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Користувач керує тільки полем Parent.</strong> Тип вузла система визначає автоматично — вручну змінити його не можна.
          </p>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li>Немає parent, немає дочірніх → <strong>• Самостійний вузол</strong></li>
            <li>Немає parent, є дочірні → <strong>🌳 Верхній вузол</strong></li>
            <li>Є parent, є дочірні → <strong>📂 Проміжний вузол</strong></li>
            <li>Є parent, немає дочірніх → <strong>📄 Кінцевий підрозділ</strong></li>
          </ol>
          <p style={{ margin: "12px 0 4px" }}>
            <strong>Org / Branch / Region — це атрибути, не hierarchy.</strong> Вони не впливають на тип вузла.
          </p>
          <p style={{ margin: 0 }}>
            Щоб змінити місце підрозділу в дереві — змініть поле <strong>Parent</strong>.
          </p>
        </div>

        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7,
                      padding: "12px 14px", fontSize: 11, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#374151" }}>Приклад структури:</div>
          {[
            { indent: 0, icon: "🌳", label: "Холдинг PROTEC", note: "Верхній вузол" },
            { indent: 1, icon: "📂", label: "Львів",          note: "Проміжний вузол" },
            { indent: 2, icon: "📄", label: "Дрогобицька філія", note: "Кінцевий підрозділ" },
            { indent: 2, icon: "📄", label: "Відділ продажів",   note: "Кінцевий підрозділ" },
            { indent: 1, icon: "📄", label: "Київ",             note: "Кінцевий підрозділ" },
          ].map(({ indent, icon, label, note }, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6,
                                  paddingLeft: indent * 20, marginBottom: 4 }}>
              {indent > 0 && <span style={{ color: "#d1d5db" }}>{"└"}</span>}
              <span>{icon} <strong>{label}</strong></span>
              <span style={{ fontSize: 10, color: "#9ca3af" }}>({note})</span>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 12px", background: "#eff6ff", border: "1px solid #93c5fd",
                      borderRadius: 6, fontSize: 11, color: "#1e40af" }}>
          <strong>Щоб змінити тип вузла:</strong> відредагуйте поле Parent. Тип перерахується автоматично після збереження.
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 18px", fontSize: 12,
                   border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", color: "#6b7280" }}>
            Зрозуміло
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Flat breadcrumb ───────────────────────────────────────────────────────────

function flatBreadcrumb(row) {
  return [row.holding_name, row.organization_name, row.region_name, row.branch_name, row.parent_department_name]
    .filter(Boolean).join(" / ");
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

  // Missing-attribute quick filters (Part 2)
  const [missingRegion,  setMissingRegion]  = useState(false);
  const [missingBranch,  setMissingBranch]  = useState(false);
  const [missingOrg,     setMissingOrg]     = useState(false);
  const [missingHolding, setMissingHolding] = useState(false);
  const [missingParent,  setMissingParent]  = useState(false);

  // Bulk-fill selection (Part 4)
  const [selectedDepts,    setSelectedDepts]    = useState(new Set());
  const [showBulkDeptFill, setShowBulkDeptFill] = useState(false);
  const [bulkDeptBanner,   setBulkDeptBanner]   = useState(null);

  // Bulk update filtered
  const [showBulkFiltered,   setShowBulkFiltered]   = useState(false);
  const [bulkFilteredBanner, setBulkFilteredBanner] = useState(null);

  const [showAdvanced,       setShowAdvanced]       = useState(false);
  const [showHierarchyHelp,  setShowHierarchyHelp]  = useState(false);
  const [showModal,          setShowModal]           = useState(false);
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
    // Case-insensitive lookup normalizes names from imported data
    const norm = (a, b) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
    const matchedRegion  = regions.find(r => norm(r.region_name,       d.region_name));
    const matchedBranch  = branches.find(b => norm(b.branch_name,      d.branch_name));
    const matchedHolding = holdings.find(h => norm(h.holding_name,     d.holding_name));
    const matchedOrg     = organizations.find(o => norm(o.organization_name, d.organization_name));
    setForm({
      department_id:          d.department_id          || "",
      holding_name:           matchedHolding?.holding_name     || d.holding_name     || "",
      organization_name:      matchedOrg?.organization_name    || d.organization_name || "",
      region_name:            matchedRegion?.region_name       || d.region_name      || "",
      branch_name:            matchedBranch?.branch_name       || d.branch_name      || "",
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
    setMissingRegion(false); setMissingBranch(false); setMissingOrg(false);
    setMissingHolding(false); setMissingParent(false);
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
    if (missingRegion  && row.region_name)       return false;
    if (missingBranch  && row.branch_name)       return false;
    if (missingOrg     && row.organization_name) return false;
    if (missingHolding && row.holding_name)      return false;
    if (missingParent  && row.parent_department_id) return false;
    return true;
  });

  const missingCount = {
    region:  departments.filter(d => !d.region_name).length,
    branch:  departments.filter(d => !d.branch_name).length,
    org:     departments.filter(d => !d.organization_name).length,
    holding: departments.filter(d => !d.holding_name).length,
    parent:  departments.filter(d => !d.parent_department_id).length,
  };

  const advancedActiveCount = [
    filterRegion, filterBranch, filterParentId, filterParentName, filterActive,
    missingRegion, missingBranch, missingOrg, missingHolding, missingParent,
  ].filter(Boolean).length;

  const totalActiveCount = [
    filterLevel, filterNodeType, filterHolding, filterOrg, filterName,
    filterRegion, filterBranch, filterParentId, filterParentName, filterActive,
    missingRegion, missingBranch, missingOrg, missingHolding, missingParent,
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
      {showHierarchyHelp && <HierarchyHelpModal onClose={() => setShowHierarchyHelp(false)} />}
      <div style={{ background: "#f9fafb", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "10px 20px", display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>Підрозділи</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>Довідник підрозділів для PnL / планування.</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {canEdit && selectedDepts.size > 0 && (
              <button onClick={() => setShowBulkDeptFill(true)}
                style={{ padding: "5px 11px", fontSize: 12, fontWeight: 500,
                         border: "1px solid #d8b4fe", borderRadius: 5,
                         background: "#faf5ff", cursor: "pointer", color: "#6d28d9" }}>
                ⬦ Заповнити атрибути ({selectedDepts.size})
              </button>
            )}
            {canEdit && filtered.length > 0 && (
              <button onClick={() => setShowBulkFiltered(true)}
                style={{ padding: "5px 11px", fontSize: 12, fontWeight: 500,
                         border: "1px solid #93c5fd", borderRadius: 5,
                         background: "#eff6ff", cursor: "pointer", color: "#1d4ed8" }}>
                ✎ Масово змінити ({filtered.length})
              </button>
            )}
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
          <span style={{ color: "#e5e7eb", margin: "0 4px" }}>|</span>
          {[
            { key: "region",  label: "Без регіону",  count: missingCount.region,  state: missingRegion,  set: setMissingRegion  },
            { key: "branch",  label: "Без філії",     count: missingCount.branch,  state: missingBranch,  set: setMissingBranch  },
            { key: "org",     label: "Без орг.",      count: missingCount.org,     state: missingOrg,     set: setMissingOrg     },
            { key: "holding", label: "Без холдингу",  count: missingCount.holding, state: missingHolding, set: setMissingHolding },
          ].filter(f => f.count > 0).map(f => (
            <KpiPill key={f.key} label={f.label} value={f.count} color="#b45309"
              active={f.state} onClick={() => f.set(v => !v)} />
          ))}
          <span style={{ marginLeft: "auto" }}>
            <button onClick={() => setShowHierarchyHelp(true)}
              title="Як працює ієрархія підрозділів"
              style={{ padding: "3px 10px", fontSize: 11, border: "1px solid #d1d5db",
                       borderRadius: 4, background: "#f9fafb", cursor: "pointer", color: "#6b7280" }}>
              ? Ієрархія
            </button>
          </span>
        </div>

        {/* ── Bulk fill success banner ── */}
        {bulkDeptBanner && (
          <div style={{ margin: "6px 20px", padding: "7px 14px", background: "#d1fae5",
                        border: "1px solid #6ee7b7", borderRadius: 6, fontSize: 13,
                        color: "#065f46", display: "flex", justifyContent: "space-between" }}>
            <span>✅ {bulkDeptBanner}</span>
            <button onClick={() => setBulkDeptBanner(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46", fontWeight: 700 }}>✕</button>
          </div>
        )}
        {bulkFilteredBanner && (
          <div style={{ margin: "6px 20px", padding: "7px 14px", background: "#dbeafe",
                        border: "1px solid #93c5fd", borderRadius: 6, fontSize: 13,
                        color: "#1e40af", display: "flex", justifyContent: "space-between" }}>
            <span>✅ {bulkFilteredBanner}</span>
            <button onClick={() => setBulkFilteredBanner(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#1e40af", fontWeight: 700 }}>✕</button>
          </div>
        )}

        {/* ── Filters ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "7px 20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 10px", alignItems: "flex-end" }}>

            <FC label="Статус parent">
              <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={{ ...selS, minWidth: 110 }}>
                <option value="">Всі</option>
                <option value="0">Без parent (root)</option>
                <option value="1">Є parent</option>
              </select>
            </FC>

            <FC label="Тип вузла">
              <select value={filterNodeType} onChange={e => setFilterNodeType(e.target.value)} style={{ ...selS, minWidth: 148 }}>
                <option value="">Всі типи</option>
                <option value="root">• Самостійний</option>
                <option value="root_parent">🌳 Верхній вузол</option>
                <option value="leaf">📄 Кінцевий</option>
                <option value="parent_child">📂 Проміжний</option>
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

              <FC label="Без атрибуту">
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {[
                    { label: `Регіон (${missingCount.region})`,  val: missingRegion,  set: setMissingRegion  },
                    { label: `Філія (${missingCount.branch})`,   val: missingBranch,  set: setMissingBranch  },
                    { label: `Орг. (${missingCount.org})`,       val: missingOrg,     set: setMissingOrg     },
                    { label: `Холдинг (${missingCount.holding})`,val: missingHolding, set: setMissingHolding },
                    { label: `Parent (${missingCount.parent})`,  val: missingParent,  set: setMissingParent  },
                  ].map(f => (
                    <label key={f.label} style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={f.val} onChange={e => f.set(e.target.checked)} />
                      {f.label}
                    </label>
                  ))}
                </div>
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
                {canEdit && (
                  <th style={{ ...thS, width: 32, textAlign: "center" }}>
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every(r => selectedDepts.has(r.department_id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedDepts(new Set(filtered.map(r => r.department_id)));
                        else setSelectedDepts(new Set());
                      }}/>
                  </th>
                )}
                <th style={{ ...thS, width: 170 }}>ID підрозділу</th>
                <th style={{ ...thS, width: 160 }}>Тип вузла</th>
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
                  <td colSpan={canEdit ? 9 : 8} style={{ ...tdS, textAlign: "center", padding: "32px 0", color: "#9ca3af" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                    <div>Немає підрозділів за поточними фільтрами</div>
                  </td>
                </tr>
              )}
              {filtered.map(row => {
                const ntKey   = nodeTypeKey(row);
                const isSel   = selectedDepts.has(row.department_id);
                const rbg     = isSel ? "#eff6ff" : (row.is_active ? "#fff" : "#fff5f5");
                const rhover  = isSel ? "#dbeafe" : (row.is_active ? "#fafafa" : "#fef2f2");
                const rg      = row.region_name  || "";
                const br      = row.branch_name  || "";

                return (
                  <tr key={row.department_id} style={{ background: rbg, borderBottom: "1px solid #f3f4f6" }}
                      onMouseEnter={e => { e.currentTarget.style.background = rhover; }}
                      onMouseLeave={e => { e.currentTarget.style.background = rbg; }}>

                    {/* Checkbox */}
                    {canEdit && (
                      <td style={{ ...tdS, textAlign: "center", width: 32 }}>
                        <input type="checkbox" checked={isSel}
                          onChange={() => setSelectedDepts(prev => {
                            const next = new Set(prev);
                            next.has(row.department_id) ? next.delete(row.department_id) : next.add(row.department_id);
                            return next;
                          })}/>
                      </td>
                    )}

                    {/* ID */}
                    <td style={tdS}>
                      <code style={{ fontSize: 10, background: "#f3f4f6", padding: "1px 5px",
                                     borderRadius: 3, color: "#374151", whiteSpace: "nowrap" }}>
                        {row.department_id}
                      </code>
                    </td>

                    {/* Тип вузла */}
                    <td style={{ ...tdS }}>
                      <NodeTypeBadge ntKey={ntKey} childCount={row.child_count || 0}
                        onClickChildren={() => setFilterParentId(row.department_id)} />
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
                          {row.parent_exists === false && (
                            <div style={{ marginTop: 2 }}>
                              <span title="У підрозділу вказаний parent_department_id, але такого parent немає у master-довіднику."
                                style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                                         background: "#fef3c7", color: "#d97706", cursor: "help" }}>
                                ⚠ Parent відсутній
                              </span>
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
                    <td style={{ ...tdS, maxWidth: 280 }}>
                      <span style={{ fontWeight: 500, display: "block", whiteSpace: "nowrap",
                                     overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.department_name || "—"}
                      </span>
                      {(() => {
                        const bc = flatBreadcrumb(row);
                        return bc ? (
                          <span title={bc} style={{ fontSize: 10, color: "#9ca3af", display: "block",
                                                    whiteSpace: "nowrap", overflow: "hidden",
                                                    textOverflow: "ellipsis", maxWidth: 260, marginTop: 1 }}>
                            {bc}
                          </span>
                        ) : null;
                      })()}
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

      {showBulkDeptFill && (
        <BulkDeptFillModal
          selectedIds={selectedDepts}
          holdings={holdings}
          organizations={organizations}
          regions={regions}
          branches={branches}
          onClose={() => setShowBulkDeptFill(false)}
          onSuccess={(count) => {
            setShowBulkDeptFill(false);
            setSelectedDepts(new Set());
            setBulkDeptBanner(`Оновлено ${count} підрозділів`);
            loadDepartments();
          }}
        />
      )}

      {showBulkFiltered && (
        <BulkFilteredModal
          filteredRows={filtered}
          holdings={holdings}
          organizations={organizations}
          regions={regions}
          branches={branches}
          departments={departments}
          onClose={() => setShowBulkFiltered(false)}
          onSuccess={(res) => {
            setShowBulkFiltered(false);
            setBulkFilteredBanner(`Оновлено ${res.updated_rows} з ${res.matched_rows} підрозділів`);
            loadDepartments();
          }}
        />
      )}
    </>
  );
}


// ── BulkDeptFillModal ─────────────────────────────────────────────────────────

const DEPT_FILL_FIELDS = [
  { key: "holding_name",      label: "Холдинг",      type: "holding" },
  { key: "organization_name", label: "Організація",  type: "org"     },
  { key: "region_name",       label: "Регіон",        type: "region"  },
  { key: "branch_name",       label: "Філія",         type: "branch"  },
];

function BulkDeptFillModal({ selectedIds, holdings, organizations, regions, branches, onClose, onSuccess }) {
  const [checked,  setChecked]  = useState({});
  const [values,   setValues]   = useState({});
  const [step,     setStep]     = useState("fields");
  const [preview,  setPreview]  = useState(null);
  const [savedUpd, setSavedUpd] = useState({});
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  const checkedCount = Object.values(checked).filter(Boolean).length;

  const buildUpdates = () => {
    const upd = {};
    for (const f of DEPT_FILL_FIELDS) {
      if (checked[f.key]) upd[f.key] = values[f.key] ?? "";
    }
    return upd;
  };

  const handlePreview = async () => {
    if (!checkedCount) { setError("Оберіть хоча б одне поле"); return; }
    const upd = buildUpdates();
    setLoading(true); setError(null);
    try {
      // Preview: count is just selectedIds.size since we always use "selected" scope here
      setPreview({ count: selectedIds.size, fields: Object.keys(upd), warnings: [] });
      setSavedUpd(upd);
      setStep("preview");
    } finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    setSaving(true); setError(null);
    try {
      const { bulkFillDepartments } = await import("../api/departmentsApi");
      const res = await bulkFillDepartments([...selectedIds], savedUpd);
      onSuccess(res.updated);
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка збереження");
    } finally { setSaving(false); }
  };

  const inp = (disabled) => ({
    padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12,
    width: "100%", background: disabled ? "#f9fafb" : "#fff", color: disabled ? "#9ca3af" : "#111827",
  });

  const renderInput = (f) => {
    const val = values[f.key] ?? "";
    const dis = !checked[f.key];
    const set = (v) => setValues(p => ({ ...p, [f.key]: v }));
    switch (f.type) {
      case "holding":
        return (
          <select value={val} disabled={dis} onChange={e => set(e.target.value)} style={inp(dis)}>
            <option value="">— очистити —</option>
            {holdings.filter(h => h.is_active !== false).map(h => (
              <option key={h.holding_id} value={h.holding_name}>{h.holding_name}</option>
            ))}
          </select>
        );
      case "org":
        return (
          <select value={val} disabled={dis} onChange={e => set(e.target.value)} style={inp(dis)}>
            <option value="">— очистити —</option>
            {organizations.filter(o => o.is_active !== false).map(o => (
              <option key={o.organization_id} value={o.organization_name}>{o.organization_name}</option>
            ))}
          </select>
        );
      case "region":
        return (
          <select value={val} disabled={dis} onChange={e => set(e.target.value)} style={inp(dis)}>
            <option value="">— очистити —</option>
            {regions.filter(r => r.is_active !== false).map(r => (
              <option key={r.region_id} value={r.region_name}>{r.region_name}</option>
            ))}
          </select>
        );
      case "branch":
        return (
          <select value={val} disabled={dis} onChange={e => set(e.target.value)} style={inp(dis)}>
            <option value="">— очистити —</option>
            {branches.filter(b => b.is_active !== false).map(b => (
              <option key={b.branch_id} value={b.branch_name}>{b.branch_name}</option>
            ))}
          </select>
        );
      default: return null;
    }
  };

  const LABELS = Object.fromEntries(DEPT_FILL_FIELDS.map(f => [f.key, f.label]));

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:2000,
                  display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:10, width:"min(560px,96vw)",
                    maxHeight:"88vh", display:"flex", flexDirection:"column",
                    boxShadow:"0 8px 32px rgba(0,0,0,.2)" }}>

        <div style={{ padding:"14px 20px", borderBottom:"1px solid #e5e7eb",
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontWeight:700, fontSize:15 }}>
            {step === "fields" ? `Заповнити атрибути (${selectedIds.size} підрозділів)` : "Підтвердження"}
          </span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
          {error && (
            <div style={{ padding:"8px 12px", background:"#fee2e2", border:"1px solid #fca5a5",
                          borderRadius:6, fontSize:12, color:"#991b1b", marginBottom:12 }}>{error}</div>
          )}

          {step === "fields" && (
            <>
              <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>Оберіть поля для заповнення:</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#f8fafc" }}>
                    <th style={{ padding:"5px 8px", width:32 }}></th>
                    <th style={{ padding:"5px 8px", textAlign:"left", fontSize:11, color:"#6b7280", fontWeight:600, width:120 }}>Поле</th>
                    <th style={{ padding:"5px 8px", textAlign:"left", fontSize:11, color:"#6b7280", fontWeight:600 }}>Нове значення</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPT_FILL_FIELDS.map(f => (
                    <tr key={f.key} style={{ borderTop:"1px solid #f1f5f9" }}>
                      <td style={{ padding:"6px 8px", textAlign:"center" }}>
                        <input type="checkbox" checked={!!checked[f.key]}
                          onChange={e => setChecked(p => ({ ...p, [f.key]: e.target.checked }))}/>
                      </td>
                      <td style={{ padding:"6px 8px", fontSize:12,
                                   fontWeight: checked[f.key] ? 600 : 400,
                                   color: checked[f.key] ? "#111827" : "#9ca3af" }}>
                        {f.label}
                      </td>
                      <td style={{ padding:"6px 8px" }}>{renderInput(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {step === "preview" && preview && (
            <>
              <div style={{ padding:"14px 18px", background:"#f0fdf4", border:"1px solid #6ee7b7",
                            borderRadius:8, marginBottom:14, display:"flex", alignItems:"baseline", gap:10 }}>
                <span style={{ fontSize:26, fontWeight:800, color:"#065f46" }}>{preview.count}</span>
                <span style={{ fontSize:13, color:"#065f46" }}>підрозділів буде оновлено</span>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>Поля що будуть змінені:</div>
                {preview.fields.map(key => {
                  const val = savedUpd[key];
                  return (
                    <div key={key} style={{ display:"flex", alignItems:"center", gap:8,
                                            padding:"5px 0", borderBottom:"1px solid #f1f5f9", fontSize:12 }}>
                      <span style={{ width:130, color:"#6b7280", flexShrink:0 }}>{LABELS[key] || key}</span>
                      <span style={{ color:"#111827", fontWeight:600 }}>
                        → {val === "" || val === null ? "(очистити)" : String(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ padding:"10px 20px", borderTop:"1px solid #e5e7eb",
                      display:"flex", justifyContent:"space-between", gap:8 }}>
          <button
            onClick={step === "preview" ? () => { setStep("fields"); setPreview(null); setError(null); } : onClose}
            style={{ padding:"6px 18px", border:"1px solid #d1d5db", borderRadius:6,
                     background:"#fff", cursor:"pointer", fontSize:12 }}>
            {step === "preview" ? "← Назад" : "Скасувати"}
          </button>

          {step === "fields" && (
            <button onClick={handlePreview} disabled={loading || !checkedCount}
              style={{ padding:"6px 20px", border:"none", borderRadius:6, fontSize:12, fontWeight:700,
                       cursor: loading || !checkedCount ? "not-allowed" : "pointer",
                       background: loading || !checkedCount ? "#e5e7eb" : "#7c3aed",
                       color:      loading || !checkedCount ? "#9ca3af" : "#fff" }}>
              {loading ? "…" : "Попередній перегляд →"}
            </button>
          )}

          {step === "preview" && (
            <button onClick={handleConfirm} disabled={saving}
              style={{ padding:"6px 20px", border:"none", borderRadius:6, fontSize:12, fontWeight:700,
                       cursor: saving ? "not-allowed" : "pointer",
                       background: saving ? "#e5e7eb" : "#059669",
                       color:      saving ? "#9ca3af" : "#fff" }}>
              {saving ? "Оновлення…" : "✓ Підтвердити"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ── BulkFilteredModal ─────────────────────────────────────────────────────────

const BULK_FIELDS = [
  { key: "holding_name",           label: "Холдинг",                 type: "holding"  },
  { key: "organization_name",      label: "Організація",             type: "org"      },
  { key: "region_name",            label: "Регіон",                  type: "region"   },
  { key: "branch_name",            label: "Філія",                   type: "branch"   },
  { key: "parent_department_id",   label: "Батьківський підрозділ",  type: "parent"   },
  { key: "is_active",              label: "Активний",                type: "active"   },
];

function BulkFilteredModal({ filteredRows, holdings, organizations, regions, branches, departments, onClose, onSuccess }) {
  const [checked,  setChecked]  = useState({});
  const [values,   setValues]   = useState({});
  const [step,     setStep]     = useState("fields");
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState(null);

  const checkedFields = BULK_FIELDS.filter(f => checked[f.key]);

  const buildUpdates = () => {
    const upd = {};
    for (const f of checkedFields) {
      if (f.type === "parent") {
        const parentRow = departments.find(d => d.department_id === values["parent_department_id"]);
        upd["parent_department_id"]   = values["parent_department_id"] || null;
        upd["parent_department_name"] = parentRow ? (parentRow.department_name || "") : "";
      } else if (f.type === "active") {
        upd["is_active"] = values["is_active"] !== false;
      } else {
        upd[f.key] = values[f.key] ?? "";
      }
    }
    return upd;
  };

  const handleConfirm = async () => {
    setApplying(true); setError(null);
    try {
      const ids = filteredRows.map(r => r.department_id);
      const res = await bulkUpdateFilteredDepartments(ids, buildUpdates());
      if (res.status === "warning") {
        setError(res.message || "Жоден рядок не змінено");
      } else {
        onSuccess(res);
      }
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка збереження");
    } finally {
      setApplying(false);
    }
  };

  const inp = (disabled) => ({
    padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12,
    width: "100%", background: disabled ? "#f9fafb" : "#fff", color: disabled ? "#9ca3af" : "#111827",
  });

  const renderInput = (f) => {
    const dis = !checked[f.key];
    const set = (v) => setValues(p => ({ ...p, [f.key]: v }));

    if (f.type === "holding") return (
      <select value={values[f.key] ?? ""} disabled={dis} onChange={e => set(e.target.value)} style={inp(dis)}>
        <option value="">— очистити —</option>
        {holdings.filter(h => h.is_active !== false).map(h => (
          <option key={h.holding_id} value={h.holding_name}>{h.holding_name}</option>
        ))}
      </select>
    );

    if (f.type === "org") return (
      <select value={values[f.key] ?? ""} disabled={dis} onChange={e => set(e.target.value)} style={inp(dis)}>
        <option value="">— очистити —</option>
        {organizations.filter(o => o.is_active !== false).map(o => (
          <option key={o.organization_id} value={o.organization_name}>{o.organization_name}</option>
        ))}
      </select>
    );

    if (f.type === "region") return (
      <select value={values[f.key] ?? ""} disabled={dis} onChange={e => set(e.target.value)} style={inp(dis)}>
        <option value="">— очистити —</option>
        {regions.filter(r => r.is_active !== false).map(r => (
          <option key={r.region_id} value={r.region_name}>{r.region_name}</option>
        ))}
      </select>
    );

    if (f.type === "branch") return (
      <select value={values[f.key] ?? ""} disabled={dis} onChange={e => set(e.target.value)} style={inp(dis)}>
        <option value="">— очистити —</option>
        {branches.filter(b => b.is_active !== false).map(b => (
          <option key={b.branch_id} value={b.branch_name}>{b.branch_name}</option>
        ))}
      </select>
    );

    if (f.type === "parent") {
      const parentOpts = departments.filter(d => d.is_active !== false);
      return (
        <SearchableSelect
          options={parentOpts}
          value={values["parent_department_id"] ?? ""}
          onChange={val => setValues(p => ({ ...p, "parent_department_id": val || "" }))}
          getOptionValue={d => d.department_id}
          getOptionLabel={d => `${d.department_name}${d.organization_name ? " · " + d.organization_name : ""}`}
          getSearchText={d => d.department_id}
          placeholder={dis ? "— не змінювати —" : "Оберіть parent або залиште порожнім для очищення…"}
          disabled={dis}
        />
      );
    }

    if (f.type === "active") return (
      <select value={values["is_active"] !== false ? "true" : "false"} disabled={dis}
        onChange={e => setValues(p => ({ ...p, "is_active": e.target.value === "true" }))} style={inp(dis)}>
        <option value="true">Активний</option>
        <option value="false">Неактивний</option>
      </select>
    );

    return null;
  };

  const LABELS = Object.fromEntries(BULK_FIELDS.map(f => [f.key, f.label]));
  const updates = step === "confirm" ? buildUpdates() : {};

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 10, width: "min(580px,96vw)",
                    maxHeight: "88vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb",
                      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {step === "fields" ? "Масова зміна підрозділів" : "Підтвердження змін"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {error && (
            <div style={{ padding: "8px 12px", background: "#fee2e2", border: "1px solid #fca5a5",
                          borderRadius: 6, fontSize: 12, color: "#991b1b", marginBottom: 12 }}>{error}</div>
          )}

          {/* Scope info */}
          <div style={{ padding: "8px 12px", background: "#eff6ff", border: "1px solid #93c5fd",
                        borderRadius: 6, fontSize: 12, color: "#1e40af", marginBottom: 14 }}>
            Буде змінено <strong>{filteredRows.length}</strong> підрозділів (відповідно до поточних фільтрів).
          </div>

          {step === "fields" && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                Оберіть поля для зміни:
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "5px 8px", width: 32 }}></th>
                    <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 11, color: "#6b7280", fontWeight: 600, width: 170 }}>Поле</th>
                    <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Нове значення</th>
                  </tr>
                </thead>
                <tbody>
                  {BULK_FIELDS.map(f => (
                    <tr key={f.key} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <input type="checkbox" checked={!!checked[f.key]}
                          onChange={e => setChecked(p => ({ ...p, [f.key]: e.target.checked }))} />
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: 12,
                                   fontWeight: checked[f.key] ? 600 : 400,
                                   color: checked[f.key] ? "#111827" : "#9ca3af" }}>
                        {f.label}
                      </td>
                      <td style={{ padding: "6px 8px" }}>{renderInput(f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {step === "confirm" && (
            <>
              <div style={{ padding: "14px 18px", background: "#fef3c7", border: "1px solid #fcd34d",
                            borderRadius: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
                  ⚠ Буде змінено {filteredRows.length} підрозділів
                </div>
                <div style={{ fontSize: 12, color: "#78350f" }}>Цю дію неможливо скасувати. Перевірте поля нижче.</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Поля що будуть змінені:</div>
                {Object.entries(updates).filter(([k]) => k !== "parent_department_name").map(([key, val]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8,
                                          padding: "5px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12 }}>
                    <span style={{ width: 180, color: "#6b7280", flexShrink: 0 }}>{LABELS[key] || key}</span>
                    <span style={{ color: "#111827", fontWeight: 600 }}>
                      → {val === "" || val === null ? "(очистити)" : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 20px", borderTop: "1px solid #e5e7eb",
                      display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button
            onClick={step === "confirm" ? () => { setStep("fields"); setError(null); } : onClose}
            style={{ padding: "6px 18px", border: "1px solid #d1d5db", borderRadius: 6,
                     background: "#fff", cursor: "pointer", fontSize: 12 }}>
            {step === "confirm" ? "← Назад" : "Скасувати"}
          </button>

          {step === "fields" && (
            <button
              onClick={() => {
                if (!checkedFields.length) { setError("Оберіть хоча б одне поле"); return; }
                setError(null); setStep("confirm");
              }}
              style={{ padding: "6px 20px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700,
                       cursor: "pointer", background: "#1d4ed8", color: "#fff" }}>
              Далі →
            </button>
          )}

          {step === "confirm" && (
            <button onClick={handleConfirm} disabled={applying}
              style={{ padding: "6px 20px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700,
                       cursor: applying ? "not-allowed" : "pointer",
                       background: applying ? "#e5e7eb" : "#dc2626",
                       color:      applying ? "#9ca3af" : "#fff" }}>
              {applying ? "Оновлення…" : `✓ Змінити ${filteredRows.length} підрозділів`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


export default DepartmentsPage;
