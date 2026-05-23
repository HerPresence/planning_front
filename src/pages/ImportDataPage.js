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
    desc: "OLAP → dim_department",
    hasPeriod: false,
    targetLabel: "dim_department",
  },
  brands: {
    label: "Бренди / НГ",
    icon: "🏷",
    desc: "OLAP → dim_brand",
    hasPeriod: false,
    targetLabel: "dim_brand",
  },
  articles: {
    label: "Статті PnL",
    icon: "📋",
    desc: "OLAP → dim_article",
    hasPeriod: false,
    targetLabel: "dim_article",
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
  padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
  fontWeight: 600, fontSize: 11, color: "#6b7280", background: "#f9fafb",
  position: "sticky", top: 0,
};
const tdS = { padding: "5px 10px", verticalAlign: "middle", fontSize: 12 };
const inS = {
  width: "100%", padding: "4px 6px", border: "1px solid #d1d5db",
  borderRadius: 4, fontSize: 12, boxSizing: "border-box",
};

// ── Badges ────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  loading:    { label: "Завантаження...", bg: "#fef3c7", color: "#92400e" },
  loaded:     { label: "У staging",      bg: "#dbeafe", color: "#1e40af" },
  committing: { label: "Запис...",        bg: "#e0e7ff", color: "#3730a3" },
  committed:  { label: "Записано",        bg: "#d1fae5", color: "#065f46" },
  failed:     { label: "Помилка",         bg: "#fee2e2", color: "#991b1b" },
  rolled_back:{ label: "Відкат",          bg: "#f3f4f6", color: "#6b7280" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 4,
                   padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

const V_BADGE = {
  valid:   { background: "#d1fae5", color: "#065f46",  borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 },
  invalid: { background: "#fee2e2", color: "#991b1b",  borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 },
  pending: { background: "#f3f4f6", color: "#374151",  borderRadius: 4, padding: "2px 8px", fontSize: 11 },
};

const MAP_BADGE = {
  not_set: { label: "—",      background: "#f3f4f6", color: "#9ca3af" },
  manual:  { label: "вручну", background: "#dbeafe", color: "#1e40af" },
  auto:    { label: "авто",   background: "#d1fae5", color: "#065f46" },
  error:   { label: "помилка",background: "#fee2e2", color: "#991b1b" },
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

  const handleDelete = async () => {
    let deleteFact = false;
    const msg = isCommitted
      ? `Видалити batch #${batch.id}?\n\nЗаписано в ${batch.target_table}.\n\nОберіть далі чи видалити записані дані.`
      : `Видалити batch #${batch.id} та ${batch.rows_loaded} рядків у staging?`;
    if (!window.confirm(msg)) return;
    if (isCommitted) {
      deleteFact = window.confirm(`Також видалити дані із ${batch.target_table}?`);
    }
    onDelete(batch, deleteFact);
    onClose();
  };

  const f = (label, value) => (
    <div style={{ display: "flex", borderBottom: "1px solid #f3f4f6", padding: "6px 0" }}>
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
            <button className="btn btn-secondary"
              onClick={() => { onViewStaging(batch); onClose(); }}>
              Переглянути staging
            </button>
          )}
          <button style={{ padding: "6px 16px", border: "1px solid #fca5a5", borderRadius: 4,
                           background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 13 }}
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

        <div className="form-field">
          <label>Поле для заміни</label>
          <select value={targetField}
            onChange={e => { setTargetField(e.target.value); setMasterId(""); setSearch(""); }}
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, width: "100%" }}>
            <option value="department">Підрозділ</option>
            <option value="brand">Бренд / НГ</option>
          </select>
        </div>

        <div className="form-field">
          <label>Значення з довідника</label>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Пошук ${targetField === "department" ? "підрозділу" : "бренду"}...`}
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4,
                     fontSize: 13, width: "100%", marginBottom: 6 }} />
          <select value={masterId} onChange={e => setMasterId(e.target.value)}
            size={Math.min(filteredOptions.length + 1, 8)}
            style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 4,
                     fontSize: 13, width: "100%", minHeight: 80 }}>
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
          <button className="btn btn-primary" onClick={handleApply} disabled={applying || !masterId}>
            {applying ? "Застосування..." : result ? "Застосувати ще раз" : "Застосувати"}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  );
}

// ── Raw Preview Panel ─────────────────────────────────────────────────────────
// Shows real OLAP data BEFORE mapping

function RawPreviewPanel({ data }) {
  const [expanded, setExpanded] = useState(true);
  if (!data) return null;
  const { columns = [], preview_rows = [], total_rows = 0 } = data;

  return (
    <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", background: "#f0fdf4", cursor: "pointer",
                    borderBottom: expanded ? "1px solid #e5e7eb" : "none" }}
           onClick={() => setExpanded(v => !v)}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#065f46" }}>
          Дані OLAP — {columns.length} колонок, {total_rows} рядків
          <span style={{ marginLeft: 8, fontWeight: 400, color: "#6b7280", fontSize: 12 }}>
            (показані перші {preview_rows.length})
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{expanded ? "▲ Сховати" : "▼ Показати"}</span>
      </div>
      {expanded && (
        <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c} style={{ ...thS, fontSize: 11, whiteSpace: "nowrap", maxWidth: 180 }}
                      title={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview_rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb",
                                     borderBottom: "1px solid #f3f4f6" }}>
                  {columns.map(c => (
                    <td key={c} style={{ ...tdS, maxWidth: 200, overflow: "hidden",
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

function MappingEditorWithSamples({ sourceId, previewData, onSaved }) {
  const [mapping,  setMapping]  = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState(null);
  const [open,     setOpen]     = useState(true);

  const columns     = previewData?.columns || [];
  const previewRows = previewData?.preview_rows || [];

  // Compute sample values per column from preview rows
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

  const addRow = () => setMapping(prev => [
    ...prev, { source_field: "", target_field: "", required: false, transform_rule: "" }
  ]);
  const updateRow = (i, field, val) =>
    setMapping(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
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
    <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", background: "#eff6ff", cursor: "pointer",
                    borderBottom: open ? "1px solid #e5e7eb" : "none" }}
           onClick={() => setOpen(v => !v)}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1e40af" }}>
          Маппінг полів ({mapping.length} рядків)
        </span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding: 12 }}>
          {msg && (
            <div style={{ padding: "6px 12px", borderRadius: 4, fontSize: 12, marginBottom: 8,
                          background: msg.ok ? "#d1fae5" : "#fee2e2",
                          color: msg.ok ? "#065f46" : "#991b1b" }}>
              {msg.text}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, minWidth: 200 }}>Поле джерела (OLAP)</th>
                  <th style={{ ...thS, minWidth: 160 }}>Приклади значень</th>
                  <th style={{ ...thS, minWidth: 160 }}>Поле системи</th>
                  <th style={{ ...thS, width: 70, textAlign: "center" }}>Обов'язк.</th>
                  <th style={{ ...thS, width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "4px 8px" }}>
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
                    <td style={{ padding: "4px 8px" }}>
                      <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace",
                                     background: "#f9fafb", padding: "2px 6px", borderRadius: 3,
                                     display: "block", overflow: "hidden", textOverflow: "ellipsis",
                                     whiteSpace: "nowrap", maxWidth: 200 }}
                            title={sampleValues[row.source_field] || ""}>
                        {sampleValues[row.source_field] || <span style={{ color: "#d1d5db" }}>—</span>}
                      </span>
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      <input value={row.target_field}
                             onChange={e => updateRow(i, "target_field", e.target.value)}
                             style={inS} placeholder="target_field" />
                    </td>
                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
                      <input type="checkbox" checked={!!row.required}
                             onChange={e => updateRow(i, "required", e.target.checked)} />
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>
                      <button onClick={() => removeRow(i)}
                              style={{ background: "none", border: "none", cursor: "pointer",
                                       color: "#ef4444", fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                ))}
                {mapping.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 14, textAlign: "center", color: "#9ca3af" }}>
                    Маппінг порожній. Натисніть "+ Рядок" або завантажте з дефолтного.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-secondary" onClick={addRow}
                    style={{ fontSize: 12, padding: "4px 12px" }}>+ Рядок</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}
                    style={{ fontSize: 12, padding: "4px 12px" }}>
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
    <table className="data-table" style={{ fontSize: 11 }}>
      <thead>
        <tr>
          <th>Статус</th>
          <th>Маппінг</th>
          <th>Період</th>
          <th>Підрозділ (джерело)</th>
          <th>Master підрозділ</th>
          <th>Бренд / НГ (джерело)</th>
          <th>Master бренд</th>
          <th style={{ textAlign: "right" }}>з ПДВ</th>
          <th style={{ textAlign: "right" }}>Роздріб</th>
          <th style={{ textAlign: "right" }}>Дал</th>
          <th>Помилка</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} onClick={() => onRowClick && onRowClick(r)} style={{ cursor: "pointer" }}>
            <td><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
            <td><MappingBadge status={r.mapping_status} /></td>
            <td>{r.period_month}</td>
            <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={`${r.department_uid || "—"} | ${r.department_name}`}>
              {r.department_name || <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.master_department_name
                ? <span style={{ color: "#1e40af", fontWeight: 500 }}>{r.master_department_name}</span>
                : <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={`${r.product_group_uid || "—"} | ${r.product_group_name}`}>
              {r.product_group_name || <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.master_brand_name
                ? <span style={{ color: "#1e40af", fontWeight: 500 }}>{r.master_brand_name}</span>
                : <span style={{ color: "#d1d5db" }}>—</span>}
            </td>
            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_vat)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_retail)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_dal, 3)}</td>
            <td style={{ color: "#991b1b", fontSize: 10, maxWidth: 140, overflow: "hidden",
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
    <table className="data-table" style={{ fontSize: 11 }}>
      <thead>
        <tr>
          {["Статус", "UID", "Підрозділ", "Організація", "Філія", "Регіон", "Помилка"].map(h =>
            <th key={h}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ background: r.validation_status === "invalid" ? "#fff5f5" : undefined }}>
            <td><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
            <td><code style={{ fontSize: 10 }}>{r.department_uid || "—"}</code></td>
            <td>{r.department_name || "—"}</td>
            <td>{r.organization_name || "—"}</td>
            <td>{r.branch_name || "—"}</td>
            <td>{r.region_name || "—"}</td>
            <td style={{ color: "#991b1b", fontSize: 10 }}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BrandsStagingTable({ rows }) {
  return (
    <table className="data-table" style={{ fontSize: 11 }}>
      <thead>
        <tr>
          {["Статус", "UID", "Назва", "Група", "Parent", "Помилка"].map(h =>
            <th key={h}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ background: r.validation_status === "invalid" ? "#fff5f5" : undefined }}>
            <td><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
            <td><code style={{ fontSize: 10 }}>{r.brand_uid || "—"}</code></td>
            <td>{r.brand_name || "—"}</td>
            <td>{r.brand_group || "—"}</td>
            <td>{r.parent_brand_name || "—"}</td>
            <td style={{ color: "#991b1b", fontSize: 10 }}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ArticlesStagingTable({ rows }) {
  return (
    <table className="data-table" style={{ fontSize: 11 }}>
      <thead>
        <tr>
          {["Статус", "UID", "Назва статті", "Тип", "Level1", "Level2", "PnL код", "Помилка"].map(h =>
            <th key={h}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ background: r.validation_status === "invalid" ? "#fff5f5" : undefined }}>
            <td><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
            <td><code style={{ fontSize: 10 }}>{r.article_uid || "—"}</code></td>
            <td>{r.article_name || "—"}</td>
            <td>{r.article_type || "—"}</td>
            <td>{r.level1 || "—"}</td>
            <td>{r.level2 || "—"}</td>
            <td>{r.pnl_code || "—"}</td>
            <td style={{ color: "#991b1b", fontSize: 10 }}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StagingRows({ importType, rows, onRowClick }) {
  if (!rows || rows.length === 0)
    return <div style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>Рядків не знайдено</div>;
  if (importType === "departments") return <DepartmentsStagingTable rows={rows} />;
  if (importType === "brands")     return <BrandsStagingTable rows={rows} />;
  if (importType === "articles")   return <ArticlesStagingTable rows={rows} />;
  if (importType === "sales_fact") return <SalesStagingTable rows={rows} onRowClick={onRowClick} />;
  return null;
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, color }) {
  return (
    <div style={{ padding: "10px 16px", background: "#fff", border: "1px solid #e5e7eb",
                  borderRadius: 8, textAlign: "center", minWidth: 90 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#374151" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{label}</div>
    </div>
  );
}

// ── Batch History ─────────────────────────────────────────────────────────────

function BatchHistoryPanel({ importType, refreshKey, onSelect }) {
  const [batches, setBatches] = useState([]);
  const [detailBatch, setDetailBatch] = useState(null);

  const load = useCallback(() => {
    getImportBatches(50)
      .then(data => setBatches((data || []).filter(b => b.import_type_code === importType)))
      .catch(() => {});
  }, [importType]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (batches.length === 0)
    return <div style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>Батчів не знайдено</div>;

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
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Джерело</th>
              <th>Статус</th>
              <th style={{ textAlign: "right" }}>Всього</th>
              <th style={{ textAlign: "right" }}>Валід.</th>
              <th style={{ textAlign: "right" }}>Помилок</th>
              <th style={{ textAlign: "right" }}>Записано</th>
              <th>Час</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.id}>
                <td style={{ color: "#9ca3af" }}>#{b.id}</td>
                <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={b.source_name}>{b.source_name || b.source_id}</td>
                <td><StatusBadge status={b.status} /></td>
                <td style={{ textAlign: "right" }}>{b.rows_total ?? "—"}</td>
                <td style={{ textAlign: "right", color: "#065f46", fontWeight: 600 }}>{b.rows_valid ?? b.rows_loaded ?? "—"}</td>
                <td style={{ textAlign: "right", color: (b.rows_invalid ?? 0) > 0 ? "#991b1b" : undefined,
                             fontWeight: (b.rows_invalid ?? 0) > 0 ? 600 : undefined }}>
                  {b.rows_invalid ?? 0}
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {b.status === "committed" ? (b.rows_loaded_to_target ?? "—") : "—"}
                </td>
                <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {b.started_at ? new Date(b.started_at).toLocaleString("uk-UA") : "—"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ fontSize: 11, color: "var(--primary)", background: "none",
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

export default function ImportDataPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [importType,    setImportType]    = useState(null);
  const [sources,       setSources]       = useState([]);
  const [sourceId,      setSourceId]      = useState("");

  // Preview (raw OLAP data)
  const [previewing,    setPreviewing]    = useState(false);
  const [previewData,   setPreviewData]   = useState(null);

  // Period params (sales_fact only)
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [periodFrom,    setPeriodFrom]    = useState(firstOfMonth);
  const [periodTo,      setPeriodTo]      = useState(lastOfMonth);
  const [replaceMode,   setReplaceMode]   = useState("replace_by_period");

  // Load / staging
  const [loading,       setLoading]       = useState(false);
  const [loadResult,    setLoadResult]    = useState(null);
  const [batchId,       setBatchId]       = useState(null);
  const [staging,       setStaging]       = useState(null);
  const [statusFilter,  setStatusFilter]  = useState(null);
  const [filterLoading, setFilterLoading] = useState(false);

  // Commit
  const [committing,    setCommitting]    = useState(false);
  const [commitResult,  setCommitResult]  = useState(null);

  // UI
  const [error,         setError]         = useState(null);
  const [success,       setSuccess]       = useState(null);
  const [detailRow,     setDetailRow]     = useState(null);
  const [showBulkUpdate,setShowBulkUpdate]= useState(false);
  const [historyKey,    setHistoryKey]    = useState(0);

  // ── Load sources when type changes ─────────────────────────────────────────
  useEffect(() => {
    if (!importType) return;
    getEngineSources()
      .then(data => setSources((data || []).filter(s => s.import_type_code === importType)))
      .catch(() => {});
  }, [importType]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const resetBatch = () => {
    setBatchId(null); setStaging(null); setStatusFilter(null);
    setLoadResult(null); setCommitResult(null); setError(null);
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
    try { setStaging(await getStagingPreview(batchId, filter, 500)); } catch {}
    finally { setFilterLoading(false); }
  };

  const handleRefreshStaging = async () => {
    if (!batchId) return;
    setFilterLoading(true);
    try { setStaging(await getStagingPreview(batchId, statusFilter, 500)); } catch {}
    finally { setFilterLoading(false); }
  };

  const handleCommit = async () => {
    if (!batchId || !staging?.valid) return;
    setCommitting(true); setError(null); setCommitResult(null);
    try {
      const res = await commitBatch(batchId);
      setCommitResult(res);
      const meta = IMPORT_TYPES[importType];
      const n = res.committed ?? res.upserted ?? "?";
      setSuccess(`Записано ${n} рядків у ${meta?.targetLabel || "ціль"}`);
      setHistoryKey(k => k + 1);
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка запису");
    } finally { setCommitting(false); }
  };

  const handleViewStaging = async (b) => {
    setBatchId(b.id); setCommitResult(null); setStatusFilter(null);
    setImportType(b.import_type_code);
    try { setStaging(await getStagingPreview(b.id, null, 500)); } catch {}
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const meta    = importType ? IMPORT_TYPES[importType] : null;
  const canLoad = sourceId && !loading &&
    (!meta?.hasPeriod || (periodFrom && periodTo));
  const canCommit = staging && staging.valid > 0 && !commitResult;

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* Modals */}
      {detailRow && <RawRowModal row={detailRow} onClose={() => setDetailRow(null)} />}
      {showBulkUpdate && batchId && staging && (
        <BulkUpdateModal
          batchId={batchId} staging={staging} statusFilter={statusFilter}
          onClose={() => setShowBulkUpdate(false)}
          onApplied={(s) => setStaging(s)}
        />
      )}

      <h2 style={{ marginBottom: 4, fontSize: 20, fontWeight: 700 }}>Імпорт даних</h2>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
        Єдиний Import Center — OLAP / SQL → staging → target table
      </p>

      {/* Alerts */}
      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>{typeof error === "string" ? error : JSON.stringify(error)}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none",
                   cursor: "pointer", color: "#c33", fontSize: 16 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="success-message" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: "none", border: "none",
                   cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── STEP 1: Type ───────────────────────────────────────────────────── */}
      <div className="import-section">
        <h3 className="section-title">1. Що імпортуємо?</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(IMPORT_TYPES).map(([code, m]) => (
            <div key={code} onClick={() => handleTypeSelect(code)}
                 style={{
                   padding: "14px 20px", borderRadius: 8, cursor: "pointer",
                   border: `2px solid ${importType === code ? "var(--primary)" : "#e5e7eb"}`,
                   background: importType === code ? "#eff6ff" : "#fff",
                   minWidth: 160, transition: "all .15s",
                 }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {importType && (
        <>
          {/* ── STEP 2: Source ───────────────────────────────────────────── */}
          <div className="import-section">
            <h3 className="section-title">2. Джерело</h3>
            {sources.length === 0 && (
              <div style={{ padding: "10px 14px", background: "#fef3c7", border: "1px solid #f59e0b",
                            borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                Немає джерел з типом "{meta?.label}". Перейдіть у "Відповідність" та вкажіть тип.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="form-field" style={{ margin: 0 }}>
                <label>Джерело ({meta?.label})</label>
                <select value={sourceId} onChange={e => handleSourceChange(e.target.value)}
                        style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, minWidth: 280 }}>
                  <option value="">— оберіть —</option>
                  {sources.map(s => (
                    <option key={s.id} value={s.id}>{s.source_name} ({s.source_type})</option>
                  ))}
                </select>
              </div>
              {sourceId && (
                <button className="btn btn-secondary" onClick={handlePreview} disabled={previewing}>
                  {previewing ? "Отримання даних..." : "Отримати дані OLAP"}
                </button>
              )}
            </div>

            {/* Raw OLAP preview table */}
            <RawPreviewPanel data={previewData} />

            {/* Field mapping editor WITH sample values */}
            {sourceId && (
              <MappingEditorWithSamples
                sourceId={Number(sourceId)}
                previewData={previewData}
              />
            )}
          </div>

          {/* ── STEP 3: Period (sales_fact only) ────────────────────────── */}
          {sourceId && meta?.hasPeriod && (
            <div className="import-section">
              <h3 className="section-title">3. Параметри імпорту</h3>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Період від <span style={{ color: "#c33" }}>*</span></label>
                  <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4 }} />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Період до <span style={{ color: "#c33" }}>*</span></label>
                  <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4 }} />
                </div>
                <div className="form-field" style={{ margin: 0 }}>
                  <label>Режим заміни</label>
                  <select value={replaceMode} onChange={e => setReplaceMode(e.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4 }}>
                    <option value="replace_by_period">Замінити за period_month + source_id</option>
                    <option value="append">Дописати (без видалення)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── LOAD BUTTON ─────────────────────────────────────────────── */}
          {sourceId && (
            <div style={{ marginBottom: 20 }}>
              <button className="btn btn-primary" onClick={handleLoad} disabled={!canLoad}
                      style={{ padding: "9px 24px", fontSize: 14 }}>
                {loading ? "Завантаження з OLAP..." : "📥 Отримати дані та завантажити в staging"}
              </button>
            </div>
          )}

          {/* Load result summary */}
          {loadResult && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "#eff6ff",
                          border: "1px solid #bfdbfe", borderRadius: 6, fontSize: 13 }}>
              OLAP: <strong>{loadResult.rows_total}</strong> рядків
              {loadResult.rows_filtered_out > 0 && (
                <span style={{ color: "#92400e" }}> — відфільтровано поза [{periodFrom}..{periodTo}]: <strong>{loadResult.rows_filtered_out}</strong></span>
              )}
              {" "} | У staging: <strong>{loadResult.rows_loaded}</strong>
              {" "} | Валідних: <strong style={{ color: "#065f46" }}>{loadResult.rows_valid}</strong>
              {" "} | Помилок: <strong style={{ color: loadResult.rows_invalid > 0 ? "#991b1b" : "#065f46" }}>{loadResult.rows_invalid}</strong>
            </div>
          )}

          {/* ── STEP 4: Staging preview ──────────────────────────────────── */}
          {staging && batchId && (
            <div className="import-section">
              <h3 className="section-title">{meta?.hasPeriod ? "4" : "3"}. Staging — batch #{batchId}</h3>

              {/* KPI tiles */}
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <KpiTile label="Всього" value={staging.total} color="#374151" />
                <KpiTile label="Валідних" value={staging.valid} color="#065f46" />
                <KpiTile label="Помилок" value={staging.invalid}
                          color={staging.invalid > 0 ? "#991b1b" : "#065f46"} />
                {staging.total_sales_vat != null && (
                  <KpiTile label="Продажі з ПДВ" value={fmtNum(staging.total_sales_vat)} />
                )}
              </div>

              {/* Filter tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                {[
                  { label: `Всі (${staging.total})`,       val: null },
                  { label: `Валідні (${staging.valid})`,   val: "valid" },
                  { label: `Помилки (${staging.invalid})`, val: "invalid" },
                ].map(f => (
                  <button key={String(f.val)} onClick={() => handleFilterChange(f.val)}
                    style={{
                      padding: "4px 12px", fontSize: 12, border: "1px solid var(--border)",
                      borderRadius: 4, cursor: "pointer",
                      background: statusFilter === f.val ? "var(--primary)" : "var(--surface)",
                      color:      statusFilter === f.val ? "#fff" : "var(--text-primary)",
                      fontWeight: statusFilter === f.val ? 700 : 400,
                    }}>
                    {f.label}
                  </button>
                ))}
                <button onClick={handleRefreshStaging} disabled={filterLoading}
                  style={{ padding: "4px 10px", fontSize: 12, border: "1px solid var(--border)",
                           borderRadius: 4, cursor: "pointer", background: "var(--surface)" }}>
                  {filterLoading ? "..." : "↻ Оновити"}
                </button>
                {importType === "sales_fact" && staging.invalid > 0 && (
                  <button onClick={() => setShowBulkUpdate(true)}
                    style={{ marginLeft: "auto", padding: "4px 14px", fontSize: 12, fontWeight: 600,
                             border: "1px solid #3b82f6", borderRadius: 4,
                             cursor: "pointer", background: "#eff6ff", color: "#1e40af" }}>
                    ✏ Масове заповнення полів
                  </button>
                )}
              </div>

              {/* Staging table */}
              <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto",
                            border: "1px solid var(--border)", borderRadius: 6 }}>
                <StagingRows
                  importType={importType}
                  rows={staging.rows || []}
                  onRowClick={importType === "sales_fact" ? setDetailRow : undefined}
                />
              </div>
              {importType === "sales_fact" && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Клік на рядок — деталі та raw OLAP
                </div>
              )}

              {/* Commit block */}
              {!commitResult ? (
                <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--surface)",
                              border: "1px solid var(--border)", borderRadius: 8 }}>
                  {staging.invalid > 0 && (
                    <div style={{ padding: "7px 12px", background: "#fef3c7",
                                  border: "1px solid #f59e0b", borderRadius: 6,
                                  marginBottom: 10, fontSize: 13 }}>
                      Буде записано <strong>{staging.valid}</strong> валідних.{" "}
                      <strong>{staging.invalid}</strong> невалідних залишаться у staging.
                    </div>
                  )}
                  <button className="btn btn-primary" onClick={handleCommit}
                          disabled={committing || !canCommit}
                          style={{ padding: "8px 20px", fontSize: 13 }}>
                    {committing ? "Запис..." : canCommit
                      ? `✅ Завантажити ${staging.valid} рядків → ${meta?.targetLabel}`
                      : "Немає валідних рядків"}
                  </button>
                </div>
              ) : (
                <div className="success-message" style={{ marginTop: 12 }}>
                  {commitResult.upserted != null
                    ? <>Upsert: <strong>{commitResult.upserted}</strong> рядків
                        (вставлено {commitResult.inserted}, оновлено {commitResult.updated})
                        у {meta?.targetLabel}</>
                    : <>Записано <strong>{commitResult.committed}</strong> рядків
                        у {meta?.targetLabel}
                        {commitResult.deleted_from_target > 0 &&
                          <span style={{ color: "#92400e" }}>
                            {" "}(замінено {commitResult.deleted_from_target} попередніх)
                          </span>}
                      </>
                  }
                </div>
              )}
            </div>
          )}

          {/* ── Batch history ────────────────────────────────────────────── */}
          <div className="import-section">
            <h3 className="section-title">Історія імпортів — {meta?.label}</h3>
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
  );
}
