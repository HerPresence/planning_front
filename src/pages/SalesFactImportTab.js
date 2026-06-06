import React, { useEffect, useState, useCallback } from "react";
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
import axios from "axios";
import { API_BASE_URL } from "../api/apiConfig";
import { getBrands } from "../api/brandsApi";

// ---- Formatting helpers -----------------------------------------------------

function fmtNum(v, dec = 2) {
  if (v === null || v === undefined || v === "") return "0";
  const n = Number(v);
  if (isNaN(n)) return "0";
  return n.toLocaleString("uk-UA", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ---- Status badge -----------------------------------------------------------

const STATUS_CFG = {
  loading:    { label: "Завантаження...",      bg: "#fef3c7", color: "#92400e" },
  loaded:     { label: "У staging",            bg: "#dbeafe", color: "#1e40af" },
  committing: { label: "Запис...",             bg: "#e0e7ff", color: "#3730a3" },
  committed:  { label: "Записано",             bg: "#d1fae5", color: "#065f46" },
  failed:     { label: "Помилка",              bg: "#fee2e2", color: "#991b1b" },
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
  valid:   { background: "#d1fae5", color: "#065f46", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 },
  invalid: { background: "#fee2e2", color: "#991b1b", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 },
  pending: { background: "#f3f4f6", color: "#374151", borderRadius: 4, padding: "2px 8px", fontSize: 11 },
};

const MAP_BADGE = {
  not_set: { label: "—",             background: "#f3f4f6", color: "#9ca3af" },
  manual:  { label: "вручну",        background: "#dbeafe", color: "#1e40af" },
  auto:    { label: "авто",          background: "#d1fae5", color: "#065f46" },
  error:   { label: "помилка",       background: "#fee2e2", color: "#991b1b" },
};

function MappingBadge({ status }) {
  const cfg = MAP_BADGE[status] || MAP_BADGE.not_set;
  return (
    <span style={{ ...cfg, borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 500,
                   whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ---- Raw row modal ----------------------------------------------------------

function RawRowModal({ row, onClose }) {
  if (!row) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 760, width: "90%",
                    maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <strong style={{ fontSize: 15 }}>Row #{row.id}</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {row.validation_error && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", border: "1px solid #fca5a5",
                        borderRadius: 6, marginBottom: 12, fontSize: 13, color: "#991b1b" }}>
            <strong>Помилки:</strong> {row.validation_error}
          </div>
        )}
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginBottom: 12 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Поле</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>Значення</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["period_month", row.period_month],
              ["department_uid", row.department_uid],
              ["department_name", row.department_name],
              ["master_department", row.master_department_name
                ? `#${row.master_department_id} — ${row.master_department_name}`
                : null],
              ["product_group_uid", row.product_group_uid],
              ["product_group_name", row.product_group_name],
              ["sku_uid", row.sku_uid],
              ["sku_name", row.sku_name],
              ["source_sku_uid", row.source_sku_uid],
              ["master_brand", row.master_brand_name
                ? `#${row.master_brand_id} — ${row.master_brand_name}${row.master_brand_uid ? ` [${row.master_brand_uid}]` : ""}`
                : null],
              ["mapping_status", row.mapping_status],
              ["sales_vat", row.sales_vat],
              ["sales_retail", row.sales_retail],
              ["excise", row.excise],
              ["sales_dal", row.sales_dal],
              ["sales_kg", row.sales_kg],
            ].map(([k, v]) => (
              <tr key={k} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "5px 10px", color: "#6b7280", fontFamily: "monospace" }}>{k}</td>
                <td style={{ padding: "5px 10px", fontFamily: "monospace" }}>
                  {v === null || v === undefined
                    ? <span style={{ color: "#d1d5db" }}>NULL</span>
                    : String(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {row.raw_row && (
          <>
            <div style={{ fontWeight: 600, fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Raw OLAP row:</div>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 4,
                          padding: "10px 12px", fontSize: 11, fontFamily: "monospace",
                          overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>
              {typeof row.raw_row === "string" ? row.raw_row : JSON.stringify(row.raw_row, null, 2)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Batch detail modal -----------------------------------------------------

function BatchDetailModal({ batch, onClose, onDelete, onViewStaging }) {
  if (!batch) return null;
  const isCommitted = batch.status === "committed";
  const isLoaded    = batch.status === "loaded";
  const canDelete   = batch.status !== "loading" && batch.status !== "committing";

  const handleDelete = async () => {
    let deleteFact = false;
    const msg = isCommitted
      ? `Видалити batch #${batch.id}?\n\nСтатус: Записано в ${batch.target_table}\nПеріод: ${batch.period_from || "—"} .. ${batch.period_to || "—"}\n\nОберіть далі чи видалити записані дані.`
      : `Видалити batch #${batch.id} та ${batch.rows_loaded} рядків у staging?`;
    if (!window.confirm(msg)) return;
    if (isCommitted) {
      deleteFact = window.confirm(
        `Також видалити ${batch.rows_loaded_to_target} рядків із ${batch.target_table}\nза period_from=${batch.period_from} .. period_to=${batch.period_to}\nдля source_id=${batch.source_id}?`
      );
    }
    onDelete(batch, deleteFact);
    onClose();
  };

  const field = (label, value) => (
    <div style={{ display: "flex", borderBottom: "1px solid #f3f4f6", padding: "7px 0" }}>
      <div style={{ width: 200, color: "#6b7280", fontSize: 12, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, wordBreak: "break-all" }}>{value ?? "—"}</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 28, maxWidth: 620, width: "90%",
                    maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <strong style={{ fontSize: 16 }}>Batch #{batch.id}</strong>
            <div style={{ marginTop: 4 }}><StatusBadge status={batch.status} /></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22 }}>✕</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          {field("Джерело", batch.source_name || batch.source_id)}
          {field("Тип імпорту", batch.import_type_code)}
          {field("Таблиця-джерело", "staging_sales_fact")}
          {field("Таблиця-ціль", batch.target_table || "fact_turnover")}
          {field("Режим заміни", batch.replace_mode || "replace_by_period")}
          {field("Поле дати", batch.period_field || "period_month")}
          {field("Вибраний період", batch.period_from && batch.period_to
            ? `${batch.period_from} — ${batch.period_to}`
            : batch.period_from || batch.period_to || "весь період")}
          {field("Рядків у джерелі", batch.rows_total)}
          {field("Відфільтровано (поза межами)", batch.rows_filtered_out)}
          {field("Записано у staging", batch.rows_loaded)}
          {field("Валідних у staging", batch.rows_valid)}
          {field("Невалідних у staging", batch.rows_invalid)}
          {field("Записано у цільову таблицю", batch.rows_loaded_to_target)}
          {field("Початок", batch.started_at?.slice(0, 16).replace("T", " "))}
          {field("Завершено", batch.finished_at?.slice(0, 16).replace("T", " "))}
          {batch.error_message && field("Помилка", batch.error_message)}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(isLoaded || isCommitted) && (
            <button className="btn btn-secondary"
              onClick={() => { onViewStaging(batch); onClose(); }}>
              Переглянути staging
            </button>
          )}
          {canDelete && (
            <button style={{ padding: "6px 16px", border: "1px solid #fca5a5", borderRadius: 4,
                             background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 13 }}
              onClick={handleDelete}>
              Видалити
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Bulk Update Modal ------------------------------------------------------

function BulkUpdateModal({ batchId, staging, statusFilter, onClose, onApplied }) {
  const [targetField,  setTargetField]  = useState("department");
  const [masterId,     setMasterId]     = useState("");
  const [departments,  setDepartments]  = useState([]);
  const [brands,       setBrands]       = useState([]);
  const [search,       setSearch]       = useState("");
  const [applying,     setApplying]     = useState(false);
  const [result,       setResult]       = useState(null);
  const [err,          setErr]          = useState(null);

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
    ? masterOptions.filter(o => {
        const name = (o.department_name || o.brand_name || "").toLowerCase();
        return name.includes(search.toLowerCase());
      })
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
                    maxHeight: "85vh", overflowY: "auto",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <strong style={{ fontSize: 16 }}>Масове заповнення полів</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        {/* Context */}
        <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          Поточна вибірка:{" "}
          <strong>{affectedCount}</strong> рядків
          {statusFilter && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
              (фільтр: <em>{statusFilter === "invalid" ? "тільки помилки" : "тільки валідні"}</em>)
            </span>
          )}
        </div>

        {/* Field selector */}
        <div className="form-field">
          <label>Поле для заміни</label>
          <select value={targetField} onChange={e => { setTargetField(e.target.value); setMasterId(""); setSearch(""); }}
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4,
                     fontSize: 13, width: "100%" }}>
            <option value="department">Підрозділ (з довідника Підрозділи)</option>
            <option value="brand">Бренд / Номенклатурна група (з довідника Бренди)</option>
          </select>
        </div>

        {/* Search + value select */}
        <div className="form-field">
          <label>Значення з довідника</label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Пошук ${targetField === "department" ? "підрозділу" : "бренду"}...`}
            style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4,
                     fontSize: 13, width: "100%", marginBottom: 6 }}
          />
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
                    {o.brand_name}{o.brand_group ? ` (${o.brand_group})` : ""}
                    {o.brand_uid ? ` [${o.brand_uid}]` : ""}
                  </option>
            )}
          </select>
          {filteredOptions.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {targetField === "department"
                ? "Підрозділів не знайдено. Додайте у розділі Довідники → Підрозділи."
                : "Брендів не знайдено. Додайте у розділі Довідники → Бренди."}
            </div>
          )}
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
            <strong>Готово!</strong>{" "}
            Оновлено {result.rows_updated} рядків.{" "}
            Тепер валідних: <strong>{result.staging?.valid ?? "—"}</strong>,{" "}
            помилок: <strong>{result.staging?.invalid ?? "—"}</strong>.
            <div style={{ marginTop: 6, fontSize: 12, color: "#065f46" }}>
              Виправлено {result.rows_now_valid} рядків після валідації.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {!result ? (
            <button className="btn btn-primary" onClick={handleApply}
              disabled={applying || !masterId}>
              {applying ? "Застосування..." : "Застосувати"}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleApply}
              disabled={applying || !masterId}>
              {applying ? "..." : "Застосувати ще раз"}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  );
}


// ---- Main component ---------------------------------------------------------

export default function SalesFactImportTab() {
  const [sources,         setSources]         = useState([]);
  const [selectedId,      setSelectedId]      = useState("");
  const [fieldMapping,    setFieldMapping]    = useState([]);
  const [showMapping,     setShowMapping]     = useState(false);
  const [savingMapping,   setSavingMapping]   = useState(false);
  const [mappingMsg,      setMappingMsg]      = useState(null);

  // Period params
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().slice(0, 10);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString().slice(0, 10);

  const [periodFrom, setPeriodFrom] = useState(firstOfMonth);
  const [periodTo,   setPeriodTo]   = useState(lastOfMonth);
  const [replaceMode, setReplaceMode] = useState("replace_by_period");

  // Preview
  const [previewing,  setPreviewing]  = useState(false);
  const [previewData, setPreviewData] = useState(null);

  // Loading / staging
  const [loading,         setLoading]         = useState(false);
  const [loadResult,      setLoadResult]      = useState(null);
  const [batchId,         setBatchId]         = useState(null);
  const [staging,         setStaging]         = useState(null);
  const [statusFilter,    setStatusFilter]    = useState(null);
  const [filterLoading,   setFilterLoading]   = useState(false);

  // Commit
  const [committing,   setCommitting]   = useState(false);
  const [commitResult, setCommitResult] = useState(null);

  // UI state
  const [detailRow,      setDetailRow]      = useState(null);
  const [detailBatch,    setDetailBatch]    = useState(null);
  const [batches,        setBatches]        = useState([]);
  const [error,          setError]          = useState(null);
  const [success,        setSuccess]        = useState(null);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);

  const refreshBatches = useCallback(() =>
    getImportBatches(30)
      .then(data => setBatches(data.filter(b => b.import_type_code === "sales_fact")))
      .catch(() => {}),
  []);

  useEffect(() => {
    getEngineSources()
      .then(data => setSources(data.filter(s => s.import_type_code === "sales_fact")))
      .catch(() => {});
    refreshBatches();
  }, [refreshBatches]);

  const handleSourceChange = async (id) => {
    setSelectedId(id);
    setPreviewData(null);
    setStaging(null);
    setBatchId(null);
    setLoadResult(null);
    setCommitResult(null);
    setStatusFilter(null);
    setError(null);
    setSuccess(null);
    if (!id) { setFieldMapping([]); return; }
    try {
      const fm = await getFieldMapping(Number(id));
      setFieldMapping(fm || []);
    } catch { setFieldMapping([]); }
  };

  const handlePreview = async () => {
    if (!selectedId) return;
    setPreviewing(true); setError(null); setPreviewData(null);
    try {
      setPreviewData(await previewEngineSource(Number(selectedId)));
    } catch (err) {
      setError(err?.response?.data?.detail || "Connection error");
    } finally { setPreviewing(false); }
  };

  const handleLoad = async () => {
    if (!selectedId) return;
    if (!periodFrom || !periodTo) {
      setError("Вкажіть Період від та Період до перед завантаженням");
      return;
    }
    if (periodFrom > periodTo) {
      setError("Період від не може бути більшим за Період до");
      return;
    }
    setLoading(true); setError(null); setStaging(null);
    setBatchId(null); setLoadResult(null); setCommitResult(null); setStatusFilter(null);
    try {
      const res = await loadToStaging(Number(selectedId), {
        period_from: periodFrom,
        period_to:   periodTo,
        period_field: "period_month",
        replace_mode: replaceMode,
      });
      setBatchId(res.batch_id);
      setStaging(res.staging);
      setLoadResult(res);
      setSuccess(
        `Отримано ${res.rows_total} рядків з OLAP. ` +
        (res.rows_filtered_out > 0 ? `Відфільтровано поза [${periodFrom}..${periodTo}]: ${res.rows_filtered_out}. ` : "") +
        `У staging: ${res.rows_loaded} (валідних ${res.rows_valid}, помилок ${res.rows_invalid})`
      );
      refreshBatches();
    } catch (err) {
      setError(err?.response?.data?.detail || "Error loading data");
    } finally { setLoading(false); }
  };

  const handleFilterChange = async (newFilter) => {
    if (!batchId) return;
    setStatusFilter(newFilter); setFilterLoading(true);
    try { setStaging(await getStagingPreview(batchId, newFilter, 500)); } catch {}
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
      setSuccess(
        `Записано ${res.committed} рядків у fact_turnover` +
        (res.deleted_from_target > 0 ? ` (замінено ${res.deleted_from_target} попередніх рядків)` : "")
      );
      refreshBatches();
    } catch (err) {
      setError(err?.response?.data?.detail || "Error committing");
    } finally { setCommitting(false); }
  };

  const handleSaveMapping = async () => {
    if (!selectedId) return;
    setSavingMapping(true); setMappingMsg(null);
    try {
      await saveFieldMapping(Number(selectedId), fieldMapping);
      setMappingMsg("Маппінг збережено");
    } catch { setMappingMsg("Помилка збереження"); }
    finally { setSavingMapping(false); }
  };

  const handleViewStaging = async (b) => {
    setBatchId(b.id);
    setCommitResult(b.status === "committed" ? { committed: b.rows_loaded_to_target, batch_id: b.id } : null);
    setStatusFilter(null);
    const data = await getStagingPreview(b.id, null, 500);
    setStaging(data);
  };

  const handleDeleteBatch = async (b, deleteFact) => {
    try {
      await deleteBatch(b.id, deleteFact);
      setSuccess(
        `Batch #${b.id} видалено${deleteFact ? " разом із даними у fact_turnover" : " (дані у fact_turnover збережено)"}`
      );
      if (batchId === b.id) { setBatchId(null); setStaging(null); setLoadResult(null); setCommitResult(null); }
      refreshBatches();
    } catch (err) {
      setError(err?.response?.data?.detail || "Error deleting batch");
    }
  };

  const updateMappingRow = (idx, key, val) =>
    setFieldMapping(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  const addMappingRow   = () =>
    setFieldMapping(prev => [...prev, { source_field: "", target_field: "", required: false, transform_rule: "" }]);
  const removeMappingRow = (idx) =>
    setFieldMapping(prev => prev.filter((_, i) => i !== idx));

  const noSalesSources = sources.length === 0;
  const canCommit = staging && staging.valid > 0 && !commitResult;

  return (
    <div>
      {detailRow   && <RawRowModal    row={detailRow}     onClose={() => setDetailRow(null)} />}
      {showBulkUpdate && batchId && staging && (
        <BulkUpdateModal
          batchId={batchId}
          staging={staging}
          statusFilter={statusFilter}
          onClose={() => setShowBulkUpdate(false)}
          onApplied={(newStaging) => { setStaging(newStaging); }}
        />
      )}
      {detailBatch && <BatchDetailModal
        batch={detailBatch}
        onClose={() => setDetailBatch(null)}
        onDelete={handleDeleteBatch}
        onViewStaging={handleViewStaging}
      />}

      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c33", fontSize: 16 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="success-message" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* STEP 1: Source */}
      <div className="import-section">
        <h3 className="section-title">1. Джерело</h3>
        {noSalesSources && (
          <div style={{ padding: "10px 14px", background: "#fef3c7", border: "1px solid #f59e0b",
                        borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
            Немає джерел з типом "Факт товарообороту". Перейдіть у "Відповідність" та вкажіть тип.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-field" style={{ margin: 0 }}>
            <label>Джерело</label>
            <select value={selectedId} onChange={e => handleSourceChange(e.target.value)}
              style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, minWidth: 260 }}>
              <option value="">— оберіть —</option>
              {sources.map(s => <option key={s.id} value={s.id}>{s.source_name} ({s.source_type})</option>)}
            </select>
          </div>
          {selectedId && (
            <button className="btn btn-secondary" onClick={handlePreview} disabled={previewing}>
              {previewing ? "Перевірка..." : "Перевірити підключення"}
            </button>
          )}
        </div>
        {previewData && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#f0fdf4",
                        border: "1px solid #86efac", borderRadius: 6, fontSize: 13 }}>
            OK — колонок: <strong>{previewData.columns?.length}</strong>, рядків: <strong>{previewData.total_rows}</strong>
            {previewData.columns?.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", color: "var(--text-secondary)", fontSize: 11 }}>Колонки</summary>
                <div style={{ marginTop: 4, fontSize: 11, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                  {previewData.columns.join(" | ")}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* STEP 2: Import parameters (period) */}
      {selectedId && (
        <div className="import-section">
          <h3 className="section-title">2. Параметри імпорту</h3>
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
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)",
                        padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)",
                        borderRadius: 6 }}>
            Ключ заміни: <code>period_month</code> + <code>source_id</code>
            {" — "} буде замінено рядки за <strong>{periodFrom || "?"} — {periodTo || "?"}</strong> із джерела #{selectedId}
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={handleLoad} disabled={loading || !periodFrom || !periodTo}>
              {loading ? "Завантаження з OLAP..." : "Отримати дані та завантажити в staging"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Field mapping */}
      {selectedId && (
        <div className="import-section">
          <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", userSelect: "none" }}
               onClick={() => setShowMapping(v => !v)}>
            <h3 className="section-title" style={{ margin: 0 }}>3. Маппінг полів</h3>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{showMapping ? "▲" : "▼"}</span>
          </div>
          {showMapping && (
            <>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Поле джерела (OLAP)</th>
                      <th>Поле в staging / fact_turnover</th>
                      <th style={{ width: 80, textAlign: "center" }}>Обов'язк.</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldMapping.map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          <input value={row.source_field}
                            onChange={e => updateMappingRow(idx, "source_field", e.target.value)}
                            style={{ width: "100%", padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 12 }} />
                        </td>
                        <td>
                          <input value={row.target_field}
                            onChange={e => updateMappingRow(idx, "target_field", e.target.value)}
                            style={{ width: "100%", padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 12 }} />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <input type="checkbox" checked={!!row.required}
                            onChange={e => updateMappingRow(idx, "required", e.target.checked)} />
                        </td>
                        <td>
                          <button onClick={() => removeMappingRow(idx)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#c33", fontSize: 15 }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <button className="btn btn-secondary" onClick={addMappingRow}>+ Рядок</button>
                <button className="btn btn-primary" onClick={handleSaveMapping} disabled={savingMapping}>
                  {savingMapping ? "..." : "Зберегти"}
                </button>
                {mappingMsg && (
                  <span style={{ fontSize: 12, color: mappingMsg.includes("Помилка") ? "#c33" : "#065f46" }}>
                    {mappingMsg}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 4: Load result */}
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

      {/* STEP 5: Staging preview */}
      {staging && batchId && (
        <div className="import-section">
          <h3 className="section-title">4. Staging — batch #{batchId}</h3>

          {/* KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 14 }}>
            {[
              { label: "Всього",          value: staging.total,                       color: "var(--text-primary)" },
              { label: "Валідних",        value: staging.valid,                       color: "#065f46" },
              { label: "Помилок",         value: staging.invalid,                     color: staging.invalid > 0 ? "#991b1b" : "#065f46" },
              { label: "Продажі з ПДВ",  value: fmtNum(staging.total_sales_vat),     color: "var(--text-primary)" },
              { label: "Роздрібні",       value: fmtNum(staging.total_sales_retail),  color: "var(--text-primary)" },
              { label: "Акциз",           value: fmtNum(staging.total_excise),         color: "var(--text-primary)" },
              { label: "Дал",             value: fmtNum(staging.total_sales_dal, 3),  color: "var(--text-primary)" },
              { label: "Кг",              value: fmtNum(staging.total_sales_kg, 3),   color: "var(--text-primary)" },
            ].map(k => (
              <div key={k.label} style={{ padding: "8px 10px", background: "var(--surface)",
                                         border: "1px solid var(--border)", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
            Період у staging: <strong>{staging.period_from || "—"}</strong> — <strong>{staging.period_to || "—"}</strong>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            {[
              { label: `Всі (${staging.total})`,        val: null },
              { label: `Валідні (${staging.valid})`,    val: "valid" },
              { label: `Помилки (${staging.invalid})`,  val: "invalid" },
            ].map(f => (
              <button key={String(f.val)} onClick={() => handleFilterChange(f.val)}
                style={{
                  padding: "4px 12px", fontSize: 12, border: "1px solid var(--border)", borderRadius: 4,
                  cursor: "pointer",
                  background: statusFilter === f.val ? "var(--primary)" : "var(--surface)",
                  color: statusFilter === f.val ? "#fff" : "var(--text-primary)",
                  fontWeight: statusFilter === f.val ? 700 : 400,
                }}>
                {f.label}
              </button>
            ))}
            <button onClick={handleRefreshStaging} disabled={filterLoading}
              style={{ padding: "4px 10px", fontSize: 12,
                       border: "1px solid var(--border)", borderRadius: 4,
                       cursor: "pointer", background: "var(--surface)" }}>
              {filterLoading ? "..." : "↻ Оновити"}
            </button>
            {staging.invalid > 0 && (
              <button
                onClick={() => setShowBulkUpdate(true)}
                style={{
                  marginLeft: "auto", padding: "4px 14px", fontSize: 12, fontWeight: 600,
                  border: "1px solid #3b82f6", borderRadius: 4,
                  cursor: "pointer", background: "#eff6ff", color: "#1e40af",
                }}>
                ✏ Масове заповнення полів
              </button>
            )}
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto",
                        border: "1px solid var(--border)", borderRadius: 6 }}>
            <table className="data-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Статус</th>
                  <th title="Статус маппінгу (вручну / авто / не визначено)">Маппінг</th>
                  <th>Період</th>
                  <th>Підрозділ (джерело)</th>
                  <th>Master підрозділ</th>
                  <th>Бренд / Група (джерело)</th>
                  <th>SKU (джерело)</th>
                  <th>Master бренд</th>
                  <th style={{ textAlign: "right" }}>з ПДВ</th>
                  <th style={{ textAlign: "right" }}>Роздріб</th>
                  <th style={{ textAlign: "right" }}>Дал</th>
                  <th>Помилка</th>
                </tr>
              </thead>
              <tbody>
                {(staging.rows || []).map(r => (
                  <tr key={r.id} onClick={() => setDetailRow(r)} style={{ cursor: "pointer" }}>
                    <td><span style={V_BADGE[r.validation_status] || V_BADGE.pending}>{r.validation_status}</span></td>
                    <td><MappingBadge status={r.mapping_status} /></td>
                    <td>{r.period_month}</td>
                    <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={`${r.department_uid || "—"} | ${r.department_name}`}>
                      {r.department_name || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={r.master_department_name || ""}>
                      {r.master_department_name
                        ? <span style={{ color: "#1e40af", fontWeight: 500 }}>{r.master_department_name}</span>
                        : <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={`${r.product_group_uid || "—"} | ${r.product_group_name}`}>
                      {r.product_group_name || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={`${r.sku_uid || "—"} | ${r.sku_name || "—"}`}>
                      {r.sku_name || <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={r.master_brand_name || ""}>
                      {r.master_brand_name
                        ? <span style={{ color: "#1e40af", fontWeight: 500 }}>{r.master_brand_name}</span>
                        : <span style={{ color: "#d1d5db" }}>—</span>}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_vat)}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_retail)}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtNum(r.sales_dal, 3)}</td>
                    <td style={{ color: "#991b1b", fontSize: 10, maxWidth: 160, overflow: "hidden",
                                 textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={r.validation_error || ""}>{r.validation_error || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Клік на рядок — деталі та raw OLAP
          </div>

          {/* Commit */}
          {!commitResult ? (
            <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--surface)",
                          border: "1px solid var(--border)", borderRadius: 8 }}>
              {staging.invalid > 0 && (
                <div style={{ padding: "7px 12px", background: "#fef3c7", border: "1px solid #f59e0b",
                              borderRadius: 6, marginBottom: 10, fontSize: 13 }}>
                  Буде записано <strong>{staging.valid}</strong> валідних рядків.
                  {" "}<strong>{staging.invalid}</strong> невалідних залишаться у staging.
                </div>
              )}
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
                Режим: <strong>{replaceMode === "replace_by_period" ? "Замінити" : "Дописати"}</strong>
                {replaceMode === "replace_by_period" && (
                  <span> — буде видалено попередні рядки source_id={selectedId}, period_month BETWEEN <strong>{periodFrom}</strong> AND <strong>{periodTo}</strong></span>
                )}
              </div>
              <button className="btn btn-primary" onClick={handleCommit}
                disabled={committing || !canCommit}>
                {committing ? "Запис..." : canCommit
                  ? `Завантажити в fact_turnover (${staging.valid} рядків)`
                  : "Немає валідних рядків"}
              </button>
            </div>
          ) : (
            <div className="success-message" style={{ marginTop: 12 }}>
              Записано <strong>{commitResult.committed}</strong> рядків у fact_turnover
              {commitResult.deleted_from_target > 0 && (
                <span style={{ color: "#92400e" }}> (замінено {commitResult.deleted_from_target} рядків за [{commitResult.period_from}..{commitResult.period_to}])</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Batch history */}
      {batches.length > 0 && (
        <div className="import-section">
          <h3 className="section-title">Історія імпортів</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Джерело</th>
                  <th>Статус</th>
                  <th>Тип / Ціль</th>
                  <th>Період</th>
                  <th style={{ textAlign: "right" }}>Всього</th>
                  <th style={{ textAlign: "right" }}>Valid</th>
                  <th style={{ textAlign: "right" }}>Err</th>
                  <th style={{ textAlign: "right" }}>Записано</th>
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{b.id}</td>
                    <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={b.source_name}>{b.source_name || b.source_id}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      <div>{b.import_type_code}</div>
                      <div style={{ color: "var(--text-muted)" }}>→ {b.target_table || "fact_turnover"}</div>
                    </td>
                    <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                      {b.period_from && b.period_to
                        ? <>{b.period_from.slice(0, 7)}<br />{b.period_to.slice(0, 7)}</>
                        : <span style={{ color: "var(--text-muted)" }}>весь</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>{b.rows_total ?? "—"}</td>
                    <td style={{ textAlign: "right", color: "#065f46", fontWeight: 600 }}>{b.rows_valid ?? b.rows_loaded ?? "—"}</td>
                    <td style={{ textAlign: "right", color: (b.rows_invalid ?? b.rows_failed) > 0 ? "#991b1b" : undefined, fontWeight: (b.rows_invalid ?? b.rows_failed) > 0 ? 600 : undefined }}>
                      {b.rows_invalid ?? b.rows_failed ?? 0}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {b.status === "committed" ? (b.rows_loaded_to_target ?? "—") : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>
                        <button style={{ fontSize: 11, color: "var(--primary)", background: "none", border: "none",
                                         cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
                          onClick={() => setDetailBatch(b)}>
                          Деталі
                        </button>
                        {(b.status === "loaded" || b.status === "committed") && (
                          <button style={{ fontSize: 11, color: "var(--text-secondary)", background: "none",
                                           border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
                            onClick={() => handleViewStaging(b)}>
                            Staging
                          </button>
                        )}
                        {b.error_message && (
                          <span style={{ color: "#991b1b", fontSize: 10, maxWidth: 120,
                                         overflow: "hidden", textOverflow: "ellipsis" }}
                                title={b.error_message}>
                            {b.error_message.slice(0, 30)}…
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
