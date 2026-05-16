import React, { useEffect, useRef, useState } from "react";

import Button from "../components/ui/Button";
import SearchableSelect from "../components/ui/SearchableSelect";
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
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Нова стаття PnL</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="ext-context-row">
          <span>Зовн. код: <strong>{item.ext_code || "—"}</strong></span>
          <span>Зовн. назва: <strong>{item.ext_name || "—"}</strong></span>
        </div>

        {existingArticle && (
          <div className="existing-warning" style={{ marginBottom: 12 }}>
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
              <span style={{ color: "#c0392b", fontSize: 12, marginTop: 3 }}>
                Оберіть структуру PnL
              </span>
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
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Скасувати</button>
          <button
            className="btn btn-primary"
            onClick={doCreateAndMap}
            disabled={saving || !canSubmit}
          >
            {saving ? "Збереження..." : "Створити статтю і маппінг"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PnlImportPage() {
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

  // import settings
  const [importType, setImportType] = useState("plan");
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
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Імпорт PnL</h2>
            <p>Завантаження планових або фактичних даних з Google Sheets / Excel / CSV.</p>
          </div>
        </div>

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
                  <div className="preview-scroll" style={{ marginTop: 6 }}>
                    <table className="data-table preview-table">
                      <thead>
                        <tr>{testResult.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {testResult.rows_preview.map((row, i) => (
                          <tr key={i}>
                            {testResult.columns.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
              <div className="preview-scroll">
                <table className="data-table preview-table">
                  <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i}>{columns.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
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
              <div className="field-row">
                <label>Тип імпорту *</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" value="plan" checked={importType === "plan"} onChange={() => setImportType("plan")} />
                    &nbsp;План
                  </label>
                  <label className="radio-label">
                    <input type="radio" value="fact" checked={importType === "fact"} onChange={() => setImportType("fact")} />
                    &nbsp;Факт
                  </label>
                </div>
              </div>
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
            <div className="result-summary">
              <div className="result-stat ok">
                <span className="result-num">{importResult.candidates}</span>
                <span className="result-label">готово до імпорту</span>
              </div>
              <div className="result-stat skip">
                <span className="result-num">{importResult.skipped}</span>
                <span className="result-label">пропущено</span>
              </div>
              <div className="result-stat total">
                <span className="result-num">{importResult.total_rows}</span>
                <span className="result-label">всього рядків</span>
              </div>
            </div>

            {importResult.errors && importResult.errors.length > 0 && (
              <div className="errors-block">
                <p className="errors-title">
                  Помилки ({importResult.errors.length}{importResult.errors.length >= 200 ? "+" : ""}):
                </p>
                <table className="data-table errors-table">
                  <thead>
                    <tr><th>Рядок</th><th>Тип помилки</th><th>Значення</th></tr>
                  </thead>
                  <tbody>
                    {importResult.errors.map((e, i) => (
                      <tr key={i}>
                        <td>{e.row}</td>
                        <td>{ERROR_LABELS[e.type] || e.type}</td>
                        <td>{e.value || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <div className="result-summary">
              <div className="result-stat ok">
                <span className="result-num">{commitResult.imported}</span>
                <span className="result-label">збережено</span>
              </div>
              <div className="result-stat skip">
                <span className="result-num">{commitResult.skipped}</span>
                <span className="result-label">пропущено</span>
              </div>
              <div className="result-stat total">
                <span className="result-num">{commitResult.total_rows}</span>
                <span className="result-label">всього рядків</span>
              </div>
            </div>
            {commitResult.imported > 0 && (
              <div style={{ color: "#27ae60", fontWeight: 600, marginTop: 8 }}>
                ✓ Дані успішно записані в базу
              </div>
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
      </section>

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

      <style>{`
        .import-section {
          margin-bottom: 28px;
          padding-bottom: 24px;
          border-bottom: 1px solid #f0f0f0;
        }
        .import-section:last-child { border-bottom: none; }

        .section-title {
          font-size: 15px;
          font-weight: 600;
          color: #2c3e50;
          margin: 0 0 14px 0;
        }

        .section-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .section-title-row .section-title { margin: 0; }

        .mapping-actions { display: flex; align-items: center; gap: 10px; }

        .mapping-status {
          font-size: 12px;
          padding: 3px 8px;
          border-radius: 10px;
          font-weight: 500;
        }
        .mapping-status.ok    { background: #eafaf1; color: #27ae60; border: 1px solid #a9dfbf; }
        .mapping-status.unsaved { background: #fef9e7; color: #b7950b; border: 1px solid #f9e79f; }

        .mapping-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 500;
          white-space: nowrap;
        }
        .mapping-badge.saved   { background: #eafaf1; color: #27ae60; border: 1px solid #a9dfbf; }
        .mapping-badge.unsaved { background: #fef5e4; color: #b7950b; border: 1px solid #f9e79f; }

        .field-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .field-row label {
          min-width: 220px;
          font-size: 14px;
          color: #555;
          flex-shrink: 0;
        }
        .field-row input[type="text"],
        .field-row input[type="file"],
        .field-row select {
          flex: 1;
          max-width: 480px;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        }
        .field-row input:focus,
        .field-row select:focus {
          outline: none;
          border-color: #3498db;
          box-shadow: 0 0 4px rgba(52,152,219,0.2);
        }

        .preview-scroll {
          overflow-x: auto;
          max-height: 240px;
          overflow-y: auto;
          border: 1px solid #eee;
          border-radius: 4px;
          margin-top: 8px;
        }
        .preview-table th,
        .preview-table td { white-space: nowrap; font-size: 12px; padding: 6px 10px !important; }

        .col-map-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 24px;
          max-width: 860px;
        }
        .col-map-row { display: flex; align-items: center; gap: 10px; }
        .col-map-label {
          min-width: 210px;
          font-size: 14px;
          color: #444;
          flex-shrink: 0;
        }
        .col-map-label .required { color: #e74c3c; }
        .col-map-row select {
          flex: 1;
          padding: 7px 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
          min-width: 0;
        }
        .col-map-row select:focus { outline: none; border-color: #3498db; }

        .hint { font-size: 12px; color: #888; margin-top: 10px; max-width: 700px; line-height: 1.5; }

        .settings-grid { max-width: 480px; }
        .radio-group { display: flex; gap: 20px; }
        .radio-label { display: flex; align-items: center; font-size: 14px; cursor: pointer; }
        .run-row { margin-top: 16px; }

        .result-summary { display: flex; gap: 24px; margin-bottom: 20px; }
        .result-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px 24px;
          border-radius: 8px;
          min-width: 100px;
        }
        .result-stat.ok    { background: #eafaf1; }
        .result-stat.skip  { background: #fef9e7; }
        .result-stat.total { background: #eaf2fd; }
        .result-num { font-size: 28px; font-weight: 700; line-height: 1; }
        .result-stat.ok    .result-num { color: #27ae60; }
        .result-stat.skip  .result-num { color: #e67e22; }
        .result-stat.total .result-num { color: #2980b9; }
        .result-label { font-size: 12px; color: #777; margin-top: 4px; }

        .errors-block { margin-top: 8px; }
        .errors-title { font-size: 13px; font-weight: 600; color: #c0392b; margin-bottom: 8px; }
        .errors-table th,
        .errors-table td { font-size: 13px; padding: 6px 12px !important; }

        .error-message {
          padding: 12px;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          color: #c33;
          margin-bottom: 16px;
          font-size: 14px;
        }

        /* Commit block */
        .commit-block { margin-top: 16px; }
        .existing-warning {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding: 10px 14px;
          background: #fff8e1;
          border: 1px solid #ffe082;
          border-radius: 4px;
          color: #795548;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .replace-checkbox { display: flex; align-items: center; cursor: pointer; font-weight: 500; }
        .replace-hint { color: #999; font-size: 12px; }
        .result-stat.success { background: #eafaf1; }

        /* Source info box */
        .source-info-box {
          margin: 10px 0 4px;
          padding: 10px 14px;
          background: #eaf4fd;
          border: 1px solid #b3d7f0;
          border-radius: 6px;
          font-size: 13px;
          color: #1a5276;
          max-width: 600px;
        }
        .source-info-list {
          margin: 4px 0 0 16px;
          padding: 0;
          line-height: 1.7;
        }

        /* Quick mapping */
        .qmap-section { background: #fafbfc; border-radius: 6px; padding: 20px; border: 1px solid #e8edf2; }
        .qmap-section-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 6px;
        }
        .qmap-section-header .section-title { margin: 0; }
        .qmap-source-badge {
          font-size: 12px;
          padding: 3px 10px;
          background: #fff3cd;
          border: 1px solid #ffe082;
          border-radius: 12px;
          color: #856404;
          white-space: nowrap;
        }
        .qmap-block { margin-bottom: 24px; }
        .qmap-title { font-size: 14px; font-weight: 600; color: #2c3e50; margin: 0 0 10px 0; }
        .qmap-table th,
        .qmap-table td { font-size: 13px; padding: 7px 12px !important; vertical-align: middle; }
        .qmap-select {
          width: 100%;
          min-width: 200px;
          padding: 6px 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
        }
        .qmap-select:focus { outline: none; border-color: #3498db; }
        .qmap-row-error { font-size: 11px; color: #c33; margin-top: 3px; }
        .qmap-saved td { color: #888; }
        .qmap-ok { color: #27ae60 !important; font-weight: 500; }

        .no-sources-hint {
          margin: 4px 0 8px;
          padding: 10px 14px;
          background: #fff8e1;
          border: 1px solid #ffe082;
          border-radius: 4px;
          color: #795548;
          font-size: 13px;
        }

        .ext-context-row {
          display: flex;
          gap: 24px;
          padding: 8px 12px;
          background: #f4f6f8;
          border-radius: 6px;
          font-size: 13px;
          color: #555;
          margin-bottom: 14px;
        }
        .ext-context-row strong { color: #222; }

        /* OLAP mode badge */
        .olap-mode-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 10px;
        }
        .olap-mode-badge.ssas { background: #e8f4fd; color: #1a5276; border: 1px solid #aed6f1; }
        .olap-mode-badge.sql  { background: #eafaf1; color: #1e8449; border: 1px solid #a9dfbf; }

        /* OLAP source info block */
        .olap-source-info {
          margin: 8px 0 12px;
          padding: 12px 16px;
          background: #f0f4ff;
          border: 1px solid #c5d3f0;
          border-radius: 6px;
          max-width: 680px;
        }
        .olap-info-row {
          display: flex;
          gap: 10px;
          margin-bottom: 6px;
          font-size: 13px;
          align-items: flex-start;
        }
        .olap-info-row:last-child { margin-bottom: 0; }
        .olap-info-label {
          min-width: 130px;
          color: #5c6b8a;
          font-weight: 500;
          flex-shrink: 0;
        }
        .olap-info-value { color: #1a2a4a; }
        .olap-query-row { flex-direction: column; gap: 4px; }
        .olap-query-preview {
          margin: 0;
          padding: 8px 10px;
          background: #e8edf8;
          border-radius: 4px;
          font-size: 12px;
          font-family: monospace;
          color: #1a2a4a;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 100px;
          overflow-y: auto;
        }
        .olap-warn {
          padding: 8px 10px;
          background: #fff3cd;
          border: 1px solid #ffe082;
          border-radius: 4px;
          font-size: 13px;
          color: #856404;
        }

        /* OLAP test result block */
        .olap-test-result {
          margin: 10px 0 14px;
          padding: 12px 16px;
          border-radius: 6px;
          max-width: 760px;
          font-size: 13px;
        }
        .olap-test-result.ok   { background: #eafaf1; border: 1px solid #a9dfbf; }
        .olap-test-result.fail { background: #fdf2f2; border: 1px solid #f5c6cb; }
        .olap-test-header {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 10px;
        }
        .olap-test-result.ok   .olap-test-header { color: #1e8449; }
        .olap-test-result.fail .olap-test-header { color: #c0392b; }
        .olap-test-section { margin-bottom: 8px; color: #333; }
        .olap-drivers-list,
        .olap-attempts-list {
          margin: 4px 0 0 16px;
          padding: 0;
          line-height: 1.7;
        }
        .attempt-ok   { color: #1e8449; }
        .attempt-fail { color: #c0392b; }
        .olap-test-error {
          margin-top: 8px;
          padding: 8px 10px;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          color: #c33;
          font-size: 12px;
          word-break: break-word;
        }
        .olap-test-install {
          margin-top: 10px;
          padding: 10px 12px;
          background: #fff8e1;
          border: 1px solid #ffe082;
          border-radius: 4px;
          color: #795548;
          font-size: 12px;
          line-height: 1.8;
        }
        .olap-test-install code {
          background: #f1f1f1;
          padding: 1px 5px;
          border-radius: 3px;
          font-family: monospace;
        }
      `}</style>
    </>
  );
}

export default PnlImportPage;
