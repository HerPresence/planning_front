import React, { useEffect, useState, useCallback } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import {
  getStagedBrands,
  getMasterBrands,
  bindBrand,
  rejectBrand,
  autoBindBrands,
  bulkFillPreview,
  bulkFillApply,
  bulkCreatePreview,
  bulkCreateApply,
  createAndBindBrand,
  createMasterFromMapping,
  unmapBrand,
  createParentBrand,
} from "../api/brandSourceMappingApi";

// ── Styles ────────────────────────────────────────────────────────────────────

const thS = {
  padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
  fontWeight: 600, fontSize: 11, color: "#6b7280", background: "#f9fafb",
  position: "sticky", top: 0, whiteSpace: "nowrap",
};
const tdS = { padding: "5px 10px", verticalAlign: "middle", fontSize: 12 };

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
  pending:        { label: "Очікує",          bg: "#fef3c7", color: "#92400e" },
  mapped:         { label: "Прив'язано",      bg: "#d1fae5", color: "#065f46" },
  rejected:       { label: "Відхилено",       bg: "#fee2e2", color: "#991b1b" },
  auto:           { label: "Авто",            bg: "#dbeafe", color: "#1e40af" },
  ready_to_create:{ label: "Готово створити", bg: "#ecfdf5", color: "#059669" },
  parent_missing: { label: "Немає parent",    bg: "#fef3c7", color: "#b45309" },
  duplicate_id:   { label: "Дублікат UID",    bg: "#fff7ed", color: "#c2410c" },
  source_changed: { label: "Змінено",         bg: "#eff6ff", color: "#1d4ed8" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 4,
                   padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

function ComputedStatusBadge({ computedStatus, mappingStatus }) {
  if (!computedStatus || computedStatus === mappingStatus || computedStatus === "mapped") return null;
  const cfg = STATUS_CFG[computedStatus];
  if (!cfg) return null;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 3,
                   padding: "1px 6px", fontSize: 10, fontWeight: 600,
                   whiteSpace: "nowrap", marginLeft: 4, border: `1px solid ${cfg.color}33` }}>
      {cfg.label}
    </span>
  );
}

// ── KPI pill row ──────────────────────────────────────────────────────────────

function KpiPill({ label, value, color, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 12px", borderRadius: 20,
        border: active ? `2px solid ${color}` : "1px solid #e5e7eb",
        background: active ? `${color}18` : "#fff",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 700, color: color || "#374151" }}>{value ?? "—"}</span>
      <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
    </div>
  );
}

// ── Bind Modal ────────────────────────────────────────────────────────────────

function BindModal({ row, masters, onBind, onCreate, onClose, initialMode = "bind" }) {
  const [mode,     setMode]    = useState(initialMode); // "bind" | "create"
  const [search,   setSearch]  = useState(row.source_brand_name || "");
  const [masterId, setMasterId] = useState("");
  const [busy,     setBusy]    = useState(false);
  const [err,      setErr]     = useState(null);

  // Create-form state (prefilled from source row)
  const [brandUid,   setBrandUid]   = useState(row.source_brand_id    || "");
  const [brandName,  setBrandName]  = useState(row.source_brand_name  || "");
  const [brandGroup, setBrandGroup] = useState(row.source_brand_group || "");
  const [parentUid,  setParentUid]  = useState(row.source_parent_uid  || "");
  const [parentName, setParentName] = useState(row.source_parent_name || "");

  const filtered = search
    ? masters.filter(m =>
        (m.brand_name  || "").toLowerCase().includes(search.toLowerCase()) ||
        (m.brand_uid   || "").toLowerCase().includes(search.toLowerCase()) ||
        (m.brand_group || "").toLowerCase().includes(search.toLowerCase()))
    : masters;

  const selected = masters.find(m => String(m.id) === String(masterId));

  const handleBind = async () => {
    if (!masterId) { setErr("Оберіть master бренд"); return; }
    setBusy(true); setErr(null);
    try {
      await onBind(row.source_id, row.source_brand_id, Number(masterId));
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка прив'язки");
    } finally { setBusy(false); }
  };

  const handleCreate = async () => {
    if (!brandName.trim()) { setErr("Назва бренду обов'язкова"); return; }
    setBusy(true); setErr(null);
    try {
      await onCreate({
        source_id:         row.source_id,
        source_brand_id:   row.source_brand_id,
        brand_uid:         brandUid.trim()   || null,
        brand_name:        brandName.trim(),
        brand_group:       brandGroup.trim() || null,
        parent_brand_uid:  parentUid.trim()  || null,
        parent_brand_name: parentName.trim() || null,
      });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка створення");
    } finally { setBusy(false); }
  };

  const switchMode = (m) => { setMode(m); setErr(null); };

  const tabStyle = (active) => ({
    padding: "6px 16px", fontSize: 13, fontWeight: active ? 700 : 400,
    border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer",
    background: active ? "var(--primary, #2563eb)" : "#fff",
    color: active ? "#fff" : "#374151",
  });

  const inputStyle = {
    display: "block", width: "100%", padding: "6px 8px", marginTop: 3,
    border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 28, maxWidth: 560, width: "90%",
                    maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>Прив'язати бренд</strong>
          <button onClick={onClose} style={{ background: "none", border: "none",
                                             cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        {/* Source info */}
        <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          <div><strong>Джерело:</strong> {row.source_name}</div>
          <div><strong>ID:</strong> {row.source_brand_id}</div>
          <div><strong>Назва:</strong> {row.source_brand_name}</div>
          {row.source_brand_group && <div><strong>Група:</strong> {row.source_brand_group}</div>}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <button style={tabStyle(mode === "bind")}   onClick={() => switchMode("bind")}>
            Прив'язати існуючий
          </button>
          <button style={tabStyle(mode === "create")} onClick={() => switchMode("create")}>
            Створити новий
          </button>
        </div>

        {/* Error */}
        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 12 }}>{err}</div>
        )}

        {/* ── Bind existing ── */}
        {mode === "bind" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setMasterId(""); }}
                placeholder="Пошук master бренду..."
                style={{ flex: 1, padding: "6px 8px", border: "1px solid #d1d5db",
                         borderRadius: 4, fontSize: 13 }}
              />
              <button
                onClick={() => { setSearch(row.source_brand_name || ""); setMasterId(""); }}
                title="Підставити назву зі staging"
                style={{ padding: "5px 10px", fontSize: 12, border: "1px solid #d1d5db",
                         borderRadius: 4, cursor: "pointer", background: "#f3f4f6",
                         color: "#374151", whiteSpace: "nowrap" }}>
                ↩ Зі staging
              </button>
            </div>

            {search && filtered.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
                  Master бренд не знайдено за запитом «{search}»
                </div>
                <button
                  onClick={() => switchMode("create")}
                  style={{ padding: "7px 18px", background: "#fefce8", border: "1px solid #fde047",
                           borderRadius: 4, cursor: "pointer", fontSize: 13,
                           color: "#713f12", fontWeight: 600 }}>
                  + Створити master-бренд
                </button>
              </div>
            ) : (
              <>
                <select
                  value={masterId}
                  onChange={e => setMasterId(e.target.value)}
                  size={Math.min(filtered.length + 1, 9)}
                  style={{ width: "100%", padding: "4px 6px", border: "1px solid #d1d5db",
                           borderRadius: 4, fontSize: 13, minHeight: 80, marginBottom: 10 }}>
                  <option value="">— оберіть master бренд —</option>
                  {filtered.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.brand_name}{m.brand_uid ? ` [${m.brand_uid}]` : ""}
                      {m.brand_group ? ` · ${m.brand_group}` : ""}
                    </option>
                  ))}
                </select>

                {selected && (
                  <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #86efac",
                                borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                    Буде прив'язано до: <strong>{selected.brand_name}</strong>
                    {selected.brand_uid && (
                      <span style={{ color: "#6b7280" }}> [{selected.brand_uid}]</span>
                    )}
                  </div>
                )}
              </>
            )}

            {!(search && filtered.length === 0) && (
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleBind}
                  disabled={busy || !masterId}
                  style={{ padding: "7px 20px", background: "var(--primary, #2563eb)", color: "#fff",
                           border: "none", borderRadius: 4, cursor: "pointer",
                           fontSize: 13, fontWeight: 600 }}>
                  {busy ? "..." : "Прив'язати"}
                </button>
                <button onClick={onClose} className="btn btn-secondary">Скасувати</button>
              </div>
            )}

            {search && filtered.length === 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={onClose} className="btn btn-secondary">Скасувати</button>
              </div>
            )}
          </>
        )}

        {/* ── Create new ── */}
        {mode === "create" && (
          <>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 12, color: "#6b7280" }}>
                UID бренду
                <input value={brandUid} onChange={e => setBrandUid(e.target.value)}
                       placeholder="напр. BRAND_001" style={inputStyle} />
              </label>
              <label style={{ fontSize: 12, color: "#6b7280" }}>
                Назва бренду <span style={{ color: "#ef4444" }}>*</span>
                <input value={brandName} onChange={e => setBrandName(e.target.value)}
                       placeholder="Назва master-бренду" style={inputStyle} />
              </label>
              <label style={{ fontSize: 12, color: "#6b7280" }}>
                Група
                <input value={brandGroup} onChange={e => setBrandGroup(e.target.value)}
                       placeholder="Група бренду" style={inputStyle} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ fontSize: 12, color: "#6b7280" }}>
                  Parent UID
                  <input value={parentUid} onChange={e => setParentUid(e.target.value)}
                         placeholder="Parent brand_uid" style={inputStyle} />
                </label>
                <label style={{ fontSize: 12, color: "#6b7280" }}>
                  Parent name
                  <input value={parentName} onChange={e => setParentName(e.target.value)}
                         placeholder="Parent brand name" style={inputStyle} />
                </label>
              </div>
            </div>

            {Object.keys(row.extra_fields || {}).length > 0 && (
              <div style={{ marginTop: 14, padding: "10px 12px", background: "#f9fafb",
                            border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
                  Додаткові поля з джерела
                </div>
                <ExtraFieldsChips fields={row.extra_fields} />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={handleCreate}
                disabled={busy || !brandName.trim()}
                style={{ padding: "7px 20px", background: "var(--primary, #2563eb)", color: "#fff",
                         border: "none", borderRadius: 4, cursor: "pointer",
                         fontSize: 13, fontWeight: 600 }}>
                {busy ? "..." : "Створити і прив'язати"}
              </button>
              <button onClick={onClose} className="btn btn-secondary">Скасувати</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bulk-fill/create shared helpers ───────────────────────────────────────────

const FILL_FIELD_OPTIONS = [
  { value: "brand_group",       label: "Група бренду"        },
  { value: "brand_name",        label: "Назва master-бренду" },
  { value: "parent_brand_uid",  label: "Parent UID"          },
  { value: "parent_brand_name", label: "Parent name"         },
];

const FILL_FILTER_LABELS = {
  filterSource:      "Джерело",
  filterBrandGroup:  "Група бренду",
  filterMasterBrand: "Master бренд",
  filterStatus:      "Статус",
  search:            "Пошук",
};

function buildFillApiFilters(f) {
  return {
    source_id:       f.filterSource      ? Number(f.filterSource) : null,
    brand_group:     f.filterBrandGroup  || null,
    master_brand_id: f.filterMasterBrand ? Number(f.filterMasterBrand) : null,
    mapping_status:  (f.filterStatus && f.filterStatus !== "all") ? f.filterStatus : null,
    search:          f.search            || null,
  };
}

function hasBrandFilter(f) {
  return !!(
    f.filterSource || f.filterBrandGroup || f.filterMasterBrand ||
    (f.filterStatus && f.filterStatus !== "all") || f.search
  );
}

function BrandFilterContext({ filters, sources, masters }) {
  const resolveLabel = (key, val) => {
    if (key === "filterSource") {
      const s = sources.find(s => String(s.id) === String(val));
      return s ? s.name : val;
    }
    if (key === "filterMasterBrand") {
      const m = masters.find(m => String(m.id) === String(val));
      return m ? m.brand_name : val;
    }
    return val;
  };

  const active = Object.entries(FILL_FILTER_LABELS).filter(([key]) => {
    const v = filters[key];
    if (!v) return false;
    if (key === "filterStatus" && v === "all") return false;
    return true;
  });

  return (
    <div className="bulk-fill-context">
      <div className="bulk-fill-context-label">Поточна вибірка</div>
      {active.length === 0 ? (
        <div className="bulk-fill-no-filter">Фільтри не задано — операція заблокована</div>
      ) : (
        <div className="bulk-fill-tags">
          {active.map(([key, label]) => (
            <span key={key} className="bulk-fill-tag">
              {label}: {resolveLabel(key, filters[key])}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── BrandBulkFillModal ────────────────────────────────────────────────────────

function BrandBulkFillModal({ filters, sources, masters, onClose, onSuccess }) {
  const [field,    setField]    = useState("");
  const [value,    setValue]    = useState("");
  const [preview,  setPreview]  = useState(null);
  const [loadingP, setLoadingP] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState(null);

  const noFilter = !hasBrandFilter(filters);

  const handleFieldChange = (e) => {
    setField(e.target.value);
    setValue("");
    setPreview(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!field || !value.trim()) { setError("Оберіть поле та введіть значення"); return; }
    setLoadingP(true); setError(null); setPreview(null);
    try {
      const res = await bulkFillPreview({ filters: buildFillApiFilters(filters), field, value: value.trim() });
      if (res.status === "ok") setPreview(res);
      else setError(res.message || "Помилка preview");
    } catch {
      setError("Помилка preview");
    } finally {
      setLoadingP(false);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.total_affected_count === 0) return;
    setApplying(true); setError(null);
    try {
      const res = await bulkFillApply({
        filters: buildFillApiFilters(filters),
        field,
        value: value.trim(),
        confirm: true,
      });
      if (res.status === "ok") onSuccess(res);
      else setError(res.message || "Помилка застосування");
    } catch {
      setError("Помилка застосування");
    } finally {
      setApplying(false);
    }
  };

  const canApply = preview && preview.total_affected_count > 0 && !applying;

  return (
    <Modal title="Масове заповнення полів бренду" onClose={onClose} size="large">
      <BrandFilterContext filters={filters} sources={sources} masters={masters} />

      {noFilter && (
        <div className="bulk-fill-warning" style={{ marginTop: 12 }}>
          Масове заповнення недоступне без активного фільтра. Звузьте вибірку та спробуйте знову.
        </div>
      )}

      {!noFilter && (
        <>
          <div className="form-row" style={{ marginTop: 16 }}>
            <select value={field} onChange={handleFieldChange}>
              <option value="">— Оберіть поле для заповнення —</option>
              {FILL_FIELD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {field && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <input
                type="text"
                value={value}
                onChange={e => { setValue(e.target.value); setPreview(null); }}
                placeholder={`Введіть значення для «${FILL_FIELD_OPTIONS.find(o => o.value === field)?.label}»...`}
              />
            </div>
          )}

          {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}

          {preview && (
            <div className="bulk-fill-preview">
              <div className="bulk-fill-preview-row">
                <span>Поле</span>
                <strong>{preview.field_label}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Нове значення</span>
                <strong>{preview.value}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Master-брендів для оновлення</span>
                <strong>{preview.affected_master_count}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Pending рядків (default значення)</span>
                <strong>{preview.affected_source_count}</strong>
              </div>
              {(preview.warnings || []).map((w, i) => (
                <div key={i} className="bulk-fill-warning">{w}</div>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button
              variant="secondary"
              onClick={handlePreview}
              disabled={!field || !value.trim() || loadingP}
            >
              {loadingP ? "Розрахунок..." : "Перевірити"}
            </Button>
            <Button
              variant="primary"
              onClick={handleApply}
              disabled={!canApply}
            >
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

// ── BrandBulkCreateModal ──────────────────────────────────────────────────────

function ExamplesTable({ title, rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              {["Source Brand ID", "Source name", "Group", "Проблема"].map(h => (
                <th key={h} style={{ padding: "3px 8px", textAlign: "left",
                                     borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "2px 8px" }}>
                  <code style={{ fontSize: 10 }}>{r.source_brand_id || "—"}</code>
                </td>
                <td style={{ padding: "2px 8px" }}>{r.source_brand_name || "—"}</td>
                <td style={{ padding: "2px 8px", color: "#6b7280" }}>{r.eff_group || "—"}</td>
                <td style={{ padding: "2px 8px", color: "#991b1b" }}>{r.problem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BrandPreviewStats({ preview }) {
  const hasMissing = preview.missing_uid > 0 || preview.missing_name > 0 || preview.missing_group > 0;
  const hasDups    = preview.skipped_existing_uid > 0 || preview.skipped_existing_name > 0;

  return (
    <div className="bulk-create-preview">
      <div className="bulk-create-preview-title">Результат перевірки</div>

      <div className="bulk-create-stat-row">
        <span>Pending рядків у фільтрі</span>
        <strong>{preview.total_pending}</strong>
      </div>

      <div className="bulk-create-divider" />

      <div className="bulk-create-stat-row eligible">
        <span><span className="bulk-create-dot green" />Готові до створення</span>
        <strong className="text-success">{preview.will_create}</strong>
      </div>

      {preview.missing_uid > 0 && (
        <div className="bulk-create-stat-row missing">
          <span><span className="bulk-create-dot gray" />Не вистачає UID</span>
          <strong>{preview.missing_uid}</strong>
        </div>
      )}
      {preview.missing_name > 0 && (
        <div className="bulk-create-stat-row missing">
          <span><span className="bulk-create-dot gray" />Не вистачає назви</span>
          <strong>{preview.missing_name}</strong>
        </div>
      )}
      {preview.missing_group > 0 && (
        <div className="bulk-create-stat-row missing">
          <span><span className="bulk-create-dot gray" />Не вистачає групи</span>
          <strong>{preview.missing_group}</strong>
        </div>
      )}
      {preview.skipped_existing_uid > 0 && (
        <div className="bulk-create-stat-row skipped">
          <span><span className="bulk-create-dot orange" />Дублікати UID</span>
          <strong className="text-warning">{preview.skipped_existing_uid}</strong>
        </div>
      )}
      {preview.skipped_existing_name > 0 && (
        <div className="bulk-create-stat-row skipped">
          <span><span className="bulk-create-dot orange" />Дублікати назви</span>
          <strong className="text-warning">{preview.skipped_existing_name}</strong>
        </div>
      )}

      {hasMissing && (
        <div className="bulk-fill-warning" style={{ marginTop: 10 }}>
          Заповніть відсутні поля через кнопку «Заповнити» або виправте mapping/import.
        </div>
      )}

      <ExamplesTable title="Проблемні рядки" rows={preview.examples?.missing} />
      <ExamplesTable title="Дублікати" rows={preview.examples?.duplicates} />

      {!hasMissing && !hasDups && preview.will_create === 0 && (
        <div className="bulk-fill-warning" style={{ marginTop: 12 }}>
          Немає рядків готових до створення.
        </div>
      )}
    </div>
  );
}

function BrandBulkCreateModal({ filters, sources, masters, onClose, onSuccess }) {
  const [preview,  setPreview]  = useState(null);
  const [loadingP, setLoadingP] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState(null);

  const noFilter = !hasBrandFilter(filters);

  const handlePreview = async () => {
    setLoadingP(true); setError(null); setPreview(null);
    try {
      const res = await bulkCreatePreview({ filters: buildFillApiFilters(filters) });
      if (res.status === "ok") setPreview(res);
      else setError(res.message || "Помилка перевірки");
    } catch {
      setError("Помилка перевірки");
    } finally {
      setLoadingP(false);
    }
  };

  const handleApply = async () => {
    if (!preview || !preview.can_apply) return;
    setApplying(true); setError(null);
    try {
      const res = await bulkCreateApply({ filters: buildFillApiFilters(filters), confirm: true });
      if (res.status === "ok") onSuccess(res);
      else setError(res.message || "Помилка створення");
    } catch {
      setError("Помилка створення");
    } finally {
      setApplying(false);
    }
  };

  const canApply = preview?.can_apply && !applying;

  return (
    <Modal title="Масове створення master-брендів" onClose={onClose} size="large">
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        Створює master-бренди тільки для pending рядків поточної вибірки після перевірки
        обов'язкових полів: UID, назва, група.
      </div>

      <BrandFilterContext filters={filters} sources={sources} masters={masters} />

      {noFilter && (
        <div className="bulk-fill-warning" style={{ marginTop: 12 }}>
          Масове створення недоступне без активного фільтра. Звузьте вибірку та спробуйте знову.
        </div>
      )}

      {!noFilter && (
        <>
          {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}

          {preview && <BrandPreviewStats preview={preview} />}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button variant="secondary" onClick={handlePreview} disabled={loadingP}>
              {loadingP ? "Перевірка..." : "Перевірити"}
            </Button>
            <Button variant="primary" onClick={handleApply} disabled={!canApply}>
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

// ── CreateParentModal ─────────────────────────────────────────────────────────

function CreateParentModal({ row, onClose, onSuccess }) {
  const [brandGroup, setBrandGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);

  const parentUid  = row.source_parent_uid  || "";
  const parentName = row.source_parent_name || "";

  const handleCreate = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await createParentBrand(row.source_id, row.source_brand_id, brandGroup.trim() || null);
      onSuccess(res);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка створення parent бренду");
    } finally { setBusy(false); }
  };

  const inputS = {
    display: "block", width: "100%", padding: "6px 8px", marginTop: 3,
    border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 28, maxWidth: 480, width: "90%",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>Створити parent бренд</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        <div style={{ padding: "10px 14px", background: "#fef3c7", border: "1px solid #fbbf24",
                      borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          <div><strong>Дочірній бренд:</strong> {row.source_brand_name} <span style={{ color: "#9ca3af" }}>[{row.source_brand_id}]</span></div>
          <div style={{ marginTop: 4, color: "#92400e" }}>
            Parent uid <code>{parentUid}</code> відсутній в dim_brand — буде створений.
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            UID parent бренду
            <input value={parentUid} disabled
                   style={{ ...inputS, background: "#f9fafb", color: "#6b7280" }} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Назва parent бренду
            <input value={parentName} disabled
                   style={{ ...inputS, background: "#f9fafb", color: "#6b7280" }} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Група бренду (необов'язково)
            <input value={brandGroup} onChange={e => setBrandGroup(e.target.value)}
                   placeholder="Введіть групу для parent бренду..."
                   style={inputS} />
          </label>
        </div>

        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 12 }}>{err}</div>
        )}

        {!parentUid && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 12 }}>
            Рядок не містить source_parent_uid — неможливо створити parent.
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleCreate}
            disabled={busy || !parentUid || !parentName}
            style={{ padding: "7px 20px", background: "#d97706", color: "#fff",
                     border: "none", borderRadius: 4, cursor: "pointer",
                     fontSize: 13, fontWeight: 600, opacity: (!parentUid || !parentName) ? 0.5 : 1 }}>
            {busy ? "..." : "Створити parent"}
          </button>
          <button onClick={onClose} className="btn btn-secondary">Скасувати</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function BrandSourceMappingPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [data,          setData]         = useState(null);
  const [masters,       setMasters]      = useState([]);
  const [loading,       setLoading]      = useState(false);
  const [autoBinding,   setAutoBinding]  = useState(false);
  const [showBulkFill,  setShowBulkFill]  = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bindRow,       setBindRow]      = useState(null);
  const [bindMode,      setBindMode]     = useState("bind");
  const [parentRow,     setParentRow]    = useState(null);
  const [error,         setError]        = useState(null);
  const [success,       setSuccess]      = useState(null);

  // Filters
  const [sourceId,       setSourceId]      = useState("");
  const [sourceGroup,    setSourceGroup]   = useState("");
  const [masterBrandId,  setMasterBrandId] = useState("");
  const [statusFilter,   setStatusFilter]  = useState("pending");
  const [computedStatus, setComputedStatus] = useState("");
  const [sourceChanged,  setSourceChanged] = useState(false);
  const [filterCompany,  setFilterCompany] = useState("");
  const [filterLevel,    setFilterLevel]   = useState("");
  const [filterActive,   setFilterActive]  = useState("");
  const [search,         setSearch]        = useState("");
  const [searchInput,    setSearchInput]   = useState("");
  const [page,           setPage]          = useState(1);
  const PAGE_SIZE = 100;

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true); setError(null);
    const params = { page, page_size: PAGE_SIZE };
    if (sourceId)       params.source_id       = sourceId;
    if (statusFilter)   params.mapping_status  = statusFilter;
    if (sourceGroup)    params.brand_group     = sourceGroup;
    if (masterBrandId)  params.master_brand_id = masterBrandId;
    if (search)         params.search          = search;
    if (computedStatus) params.computed_status = computedStatus;
    if (sourceChanged)  params.source_changed  = true;
    if (filterCompany)  params.company         = filterCompany;
    if (filterLevel)    params.source_level    = filterLevel;
    if (filterActive)   params.source_is_active = filterActive;

    getStagedBrands(params)
      .then(setData)
      .catch(() => setError("Помилка завантаження"))
      .finally(() => setLoading(false));
  }, [page, sourceId, sourceGroup, masterBrandId, statusFilter, search,
      computedStatus, sourceChanged, filterCompany, filterLevel, filterActive]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getMasterBrands().then(setMasters).catch(() => {});
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleBind = async (source_id, source_brand_id, master_brand_id) => {
    await bindBrand(source_id, source_brand_id, master_brand_id);
    setSuccess("Бренд прив'язано");
    load();
  };

  const handleReject = async (row) => {
    if (!window.confirm(`Відхилити "${row.source_brand_name}"?`)) return;
    setError(null);
    try {
      await rejectBrand(row.source_id, row.source_brand_id);
      setSuccess("Бренд відхилено");
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка");
    }
  };

  const handleAutoBind = async () => {
    setAutoBinding(true); setError(null); setSuccess(null);
    try {
      const res = await autoBindBrands(sourceId ? Number(sourceId) : null);
      setSuccess(`Авто-прив'язка: ${res.auto_bound} брендів прив'язано за точним збігом brand_uid.`);
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка авто-прив'язки");
    } finally { setAutoBinding(false); }
  };

  const handleCreateAndBind = async (payload) => {
    await createAndBindBrand(payload);
    setSuccess("Створено master-бренд і прив'язано до source brand");
    load();
    getMasterBrands().then(setMasters).catch(() => {});
  };

  const handleCreateMasterFromMapping = async (row) => {
    setError(null);
    try {
      const res = await createMasterFromMapping(row.source_id, row.source_brand_id);
      setSuccess(`Створено master-бренд «${res.brand_name}» і прив'язано`);
      load();
      getMasterBrands().then(setMasters).catch(() => {});
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка створення master-бренду");
    }
  };

  const handleUnmap = async (row) => {
    if (!window.confirm(`Скинути прив'язку для "${row.source_brand_name}"?`)) return;
    setError(null);
    try {
      await unmapBrand(row.source_id, row.source_brand_id);
      setSuccess("Прив'язку скинуто — статус повернено у «Очікує»");
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка скидання прив'язки");
    }
  };

  const handleCreateParentBrandSuccess = (res) => {
    setParentRow(null);
    setSuccess(`Створено parent бренд «${res.brand_name}» [${res.brand_uid}]. Рядок тепер готовий до прив'язки.`);
    getMasterBrands().then(setMasters).catch(() => {});
    load();
  };

  const handleBulkFillSuccess = (res) => {
    setShowBulkFill(false);
    setSuccess(
      `Оновлено: ${res.updated_masters} master-брендів, ${res.updated_staging} pending записів.`
    );
    load();
  };

  const handleBulkCreateSuccess = (res) => {
    setShowBulkCreate(false);
    setSuccess(
      `Створено master-брендів: ${res.created}, прив'язано: ${res.bound}, пропущено (вже є): ${res.skipped}.`
    );
    load();
    getMasterBrands().then(setMasters).catch(() => {});
  };

  const handleSearch = () => { setPage(1); setSearch(searchInput); };

  const handleFilterStatus = (s) => { setStatusFilter(s); setPage(1); };
  const handleFilterSource = (v) => { setSourceId(v); setPage(1); };
  const handleComputedStatus = (s) => { setComputedStatus(s === computedStatus ? "" : s); setPage(1); };
  const handleSourceChanged = () => { setSourceChanged(v => !v); setPage(1); };

  // ── Render ─────────────────────────────────────────────────────────────────

  const sources      = data?.sources       || [];
  const sourceGroups = data?.source_groups || [];
  const actionsDisabled = statusFilter === "rejected";

  const brandFilters = {
    filterSource:      sourceId,
    filterBrandGroup:  sourceGroup,
    filterMasterBrand: masterBrandId,
    filterStatus:      statusFilter,
    search,
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* Bind modal */}
      {bindRow && (
        <BindModal
          row={bindRow}
          masters={masters}
          onBind={handleBind}
          onCreate={handleCreateAndBind}
          onClose={() => { setBindRow(null); setBindMode("bind"); }}
          initialMode={bindMode}
        />
      )}

      {/* Bulk fill modal */}
      {showBulkFill && (
        <BrandBulkFillModal
          filters={brandFilters}
          sources={sources}
          masters={masters}
          onClose={() => setShowBulkFill(false)}
          onSuccess={handleBulkFillSuccess}
        />
      )}

      {/* Bulk create modal */}
      {showBulkCreate && (
        <BrandBulkCreateModal
          filters={brandFilters}
          sources={sources}
          masters={masters}
          onClose={() => setShowBulkCreate(false)}
          onSuccess={handleBulkCreateSuccess}
        />
      )}

      {/* Create parent modal */}
      {parentRow && (
        <CreateParentModal
          row={parentRow}
          onClose={() => setParentRow(null)}
          onSuccess={handleCreateParentBrandSuccess}
        />
      )}

      <h2 style={{ marginBottom: 4, fontSize: 20, fontWeight: 700 }}>Відповідність брендів / НГ</h2>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 4 }}>
        Прив'язка source brands (dim_brand_source) до master dim_brand
      </p>
      <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 20 }}>
        «Очікує» — ще не прив'язано до master. «Можна створити» — достатньо даних для створення нового master-бренду.
      </p>

      {/* Alerts */}
      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>{error}</span>
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

      {/* KPI compact pill row */}
      {data && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <KpiPill label="Всього"      value={data.total}                color="#374151" />
          <span style={{ color: "#e5e7eb" }}>|</span>
          <KpiPill label="Очікує"      value={data.pending}              color="#92400e"
                   active={statusFilter === "pending"}
                   onClick={() => handleFilterStatus(statusFilter === "pending" ? "" : "pending")} />
          <KpiPill label="Прив'язано"  value={data.mapped}               color="#065f46"
                   active={statusFilter === "mapped"}
                   onClick={() => handleFilterStatus(statusFilter === "mapped" ? "" : "mapped")} />
          <KpiPill label="Авто"        value={data.auto_bound ?? 0}      color="#1e40af"
                   active={statusFilter === "auto"}
                   onClick={() => handleFilterStatus(statusFilter === "auto" ? "" : "auto")} />
          <KpiPill label="Відхилено"   value={data.rejected}             color="#991b1b"
                   active={statusFilter === "rejected"}
                   onClick={() => handleFilterStatus(statusFilter === "rejected" ? "" : "rejected")} />
          {(data.source_changed_count ?? 0) > 0 && (
            <>
              <span style={{ color: "#e5e7eb" }}>|</span>
              <KpiPill label="Змінено з джерела" value={data.source_changed_count} color="#1d4ed8"
                       active={sourceChanged}
                       onClick={handleSourceChanged} />
            </>
          )}
        </div>
      )}

      {/* Filters + actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {/* Source filter */}
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Джерело</div>
          <select
            value={sourceId}
            onChange={e => handleFilterSource(e.target.value)}
            style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                     fontSize: 13, minWidth: 160 }}>
            <option value="">Всі джерела</option>
            {sources.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Source group filter */}
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Група (джерело)</div>
          <select
            value={sourceGroup}
            onChange={e => { setSourceGroup(e.target.value); setPage(1); }}
            style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                     fontSize: 13, minWidth: 150 }}>
            <option value="">Всі групи</option>
            {sourceGroups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {/* Master brand filter */}
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Master бренд</div>
          <select
            value={masterBrandId}
            onChange={e => { setMasterBrandId(e.target.value); setPage(1); }}
            style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                     fontSize: 13, minWidth: 180 }}>
            <option value="">Всі master-бренди</option>
            {masters.map(m => (
              <option key={m.id} value={m.id}>
                {m.brand_name}{m.brand_uid ? ` [${m.brand_uid}]` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Статус</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { val: "",         label: "Всі" },
              { val: "pending",  label: "Очікує" },
              { val: "mapped",   label: "Прив'язано" },
              { val: "auto",     label: "Авто" },
              { val: "rejected", label: "Відхилено" },
            ].map(f => (
              <button key={f.val} onClick={() => handleFilterStatus(f.val)}
                style={{
                  padding: "5px 12px", fontSize: 12, border: "1px solid #d1d5db",
                  borderRadius: 4, cursor: "pointer",
                  background: statusFilter === f.val ? "var(--primary)" : "#fff",
                  color:      statusFilter === f.val ? "#fff" : "#374151",
                  fontWeight: statusFilter === f.val ? 700 : 400,
                }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Computed status filter */}
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Діагностика</div>
          <select
            value={computedStatus}
            onChange={e => { setComputedStatus(e.target.value); setPage(1); }}
            style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                     fontSize: 13, minWidth: 160 }}>
            <option value="">Всі статуси</option>
            <option value="ready_to_create">Готово створити</option>
            <option value="parent_missing">Немає parent</option>
            <option value="duplicate_id">Дублікат UID</option>
            <option value="source_changed">Змінено</option>
          </select>
        </div>

        {/* Source changed toggle */}
        <div style={{ alignSelf: "flex-end" }}>
          <button
            onClick={handleSourceChanged}
            style={{
              padding: "6px 12px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 4,
              cursor: "pointer", whiteSpace: "nowrap",
              background: sourceChanged ? "#eff6ff" : "#fff",
              color:      sourceChanged ? "#1d4ed8" : "#374151",
              fontWeight: sourceChanged ? 700 : 400,
              borderColor: sourceChanged ? "#3b82f6" : "#d1d5db",
            }}>
            ↻ Тільки змінені
          </button>
        </div>

        {/* Company filter */}
        {(data?.companies?.length > 0) && (
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Компанія</div>
            <select
              value={filterCompany}
              onChange={e => { setFilterCompany(e.target.value); setPage(1); }}
              style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                       fontSize: 13, minWidth: 140 }}>
              <option value="">Всі компанії</option>
              {(data.companies || []).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}

        {/* Source level filter */}
        {(data?.levels?.length > 0) && (
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Рівень</div>
            <select
              value={filterLevel}
              onChange={e => { setFilterLevel(e.target.value); setPage(1); }}
              style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                       fontSize: 13, minWidth: 120 }}>
              <option value="">Всі рівні</option>
              {(data.levels || []).map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        )}

        {/* Active filter */}
        {(data?.active_values?.length > 0) && (
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Активний</div>
            <select
              value={filterActive}
              onChange={e => { setFilterActive(e.target.value); setPage(1); }}
              style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                       fontSize: 13, minWidth: 110 }}>
              <option value="">Всі</option>
              {(data.active_values || []).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}

        {/* Search */}
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>Пошук</div>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Назва або ID бренду..."
              style={{ padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 4,
                       fontSize: 13, width: 200 }}
            />
          </div>
          <button onClick={handleSearch}
            style={{ padding: "6px 14px", background: "#f3f4f6", border: "1px solid #d1d5db",
                     borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
            🔍
          </button>
          {search && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              style={{ padding: "6px 10px", background: "none", border: "1px solid #d1d5db",
                       borderRadius: 4, cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
              ✕
            </button>
          )}
        </div>

        <button onClick={load} disabled={loading}
          style={{ padding: "6px 12px", background: "#f3f4f6", border: "1px solid #d1d5db",
                   borderRadius: 4, cursor: "pointer", fontSize: 13, alignSelf: "flex-end" }}>
          {loading ? "..." : "↻"}
        </button>
      </div>

      {/* Action buttons row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#6b7280", marginRight: 2 }}>Дії:</span>

        {/* Auto-bind */}
        <button
          onClick={handleAutoBind}
          disabled={autoBinding || actionsDisabled}
          title="Прив'язати за точним збігом brand_uid"
          style={{ padding: "6px 14px", background: "#eff6ff", border: "1px solid #3b82f6",
                   borderRadius: 4, cursor: actionsDisabled ? "not-allowed" : "pointer",
                   fontSize: 13, color: "#1e40af", fontWeight: 600,
                   opacity: actionsDisabled ? 0.45 : 1 }}>
          {autoBinding ? "..." : "⚡ Авто (uid)"}
        </button>

        {/* Bulk fill */}
        <button
          onClick={() => setShowBulkFill(true)}
          disabled={actionsDisabled}
          title="Масове заповнення полів бренду"
          style={{ padding: "6px 14px", background: "#f0fdf4", border: "1px solid #86efac",
                   borderRadius: 4, cursor: actionsDisabled ? "not-allowed" : "pointer",
                   fontSize: 13, color: "#065f46", fontWeight: 600,
                   opacity: actionsDisabled ? 0.45 : 1 }}>
          🔗 Заповнити
        </button>

        {/* Bulk create */}
        <button
          onClick={() => setShowBulkCreate(true)}
          disabled={actionsDisabled}
          title="Масове створення master-брендів в dim_brand"
          style={{ padding: "6px 14px", background: "#fefce8", border: "1px solid #fde047",
                   borderRadius: 4, cursor: actionsDisabled ? "not-allowed" : "pointer",
                   fontSize: 13, color: "#713f12", fontWeight: 600,
                   opacity: actionsDisabled ? 0.45 : 1 }}>
          ➕ Створити master-бренди
        </button>

        {actionsDisabled && (
          <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>
            (недоступно для фільтра «Відхилено»)
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thS}>Джерело</th>
              <th style={thS}>Source Brand ID</th>
              <th style={thS}>Назва (джерело)</th>
              <th style={thS}>Група</th>
              <th style={thS}>Рівень</th>
              <th style={thS}>Компанія</th>
              <th style={thS}>Актив.</th>
              <th style={thS}>Метадані</th>
              <th style={thS}>Статус / Діагн.</th>
              <th style={thS}>Master бренд</th>
              <th style={{ ...thS, width: 160, textAlign: "center" }}>Дії</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>
                Завантаження...
              </td></tr>
            )}
            {!loading && (!data?.rows || data.rows.length === 0) && (
              <tr><td colSpan={11} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>
                {statusFilter === "pending"
                  ? "Немає pending брендів — всі прив'язані або відхилені"
                  : "Немає даних за обраними фільтрами"}
              </td></tr>
            )}
            {!loading && data?.rows?.map(row => (
              <tr key={`${row.source_id}-${row.source_brand_id}`}
                  style={{ borderBottom: "1px solid #f3f4f6",
                           background: row.mapping_status === "rejected" ? "#fef2f2"
                                     : row.mapping_status === "mapped"   ? "#f0fdf4"
                                     : row.mapping_status === "auto"     ? "#eff6ff"
                                     : undefined }}>
                <td style={tdS}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{row.source_name || row.source_id}</span>
                </td>
                <td style={tdS}>
                  <code style={{ fontSize: 10, background: "#f9fafb", padding: "1px 5px",
                                 borderRadius: 3, color: "#374151" }}>
                    {row.source_brand_id}
                  </code>
                </td>
                <td style={{ ...tdS, fontWeight: 500 }}>{row.source_brand_name || "—"}</td>
                <td style={{ ...tdS, color: "#6b7280", fontSize: 11 }}>{row.source_brand_group || "—"}</td>
                <td style={{ ...tdS, color: "#6b7280", fontSize: 11 }}>{row.source_level || "—"}</td>
                <td style={{ ...tdS, color: "#6b7280", fontSize: 11 }}>{row.source_company_name || "—"}</td>
                <td style={{ ...tdS, fontSize: 11 }}>
                  {row.source_is_active !== undefined && row.source_is_active !== null && row.source_is_active !== ""
                    ? <span style={{ color: ["true","1","yes"].includes(String(row.source_is_active).toLowerCase()) ? "#059669" : "#6b7280" }}>
                        {row.source_is_active}
                      </span>
                    : <span style={{ color: "#d1d5db" }}>—</span>}
                </td>
                <td style={{ ...tdS, maxWidth: 200 }}>
                  <ExtraFieldsChips fields={row.extra_fields} />
                </td>
                <td style={tdS}>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                    <StatusBadge status={row.mapping_status} />
                    <ComputedStatusBadge
                      computedStatus={row.computed_status}
                      mappingStatus={row.mapping_status}
                    />
                  </div>
                  {row.source_changed && (() => {
                    const fields = Array.isArray(row.changed_fields) ? row.changed_fields : [];
                    const prev   = row.previous_snapshot || {};
                    const tip = fields.length
                      ? fields.map(f => `${f}: «${prev[f] ?? "—"}»`).join(", ")
                      : "";
                    return (
                      <div
                        title={tip ? `Змінені поля: ${tip}` : "Змінено в джерелі"}
                        style={{ fontSize: 10, color: "#1d4ed8", marginTop: 3, fontWeight: 600,
                                 cursor: tip ? "help" : "default" }}>
                        ↻ змінено{fields.length > 0 && (
                          <span style={{ fontWeight: 400, marginLeft: 3, color: "#60a5fa" }}>
                            ({fields.join(", ")})
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td style={tdS}>
                  {row.exists_in_master ? (
                    <div>
                      <span style={{ fontWeight: 600, color: "#1e40af" }}>{row.master_brand_name}</span>
                      {row.master_brand_uid && (
                        <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>
                          [{row.master_brand_uid}]
                        </span>
                      )}
                      {row.confidence < 100 && (
                        <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 6 }}>
                          ~{Math.round(row.confidence)}%
                        </span>
                      )}
                    </div>
                  ) : row.is_ready_for_create ? (
                    <div>
                      <span style={{ color: "#6b7280", fontSize: 11 }}>Буде створено:</span>
                      <span style={{ fontWeight: 600, color: "#059669", marginLeft: 4 }}>
                        {row.effective_brand_name}
                      </span>
                      {row.effective_brand_group && (
                        <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>
                          · {row.effective_brand_group}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span style={{ color: "#9ca3af", fontSize: 12 }}>Немає master</span>
                      {row.mapping_status !== "rejected" && (
                        <div style={{ fontSize: 10, color: "#d97706", marginTop: 1 }}>
                          {!row.effective_brand_name && !row.effective_brand_group
                            ? "Не вистачає: назва, група"
                            : !row.effective_brand_name
                              ? "Не вистачає: назва"
                              : !row.effective_brand_group
                                ? "Не вистачає: група"
                                : null}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td style={{ ...tdS, textAlign: "center" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                    {row.mapping_status !== "rejected" && (
                      <button
                        onClick={() => { setBindMode("bind"); setBindRow(row); }}
                        style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600,
                                 background: "#eff6ff", border: "1px solid #3b82f6",
                                 borderRadius: 4, cursor: "pointer", color: "#1e40af",
                                 whiteSpace: "nowrap" }}>
                        {row.exists_in_master ? "Змінити" : "Прив'язати"}
                      </button>
                    )}
                    {row.is_ready_for_create && (
                      <button
                        onClick={() => handleCreateMasterFromMapping(row)}
                        style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600,
                                 background: "#f0fdf4", border: "1px solid #34d399",
                                 borderRadius: 4, cursor: "pointer", color: "#065f46",
                                 whiteSpace: "nowrap" }}>
                        Створити
                      </button>
                    )}
                    {row.computed_status === "parent_missing" && (
                      <button
                        onClick={() => setParentRow(row)}
                        title={`Створити parent бренд [${row.source_parent_uid}] у dim_brand`}
                        style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600,
                                 background: "#fef3c7", border: "1px solid #fbbf24",
                                 borderRadius: 4, cursor: "pointer", color: "#92400e",
                                 whiteSpace: "nowrap" }}>
                        + Parent
                      </button>
                    )}
                    {row.exists_in_master && (
                      <button
                        onClick={() => handleUnmap(row)}
                        title="Скинути прив'язку до pending"
                        style={{ padding: "3px 8px", fontSize: 11,
                                 background: "#f9fafb", border: "1px solid #d1d5db",
                                 borderRadius: 4, cursor: "pointer", color: "#6b7280",
                                 whiteSpace: "nowrap" }}>
                        ✕
                      </button>
                    )}
                    {row.mapping_status !== "rejected" && (
                      <button
                        onClick={() => handleReject(row)}
                        style={{ padding: "3px 8px", fontSize: 11,
                                 background: "#fef2f2", border: "1px solid #fca5a5",
                                 borderRadius: 4, cursor: "pointer", color: "#991b1b",
                                 whiteSpace: "nowrap" }}>
                        Відхилити
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", fontSize: 13 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 12 }}>
            ← Назад
          </button>
          <span style={{ color: "#6b7280" }}>
            Стор. {page} / {Math.ceil(data.total / PAGE_SIZE)} — показано {data.rows?.length} з {data.total}
          </span>
          <button onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
            className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 12 }}>
            Далі →
          </button>
        </div>
      )}
    </div>
  );
}
