import React, { useEffect, useRef, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";
import SalesFactImportTab from "./SalesFactImportTab";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";
import DataCard from "../components/layout/DataCard";
import KPIGrid from "../components/layout/KPIGrid";
import DataTable from "../components/table/DataTable";
import { getImportSources } from "../api/importSourcesApi";
import {
  previewSource,
  validateImport,
  commitImport,
  testOlapConnection,
  getPnlColumnMapping,
  savePnlColumnMapping,
  createArticleMapping,
  createDepartmentMapping,
} from "../api/pnlImportApi";
import { getReferenceArticles, getReferenceDepartments } from "../api/referenceApi";
import { createArticle } from "../api/articlesApi";
import { getPnlStructures } from "../api/pnlStructureApi";

const EMPTY_MAPPING = {
  period_col: "",
  dept_code_col: "",
  dept_name_col: "",
  article_code_col: "",
  article_name_col: "",
  amount_col: "",
  comment_col: "",
};

const ERROR_LABELS = {
  department_not_mapped: "Підрозділ не знайдено в маппінгу",
  department_ambiguous_mapping: "Підрозділ неоднозначний (кілька збігів)",
  department_not_found_in_dim: "Підрозділ відсутній у довіднику",
  article_not_mapped: "Стаття не знайдена в маппінгу",
  article_ambiguous_mapping: "Стаття неоднозначна (кілька збігів)",
  article_not_found_in_dim: "Стаття відсутня у довіднику",
  missing_period: "Порожній період",
  invalid_amount: "Некоректна сума",
};

// Extract unique unmapped items from errors
function extractUnmapped(errors, type) {
  const seen = new Set();
  const result = [];
  for (const e of errors) {
    if (e.type !== type) continue;
    const key = `${e.ext_code || ""}|${e.ext_name || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ext_code: e.ext_code || "", ext_name: e.ext_name || "" });
    }
  }
  return result;
}

// Single quick-mapping row
function QuickMapRow({ item, options, getOptionValue, getOptionLabel, getSearchText, onSave, saving, onCreateArticle, isAutoSaved }) {
  const { canEdit } = usePagePermission("pnlImport");

  const [selectedId, setSelectedId] = useState("");
  const [saved, setSaved] = useState(false);
  const [rowError, setRowError] = useState(null);

  const handleSave = async () => {
    if (!selectedId) return;
    setRowError(null);
    try {
      await onSave(item, selectedId);
      setSaved(true);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setRowError(Array.isArray(detail) ? detail.map((e) => e.msg).join("; ") : (detail || "Помилка збереження"));
    }
  };

  if (saved || isAutoSaved) {
    return (
      <tr className="qmap-row qmap-saved">
        <td>{item.ext_code || "—"}</td>
        <td>{item.ext_name || "—"}</td>
        <td colSpan={onCreateArticle ? 3 : 2} className="qmap-ok">✓ Збережено</td>
      </tr>
    );
  }

  return (
    <tr className="qmap-row">
      <td>{item.ext_code || "—"}</td>
      <td>{item.ext_name || "—"}</td>
      <td>
        <SearchableSelect
          options={options}
          value={selectedId}
          onChange={setSelectedId}
          getOptionValue={getOptionValue}
          getOptionLabel={getOptionLabel}
          getSearchText={getSearchText}
          placeholder="— пошук —"
        />
        {rowError && <div className="qmap-row-error">{rowError}</div>}
      </td>
      <td>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!selectedId || saving}
        >
          Зберегти
        </Button>
      </td>
      {onCreateArticle && (
        <td>
          <Button variant="secondary" onClick={() => onCreateArticle(item)}>
            + Створити статтю
          </Button>
        </td>
      )}
    </tr>
  );
}

function CreateArticleModal({ item, sourceId, articleTypes, refArticles, pnlStructures, onClose, onSuccess }) {
  const [form, setForm] = useState({
    article_name: item.ext_name || "",
    article_type: "",
    level1: item.ext_name || "",
    level2: "",
    pnl_id: null,
  });
  const [pnlError, setPnlError] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Check if article with this ext_code already exists as article_id
  const existingArticle = refArticles.find(
    (a) => String(a.article_id) === String(item.ext_code)
  );

  const pnlIdValid = form.pnl_id && Number(form.pnl_id) !== 0;
  const canSubmit = form.article_name.trim() && pnlIdValid;

  const doCreateAndMap = async () => {
    if (!form.article_name.trim()) { setError("Введіть назву статті"); return; }
    if (!pnlIdValid) { setPnlError(true); return; }
    setSaving(true);
    setError(null);
    setPnlError(false);
    try {
      // Backend returns existing article if article_id already exists
      const res = await createArticle({
        article_id: item.ext_code,
        article_name: form.article_name.trim(),
        article_type: form.article_type,
        level1: form.level1,
        level2: form.level2,
        pnl_id: Number(form.pnl_id),
      });
      const article = res.article;
      await createArticleMapping({
        source_id: sourceId,
        source_article_id: item.ext_code,
        source_article_name: item.ext_name,
        article_id: article.article_id,
        comment: "",
      });
      onSuccess(article);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((e) => e.msg).join("; ") : (detail || "Помилка збереження"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Нова стаття PnL" onClose={onClose}>
      <div className="ext-context-row">
        <span>Зовн. код: <strong>{item.ext_code || "—"}</strong></span>
        <span>Зовн. назва: <strong>{item.ext_name || "—"}</strong></span>
      </div>

      {existingArticle && (
        <div className="existing-warning">
          ℹ Стаття з кодом «{item.ext_code}» вже існує ({existingArticle.article_name}).
          При збереженні буде створено тільки маппінг.
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="form-grid">
        <div className="form-field full">
          <label>Назва статті *</label>
          <input
            value={form.article_name}
            onChange={(e) => setForm({ ...form, article_name: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label>Тип статті</label>
          <select value={form.article_type} onChange={(e) => setForm({ ...form, article_type: e.target.value })}>
            <option value="">— не вказано —</option>
            {articleTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            {articleTypes.length === 0 && (
              <>
                <option value="Дохід">Дохід</option>
                <option value="Витрати">Витрати</option>
              </>
            )}
          </select>
        </div>
        <div className="form-field">
          <label>PnL ID *</label>
          <SearchableSelect
            options={pnlStructures}
            value={form.pnl_id || ""}
            onChange={(val) => { setForm({ ...form, pnl_id: val || null }); setPnlError(false); }}
            getOptionValue={(p) => String(p.id)}
            getOptionLabel={(p) => `${p.pnl_code || p.id} — ${p.pnl_name}`}
            placeholder="-- Оберіть PnL структуру --"
          />
          {pnlError && (
            <span className="field-error">Оберіть структуру PnL</span>
          )}
        </div>
        <div className="form-field">
          <label>Level 1</label>
          <input value={form.level1} onChange={(e) => setForm({ ...form, level1: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Level 2</label>
          <input value={form.level2} onChange={(e) => setForm({ ...form, level2: e.target.value })} />
        </div>
      </div>

      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Скасувати</Button>
        <Button
          variant="primary"
          onClick={doCreateAndMap}
          disabled={saving || !canSubmit}
        >
          {saving ? "Збереження..." : "Створити статтю і маппінг"}
        </Button>
      </div>
    </Modal>
  );
}

const IMPORT_TYPE_OPTIONS = [
  { code: "pnl_plan",    label: "PnL — План",       desc: "Планові дані по статтях PnL",        icon: "📋" },
  { code: "pnl_fact",    label: "PnL — Факт",        desc: "Фактичні дані по статтях PnL",       icon: "📊" },
  { code: "sales_fact",  label: "Факт продажів",     desc: "Товарооборот з OLAP / SQL / Excel",  icon: "🛒" },
];

function PnlImportPage() {
  const [importTypeCode, setImportTypeCode] = useState(null);
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);

  // reference data for quick mapping
  const [refDepts, setRefDepts] = useState([]);
  const [refArticles, setRefArticles] = useState([]);
  const [pnlStructures, setPnlStructures] = useState([]);

  // source input
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  // preview
  const [columns, setColumns] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [sheetNames, setSheetNames] = useState([]);

  // saved column mapping
  const [savedMapping, setSavedMapping] = useState(null);
  const [colMap, setColMap] = useState(EMPTY_MAPPING);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);

  // import settings — derived from top-level type selection
  const importType = importTypeCode === "pnl_fact" ? "fact" : "plan";
  const [scenario, setScenario] = useState("");
  const [versionName, setVersionName] = useState("");

  // result
  const [importResult, setImportResult] = useState(null);   // validate result
  const [commitResult, setCommitResult] = useState(null);   // commit result
  const [replaceExisting, setReplaceExisting] = useState(false);

  // quick mapping state
  const [savingQuickMap, setSavingQuickMap] = useState(false);

  // create-article modal
  const [createArticleFor, setCreateArticleFor] = useState(null);
  const [autoSavedArticleKeys, setAutoSavedArticleKeys] = useState(new Set());

  // ui
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [loadingTest, setLoadingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      getImportSources(),
      getReferenceArticles(),
      getReferenceDepartments(),
      getPnlStructures(),
    ]).then(([src, art, dept, pnl]) => {
      setSources(src);
      setRefArticles(art);
      setRefDepts(dept);
      setPnlStructures(pnl);
    }).catch(() => setError("Помилка завантаження довідників"));
  }, []);

  const isGoogleSheets = selectedSource?.source_type === "google_sheets";
  const isOlap = ["olap_ssas_dax", "sql_odbc", "olap_sql"].includes(
    selectedSource?.source_type
  );
  const isSsasDax = selectedSource?.source_type === "olap_ssas_dax";

  const loadSavedMapping = async (sourceId) => {
    if (!sourceId) { setSavedMapping(null); return; }
    try {
      const data = await getPnlColumnMapping(sourceId);
      setSavedMapping(data || null);
    } catch {
      setSavedMapping(null);
    }
  };

  const handleSourceChange = (e) => {
    const id = e.target.value;
    setSelectedSourceId(id);
    const src = sources.find((s) => String(s.id) === id) || null;
    setSelectedSource(src);
    setSheetUrl(src?.source_url || "");
    setSheetName("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    resetPreview();
    loadSavedMapping(id);
  };

  const handleTypeSelect = (code) => {
    setImportTypeCode(code);
    setSelectedSourceId("");
    setSelectedSource(null);
    setSheetUrl("");
    setSheetName("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setScenario("");
    setVersionName("");
    resetPreview();
  };

  const resetPreview = () => {
    setColumns([]);
    setPreviewRows([]);
    setTotalRows(0);
    setPreviewLoaded(false);
    setSheetNames([]);
    setColMap(EMPTY_MAPPING);
    setMappingSaved(false);
    setImportResult(null);
    setCommitResult(null);
    setTestResult(null);
    setError(null);
  };

  const applyMappingToColumns = (availableColumns, mapping) => {
    if (!mapping) return EMPTY_MAPPING;
    const colSet = new Set(availableColumns);
    return {
      period_col:       colSet.has(mapping.period_col)       ? mapping.period_col       : "",
      dept_code_col:    colSet.has(mapping.dept_code_col)    ? mapping.dept_code_col    : "",
      dept_name_col:    colSet.has(mapping.dept_name_col)    ? mapping.dept_name_col    : "",
      article_code_col: colSet.has(mapping.article_code_col) ? mapping.article_code_col : "",
      article_name_col: colSet.has(mapping.article_name_col) ? mapping.article_name_col : "",
      amount_col:       colSet.has(mapping.amount_col)       ? mapping.amount_col       : "",
      comment_col:      colSet.has(mapping.comment_col)      ? mapping.comment_col      : "",
    };
  };

  const handleLoadColumns = async () => {
    if (!selectedSource) { setError("Оберіть джерело"); return; }
    setError(null);
    setLoadingPreview(true);
    setColumns([]); setPreviewRows([]); setTotalRows(0);
    setPreviewLoaded(false); setSheetNames([]);
    setColMap(EMPTY_MAPPING); setMappingSaved(false); setImportResult(null);

    try {
      const fd = new FormData();
      if (isOlap) {
        fd.append("source_type", selectedSource.source_type);
        fd.append("source_id", selectedSourceId);
      } else if (isGoogleSheets) {
        fd.append("source_type", "google_sheets");
        fd.append("sheet_url", sheetUrl);
        if (sheetName) fd.append("sheet_name", sheetName);
      } else {
        if (!file) { setError("Оберіть файл"); setLoadingPreview(false); return; }
        fd.append("source_type", "file");
        fd.append("file", file);
        if (sheetName) fd.append("sheet_name", sheetName);
      }

      const res = await previewSource(fd);
      const cols = res.columns || [];
      setColumns(cols);
      setPreviewRows(res.preview_rows || []);
      setTotalRows(res.total_rows || 0);
      setPreviewLoaded(true);
      setSheetNames(res.sheet_names || []);

      if (savedMapping) {
        const applied = applyMappingToColumns(cols, savedMapping);
        setColMap(applied);
        setMappingSaved(true);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Помилка читання джерела");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!selectedSourceId) return;
    setSavingMapping(true);
    try {
      await savePnlColumnMapping(selectedSourceId, colMap);
      setSavedMapping({ ...colMap });
      setMappingSaved(true);
    } catch {
      setError("Помилка збереження маппінгу");
    } finally {
      setSavingMapping(false);
    }
  };

  const buildFormData = () => {
    const fd = new FormData();
    fd.append("source_id", selectedSourceId);
    fd.append("import_type", importType);
    fd.append("scenario", scenario);
    fd.append("version_name", versionName);
    if (isOlap) {
      fd.append("source_type", selectedSource.source_type);
    } else if (isGoogleSheets) {
      fd.append("source_type", "google_sheets");
      fd.append("sheet_url", sheetUrl);
      if (sheetName) fd.append("sheet_name", sheetName);
    } else {
      fd.append("source_type", "file");
      fd.append("file", file);
      if (sheetName) fd.append("sheet_name", sheetName);
    }
    fd.append("period_col", colMap.period_col);
    fd.append("dept_code_col", colMap.dept_code_col);
    fd.append("dept_name_col", colMap.dept_name_col);
    fd.append("article_code_col", colMap.article_code_col);
    fd.append("article_name_col", colMap.article_name_col);
    fd.append("amount_col", colMap.amount_col);
    fd.append("comment_col", colMap.comment_col);
    return fd;
  };

  const validateColumns = () => {
    if (!colMap.period_col || !colMap.amount_col) {
      setError("Обов'язково вкажіть колонки: Період та Сума");
      return false;
    }
    if (!colMap.dept_code_col && !colMap.dept_name_col) {
      setError("Вкажіть хоча б одну колонку підрозділу");
      return false;
    }
    if (!colMap.article_code_col && !colMap.article_name_col) {
      setError("Вкажіть хоча б одну колонку статті");
      return false;
    }
    return true;
  };

  const handleRunImport = async () => {
    if (!validateColumns()) return;
    setError(null);
    setImportResult(null);
    setCommitResult(null);
    setReplaceExisting(false);
    setLoadingImport(true);
    try {
      const res = await validateImport(buildFormData());
      setImportResult(res);
    } catch (err) {
      setError(err.response?.data?.detail || "Помилка перевірки");
    } finally {
      setLoadingImport(false);
    }
  };

  const handleCommitImport = async () => {
    if (!validateColumns()) return;
    setError(null);
    setCommitResult(null);
    setLoadingCommit(true);
    try {
      const fd = buildFormData();
      fd.append("replace_existing", replaceExisting ? "true" : "false");
      const res = await commitImport(fd);
      setCommitResult(res);
    } catch (err) {
      setError(err.response?.data?.detail || "Помилка збереження");
    } finally {
      setLoadingCommit(false);
    }
  };

  // Quick mapping handlers
  const handleSaveDeptMapping = async (item, internalId) => {
    setSavingQuickMap(true);
    try {
      await createDepartmentMapping({
        source_id: selectedSourceId,
        external_department_code: item.ext_code,
        external_department_name: item.ext_name,
        internal_department_id: internalId,
      });
    } finally {
      setSavingQuickMap(false);
    }
  };

  const handleSaveArticleMapping = async (item, internalId) => {
    setSavingQuickMap(true);
    try {
      await createArticleMapping({
        source_id: selectedSourceId,
        source_article_id: item.ext_code,
        source_article_name: item.ext_name,
        article_id: internalId,
        comment: "",
      });
    } finally {
      setSavingQuickMap(false);
    }
  };

  const handleCreateArticleSuccess = (newArticle) => {
    setRefArticles((prev) => {
      const exists = prev.find((a) => a.article_id === newArticle.article_id);
      return exists ? prev : [...prev, newArticle];
    });
    const item = createArticleFor;
    setAutoSavedArticleKeys((prev) => new Set([...prev, `${item.ext_code}|${item.ext_name}`]));
    setCreateArticleFor(null);
  };

  const handleTestConnection = async () => {
    if (!selectedSourceId) return;
    setLoadingTest(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await testOlapConnection(selectedSourceId);
      setTestResult(res);
    } catch (err) {
      setTestResult({ connection_ok: false, error: err.response?.data?.detail || "Помилка запиту" });
    } finally {
      setLoadingTest(false);
    }
  };

  const articleTypes = [...new Set(refArticles.map((a) => a.article_type).filter(Boolean))];

  const colOption = (label, field, required = false) => (
    <div className="col-map-row" key={field}>
      <span className="col-map-label">
        {label}{required && <span className="required"> *</span>}
      </span>
      <select
        value={colMap[field]}
        onChange={(e) => { setColMap({ ...colMap, [field]: e.target.value }); setMappingSaved(false); }}
      >
        <option value="">— не вказано —</option>
        {columns.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );

  const unmappedDepts = importResult
    ? extractUnmapped(importResult.errors || [], "department_not_mapped")
    : [];
  const unmappedArticles = importResult
    ? extractUnmapped(importResult.errors || [], "article_not_mapped")
    : [];

  return (
    <>
      {/* ── КРОК 0: Вибір типу імпорту ───────────────────────────────────── */}
      <div className="import-type-selector">
        <p className="import-type-heading">Що імпортуємо?</p>
        <div className="import-type-grid">
          {IMPORT_TYPE_OPTIONS.map((t) => (
            <button
              key={t.code}
              className={`import-type-card${importTypeCode === t.code ? " active" : ""}`}
              onClick={() => handleTypeSelect(t.code)}
            >
              <span className="import-type-card-icon">{t.icon}</span>
              <span className="import-type-card-label">{t.label}</span>
              <span className="import-type-card-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Факт продажів — окремий движок ───────────────────────────────── */}
      {importTypeCode === "sales_fact" && <SalesFactImportTab />}

      {/* ── PnL Plan / Fact — існуючий движок ────────────────────────────── */}
      {(importTypeCode === "pnl_plan" || importTypeCode === "pnl_fact") && (
      <>
      <DataCard
        title={importTypeCode === "pnl_plan" ? "Імпорт PnL — План" : "Імпорт PnL — Факт"}
        subtitle="Завантаження даних з Google Sheets / Excel / CSV / OLAP."
      >
        {error && <div className="error-message">{error}</div>}

        {/* ── STEP 1: SOURCE ─────────────────────────────────────────────── */}
        <div className="import-section">
          <h3 className="section-title">1. Джерело даних</h3>

          <div className="field-row">
            <label>Джерело імпорту *</label>
            <select value={selectedSourceId} onChange={handleSourceChange}>
              <option value="">Оберіть джерело...</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.source_name} ({s.source_type})</option>
              ))}
            </select>
            {selectedSourceId && savedMapping && (
              <span className="mapping-badge saved">маппінг збережено</span>
            )}
            {selectedSourceId && !savedMapping && (
              <span className="mapping-badge unsaved">маппінг не збережено</span>
            )}
          </div>

          {selectedSource && (
            <div className="source-info-box">
              Вибране джерело <strong>{selectedSource.source_name}</strong> використовується для:
              <ul className="source-info-list">
                <li>імпорту PnL даних</li>
                <li>створення мапінгу статей</li>
                <li>створення мапінгу підрозділів</li>
              </ul>
            </div>
          )}

          {selectedSource && isOlap && (
            <div className="olap-source-info">
              {isSsasDax && (
                <div className="olap-mode-badge ssas">
                  SSAS Tabular / DAX — PowerShell + ADOMD.NET (OLE DB)
                </div>
              )}
              {selectedSource.source_type === "sql_odbc" && (
                <div className="olap-mode-badge sql">
                  SQL Server / ODBC — потрібен ODBC Driver 17 або 18
                </div>
              )}
              <div className="olap-info-row">
                <span className="olap-info-label">Сервер:</span>
                <span className="olap-info-value">
                  {selectedSource.db_server || "—"}
                  {selectedSource.db_port ? `:${selectedSource.db_port}` : ""}
                </span>
              </div>
              {selectedSource.db_database && (
                <div className="olap-info-row">
                  <span className="olap-info-label">База даних:</span>
                  <span className="olap-info-value">{selectedSource.db_database}</span>
                </div>
              )}
              {selectedSource.db_cube_model && (
                <div className="olap-info-row">
                  <span className="olap-info-label">Куб / Модель:</span>
                  <span className="olap-info-value">{selectedSource.db_cube_model}</span>
                </div>
              )}
              {selectedSource.db_query && (
                <div className="olap-info-row olap-query-row">
                  <span className="olap-info-label">SQL/MDX запит:</span>
                  <pre className="olap-query-preview">{selectedSource.db_query}</pre>
                </div>
              )}
              {!selectedSource.db_query && (
                <div className="olap-warn">SQL/MDX запит не налаштовано. Відредагуйте джерело у «Відповідність імпорту».</div>
              )}
            </div>
          )}

          {/* ── OLAP: test connection button + result ── */}
          {selectedSource && isOlap && (
            <div className="field-row" style={{ marginTop: 8 }}>
              <Button
                variant="secondary"
                onClick={handleTestConnection}
                disabled={loadingTest}
              >
                {loadingTest ? "Перевірка..." : "Перевірити підключення"}
              </Button>
            </div>
          )}

          {testResult && (
            <div className={`olap-test-result ${testResult.connection_ok ? "ok" : "fail"}`}>
              <div className="olap-test-header">
                {testResult.connection_ok
                  ? `Підключення OK — ${testResult.driver_used}`
                  : "Підключення не вдалось"}
              </div>

              {/* SSAS transport info */}
              {testResult.ssas_transport && (
                <div className="olap-test-section">
                  <strong>Транспорт SSAS:</strong>{" "}
                  <span style={{ color: "#1a5276" }}>{testResult.ssas_transport}</span>
                </div>
              )}
              {testResult.ps_script_exists === false && (
                <div className="olap-test-section" style={{ color: "#c0392b" }}>
                  <strong>PowerShell script не знайдено:</strong>{" "}
                  <code>{testResult.ps_script}</code><br />
                  Переконайтесь, що <code>tools/read_ssas_dax.ps1</code> є в директорії backend.
                  <br />
                  ADOMD.NET docs:{" "}
                  <a href="https://learn.microsoft.com/en-us/analysis-services/client-libraries"
                     target="_blank" rel="noreferrer">
                    Microsoft Analysis Services client libraries
                  </a>
                </div>
              )}

              {/* SQL Server ODBC drivers (sql_odbc sources) */}
              {testResult.mssql_drivers_found && testResult.mssql_drivers_found.length > 0 && (
                <div className="olap-test-section">
                  <strong>SQL Server ODBC драйвери:</strong>{" "}
                  {testResult.mssql_drivers_found.join(", ")}
                </div>
              )}

              {testResult.attempts && testResult.attempts.length > 0 && !testResult.connection_ok && (
                <div className="olap-test-section">
                  <strong>Спроби:</strong>
                  <ul className="olap-attempts-list">
                    {testResult.attempts.map((a, i) => (
                      <li key={i} className={a.ok ? "attempt-ok" : "attempt-fail"}>
                        {a.driver}: {a.ok ? "OK" : a.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {testResult.connection_ok && testResult.columns && (
                <div className="olap-test-section">
                  <strong>Колонки:</strong> {testResult.columns.join(", ")}
                </div>
              )}

              {testResult.connection_ok && testResult.rows_preview && testResult.rows_preview.length > 0 && (
                <div className="olap-test-section">
                  <strong>Перші {testResult.rows_preview.length} рядки:</strong>
                  <div className="preview-table-wrap">
                    <DataTable
                      columns={testResult.columns.map((c) => ({ key: c, header: c }))}
                      rows={testResult.rows_preview}
                      rowKey={(_, i) => i}
                    />
                  </div>
                </div>
              )}

              {testResult.error && (
                <div className="olap-test-error">{testResult.error}</div>
              )}

              {!testResult.pyodbc_available && (
                <div className="olap-test-install">
                  SQL ODBC: <code>pip install pyodbc</code> або запустіть <code>install_olap.bat</code>.
                </div>
              )}
            </div>
          )}

          {selectedSource && isGoogleSheets && (
            <>
              <div className="field-row">
                <label>Посилання на Google Sheet *</label>
                <input value={sheetUrl} onChange={(e) => { setSheetUrl(e.target.value); resetPreview(); }}
                  placeholder="https://docs.google.com/spreadsheets/d/..." />
              </div>
              <div className="field-row">
                <label>Лист (Sheet)</label>
                {sheetNames.length > 1 ? (
                  <select value={sheetName} onChange={(e) => { setSheetName(e.target.value); resetPreview(); }}>
                    <option value="">— перший лист —</option>
                    {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <input value={sheetName} onChange={(e) => { setSheetName(e.target.value); resetPreview(); }}
                    placeholder="Sheet1 (якщо не перший)" />
                )}
              </div>
            </>
          )}

          {selectedSource && !isGoogleSheets && !isOlap && (
            <>
              <div className="field-row">
                <label>Файл (.xlsx або .csv) *</label>
                <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef}
                  onChange={(e) => { setFile(e.target.files[0] || null); setSheetName(""); resetPreview(); }} />
              </div>
              {sheetNames.length > 1 && (
                <div className="field-row">
                  <label>Лист Excel</label>
                  <select value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
                    <option value="">— активний лист —</option>
                    {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {sheetName && (
                    <Button variant="secondary" onClick={handleLoadColumns} disabled={loadingPreview} style={{ marginLeft: 8 }}>
                      Перезавантажити
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {selectedSource && (
            <div className="field-row">
              <Button variant="secondary" onClick={handleLoadColumns} disabled={loadingPreview}>
                {loadingPreview
                  ? "Читання..."
                  : isOlap
                    ? "Отримати дані з OLAP"
                    : "Завантажити колонки"}
              </Button>
            </div>
          )}
        </div>

        {/* ── STEP 2: PREVIEW ────────────────────────────────────────────── */}
        {previewLoaded && (
          <div className="import-section">
            <h3 className="section-title">2. Знайдено колонок: {columns.length} / рядків: {totalRows}</h3>
            {previewRows.length > 0 && (
              <div className="preview-table-wrap">
                <DataTable
                  columns={columns.map((c) => ({ key: c, header: c }))}
                  rows={previewRows}
                  rowKey={(_, i) => i}
                />
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: COLUMN MAPPING ─────────────────────────────────────── */}
        {previewLoaded && (
          <div className="import-section">
            <div className="section-title-row">
              <h3 className="section-title">3. Маппінг колонок</h3>
              <div className="mapping-actions">
                {mappingSaved
                  ? <span className="mapping-status ok">Маппінг збережено</span>
                  : <span className="mapping-status unsaved">Зміни не збережено</span>}
                <Button variant="secondary" onClick={handleSaveMapping} disabled={savingMapping}>
                  {savingMapping ? "Збереження..." : "Зберегти маппінг колонок"}
                </Button>
              </div>
            </div>
            <div className="col-map-grid">
              {colOption("Період", "period_col", true)}
              {colOption("Код підрозділу (зовн.)", "dept_code_col")}
              {colOption("Назва підрозділу (зовн.)", "dept_name_col")}
              {colOption("Код статті (зовн.)", "article_code_col")}
              {colOption("Назва статті (зовн.)", "article_name_col")}
              {colOption("Сума", "amount_col", true)}
              {colOption("Коментар", "comment_col")}
            </div>
            <p className="hint">
              Потрібен хоча б один ідентифікатор підрозділу (код або назва) і один ідентифікатор
              статті (код або назва).
            </p>
          </div>
        )}

        {/* ── STEP 4: IMPORT SETTINGS ────────────────────────────────────── */}
        {previewLoaded && (
          <div className="import-section">
            <h3 className="section-title">4. Параметри імпорту</h3>
            <div className="settings-grid">
              {importType === "plan" && (
                <>
                  <div className="field-row">
                    <label>Сценарій</label>
                    <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                      <option value="">— не вказано —</option>
                      <option value="План">План</option>
                      <option value="Прогноз">Прогноз</option>
                      <option value="Факт">Факт</option>
                      <option value="Коригування">Коригування</option>
                    </select>
                  </div>
                  <div className="field-row">
                    <label>Версія</label>
                    <select value={versionName} onChange={(e) => setVersionName(e.target.value)}>
                      <option value="">— не вказано —</option>
                      <option value="Базова">Базова</option>
                      <option value="V1">V1</option>
                      <option value="V2">V2</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="run-row">
              <Button variant="primary" onClick={handleRunImport} disabled={loadingImport}>
                {loadingImport ? "Перевірка..." : `Перевірити імпорт (${totalRows} рядків)`}
              </Button>
            </div>
          </div>
        )}

        {/* ── VALIDATE RESULT ────────────────────────────────────────────── */}
        {importResult && (
          <div className="import-section">
            <h3 className="section-title">Результат перевірки</h3>
            <KPIGrid cards={[
              { label: "Готово до імпорту", value: importResult.candidates, variant: "ok" },
              { label: "Пропущено",         value: importResult.skipped,    variant: "skip" },
              { label: "Всього рядків",     value: importResult.total_rows, variant: "total" },
            ]} />

            {importResult.errors && importResult.errors.length > 0 && (
              <div className="errors-block">
                <p className="errors-title">
                  Помилки ({importResult.errors.length}{importResult.errors.length >= 200 ? "+" : ""}):
                </p>
                <div className="preview-table-wrap">
                  <DataTable
                    columns={[
                      { key: "row",    header: "Рядок" },
                      { key: "_type",  header: "Тип помилки", render: (row) => ERROR_LABELS[row.type] || row.type },
                      { key: "value",  header: "Значення",    render: (row) => row.value || "—" },
                    ]}
                    rows={importResult.errors}
                    rowKey={(_, i) => i}
                  />
                </div>
              </div>
            )}

            {importResult.candidates > 0 && (
              <div className="commit-block">
                {importResult.existing_count > 0 && (
                  <div className="existing-warning">
                    ⚠ У базі вже є <strong>{importResult.existing_count}</strong> рядків для цих
                    {importType === "plan" ? " (period + scenario + version)" : " period"}.
                    <label className="replace-checkbox">
                      <input
                        type="checkbox"
                        checked={replaceExisting}
                        onChange={(e) => setReplaceExisting(e.target.checked)}
                      />
                      &nbsp;Замінити існуючі дані
                    </label>
                    {!replaceExisting && (
                      <span className="replace-hint"> — якщо не замінити, нові рядки додадуться поверх</span>
                    )}
                  </div>
                )}
                <div className="run-row">
                  <Button
                    variant="success"
                    onClick={handleCommitImport}
                    disabled={loadingCommit}
                  >
                    {loadingCommit ? "Збереження..." : `Зберегти дані в базу (${importResult.candidates} рядків)`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── COMMIT RESULT ──────────────────────────────────────────────── */}
        {commitResult && (
          <div className="import-section">
            <h3 className="section-title">Результат збереження</h3>
            <KPIGrid cards={[
              { label: "Збережено",     value: commitResult.imported,   variant: "ok" },
              { label: "Пропущено",     value: commitResult.skipped,    variant: "skip" },
              { label: "Всього рядків", value: commitResult.total_rows, variant: "total" },
            ]} />
            {commitResult.imported > 0 && (
              <div className="import-success-text">✓ Дані успішно записані в базу</div>
            )}
          </div>
        )}

        {/* ── QUICK MAPPING ──────────────────────────────────────────────── */}
        {importResult && (unmappedDepts.length > 0 || unmappedArticles.length > 0) && (
          <div className="import-section qmap-section">
            <div className="qmap-section-header">
              <h3 className="section-title">Створити відповідності</h3>
              {selectedSource && (
                <span className="qmap-source-badge">
                  Поточне джерело: <strong>{selectedSource.source_name}</strong>
                </span>
              )}
            </div>
            <p className="hint">
              Зіставте зовнішні коди з внутрішніми довідниками, потім повторно запустіть перевірку.
            </p>

            {unmappedDepts.length > 0 && (
              <div className="qmap-block">
                <h4 className="qmap-title">
                  Невідомі підрозділи ({unmappedDepts.length})
                </h4>
                {refDepts.length === 0 ? (
                  <p className="no-sources-hint">Довідник підрозділів порожній. Спочатку заповніть «Підрозділи».</p>
                ) : (
                  <table className="data-table qmap-table">
                    <thead>
                      <tr>
                        <th>Зовн. код</th><th>Зовн. назва</th><th>→ Підрозділ</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmappedDepts.map((item, i) => (
                        <QuickMapRow
                          key={i}
                          item={item}
                          options={refDepts}
                          getOptionValue={(d) => String(d.department_id)}
                          getOptionLabel={(d) => d.department_name}
                          getSearchText={(d) => String(d.department_id)}
                          onSave={handleSaveDeptMapping}
                          saving={savingQuickMap}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {unmappedArticles.length > 0 && (
              <div className="qmap-block">
                <h4 className="qmap-title">
                  Невідомі статті ({unmappedArticles.length})
                </h4>
                <table className="data-table qmap-table">
                  <thead>
                    <tr>
                      <th>Зовн. код</th><th>Зовн. назва</th><th>→ Стаття PnL</th><th></th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmappedArticles.map((item, i) => (
                      <QuickMapRow
                        key={i}
                        item={item}
                        options={refArticles}
                        getOptionValue={(a) => String(a.article_id)}
                        getOptionLabel={(a) => `${a.article_id} — ${a.article_name}`}
                        onSave={handleSaveArticleMapping}
                        saving={savingQuickMap}
                        onCreateArticle={setCreateArticleFor}
                        isAutoSaved={autoSavedArticleKeys.has(`${item.ext_code}|${item.ext_name}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="run-row" style={{ marginTop: 16 }}>
              <Button variant="primary" onClick={handleRunImport} disabled={loadingImport}>
                {loadingImport ? "Перевірка..." : "Повторити перевірку"}
              </Button>
            </div>
          </div>
        )}
      </DataCard>

      {createArticleFor && (
        <CreateArticleModal
          item={createArticleFor}
          sourceId={selectedSourceId}
          articleTypes={articleTypes}
          refArticles={refArticles}
          pnlStructures={pnlStructures}
          onClose={() => setCreateArticleFor(null)}
          onSuccess={handleCreateArticleSuccess}
        />
      )}
      </>
      )}

    </>
  );
}

export default PnlImportPage;
