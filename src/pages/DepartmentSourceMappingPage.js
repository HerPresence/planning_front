import React, { useEffect, useState, useCallback } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import {
  getStagedDepartments,
  getMasterDepartments,
  bindDepartment,
  rejectDepartment,
  resetMapping,
  autoBindDepartments,
  createMasterFromSource,
  bulkFillDeptPreview,
  bulkFillDeptApply,
  bulkCreateDeptPreview,
  bulkCreateDeptApply,
  resolveContext,
  createDictEntry,
  createStandaloneDept,
  getDictEntries,
  suggestMatch,
} from "../api/departmentSourceMappingApi";

// ── Styles ────────────────────────────────────────────────────────────────────

const thS = {
  padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
  fontWeight: 600, fontSize: 10, color: "#6b7280", background: "#f9fafb",
  position: "sticky", top: 0, whiteSpace: "nowrap",
};
const tdS = { padding: "3px 8px", verticalAlign: "middle", fontSize: 11, lineHeight: 1.35 };

const selS = {
  padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 12, background: "#fff", cursor: "pointer",
};
const inpS = {
  padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12,
};
const lblS = { fontSize: 10, color: "#9ca3af", marginBottom: 2 };

// ── Extra-fields chips ────────────────────────────────────────────────────────

function ExtraFieldsChips({ fields }) {
  const entries = Object.entries(fields || {}).filter(([, v]) => v !== null && v !== "");
  if (entries.length === 0) return <span style={{ color: "#d1d5db", fontSize: 10 }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {entries.map(([k, v]) => (
        <span key={k} title={`${k}: ${v}`} style={{
          display: "inline-block", background: "#f3f4f6", border: "1px solid #e5e7eb",
          borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#374151",
          whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
        }}>
          <span style={{ color: "#9ca3af" }}>{k}:</span> {String(v)}
        </span>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:           { label: "Очікує",         bg: "#fef3c7", color: "#92400e" },
  ready_to_create:   { label: "Можна створити", bg: "#d1fae5", color: "#065f46" },
  parent_missing:    { label: "Немає parent",   bg: "#fee2e2", color: "#991b1b" },
  duplicate_warning: { label: "Дублікат ID",    bg: "#fff7ed", color: "#c2410c" },
  mapped:            { label: "Прив'язано",     bg: "#d1fae5", color: "#065f46" },
  rejected:          { label: "Відхилено",      bg: "#fee2e2", color: "#991b1b" },
  auto:              { label: "Авто",           bg: "#dbeafe", color: "#1e40af" },
};

function StatusBadge({ status, computedStatus, reason }) {
  const cfg = STATUS_CFG[computedStatus] || STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span title={reason || undefined}
      style={{ background: cfg.bg, color: cfg.color, borderRadius: 4,
               padding: "1px 6px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
               cursor: reason ? "help" : "default", display: "inline-block" }}>
      {cfg.label}
    </span>
  );
}

function KpiPill({ label, value, color, active, onClick, title }) {
  const activeColor = color || "#374151";
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex", alignItems: "baseline", gap: 5,
        padding: "3px 11px", borderRadius: 20, border: "none",
        background: active ? `${activeColor}18` : "#f3f4f6",
        outline: active ? `2px solid ${activeColor}` : "none",
        cursor: onClick ? "pointer" : "default",
        fontSize: 12, lineHeight: 1,
      }}>
      <span style={{ fontWeight: 700, fontSize: 15, color: activeColor }}>{value}</span>
      <span style={{ color: active ? activeColor : "#6b7280", fontWeight: active ? 600 : 400 }}>{label}</span>
    </button>
  );
}

// ── Hierarchy helpers ─────────────────────────────────────────────────────────

const NODE_TYPE_CFG = {
  root:         { label: "Root",         bg: "#f3f4f6", color: "#6b7280" },
  root_parent:  { label: "Root·Parent",  bg: "#dbeafe", color: "#1e40af" },
  leaf:         { label: "Leaf",         bg: "#d1fae5", color: "#065f46" },
  parent_child: { label: "Parent·Child", bg: "#ede9fe", color: "#7c3aed" },
};

const NODE_TYPE_TITLES = {
  root:         "Root: немає parent і немає дітей",
  root_parent:  "Root·Parent: немає parent, але є діти",
  leaf:         "Leaf: є parent, немає дітей",
  parent_child: "Parent·Child: є parent і є діти",
};

function NodeTypeBadge({ nodeType, level }) {
  const cfg   = NODE_TYPE_CFG[nodeType] || { label: "—", bg: "#f3f4f6", color: "#9ca3af" };
  const title = NODE_TYPE_TITLES[nodeType] || "";
  return (
    <span title={title} style={{
      fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
      display: "inline-block", cursor: "help",
    }}>
      {cfg.label}{level !== undefined && level !== null && (
        <span style={{ opacity: 0.6, marginLeft: 3, fontWeight: 400 }}>L{level}</span>
      )}
    </span>
  );
}

function HierarchyInfo({ row, prefix = "Source" }) {
  const nodeType = prefix === "Source" ? row?.source_node_type : row?.master_node_type;
  const level    = prefix === "Source" ? row?.source_level     : row?.master_level;
  const parentId = prefix === "Source" ? row?.effective_parent_id   : row?.master_parent_id;
  const parentNm = prefix === "Source" ? row?.effective_parent_name : row?.master_parent_name;
  if (!nodeType) return null;
  const cfg = NODE_TYPE_CFG[nodeType] || NODE_TYPE_CFG.leaf;
  return (
    <div style={{ padding: "6px 10px", background: "#f9fafb", border: "1px solid #e5e7eb",
                  borderRadius: 5, fontSize: 11, color: "#374151", marginBottom: 8 }}>
      <span style={{ color: "#9ca3af", marginRight: 6 }}>Поточний вузол ({prefix}):</span>
      <span style={{ fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                     background: cfg.bg, color: cfg.color, marginRight: 8 }}>
        {cfg.label}
      </span>
      <span style={{ color: "#9ca3af" }}>Рівень {level}</span>
      {parentId && (
        <div style={{ marginTop: 3, color: "#6b7280" }}>
          Parent: <code style={{ fontSize: 10, color: "#374151" }}>{parentId}</code>
          {parentNm && <span style={{ color: "#9ca3af" }}> — {parentNm}</span>}
        </div>
      )}
    </div>
  );
}

// ── BindModal ─────────────────────────────────────────────────────────────────

const COMPARE_FIELDS = [
  { label: "Організація", srcKey: "org",        masterKey: "organization_name" },
  { label: "Холдинг",     srcKey: "holding",    masterKey: "holding_name" },
  { label: "Філія",       srcKey: "branch",     masterKey: "branch_name" },
  { label: "Регіон",      srcKey: "region",     masterKey: "region_name" },
  { label: "Parent ID",   srcKey: "parentId",   masterKey: "parent_department_id" },
  { label: "Parent назва", srcKey: "parentName", masterKey: "parent_department_name" },
];

function cmpIcon(a, b) {
  if (!a && !b) return <span style={{ color: "#d1d5db" }}>—</span>;
  if (!a || !b) return <span title="Одна сторона порожня">⚠️</span>;
  return a.trim().toLowerCase() === b.trim().toLowerCase()
    ? <span style={{ color: "#059669" }}>✅</span>
    : <span style={{ color: "#dc2626" }}>❌</span>;
}

const SCORE_FIELD_LABELS = {
  dept_id: "Dept ID", dept_name: "Назва", org: "Організація",
  branch: "Філія", region: "Регіон", holding: "Холдинг",
  parent_id: "Parent ID", parent_name: "Parent назва",
};

function BindModal({ row, masters, onBind, onClose, onCreateInstead }) {
  const [search,          setSearch]          = useState("");
  const [selectedId,      setSelectedId]      = useState(row.master_department_id || "");
  const [busy,            setBusy]            = useState(false);
  const [err,             setErr]             = useState(null);
  const [suggestion,      setSuggestion]      = useState(null);
  const [loadingSuggest,  setLoadingSuggest]  = useState(false);
  const [suggestErr,      setSuggestErr]      = useState(null);

  const handleSuggest = async () => {
    setLoadingSuggest(true); setSuggestErr(null); setSuggestion(null);
    try {
      const result = await suggestMatch(row.source_id, row.source_department_id);
      setSuggestion(result);
      if (result.best_match && result.score_level !== "low") {
        setSelectedId(result.best_match.department_id);
      }
    } catch {
      setSuggestErr("Помилка підбору — спробуйте вручну");
    } finally {
      setLoadingSuggest(false);
    }
  };

  const src = {
    id:         row.source_department_id,
    name:       row.effective_department_name    || row.source_department_name || "",
    org:        row.effective_organization_name  || row.organization_name      || "",
    holding:    row.effective_holding            || row.holding_name           || "",
    branch:     row.effective_branch             || row.branch_name            || "",
    region:     row.effective_region             || row.region_name            || "",
    parentId:   row.effective_parent_id          || row.source_parent_department_id   || "",
    parentName: row.effective_parent_name        || row.source_parent_department_name || "",
  };

  const filtered = !search ? masters : masters.filter(m => {
    const q = search.toLowerCase();
    return (
      (m.department_id        || "").toLowerCase().includes(q) ||
      (m.department_name      || "").toLowerCase().includes(q) ||
      (m.organization_name    || "").toLowerCase().includes(q) ||
      (m.branch_name          || "").toLowerCase().includes(q) ||
      (m.parent_department_id || "").toLowerCase().includes(q)
    );
  });

  const selected = masters.find(m => m.department_id === selectedId) || null;

  const handleBind = async () => {
    if (!selectedId) { setErr("Оберіть master підрозділ"); return; }
    setBusy(true); setErr(null);
    try {
      await onBind(row.source_id, row.source_department_id, selectedId);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка прив'язки");
    } finally { setBusy(false); }
  };

  const TH = ({ children, w }) => (
    <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
                 fontWeight: 600, fontSize: 10, color: "#6b7280", background: "#f9fafb",
                 whiteSpace: "nowrap", width: w }}>
      {children}
    </th>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 1000, width: "97%",
                    maxHeight: "93vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        {/* ── Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      marginBottom: 14, flexShrink: 0 }}>
          <div>
            <strong style={{ fontSize: 17 }}>Прив'язати до master підрозділу</strong>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Оберіть запис з таблиці — порівняльна панель оновиться автоматично
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer",
                     fontSize: 22, color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Source context bar */}
        <div style={{ padding: "8px 14px", background: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: 6, marginBottom: 12, flexShrink: 0,
                      display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12 }}>
          <div>
            <span style={{ color: "#6b7280" }}>Source ID: </span>
            <code style={{ fontWeight: 700, color: "#1e40af" }}>{src.id}</code>
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>Назва: </span>
            <strong>{src.name}</strong>
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>Орг: </span>
            <strong>{src.org || "—"}</strong>
          </div>
          {src.branch   && <div><span style={{ color: "#6b7280" }}>Філія: </span><strong>{src.branch}</strong></div>}
          {src.region   && <div><span style={{ color: "#6b7280" }}>Регіон: </span><strong>{src.region}</strong></div>}
          {src.holding  && <div><span style={{ color: "#6b7280" }}>Холдинг: </span><strong>{src.holding}</strong></div>}
          {src.parentId && (
            <div>
              <span style={{ color: "#6b7280" }}>Parent: </span>
              <code style={{ color: "#7c3aed" }}>{src.parentId}</code>
              {src.parentName && <span style={{ color: "#9ca3af" }}> · {src.parentName}</span>}
            </div>
          )}
          {Object.keys(row.extra_fields || {}).length > 0 && (
            <div style={{ width: "100%", marginTop: 4 }}>
              <span style={{ color: "#6b7280", fontSize: 11 }}>Доп. поля: </span>
              <ExtraFieldsChips fields={row.extra_fields} />
            </div>
          )}
          {row.source_node_type && (
            <div style={{ width: "100%", marginTop: 6, display: "flex", gap: 6, alignItems: "center",
                          flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#6b7280" }}>Поточний вузол (Source):</span>
              {(() => {
                const cfg = NODE_TYPE_CFG[row.source_node_type] || NODE_TYPE_CFG.leaf;
                return (
                  <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                                 background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </span>
                );
              })()}
              <span style={{ fontSize: 11, color: "#9ca3af" }}>Рівень {row.source_level}</span>
            </div>
          )}
        </div>

        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 10, flexShrink: 0 }}>{err}</div>
        )}

        {/* ── Suggest button + panel */}
        <div style={{ marginBottom: 10, flexShrink: 0 }}>
          <button
            onClick={handleSuggest}
            disabled={loadingSuggest}
            title="Автоматично підібрати найближчий master-підрозділ за збігом ID, назви, організації та ін."
            style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600,
                     background: "#f5f3ff", border: "1px solid #a78bfa",
                     borderRadius: 5, cursor: "pointer", color: "#5b21b6" }}>
            {loadingSuggest ? "Шукаю..." : "🎯 Підібрати найкращий варіант"}
          </button>
          {suggestErr && (
            <span style={{ marginLeft: 10, fontSize: 12, color: "#dc2626" }}>{suggestErr}</span>
          )}
          {suggestion && (
            <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 6, fontSize: 12,
                          border: `1px solid ${suggestion.score_level === "high" ? "#6ee7b7" : suggestion.score_level === "medium" ? "#fde68a" : "#fca5a5"}`,
                          background: suggestion.score_level === "high" ? "#f0fdf4" : suggestion.score_level === "medium" ? "#fffbeb" : "#fff1f2" }}>
              {!suggestion.best_match ? (
                <span style={{ color: "#6b7280" }}>Жодного кандидата не знайдено</span>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "#111827" }}>
                      {suggestion.score_level === "high" ? "✅" : suggestion.score_level === "medium" ? "⚠️" : "❌"} Найкращий варіант:
                    </span>
                    <code style={{ color: "#1e40af", background: "#eff6ff", padding: "1px 8px", borderRadius: 4 }}>
                      {suggestion.best_match.department_id}
                    </code>
                    <span style={{ color: "#374151" }}>{suggestion.best_match.department_name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10,
                                   background: suggestion.score_level === "high" ? "#d1fae5" : suggestion.score_level === "medium" ? "#fef3c7" : "#fee2e2",
                                   color: suggestion.score_level === "high" ? "#065f46" : suggestion.score_level === "medium" ? "#92400e" : "#991b1b" }}>
                      {suggestion.best_match.score} балів
                    </span>
                    {suggestion.score_level === "low" && (
                      <span style={{ fontSize: 11, color: "#dc2626" }}>Низький збіг — не обрано автоматично</span>
                    )}
                  </div>
                  {suggestion.best_match.matched_fields.length > 0 && (
                    <div style={{ marginBottom: 3 }}>
                      <span style={{ color: "#6b7280" }}>Збіг: </span>
                      {suggestion.best_match.matched_fields.map(f => (
                        <span key={f} style={{ marginRight: 4, padding: "1px 6px", borderRadius: 3,
                                               background: "#d1fae5", color: "#065f46", fontSize: 11 }}>
                          {SCORE_FIELD_LABELS[f] || f}
                        </span>
                      ))}
                    </div>
                  )}
                  {suggestion.best_match.mismatched_fields.length > 0 && (
                    <div>
                      <span style={{ color: "#6b7280" }}>Розбіжність: </span>
                      {suggestion.best_match.mismatched_fields.map(f => (
                        <span key={f} style={{ marginRight: 4, padding: "1px 6px", borderRadius: 3,
                                               background: "#fee2e2", color: "#991b1b", fontSize: 11 }}>
                          {SCORE_FIELD_LABELS[f] || f}
                        </span>
                      ))}
                    </div>
                  )}
                  {suggestion.candidates.length > 1 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ color: "#9ca3af", fontSize: 11 }}>Інші кандидати:</span>
                      {suggestion.candidates.slice(1).map(c => (
                        <button key={c.department_id}
                          onClick={() => setSelectedId(c.department_id)}
                          title={`${c.department_name} · ${c.score} балів`}
                          style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer",
                                   border: "1px solid #d1d5db", borderRadius: 3,
                                   background: selectedId === c.department_id ? "#eff6ff" : "#f9fafb",
                                   color: selectedId === c.department_id ? "#1e40af" : "#374151" }}>
                          {c.department_id} <span style={{ color: "#9ca3af" }}>({c.score})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук по ID, назві, організації, філії, parent ID..."
            autoFocus
            style={{ flex: 1, padding: "7px 10px", border: "1px solid #d1d5db",
                     borderRadius: 5, fontSize: 13 }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 5,
                       background: "none", cursor: "pointer", color: "#6b7280" }}>✕</button>
          )}
          <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
            {filtered.length} / {masters.length}
          </span>
        </div>

        {/* ── Candidate table (scrollable) */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden",
                      maxHeight: 240, overflowY: "auto", flexShrink: 0, marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <TH w={60}></TH>
                <TH w={110}>Dept ID</TH>
                <TH>Назва</TH>
                <TH w={110}>Холдинг</TH>
                <TH w={140}>Організація</TH>
                <TH w={100}>Філія</TH>
                <TH w={90}>Регіон</TH>
                <TH w={90}>Parent ID</TH>
                <TH>Parent назва</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9}
                    style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
                    Нічого не знайдено
                  </td>
                </tr>
              )}
              {filtered.map(m => {
                const isSelected = m.department_id === selectedId;
                const isChild    = !!m.parent_department_id;
                return (
                  <tr key={m.department_id}
                    onClick={() => setSelectedId(m.department_id)}
                    style={{
                      cursor: "pointer",
                      background: isSelected ? "#eff6ff" : "transparent",
                      borderBottom: "1px solid #f3f4f6",
                      boxShadow: isSelected ? "inset 2px 0 0 #3b82f6" : "none",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>

                    <td style={{ padding: "4px 8px" }}>
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedId(m.department_id); }}
                        style={{
                          padding: "2px 8px", fontSize: 10, fontWeight: 700,
                          background: isSelected ? "#3b82f6" : "#f3f4f6",
                          color: isSelected ? "#fff" : "#374151",
                          border: isSelected ? "1px solid #3b82f6" : "1px solid #d1d5db",
                          borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
                        }}>
                        {isSelected ? "✓ Обрано" : "Обрати"}
                      </button>
                    </td>

                    <td style={{ padding: "4px 8px" }}>
                      <code style={{ fontSize: 10, color: "#374151" }}>{m.department_id}</code>
                    </td>

                    <td style={{ padding: "4px 8px", color: "#111827" }}>
                      {isChild ? (
                        <span style={{ color: "#6b7280", marginRight: 4, fontSize: 10 }}>↳</span>
                      ) : (
                        <span style={{ marginRight: 4, fontSize: 10 }}>📁</span>
                      )}
                      <span style={{ fontWeight: isChild ? 400 : 600 }}>{m.department_name}</span>
                    </td>

                    <td style={{ padding: "4px 8px", color: "#6b7280" }}>{m.holding_name || <span style={{ color: "#e5e7eb" }}>—</span>}</td>
                    <td style={{ padding: "4px 8px", color: "#374151" }}>{m.organization_name || <span style={{ color: "#e5e7eb" }}>—</span>}</td>
                    <td style={{ padding: "4px 8px", color: "#6b7280" }}>{m.branch_name || <span style={{ color: "#e5e7eb" }}>—</span>}</td>
                    <td style={{ padding: "4px 8px", color: "#6b7280" }}>{m.region_name || <span style={{ color: "#e5e7eb" }}>—</span>}</td>

                    <td style={{ padding: "4px 8px" }}>
                      {m.parent_department_id
                        ? <code style={{ fontSize: 10, color: "#7c3aed" }}>{m.parent_department_id}</code>
                        : <span style={{ color: "#e5e7eb" }}>—</span>}
                    </td>
                    <td style={{ padding: "4px 8px", color: "#9ca3af", fontSize: 10 }}>
                      {m.parent_department_name || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Comparison panel */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {!selected ? (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>
                Оберіть master підрозділ з таблиці. Якщо відповідного master немає — створіть новий із staging.
              </div>
            </div>
          ) : (
            <>
              {/* Selected header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  Порівняння:
                </span>
                <code style={{ fontSize: 12, color: "#1e40af", background: "#eff6ff",
                               padding: "1px 8px", borderRadius: 4 }}>
                  {selected.department_id}
                </code>
                <span style={{ fontSize: 13, color: "#374151" }}>· {selected.department_name}</span>
                {!selected.parent_department_id ? (
                  <span style={{ fontSize: 10, background: "#f3f4f6", padding: "2px 8px",
                                 borderRadius: 10, color: "#6b7280", fontWeight: 600 }}>
                    📁 Root підрозділ
                  </span>
                ) : (
                  <span style={{ fontSize: 10, background: "#ede9fe", padding: "2px 8px",
                                 borderRadius: 10, color: "#7c3aed", fontWeight: 600 }}>
                    ↳ Child → {selected.parent_department_id}
                  </span>
                )}
              </div>

              {/* Comparison table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12,
                              border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                                 color: "#6b7280", width: "14%", borderBottom: "1px solid #e5e7eb" }}>
                      Поле
                    </th>
                    <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                                 color: "#1e40af", width: "38%", borderBottom: "1px solid #e5e7eb" }}>
                      Staging (source)
                    </th>
                    <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                                 color: "#065f46", width: "38%", borderBottom: "1px solid #e5e7eb" }}>
                      Master dim_department
                    </th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontWeight: 600,
                                 width: "10%", borderBottom: "1px solid #e5e7eb" }}>
                      Збіг
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_FIELDS.map(({ label, srcKey, masterKey }) => {
                    const srcVal    = src[srcKey] || "";
                    const masterVal = (selected[masterKey] || "");
                    const match     = srcVal && masterVal &&
                      srcVal.trim().toLowerCase() === masterVal.trim().toLowerCase();
                    const mismatch  = srcVal && masterVal && !match;
                    return (
                      <tr key={label} style={{
                        background: mismatch ? "#fff7ed" : match ? "#f0fdf4" : "transparent",
                        borderBottom: "1px solid #f3f4f6",
                      }}>
                        <td style={{ padding: "5px 12px", color: "#9ca3af", fontWeight: 500 }}>
                          {label}
                        </td>
                        <td style={{ padding: "5px 12px", color: "#1d4ed8" }}>
                          {srcVal || <span style={{ color: "#d1d5db", fontStyle: "italic" }}>порожньо</span>}
                        </td>
                        <td style={{ padding: "5px 12px", color: "#065f46" }}>
                          {masterVal || <span style={{ color: "#d1d5db", fontStyle: "italic" }}>порожньо</span>}
                        </td>
                        <td style={{ padding: "5px 12px", textAlign: "center" }}>
                          {cmpIcon(srcVal, masterVal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* ── Action bar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center",
                      marginTop: 14, paddingTop: 14, borderTop: "1px solid #f3f4f6", flexShrink: 0,
                      flexWrap: "wrap" }}>
          <button
            onClick={handleBind}
            disabled={busy || !selectedId}
            style={{
              padding: "8px 24px", fontSize: 13, fontWeight: 700,
              background: selectedId ? "var(--primary, #2563eb)" : "#d1d5db",
              color: "#fff", border: "none", borderRadius: 5,
              cursor: selectedId ? "pointer" : "not-allowed",
            }}>
            {busy ? "Прив'язка..." : selectedId ? `Прив'язати → ${selectedId}` : "Оберіть master підрозділ"}
          </button>
          <button onClick={onClose}
            style={{ padding: "8px 16px", background: "none", border: "1px solid #d1d5db",
                     borderRadius: 5, cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
            Скасувати
          </button>

          {onCreateInstead && (
            <button
              onClick={() => { onClose(); onCreateInstead(row); }}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 600,
                background: "#f0fdf4", border: "1px solid #34d399",
                borderRadius: 5, cursor: "pointer", color: "#065f46",
              }}>
              + Створити master з поточного staging
            </button>
          )}

          {selected && (
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
              {COMPARE_FIELDS.filter(({ srcKey, masterKey }) => {
                const s = src[srcKey] || ""; const m = selected[masterKey] || "";
                return s && m && s.trim().toLowerCase() !== m.trim().toLowerCase();
              }).length} розбіжностей
            </span>
          )}
        </div>

      </div>
    </div>
  );
}

// ── DictLookupModal ───────────────────────────────────────────────────────────

const DICT_LABELS = {
  holding:      "Холдинг",
  organization: "Організація",
  region:       "Регіон",
  branch:       "Філія",
  department:   "Підрозділ",
};

function DictLookupModal({ dictType, onSelect, onClose }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    setLoading(true);
    getDictEntries(dictType)
      .then(setItems)
      .catch(() => setErr("Помилка завантаження довідника"))
      .finally(() => setLoading(false));
  }, [dictType]);

  const filtered = !search.trim()
    ? items
    : items.filter(it => (it.name || "").toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 20, maxWidth: 480, width: "95%",
                    maxHeight: "80vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}
           onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginBottom: 12, flexShrink: 0 }}>
          <strong style={{ fontSize: 15 }}>Вибрати з довідника: {DICT_LABELS[dictType] || dictType}</strong>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af" }}>
            ✕
          </button>
        </div>

        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Пошук за назвою..."
          style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 5,
                   fontSize: 13, marginBottom: 8, flexShrink: 0 }}
        />

        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, flexShrink: 0 }}>
          {loading ? "Завантаження..." : `${filtered.length} / ${items.length} записів`}
        </div>

        {err && (
          <div style={{ padding: "6px 10px", background: "#fee2e2", borderRadius: 5,
                        fontSize: 12, color: "#991b1b", marginBottom: 8, flexShrink: 0 }}>
            {err}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              Завантаження...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              Нічого не знайдено
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600,
                               color: "#6b7280", borderBottom: "1px solid #e5e7eb", width: 60 }}>ID</th>
                  <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600,
                               color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>Назва</th>
                  <th style={{ padding: "5px 10px", width: 70, borderBottom: "1px solid #e5e7eb" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(it => (
                  <tr key={it.id}
                    style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                    onClick={() => onSelect(it)}
                    onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "5px 10px" }}>
                      <code style={{ fontSize: 10, color: "#374151" }}>{it.id}</code>
                    </td>
                    <td style={{ padding: "5px 10px", color: "#111827", fontWeight: 500 }}>
                      {it.name}
                    </td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>
                      <button
                        onClick={e => { e.stopPropagation(); onSelect(it); }}
                        style={{ padding: "2px 10px", fontSize: 10, fontWeight: 700,
                                 background: "#f0fdf4", border: "1px solid #34d399",
                                 borderRadius: 3, cursor: "pointer", color: "#065f46",
                                 whiteSpace: "nowrap" }}>
                        Обрати
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ padding: "5px 16px", fontSize: 12, border: "1px solid #d1d5db",
                     borderRadius: 4, cursor: "pointer", background: "#fff", color: "#6b7280" }}>
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ResolutionCard ────────────────────────────────────────────────────────────

function ResolutionCard({ label, name, resolution, resolving, creating, onCreateDict, onSelectFromDict, required }) {
  const empty = !name || !name.trim();

  let bg      = "#f9fafb";
  let border  = "#e5e7eb";
  let icon    = null;
  let statusText = "";

  if (!empty) {
    if (resolving) {
      bg = "#f9fafb"; border = "#e5e7eb"; statusText = "Перевірка...";
    } else if (resolution?.found) {
      bg = "#f0fdf4"; border = "#86efac"; icon = "✅"; statusText = `ID: ${resolution.id}`;
    } else if (resolution?.required && !resolution.found) {
      bg = "#fff7ed"; border = "#fdba74"; icon = "⚠️"; statusText = "Не знайдено";
    }
  }

  return (
    <div style={{ padding: "8px 10px", background: bg, border: `1px solid ${border}`,
                  borderRadius: 6, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis" }}>
        {empty ? <span style={{ color: "#9ca3af", fontWeight: 400, fontStyle: "italic" }}>не вказано</span>
               : name.trim()}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 20, flexWrap: "wrap" }}>
        {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
        {statusText && (
          <span style={{ fontSize: 11, color: resolution?.found ? "#065f46" : "#92400e" }}>
            {statusText}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {!resolving && onSelectFromDict && (
            <button
              type="button"
              onClick={onSelectFromDict}
              style={{ fontSize: 10, fontWeight: 600,
                       padding: "2px 7px", background: "#eff6ff", border: "1px solid #93c5fd",
                       borderRadius: 3, cursor: "pointer",
                       color: "#1d4ed8", whiteSpace: "nowrap" }}>
              Вибрати
            </button>
          )}
          {!empty && resolution?.required && !resolution.found && !resolving && (
            <button
              type="button"
              onClick={onCreateDict}
              disabled={creating}
              style={{ fontSize: 10, fontWeight: 700,
                       padding: "2px 8px", background: "#fef3c7", border: "1px solid #fbbf24",
                       borderRadius: 3, cursor: creating ? "not-allowed" : "pointer",
                       color: "#92400e", whiteSpace: "nowrap" }}>
              {creating ? "..." : "+ Створити"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CreateParentModal ─────────────────────────────────────────────────────────

function CreateParentModal({ childRow, onCreated, onClose }) {
  const effParentId   = childRow.effective_parent_id   || childRow.source_parent_department_id   || "";
  const effParentName = childRow.effective_parent_name || childRow.source_parent_department_name || "";

  const [deptId,     setDeptId]     = useState(effParentId);
  const [deptName,   setDeptName]   = useState(effParentName);
  const [orgName,    setOrgName]    = useState(childRow.effective_organization_name || childRow.organization_name || "");
  const [branch,     setBranch]     = useState(childRow.effective_branch || childRow.branch_name || "");
  const [region,     setRegion]     = useState(childRow.effective_region || childRow.region_name || "");
  const [holding,    setHolding]    = useState(childRow.effective_holding || childRow.holding_name || "");
  const [parentId,   setParentId]   = useState("");
  const [parentName, setParentName] = useState("");

  const [resolution,      setResolution]      = useState(null);
  const [resolving,       setResolving]       = useState(false);
  const [resolutionStale, setResolutionStale] = useState(false);
  const [creatingDict,    setCreatingDict]    = useState(null);
  const [lookupType,      setLookupType]      = useState(null);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);

  const runResolve = useCallback(async (h, o, r, b) => {
    setResolving(true);
    setResolutionStale(false);
    try {
      const res = await resolveContext({
        holding_name:      h || null,
        organization_name: o || null,
        region_name:       r || null,
        branch_name:       b || null,
      });
      setResolution(res);
    } catch {
      setResolution(null);
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    runResolve(
      childRow.effective_holding          || childRow.holding_name          || "",
      childRow.effective_organization_name || childRow.organization_name    || "",
      childRow.effective_region           || childRow.region_name           || "",
      childRow.effective_branch           || childRow.branch_name           || "",
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateDict = async (type, name) => {
    if (!name || !name.trim()) return;
    setCreatingDict(type);
    setErr(null);
    try {
      await createDictEntry({ entry_type: type, name: name.trim() });
      await runResolve(holding, orgName, region, branch);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка створення запису довідника");
    } finally {
      setCreatingDict(null);
    }
  };

  const handleSelectFromDict = (type, item) => {
    if (type === "holding")      { setHolding(item.name); }
    if (type === "organization") { setOrgName(item.name); }
    if (type === "region")       { setRegion(item.name); }
    if (type === "branch")       { setBranch(item.name); }
    setResolution(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [type]: { required: true, found: true, id: item.id, name: item.name } };
      updated.all_resolved = ["holding", "organization", "region", "branch"].every(
        k => !updated[k]?.required || updated[k]?.found
      );
      return updated;
    });
    setResolutionStale(false);
    setLookupType(null);
  };

  const blockingMissing = resolution && !resolution.all_resolved;
  const canCreate = !busy && !resolving && !blockingMissing && !resolutionStale
                    && deptId.trim() && deptName.trim() && orgName.trim();

  const handleCreate = async () => {
    if (!deptId.trim())   { setErr("department_id обов'язковий"); return; }
    if (!deptName.trim()) { setErr("Назва підрозділу обов'язкова"); return; }
    if (!orgName.trim())  { setErr("Організація обов'язкова"); return; }
    if (blockingMissing)  { setErr("Деякі записи довідника не знайдені."); return; }
    const autoBindSrcDeptId = (childRow.effective_parent_id || childRow.source_parent_department_id || "").trim();
    setBusy(true); setErr(null);
    try {
      const res = await createStandaloneDept({
        department_id:          deptId.trim(),
        department_name:        deptName.trim(),
        organization_name:      orgName.trim(),
        parent_department_id:   parentId.trim()   || null,
        parent_department_name: parentName.trim() || null,
        branch_name:            branch.trim()     || null,
        region_name:            region.trim()     || null,
        holding_name:           holding.trim()    || null,
        holding_id:             resolution?.holding?.id      ?? null,
        organization_id:        resolution?.organization?.id ?? null,
        region_id:              resolution?.region?.id       ?? null,
        branch_id:              resolution?.branch?.id       ?? null,
        auto_bind_source_id:            childRow.source_id || null,
        auto_bind_source_department_id: autoBindSrcDeptId  || null,
      });
      onCreated(res.department_id, res.department_name, res.parent_bound === true);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка створення батьківського підрозділу");
    } finally {
      setBusy(false);
    }
  };

  const inS    = { display: "block", width: "100%", padding: "6px 8px", marginTop: 3,
                   border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
  const inSReq = { ...inS, borderColor: "#3b82f6" };

  const DICT_ITEMS = [
    { key: "holding",      label: "Холдинг",     type: "holding",      name: holding,  required: false },
    { key: "organization", label: "Організація", type: "organization", name: orgName,  required: true  },
    { key: "region",       label: "Регіон",      type: "region",       name: region,   required: false },
    { key: "branch",       label: "Філія",       type: "branch",       name: branch,   required: false },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 580, width: "95%",
                    maxHeight: "93vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}
           onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <strong style={{ fontSize: 16 }}>Створити батьківський підрозділ</strong>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Після збереження буде знято блокування дочірнього підрозділу
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        <div style={{ padding: "7px 12px", background: "#fefce8", border: "1px solid #fde047",
                      borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          <span style={{ color: "#713f12" }}>Дочірній підрозділ: </span>
          <code style={{ color: "#92400e", fontWeight: 700 }}>{childRow.source_department_id}</code>
          {" · "}{childRow.effective_department_name || childRow.source_department_name || ""}
        </div>

        {/* Resolution panel */}
        <div style={{ marginBottom: 14, padding: "12px 14px", background: "#f9fafb",
                      border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Перевірка довідників</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {resolutionStale && (
                <span style={{ fontSize: 11, color: "#d97706" }}>Дані змінились — перевірте знову</span>
              )}
              <button type="button" onClick={() => runResolve(holding, orgName, region, branch)}
                disabled={resolving}
                style={{ fontSize: 11, padding: "3px 10px", border: "1px solid #d1d5db",
                         borderRadius: 4, background: "#fff", cursor: resolving ? "not-allowed" : "pointer",
                         color: "#374151" }}>
                {resolving ? "..." : "↻ Перевірити"}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {DICT_ITEMS.map(({ key, label, type, name, required }) => (
              <ResolutionCard
                key={key}
                label={label}
                name={name}
                resolution={resolution?.[key]}
                resolving={resolving}
                creating={creatingDict === type}
                required={required}
                onCreateDict={() => handleCreateDict(type, name)}
                onSelectFromDict={() => setLookupType(type)}
              />
            ))}
          </div>
          {blockingMissing && !resolving && (
            <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff7ed",
                          border: "1px solid #fdba74", borderRadius: 5, fontSize: 12, color: "#92400e" }}>
              ⚠ Деякі записи відсутні в довідниках. Натисніть «+ Створити» або «Вибрати».
            </div>
          )}
        </div>

        {lookupType && (
          <DictLookupModal
            dictType={lookupType}
            onSelect={item => handleSelectFromDict(lookupType, item)}
            onClose={() => setLookupType(null)}
          />
        )}

        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 10 }}>{err}</div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Department ID <span style={{ color: "#ef4444" }}>*</span>
            <input value={deptId} onChange={e => setDeptId(e.target.value)} style={inSReq} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Назва підрозділу <span style={{ color: "#ef4444" }}>*</span>
            <input value={deptName} onChange={e => setDeptName(e.target.value)} style={inSReq} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Організація <span style={{ color: "#ef4444" }}>*</span>
            <input value={orgName}
                   onChange={e => { setOrgName(e.target.value); setResolutionStale(true); }}
                   style={inSReq} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Parent ID (власний)
              <input value={parentId} onChange={e => setParentId(e.target.value)} style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Parent назва
              <input value={parentName} onChange={e => setParentName(e.target.value)} style={inS} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Філія
              <input value={branch}
                     onChange={e => { setBranch(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Регіон
              <input value={region}
                     onChange={e => { setRegion(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Холдинг
              <input value={holding}
                     onChange={e => { setHolding(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{
              padding: "7px 20px",
              background: canCreate ? "#059669" : "#9ca3af",
              color: "#fff", border: "none", borderRadius: 4,
              cursor: canCreate ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600,
            }}>
            {busy ? "..." : "Створити parent-підрозділ"}
          </button>
          <button onClick={onClose} className="btn btn-secondary">Скасувати</button>
          {resolving && <span style={{ fontSize: 11, color: "#9ca3af" }}>Перевірка довідників...</span>}
        </div>
      </div>
    </div>
  );
}

// ── CreateModal ───────────────────────────────────────────────────────────────

function CreateModal({ row, onCreate, onClose }) {
  const [deptId,     setDeptId]     = useState(row.effective_department_id    || row.source_department_id           || "");
  const [deptName,   setDeptName]   = useState(row.effective_department_name  || row.source_department_name         || "");
  const [orgName,    setOrgName]    = useState(row.effective_organization_name || row.organization_name              || "");
  const [parentId,   setParentId]   = useState(row.effective_parent_id        || row.source_parent_department_id    || "");
  const [parentName, setParentName] = useState(row.effective_parent_name      || row.source_parent_department_name  || "");
  const [branch,     setBranch]     = useState(row.effective_branch           || row.branch_name  || "");
  const [region,     setRegion]     = useState(row.effective_region           || row.region_name  || "");
  const [holding,    setHolding]    = useState(row.effective_holding          || row.holding_name || "");

  const [resolution,      setResolution]      = useState(null);
  const [resolving,       setResolving]       = useState(false);
  const [resolutionStale, setResolutionStale] = useState(false);
  const [creatingDict,    setCreatingDict]    = useState(null);
  const [lookupType,      setLookupType]      = useState(null);

  const [parentCreated,    setParentCreated]    = useState(false);
  const [parentBound,      setParentBound]      = useState(false);
  const [showParentCreate, setShowParentCreate] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);

  const runResolve = useCallback(async (h, o, r, b) => {
    setResolving(true);
    setResolutionStale(false);
    try {
      const res = await resolveContext({
        holding_name:      h || null,
        organization_name: o || null,
        region_name:       r || null,
        branch_name:       b || null,
      });
      setResolution(res);
    } catch {
      setResolution(null);
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    runResolve(
      row.effective_holding           || row.holding_name          || "",
      row.effective_organization_name || row.organization_name     || "",
      row.effective_region            || row.region_name           || "",
      row.effective_branch            || row.branch_name           || "",
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateDict = async (type, name) => {
    if (!name || !name.trim()) return;
    setCreatingDict(type);
    setErr(null);
    try {
      await createDictEntry({ entry_type: type, name: name.trim() });
      await runResolve(holding, orgName, region, branch);
    } catch (e) {
      setErr(e?.response?.data?.detail || `Помилка створення запису довідника`);
    } finally {
      setCreatingDict(null);
    }
  };

  const handleSelectFromDict = (type, item) => {
    if (type === "holding")      { setHolding(item.name); }
    if (type === "organization") { setOrgName(item.name); }
    if (type === "region")       { setRegion(item.name); }
    if (type === "branch")       { setBranch(item.name); }
    setResolution(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [type]: { required: true, found: true, id: item.id, name: item.name } };
      updated.all_resolved = ["holding", "organization", "region", "branch"].every(
        k => !updated[k]?.required || updated[k]?.found
      );
      return updated;
    });
    setResolutionStale(false);
    setLookupType(null);
  };

  const handleCreate = async () => {
    if (!deptId.trim())   { setErr("department_id обов'язковий"); return; }
    if (!deptName.trim()) { setErr("Назва підрозділу обов'язкова"); return; }
    if (!orgName.trim())  { setErr("Організація обов'язкова"); return; }
    if (resolution && !resolution.all_resolved) {
      setErr("Деякі записи довідника не знайдені. Натисніть «+ Створити» або очистіть відповідне поле.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      await onCreate({
        source_id:              row.source_id,
        source_department_id:   row.source_department_id,
        department_id:          deptId.trim(),
        department_name:        deptName.trim(),
        organization_name:      orgName.trim(),
        parent_department_id:   parentId.trim()   || null,
        parent_department_name: parentName.trim() || null,
        branch_name:            branch.trim()     || null,
        region_name:            region.trim()     || null,
        holding_name:           holding.trim()    || null,
        holding_id:             resolution?.holding?.id      ?? null,
        organization_id:        resolution?.organization?.id ?? null,
        region_id:              resolution?.region?.id       ?? null,
        branch_id:              resolution?.branch?.id       ?? null,
      });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка створення");
    } finally { setBusy(false); }
  };

  const inS    = { display: "block", width: "100%", padding: "6px 8px", marginTop: 3,
                   border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
  const inSReq = { ...inS, borderColor: "#3b82f6" };

  const effectiveParentMissing = row.parent_missing && !parentCreated;
  const blockingMissing = resolution && !resolution.all_resolved;
  const canCreate = !busy && !resolving && !effectiveParentMissing && !blockingMissing && !resolutionStale;

  const DICT_ITEMS = [
    { key: "holding",      label: "Холдинг",     type: "holding",      name: holding,  required: false },
    { key: "organization", label: "Організація", type: "organization", name: orgName,  required: true  },
    { key: "region",       label: "Регіон",      type: "region",       name: region,   required: false },
    { key: "branch",       label: "Філія",       type: "branch",       name: branch,   required: false },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 620, width: "95%",
                    maxHeight: "93vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <strong style={{ fontSize: 16 }}>Створити master-підрозділ</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        {/* Source info */}
        <div style={{ padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: "#1e40af" }}>Джерело:</span>{" "}
          <strong>{row.source_department_id}</strong>
          {row.source_department_name ? ` · ${row.source_department_name}` : ""}
          {row.source_name ? <span style={{ color: "#6b7280" }}> ({row.source_name})</span> : ""}
        </div>

        {/* Source hierarchy context */}
        <HierarchyInfo row={row} prefix="Source" />

        {/* Parent missing — interactive block */}
        {effectiveParentMissing && (
          <div style={{ padding: "10px 12px", background: "#fee2e2", border: "1px solid #fca5a5",
                        borderRadius: 6, fontSize: 12, color: "#991b1b", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              ⛔ Батьківський підрозділ «{row.effective_parent_id || row.source_parent_department_id}» не знайдено в dim_department.
            </div>
            <div style={{ color: "#7f1d1d", marginBottom: 8 }}>
              Щоб продовжити, спочатку створіть батьківський підрозділ.
            </div>
            <button
              type="button"
              onClick={() => setShowParentCreate(true)}
              disabled={!(row.effective_parent_id || row.source_parent_department_id)}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 700,
                background: "#fff", border: "1px solid #fca5a5",
                borderRadius: 4, cursor: "pointer", color: "#991b1b",
              }}>
              Спочатку створити parent-підрозділ
            </button>
          </div>
        )}

        {/* Parent created confirmation */}
        {!effectiveParentMissing && parentCreated && (
          <div style={{ padding: "8px 12px", background: "#d1fae5", border: "1px solid #6ee7b7",
                        borderRadius: 6, fontSize: 12, color: "#065f46", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>✅ Parent створено. Тепер можна створити поточний підрозділ.</div>
            {parentBound && (
              <div style={{ fontSize: 11, color: "#065f46", marginTop: 3 }}>
                Staging-рядок parent автоматично прив'язано.
              </div>
            )}
          </div>
        )}

        {/* Nested parent create modal */}
        {showParentCreate && (
          <CreateParentModal
            childRow={row}
            onCreated={(deptId, deptName, bound) => {
              setParentCreated(true);
              setParentBound(!!bound);
              setShowParentCreate(false);
            }}
            onClose={() => setShowParentCreate(false)}
          />
        )}

        {/* ── Resolution panel */}
        <div style={{ marginBottom: 14, padding: "12px 14px", background: "#f9fafb",
                      border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
              Перевірка довідників
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {resolutionStale && (
                <span style={{ fontSize: 11, color: "#d97706" }}>Дані змінились — перевірте знову</span>
              )}
              <button
                type="button"
                onClick={() => runResolve(holding, orgName, region, branch)}
                disabled={resolving}
                style={{ fontSize: 11, padding: "3px 10px", border: "1px solid #d1d5db",
                         borderRadius: 4, background: "#fff", cursor: resolving ? "not-allowed" : "pointer",
                         color: "#374151" }}>
                {resolving ? "..." : "↻ Перевірити"}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {DICT_ITEMS.map(({ key, label, type, name, required }) => (
              <ResolutionCard
                key={key}
                label={label}
                name={name}
                resolution={resolution?.[key]}
                resolving={resolving}
                creating={creatingDict === type}
                required={required}
                onCreateDict={() => handleCreateDict(type, name)}
                onSelectFromDict={() => setLookupType(type)}
              />
            ))}
          </div>
          {blockingMissing && !resolving && (
            <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff7ed",
                          border: "1px solid #fdba74", borderRadius: 5, fontSize: 12, color: "#92400e" }}>
              ⚠ Деякі записи відсутні в довідниках. Натисніть «+ Створити» або «Вибрати».
            </div>
          )}
        </div>

        {lookupType && (
          <DictLookupModal
            dictType={lookupType}
            onSelect={item => handleSelectFromDict(lookupType, item)}
            onClose={() => setLookupType(null)}
          />
        )}

        {/* Error */}
        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 10 }}>{err}</div>
        )}

        {/* Core fields */}
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Department ID <span style={{ color: "#ef4444" }}>*</span>
            <input value={deptId} onChange={e => setDeptId(e.target.value)} style={inSReq} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Назва підрозділу <span style={{ color: "#ef4444" }}>*</span>
            <input value={deptName} onChange={e => setDeptName(e.target.value)}
                   placeholder="Назва master-підрозділу" style={inSReq} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Організація <span style={{ color: "#ef4444" }}>*</span>
            <input value={orgName}
                   onChange={e => { setOrgName(e.target.value); setResolutionStale(true); }}
                   placeholder="Організація" style={inSReq} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Parent ID
              <input value={parentId} onChange={e => setParentId(e.target.value)} style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Parent назва
              <input value={parentName} onChange={e => setParentName(e.target.value)} style={inS} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Філія
              <input value={branch}
                     onChange={e => { setBranch(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Регіон
              <input value={region}
                     onChange={e => { setRegion(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Холдинг
              <input value={holding}
                     onChange={e => { setHolding(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
          </div>
        </div>

        {/* Extra fields */}
        {Object.keys(row.extra_fields || {}).length > 0 && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: "#f9fafb",
                        border: "1px solid #e5e7eb", borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
              Додаткові поля з джерела
            </div>
            <ExtraFieldsChips fields={row.extra_fields} />
          </div>
        )}

        <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
          Значення попередньо заповнені з default_* або source полів. Усі поля редаговані.
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{ padding: "7px 20px",
                     background: canCreate ? "var(--primary, #2563eb)" : "#9ca3af",
                     color: "#fff", border: "none", borderRadius: 4,
                     cursor: canCreate ? "pointer" : "not-allowed",
                     fontSize: 13, fontWeight: 600 }}>
            {busy ? "..." : "Створити цей підрозділ і прив'язати"}
          </button>
          <button onClick={onClose} className="btn btn-secondary">Скасувати</button>
          {resolving && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Перевірка довідників...</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bulk fill helpers ─────────────────────────────────────────────────────────

// type: "text" | "dict" | "dept"
// dict fields require selecting from a dictionary (DictLookupModal)
// dept fields require selecting from dim_department
const FILL_FIELD_CONFIG = [
  { value: "department_name",   label: "Назва підрозділу", type: "text" },
  { value: "organization_name", label: "Організація",      type: "dict", dictType: "organization" },
  { value: "holding_name",      label: "Холдинг",          type: "dict", dictType: "holding"       },
  { value: "region_name",       label: "Регіон",           type: "dict", dictType: "region"        },
  { value: "branch_name",       label: "Філія",            type: "dict", dictType: "branch"        },
  { value: "parent_department", label: "Parent підрозділ", type: "dept" },
];

function buildApiFilters(f) {
  return {
    source_id:              f.filterSource       ? Number(f.filterSource) : null,
    organization_name:      f.filterOrg          || null,
    branch_name:            f.filterBranch       || null,
    region_name:            f.filterRegion       || null,
    master_department_id:   f.filterMaster       || null,
    mapping_status:         (f.filterStatus && f.filterStatus !== "all") ? f.filterStatus : null,
    computed_status:        f.filterComputedStatus || null,
    search:                 f.search             || null,
    has_parent:             f.filterHasParent    || null,
    parent_status:          f.filterParentStatus || null,
    parent_department_id:   f.filterParentId     || null,
    parent_department_name: f.filterParentName   || null,
    source_level:           f.filterSourceLevel !== "" ? Number(f.filterSourceLevel) : null,
    source_node_type:       f.filterSourceType   || null,
  };
}

function hasFilter(f) {
  return !!(
    f.filterSource || f.filterOrg || f.filterBranch || f.filterRegion || f.filterMaster ||
    (f.filterStatus && f.filterStatus !== "all") || f.filterComputedStatus || f.search ||
    f.filterHasParent || f.filterParentStatus || f.filterParentId || f.filterParentName ||
    f.filterSourceLevel !== "" || f.filterSourceType
  );
}

// ── BulkFillModal ─────────────────────────────────────────────────────────────

function BulkFillModal({ filters, onClose, onSuccess }) {
  const [field,      setField]      = useState("");
  const [value,      setValue]      = useState("");    // display name / free text
  const [valueId,    setValueId]    = useState(null);  // dict ID or dept_id (null for text fields)
  const [preview,    setPreview]    = useState(null);
  const [loadingP,   setLoadingP]   = useState(false);
  const [applying,   setApplying]   = useState(false);
  const [error,      setError]      = useState(null);
  const [showLookup, setShowLookup] = useState(false);

  const noFilter  = !hasFilter(filters);
  const fieldCfg  = FILL_FIELD_CONFIG.find(o => o.value === field);

  const resetValue = () => { setValue(""); setValueId(null); setPreview(null); setError(null); };

  const handleFieldChange = (e) => { setField(e.target.value); resetValue(); };

  const handleSelectItem = (item) => {
    setValue(item.name || "");
    setValueId(item.id != null ? item.id : null);
    setShowLookup(false);
    setPreview(null);
    setError(null);
  };

  const isValueReady = !!field && (
    fieldCfg?.type === "text"
      ? !!value.trim()
      : (!!value && valueId != null)
  );

  const lookupDictType = fieldCfg?.type === "dept"
    ? "department"
    : (fieldCfg?.type === "dict" ? fieldCfg.dictType : null);

  const handlePreview = async () => {
    if (!isValueReady) { setError("Оберіть поле та значення"); return; }
    setLoadingP(true); setError(null); setPreview(null);
    try {
      const res = await bulkFillDeptPreview({
        filters:  buildApiFilters(filters),
        field,
        value:    value.trim(),
        value_id: valueId != null ? String(valueId) : null,
      });
      if (res.status === "ok") setPreview(res);
      else setError(res.message || "Помилка preview");
    } catch { setError("Помилка preview"); }
    finally { setLoadingP(false); }
  };

  const handleApply = async () => {
    if (!preview || preview.total_affected_count === 0) return;
    setApplying(true); setError(null);
    try {
      const res = await bulkFillDeptApply({
        filters:  buildApiFilters(filters),
        field,
        value:    value.trim(),
        value_id: valueId != null ? String(valueId) : null,
        confirm:  true,
      });
      if (res.status === "ok") onSuccess(res);
      else setError(res.message || "Помилка застосування");
    } catch { setError("Помилка застосування"); }
    finally { setApplying(false); }
  };

  return (
    <Modal title="Масове заповнення полів підрозділу" onClose={onClose} size="large">
      {showLookup && lookupDictType && (
        <DictLookupModal
          dictType={lookupDictType}
          onSelect={handleSelectItem}
          onClose={() => setShowLookup(false)}
        />
      )}
      {noFilter && (
        <div className="bulk-fill-warning">
          Масове заповнення недоступне без активного фільтра.
        </div>
      )}
      {!noFilter && (
        <>
          {/* Field selector */}
          <div className="form-row" style={{ marginTop: 12 }}>
            <select value={field} onChange={handleFieldChange}>
              <option value="">— Оберіть поле —</option>
              {FILL_FIELD_CONFIG.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Value input — varies by field type */}
          {field && fieldCfg?.type === "text" && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <input
                type="text" value={value}
                onChange={e => { setValue(e.target.value); setPreview(null); }}
                placeholder={`Значення для «${fieldCfg.label}»...`}
              />
            </div>
          )}

          {field && (fieldCfg?.type === "dict" || fieldCfg?.type === "dept") && (
            <div style={{ marginTop: 10 }}>
              {value ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, background: "#f0fdf4", border: "1px solid #86efac",
                                 borderRadius: 4, padding: "4px 10px", color: "#166534" }}>
                    {value}
                    {valueId != null && (
                      <span style={{ marginLeft: 6, color: "#6b7280", fontSize: 11 }}>
                        [{valueId}]
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => { setShowLookup(true); setPreview(null); }}
                    style={{ fontSize: 11, padding: "3px 8px", background: "#eff6ff",
                             border: "1px solid #93c5fd", borderRadius: 3, cursor: "pointer",
                             color: "#1d4ed8" }}>
                    Змінити
                  </button>
                  <button type="button" onClick={resetValue}
                    style={{ fontSize: 11, padding: "3px 8px", background: "#fee2e2",
                             border: "1px solid #fca5a5", borderRadius: 3, cursor: "pointer",
                             color: "#991b1b" }}>
                    ✕ Скинути
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowLookup(true)}
                  style={{ fontSize: 12, padding: "6px 14px", background: "#eff6ff",
                           border: "1px solid #93c5fd", borderRadius: 4, cursor: "pointer",
                           color: "#1d4ed8" }}>
                  Вибрати зі списку...
                </button>
              )}
            </div>
          )}

          {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}

          {preview && (
            <div className="bulk-fill-preview">
              <div className="bulk-fill-preview-row">
                <span>Поле</span><strong>{preview.field_label}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Нове значення</span>
                <strong>
                  {preview.value}
                  {preview.value_id && (
                    <span style={{ marginLeft: 6, color: "#6b7280", fontSize: 11 }}>
                      [{preview.value_id}]
                    </span>
                  )}
                </strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Master-підрозділів для оновлення</span>
                <strong>{preview.affected_master_count}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Pending рядків (default значення)</span>
                <strong>{preview.affected_source_count}</strong>
              </div>
              {preview.affected_master_count > 0 && (
                <div className="bulk-fill-warning">
                  Увага: будуть оновлені реальні поля у dim_department для {preview.affected_master_count} підрозділів.
                </div>
              )}
              {(preview.warnings || []).map((w, i) => (
                <div key={i} className="bulk-fill-warning">{w}</div>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button variant="secondary" onClick={handlePreview} disabled={!isValueReady || loadingP}>
              {loadingP ? "Розрахунок..." : "Перевірити"}
            </Button>
            <Button variant="primary" onClick={handleApply}
                    disabled={!preview || preview.total_affected_count === 0 || applying}>
              {applying ? "Застосування..." : `Застосувати (${preview?.total_affected_count ?? 0})`}
            </Button>
          </div>
        </>
      )}
      {noFilter && (
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Закрити</Button>
        </div>
      )}
    </Modal>
  );
}

// ── BulkCreateModal ───────────────────────────────────────────────────────────

function BulkCreateModal({ filters, onClose, onSuccess }) {
  const [preview,  setPreview]  = useState(null);
  const [loadingP, setLoadingP] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState(null);

  const noFilter = !hasFilter(filters);

  const handlePreview = async () => {
    setLoadingP(true); setError(null); setPreview(null);
    try {
      const res = await bulkCreateDeptPreview({ filters: buildApiFilters(filters) });
      if (res.status === "ok") setPreview(res);
      else setError(res.message || "Помилка перевірки");
    } catch { setError("Помилка перевірки"); }
    finally { setLoadingP(false); }
  };

  const handleApply = async () => {
    if (!preview?.can_apply) return;
    setApplying(true); setError(null);
    try {
      const res = await bulkCreateDeptApply({ filters: buildApiFilters(filters), confirm: true });
      if (res.status === "ok") onSuccess(res);
      else setError(res.message || "Помилка створення");
    } catch { setError("Помилка створення"); }
    finally { setApplying(false); }
  };

  return (
    <Modal title="Масове створення master-підрозділів" onClose={onClose} size="large">
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        Створює master-підрозділи для pending рядків, де заповнені ID, назва, організація,
        і parent (якщо є) знайдений у довіднику. Рядки з parent_missing, дублікатами або
        відсутніми полями залишаються в staging без змін.
      </div>
      {noFilter && (
        <div className="bulk-fill-warning">
          Масове створення недоступне без активного фільтра.
        </div>
      )}
      {!noFilter && (
        <>
          {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}
          {preview && (
            <div className="bulk-create-preview">
              <div className="bulk-create-preview-title">Результат перевірки</div>
              <div className="bulk-create-stat-row">
                <span>Pending рядків у фільтрі</span><strong>{preview.total_pending}</strong>
              </div>
              <div className="bulk-create-divider" />
              <div className="bulk-create-stat-row eligible">
                <span><span className="bulk-create-dot green" />Готові до створення</span>
                <strong className="text-success">{preview.will_create}</strong>
              </div>
              {preview.missing_id > 0 && (
                <div className="bulk-create-stat-row missing">
                  <span><span className="bulk-create-dot gray" />Не вистачає ID</span>
                  <strong>{preview.missing_id}</strong>
                </div>
              )}
              {preview.missing_name > 0 && (
                <div className="bulk-create-stat-row missing">
                  <span><span className="bulk-create-dot gray" />Не вистачає назви</span>
                  <strong>{preview.missing_name}</strong>
                </div>
              )}
              {preview.missing_org > 0 && (
                <div className="bulk-create-stat-row missing">
                  <span><span className="bulk-create-dot gray" />Не вистачає організації</span>
                  <strong>{preview.missing_org}</strong>
                </div>
              )}
              {preview.skipped_existing > 0 && (
                <div className="bulk-create-stat-row skipped">
                  <span><span className="bulk-create-dot orange" />Дублікати ID</span>
                  <strong className="text-warning">{preview.skipped_existing}</strong>
                </div>
              )}
              {preview.parent_missing > 0 && (
                <div className="bulk-create-stat-row missing">
                  <span><span className="bulk-create-dot gray" />Немає parent у довіднику</span>
                  <strong>{preview.parent_missing}</strong>
                </div>
              )}
              {preview.can_apply && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#fffbeb",
                              border: "1px solid #fcd34d", borderRadius: 5, fontSize: 12,
                              color: "#92400e" }}>
                  Буде створено <strong>{preview.will_create}</strong> master-підрозділів.
                  Рядки з parent_missing / дублікатами / відсутніми полями залишаться в staging.
                </div>
              )}
            </div>
          )}
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button variant="secondary" onClick={handlePreview} disabled={loadingP}>
              {loadingP ? "Перевірка..." : "Перевірити"}
            </Button>
            <Button variant="primary" onClick={handleApply} disabled={!preview?.can_apply || applying}>
              {applying ? "Створення..." : `Створити (${preview?.will_create ?? 0})`}
            </Button>
          </div>
        </>
      )}
      {noFilter && (
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Закрити</Button>
        </div>
      )}
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function DepartmentSourceMappingPage({ initialSourceId = "", setActivePage }) {
  const [data,          setData]          = useState(null);
  const [masters,       setMasters]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [autoBinding,   setAutoBinding]   = useState(false);
  const [bindRow,       setBindRow]       = useState(null);
  const [createRow,     setCreateRow]     = useState(null);
  const [showBulkFill,  setShowBulkFill]  = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [error,         setError]         = useState(null);
  const [success,       setSuccess]       = useState(null);

  // Filters
  const [filterSource,  setFilterSource]  = useState(initialSourceId || "");
  const [filterOrg,     setFilterOrg]     = useState("");
  const [filterBranch,  setFilterBranch]  = useState("");
  const [filterRegion,  setFilterRegion]  = useState("");
  const [filterMaster,  setFilterMaster]  = useState("");
  const [filterStatus,          setFilterStatus]          = useState("pending");
  const [filterComputedStatus,  setFilterComputedStatus]  = useState("");
  const [filterHasParent,       setFilterHasParent]       = useState("");
  const [filterParentStatus,    setFilterParentStatus]    = useState("");
  const [filterParentId,        setFilterParentId]        = useState("");
  const [filterParentName,      setFilterParentName]      = useState("");
  const [filterSourceLevel,     setFilterSourceLevel]     = useState("");
  const [filterSourceType,      setFilterSourceType]      = useState("");
  const [filterSourceChanged,   setFilterSourceChanged]   = useState("");
  const [search,                setSearch]                = useState("");
  const [searchInput,           setSearchInput]           = useState("");
  const [parentIdInput,         setParentIdInput]         = useState("");
  const [parentNameInput,       setParentNameInput]       = useState("");
  const [showLegend,            setShowLegend]            = useState(false);
  const [showAdvanced,          setShowAdvanced]          = useState(false);
  const [page,                  setPage]                  = useState(1);
  const PAGE_SIZE = 100;

  const setMappingStatus = (val) => {
    setFilterStatus(val); setFilterComputedStatus(""); setPage(1);
  };
  const setComputedStatus = (val) => {
    setFilterComputedStatus(val); setFilterStatus(""); setPage(1);
  };

  const load = useCallback(() => {
    setLoading(true); setError(null);
    const params = { page, page_size: PAGE_SIZE };
    if (filterSource)          params.source_id              = filterSource;
    if (filterStatus)          params.mapping_status          = filterStatus;
    if (filterComputedStatus)  params.computed_status         = filterComputedStatus;
    if (filterOrg)             params.organization_name       = filterOrg;
    if (filterBranch)          params.branch_name             = filterBranch;
    if (filterRegion)          params.region_name             = filterRegion;
    if (filterMaster)          params.master_department_id    = filterMaster;
    if (search)                params.search                  = search;
    if (filterParentId)        params.parent_department_id    = filterParentId;
    if (filterParentName)      params.parent_department_name  = filterParentName;
    if (filterHasParent)       params.has_parent              = filterHasParent;
    if (filterParentStatus)    params.parent_status           = filterParentStatus;
    if (filterSourceLevel !== "") params.source_level         = Number(filterSourceLevel);
    if (filterSourceType)      params.source_node_type        = filterSourceType;
    if (filterSourceChanged === "yes") params.source_changed  = true;
    if (filterSourceChanged === "no")  params.source_changed  = false;

    getStagedDepartments(params)
      .then(setData)
      .catch(() => setError("Помилка завантаження"))
      .finally(() => setLoading(false));
  }, [page, filterSource, filterOrg, filterBranch, filterRegion, filterMaster,
      filterStatus, filterComputedStatus, search,
      filterParentId, filterParentName, filterHasParent, filterParentStatus,
      filterSourceLevel, filterSourceType, filterSourceChanged]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getMasterDepartments().then(setMasters).catch(() => {}); }, []);

  const handleBind = async (source_id, source_department_id, master_department_id) => {
    await bindDepartment(source_id, source_department_id, master_department_id);
    setSuccess("Підрозділ прив'язано");
    load();
  };

  const handleCreateInsteadOfBind = (row) => {
    setBindRow(null);
    setCreateRow(row);
  };

  const handleReject = async (row) => {
    if (!window.confirm(`Відхилити "${row.source_department_name}"?`)) return;
    setError(null);
    try {
      await rejectDepartment(row.source_id, row.source_department_id);
      setSuccess("Підрозділ відхилено");
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка");
    }
  };

  const handleReset = async (row) => {
    if (!window.confirm(`Скинути прив'язку для "${row.source_department_name}"?`)) return;
    setError(null);
    try {
      await resetMapping(row.source_id, row.source_department_id);
      setSuccess("Прив'язку скинуто → pending");
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка скидання");
    }
  };

  const handleAutoBind = async () => {
    setAutoBinding(true); setError(null); setSuccess(null);
    try {
      const res = await autoBindDepartments(filterSource ? Number(filterSource) : null);
      setSuccess(`Авто-прив'язка: ${res.auto_bound} підрозділів прив'язано за точним збігом department_id.`);
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка авто-прив'язки");
    } finally { setAutoBinding(false); }
  };

  const handleCreateFromSource = async (body) => {
    setError(null);
    try {
      const res = await createMasterFromSource(body);
      setSuccess(`Створено master-підрозділ «${res.department_name}» [${res.department_id}] і прив'язано`);
      setCreateRow(null);
      load();
      getMasterDepartments().then(setMasters).catch(() => {});
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка створення master-підрозділу");
      throw e;
    }
  };

  const handleBulkFillSuccess = (res) => {
    setShowBulkFill(false);
    setSuccess(`Оновлено: ${res.updated_masters} master-підрозділів, ${res.updated_staging} pending записів.`);
    load();
  };

  const handleBulkCreateSuccess = (res) => {
    setShowBulkCreate(false);
    setSuccess(`Створено: ${res.created}, прив'язано: ${res.bound}, пропущено: ${res.skipped}.`);
    load();
    getMasterDepartments().then(setMasters).catch(() => {});
  };

  const handleSearch = () => { setPage(1); setSearch(searchInput); };

  const sources       = data?.sources       || [];
  const organizations = data?.organizations || [];
  const branches      = data?.branches      || [];
  const regions       = data?.regions       || [];

  const brandFilters = {
    filterSource, filterOrg, filterBranch, filterRegion,
    filterMaster, filterStatus, filterComputedStatus, search,
    filterParentId, filterParentName, filterHasParent, filterParentStatus,
    filterSourceLevel, filterSourceType, filterSourceChanged,
  };

  const advancedActiveCount = [
    filterStatus && filterStatus !== "all",
    filterComputedStatus,
    filterHasParent,
    filterParentStatus,
    filterParentId,
    filterParentName,
    filterSourceLevel !== "",
    filterSourceType,
    filterSourceChanged,
  ].filter(Boolean).length;

  // ── Cascading filter values (derived from current loaded rows) ───────────────
  // When a filter is active, narrow sibling filters to values present in result set.
  // Falls back to full server-side list when no sibling filter is active.
  const _rows = data?.rows || [];
  const availableOrgs = (filterBranch || filterRegion)
    ? [...new Set(_rows.map(r => r.effective_organization_name || r.organization_name).filter(Boolean))].sort()
    : organizations;
  const availableBranches = (filterOrg || filterRegion)
    ? [...new Set(_rows.map(r => r.effective_branch || r.branch_name).filter(Boolean))].sort()
    : branches;
  const availableRegions = (filterOrg || filterBranch)
    ? [...new Set(_rows.map(r => r.effective_region || r.region_name).filter(Boolean))].sort()
    : regions;
  const availableParentIds   = [...new Set(_rows.map(r => r.effective_parent_id).filter(Boolean))].sort();
  const availableParentNames = [...new Set(_rows.map(r => r.effective_parent_name).filter(Boolean))].sort();

  // Helper: row background by mapping status
  const rowBg = (st) =>
    st === "rejected" ? "#fef2f2" : st === "mapped" ? "#f0fdf4" : st === "auto" ? "#eff6ff" : "#fff";

  // Compact icon-button style for actions column
  const iconBtn = (variant) => {
    const v = {
      blue:  { bg: "#eff6ff", br: "#93c5fd", cl: "#1e40af" },
      green: { bg: "#f0fdf4", br: "#6ee7b7", cl: "#065f46" },
      amber: { bg: "#fffbeb", br: "#fcd34d", cl: "#92400e" },
      red:   { bg: "#fef2f2", br: "#fca5a5", cl: "#dc2626" },
      gray:  { bg: "#f9fafb", br: "#d1d5db", cl: "#6b7280" },
    }[variant] || { bg: "#f9fafb", br: "#d1d5db", cl: "#6b7280" };
    return {
      width: 26, height: 26, padding: 0, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700,
      border: `1px solid ${v.br}`, background: v.bg, color: v.cl,
      borderRadius: 4, cursor: "pointer",
    };
  };

  // Sticky right column styles
  const thAct = {
    ...thS, position: "sticky", right: 0, zIndex: 3,
    background: "#f9fafb", boxShadow: "-2px 0 5px rgba(0,0,0,0.07)",
  };

  return (
    <div style={{ padding: "12px 20px", maxWidth: 1600 }}>

      {/* Modals */}
      {bindRow && (
        <BindModal row={bindRow} masters={masters} onBind={handleBind}
          onClose={() => setBindRow(null)} onCreateInstead={handleCreateInsteadOfBind} />
      )}
      {createRow && (
        <CreateModal row={createRow} onCreate={handleCreateFromSource}
          onClose={() => setCreateRow(null)} />
      )}
      {showBulkFill && (
        <BulkFillModal filters={brandFilters} onClose={() => setShowBulkFill(false)}
          onSuccess={handleBulkFillSuccess} />
      )}
      {showBulkCreate && (
        <BulkCreateModal filters={brandFilters} onClose={() => setShowBulkCreate(false)}
          onSuccess={handleBulkCreateSuccess} />
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {setActivePage && (
            <button
              onClick={() => setActivePage("importSources", { tab: "sources" })}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280",
                       fontSize: 12, padding: "0 0 4px 0", display: "flex", alignItems: "center", gap: 4 }}>
              ← До відповідності полів
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Відповідність підрозділів</h2>
          <p style={{ margin: 0, color: "#9ca3af", fontSize: 11 }}>
            dim_department_source → department_source_mapping → dim_department
          </p>
          {filterSource && data?.sources && (() => {
            const src = data.sources.find(s => String(s.id) === String(filterSource));
            return src ? (
              <div style={{ marginTop: 2, fontSize: 11, color: "#1d4ed8", fontWeight: 600 }}>
                Джерело: {src.name}
              </div>
            ) : null;
          })()}
        </div>
        {/* Bulk actions */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleAutoBind} disabled={autoBinding}
            title="Авто-прив'язка за точним збігом department_id. Не зачіпає вже прив'язані рядки."
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#eff6ff", border: "1px solid #3b82f6",
                     borderRadius: 5, cursor: "pointer", color: "#1e40af" }}>
            {autoBinding ? "…" : "⚡ Авто (id)"}
          </button>
          <button onClick={() => setShowBulkFill(true)}
            title="Масово заповнити поле для відфільтрованих pending-рядків"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#f0fdf4", border: "1px solid #6ee7b7",
                     borderRadius: 5, cursor: "pointer", color: "#065f46" }}>
            🔗 Заповнити
          </button>
          <button onClick={() => setShowBulkCreate(true)}
            title="Масово створити master-підрозділи для готових pending-рядків"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#fefce8", border: "1px solid #fde047",
                     borderRadius: 5, cursor: "pointer", color: "#713f12" }}>
            ➕ Створити master
          </button>
          <button onClick={load} disabled={loading} title="Оновити таблицю"
            style={{ padding: "5px 10px", fontSize: 13, background: "#f9fafb",
                     border: "1px solid #d1d5db", borderRadius: 5, cursor: "pointer", color: "#6b7280" }}>
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between",
                                                marginBottom: 8, fontSize: 13 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#c33", fontSize: 16 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="success-message" style={{ display: "flex", justifyContent: "space-between",
                                                   marginBottom: 8, fontSize: 13 }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── KPI pills ── */}
      {data && (
        <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <KpiPill label="Всього"     value={data.total}           color="#374151"
            active={!filterStatus && !filterComputedStatus}
            onClick={() => { setFilterStatus(""); setFilterComputedStatus(""); setPage(1); }}
            title="Показати всі записи" />
          <KpiPill label="Очікує"     value={data.pending}         color="#92400e"
            active={filterStatus === "pending"}
            onClick={() => setMappingStatus("pending")}
            title="Фільтр: очікують маппінгу" />
          <KpiPill label="Прив'язано" value={data.mapped}          color="#065f46"
            active={filterStatus === "mapped"}
            onClick={() => setMappingStatus("mapped")}
            title="Фільтр: вручну прив'язані" />
          <KpiPill label="Авто"       value={data.auto_bound ?? 0} color="#1e40af"
            active={filterStatus === "auto"}
            onClick={() => setMappingStatus("auto")}
            title="Фільтр: авто-прив'язані за ID" />
          <KpiPill label="Відхилено"  value={data.rejected}        color="#991b1b"
            active={filterStatus === "rejected"}
            onClick={() => setMappingStatus("rejected")}
            title="Фільтр: відхилені" />
          <span style={{ color: "#d1d5db", fontSize: 18, margin: "0 2px" }}>|</span>
          <KpiPill label="→ Створити"     value={data.ready_to_create ?? 0}   color="#059669"
            active={filterComputedStatus === "ready_to_create"}
            onClick={() => setComputedStatus("ready_to_create")}
            title="Pending-рядки з усіма полями — готові до створення master" />
          <KpiPill label="⚠ Немає parent" value={data.parent_missing ?? 0}    color="#d97706"
            active={filterComputedStatus === "parent_missing"}
            onClick={() => setComputedStatus("parent_missing")}
            title="Parent ID вказано, але відсутній в dim_department" />
          <KpiPill label="⊘ Дублікат ID" value={data.duplicate_warning ?? 0} color="#c2410c"
            active={filterComputedStatus === "duplicate_warning"}
            onClick={() => setComputedStatus("duplicate_warning")}
            title="Source dept_id вже існує в dim_department" />
          {(data.changed_source ?? 0) > 0 && (
            <>
              <span style={{ color: "#d1d5db", fontSize: 18, margin: "0 2px" }}>|</span>
              <KpiPill label="↻ Source змінено" value={data.changed_source} color="#d97706"
                active={filterSourceChanged === "yes"}
                onClick={() => { setFilterSourceChanged(filterSourceChanged === "yes" ? "" : "yes"); setPage(1); }}
                title="Записи, де source-дані змінились у порівнянні з попереднім імпортом" />
            </>
          )}
          {data.total > 0 && (
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>
              ({data.rows?.length ?? 0} на сторінці)
            </span>
          )}
        </div>
      )}

      {/* ── Main filters (always visible) ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={lblS}>Джерело</div>
          <select value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }}
            style={{ ...selS, minWidth: 140 }}>
            <option value="">Всі джерела</option>
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <div style={lblS}>
            Організація
            {filterBranch || filterRegion ? <span style={{ color: "#6366f1", marginLeft: 3 }}>⇄</span> : null}
          </div>
          <select value={filterOrg} onChange={e => { setFilterOrg(e.target.value); setPage(1); }}
            style={{ ...selS, minWidth: 130 }}>
            <option value="">Всі орг.</option>
            {availableOrgs.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <div style={lblS}>
            Філія
            {filterOrg || filterRegion ? <span style={{ color: "#6366f1", marginLeft: 3 }}>⇄</span> : null}
          </div>
          <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setPage(1); }}
            style={{ ...selS, minWidth: 110 }}>
            <option value="">Всі філії</option>
            {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <div style={lblS}>
            Регіон
            {filterOrg || filterBranch ? <span style={{ color: "#6366f1", marginLeft: 3 }}>⇄</span> : null}
          </div>
          <select value={filterRegion} onChange={e => { setFilterRegion(e.target.value); setPage(1); }}
            style={{ ...selS, minWidth: 110 }}>
            <option value="">Всі регіони</option>
            {availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {/* Search */}
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
          <div>
            <div style={lblS}>Пошук</div>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Назва або ID..."
              style={{ ...inpS, width: 180 }} />
          </div>
          <button onClick={handleSearch}
            style={{ ...selS, padding: "4px 9px", alignSelf: "flex-end" }}>🔍</button>
          {search && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              style={{ ...selS, padding: "4px 8px", color: "#6b7280", alignSelf: "flex-end" }}>✕</button>
          )}
        </div>
        {/* Advanced toggle */}
        <button onClick={() => setShowAdvanced(v => !v)}
          style={{
            padding: "4px 12px", fontSize: 12, cursor: "pointer", alignSelf: "flex-end",
            border: `1px solid ${showAdvanced || advancedActiveCount > 0 ? "#6366f1" : "#d1d5db"}`,
            borderRadius: 5,
            background: showAdvanced ? "#eef2ff" : advancedActiveCount > 0 ? "#f0f0ff" : "#f9fafb",
            color: showAdvanced || advancedActiveCount > 0 ? "#4338ca" : "#374151",
            fontWeight: advancedActiveCount > 0 ? 600 : 400,
          }}>
          {showAdvanced ? "▴ Менше фільтрів" : "▾ Розширені фільтри"}
          {advancedActiveCount > 0 && (
            <span style={{ marginLeft: 5, background: "#6366f1", color: "#fff",
                           borderRadius: 10, padding: "0 6px", fontSize: 10 }}>
              {advancedActiveCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Advanced filters (collapsible) ── */}
      {showAdvanced && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end",
          padding: "10px 14px", background: "#f9fafb",
          border: "1px solid #e5e7eb", borderRadius: 6,
        }}>
          {/* Status group */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, ...lblS, marginBottom: 4 }}>
              <span>Статус</span>
              <button onClick={() => setShowLegend(v => !v)} title="Легенда статусів"
                style={{ width: 15, height: 15, borderRadius: "50%", padding: 0,
                         border: "1px solid #9ca3af", fontSize: 9, cursor: "pointer", fontWeight: 700,
                         background: showLegend ? "#374151" : "#f3f4f6",
                         color: showLegend ? "#fff" : "#6b7280", lineHeight: "13px" }}>?</button>
            </div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 520 }}>
              {[
                { val: "",         label: "Всі",        fn: () => { setFilterStatus(""); setFilterComputedStatus(""); setPage(1); }, active: !filterStatus && !filterComputedStatus },
                { val: "pending",  label: "Очікує",     fn: () => setMappingStatus("pending"),  active: filterStatus === "pending"  },
                { val: "mapped",   label: "Прив'язано", fn: () => setMappingStatus("mapped"),   active: filterStatus === "mapped"   },
                { val: "auto",     label: "Авто",       fn: () => setMappingStatus("auto"),     active: filterStatus === "auto"     },
                { val: "rejected", label: "Відхилено",  fn: () => setMappingStatus("rejected"), active: filterStatus === "rejected" },
              ].map(f => (
                <button key={f.val} onClick={f.fn}
                  style={{ padding: "3px 9px", fontSize: 11, border: "1px solid #d1d5db",
                           borderRadius: 4, cursor: "pointer",
                           background: f.active ? "#374151" : "#fff",
                           color:      f.active ? "#fff"    : "#374151",
                           fontWeight: f.active ? 700       : 400 }}>
                  {f.label}
                </button>
              ))}
              <span style={{ color: "#e5e7eb", alignSelf: "center" }}>|</span>
              {[
                { val: "ready_to_create",   label: "Можна створити", cl: "#065f46", bg: "#d1fae5" },
                { val: "parent_missing",    label: "Немає parent",   cl: "#92400e", bg: "#fef3c7" },
                { val: "duplicate_warning", label: "Дублікат ID",    cl: "#c2410c", bg: "#fff7ed" },
              ].map(f => (
                <button key={f.val}
                  onClick={() => setComputedStatus(filterComputedStatus === f.val ? "" : f.val)}
                  style={{ padding: "3px 9px", fontSize: 11, cursor: "pointer", borderRadius: 4,
                           border: `1px solid ${filterComputedStatus === f.val ? f.cl : "#d1d5db"}`,
                           background: filterComputedStatus === f.val ? f.bg : "#fff",
                           color: f.cl, fontWeight: filterComputedStatus === f.val ? 700 : 400 }}>
                  {f.label}
                </button>
              ))}
            </div>
            {/* Legend popup */}
            {showLegend && (
              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 300, marginTop: 6,
                            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: "12px 16px", minWidth: 360 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <strong style={{ fontSize: 12 }}>Легенда статусів</strong>
                  <button onClick={() => setShowLegend(false)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#9ca3af" }}>✕</button>
                </div>
                {[
                  { s: "mapped",            l: "Прив'язано",      d: "Вручну прив'язано до master-підрозділу." },
                  { s: "auto",              l: "Авто",            d: "Авто-прив'язано за точним збігом department_id." },
                  { s: "rejected",          l: "Відхилено",       d: "Позначено як неприйнятне. Скиньте статус для переприв'язки." },
                  { s: "ready_to_create",   l: "Можна створити",  d: "Всі обов'язкові поля є — готово до створення master." },
                  { s: "parent_missing",    l: "Немає parent",    d: "Parent ID вказано, але відсутній в dim_department. Спочатку створіть parent." },
                  { s: "duplicate_warning", l: "Дублікат ID",     d: "Dept ID вже існує в dim_department. Прив'яжіть до нього." },
                  { s: "pending",           l: "Очікує",          d: "Не вистачає обов'язкових полів або ще не маппований." },
                ].map(({ s, l, d }) => {
                  const cfg = STATUS_CFG[s] || STATUS_CFG.pending;
                  return (
                    <div key={s} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <span style={{ flexShrink: 0, padding: "1px 6px", borderRadius: 3, fontSize: 10,
                                     fontWeight: 600, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>
                        {l}
                      </span>
                      <span style={{ fontSize: 11, color: "#374151" }}>{d}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Has parent */}
          <div>
            <div style={lblS}>Наявність parent</div>
            <select value={filterHasParent} onChange={e => { setFilterHasParent(e.target.value); setPage(1); }}
              style={{ ...selS, minWidth: 120 }}>
              <option value="">Всі</option>
              <option value="with">З parent</option>
              <option value="without">Без parent</option>
            </select>
          </div>

          {/* Parent status */}
          <div>
            <div style={lblS}>Статус parent</div>
            <select value={filterParentStatus} onChange={e => { setFilterParentStatus(e.target.value); setPage(1); }}
              style={{ ...selS, minWidth: 130 }}>
              <option value="">Всі</option>
              <option value="found">Знайдено</option>
              <option value="missing">Відсутній</option>
            </select>
          </div>

          {/* Parent ID — selectable from loaded rows */}
          <div>
            <div style={lblS}>Parent ID</div>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <select value={filterParentId}
                onChange={e => { setFilterParentId(e.target.value); setParentIdInput(e.target.value); setPage(1); }}
                style={{ ...selS, minWidth: 148 }}>
                <option value="">Всі parent ID</option>
                {availableParentIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
              {filterParentId && (
                <button onClick={() => { setFilterParentId(""); setParentIdInput(""); setPage(1); }}
                  style={{ ...selS, padding: "4px 7px", color: "#6b7280" }}>✕</button>
              )}
            </div>
          </div>

          {/* Parent назва — selectable from loaded rows */}
          <div>
            <div style={lblS}>Parent назва</div>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <select value={filterParentName}
                onChange={e => { setFilterParentName(e.target.value); setParentNameInput(e.target.value); setPage(1); }}
                style={{ ...selS, minWidth: 170 }}>
                <option value="">Всі parent назви</option>
                {availableParentNames.map(n => <option key={n} value={n} title={n}>{n.length > 28 ? n.slice(0, 28) + "…" : n}</option>)}
              </select>
              {filterParentName && (
                <button onClick={() => { setFilterParentName(""); setParentNameInput(""); setPage(1); }}
                  style={{ ...selS, padding: "4px 7px", color: "#6b7280" }}>✕</button>
              )}
            </div>
          </div>

          {/* Source рівень — chip buttons */}
          <div>
            <div style={lblS}>Source рівень</div>
            <div style={{ display: "flex", gap: 3 }}>
              {[{ val: "", label: "Всі" }, { val: "0", label: "L0 Root" }, { val: "1", label: "L1 Child" }].map(opt => (
                <button key={opt.val} onClick={() => { setFilterSourceLevel(opt.val); setPage(1); }}
                  style={{ padding: "3px 9px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                           border: "1px solid #d1d5db",
                           background: filterSourceLevel === opt.val ? "#374151" : "#fff",
                           color:      filterSourceLevel === opt.val ? "#fff"    : "#374151",
                           fontWeight: filterSourceLevel === opt.val ? 700       : 400 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source тип вузла — chip buttons */}
          <div>
            <div style={lblS}>Source тип вузла</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {[{ val: "", label: "Всі", bg: "#f3f4f6", color: "#374151" },
                ...Object.entries(NODE_TYPE_CFG).map(([k, c]) => ({ val: k, label: c.label, bg: c.bg, color: c.color }))
              ].map(opt => (
                <button key={opt.val} onClick={() => { setFilterSourceType(opt.val); setPage(1); }}
                  style={{ padding: "3px 9px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                           border: `1px solid ${filterSourceType === opt.val ? opt.color : "#d1d5db"}`,
                           background: filterSourceType === opt.val ? opt.bg  : "#fff",
                           color:      filterSourceType === opt.val ? opt.color : "#374151",
                           fontWeight: filterSourceType === opt.val ? 700 : 400 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source змінено */}
          <div>
            <div style={lblS}>Source змінено</div>
            <div style={{ display: "flex", gap: 3 }}>
              {[
                { val: "",    label: "Всі" },
                { val: "yes", label: "Змінено",    bg: "#fef3c7", color: "#92400e" },
                { val: "no",  label: "Без змін",   bg: "#f3f4f6", color: "#374151" },
              ].map(opt => (
                <button key={opt.val} onClick={() => { setFilterSourceChanged(opt.val); setPage(1); }}
                  style={{ padding: "3px 9px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                           border: `1px solid ${filterSourceChanged === opt.val ? (opt.color || "#374151") : "#d1d5db"}`,
                           background: filterSourceChanged === opt.val ? (opt.bg || "#374151") : "#fff",
                           color:      filterSourceChanged === opt.val ? (opt.color || "#fff")  : "#374151",
                           fontWeight: filterSourceChanged === opt.val ? 700 : 400 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear advanced */}
          {advancedActiveCount > 0 && (
            <button onClick={() => {
              setFilterStatus(""); setFilterComputedStatus(""); setFilterHasParent("");
              setFilterParentStatus(""); setFilterParentId(""); setParentIdInput("");
              setFilterParentName(""); setParentNameInput(""); setFilterSourceLevel("");
              setFilterSourceType(""); setFilterSourceChanged(""); setPage(1);
            }} style={{ ...selS, alignSelf: "flex-end", color: "#6366f1", borderColor: "#a5b4fc" }}>
              Очистити фільтри ({advancedActiveCount})
            </button>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={thS}>Джерело · ID</th>
              <th style={thS}>Назва (source)</th>
              <th style={thS}>Тип · Рівень</th>
              <th style={thS}>Parent</th>
              <th style={{ ...thS, color: "#0369a1" }}>Separated</th>
              <th style={thS}>Орг / Філія / Регіон</th>
              <th style={thS}>Дод. поля</th>
              <th style={thS}>Статус</th>
              <th style={thS}>Master підрозділ</th>
              <th style={thS}>Тип (master)</th>
              <th style={thS}>Parent (master)</th>
              <th style={{ ...thAct, textAlign: "center", minWidth: 100 }}>Дії</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={12}
                style={{ padding: "24px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Завантаження...
              </td></tr>
            )}
            {!loading && (!data?.rows || data.rows.length === 0) && (
              <tr><td colSpan={12}
                style={{ padding: "32px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🔍</div>
                Немає рядків за поточними фільтрами
              </td></tr>
            )}
            {!loading && data?.rows?.map(row => {
              const st  = row.mapping_status;
              const rbg = rowBg(st);
              return (
                <tr key={`${row.source_id}-${row.source_department_id}`}
                  style={{ borderBottom: "1px solid #f3f4f6", background: rbg }}>

                  {/* Джерело · ID */}
                  <td style={tdS}>
                    <span style={{ fontSize: 10, color: "#9ca3af", display: "block" }}>
                      {row.source_name || row.source_id}
                      {row.seen_count > 1 && (
                        <span title={`Зустрічалось у ${row.seen_count} батчах`}
                          style={{ marginLeft: 4, color: "#6b7280" }}>×{row.seen_count}</span>
                      )}
                    </span>
                    <code style={{ fontSize: 10, background: "#f3f4f6", padding: "1px 4px",
                                   borderRadius: 3, color: "#374151", whiteSpace: "nowrap" }}>
                      {row.source_department_id}
                    </code>
                    {row.last_batch_id && (
                      <span style={{ fontSize: 9, color: "#c4b5fd", display: "block" }}>
                        batch #{row.last_batch_id}
                      </span>
                    )}
                  </td>

                  {/* Назва */}
                  {(() => {
                    const sepName = row.source_separated_department_name;
                    const parName = row.effective_parent_name;
                    const pathParts = [sepName, parName].filter(Boolean);
                    const pathTip = pathParts.length > 0 ? pathParts.join(" › ") + " ›" : null;
                    const overrideTip = row.effective_department_name !== row.source_department_name
                      ? `Source: ${row.source_department_name}\nEff: ${row.effective_department_name}` : null;
                    return (
                      <td style={{ ...tdS, maxWidth: 200 }} title={overrideTip || pathTip || undefined}>
                        <span style={{ fontWeight: 500, display: "block", whiteSpace: "nowrap",
                                       overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.effective_department_name || row.source_department_name || "—"}
                        </span>
                        {pathTip && (
                          <span style={{ fontSize: 9, color: "#9ca3af", display: "block", whiteSpace: "nowrap",
                                         overflow: "hidden", textOverflow: "ellipsis" }}>
                            {pathTip}
                          </span>
                        )}
                        {row.effective_department_name && row.effective_department_name !== row.source_department_name && (
                          <span style={{ fontSize: 9, color: "#059669" }}>✎ override</span>
                        )}
                        {row.source_changed && (
                          <span
                            title={Array.isArray(row.changed_fields) && row.changed_fields.length > 0
                              ? `Змінено поля: ${row.changed_fields.join(", ")}`
                              : "Дані змінились в останньому імпорті"}
                            style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                                     background: "#fef3c7", color: "#92400e", display: "inline-block",
                                     cursor: "help", marginTop: 1 }}>
                            ↻ змінено
                          </span>
                        )}
                      </td>
                    );
                  })()}

                  {/* Тип · Рівень */}
                  <td style={{ ...tdS, whiteSpace: "nowrap" }}>
                    <NodeTypeBadge nodeType={row.source_node_type} level={row.source_level} />
                  </td>

                  {/* Parent (source) */}
                  <td style={tdS}>
                    {row.effective_parent_id ? (
                      <span title={row.effective_parent_name ? `${row.effective_parent_id} — ${row.effective_parent_name}` : row.effective_parent_id}>
                        <code style={{
                          fontSize: 10, padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap",
                          background: row.parent_missing ? "#fef3c7" : "#f3f4f6",
                          color:      row.parent_missing ? "#92400e" : "#374151",
                        }}>
                          {row.effective_parent_id}
                        </code>
                        {row.parent_missing && (
                          <span style={{ fontSize: 9, color: "#d97706", marginLeft: 3, fontWeight: 600 }}>⚠</span>
                        )}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: "#d1d5db" }}>—</span>
                    )}
                  </td>

                  {/* Separated */}
                  <td style={tdS}>
                    {row.source_separated_department_id ? (
                      <span title={row.source_separated_department_name
                        ? `${row.source_separated_department_id} — ${row.source_separated_department_name}`
                        : row.source_separated_department_id}>
                        <code style={{ fontSize: 10, background: "#e0f2fe", padding: "1px 4px",
                                       borderRadius: 3, color: "#0369a1", whiteSpace: "nowrap" }}>
                          {row.source_separated_department_id}
                        </code>
                        {row.source_separated_department_name && (
                          <div style={{ fontSize: 10, color: "#0369a1", marginTop: 1, opacity: 0.75,
                                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
                            {row.source_separated_department_name}
                          </div>
                        )}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: "#d1d5db" }}>—</span>
                    )}
                  </td>

                  {/* Орг / Філія / Регіон */}
                  <td style={{ ...tdS, maxWidth: 170 }}>
                    <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                  fontSize: 11, color: "#374151" }}
                         title={[row.effective_organization_name, row.effective_branch, row.effective_region].filter(Boolean).join(" · ")}>
                      {row.effective_organization_name || row.organization_name || "—"}
                    </div>
                    {(() => {
                      const br = row.effective_branch || row.branch_name || "";
                      const rg = row.effective_region || row.region_name || "";
                      if (!br && !rg) return null;
                      return (
                        <div style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap",
                                      overflow: "hidden", textOverflow: "ellipsis" }}>
                          {br}
                          {br && rg && <span style={{ color: "#d1d5db" }}> / </span>}
                          {rg}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Дод. поля */}
                  <td style={{ ...tdS, maxWidth: 150 }}>
                    <ExtraFieldsChips fields={row.extra_fields} />
                  </td>

                  {/* Статус */}
                  <td style={tdS}>
                    <StatusBadge status={st} computedStatus={row.computed_status}
                      reason={row.status_reason} />
                  </td>

                  {/* Master підрозділ */}
                  <td style={{ ...tdS, maxWidth: 200 }}>
                    {row.exists_in_master ? (
                      <span title={`${row.master_department_id}${row.master_org ? ` · ${row.master_org}` : ""}`}>
                        <span style={{ fontWeight: 600, color: "#1e40af", display: "block",
                                       whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.master_department_name || row.master_department_id}
                        </span>
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>
                          [{row.master_department_id}]
                          {row.confidence < 100 && (
                            <span style={{ color: "#f59e0b", marginLeft: 4 }}>~{Math.round(row.confidence)}%</span>
                          )}
                        </span>
                      </span>
                    ) : row.ready_to_create ? (
                      <span style={{ fontSize: 11, color: "#059669" }}
                        title={`Буде створено: ${row.effective_department_name}`}>
                        ✦ {row.effective_department_name}
                      </span>
                    ) : (
                      <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>
                    )}
                  </td>

                  {/* Тип (master) */}
                  <td style={{ ...tdS, whiteSpace: "nowrap" }}>
                    {row.master_node_type
                      ? <NodeTypeBadge nodeType={row.master_node_type} level={row.master_level} />
                      : <span style={{ color: "#e5e7eb" }}>—</span>}
                  </td>

                  {/* Parent (master) */}
                  <td style={tdS}>
                    {row.master_parent_id ? (
                      <code style={{ fontSize: 10, background: "#ede9fe", color: "#7c3aed",
                                     padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap" }}
                            title={row.master_parent_name || undefined}>
                        {row.master_parent_id}
                      </code>
                    ) : (
                      <span style={{ color: "#e5e7eb", fontSize: 10 }}>—</span>
                    )}
                  </td>

                  {/* ── Дії (sticky right) ── */}
                  <td style={{
                    ...tdS, textAlign: "center",
                    position: "sticky", right: 0, zIndex: 1,
                    background: rbg,
                    boxShadow: "-2px 0 5px rgba(0,0,0,0.05)",
                  }}>
                    <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                      {/* Bind / Change */}
                      {st !== "rejected" && (
                        <button onClick={() => setBindRow(row)}
                          title={row.exists_in_master ? "Змінити прив'язку" : "Прив'язати до master-підрозділу"}
                          style={iconBtn("blue")}>
                          🔗
                        </button>
                      )}
                      {/* Create */}
                      {(row.ready_to_create || (row.parent_missing && !row.exists_in_master)) && (
                        <button onClick={() => setCreateRow(row)}
                          title={row.parent_missing ? "⚠ Створити підрозділ (parent відсутній)" : "Створити master-підрозділ"}
                          style={iconBtn(row.parent_missing ? "amber" : "green")}>
                          ➕
                        </button>
                      )}
                      {/* Reset */}
                      {(st === "mapped" || st === "auto") && (
                        <button onClick={() => handleReset(row)}
                          title="Скинути прив'язку → pending"
                          style={iconBtn("amber")}>
                          ↺
                        </button>
                      )}
                      {/* Reject */}
                      {st !== "rejected" && (
                        <button onClick={() => handleReject(row)}
                          title="Відхилити підрозділ"
                          style={iconBtn("red")}>
                          ✕
                        </button>
                      )}
                      {/* Return from rejected */}
                      {st === "rejected" && (
                        <button onClick={() => handleReset(row)}
                          title="Повернути до pending"
                          style={iconBtn("blue")}>
                          ↩
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.total > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", fontSize: 12 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: 11 }}>
            ← Назад
          </button>
          <span style={{ color: "#6b7280" }}>
            Стор. {page} / {Math.ceil(data.total / PAGE_SIZE)} · показано {data.rows?.length} з {data.total}
          </span>
          <button onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
            className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: 11 }}>
            Далі →
          </button>
        </div>
      )}
    </div>
  );
}
