import React, { useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";

import Button from "../components/ui/Button";
import DataCard from "../components/layout/DataCard";
import KPIGrid from "../components/layout/KPIGrid";
import DataTable from "../components/table/DataTable";
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
  const { canEdit } = usePagePermission("pnlImport");

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
      <DataCard
        title="Імпорт статей PnL"
        subtitle="Завантаження довідника статей з Google Sheets або OLAP."
        actions={
          <Button variant="secondary" onClick={() => setActivePage("articles")}>
            ← До статей
          </Button>
        }
      >
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
            <div className="field-row">
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
                  <div className="preview-table-wrap">
                    <DataTable
                      columns={previewResult.columns.map((c) => ({ key: c, header: c }))}
                      rows={previewResult.preview_rows}
                      rowKey={(_, i) => i}
                    />
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
              <p className="hint-warning">
                OLAP-статті завантажуються в staging-таблицю <code>dim_article_source</code>.
                PnL ID не потрібен — прив'язка до master-статей виконується окремо на сторінці «Відповідність статей».
              </p>
            )}

            {/* Extended OLAP fields */}
            <p className="map-group-label">
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
              <div className="import-success-text">✓ Довідник статей успішно оновлено</div>
            )}

            <KPIGrid cards={[
              { label: importResult.target === "staging" ? "Нових" : "Додано", value: importResult.inserted ?? importResult.imported ?? 0, variant: "ok" },
              { label: "Оновлено",     value: importResult.updated,    variant: "update" },
              { label: "Пропущено",    value: importResult.skipped,    variant: "skip" },
              { label: "Всього рядків",value: importResult.total_rows, variant: "total" },
            ]} />

            {importResult.errors && importResult.errors.length > 0 && (
              <div className="errors-block">
                <p className="errors-title">
                  Помилки рядків ({importResult.errors.length}):
                </p>
                <div className="preview-table-wrap">
                  <DataTable
                    columns={[
                      { key: "article_id", header: "ID статті", render: (row) => row.article_id || "—" },
                      { key: "error",      header: "Помилка" },
                    ]}
                    rows={importResult.errors}
                    rowKey={(_, i) => i}
                  />
                </div>
              </div>
            )}

            <div className="run-row-flex">
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
      </DataCard>
    </>
  );
}

export default ArticleImportPage;
