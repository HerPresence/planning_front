import React, { useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";

import {
  getImportSources,
  createImportSource,
  updateImportSource,
  deleteImportSource,
} from "../api/importSourcesApi";

import {
  getDepartmentMappings,
  createDepartmentMapping,
  updateDepartmentMapping,
  deleteDepartmentMapping,
} from "../api/pnlImportApi";

import { getReferenceDepartments } from "../api/referenceApi";

import ArticleSourceMappingPage from "./ArticleSourceMappingPage";

const EMPTY_SOURCE = {
  source_name: "",
  source_type: "google_sheets",
  source_url: "",
  import_type_code: "",
  article_id_field: "",
  article_name_field: "",
  article_type_field: "",
  level1_field: "",
  level2_field: "",
  pnl_id_field: "",
  // OLAP / SQL
  db_server: "",
  db_port: "",
  db_database: "",
  db_cube_model: "",
  db_login: "",
  db_password: "",
  db_query: "",
  db_refresh_interval: "",
};

const EMPTY_DEPT_MAP = {
  source_id: "",
  external_department_code: "",
  external_department_name: "",
  internal_department_id: "",
  is_active: true,
};

function formatApiError(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (Array.isArray(detail)) {
    return detail.map((e) => `${e.loc?.slice(-1)[0] || ""}: ${e.msg}`).join("; ");
  }
  if (typeof detail === "string") return detail;
  return JSON.stringify(detail);
}

function ImportSourcesPage({ setActivePage, initialTab = "sources", initialSourceId = "" }) {
  const { canEdit } = usePagePermission("importSources");

  const [activeTab, setActiveTab] = useState(initialTab || "sources");

  // shared data
  const [sources, setSources] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");

  // tab-specific data
  const [deptMappings, setDeptMappings] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);

  // forms
  const [sourceForm, setSourceForm] = useState(EMPTY_SOURCE);
  const [deptMapForm, setDeptMapForm] = useState(EMPTY_DEPT_MAP);

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (activeTab === "departments") loadDeptMappings();
  }, [activeTab, selectedSourceId]); // eslint-disable-line react-hooks/exhaustive-deps


  const loadBase = async () => {
    setLoading(true);
    setError(null);
    try {
      const [src, dept] = await Promise.all([
        getImportSources(),
        getReferenceDepartments(),
      ]);
      setSources(src);
      setDepartments(dept);
    } catch {
      setError("Помилка завантаження даних");
    } finally {
      setLoading(false);
    }
  };

  const loadDeptMappings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDepartmentMappings(selectedSourceId || null);
      setDeptMappings(data);
    } catch {
      setError("Помилка завантаження відповідностей підрозділів");
    } finally {
      setLoading(false);
    }
  };

  // ─── sources tab ────────────────────────────────────────────────────────────

  const openAddSource = () => {
    setEditId(null);
    setSourceForm(EMPTY_SOURCE);
    setModalError(null);
    setShowModal(true);
  };

  const openEditSource = (s) => {
    setModalError(null);
    setEditId(s.id);
    setSourceForm({
      source_name: s.source_name || "",
      source_type: s.source_type || "google_sheets",
      source_url: s.source_url || "",
      import_type_code: s.import_type_code || "",
      article_id_field: s.article_id_field || "",
      article_name_field: s.article_name_field || "",
      article_type_field: s.article_type_field || "",
      level1_field: s.level1_field || "",
      level2_field: s.level2_field || "",
      pnl_id_field: s.pnl_id_field || "",
      db_server: s.db_server || "",
      db_port: s.db_port || "",
      db_database: s.db_database || "",
      db_cube_model: s.db_cube_model || "",
      db_login: s.db_login || "",
      db_password: s.db_password || "",
      db_query: s.db_query || "",
      db_refresh_interval: s.db_refresh_interval || "",
    });
    setShowModal(true);
  };

  const saveSource = async (e) => {
    e.preventDefault();
    setLoading(true);
    setModalError(null);
    try {
      if (editId) {
        await updateImportSource(editId, sourceForm);
      } else {
        await createImportSource(sourceForm);
      }
      setShowModal(false);
      await loadBase();
    } catch (err) {
      setModalError(formatApiError(err, "Помилка збереження джерела"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSource = async (id) => {
    if (!window.confirm(`Деактивувати джерело ID ${id}?`)) return;
    setLoading(true);
    try {
      await deleteImportSource(id);
      await loadBase();
    } catch {
      setError("Помилка видалення джерела");
    } finally {
      setLoading(false);
    }
  };

  // ─── department mapping tab ───────────────────────────────────────────────────

  const openAddDeptMap = () => {
    setEditId(null);
    setModalError(null);
    setDeptMapForm({ ...EMPTY_DEPT_MAP, source_id: selectedSourceId || "" });
    setShowModal(true);
  };

  const openEditDeptMap = (m) => {
    setModalError(null);
    setEditId(m.id);
    setDeptMapForm({
      source_id: m.source_id || "",
      external_department_code: m.external_department_code || "",
      external_department_name: m.external_department_name || "",
      internal_department_id: m.internal_department_id || "",
      is_active: m.is_active !== false,
    });
    setShowModal(true);
  };

  const saveDeptMap = async (e) => {
    e.preventDefault();
    if (!deptMapForm.source_id) {
      setModalError("Оберіть джерело");
      return;
    }
    if (!deptMapForm.internal_department_id) {
      setModalError("Оберіть внутрішній підрозділ");
      return;
    }
    setLoading(true);
    setModalError(null);
    try {
      if (editId) {
        await updateDepartmentMapping(editId, deptMapForm);
      } else {
        await createDepartmentMapping(deptMapForm);
      }
      setShowModal(false);
      await loadDeptMappings();
    } catch (err) {
      setModalError(formatApiError(err, "Помилка збереження відповідності підрозділу"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDeptMap = async (id) => {
    if (!window.confirm(`Деактивувати відповідність ID ${id}?`)) return;
    setLoading(true);
    try {
      await deleteDepartmentMapping(id);
      await loadDeptMappings();
    } catch {
      setError("Помилка видалення відповідності");
    } finally {
      setLoading(false);
    }
  };

  // ─── helpers ──────────────────────────────────────────────────────────────────

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setShowModal(false);
    setEditId(null);
    setError(null);
  };

  const sourceNameById = (id) => {
    const s = sources.find((x) => x.id === id);
    return s ? s.source_name : `#${id}`;
  };

  const deptNameById = (id) => {
    const d = departments.find((x) => x.department_id === id);
    return d ? d.department_name : `#${id}`;
  };

  // ─── render ───────────────────────────────────────────────────────────────────

  const sourceFilterBar = (onAdd) => (
    <div className="actions-row">
      <select
        className="source-filter"
        value={selectedSourceId}
        onChange={(e) => setSelectedSourceId(e.target.value)}
      >
        <option value="">Всі джерела</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.source_name}
          </option>
        ))}
      </select>
      <Button variant="primary" onClick={onAdd}>
        + Додати
      </Button>
    </div>
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Відповідність імпорту</h2>
            <p>Джерела даних та маппінг статей і підрозділів за джерелом.</p>
          </div>

          <div className="tabs-header">
            <button
              className={`tab-btn ${activeTab === "sources" ? "active" : ""}`}
              onClick={() => handleTabChange("sources")}
            >
              🗂 Джерела
            </button>
            <button
              className={`tab-btn ${activeTab === "articles" ? "active" : ""}`}
              onClick={() => handleTabChange("articles")}
            >
              📄 Статті
            </button>
            {setActivePage && (
              <button
                className="tab-btn"
                onClick={() => setActivePage("departmentSourceMapping", { sourceId: selectedSourceId })}
              >
                🏢 Підрозділи
              </button>
            )}
            {setActivePage && (
              <button
                className="tab-btn"
                onClick={() => setActivePage("brandSourceMapping")}
              >
                🏷 Бренди / НГ
              </button>
            )}
          </div>

          {/* sources tab toolbar */}
          {activeTab === "sources" && (
            <div className="actions-row">
              <Button variant="primary" onClick={openAddSource}>
                + Додати джерело
              </Button>
            </div>
          )}

          {/* departments tab toolbar */}
          {activeTab === "departments" && sourceFilterBar(openAddDeptMap)}
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* ── ARTICLES TAB: enterprise staging component ────────────────── */}
        {activeTab === "articles" && (
          <ArticleSourceMappingPage
            asTab={true}
            initialSourceId={initialSourceId}
            setActivePage={setActivePage}
          />
        )}

        {activeTab !== "articles" && loading ? (
          <div className="loading">Завантаження...</div>
        ) : activeTab !== "articles" && (
          <>
            {/* ── SOURCES TABLE ─────────────────────────────────────────── */}
            {activeTab === "sources" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Назва</th>
                    <th>Тип</th>
                    <th>Підключення / URL</th>
                    <th>Активне</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty-row">
                        Джерел немає
                      </td>
                    </tr>
                  ) : (
                    sources.map((s) => (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td>{s.source_name}</td>
                        <td>
                          <span className="badge">{s.source_type}</span>
                        </td>
                        <td className="url-cell">
                          {s.source_type === "olap_sql"
                            ? [s.db_server, s.db_port].filter(Boolean).join(":") +
                              (s.db_database ? ` / ${s.db_database}` : "") || "—"
                            : s.source_url || "—"}
                        </td>
                        <td>{s.is_active ? "✓" : "—"}</td>
                        <td className="actions-cell">
                          <Button variant="secondary" onClick={() => openEditSource(s)}>
                            Редагувати
                          </Button>
                          <Button variant="danger" onClick={() => handleDeleteSource(s.id)}>
                            Видалити
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* ── DEPARTMENT MAPPING TABLE ──────────────────────────────── */}
            {activeTab === "departments" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Джерело</th>
                    <th>Зовн. код</th>
                    <th>Зовн. назва</th>
                    <th>→ Підрозділ</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {deptMappings.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty-row">
                        Відповідностей немає
                      </td>
                    </tr>
                  ) : (
                    deptMappings.map((m) => (
                      <tr key={m.id} className={m.is_active ? "" : "row-inactive"}>
                        <td>{m.id}</td>
                        <td>{sourceNameById(m.source_id)}</td>
                        <td>{m.external_department_code || "—"}</td>
                        <td>{m.external_department_name || "—"}</td>
                        <td>{deptNameById(m.internal_department_id)}</td>
                        <td className="actions-cell">
                          <Button variant="secondary" onClick={() => openEditDeptMap(m)}>
                            Редагувати
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => handleDeleteDeptMap(m.id)}
                          >
                            Видалити
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}

      {showModal && activeTab === "sources" && (
        <Modal
          title={editId ? "Редагування джерела імпорту" : "Джерело імпорту"}
          onClose={() => setShowModal(false)}
          size="large"
        >
          <form onSubmit={saveSource}>
            <div className="form-grid">

              {/* ── common: name + type ─────────────────────────────────── */}
              <div className="form-field">
                <label>Назва джерела *</label>
                <input
                  value={sourceForm.source_name}
                  onChange={(e) => setSourceForm({ ...sourceForm, source_name: e.target.value })}
                  placeholder="Наприклад: 1C_HOLDING_A"
                  required
                />
              </div>

              <div className="form-field">
                <label>Тип джерела</label>
                <select
                  value={sourceForm.source_type}
                  onChange={(e) => setSourceForm({ ...sourceForm, source_type: e.target.value })}
                >
                  <option value="google_sheets">Google Sheets</option>
                  <option value="excel_file">Excel / CSV</option>
                  <option value="olap_ssas_dax">SSAS Tabular / DAX (MSOLAP)</option>
                  <option value="sql_odbc">SQL Server / ODBC</option>
                  <option value="api">API</option>
                  <option value="manual">Вручну</option>
                  <option value="olap_sql">OLAP / SQL (застарілий)</option>
                </select>
              </div>

              <div className="form-field">
                <label>Тип імпорту</label>
                <select
                  value={sourceForm.import_type_code}
                  onChange={(e) => setSourceForm({ ...sourceForm, import_type_code: e.target.value })}
                >
                  <option value="">— не вказано —</option>
                  <option value="departments">Підрозділи</option>
                  <option value="brands">Бренди / Номенклатурні групи</option>
                  <option value="articles">Статті PnL</option>
                  <option value="sales_fact">Факт продажів (товарооборот)</option>
                  <option value="pnl_plan">PnL — План</option>
                  <option value="pnl_fact">PnL — Факт</option>
                </select>
              </div>

              {/* ── non-OLAP: URL + article column mapping ──────────────── */}
              {!["olap_ssas_dax", "sql_odbc", "olap_sql"].includes(sourceForm.source_type) && (
                <>
                  <div className="form-field full">
                    <label>Google Sheets URL або опис</label>
                    <input
                      value={sourceForm.source_url}
                      onChange={(e) => setSourceForm({ ...sourceForm, source_url: e.target.value })}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                    />
                  </div>

                  <div className="form-field full">
                    <div className="section-divider">
                      <span className="section-label">Поля для синхронізації довідника статей (необов'язково)</span>
                      <p className="section-help">Використовується лише для автоматичного оновлення довідника статей PnL. Не використовується для імпорту сум PnL.</p>
                    </div>
                  </div>

                  {[
                    ["article_id_field", "Колонка: article_id"],
                    ["article_name_field", "Колонка: article_name"],
                    ["article_type_field", "Колонка: article_type"],
                    ["level1_field", "Колонка: level1"],
                    ["level2_field", "Колонка: level2"],
                    ["pnl_id_field", "Колонка: pnl_id"],
                  ].map(([field, label]) => (
                    <div className="form-field" key={field}>
                      <label>{label}</label>
                      <input
                        value={sourceForm[field]}
                        onChange={(e) => setSourceForm({ ...sourceForm, [field]: e.target.value })}
                        placeholder="Назва колонки у джерелі"
                      />
                    </div>
                  ))}
                </>
              )}

              {/* ── OLAP / SQL connection fields ─────────────────────────── */}
              {["olap_ssas_dax", "sql_odbc", "olap_sql"].includes(sourceForm.source_type) && (
                <>
                  <div className="form-field full">
                    <div className="section-divider">
                      <span className="section-label">
                        {sourceForm.source_type === "olap_ssas_dax"
                          ? "Підключення до SSAS Tabular (DAX / MSOLAP)"
                          : sourceForm.source_type === "sql_odbc"
                          ? "Підключення до SQL Server (ODBC)"
                          : "Підключення до бази даних / OLAP"}
                      </span>
                      <p className="section-help">
                        {sourceForm.source_type === "olap_ssas_dax"
                          ? "Для DAX-запитів (EVALUATE SUMMARIZECOLUMNS...). Потрібен провайдер MSOLAP на сервері backend."
                          : sourceForm.source_type === "sql_odbc"
                          ? "Для звичайних SQL-запитів. Потрібен ODBC Driver 17/18 for SQL Server."
                          : "Підтримується MSSQL, PostgreSQL, OLAP cubes, BI datasets."}
                      </p>
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Сервер *</label>
                    <input
                      value={sourceForm.db_server}
                      onChange={(e) => setSourceForm({ ...sourceForm, db_server: e.target.value })}
                      placeholder="192.168.1.10 або server.domain.com"
                    />
                  </div>

                  <div className="form-field">
                    <label>Порт</label>
                    <input
                      value={sourceForm.db_port}
                      onChange={(e) => setSourceForm({ ...sourceForm, db_port: e.target.value })}
                      placeholder="1433 (MSSQL) / 5432 (PG) / 8088 (OLAP)"
                    />
                  </div>

                  <div className="form-field">
                    <label>База даних *</label>
                    <input
                      value={sourceForm.db_database}
                      onChange={(e) => setSourceForm({ ...sourceForm, db_database: e.target.value })}
                      placeholder="MyDatabase"
                    />
                  </div>

                  <div className="form-field">
                    <label>Куб / Модель (опціонально)</label>
                    <input
                      value={sourceForm.db_cube_model}
                      onChange={(e) => setSourceForm({ ...sourceForm, db_cube_model: e.target.value })}
                      placeholder="SalesAnalysis (для OLAP / Power BI)"
                    />
                  </div>

                  <div className="form-field">
                    <label>Логін</label>
                    <input
                      value={sourceForm.db_login}
                      onChange={(e) => setSourceForm({ ...sourceForm, db_login: e.target.value })}
                      placeholder="sa / service_user"
                      autoComplete="username"
                    />
                  </div>

                  <div className="form-field">
                    <label>Пароль</label>
                    <input
                      type="password"
                      value={sourceForm.db_password}
                      onChange={(e) => setSourceForm({ ...sourceForm, db_password: e.target.value })}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="form-field full">
                    <label>
                      {sourceForm.source_type === "olap_ssas_dax"
                        ? "DAX запит (EVALUATE ...)"
                        : "SQL запит"}
                    </label>
                    <textarea
                      className="query-textarea"
                      value={sourceForm.db_query}
                      onChange={(e) => setSourceForm({ ...sourceForm, db_query: e.target.value })}
                      placeholder={
                        sourceForm.source_type === "olap_ssas_dax"
                          ? "EVALUATE\nSUMMARIZECOLUMNS(\n    dim_date[Period],\n    dim_department[DeptCode],\n    fact_pnl[ArticleCode],\n    \"Amount\", SUM(fact_pnl[Amount])\n)"
                          : "SELECT department_code, article_code, period, amount\nFROM fact_pnl\nWHERE period >= '2025-01-01'"
                      }
                      rows={7}
                    />
                  </div>

                  <div className="form-field">
                    <label>Інтервал авто-оновлення (хв., опціонально)</label>
                    <input
                      type="number"
                      min="1"
                      value={sourceForm.db_refresh_interval}
                      onChange={(e) => setSourceForm({ ...sourceForm, db_refresh_interval: e.target.value })}
                      placeholder="60"
                    />
                  </div>

                  <div className="form-field">
                    <div className="olap-info-box">
                      <strong>Архітектурна нотатка</strong>
                      <ul>
                        <li>Підключення зберігається, але не виконується автоматично</li>
                        <li>Запуск ETL / refresh — у наступних релізах</li>
                        <li>Маппінг статей і підрозділів працює для всіх типів джерел</li>
                      </ul>
                    </div>
                  </div>
                </>
              )}

            </div>

            {modalError && <div className="modal-error">{modalError}</div>}
            <div className="modal-actions">
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "Збереження..." : "Зберегти"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Скасувати
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {showModal && activeTab === "departments" && (
        <Modal
          title={
            editId
              ? "Редагування відповідності підрозділу"
              : "Нова відповідність підрозділу"
          }
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveDeptMap}>
            <div className="form-row">
              {sources.length === 0 ? (
                <p className="no-sources-hint">
                  Спочатку створіть джерело імпорту у вкладці «Джерела»
                </p>
              ) : (
                <select
                  value={deptMapForm.source_id}
                  onChange={(e) =>
                    setDeptMapForm({ ...deptMapForm, source_id: e.target.value })
                  }
                  required
                >
                  <option value="" disabled>Джерело *</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.source_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-row">
              <input
                placeholder="Зовнішній код підрозділу"
                value={deptMapForm.external_department_code}
                onChange={(e) =>
                  setDeptMapForm({ ...deptMapForm, external_department_code: e.target.value })
                }
              />
            </div>

            <div className="form-row">
              <input
                placeholder="Зовнішня назва підрозділу"
                value={deptMapForm.external_department_name}
                onChange={(e) =>
                  setDeptMapForm({ ...deptMapForm, external_department_name: e.target.value })
                }
              />
            </div>

            <div className="form-row">
              {departments.length === 0 ? (
                <p className="no-sources-hint">
                  Довідник підрозділів порожній. Спочатку заповніть «Підрозділи».
                </p>
              ) : (
                <SearchableSelect
                  options={departments}
                  value={deptMapForm.internal_department_id}
                  onChange={(val) => setDeptMapForm({ ...deptMapForm, internal_department_id: val })}
                  getOptionValue={(d) => String(d.department_id)}
                  getOptionLabel={(d) => d.department_name}
                  getSearchText={(d) => String(d.department_id)}
                  placeholder="Пошук підрозділу за назвою або кодом..."
                />
              )}
            </div>

            {editId && (
              <div className="form-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={deptMapForm.is_active}
                    onChange={(e) =>
                      setDeptMapForm({ ...deptMapForm, is_active: e.target.checked })
                    }
                  />
                  &nbsp;Активне
                </label>
              </div>
            )}

            {modalError && <div className="modal-error">{modalError}</div>}
            <div className="modal-actions">
              <Button type="submit" variant="primary" disabled={loading || sources.length === 0 || departments.length === 0}>
                {loading ? "Збереження..." : "Зберегти"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Скасувати
              </Button>
            </div>
          </form>
        </Modal>
      )}

    </>
  );
}

export default ImportSourcesPage;
