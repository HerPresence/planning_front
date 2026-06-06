import React, { useEffect, useState, useCallback, useRef } from "react";
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

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

// ── UID cell with clipboard copy ──────────────────────────────────────────────

function UIDCell({ value, maxWidth = 160 }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };
  return (
    <span className="uid-cell">
      <span className="uid-value" style={{ maxWidth }} title={value}>{value}</span>
      <button className={`uid-copy${copied ? " copied" : ""}`} onClick={handleCopy} title="Скопіювати">
        {copied ? "✓" : "⎘"}
      </button>
    </span>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  loading:     { label: "Завантаження...", bg: "var(--warning-bg)",  color: "var(--warning)" },
  loaded:      { label: "У staging",      bg: "var(--info-bg)",     color: "var(--info)" },
  committing:  { label: "Запис...",        bg: "#e0e7ff",            color: "#3730a3" },
  committed:   { label: "Записано",        bg: "var(--success-bg)", color: "var(--success)" },
  failed:      { label: "Помилка",         bg: "var(--danger-bg)",  color: "var(--danger)" },
  rolled_back: { label: "Відкат",          bg: "var(--gray-100)",   color: "var(--text-muted)" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, bg: "var(--gray-100)", color: "var(--text-secondary)" };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: "var(--radius-md)",
                   padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

const V_BADGE_CLASS = {
  valid:   "status active",
  invalid: "status total",
  pending: "status inactive",
};

function ValidationBadge({ status }) {
  const cls = V_BADGE_CLASS[status] || "status inactive";
  const label = status === "valid" ? "valid" : status === "invalid" ? "invalid" : status || "pending";
  return <span className={cls}>{label}</span>;
}

const MAP_BADGE = {
  not_set: { label: "—",       bg: "var(--gray-100)",    color: "var(--text-muted)" },
  manual:  { label: "вручну",  bg: "var(--info-bg)",     color: "var(--info)" },
  auto:    { label: "авто",    bg: "var(--success-bg)",  color: "var(--success)" },
  error:   { label: "помилка", bg: "var(--danger-bg)",   color: "var(--danger)" },
};

function MappingBadge({ status }) {
  const cfg = MAP_BADGE[status] || MAP_BADGE.not_set;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: "var(--radius-sm)",
                   padding: "2px 6px", fontSize: 10, fontWeight: 500, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ── Raw OLAP row modal ────────────────────────────────────────────────────────

function RawRowModal({ row, onClose }) {
  if (!row) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Row #{row.id}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {row.validation_error && (
            <div className="error-message" style={{ marginBottom: 12 }}>{row.validation_error}</div>
          )}
          {row.raw_row && (
            <pre style={{ background: "var(--gray-50)", border: "1px solid var(--border)",
                          borderRadius: "var(--radius-md)", padding: "10px 12px", fontSize: 11,
                          fontFamily: "var(--font-mono)", overflowX: "auto",
                          whiteSpace: "pre-wrap", maxHeight: 360, margin: 0 }}>
              {typeof row.raw_row === "string" ? row.raw_row : JSON.stringify(row.raw_row, null, 2)}
            </pre>
          )}
        </div>
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

  const Row = ({ label, value }) => (
    <div style={{ display: "flex", borderBottom: "1px solid var(--gray-100)", padding: "5px 0" }}>
      <div style={{ width: 200, color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{value ?? "—"}</div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Batch #{batch.id}</h2>
            <div style={{ marginTop: 4 }}><StatusBadge status={batch.status} /></div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <Row label="Джерело"        value={batch.source_name || batch.source_id} />
          <Row label="Тип імпорту"    value={batch.import_type_code} />
          <Row label="Таблиця-ціль"   value={batch.target_table} />
          {periodStr && <Row label="Вибраний період"  value={periodStr} />}
          {batch.replace_mode && <Row label="Режим заміни" value={batch.replace_mode} />}
          {batch.period_field && <Row label="Поле дати"    value={batch.period_field} />}
          <Row label="Рядків у джерелі"   value={batch.rows_total} />
          <Row label="Записано у staging" value={batch.rows_loaded} />
          <Row label="Валідних"           value={batch.rows_valid} />
          <Row label="Невалідних"         value={batch.rows_invalid} />
          <Row label="Записано у ціль"    value={batch.rows_loaded_to_target} />
          <Row label="Початок"   value={batch.started_at?.slice(0, 16).replace("T", " ")} />
          <Row label="Завершено" value={batch.finished_at?.slice(0, 16).replace("T", " ")} />
          {batch.error_message && <Row label="Помилка" value={batch.error_message} />}
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            {(isLoaded || isCommitted) && (
              <button className="btn btn-secondary" onClick={() => { onViewStaging(batch); onClose(); }}>
                Переглянути staging
              </button>
            )}
            <button className="btn btn-danger" onClick={handleDelete}>Видалити</button>
          </div>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Масове заповнення полів</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="note" style={{ marginTop: 0, marginBottom: 16, background: "var(--info-bg)",
                                         border: "1px solid var(--info-border)", color: "var(--info)" }}>
            Поточна вибірка: <strong>{affectedCount}</strong> рядків
            {statusFilter && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>
              (фільтр: <em>{statusFilter === "invalid" ? "тільки помилки" : "тільки валідні"}</em>)
            </span>}
          </div>

          <div className="form-field" style={{ marginBottom: 12 }}>
            <label>Поле для заміни</label>
            <select value={targetField}
              onChange={e => { setTargetField(e.target.value); setMasterId(""); setSearch(""); }}>
              <option value="department">Підрозділ</option>
              <option value="brand">Бренд / НГ</option>
            </select>
          </div>

          <div className="form-field" style={{ marginBottom: 12 }}>
            <label>Значення з довідника</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Пошук ${targetField === "department" ? "підрозділу" : "бренду"}...`}
              style={{ marginBottom: 6 }} />
            <select value={masterId} onChange={e => setMasterId(e.target.value)}
              size={Math.min(filteredOptions.length + 1, 8)}
              style={{ minHeight: 80 }}>
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
            <div className="success-message" style={{ marginBottom: 12 }}>
              Буде застосовано: <strong>{selectedLabel()}</strong> до{" "}
              <strong>{affectedCount}</strong> рядків
            </div>
          )}
          {err  && <div className="error-message" style={{ marginBottom: 12 }}>{err}</div>}
          {result && (
            <div className="success-message" style={{ marginBottom: 12 }}>
              <strong>Готово!</strong> Оновлено {result.rows_updated} рядків.
              Валідних: <strong>{result.staging?.valid ?? "—"}</strong>,
              помилок: <strong>{result.staging?.invalid ?? "—"}</strong>.
            </div>
          )}
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <button className="btn btn-primary" onClick={handleApply} disabled={applying || !masterId}>
              {applying ? "Застосування..." : result ? "Застосувати ще раз" : "Застосувати"}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Закрити</button>
          </div>
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
    <div className="import-section-card" style={{ marginTop: 10 }}>
      <div className="import-section-header" style={{ cursor: "pointer" }}
           onClick={() => setExpanded(v => !v)}>
        <h3>
          Дані OLAP — {columns.length} колонок, {total_rows} рядків
          <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--text-muted)", fontSize: 12 }}>
            (перші {preview_rows.length})
          </span>
        </h3>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{expanded ? "▲ Сховати" : "▼ Показати"}</span>
      </div>
      {expanded && (
        <div className="table-wrap-sticky" style={{ maxHeight: 280, borderRadius: 0, border: "none" }}>
          <table className="data-table compact" style={{ fontFamily: "var(--font-mono)" }}>
            <thead>
              <tr>{columns.map(c => <th key={c} style={{ maxWidth: 180 }} title={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {preview_rows.map((row, i) => (
                <tr key={i}>
                  {columns.map(c => (
                    <td key={c} style={{ maxWidth: 180 }} title={String(row[c] ?? "")}>
                      {row[c] === null || row[c] === undefined
                        ? <span style={{ color: "var(--text-muted)" }}>NULL</span>
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
    "source_level","source_company_name","source_is_active","source_brand_ref_id",
    "Level_1","Company","valid","brand_id","company_name","is_active",
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
    <div className="import-section-card" style={{ marginTop: 10 }}>
      <div className="import-section-header" style={{ cursor: "pointer", background: "var(--info-bg)" }}
           onClick={() => setOpen(v => !v)}>
        <h3 style={{ color: "var(--info)" }}>Маппінг полів ({mapping.length} рядків)</h3>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="import-section-body">
          {msg && (
            <div className={msg.ok ? "success-message" : "error-message"} style={{ marginBottom: 8 }}>
              {msg.text}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table className="data-table compact" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Поле джерела (OLAP)</th>
                  <th style={{ minWidth: 150 }}>Приклади значень</th>
                  <th style={{ minWidth: 150 }}>Поле системи</th>
                  <th style={{ width: 70, textAlign: "center" }}>Обов'язк.</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: "3px 6px" }}>
                      {columns.length > 0 ? (
                        <select value={row.source_field}
                                onChange={e => updateRow(i, "source_field", e.target.value)}
                                style={{ width: "100%", padding: "4px 7px", border: "1px solid var(--border)",
                                         borderRadius: "var(--radius-sm)", fontSize: 12 }}>
                          <option value="">— оберіть —</option>
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <input value={row.source_field}
                               onChange={e => updateRow(i, "source_field", e.target.value)}
                               style={{ width: "100%", padding: "4px 7px", border: "1px solid var(--border)",
                                        borderRadius: "var(--radius-sm)", fontSize: 12 }} />
                      )}
                    </td>
                    <td style={{ padding: "3px 6px" }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
                                     background: "var(--gray-50)", padding: "2px 5px", borderRadius: 3,
                                     display: "block", overflow: "hidden", textOverflow: "ellipsis",
                                     whiteSpace: "nowrap", maxWidth: 180 }}
                            title={sampleValues[row.source_field] || ""}>
                        {sampleValues[row.source_field] || <span style={{ color: "var(--border)" }}>—</span>}
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
                              style={{ width: "100%", padding: "4px 7px", fontSize: 12,
                                       border: `1px solid ${isExtra ? "var(--warning)" : "var(--border)"}`,
                                       background: isExtra ? "var(--warning-bg)" : undefined,
                                       borderRadius: "var(--radius-sm)" }}
                              placeholder="Назва поля системи..." />
                            {canonicalList.length > 0 && (
                              <datalist id={listId}>
                                {canonicalList.map(f => <option key={f} value={f} />)}
                              </datalist>
                            )}
                            {isExtra && (
                              <div style={{ fontSize: 10, color: "var(--warning)", marginTop: 2 }}>
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
                                       color: "var(--danger)", fontSize: 14, lineHeight: 1 }}>✕</button>
                    </td>
                  </tr>
                ))}
                {mapping.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
                      Маппінг порожній. Натисніть "+ Рядок".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Рядок</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? "..." : "Зберегти маппінг"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Staging KPI strip ─────────────────────────────────────────────────────────

function StagingKpiStrip({ staging, activeFilter, onFilter }) {
  if (!staging) return null;
  const chips = [
    { key: null,      cls: "chip-total",  label: "Всього",   value: staging.total },
    { key: "valid",   cls: "chip-valid",  label: "Валідних", value: staging.valid },
    { key: "invalid", cls: "chip-error",  label: "Помилок",  value: staging.invalid },
    { key: "_saved",  cls: "chip-saved",  label: "Збережено",value: staging.saved, noClick: true },
  ];
  if (staging.period_from || staging.period_to) {
    chips.push({
      key: "_period", cls: "chip-period", noClick: true,
      label: "Період",
      value: `${staging.period_from?.slice(0, 7) || "—"} — ${staging.period_to?.slice(0, 7) || "—"}`,
      small: true,
    });
  }
  return (
    <div className="staging-kpi-strip">
      {chips.map(c => (
        <button
          key={String(c.key)}
          className={`staging-kpi-chip ${c.cls}${activeFilter === c.key && !c.noClick ? " active" : ""}${c.noClick ? " chip-period" : ""}`}
          onClick={() => !c.noClick && onFilter(activeFilter === c.key ? null : c.key)}
          style={{ cursor: c.noClick ? "default" : "pointer" }}
          type="button"
        >
          <span className="chip-value" style={c.small ? { fontSize: 14 } : {}}>{c.value}</span>
          <span className="chip-label">{c.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Staging filter bar ────────────────────────────────────────────────────────

const INIT_FILTERS = {
  status: null,
  search: "",
  department_search: "",
  product_group_search: "",
  period_month: "",
};

function StagingFilterBar({ importType, filterDraft, onChange, onReset, density, onDensity, stagingFilters, filterLoading }) {
  const isSales = importType === "sales_fact";
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label>Статус</label>
        <select value={filterDraft.status || ""}
          onChange={e => onChange("status", e.target.value || null)}>
          <option value="">Всі</option>
          <option value="valid">Валідні</option>
          <option value="invalid">Помилки</option>
        </select>
      </div>
      {isSales && (
        <>
          <div className="filter-group">
            <label>Підрозділ</label>
            <input type="text" value={filterDraft.department_search}
              onChange={e => onChange("department_search", e.target.value)}
              placeholder="UID або назва..." />
          </div>
          <div className="filter-group">
            <label>Товарна група</label>
            <input type="text" value={filterDraft.product_group_search}
              onChange={e => onChange("product_group_search", e.target.value)}
              placeholder="UID, ID або назва..." />
          </div>
          <div className="filter-group">
            <label>Місяць</label>
            <input type="text" value={filterDraft.period_month}
              onChange={e => onChange("period_month", e.target.value)}
              placeholder="YYYY-MM-DD" style={{ width: 120 }} />
          </div>
        </>
      )}
      <div className="filter-group search-group">
        <label>Пошук (усі поля)</label>
        <input type="text" value={filterDraft.search}
          onChange={e => onChange("search", e.target.value)}
          placeholder={
            importType === "departments" ? "Підрозділ, організація, регіон..." :
            importType === "brands"      ? "Бренд, UID, група..." :
            importType === "articles"    ? "Стаття, UID, PnL-код..." :
                                           "UID, підрозділ, НГ..."
          } />
      </div>
      <div className="filter-actions">
        <div className="density-switch">
          <button className={`density-btn${density === "compact" ? " active" : ""}`}
            onClick={() => onDensity("compact")} type="button">≡ Compact</button>
          <button className={`density-btn${density === "comfortable" ? " active" : ""}`}
            onClick={() => onDensity("comfortable")} type="button">☰ Comfort</button>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onReset} type="button">
          ✕ Скинути
        </button>
        {filterLoading && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>…</span>}
      </div>
    </div>
  );
}

// ── Type-specific staging tables ──────────────────────────────────────────────

function SalesStagingTable({ rows, onRowClick, density }) {
  const tableClass = `data-table ${density} staging`;
  return (
    <table className={tableClass}>
      <thead>
        <tr>
          {[
            "Статус","Маппінг","Період",
            "Dept UID","Підрозділ","Master підрозділ",
            "PG ID","PG UID","НГ (назва)",
            "SKU UID","SKU назва","Source SKU UID",
            "Master НГ",
            "з ПДВ","Роздріб","Акциз","Дал","Кг","Помилка",
          ].map(h => <th key={h}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}
              className={r.validation_status === "invalid" ? "row-invalid" : ""}
              onClick={() => onRowClick && onRowClick(r)}
              style={{ cursor: "pointer" }}>
            <td><ValidationBadge status={r.validation_status} /></td>
            <td><MappingBadge status={r.mapping_status} /></td>
            <td style={{ whiteSpace: "nowrap" }}>{r.period_month?.slice(0, 7) || "—"}</td>
            <td><UIDCell value={r.department_uid} maxWidth={130} /></td>
            <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={r.department_name}>
              {r.department_name || <span style={{ color: "var(--text-muted)" }}>—</span>}
            </td>
            <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.master_department_name
                ? <span style={{ color: "var(--info)", fontWeight: 500 }}>{r.master_department_name}</span>
                : <span style={{ color: "var(--text-muted)" }}>—</span>}
            </td>
            <td><UIDCell value={r.product_group_id} maxWidth={100} /></td>
            <td><UIDCell value={r.product_group_uid} maxWidth={130} /></td>
            <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={r.product_group_name}>
              {r.product_group_name || <span style={{ color: "var(--text-muted)" }}>—</span>}
            </td>
            <td><UIDCell value={r.sku_uid} maxWidth={130} /></td>
            <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={r.sku_name || ""}>
              {r.sku_name || <span style={{ color: "var(--text-muted)" }}>—</span>}
            </td>
            <td><UIDCell value={r.source_sku_uid} maxWidth={130} /></td>
            <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.master_brand_name
                ? <span style={{ color: "var(--info)", fontWeight: 500 }}>{r.master_brand_name}</span>
                : <span style={{ color: "var(--text-muted)" }}>—</span>}
            </td>
            <td className="amount-cell">{fmtNum(r.sales_vat)}</td>
            <td className="amount-cell">{fmtNum(r.sales_retail)}</td>
            <td className="amount-cell">{fmtNum(r.excise)}</td>
            <td className="amount-cell">{fmtNum(r.sales_dal, 3)}</td>
            <td className="amount-cell">{fmtNum(r.sales_kg, 3)}</td>
            <td style={{ color: "var(--danger)", maxWidth: 120, overflow: "hidden",
                         textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}
                title={r.validation_error || ""}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DepartmentsStagingTable({ rows, density }) {
  return (
    <table className={`data-table ${density} staging`}>
      <thead>
        <tr>
          {["Статус","UID","Підрозділ","Parent UID","Parent підрозділ",
            "Sep. UID","Separated назва","Організація","Філія","Регіон","Помилка"].map(h => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className={r.validation_status === "invalid" ? "row-invalid" : ""}>
            <td><ValidationBadge status={r.validation_status} /></td>
            <td><UIDCell value={r.department_uid} /></td>
            <td>{r.department_name || "—"}</td>
            <td><UIDCell value={r.parent_department_uid} /></td>
            <td>{r.parent_department_name || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
            <td>
              {r.separated_department_uid
                ? <UIDCell value={r.separated_department_uid} />
                : <span style={{ color: "var(--text-muted)" }}>—</span>}
            </td>
            <td style={{ color: "var(--info)" }}>
              {r.separated_department_name || <span style={{ color: "var(--text-muted)" }}>—</span>}
            </td>
            <td>{r.organization_name || "—"}</td>
            <td>{r.branch_name || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
            <td>{r.region_name  || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
            <td style={{ color: "var(--danger)", maxWidth: 200, whiteSpace: "pre-wrap", fontSize: 11 }}>
              {r.validation_error || ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BrandsStagingTable({ rows, density }) {
  // Server-side pagination and search handled by parent — display only
  return (
    <table className={`data-table ${density} staging`}>
      <thead>
        <tr>
          {["Статус","UID","Назва","Група","Рівень","Компанія","Активний","Ref ID","Parent","Помилка"].map(h => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(rows || []).length === 0 ? (
          <tr>
            <td colSpan={10} className="empty-row">Немає даних</td>
          </tr>
        ) : (rows || []).map(r => (
          <tr key={r.id} className={r.validation_status === "invalid" ? "row-invalid" : ""}>
            <td><ValidationBadge status={r.validation_status} /></td>
            <td><UIDCell value={r.brand_uid} /></td>
            <td>{r.brand_name || "—"}</td>
            <td style={{ color: "var(--text-muted)" }}>{r.brand_group || "—"}</td>
            <td style={{ color: "var(--text-muted)" }}>{r.source_level || "—"}</td>
            <td style={{ color: "var(--text-muted)" }}>{r.source_company_name || "—"}</td>
            <td style={{ color: "var(--text-muted)" }}>{r.source_is_active || "—"}</td>
            <td style={{ color: "var(--text-muted)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{r.source_brand_ref_id || "—"}</span>
            </td>
            <td>{r.parent_brand_name || "—"}</td>
            <td style={{ color: "var(--danger)", fontSize: 10 }}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ArticlesStagingTable({ rows, density }) {
  return (
    <table className={`data-table ${density} staging`}>
      <thead>
        <tr>
          {["Статус","UID","Назва статті","Тип","Level1","Level2","PnL код","Помилка"].map(h => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className={r.validation_status === "invalid" ? "row-invalid" : ""}>
            <td><ValidationBadge status={r.validation_status} /></td>
            <td><UIDCell value={r.article_uid} /></td>
            <td>{r.article_name || "—"}</td>
            <td>{r.article_type || "—"}</td>
            <td>{r.level1 || "—"}</td>
            <td>{r.level2 || "—"}</td>
            <td>{r.pnl_code || "—"}</td>
            <td style={{ color: "var(--danger)", fontSize: 11 }}>{r.validation_error || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StagingRows({ importType, rows, onRowClick, density }) {
  if (!rows || rows.length === 0)
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔍</div>
        <div className="empty-state-message">Рядків не знайдено</div>
      </div>
    );
  if (importType === "departments") return <DepartmentsStagingTable rows={rows} density={density} />;
  if (importType === "brands")     return <BrandsStagingTable rows={rows} density={density} />;
  if (importType === "articles")   return <ArticlesStagingTable rows={rows} density={density} />;
  if (importType === "sales_fact") return <SalesStagingTable rows={rows} onRowClick={onRowClick} density={density} />;
  return null;
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, total, pageRows, onPage }) {
  if (totalPages <= 1) return null;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }
  return (
    <div className="pagination">
      <button className="pg-btn" onClick={() => onPage(page - 1)} disabled={page <= 1}>←</button>
      {pages.map((p, idx) =>
        p === "…"
          ? <span key={`e${idx}`} className="pg-ellipsis">…</span>
          : <button key={p} className={`pg-btn${page === p ? " pg-active" : ""}`} onClick={() => onPage(p)}>{p}</button>
      )}
      <button className="pg-btn" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>→</button>
      <span className="pg-info">
        {pageRows} з {total?.toLocaleString("uk-UA") || 0} · Стор. {page}/{totalPages}
      </span>
    </div>
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
    return <div className="empty-state" style={{ padding: "20px 0" }}>
      <div className="empty-state-message">Батчів не знайдено</div>
    </div>;

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
      <div className="table-wrap">
        <table className="data-table compact">
          <thead>
            <tr>
              {["#","Джерело","Статус","Тип / Ціль","Період"].map(h =>
                <th key={h}>{h}</th>)}
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
                <td style={{ color: "var(--text-muted)" }}>#{b.id}</td>
                <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={b.source_name}>{b.source_name || b.source_id}</td>
                <td>
                  <StatusBadge status={b.status} />
                  {b.error_message && (
                    <div style={{ color: "var(--danger)", fontSize: 10, maxWidth: 90, overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}
                         title={b.error_message}>{b.error_message}</div>
                  )}
                </td>
                <td>
                  <div style={{ fontSize: 10, color: "var(--text-primary)" }}>{b.import_type_code || "—"}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>→ {b.target_table || "—"}</div>
                </td>
                <td style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                  {b.period_from && b.period_to
                    ? <>{b.period_from.slice(0, 7)} — {b.period_to.slice(0, 7)}</>
                    : <span style={{ color: "var(--text-muted)" }}>—</span>}
                </td>
                <td style={{ textAlign: "right" }}>{b.rows_total ?? "—"}</td>
                <td style={{ textAlign: "right", color: "var(--success)", fontWeight: 600 }}>{b.rows_valid ?? b.rows_loaded ?? "—"}</td>
                <td style={{ textAlign: "right",
                             color: (b.rows_invalid ?? 0) > 0 ? "var(--danger)" : undefined,
                             fontWeight: (b.rows_invalid ?? 0) > 0 ? 600 : undefined }}>
                  {b.rows_invalid ?? 0}
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {b.status === "committed" ? (b.rows_loaded_to_target ?? "—") : "—"}
                </td>
                <td style={{ fontSize: 10, whiteSpace: "nowrap" }}>
                  {b.started_at ? new Date(b.started_at).toLocaleString("uk-UA") : "—"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setDetailBatch(b)}>Деталі</button>
                    {(b.status === "loaded" || b.status === "committed") && (
                      <button className="btn btn-secondary btn-sm" onClick={() => onSelect && onSelect(b)}>Staging</button>
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
  const [filterLoading, setFilterLoading] = useState(false);
  const [stagingPage,   setStagingPage]   = useState(1);
  const [density,       setDensity]       = useState("compact");
  const STAGING_PAGE_SIZE = 100;

  // Filter draft = immediate (typing), stagingFilters = debounced (triggers fetch)
  const [filterDraft,    setFilterDraft]    = useState(INIT_FILTERS);
  const [stagingFilters, setStagingFilters] = useState(INIT_FILTERS);

  const debouncedSearch    = useDebounce(filterDraft.search, 400);
  const debouncedDeptSrch  = useDebounce(filterDraft.department_search, 400);
  const debouncedPGSrch    = useDebounce(filterDraft.product_group_search, 400);
  const debouncedPeriodM   = useDebounce(filterDraft.period_month, 400);

  // Sync debounced values into stagingFilters
  useEffect(() => {
    setStagingFilters(f => ({
      ...f,
      search:               debouncedSearch,
      department_search:    debouncedDeptSrch,
      product_group_search: debouncedPGSrch,
      period_month:         debouncedPeriodM,
    }));
    setStagingPage(1);
  }, [debouncedSearch, debouncedDeptSrch, debouncedPGSrch, debouncedPeriodM]); // eslint-disable-line react-hooks/exhaustive-deps

  const [committing,    setCommitting]    = useState(false);
  const [commitResult,  setCommitResult]  = useState(null);
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

  // ── Refetch staging when filters / page / batchId change ──────────────────
  useEffect(() => {
    if (!batchId) return;
    setFilterLoading(true);
    getStagingPreview(batchId, {
      status_filter:        stagingFilters.status   || undefined,
      page:                 stagingPage,
      page_size:            STAGING_PAGE_SIZE,
      search:               stagingFilters.search              || undefined,
      department_search:    stagingFilters.department_search   || undefined,
      product_group_search: stagingFilters.product_group_search || undefined,
      period_month:         stagingFilters.period_month        || undefined,
    }).then(setStaging).catch(() => {}).finally(() => setFilterLoading(false));
  }, [batchId, stagingFilters, stagingPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const resetBatch = () => {
    setBatchId(null); setStaging(null);
    setFilterDraft(INIT_FILTERS); setStagingFilters(INIT_FILTERS);
    setStagingPage(1);
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
      setStagingPage(1);
      setFilterDraft(INIT_FILTERS); setStagingFilters(INIT_FILTERS);
      setSuccess(
        `OLAP: ${res.rows_total} рядків. У staging: ${res.rows_loaded}` +
        ` (валідних ${res.rows_valid}, помилок ${res.rows_invalid})`
      );
      setHistoryKey(k => k + 1);
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка завантаження");
    } finally { setLoading(false); }
  };

  const handleFilterDraftChange = (key, value) => {
    setFilterDraft(f => ({ ...f, [key]: value }));
    // status changes are immediate (no debounce)
    if (key === "status") {
      setStagingFilters(f => ({ ...f, status: value }));
      setStagingPage(1);
    }
  };

  const handleFilterReset = () => {
    setFilterDraft(INIT_FILTERS);
    setStagingFilters(INIT_FILTERS);
    setStagingPage(1);
  };

  const handleChipFilter = (statusVal) => {
    setFilterDraft(f => ({ ...f, status: statusVal }));
    setStagingFilters(f => ({ ...f, status: statusVal }));
    setStagingPage(1);
  };

  const handleRefreshStaging = () => {
    if (!batchId) return;
    // Toggle a refetch by resetting page — the useEffect will fire
    setStagingPage(p => p); // same value won't trigger; use a timestamp trick
    setFilterLoading(true);
    getStagingPreview(batchId, {
      status_filter:        stagingFilters.status   || undefined,
      page:                 stagingPage,
      page_size:            STAGING_PAGE_SIZE,
      search:               stagingFilters.search              || undefined,
      department_search:    stagingFilters.department_search   || undefined,
      product_group_search: stagingFilters.product_group_search || undefined,
      period_month:         stagingFilters.period_month        || undefined,
    }).then(setStaging).catch(() => {}).finally(() => setFilterLoading(false));
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

  const handleViewStaging = (b) => {
    setBatchId(b.id); setCommitResult(null);
    setFilterDraft(INIT_FILTERS); setStagingFilters(INIT_FILTERS);
    setImportType(b.import_type_code); setStagingPage(1);
    // useEffect on batchId / stagingFilters change will fetch
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const meta      = importType ? IMPORT_TYPES[importType] : null;
  const canLoad   = sourceId && !loading && (!meta?.hasPeriod || (periodFrom && periodTo));
  const canCommit = staging && staging.valid > 0 && !commitResult;
  const stagingRows = staging?.rows || [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {detailRow && <RawRowModal row={detailRow} onClose={() => setDetailRow(null)} />}
      {showBulkUpdate && batchId && staging && (
        <BulkUpdateModal
          batchId={batchId} staging={staging} statusFilter={stagingFilters.status}
          onClose={() => setShowBulkUpdate(false)}
          onApplied={(s) => setStaging(prev => ({ ...prev, ...s }))}
        />
      )}

      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1>Імпорт даних</h1>
          <p>Import Center — OLAP / SQL → staging → target table</p>
        </div>
        {importType && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="staging-batch-badge" style={{ fontSize: 13, padding: "4px 14px" }}>
              {meta?.icon} {meta?.label}
            </span>
            <button className="btn btn-light" onClick={() => handleTypeSelect(null)}>
              ← Змінити тип
            </button>
          </div>
        )}
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="error-message" style={{ margin: "12px 0 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>{typeof error === "string" ? error : JSON.stringify(error)}</span>
            <button onClick={() => setError(null)}
              style={{ background: "none", border: "none", cursor: "pointer",
                       color: "var(--danger)", fontSize: 16, lineHeight: 1, flexShrink: 0, marginLeft: 8 }}>✕</button>
          </div>
        </div>
      )}
      {success && (
        <div className="success-message" style={{ margin: "12px 0 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>{success}</span>
            <button onClick={() => setSuccess(null)}
              style={{ background: "none", border: "none", cursor: "pointer",
                       color: "var(--success)", fontSize: 16, lineHeight: 1, flexShrink: 0, marginLeft: 8 }}>✕</button>
          </div>
        </div>
      )}

      {/* ── Step 1: Type selector ── */}
      {!importType && (
        <div className="content-card">
          <div className="card-top">
            <div className="card-title-block">
              <h2>Що імпортуємо?</h2>
              <p>Оберіть тип даних для імпорту з OLAP/SQL джерела</p>
            </div>
          </div>
          <div className="import-type-grid">
            {Object.entries(IMPORT_TYPES).map(([code, m]) => (
              <button key={code} className="import-type-card" onClick={() => handleTypeSelect(code)}>
                <span className="import-type-card-icon">{m.icon}</span>
                <span className="import-type-card-label">{m.label}</span>
                <span className="import-type-card-desc">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {importType && (
        <>
          {/* ── Step 2: Source ── */}
          <div className="import-section-card">
            <div className="import-section-header">
              <h3>Джерело даних</h3>
            </div>
            <div className="import-section-body">
              {sources.length === 0 && (
                <div className="hint-warning" style={{ marginBottom: 10 }}>
                  Немає джерел з типом "{meta?.label}". Налаштуйте джерело у «Відповідність».
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="filter-group" style={{ minWidth: 280 }}>
                  <label>Джерело ({meta?.label})</label>
                  <select value={sourceId} onChange={e => handleSourceChange(e.target.value)}>
                    <option value="">— оберіть —</option>
                    {sources.map(s => (
                      <option key={s.id} value={s.id}>{s.source_name} ({s.source_type})</option>
                    ))}
                  </select>
                </div>
                {sourceId && (
                  <button className="btn btn-secondary" onClick={handlePreview} disabled={previewing}>
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
          </div>

          {/* ── Step 3: Period (sales_fact only) ── */}
          {sourceId && meta?.hasPeriod && (
            <div className="import-section-card">
              <div className="import-section-header">
                <h3>Параметри імпорту</h3>
              </div>
              <div className="import-section-body">
                <div className="filter-bar" style={{ marginBottom: 0 }}>
                  <div className="filter-group">
                    <label>Період від *</label>
                    <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
                  </div>
                  <div className="filter-group">
                    <label>Період до *</label>
                    <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
                  </div>
                  <div className="filter-group" style={{ minWidth: 300 }}>
                    <label>Режим заміни</label>
                    <select value={replaceMode} onChange={e => setReplaceMode(e.target.value)}>
                      <option value="replace_by_period">Замінити за period_month + source_id</option>
                      <option value="append">Дописати (без видалення)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Load button ── */}
          {sourceId && (
            <div style={{ marginBottom: 12 }}>
              <button className="btn btn-primary" style={{ height: 40, fontSize: 14 }}
                      onClick={handleLoad} disabled={!canLoad}>
                {loading ? "Завантаження з OLAP..." : "📥 Отримати дані та завантажити в staging"}
              </button>
            </div>
          )}

          {/* Load result summary */}
          {loadResult && (
            <div className="staging-result-banner">
              OLAP: <strong>{loadResult.rows_total}</strong> рядків
              {loadResult.rows_filtered_out > 0 && (
                <span style={{ color: "var(--warning)", marginLeft: 8 }}>
                  — поза [{periodFrom}..{periodTo}]: <strong>{loadResult.rows_filtered_out}</strong>
                </span>
              )}
              {" "} | Staging: <strong>{loadResult.rows_loaded}</strong>
              {" "} | Валідних: <strong style={{ color: "var(--success)" }}>{loadResult.rows_valid}</strong>
              {" "} | Помилок: <strong style={{ color: loadResult.rows_invalid > 0 ? "var(--danger)" : "var(--success)" }}>{loadResult.rows_invalid}</strong>
            </div>
          )}

          {/* ── Step 4: Staging preview ── */}
          {staging && batchId && (
            <div className="import-section-card">
              <div className="import-section-header">
                <h3>
                  Staging
                  <span className="staging-batch-badge" style={{ marginLeft: 8 }}>
                    #{batchId}
                  </span>
                  {filterLoading && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>оновлення…</span>}
                </h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleRefreshStaging} disabled={filterLoading}>
                    ↻ Оновити
                  </button>
                  {importType === "sales_fact" && staging.invalid > 0 && (
                    <button className="btn btn-secondary btn-sm"
                            style={{ borderColor: "var(--info)", color: "var(--info)", background: "var(--info-bg)" }}
                            onClick={() => setShowBulkUpdate(true)}>
                      ✏ Масове заповнення
                    </button>
                  )}
                </div>
              </div>
              <div className="import-section-body">
                {/* KPI Strip */}
                <StagingKpiStrip
                  staging={staging}
                  activeFilter={stagingFilters.status}
                  onFilter={handleChipFilter}
                />

                {/* Filter bar */}
                <StagingFilterBar
                  importType={importType}
                  filterDraft={filterDraft}
                  onChange={handleFilterDraftChange}
                  onReset={handleFilterReset}
                  density={density}
                  onDensity={setDensity}
                  stagingFilters={stagingFilters}
                  filterLoading={filterLoading}
                />

                {/* Staging table */}
                <div className="table-wrap-sticky">
                  <StagingRows
                    importType={importType}
                    rows={stagingRows}
                    onRowClick={importType === "sales_fact" ? setDetailRow : undefined}
                    density={density}
                  />
                </div>

                {/* Pagination */}
                <Pagination
                  page={stagingPage}
                  totalPages={staging.total_pages || 1}
                  total={staging.filtered_total ?? staging.total}
                  pageRows={(staging.rows || []).length}
                  onPage={setStagingPage}
                />

                {importType === "sales_fact" && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                    Клік на рядок — деталі та raw OLAP
                  </div>
                )}

                {/* Commit block */}
                <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--gray-50)",
                              border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                  {!commitResult ? (
                    <>
                      {staging.invalid > 0 && (
                        <div className="existing-warning" style={{ marginBottom: 10 }}>
                          Буде записано <strong style={{ margin: "0 4px" }}>{staging.valid}</strong> валідних.{" "}
                          <strong>{staging.invalid}</strong> невалідних залишаться у staging.
                        </div>
                      )}
                      <button className="btn btn-success" style={{ fontSize: 14, height: 40 }}
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
                    <div className="success-message" style={{ margin: 0 }}>
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
                                style={{ color: "var(--brand)", background: "none", border: "none",
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
                                style={{ color: "var(--brand)", background: "none", border: "none",
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
                                style={{ color: "var(--brand)", background: "none", border: "none",
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
                              <span style={{ color: "var(--warning)" }}> (замінено {commitResult.deleted_from_target} попередніх)</span>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Batch history ── */}
          <div className="import-section-card">
            <div className="import-section-header">
              <h3>Історія імпортів — {meta?.label}</h3>
            </div>
            <div className="import-section-body">
              <BatchHistoryPanel
                key={`${importType}-${historyKey}`}
                importType={importType}
                refreshKey={historyKey}
                onSelect={handleViewStaging}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
