import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  getEngineSources,
  getFieldMapping,
  saveFieldMapping,
  previewEngineSource,
  loadToStaging,
  getStagingPreview,
  commitBatch,
  getImportBatches,
  deleteBatch,
  stagingBulkUpdate,
} from "../api/importEngineApi";
import { getBrands } from "../api/brandsApi";
import { API_BASE_URL } from "../api/apiConfig";

// ── Types config ──────────────────────────────────────────────────────────────

const IMPORT_TYPES = {
  departments: {
    label: "Підрозділи",
    icon: "🏢",
    desc: "OLAP → source departments → відповідність",
    hasPeriod: false,
    targetLabel: "source departments / відповідність",
    isDepartmentFlow: true,
  },
  brands: {
    label: "Бренди / НГ",
    icon: "🏷",
    desc: "OLAP → source brands → відповідність",
    hasPeriod: false,
    targetLabel: "source brands / відповідність",
    isBrandFlow: true,
  },
  articles: {
    label: "Статті PnL",
    icon: "📋",
    desc: "OLAP → source articles → відповідність",
    hasPeriod: false,
    targetLabel: "source articles / відповідність",
    isArticleFlow: true,
  },
  sales_fact: {
    label: "Факт продажів",
    icon: "📊",
    desc: "OLAP → fact_turnover",
    hasPeriod: true,
    targetLabel: "fact_turnover",
  },
};

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtNum(v, dec = 2) {
  if (v === null || v === undefined || v === "") return "0";
  const n = Number(v);
  if (isNaN(n)) return "0";
  return n.toLocaleString("uk-UA", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const thS = {
  padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
  fontWeight: 600, fontSize: 10, color: "#6b7280", background: "#f9fafb",
  position: "sticky", top: 0, whiteSpace: "nowrap",
};
const tdS = { padding: "3px 8px", verticalAlign: "middle", fontSize: 11, lineHeight: 1.35 };
const inS = {
  width: "100%", padding: "4px 7px", border: "1px solid #d1d5db",
  borderRadius: 4, fontSize: 12, boxSizing: "border-box",
};

const secS = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
  padding: "14px 16px", marginBottom: 12,
};
const secTitleS = {
  fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10,
  display: "flex", alignItems: "center", gap: 6,
};

const btnPri = (disabled) => ({
  padding: "6px 16px", fontSize: 12, fontWeight: 600, border: "none",
  borderRadius: 5, background: disabled ? "#c4b5fd" : "#7c3aed", color: "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
  boxShadow: disabled ? "none" : "0 1px 4px rgba(124,58,237,0.25)",
});
const btnSec = {
  padding: "6px 14px", fontSize: 12, fontWeight: 500,
  border: "1px solid #d1d5db", borderRadius: 5,
  background: "#fff", color: "#374151", cursor: "pointer",
};
const btnGhost = {
  padding: "4px 10px", fontSize: 11, border: "1px solid #d1d5db",
  borderRadius: 4, background: "#fff", color: "#6b7280", cursor: "pointer",
};

// ── Badges ────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  loading:     { label: "Завантаження...", bg: "#fef3c7", color: "#92400e" },
  loaded:      { label: "У staging",      bg: "#dbeafe", color: "#1e40af" },
  committing:  { label: "Запис...",        bg: "#e0e7ff", color: "#3730a3" },
  committed:   { label: "Записано",        bg: "#d1fae5", color: "#065f46" },
  failed:      { label: "Помилка",         bg: "#fee2e2", color: "#991b1b" },
  rolled_back: { label: "Відкат",          bg: "#f3f4f6", color: "#6b7280" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 4,
                   padding: "2px 8px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

const V_BADGE = {
  valid:   { background: "#d1fae5", color: "#065f46",  borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 600 },
  invalid: { background: "#fee2e2", color: "#991b1b",  borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 600 },
  pending: { background: "#f3f4f6", color: "#374151",  borderRadius: 4, padding: "2px 7px", fontSize: 10 },
};

const MAP_BADGE = {
  not_set: { label: "—",       background: "#f3f4f6", color: "#9ca3af" },
  manual:  { label: "вручну",  background: "#dbeafe", color: "#1e40af" },
  auto:    { label: "авто",    background: "#d1fae5", color: "#065f46" },
  error:   { label: "помилка", background: "#fee2e2", color: "#991b1b" },
};

function MappingBadge({ status }) {
  const cfg = MAP_BADGE[status] || MAP_BADGE.not_set;
  return (
    <span style={{ ...cfg, borderRadius: 4, padding: "2px 6px", fontSize: 10,
                   fontWeight: 500, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ── Raw OLAP row modal ────────────────────────────────────────────────────────

function RawRowModal({ row, onClose }) {
  if (!row) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 760, width: "90%",
                    maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <strong>Row #{row.id}</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {row.validation_error && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        marginBottom: 12, fontSize: 13, color: "#991b1b" }}>
            {row.validation_error}
          </div>
        )}
        {row.raw_row && (
          <pre style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4,
                        padding: "10px 12px", fontSize: 11, fontFamily: "monospace",
                        overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 360 }}>
            {typeof row.raw_row === "string" ? row.raw_row : JSON.stringify(row.raw_row, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Batch detail modal ────────────────────────────────────────────────────────

function BatchDetailModal({ batch, onClose, onDelete, onViewStaging }) {
  if (!batch) return null;
  const isCommitted = batch.status === "committed";
  const isLoaded    = batch.status === "loaded";

  const periodStr = batch.period_from && batch.period_to
    ? `${batch.period_from.slice(0, 7)} — ${batch.period_to.slice(0, 7)}`
    : null;

  const handleDelete = async () => {
    let deleteFact = false;
    const periodInfo = periodStr ? `\nПеріод: ${periodStr}` : "";
    const msg = isCommitted
      ? `Видалити batch #${batch.id}?\n\nЗаписано в ${batch.target_table}.${periodInfo}\n\nОберіть далі чи видалити записані дані.`
      : `Видалити batch #${batch.id} та ${batch.rows_loaded} рядків у staging?${periodInfo}`;
    if (!window.confirm(msg)) return;
    if (isCommitted) {
      const factMsg = periodStr
        ? `Також видалити дані із ${batch.target_table}\nза period_from=${batch.period_from} .. period_to=${batch.period_to}\nдля source_id=${batch.source_id}?`
        : `Також видалити дані із ${batch.target_table}?`;
      deleteFact = window.confirm(factMsg);
    }
    onDelete(batch, deleteFact);
    onClose();
  };

  const f = (label, value) => (
    <div style={{ display: "flex", borderBottom: "1px solid #f3f4f6", padding: "5px 0" }}>
      <div style={{ width: 200, color: "#6b7280", fontSize: 12, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{value ?? "—"}</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 28, maxWidth: 620, width: "90%",
                    maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <strong style={{ fontSize: 16 }}>Batch #{batch.id}</strong>
            <div style={{ marginTop: 4 }}><StatusBadge status={batch.status} /></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          {f("Джерело", batch.source_name || batch.source_id)}
          {f("Тип імпорту", batch.import_type_code)}
          {f("Таблиця-ціль", batch.target_table)}
          {periodStr && f("Вибраний період", periodStr)}
          {batch.replace_mode && f("Режим заміни", batch.replace_mode)}
          {batch.period_field && f("Поле дати", batch.period_field)}
          {f("Рядків у джерелі", batch.rows_total)}
          {f("Записано у staging", batch.rows_loaded)}
          {f("Валідних", batch.rows_valid)}
          {f("Невалідних", batch.rows_invalid)}
          {f("Записано у ціль", batch.rows_loaded_to_target)}
          {f("Початок", batch.started_at?.slice(0, 16).replace("T", " "))}
          {f("Завершено", batch.finished_at?.slice(0, 16).replace("T", " "))}
          {batch.error_message && f("Помилка", batch.error_message)}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(isLoaded || isCommitted) && (
            <button style={btnSec} onClick={() => { onViewStaging(batch); onClose(); }}>
              Переглянути staging
            </button>
          )}
          <button style={{ padding: "6px 14px", border: "1px solid #fca5a5", borderRadius: 5,
                           background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 12 }}
            onClick={handleDelete}>
            Видалити
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Update Modal (sales_fact only) ───────────────────────────────────────

function BulkUpdateModal({ batchId, staging, statusFilter, onClose, onApplied }) {
  const [targetField, setTargetField] = useState("department");
  const [masterId,    setMasterId]    = useState("");
  const [departments, setDepartments] = useState([]);
  const [brands,      setBrands]      = useState([]);
  const [search,      setSearch]      = useState("");
  const [applying,    setApplying]    = useState(false);
  const [result,      setResult]      = useState(null);
  const [err,         setErr]         = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/departments`).then(r => setDepartments(r.data)).catch(() => {});
    getBrands().then(setBrands).catch(() => {});
  }, []);

  const affectedCount = statusFilter === "invalid"
    ? (staging?.invalid ?? 0)
    : statusFilter === "valid"
      ? (staging?.valid ?? 0)
      : (staging?.total ?? 0);

  const masterOptions = targetField === "department"
    ? departments.filter(d => d.is_active !== false)
    : brands;

  const filteredOptions = search
    ? masterOptions.filter(o =>
        (o.department_name || o.brand_name || "").toLowerCase().includes(search.toLowerCase()))
    : masterOptions;

  const selectedLabel = () => {
    if (!masterId) return null;
    if (targetField === "department") {
      const d = departments.find(x => String(x.department_id) === String(masterId));
      return d?.department_name || masterId;
    }
    const b = brands.find(x => String(x.id) === String(masterId));
    return b?.brand_name || masterId;
  };

  const handleApply = async () => {
    if (!masterId) { setErr("Оберіть значення з довідника"); return; }
    setApplying(true); setErr(null); setResult(null);
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      const res = await stagingBulkUpdate(batchId, {
        filters,
        target_field: targetField,
        master_id: String(masterId),
      });
      setResult(res);
      onApplied(res.staging);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setErr(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map(d => d.msg || JSON.stringify(d)).join("; ")
            : "Помилка застосування"
      );
    } finally { setApplying(false); }
  };

  const fldS = { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 };
  const lblS = { fontSize: 12, fontWeight: 600, color: "#374151" };
  const selS = { padding: "5px 7px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, width: "100%" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 28, maxWidth: 560, width: "90%",
                    maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
          <strong style={{ fontSize: 16 }}>Масове заповнення полів</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          Поточна вибірка: <strong>{affectedCount}</strong> рядків
          {statusFilter && <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
            (фільтр: <em>{statusFilter === "invalid" ? "тільки помилки" : "тільки валідні"}</em>)
          </span>}
        </div>

        <div style={fldS}>
          <label style={lblS}>Поле для заміни</label>
          <select value={targetField}
            onChange={e => { setTargetField(e.target.value); setMasterId(""); setSearch(""); }}
            style={selS}>
            <option value="department">Підрозділ</option>
            <option value="brand">Бренд / НГ</option>
          </select>
        </div>

        <div style={fldS}>
          <label style={lblS}>Значення з довідника</label>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Пошук ${targetField === "department" ? "підрозділу" : "бренду"}...`}
            style={{ ...selS, marginBottom: 6 }} />
          <select value={masterId} onChange={e => setMasterId(e.target.value)}
            size={Math.min(filteredOptions.length + 1, 8)}
            style={{ ...selS, minHeight: 80 }}>
            <option value="">— оберіть —</option>
            {filteredOptions.map(o =>
              targetField === "department"
                ? <option key={o.department_id} value={o.department_id}>
                    {[o.holding_name, o.organization_name, o.department_name].filter(Boolean).join(" / ")}
                  </option>
                : <option key={o.id} value={o.id}>
                    {o.brand_name}{o.brand_uid ? ` [${o.brand_uid}]` : ""}
                  </option>
            )}
          </select>
        </div>

        {masterId && (
          <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #86efac",
                        borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
            Буде застосовано: <strong>{selectedLabel()}</strong> до{" "}
            <strong>{affectedCount}</strong> рядків
          </div>
        )}
        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 12 }}>{err}</div>
        )}
        {result && (
          <div style={{ padding: "10px 14px", background: "#d1fae5", border: "1px solid #6ee7b7",
                        borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
            <strong>Готово!</strong> Оновлено {result.rows_updated} рядків.
            Валідних: <strong>{result.staging?.valid ?? "—"}</strong>,
            помилок: <strong>{result.staging?.invalid ?? "—"}</strong>.
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnPri(applying || !masterId)} onClick={handleApply} disabled={applying || !masterId}>
            {applying ? "Застосування..." : result ? "Застосувати ще раз" : "Застосувати"}
          </button>
          <button style={btnSec} onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  );
}

// ── Raw Preview Panel ─────────────────────────────────────────────────────────

function RawPreviewPanel({ data }) {
  const [expanded, setExpanded] = useState(true);
  if (!data) return null;
  const { columns = [], preview_rows = [], total_rows = 0 } = data;

  return (
    <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: "#f0fdf4", cursor: "pointer",
                    borderBottom: expanded ? "1px solid #e5e7eb" : "none" }}
           onClick={() => setExpanded(v => !v)}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#065f46" }}>
          Дані OLAP — {columns.length} колонок, {total_rows} рядків
          <span style={{ marginLeft: 8, fontWeight: 400, color: "#6b7280", fontSize: 11 }}>
            (перші {preview_rows.length})
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#6b7280" }}>{expanded ? "▲ Сховати" : "▼ Показати"}</span>
      </div>
      {expanded && (
        <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c} style={{ ...thS, fontSize: 10, maxWidth: 180 }} title={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview_rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb",
                                     borderBottom: "1px solid #f3f4f6" }}>
                  {columns.map(c => (
                    <td key={c} style={{ ...tdS, maxWidth: 180, overflow: "hidden",
                                         textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={String(row[c] ?? "")}>
                      {row[c] === null || row[c] === undefined
                        ? <span style={{ color: "#d1d5db" }}>NULL</span>
                        : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Mapping Editor with Sample Values ─────────────────────────────────────────

const CANONICAL_FIELDS = {
  departments: [
    "department_uid","department_name","organization_name",
    "branch_name","region_name","holding_name",
    "parent_department_uid","parent_department_name",
    "separated_department_uid","separated_department_name",
  ],
  brands: [
    "brand_uid","brand_name","brand_group",
    "parent_brand_uid","parent_brand_name",
  ],
  articles: [
    "article_uid","article_name","article_type",
    "level1","level2","pnl_code",
    "expense_element","expense_company",
  ],
  sales_fact: [
    "department_uid","department_name","product_group_id",
    "product_group_uid","product_group_name","period_month",
    "sales_vat","sales_retail","excise","sales_dal","sales_kg",
  ],
};

function MappingEditorWithSamples({ sourceId, previewData, onSaved, importType }) {
  const [mapping, setMapping] = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);
  const [open,    setOpen]    = useState(true);

  const columns     = previewData?.columns || [];
  const previewRows = previewData?.preview_rows || [];

  const sampleValues = {};
  for (const col of columns) {
    const vals = [...new Set(
      previewRows.map(r => r[col]).filter(v => v != null && v !== "")
    )].slice(0, 3);
    sampleValues[col] = vals.join(" / ");
  }

  useEffect(() => {
    if (!sourceId) return;
    getFieldMapping(sourceId).then(m => setMapping(m || [])).catch(() => {});
  }, [sourceId]);

  const addRow    = () => setMapping(prev => [...prev, { source_field: "", target_field: "", required: false, transform_rule: "" }]);
  const updateRow = (i, field, val) => setMapping(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const removeRow = (i) => setMapping(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      await saveFieldMapping(sourceId, mapping);
      setMsg({ ok: true, text: "Маппінг збережено" });
      if (onSaved) onSaved();
    } catch {
      setMsg({ ok: false, text: "Помилка збереження" });
    } finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: "#eff6ff", cursor: "pointer",
                    borderBottom: open ? "1px solid #e5e7eb" : "none" }}
           onClick={() => setOpen(v => !v)}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1e40af" }}>
          Маппінг полів ({mapping.length} рядків)
        </span>
        <span style={{ fontSize: 11, color: "#6b7280" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: 10 }}>
          {msg && (
            <div style={{ padding: "5px 10px", borderRadius: 4, fontSize: 12, marginBottom: 8,
                          background: msg.ok ? "#d1fae5" : "#fee2e2",
                          color: msg.ok ? "#065f46" : "#991b1b" }}>
              {msg.text}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, minWidth: 180 }}>Поле джерела (OLAP)</th>
                  <th style={{ ...thS, minWidth: 150 }}>Приклади значень</th>
                  <th style={{ ...thS, minWidth: 150 }}>Поле системи</th>
                  <th style={{ ...thS, width: 70, textAlign: "center" }}>Обов'язк.</th>
                  <th style={{ ...thS, width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "3px 6px" }}>
                      {columns.length > 0 ? (
                        <select value={row.source_field}
                                onChange={e => updateRow(i, "source_field", e.target.value)}
                                style={inS}>
                          <option value="">— оберіть —</option>
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input value={row.source_field}
                               onChange={e => updateRow(i, "source_field", e.target.value)}
                               style={inS} />
                      )}
                    </td>
                    <td style={{ padding: "3px 6px" }}>
                      <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace",
                                     background: "#f9fafb", padding: "2px 5px", borderRadius: 3,
                                     display: "block", overflow: "hidden", textOverflow: "ellipsis",
                                     whiteSpace: "nowrap", maxWidth: 180 }}
                            title={sampleValues[row.source_field] || ""}>
                        {sampleValues[row.source_field] || <span style={{ color: "#d1d5db" }}>—</span>}
                      </span>
                    </td>
                    <td style={{ padding: "3px 6px" }}>
                      {(() => {
                        const canonicalList = CANONICAL_FIELDS[importType] || [];
                        const isExtra = row.target_field && !canonicalList.includes(row.target_field);
                        const listId  = `cf-${importType}`;
                        return (
                          <>
                            <input value={row.target_field}
                              onChange={e => updateRow(i, "target_field", e.target.value)}
                              list={listId}
                              style={{ ...inS, borderColor: isExtra ? "#f59e0b" : undefined,
                                              background:  isExtra ? "#fffbeb" : undefined }}
                              placeholder="Назва поля системи..." />
                            {canonicalList.length > 0 && (
                              <datalist id={listId}>
                                {canonicalList.map(f => <option key={f} value={f} />)}
                              </datalist>
                            )}
                            {isExtra && (
                              <div style={{ fontSize: 10, color: "#92400e", marginTop: 2 }}>
                                extra_fields (не canonical)
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "3px 6px", textAlign: "center" }}>
                      <input type="checkbox" checked={!!row.required}
                             onChange={e => updateRow(i, "required", e.target.checked)} />
                    </td>
                    <td style={{ padding: "3px 5px", textAlign: "center" }}>
                      <button onClick={() => removeRow(i)}
                              style={{ background: "none", border: "none", cursor: "pointer",
                                       color: "#ef4444", fontSize: 14, lineHeight: 1 }}>✕</button>
                    </td>
                  </tr>
                ))}
                {mapping.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 12, textAlign: "center", color: "#9ca3af", fontSize: 11 }}>
                    Маппінг порожній. Натисніть "+ Рядок".
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={{ ...btnGhost, fontSize: 11 }} onClick={addRow}>+ Рядок</button>
            <button style={{ ...btnPri(saving), fontSize: 11, padding: "4px 12px" }}
                    onClick={handleSave} disabled={saving}>
              {saving ? "..." : "Зберегти маппінг"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Type-specific staging tables ──────────────────────────────────────────────

function SalesStagingTable({ rows, onRowClick }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <thead>
        <tr>
          {["Статус","Маппінг","Період","Підрозділ (джерело)","Master підрозділ",
            "Бренд / НГ (джерело)","Master бренд","з ПДВ","Роздріб","Дал","Помилка"].map(h => (
            <th key={h} style={thS}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} onClick={() => onRowClick && onRowClick(r)}
              style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#fafafa"; }}
              onMouseLeave={e => { e.currentTarget.style.background = ""; }}>
            <td style={tdS}><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
            <td style={tdS}><MappingBadge status={r.mapping_status} /></td>
            <td style={tdS}>{r.period_month}</td>
            <td style={{ ...tdS, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={`${r.department_uid || "—"} | ${r.department_name}`}>
              {r.department_name || <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ ...tdS, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.master_department_name
                ? <span style={{ color: "#1e40af", fontWeight: 500 }}>{r.master_department_name}</span>
                : <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ ...tdS, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={`${r.product_group_uid || "—"} | ${r.product_group_name}`}>
              {r.product_group_name || <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ ...tdS, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.master_brand_name
                ? <span style={{ color: "#1e40af", fontWeight: 500 }}>{r.master_brand_name}</span>
                : <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ ...tdS, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_vat)}</td>
            <td style={{ ...tdS, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_retail)}</td>
            <td style={{ ...tdS, textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_dal, 3)}</td>
            <td style={{ ...tdS, color: "#991b1b", maxWidth: 120, overflow: "hidden",
                         textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={r.validation_error || ""}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DepartmentsStagingTable({ rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <thead>
        <tr>
          {[
            "Статус", "UID", "Підрозділ",
            "Parent UID", "Parent підрозділ",
            "Sep. UID", "Separated назва",
            "Організація", "Філія", "Регіон", "Помилка",
          ].map(h => <th key={h} style={thS}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6",
                                   background: r.validation_status === "invalid" ? "#fff5f5" : "#fff" }}>
            <td style={tdS}><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
            <td style={tdS}><code style={{ fontSize: 10 }}>{r.department_uid || "—"}</code></td>
            <td style={tdS}>{r.department_name || "—"}</td>
            <td style={tdS}><code style={{ fontSize: 10 }}>{r.parent_department_uid || "—"}</code></td>
            <td style={tdS}>{r.parent_department_name || <span style={{ color: "#d1d5db" }}>—</span>}</td>
            <td style={tdS}>
              {r.separated_department_uid
                ? <code style={{ fontSize: 10, color: "#0369a1", background: "#e0f2fe",
                                  padding: "1px 4px", borderRadius: 3 }}>
                    {r.separated_department_uid}
                  </code>
                : <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ ...tdS, color: "#0369a1" }}>
              {r.separated_department_name || <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={tdS}>{r.organization_name || "—"}</td>
            <td style={tdS}>{r.branch_name || <span style={{ color: "#d1d5db" }}>—</span>}</td>
            <td style={tdS}>{r.region_name || <span style={{ color: "#d1d5db" }}>—</span>}</td>
            <td style={{ ...tdS, color: "#991b1b", maxWidth: 200, whiteSpace: "pre-wrap" }}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BrandsStagingTable({ rows }) {
  const [fStatus,  setFStatus]  = useState("");
  const [fSearch,  setFSearch]  = useState("");
  const [fGroup,   setFGroup]   = useState("");
  const [fLevel,   setFLevel]   = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fActive,  setFActive]  = useState("");
  const [fParent,  setFParent]  = useState(""); // "" | "__none__" | actual parent name
  const [fError,   setFError]   = useState(""); // "" | "yes" | "no"

  const uniq = (field) =>
    [...new Set((rows || []).map(r => r[field]).filter(v => v != null && v !== ""))].sort();

  const groups    = uniq("brand_group");
  const levels    = uniq("source_level");
  const companies = uniq("company_name");
  const actives   = uniq("is_active");
  const parents   = uniq("parent_brand_name");

  const filtered = (rows || []).filter(r => {
    if (fStatus && r.validation_status !== fStatus) return false;
    if (fSearch) {
      const q = fSearch.toLowerCase();
      if (!(r.brand_uid || "").toLowerCase().includes(q) &&
          !(r.brand_name || "").toLowerCase().includes(q)) return false;
    }
    if (fGroup   && r.brand_group  !== fGroup)   return false;
    if (fLevel   && r.source_level !== fLevel)   return false;
    if (fCompany && r.company_name !== fCompany) return false;
    if (fActive  && r.is_active    !== fActive)  return false;
    if      (fParent === "__none__")              { if (r.parent_brand_name)            return false; }
    else if (fParent)                             { if (r.parent_brand_name !== fParent) return false; }
    if (fError === "yes" && !r.validation_error) return false;
    if (fError === "no"  &&  r.validation_error) return false;
    return true;
  });

  const clearAll = () => {
    setFStatus(""); setFSearch(""); setFGroup(""); setFLevel("");
    setFCompany(""); setFActive(""); setFParent(""); setFError("");
  };
  const hasAnyFilter = !!(fStatus || fSearch || fGroup || fLevel || fCompany || fActive || fParent || fError);
  const total = (rows || []).length;

  // Filter cell styles
  const fcS = { padding: "2px 3px", background: "#f3f4f6", borderBottom: "1px solid #d1d5db" };
  const selS = { width: "100%", padding: "2px 4px", border: "1px solid #d1d5db",
                 borderRadius: 3, fontSize: 10, background: "#fff" };
  const inpS = { width: "100%", padding: "2px 4px", border: "1px solid #d1d5db",
                 borderRadius: 3, fontSize: 10, boxSizing: "border-box" };
  const xS   = { cursor: "pointer", color: "#9ca3af", fontSize: 14, background: "none",
                 border: "none", padding: "0 1px", lineHeight: 1, flexShrink: 0 };

  // Helper: filter cell with optional clear button
  const FC = ({ val, clr, span, children }) => (
    <th style={fcS} colSpan={span}>
      <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {val && <button onClick={clr} style={xS} title="Скинути">×</button>}
      </div>
    </th>
  );

  return (
    <div>
      {/* Count + global reset */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0 5px" }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          <strong style={{ color: "#111827" }}>{filtered.length}</strong>
          <span style={{ color: "#d1d5db", margin: "0 3px" }}>/</span>
          {total}
        </span>
        {hasAnyFilter && (
          <button onClick={clearAll}
            style={{ padding: "2px 10px", fontSize: 11, background: "#fee2e2",
                     border: "1px solid #fca5a5", borderRadius: 4, cursor: "pointer", color: "#991b1b" }}>
            ✕ Скинути всі
          </button>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          {/* Column headers */}
          <tr>
            {["Статус","UID","Назва","Група","Рівень","Компанія","Активний","Ref ID","Parent","Помилка"].map(h => (
              <th key={h} style={thS}>{h}</th>
            ))}
          </tr>
          {/* Filter row — aligned per column */}
          <tr>
            {/* 1 — Status */}
            <FC val={fStatus} clr={() => setFStatus("")}>
              <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={selS}>
                <option value="">Всі</option>
                <option value="valid">valid</option>
                <option value="invalid">invalid</option>
              </select>
            </FC>
            {/* 2+3 — UID / Name (single search, spans 2 cols) */}
            <FC val={fSearch} clr={() => setFSearch("")} span={2}>
              <input value={fSearch} onChange={e => setFSearch(e.target.value)}
                     placeholder="UID або назва..." style={inpS} />
            </FC>
            {/* 4 — Group */}
            <FC val={fGroup} clr={() => setFGroup("")}>
              <select value={fGroup} onChange={e => setFGroup(e.target.value)} style={selS}>
                <option value="">Всі</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </FC>
            {/* 5 — Level */}
            <FC val={fLevel} clr={() => setFLevel("")}>
              <select value={fLevel} onChange={e => setFLevel(e.target.value)} style={selS}>
                <option value="">Всі</option>
                {levels.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </FC>
            {/* 6 — Company */}
            <FC val={fCompany} clr={() => setFCompany("")}>
              <select value={fCompany} onChange={e => setFCompany(e.target.value)} style={selS}>
                <option value="">Всі</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FC>
            {/* 7 — Active */}
            <FC val={fActive} clr={() => setFActive("")}>
              <select value={fActive} onChange={e => setFActive(e.target.value)} style={selS}>
                <option value="">Всі</option>
                {actives.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </FC>
            {/* 8 — Ref ID: no filter */}
            <th style={{ ...fcS, background: "#f9fafb" }} />
            {/* 9 — Parent: DISTINCT values + "Без parent" */}
            <FC val={fParent} clr={() => setFParent("")}>
              <select value={fParent} onChange={e => setFParent(e.target.value)} style={selS}>
                <option value="">Всі</option>
                <option value="__none__">Без parent</option>
                {parents.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FC>
            {/* 10 — Error */}
            <FC val={fError} clr={() => setFError("")}>
              <select value={fError} onChange={e => setFError(e.target.value)} style={selS}>
                <option value="">Всі</option>
                <option value="yes">Є помилка</option>
                <option value="no">Без помилки</option>
              </select>
            </FC>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ padding: 12, textAlign: "center", color: "#9ca3af" }}>
                {hasAnyFilter ? "Рядків не знайдено за фільтром" : "Немає даних"}
              </td>
            </tr>
          ) : filtered.map(r => (
            <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6",
                                     background: r.validation_status === "invalid" ? "#fff5f5" : "#fff" }}>
              <td style={tdS}><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
              <td style={tdS}><code style={{ fontSize: 10 }}>{r.brand_uid || "—"}</code></td>
              <td style={tdS}>{r.brand_name || "—"}</td>
              <td style={{ ...tdS, color: "#6b7280" }}>{r.brand_group || "—"}</td>
              <td style={{ ...tdS, color: "#6b7280" }}>{r.source_level || "—"}</td>
              <td style={{ ...tdS, color: "#6b7280" }}>{r.company_name || "—"}</td>
              <td style={{ ...tdS, color: "#6b7280" }}>{r.is_active || "—"}</td>
              <td style={{ ...tdS, color: "#6b7280" }}><code style={{ fontSize: 9 }}>{r.brand_id || "—"}</code></td>
              <td style={tdS}>{r.parent_brand_name || "—"}</td>
              <td style={{ ...tdS, color: "#991b1b", fontSize: 10 }}>{r.validation_error || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArticlesStagingTable({ rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <thead>
        <tr>
          {["Статус","UID","Назва статті","Тип","Level1","Level2","PnL код","Помилка"].map(h => (
            <th key={h} style={thS}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6",
                                   background: r.validation_status === "invalid" ? "#fff5f5" : "#fff" }}>
            <td style={tdS}><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
            <td style={tdS}><code style={{ fontSize: 10 }}>{r.article_uid || "—"}</code></td>
            <td style={tdS}>{r.article_name || "—"}</td>
            <td style={tdS}>{r.article_type || "—"}</td>
            <td style={tdS}>{r.level1 || "—"}</td>
            <td style={tdS}>{r.level2 || "—"}</td>
            <td style={tdS}>{r.pnl_code || "—"}</td>
            <td style={{ ...tdS, color: "#991b1b" }}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StagingRows({ importType, rows, onRowClick }) {
  if (!rows || rows.length === 0)
    return <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>Рядків не знайдено</div>;
  if (importType === "departments") return <DepartmentsStagingTable rows={rows} />;
  if (importType === "brands")     return <BrandsStagingTable rows={rows} />;
  if (importType === "articles")   return <ArticlesStagingTable rows={rows} />;
  if (importType === "sales_fact") return <SalesStagingTable rows={rows} onRowClick={onRowClick} />;
  return null;
}

// ── KPI pill ──────────────────────────────────────────────────────────────────

function KpiPill({ label, value, color }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5,
                   padding: "3px 11px", borderRadius: 20, background: "#f3f4f6", fontSize: 12 }}>
      <span style={{ fontWeight: 700, fontSize: 15, color: color || "#374151" }}>{value}</span>
      <span style={{ color: "#6b7280" }}>{label}</span>
    </span>
  );
}

// ── Batch History ─────────────────────────────────────────────────────────────

function BatchHistoryPanel({ importType, refreshKey, onSelect }) {
  const [batches,     setBatches]     = useState([]);
  const [detailBatch, setDetailBatch] = useState(null);

  const load = useCallback(() => {
    getImportBatches(50)
      .then(data => setBatches((data || []).filter(b => b.import_type_code === importType)))
      .catch(() => {});
  }, [importType]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (batches.length === 0)
    return <div style={{ fontSize: 12, color: "#9ca3af", padding: "6px 0" }}>Батчів не знайдено</div>;

  return (
    <>
      {detailBatch && (
        <BatchDetailModal
          batch={detailBatch}
          onClose={() => setDetailBatch(null)}
          onDelete={async (b, del) => {
            await deleteBatch(b.id, del).catch(() => {});
            load();
          }}
          onViewStaging={(b) => { onSelect && onSelect(b); }}
        />
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {["#","Джерело","Статус","Тип / Ціль","Період"].map(h =>
                <th key={h} style={thS}>{h}</th>)}
              <th style={{ ...thS, textAlign: "right" }}>Всього</th>
              <th style={{ ...thS, textAlign: "right" }}>Валід.</th>
              <th style={{ ...thS, textAlign: "right" }}>Помилок</th>
              <th style={{ ...thS, textAlign: "right" }}>Записано</th>
              {["Час",""].map(h => <th key={h} style={thS}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...tdS, color: "#9ca3af" }}>#{b.id}</td>
                <td style={{ ...tdS, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={b.source_name}>{b.source_name || b.source_id}</td>
                <td style={tdS}>
                  <StatusBadge status={b.status} />
                  {b.error_message && (
                    <div style={{ color: "#991b1b", fontSize: 10, maxWidth: 90, overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}
                         title={b.error_message}>{b.error_message}</div>
                  )}
                </td>
                <td style={tdS}>
                  <div style={{ fontSize: 10, color: "#374151" }}>{b.import_type_code || "—"}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>→ {b.target_table || "—"}</div>
                </td>
                <td style={{ ...tdS, fontSize: 10, whiteSpace: "nowrap" }}>
                  {b.period_from && b.period_to
                    ? <>{b.period_from.slice(0, 7)} — {b.period_to.slice(0, 7)}</>
                    : <span style={{ color: "#d1d5db" }}>—</span>}
                </td>
                <td style={{ ...tdS, textAlign: "right" }}>{b.rows_total ?? "—"}</td>
                <td style={{ ...tdS, textAlign: "right", color: "#065f46", fontWeight: 600 }}>{b.rows_valid ?? b.rows_loaded ?? "—"}</td>
                <td style={{ ...tdS, textAlign: "right",
                             color: (b.rows_invalid ?? 0) > 0 ? "#991b1b" : undefined,
                             fontWeight: (b.rows_invalid ?? 0) > 0 ? 600 : undefined }}>
                  {b.rows_invalid ?? 0}
                </td>
                <td style={{ ...tdS, textAlign: "right", fontWeight: 600 }}>
                  {b.status === "committed" ? (b.rows_loaded_to_target ?? "—") : "—"}
                </td>
                <td style={{ ...tdS, fontSize: 10, whiteSpace: "nowrap" }}>
                  {b.started_at ? new Date(b.started_at).toLocaleString("uk-UA") : "—"}
                </td>
                <td style={tdS}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ fontSize: 11, color: "#7c3aed", background: "none",
                                     border: "none", cursor: "pointer", padding: 0 }}
                      onClick={() => setDetailBatch(b)}>Деталі</button>
                    {(b.status === "loaded" || b.status === "committed") && (
                      <button style={{ fontSize: 11, color: "#6b7280", background: "none",
                                       border: "none", cursor: "pointer", padding: 0 }}
                        onClick={() => onSelect && onSelect(b)}>Staging</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function ImportDataPage({ setActivePage }) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [importType,    setImportType]    = useState(null);
  const [sources,       setSources]       = useState([]);
  const [sourceId,      setSourceId]      = useState("");

  const [previewing,    setPreviewing]    = useState(false);
  const [previewData,   setPreviewData]   = useState(null);

  const today        = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [periodFrom,    setPeriodFrom]    = useState(firstOfMonth);
  const [periodTo,      setPeriodTo]      = useState(lastOfMonth);
  const [replaceMode,   setReplaceMode]   = useState("replace_by_period");

  const [loading,       setLoading]       = useState(false);
  const [loadResult,    setLoadResult]    = useState(null);
  const [batchId,       setBatchId]       = useState(null);
  const [staging,       setStaging]       = useState(null);
  const [statusFilter,  setStatusFilter]  = useState(null);
  const [filterLoading, setFilterLoading] = useState(false);

  const [committing,    setCommitting]    = useState(false);
  const [commitResult,  setCommitResult]  = useState(null);

  const [deptFilterName,       setDeptFilterName]       = useState("");
  const [deptFilterParentName, setDeptFilterParentName] = useState("");
  const [deptFilterOrg,        setDeptFilterOrg]        = useState("");
  const [deptFilterBranch,     setDeptFilterBranch]     = useState("");
  const [deptFilterRegion,     setDeptFilterRegion]     = useState("");
  const [deptFilterSeparated,  setDeptFilterSeparated]  = useState("");

  const [error,          setError]          = useState(null);
  const [success,        setSuccess]        = useState(null);
  const [detailRow,      setDetailRow]      = useState(null);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [historyKey,     setHistoryKey]     = useState(0);

  // ── Load sources when type changes ─────────────────────────────────────────
  useEffect(() => {
    if (!importType) return;
    getEngineSources()
      .then(data => setSources((data || []).filter(s => s.import_type_code === importType)))
      .catch(() => {});
  }, [importType]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const resetDeptFilters = () => {
    setDeptFilterName(""); setDeptFilterParentName("");
    setDeptFilterOrg(""); setDeptFilterBranch(""); setDeptFilterRegion("");
    setDeptFilterSeparated("");
  };

  const resetBatch = () => {
    setBatchId(null); setStaging(null); setStatusFilter(null);
    setLoadResult(null); setCommitResult(null); setError(null);
    resetDeptFilters();
  };

  const handleTypeSelect = (type) => {
    setImportType(type); setSourceId(""); setPreviewData(null);
    setPreviewing(false); resetBatch(); setSuccess(null);
  };

  const handleSourceChange = (id) => {
    setSourceId(id); setPreviewData(null); resetBatch(); setSuccess(null);
  };

  const handlePreview = async () => {
    if (!sourceId) return;
    setPreviewing(true); setError(null); setPreviewData(null);
    try {
      setPreviewData(await previewEngineSource(Number(sourceId)));
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка підключення до джерела");
    } finally { setPreviewing(false); }
  };

  const handleLoad = async () => {
    if (!sourceId) return;
    const meta = IMPORT_TYPES[importType];
    if (meta?.hasPeriod && (!periodFrom || !periodTo)) {
      setError("Вкажіть Період від та Період до"); return;
    }
    if (meta?.hasPeriod && periodFrom > periodTo) {
      setError("Період від не може бути більшим за Період до"); return;
    }
    setLoading(true); setError(null); resetBatch();
    try {
      const params = {};
      if (meta?.hasPeriod) {
        params.period_from  = periodFrom;
        params.period_to    = periodTo;
        params.period_field = "period_month";
        params.replace_mode = replaceMode;
      }
      const res = await loadToStaging(Number(sourceId), params);
      setBatchId(res.batch_id);
      setStaging(res.staging);
      setLoadResult(res);
      setSuccess(
        `OLAP: ${res.rows_total} рядків. У staging: ${res.rows_loaded}` +
        ` (валідних ${res.rows_valid}, помилок ${res.rows_invalid})`
      );
      setHistoryKey(k => k + 1);
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка завантаження");
    } finally { setLoading(false); }
  };

  const handleFilterChange = async (filter) => {
    if (!batchId) return;
    setStatusFilter(filter); setFilterLoading(true);
    const previewLimit = importType === "departments" ? 5000 : 500;
    try { setStaging(await getStagingPreview(batchId, filter, previewLimit)); } catch {}
    finally { setFilterLoading(false); }
  };

  const handleRefreshStaging = async () => {
    if (!batchId) return;
    setFilterLoading(true);
    const previewLimit = importType === "departments" ? 5000 : 500;
    try { setStaging(await getStagingPreview(batchId, statusFilter, previewLimit)); } catch {}
    finally { setFilterLoading(false); }
  };

  const handleCommit = async () => {
    if (!batchId || !staging?.valid) return;
    setCommitting(true); setError(null); setCommitResult(null);
    try {
      const res = await commitBatch(batchId);
      setCommitResult(res);
      const meta = IMPORT_TYPES[importType];
      if (meta?.isArticleFlow) {
        const total = (res.inserted ?? 0) + (res.updated ?? 0);
        setSuccess(`${total} статей передано у реєстр джерел. Нових прив'язок: ${res.new_mappings ?? 0}.`);
      } else if (meta?.isBrandFlow) {
        const total = (res.inserted ?? 0) + (res.updated ?? 0);
        setSuccess(`Бренди завантажено: ${total} рядків (нових: ${res.inserted ?? 0}, оновлено: ${res.updated ?? 0}). Прив'язок: ${res.new_mappings ?? 0}.`);
      } else if (meta?.isDepartmentFlow) {
        const total = (res.inserted ?? 0) + (res.updated ?? 0);
        setSuccess(`Підрозділи завантажено: ${total} рядків (нових: ${res.inserted ?? 0}, оновлено: ${res.updated ?? 0}). Прив'язок: ${res.new_mappings ?? 0}.`);
      } else {
        const n = res.committed ?? res.upserted ?? "?";
        setSuccess(`Записано ${n} рядків у ${meta?.targetLabel || "ціль"}`);
      }
      setHistoryKey(k => k + 1);
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка запису");
    } finally { setCommitting(false); }
  };

  const handleViewStaging = async (b) => {
    setBatchId(b.id); setCommitResult(null); setStatusFilter(null);
    setImportType(b.import_type_code);
    try { setStaging(await getStagingPreview(b.id, null, b.import_type_code === "departments" ? 5000 : 500)); } catch {}
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const meta     = importType ? IMPORT_TYPES[importType] : null;
  const canLoad  = sourceId && !loading && (!meta?.hasPeriod || (periodFrom && periodTo));
  const canCommit = staging && staging.valid > 0 && !commitResult;

  const allDeptRows      = staging?.rows || [];
  const filteredDeptRows = importType === "departments"
    ? allDeptRows.filter(r => {
        const txt = (val, f) => !f || (val || "").toLowerCase().includes(f.toLowerCase());
        const sel = (val, f) => !f || (val || "") === f;
        return txt(r.department_name,        deptFilterName)
            && sel(r.parent_department_name,  deptFilterParentName)
            && sel(r.organization_name,       deptFilterOrg)
            && sel(r.branch_name,             deptFilterBranch)
            && sel(r.region_name,             deptFilterRegion)
            && sel(r.separated_department_name, deptFilterSeparated);
      })
    : allDeptRows;

  // Distinct values for dept select filters (from full dataset, not filtered)
  const deptDistinctOrgs      = [...new Set(allDeptRows.map(r => r.organization_name).filter(Boolean))].sort();
  const deptDistinctBranches  = [...new Set(allDeptRows.map(r => r.branch_name).filter(Boolean))].sort();
  const deptDistinctRegions   = [...new Set(allDeptRows.map(r => r.region_name).filter(Boolean))].sort();
  const deptDistinctParents   = [...new Set(allDeptRows.map(r => r.parent_department_name).filter(Boolean))].sort();
  const deptDistinctSeparated = [...new Set(allDeptRows.map(r => r.separated_department_name).filter(Boolean))].sort();

  const selS = { padding: "5px 7px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {detailRow && <RawRowModal row={detailRow} onClose={() => setDetailRow(null)} />}
      {showBulkUpdate && batchId && staging && (
        <BulkUpdateModal
          batchId={batchId} staging={staging} statusFilter={statusFilter}
          onClose={() => setShowBulkUpdate(false)}
          onApplied={(s) => setStaging(s)}
        />
      )}

      <div style={{ background: "#f9fafb", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "10px 20px", display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>Імпорт даних</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
              Import Center — OLAP / SQL → staging → target table
            </div>
          </div>
          {importType && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
                             padding: "4px 12px", borderRadius: 20,
                             background: "#f3e8ff", fontSize: 12, fontWeight: 600, color: "#7c3aed" }}>
                {meta?.icon} {meta?.label}
              </span>
              <button onClick={() => handleTypeSelect(null)} style={btnSec}>
                ← Змінити
              </button>
            </div>
          )}
        </div>

        {/* ── Alerts ── */}
        {error && (
          <div style={{ margin: "8px 20px 0", padding: "8px 12px", background: "#fee2e2",
                        border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13, color: "#991b1b",
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>{typeof error === "string" ? error : JSON.stringify(error)}</span>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none",
                     cursor: "pointer", color: "#991b1b", fontSize: 16, lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        )}
        {success && (
          <div style={{ margin: "8px 20px 0", padding: "8px 12px", background: "#d1fae5",
                        border: "1px solid #6ee7b7", borderRadius: 6, fontSize: 13, color: "#065f46",
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} style={{ background: "none", border: "none",
                     cursor: "pointer", fontSize: 16, lineHeight: 1, color: "#065f46", flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* ── Content ── */}
        <div style={{ flex: 1, padding: "12px 20px", overflow: "auto" }}>

          {/* ── Step 1: Type selector ── */}
          {!importType && (
            <div style={secS}>
              <div style={secTitleS}>Що імпортуємо?</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {Object.entries(IMPORT_TYPES).map(([code, m]) => (
                  <div key={code} onClick={() => handleTypeSelect(code)}
                       style={{
                         padding: "12px 16px", borderRadius: 8, cursor: "pointer",
                         border: "2px solid #e5e7eb", background: "#fff",
                         minWidth: 150, transition: "all .12s",
                       }}
                       onMouseEnter={e => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.background = "#faf5ff"; }}
                       onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#fff"; }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importType && (
            <>
              {/* ── Step 2: Source ── */}
              <div style={secS}>
                <div style={secTitleS}>Джерело даних</div>
                {sources.length === 0 && (
                  <div style={{ padding: "8px 12px", background: "#fef3c7", border: "1px solid #f59e0b",
                                borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
                    Немає джерел з типом "{meta?.label}". Налаштуйте джерело у «Відповідність».
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Джерело ({meta?.label})</label>
                    <select value={sourceId} onChange={e => handleSourceChange(e.target.value)}
                            style={{ ...selS, minWidth: 280 }}>
                      <option value="">— оберіть —</option>
                      {sources.map(s => (
                        <option key={s.id} value={s.id}>{s.source_name} ({s.source_type})</option>
                      ))}
                    </select>
                  </div>
                  {sourceId && (
                    <button style={btnSec} onClick={handlePreview} disabled={previewing}>
                      {previewing ? "Отримання..." : "Отримати дані OLAP"}
                    </button>
                  )}
                </div>

                <RawPreviewPanel data={previewData} />
                {sourceId && (
                  <MappingEditorWithSamples
                    sourceId={Number(sourceId)}
                    previewData={previewData}
                    importType={importType}
                  />
                )}
              </div>

              {/* ── Step 3: Period (sales_fact only) ── */}
              {sourceId && meta?.hasPeriod && (
                <div style={secS}>
                  <div style={secTitleS}>Параметри імпорту</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                    {[
                      { label: "Період від *", val: periodFrom, set: setPeriodFrom },
                      { label: "Період до *",  val: periodTo,   set: setPeriodTo   },
                    ].map(({ label, val, set }) => (
                      <div key={label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</label>
                        <input type="date" value={val} onChange={e => set(e.target.value)}
                               style={{ ...selS, minWidth: 150 }} />
                      </div>
                    ))}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Режим заміни</label>
                      <select value={replaceMode} onChange={e => setReplaceMode(e.target.value)} style={{ ...selS, minWidth: 280 }}>
                        <option value="replace_by_period">Замінити за period_month + source_id</option>
                        <option value="append">Дописати (без видалення)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Load button ── */}
              {sourceId && (
                <div style={{ marginBottom: 12 }}>
                  <button style={{ ...btnPri(!canLoad), padding: "8px 22px", fontSize: 13 }}
                          onClick={handleLoad} disabled={!canLoad}>
                    {loading ? "Завантаження з OLAP..." : "📥 Отримати дані та завантажити в staging"}
                  </button>
                </div>
              )}

              {/* Load result summary */}
              {loadResult && (
                <div style={{ marginBottom: 10, padding: "8px 14px", background: "#eff6ff",
                              border: "1px solid #bfdbfe", borderRadius: 6, fontSize: 12 }}>
                  OLAP: <strong>{loadResult.rows_total}</strong> рядків
                  {loadResult.rows_filtered_out > 0 && (
                    <span style={{ color: "#92400e" }}>
                      {" "}— поза [{periodFrom}..{periodTo}]: <strong>{loadResult.rows_filtered_out}</strong>
                    </span>
                  )}
                  {" "} | Staging: <strong>{loadResult.rows_loaded}</strong>
                  {" "} | Валідних: <strong style={{ color: "#065f46" }}>{loadResult.rows_valid}</strong>
                  {" "} | Помилок: <strong style={{ color: loadResult.rows_invalid > 0 ? "#991b1b" : "#065f46" }}>{loadResult.rows_invalid}</strong>
                </div>
              )}

              {/* ── Step 4: Staging preview ── */}
              {staging && batchId && (
                <div style={secS}>
                  <div style={secTitleS}>
                    Staging — batch #{batchId}
                    {filterLoading && <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400 }}>оновлення…</span>}
                  </div>

                  {/* KPI pills */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <KpiPill label="Всього"   value={staging.total}   color="#374151" />
                    <KpiPill label="Валідних" value={staging.valid}   color="#065f46" />
                    <KpiPill label="Помилок"  value={staging.invalid} color={staging.invalid > 0 ? "#991b1b" : "#065f46"} />
                    {staging.total_sales_vat != null && (
                      <KpiPill label="Продажі з ПДВ" value={fmtNum(staging.total_sales_vat)} />
                    )}
                    {(staging.period_from || staging.period_to) && (
                      <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 4 }}>
                        Період: <strong style={{ color: "#374151" }}>{staging.period_from || "—"}</strong>
                        {" — "}
                        <strong style={{ color: "#374151" }}>{staging.period_to || "—"}</strong>
                      </span>
                    )}
                  </div>

                  {/* Filter tabs */}
                  <div style={{ display: "flex", gap: 5, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {[
                      { label: `Всі (${staging.total})`,       val: null },
                      { label: `Валідні (${staging.valid})`,   val: "valid" },
                      { label: `Помилки (${staging.invalid})`, val: "invalid" },
                    ].map(f => (
                      <button key={String(f.val)} onClick={() => handleFilterChange(f.val)}
                        style={{
                          padding: "3px 10px", fontSize: 11, borderRadius: 4, cursor: "pointer",
                          border: "1px solid #d1d5db",
                          background: statusFilter === f.val ? "#374151" : "#fff",
                          color:      statusFilter === f.val ? "#fff"    : "#374151",
                          fontWeight: statusFilter === f.val ? 700       : 400,
                        }}>
                        {f.label}
                      </button>
                    ))}
                    <button onClick={handleRefreshStaging} disabled={filterLoading} style={btnGhost}>
                      {filterLoading ? "..." : "↻ Оновити"}
                    </button>
                    {importType === "sales_fact" && staging.invalid > 0 && (
                      <button onClick={() => setShowBulkUpdate(true)}
                        style={{ marginLeft: "auto", padding: "3px 12px", fontSize: 11, fontWeight: 600,
                                 border: "1px solid #3b82f6", borderRadius: 4,
                                 cursor: "pointer", background: "#eff6ff", color: "#1e40af" }}>
                        ✏ Масове заповнення
                      </button>
                    )}
                  </div>

                  {/* Department field filters */}
                  {importType === "departments" && (
                    <div style={{ marginBottom: 10, padding: "8px 10px", background: "#f9fafb",
                                  border: "1px solid #e5e7eb", borderRadius: 6 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>

                        {/* Назва — text search (too many unique values for a select) */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <label style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>Підрозділ</label>
                          <input value={deptFilterName} onChange={e => setDeptFilterName(e.target.value)}
                                 placeholder="Пошук…"
                                 style={{ padding: "3px 7px", fontSize: 11, border: "1px solid #d1d5db",
                                          borderRadius: 4, width: 160 }} />
                        </div>

                        {/* Parent підрозділ — select */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <label style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>Parent підрозділ</label>
                          <select value={deptFilterParentName} onChange={e => setDeptFilterParentName(e.target.value)}
                            style={{ padding: "3px 7px", fontSize: 11, border: "1px solid #d1d5db",
                                     borderRadius: 4, minWidth: 160, background: "#fff" }}>
                            <option value="">Всі</option>
                            {deptDistinctParents.map(v => (
                              <option key={v} value={v} title={v}>{v.length > 35 ? v.slice(0, 35) + "…" : v}</option>
                            ))}
                          </select>
                        </div>

                        {/* Організація — select */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <label style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>Організація</label>
                          <select value={deptFilterOrg} onChange={e => setDeptFilterOrg(e.target.value)}
                            style={{ padding: "3px 7px", fontSize: 11, border: "1px solid #d1d5db",
                                     borderRadius: 4, minWidth: 130, background: "#fff" }}>
                            <option value="">Всі</option>
                            {deptDistinctOrgs.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>

                        {/* Філія — select */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <label style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>Філія</label>
                          <select value={deptFilterBranch} onChange={e => setDeptFilterBranch(e.target.value)}
                            style={{ padding: "3px 7px", fontSize: 11, border: "1px solid #d1d5db",
                                     borderRadius: 4, minWidth: 110, background: "#fff" }}>
                            <option value="">Всі</option>
                            {deptDistinctBranches.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>

                        {/* Регіон — select */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <label style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>Регіон</label>
                          <select value={deptFilterRegion} onChange={e => setDeptFilterRegion(e.target.value)}
                            style={{ padding: "3px 7px", fontSize: 11, border: "1px solid #d1d5db",
                                     borderRadius: 4, minWidth: 110, background: "#fff" }}>
                            <option value="">Всі</option>
                            {deptDistinctRegions.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>

                        {/* Separated назва — select (лише рядки що мають значення) */}
                        {deptDistinctSeparated.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <label style={{ fontSize: 10, color: "#0369a1", fontWeight: 600 }}>Separated назва</label>
                            <select value={deptFilterSeparated} onChange={e => setDeptFilterSeparated(e.target.value)}
                              style={{ padding: "3px 7px", fontSize: 11, border: "1px solid #93c5fd",
                                       borderRadius: 4, minWidth: 160, background: "#eff6ff" }}>
                              <option value="">Всі</option>
                              {deptDistinctSeparated.map(v => (
                                <option key={v} value={v} title={v}>{v.length > 35 ? v.slice(0, 35) + "…" : v}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <button onClick={resetDeptFilters} style={{ ...btnGhost, alignSelf: "flex-end" }}>Очистити</button>
                      </div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 5 }}>
                        <strong style={{ color: "#374151" }}>{filteredDeptRows.length}</strong> з{" "}
                        <strong style={{ color: "#374151" }}>{allDeptRows.length}</strong> рядків
                      </div>
                    </div>
                  )}

                  {/* Staging table */}
                  <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto",
                                border: "1px solid #e5e7eb", borderRadius: 6 }}>
                    <StagingRows
                      importType={importType}
                      rows={filteredDeptRows}
                      onRowClick={importType === "sales_fact" ? setDetailRow : undefined}
                    />
                  </div>
                  {importType === "sales_fact" && (
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>
                      Клік на рядок — деталі та raw OLAP
                    </div>
                  )}

                  {/* Commit block */}
                  <div style={{ marginTop: 12, padding: "12px 14px", background: "#f9fafb",
                                border: "1px solid #e5e7eb", borderRadius: 6 }}>
                    {!commitResult ? (
                      <>
                        {staging.invalid > 0 && (
                          <div style={{ padding: "6px 10px", background: "#fef3c7",
                                        border: "1px solid #f59e0b", borderRadius: 5,
                                        marginBottom: 10, fontSize: 12 }}>
                            Буде записано <strong>{staging.valid}</strong> валідних.{" "}
                            <strong>{staging.invalid}</strong> невалідних залишаться у staging.
                          </div>
                        )}
                        <button style={{ ...btnPri(!canLoad || committing || !canCommit), padding: "7px 20px", fontSize: 13 }}
                                onClick={handleCommit} disabled={committing || !canCommit}>
                          {committing ? "Запис..." : canCommit
                            ? meta?.isArticleFlow    ? `✅ Передати ${staging.valid} статей у відповідність`
                            : meta?.isBrandFlow      ? `✅ Передати ${staging.valid} брендів у відповідність`
                            : meta?.isDepartmentFlow ? `✅ Передати ${staging.valid} підрозділів у реєстр`
                            :                          `✅ Завантажити ${staging.valid} рядків → ${meta?.targetLabel}`
                            : "Немає валідних рядків"}
                        </button>
                      </>
                    ) : (
                      <div style={{ padding: "10px 14px", background: "#d1fae5",
                                    border: "1px solid #6ee7b7", borderRadius: 6, fontSize: 13 }}>
                        {meta?.isArticleFlow ? (
                          <>
                            <div>
                              Статті завантажено у реєстр джерел:{" "}
                              <strong>{(commitResult.inserted ?? 0) + (commitResult.updated ?? 0)}</strong> рядків
                              (нових: {commitResult.inserted ?? 0}, оновлено: {commitResult.updated ?? 0}).
                              Нових прив'язок: <strong>{commitResult.new_mappings ?? 0}</strong>.
                            </div>
                            {setActivePage && (
                              <div style={{ marginTop: 8, fontSize: 12 }}>
                                Перейдіть у{" "}
                                <button onClick={() => setActivePage("articleSourceMapping")}
                                  style={{ color: "#7c3aed", background: "none", border: "none",
                                           cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0 }}>
                                  Відповідність статей →
                                </button>
                              </div>
                            )}
                          </>
                        ) : meta?.isBrandFlow ? (
                          <>
                            <div>
                              Бренди завантажено:{" "}
                              <strong>{(commitResult.inserted ?? 0) + (commitResult.updated ?? 0)}</strong> рядків
                              (нових: {commitResult.inserted ?? 0}, оновлено: {commitResult.updated ?? 0}).
                              Прив'язок: <strong>{commitResult.new_mappings ?? 0}</strong>.
                            </div>
                            {setActivePage && (
                              <div style={{ marginTop: 8, fontSize: 12 }}>
                                <button onClick={() => setActivePage("brandSourceMapping")}
                                  style={{ color: "#7c3aed", background: "none", border: "none",
                                           cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0 }}>
                                  Відповідність брендів →
                                </button>
                              </div>
                            )}
                          </>
                        ) : meta?.isDepartmentFlow ? (
                          <>
                            <div>
                              Підрозділи завантажено:{" "}
                              <strong>{(commitResult.inserted ?? 0) + (commitResult.updated ?? 0)}</strong> рядків
                              (нових: {commitResult.inserted ?? 0}, оновлено: {commitResult.updated ?? 0}).
                              Прив'язок: <strong>{commitResult.new_mappings ?? 0}</strong>.
                            </div>
                            {setActivePage && (
                              <div style={{ marginTop: 8, fontSize: 12 }}>
                                <button onClick={() => setActivePage("departmentSourceMapping")}
                                  style={{ color: "#7c3aed", background: "none", border: "none",
                                           cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0 }}>
                                  Відповідність підрозділів →
                                </button>
                              </div>
                            )}
                          </>
                        ) : commitResult.upserted != null ? (
                          <>Upsert: <strong>{commitResult.upserted}</strong> рядків
                              (вставлено {commitResult.inserted}, оновлено {commitResult.updated})
                              у {meta?.targetLabel}</>
                        ) : (
                          <>Записано <strong>{commitResult.committed}</strong> рядків у {meta?.targetLabel}
                              {commitResult.deleted_from_target > 0 &&
                                <span style={{ color: "#92400e" }}> (замінено {commitResult.deleted_from_target} попередніх)</span>}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Batch history ── */}
              <div style={secS}>
                <div style={secTitleS}>Історія імпортів — {meta?.label}</div>
                <BatchHistoryPanel
                  key={`${importType}-${historyKey}`}
                  importType={importType}
                  refreshKey={historyKey}
                  onSelect={handleViewStaging}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
