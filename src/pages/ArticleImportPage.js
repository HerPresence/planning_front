import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import { getImportSources } from "../api/importSourcesApi";
import {
  previewArticlesFromSource,
  saveArticleMappingForSource,
  importArticlesFromSource,
} from "../api/importArticlesApi";

const OLAP_TYPES   = ["olap_ssas_dax", "sql_odbc", "olap_sql"];
const GOOGLE_TYPES = ["google_sheets", "google_sheet"];

const EMPTY_MAPPING = {
  // base
  article_id_col:          "",
  article_name_col:        "",
  article_type_col:        "",
  level1_col:              "",
  level2_col:              "",
  pnl_id_col:              "",
  // extended OLAP fields
  uid_expense_article_col: "",
  expense_element_col:     "",
  expense_company_col:     "",
  level2_olap_col:         "",
  level1_olap_col:         "",
};

// Apply saved mapping; skip values whose column no longer exists in the source
function applyMappingToColumns(columns, saved) {
  const colSet = new Set(columns);
  const pick = (v) => (v && colSet.has(v) ? v : "");
  return {
    article_id_col:          pick(saved.article_id_col),
    article_name_col:        pick(saved.article_name_col),
    article_type_col:        pick(saved.article_type_col),
    level1_col:              pick(saved.level1_col),
    level2_col:              pick(saved.level2_col),
    pnl_id_col:              pick(saved.pnl_id_col),
    uid_expense_article_col: pick(saved.uid_expense_article_col),
    expense_element_col:     pick(saved.expense_element_col),
    expense_company_col:     pick(saved.expense_company_col),
    level2_olap_col:         pick(saved.level2_olap_col),
    level1_olap_col:         pick(saved.level1_olap_col),
  };
}

// Auto-suggest based on keywords in column names (for columns not already mapped)
const AUTO_KEYWORDS = {
  uid_expense_article_col: ["UIDСтаттяВитрат", "UID"],
  expense_element_col:     ["ЕлементВитрат"],
  expense_company_col:     ["Компанія"],
  level2_olap_col:         ["ОсновнийЕлемент"],
  level1_olap_col:         ["СтаттяВитрат"],
};

function autoSuggest(columns, applied) {
  const find = (keywords) =>
    columns.find((c) => keywords.some((k) => c.includes(k))) || "";
  const result = { ...applied };
  for (const [field, keywords] of Object.entries(AUTO_KEYWORDS)) {
    if (!result[field]) result[field] = find(keywords);
  }
  return result;
}


function ArticleImportPage({ setActivePage }) {
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedSource, setSelectedSource]     = useState(null);

  // preview
  const [previewResult, setPreviewResult] = useState(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // mapping
  const [colMap,       setColMap]       = useState(EMPTY_MAPPING);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [savingMap,    setSavingMap]    = useState(false);

  // import
  const [importResult, setImportResult] = useState(null);

  // ui
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport,  setLoadingImport]  = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getImportSources()
      .then(setSources)
      .catch(() => setError("Помилка завантаження джерел імпорту"));
  }, []);

  const isOlap        = OLAP_TYPES.includes(selectedSource?.source_type);
  const isGoogleSheets = GOOGLE_TYPES.includes(selectedSource?.source_type);
  const isSsasDax     = selectedSource?.source_type === "olap_ssas_dax";

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleSourceChange = (e) => {
    const id = e.target.value;
    setSelectedSourceId(id);
    setSelectedSource(sources.find((s) => String(s.id) === id) || null);
    resetAll();
  };

  const resetAll = () => {
    setPreviewResult(null);
    setPreviewLoaded(false);
    setColMap(EMPTY_MAPPING);
    setMappingSaved(false);
    setImportResult(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!selectedSourceId) return;
    setError(null);
    setLoadingPreview(true);
    setPreviewResult(null);
    setPreviewLoaded(false);
    setColMap(EMPTY_MAPPING);
    setMappingSaved(false);
    setImportResult(null);
    try {
      const res = await previewArticlesFromSource(Number(selectedSourceId));
      setPreviewResult(res);
      if (res.status !== "ok") {
        setError(res.message || "Помилка preview");
      } else {
        setPreviewLoaded(true);
        // Apply saved mapping; auto-suggest for unmapped extra fields
        const cols    = res.columns || [];
        const applied = res.saved_mapping
          ? applyMappingToColumns(cols, res.saved_mapping)
          : { ...EMPTY_MAPPING };
        const final   = autoSuggest(cols, applied);
        setColMap(final);
        const hasSaved = Object.values(applied).some(Boolean);
        setMappingSaved(hasSaved);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || String(err));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!selectedSourceId) return;
    setSavingMap(true);
    try {
      await saveArticleMappingForSource(Number(selectedSourceId), colMap);
      setMappingSaved(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "Помилка збереження маппінгу");
    } finally {
      setSavingMap(false);
    }
  };

  const handleImport = async () => {
    if (!selectedSourceId) return;
    if (!colMap.article_id_col) {
      setError("Оберіть колонку для ID статті");
      return;
    }
    if (!colMap.article_name_col) {
      setError("Оберіть колонку для Назви статті");
      return;
    }
    setError(null);
    setLoadingImport(true);
    try {
      const res = await importArticlesFromSource(Number(selectedSourceId), colMap);
      setImportResult(res);
      if (res.status !== "ok") setError(res.message || "Помилка імпорту");
    } catch (err) {
      setError(err?.response?.data?.detail || String(err));
    } finally {
      setLoadingImport(false);
    }
  };

  const handleNewImport = () => {
    resetAll();
    setSelectedSourceId("");
    setSelectedSource(null);
  };

  // ── mapping UI helpers ─────────────────────────────────────────────────────

  const columns = previewResult?.columns || [];

  const colOption = (label, field, required = false) => (
    <div className="col-map-row" key={field}>
      <span className="col-map-label">
        {label}{required && <span className="required"> *</span>}
      </span>
      <select
        value={colMap[field]}
        onChange={(e) => {
          setColMap({ ...colMap, [field]: e.target.value });
          setMappingSaved(false);
        }}
      >
        <option value="">— не вказано —</option>
        {columns.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Імпорт статей PnL</h2>
            <p>Завантаження довідника статей з Google Sheets або OLAP.</p>
          </div>
          <div className="actions-row">
            <Button variant="secondary" onClick={() => setActivePage("articles")}>
              ← До статей
            </Button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* ── 1. ДЖЕРЕЛО ─────────────────────────────────────────────────── */}
        <div className="import-section">
          <h3 className="section-title">1. Джерело даних</h3>

          <div className="field-row">
            <label>Джерело імпорту *</label>
            <select value={selectedSourceId} onChange={handleSourceChange}>
              <option value="">Оберіть джерело...</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.source_name} ({s.source_type})
                </option>
              ))}
            </select>
          </div>

          {selectedSource && (
            <div className="source-info-box">
              Вибране джерело <strong>{selectedSource.source_name}</strong> використовується для:
              <ul className="source-info-list">
                <li>оновлення довідника статей PnL</li>
                <li>синхронізації рівнів та статей витрат</li>
                <li>встановлення типу статті</li>
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
              {selectedSource.db_login && (
                <div className="olap-info-row">
                  <span className="olap-info-label">Логін:</span>
                  <span className="olap-info-value">{selectedSource.db_login}</span>
                </div>
              )}
              {selectedSource.db_query ? (
                <div className="olap-info-row olap-query-row">
                  <span className="olap-info-label">DAX / SQL:</span>
                  <pre className="olap-query-preview">{selectedSource.db_query}</pre>
                </div>
              ) : (
                <div className="olap-warn">
                  DAX/SQL запит не налаштовано. Відредагуйте джерело у «Відповідність імпорту».
                </div>
              )}
            </div>
          )}

          {selectedSource && isGoogleSheets && (
            <div className="olap-source-info">
              <div className="olap-mode-badge google">Google Sheets</div>
              {selectedSource.source_url && (
                <div className="olap-info-row">
                  <span className="olap-info-label">URL:</span>
                  <span className="olap-info-value gs-url">{selectedSource.source_url}</span>
                </div>
              )}
            </div>
          )}

          {selectedSource && (
            <div className="field-row" style={{ marginTop: 12 }}>
              <Button
                variant="secondary"
                onClick={handlePreview}
                disabled={loadingPreview}
              >
                {loadingPreview
                  ? "Завантаження..."
                  : isOlap
                    ? "Отримати дані з OLAP"
                    : "Завантажити колонки"}
              </Button>
            </div>
          )}
        </div>

        {/* ── 2. PREVIEW RESULT ──────────────────────────────────────────── */}
        {previewResult && (
          <div className="import-section">
            <h3 className="section-title">
              2. Знайдено колонок: {previewResult.columns?.length ?? 0} / рядків: {previewResult.total_rows ?? 0}
            </h3>

            {previewResult.status === "ok" && (
              <>
                {previewResult.zero_rows_warning && (
                  <div className="zero-rows-warning">
                    ⚠ Запит виконався, але не повернув жодного рядка.<br />
                    Перевірте DAX/SQL у налаштуваннях джерела або переконайтесь, що модель містить дані.
                  </div>
                )}

                {(previewResult.preview_rows || []).length > 0 && (
                  <div className="preview-scroll">
                    <table className="data-table preview-table">
                      <thead>
                        <tr>
                          {previewResult.columns.map((c) => <th key={c}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {previewResult.preview_rows.map((row, i) => (
                          <tr key={i}>
                            {previewResult.columns.map((c) => (
                              <td key={c}>{String(row[c] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {previewResult.status !== "ok" && previewResult.message && (
              <div className="olap-test-error">{previewResult.message}</div>
            )}
          </div>
        )}

        {/* ── 3. МАППІНГ КОЛОНОК ─────────────────────────────────────────── */}
        {previewLoaded && (
          <div className="import-section">
            <div className="section-title-row">
              <h3 className="section-title">3. Відповідність колонок</h3>
              <div className="mapping-actions">
                {mappingSaved
                  ? <span className="mapping-status ok">Маппінг збережено</span>
                  : <span className="mapping-status unsaved">Зміни не збережено</span>}
                <Button variant="secondary" onClick={handleSaveMapping} disabled={savingMap}>
                  {savingMap ? "Збереження..." : "Зберегти маппінг"}
                </Button>
              </div>
            </div>

            {/* Base fields */}
            <p className="map-group-label">Основні поля</p>
            <div className="col-map-grid">
              {colOption("ID статті",    "article_id_col",   true)}
              {colOption("Назва статті", "article_name_col", true)}
              {colOption("Тип статті",   "article_type_col")}
              {colOption("Level 1",      "level1_col")}
              {colOption("Level 2",      "level2_col")}
              {!isOlap && colOption("PnL ID", "pnl_id_col")}
            </div>
            {isOlap && (
              <p className="hint" style={{ color: "#856404", background: "#fff8e1", padding: "8px 10px", borderRadius: 4, border: "1px solid #ffe082" }}>
                OLAP-статті завантажуються в staging-таблицю <code>dim_article_source</code>.
                PnL ID не потрібен — прив'язка до master-статей виконується окремо на сторінці «Відповідність статей».
              </p>
            )}

            {/* Extended OLAP fields */}
            <p className="map-group-label" style={{ marginTop: 16 }}>
              Розширені поля (статті витрат OLAP)
            </p>
            <div className="col-map-grid">
              {colOption("UID статті витрат",  "uid_expense_article_col")}
              {colOption("Елемент витрат",     "expense_element_col")}
              {colOption("Компанія витрат",    "expense_company_col")}
              {colOption("Level 2 OLAP",       "level2_olap_col")}
              {colOption("Level 1 OLAP",       "level1_olap_col")}
            </div>

            <p className="hint">
              Обов'язкові: ID статті та Назва статті.
              Якщо PnL ID або розширені поля не вказані — існуючі значення у dim_article не змінюються.
              Авто-підказка для полів витрат виконується за ключовими словами колонок OLAP.
            </p>
          </div>
        )}

        {/* ── 4. ІМПОРТ ──────────────────────────────────────────────────── */}
        {previewLoaded && !importResult && (
          <div className="import-section">
            <h3 className="section-title">4. Імпорт статей</h3>
            <p className="hint">
              Upsert усіх рядків з джерела в таблицю <code>dim_article</code>.
              Існуючі записи оновлюються, нові — додаються.
              Незамаплені поля не перезаписуються.
            </p>
            <div className="run-row">
              <Button
                variant="primary"
                onClick={handleImport}
                disabled={loadingImport || !colMap.article_id_col || !colMap.article_name_col}
              >
                {loadingImport
                  ? "Імпортую..."
                  : previewResult?.total_rows
                    ? `Імпортувати статті (~${previewResult.total_rows})`
                    : "Імпортувати статті"}
              </Button>
            </div>
          </div>
        )}

        {/* ── РЕЗУЛЬТАТ ──────────────────────────────────────────────────── */}
        {importResult && importResult.status === "ok" && (
          <div className="import-section">
            <h3 className="section-title">Результат імпорту</h3>

            {importResult.target === "staging" ? (
              <div className="staging-result-banner">
                ✓ Статті завантажено в staging-таблицю <code>dim_article_source</code>.
                Натисніть «Перейти до відповідності» для прив'язки до master-довідника PnL.
                Джерело буде обрано автоматично.
              </div>
            ) : (
              <div style={{ color: "#27ae60", fontWeight: 600, marginBottom: 12 }}>
                ✓ Довідник статей успішно оновлено
              </div>
            )}

            <div className="result-summary">
              <div className="result-stat ok">
                <span className="result-num">{importResult.inserted ?? importResult.imported ?? 0}</span>
                <span className="result-label">{importResult.target === "staging" ? "нових" : "додано"}</span>
              </div>
              <div className="result-stat update">
                <span className="result-num">{importResult.updated}</span>
                <span className="result-label">оновлено</span>
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
                  Помилки рядків ({importResult.errors.length}):
                </p>
                <table className="data-table errors-table">
                  <thead>
                    <tr><th>ID статті</th><th>Помилка</th></tr>
                  </thead>
                  <tbody>
                    {importResult.errors.map((e, i) => (
                      <tr key={i}>
                        <td>{e.article_id || "—"}</td>
                        <td>{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="run-row" style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={handleNewImport}>Новий імпорт</Button>
              {importResult.target === "staging" ? (
                <Button
                  variant="primary"
                  onClick={() =>
                    setActivePage("importSources", { tab: "articles", sourceId: selectedSourceId })
                  }
                >
                  Перейти до відповідності →
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setActivePage("articles")}>
                  До статей PnL
                </Button>
              )}
            </div>
          </div>
        )}
      </section>

      <style>{`
        .import-section {
          margin-bottom: 28px;
          padding-bottom: 24px;
          border-bottom: 1px solid #f0f0f0;
        }
        .import-section:last-child { border-bottom: none; }

        .section-title { font-size: 15px; font-weight: 600; color: #2c3e50; margin: 0 0 14px 0; }
        .section-title-row {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
        }
        .section-title-row .section-title { margin: 0; }
        .mapping-actions { display: flex; align-items: center; gap: 10px; }
        .mapping-status {
          font-size: 12px; padding: 3px 8px; border-radius: 10px; font-weight: 500;
        }
        .mapping-status.ok      { background:#eafaf1; color:#27ae60; border:1px solid #a9dfbf; }
        .mapping-status.unsaved { background:#fef9e7; color:#b7950b; border:1px solid #f9e79f; }

        .field-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .field-row label { min-width: 180px; font-size: 14px; color: #555; flex-shrink: 0; }
        .field-row select {
          flex: 1; max-width: 480px; padding: 8px 12px;
          border: 1px solid #ddd; border-radius: 4px; font-size: 14px;
        }
        .field-row select:focus { outline: none; border-color: #3498db; }

        .source-info-box {
          margin: 10px 0 8px; padding: 10px 14px;
          background: #eaf4fd; border: 1px solid #b3d7f0; border-radius: 6px;
          font-size: 13px; color: #1a5276; max-width: 640px;
        }
        .source-info-list { margin: 4px 0 0 16px; padding: 0; line-height: 1.7; }

        .olap-source-info {
          margin: 8px 0 12px; padding: 12px 16px;
          background: #f0f4ff; border: 1px solid #c5d3f0; border-radius: 6px; max-width: 700px;
        }
        .olap-mode-badge {
          display: inline-block; padding: 3px 10px; border-radius: 10px;
          font-size: 11px; font-weight: 600; margin-bottom: 10px;
        }
        .olap-mode-badge.ssas   { background:#e8f4fd; color:#1a5276; border:1px solid #aed6f1; }
        .olap-mode-badge.google { background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; }

        .olap-info-row {
          display: flex; gap: 10px; margin-bottom: 6px; font-size: 13px; align-items: flex-start;
        }
        .olap-info-row:last-child { margin-bottom: 0; }
        .olap-info-label { min-width: 150px; color: #5c6b8a; font-weight: 500; flex-shrink: 0; }
        .olap-info-value { color: #1a2a4a; }
        .gs-url { word-break: break-all; font-size: 12px; }
        .olap-query-row { flex-direction: column; gap: 4px; }
        .olap-query-preview {
          margin: 0; padding: 8px 10px; background: #e8edf8; border-radius: 4px;
          font-size: 12px; font-family: monospace; color: #1a2a4a;
          white-space: pre; max-height: 110px; overflow-y: auto;
        }
        .olap-warn {
          padding: 8px 10px; background: #fff3cd; border: 1px solid #ffe082;
          border-radius: 4px; font-size: 13px; color: #856404;
        }
        .olap-test-error {
          padding: 8px 10px; background: #fee; border: 1px solid #fcc;
          border-radius: 4px; color: #c33; font-size: 13px; word-break: break-word;
        }

        .preview-scroll {
          overflow-x: auto; max-height: 240px; overflow-y: auto;
          border: 1px solid #eee; border-radius: 4px; margin-top: 6px;
        }
        .preview-table th,
        .preview-table td { white-space: nowrap; font-size: 12px; padding: 5px 10px !important; }

        .zero-rows-warning {
          padding: 10px 14px; background: #fff8e1; border: 1px solid #ffe082;
          border-radius: 4px; color: #795548; font-size: 13px; line-height: 1.7; margin-bottom: 10px;
        }

        /* Mapping grid */
        .map-group-label {
          font-size: 12px; font-weight: 600; color: #5c6b8a;
          text-transform: uppercase; letter-spacing: 0.05em;
          margin: 0 0 8px;
        }
        .col-map-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px;
          max-width: 900px; margin-bottom: 6px;
        }
        .col-map-row { display: flex; align-items: center; gap: 10px; }
        .col-map-label { min-width: 160px; font-size: 14px; color: #444; flex-shrink: 0; }
        .required { color: #e74c3c; }
        .col-map-row select {
          flex: 1; padding: 7px 10px; border: 1px solid #ddd;
          border-radius: 4px; font-size: 13px; min-width: 0;
        }
        .col-map-row select:focus { outline: none; border-color: #3498db; }

        .hint {
          font-size: 12px; color: #888; margin: 8px 0 12px; max-width: 700px; line-height: 1.5;
        }
        .hint code { background: #f1f1f1; padding: 1px 5px; border-radius: 3px; font-family: monospace; }
        .run-row { margin-top: 6px; }

        /* Result */
        .result-summary { display: flex; gap: 20px; margin-bottom: 16px; flex-wrap: wrap; }
        .result-stat {
          display: flex; flex-direction: column; align-items: center;
          padding: 16px 24px; border-radius: 8px; min-width: 100px;
        }
        .result-stat.ok     { background: #eafaf1; }
        .result-stat.update { background: #e8f5f2; }
        .result-stat.skip   { background: #fef9e7; }
        .result-stat.total  { background: #eaf2fd; }
        .result-num { font-size: 28px; font-weight: 700; line-height: 1; }
        .result-stat.ok     .result-num { color: #27ae60; }
        .result-stat.update .result-num { color: #16a085; }
        .result-stat.skip   .result-num { color: #e67e22; }
        .result-stat.total  .result-num { color: #2980b9; }
        .result-label { font-size: 12px; color: #777; margin-top: 4px; }

        .errors-block { margin-bottom: 16px; }
        .errors-title { font-size: 13px; font-weight: 600; color: #c0392b; margin-bottom: 8px; }
        .errors-table th,
        .errors-table td { font-size: 13px; padding: 6px 12px !important; }

        .staging-result-banner {
          padding: 12px 16px; background: #e8f5e9; border: 1px solid #a5d6a7;
          border-radius: 6px; color: #2e7d32; font-size: 14px; margin-bottom: 16px; line-height: 1.5;
        }
        .staging-result-banner code { background: #c8e6c9; padding: 1px 5px; border-radius: 3px; }

        .error-message {
          padding: 12px; background: #fee; border: 1px solid #fcc;
          border-radius: 4px; color: #c33; margin-bottom: 16px; font-size: 14px;
        }
      `}</style>
    </>
  );
}

export default ArticleImportPage;
