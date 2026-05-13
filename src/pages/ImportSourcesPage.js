import React, { useEffect, useState } from "react";

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
  getArticleMappings,
  createArticleMapping,
  updateArticleMapping,
  deleteArticleMapping,
  getDepartmentMappings,
  createDepartmentMapping,
  updateDepartmentMapping,
  deleteDepartmentMapping,
} from "../api/pnlImportApi";

import { getReferenceArticles, getReferenceDepartments } from "../api/referenceApi";

const EMPTY_SOURCE = {
  source_name: "",
  source_type: "google_sheets",
  source_url: "",
  article_id_field: "",
  article_name_field: "",
  article_type_field: "",
  level1_field: "",
  level2_field: "",
  pnl_id_field: "",
};

const EMPTY_ARTICLE_MAP = {
  source_id: "",
  source_article_id: "",
  source_article_name: "",
  article_id: "",
  comment: "",
  is_active: true,
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

function ImportSourcesPage() {
  const [activeTab, setActiveTab] = useState("sources");

  // shared data
  const [sources, setSources] = useState([]);
  const [articles, setArticles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");

  // tab-specific data
  const [articleMappings, setArticleMappings] = useState([]);
  const [deptMappings, setDeptMappings] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);

  // forms
  const [sourceForm, setSourceForm] = useState(EMPTY_SOURCE);
  const [articleMapForm, setArticleMapForm] = useState(EMPTY_ARTICLE_MAP);
  const [deptMapForm, setDeptMapForm] = useState(EMPTY_DEPT_MAP);

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (activeTab === "articles") loadArticleMappings();
    if (activeTab === "departments") loadDeptMappings();
  }, [activeTab, selectedSourceId]); // eslint-disable-line react-hooks/exhaustive-deps


  const loadBase = async () => {
    setLoading(true);
    setError(null);
    try {
      const [src, art, dept] = await Promise.all([
        getImportSources(),
        getReferenceArticles(),
        getReferenceDepartments(),
      ]);
      setSources(src);
      setArticles(art);
      setDepartments(dept);
    } catch {
      setError("Помилка завантаження даних");
    } finally {
      setLoading(false);
    }
  };

  const loadArticleMappings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getArticleMappings(selectedSourceId || null);
      setArticleMappings(data);
    } catch {
      setError("Помилка завантаження відповідностей статей");
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
      article_id_field: s.article_id_field || "",
      article_name_field: s.article_name_field || "",
      article_type_field: s.article_type_field || "",
      level1_field: s.level1_field || "",
      level2_field: s.level2_field || "",
      pnl_id_field: s.pnl_id_field || "",
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

  // ─── article mapping tab ─────────────────────────────────────────────────────

  const openAddArticleMap = () => {
    setEditId(null);
    setModalError(null);
    setArticleMapForm({ ...EMPTY_ARTICLE_MAP, source_id: selectedSourceId || "" });
    setShowModal(true);
  };

  const openEditArticleMap = (m) => {
    setModalError(null);
    setEditId(m.mapping_id);
    setArticleMapForm({
      source_id: m.source_id || "",
      source_article_id: m.source_article_id || "",
      source_article_name: m.source_article_name || "",
      article_id: m.article_id || "",
      comment: m.comment || "",
      is_active: m.is_active !== false,
    });
    setShowModal(true);
  };

  const saveArticleMap = async (e) => {
    e.preventDefault();
    if (!articleMapForm.source_id) {
      setModalError("Оберіть джерело");
      return;
    }
    if (!Number(articleMapForm.article_id)) {
      setModalError("Оберіть внутрішню статтю");
      return;
    }
    setLoading(true);
    setModalError(null);
    try {
      if (editId) {
        await updateArticleMapping(editId, articleMapForm);
      } else {
        await createArticleMapping(articleMapForm);
      }
      setShowModal(false);
      await loadArticleMappings();
    } catch (err) {
      setModalError(formatApiError(err, "Помилка збереження відповідності статті"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteArticleMap = async (mappingId) => {
    if (!window.confirm(`Деактивувати відповідність ID ${mappingId}?`)) return;
    setLoading(true);
    try {
      await deleteArticleMapping(mappingId);
      await loadArticleMappings();
    } catch {
      setError("Помилка видалення відповідності");
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

  const articleNameById = (id) => {
    const a = articles.find((x) => x.article_id === id);
    return a ? a.article_name : `#${id}`;
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
            <button
              className={`tab-btn ${activeTab === "departments" ? "active" : ""}`}
              onClick={() => handleTabChange("departments")}
            >
              🏢 Підрозділи
            </button>
          </div>

          {/* sources tab toolbar */}
          {activeTab === "sources" && (
            <div className="actions-row">
              <Button variant="primary" onClick={openAddSource}>
                + Додати джерело
              </Button>
            </div>
          )}

          {/* articles tab toolbar */}
          {activeTab === "articles" && sourceFilterBar(openAddArticleMap)}

          {/* departments tab toolbar */}
          {activeTab === "departments" && sourceFilterBar(openAddDeptMap)}
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Завантаження...</div>
        ) : (
          <>
            {/* ── SOURCES TABLE ─────────────────────────────────────────── */}
            {activeTab === "sources" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Назва</th>
                    <th>Тип</th>
                    <th>Посилання / Опис</th>
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
                        <td className="url-cell">{s.source_url || "—"}</td>
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

            {/* ── ARTICLE MAPPING TABLE ─────────────────────────────────── */}
            {activeTab === "articles" && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Джерело</th>
                    <th>Зовн. код</th>
                    <th>Зовн. назва</th>
                    <th>→ Стаття</th>
                    <th>Коментар</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {articleMappings.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="empty-row">
                        Відповідностей немає
                      </td>
                    </tr>
                  ) : (
                    articleMappings.map((m) => (
                      <tr key={m.mapping_id} className={m.is_active ? "" : "row-inactive"}>
                        <td>{m.mapping_id}</td>
                        <td>{sourceNameById(m.source_id)}</td>
                        <td>{m.source_article_id || "—"}</td>
                        <td>{m.source_article_name || "—"}</td>
                        <td>{articleNameById(m.article_id)}</td>
                        <td>{m.comment || "—"}</td>
                        <td className="actions-cell">
                          <Button variant="secondary" onClick={() => openEditArticleMap(m)}>
                            Редагувати
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => handleDeleteArticleMap(m.mapping_id)}
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
          title={editId ? "Редагування джерела" : "Нове джерело"}
          onClose={() => setShowModal(false)}
          size="large"
        >
          <form onSubmit={saveSource}>
            <div className="form-grid">
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
                <label>Тип</label>
                <select
                  value={sourceForm.source_type}
                  onChange={(e) => setSourceForm({ ...sourceForm, source_type: e.target.value })}
                >
                  <option value="google_sheets">Google Sheets</option>
                  <option value="excel_file">Excel / CSV</option>
                  <option value="api">API</option>
                  <option value="manual">Вручну</option>
                </select>
              </div>

              <div className="form-field full">
                <label>Посилання / Опис</label>
                <input
                  value={sourceForm.source_url}
                  onChange={(e) => setSourceForm({ ...sourceForm, source_url: e.target.value })}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
              </div>

              <div className="form-field full">
                <label className="section-label">Колонки для синхронізації довідника статей (опційно)</label>
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

      {showModal && activeTab === "articles" && (
        <Modal
          title={editId ? "Редагування відповідності статті" : "Нова відповідність статті"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveArticleMap}>
            <div className="form-row">
              {sources.length === 0 ? (
                <p className="no-sources-hint">
                  Спочатку створіть джерело імпорту у вкладці «Джерела»
                </p>
              ) : (
                <select
                  value={articleMapForm.source_id}
                  onChange={(e) =>
                    setArticleMapForm({ ...articleMapForm, source_id: e.target.value })
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
                placeholder="Зовнішній код статті"
                value={articleMapForm.source_article_id}
                onChange={(e) =>
                  setArticleMapForm({ ...articleMapForm, source_article_id: e.target.value })
                }
              />
            </div>

            <div className="form-row">
              <input
                placeholder="Зовнішня назва статті"
                value={articleMapForm.source_article_name}
                onChange={(e) =>
                  setArticleMapForm({ ...articleMapForm, source_article_name: e.target.value })
                }
              />
            </div>

            <div className="form-row">
              {articles.length === 0 ? (
                <p className="no-sources-hint">
                  Довідник статей порожній. Спочатку заповніть «Статті PnL».
                </p>
              ) : (
                <SearchableSelect
                  options={articles}
                  value={articleMapForm.article_id}
                  onChange={(val) => setArticleMapForm({ ...articleMapForm, article_id: val })}
                  getOptionValue={(a) => String(a.article_id)}
                  getOptionLabel={(a) => `${a.article_id} — ${a.article_name}`}
                  placeholder="Пошук статті за ID або назвою..."
                />
              )}
            </div>

            <div className="form-row">
              <input
                placeholder="Коментар"
                value={articleMapForm.comment}
                onChange={(e) =>
                  setArticleMapForm({ ...articleMapForm, comment: e.target.value })
                }
              />
            </div>

            {editId && (
              <div className="form-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={articleMapForm.is_active}
                    onChange={(e) =>
                      setArticleMapForm({ ...articleMapForm, is_active: e.target.checked })
                    }
                  />
                  &nbsp;Активне
                </label>
              </div>
            )}

            {modalError && <div className="modal-error">{modalError}</div>}
            <div className="modal-actions">
              <Button type="submit" variant="primary" disabled={loading || sources.length === 0 || articles.length === 0}>
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

      <style>{`
        .tabs-header {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          border-bottom: 1px solid #ddd;
        }

        .tab-btn {
          padding: 8px 18px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #666;
          transition: all 0.2s;
        }

        .tab-btn:hover { color: #2c3e50; border-bottom-color: #e0e0e0; }
        .tab-btn.active { color: #3498db; border-bottom-color: #3498db; }

        .source-filter {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          min-width: 200px;
        }

        .url-cell {
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          color: #555;
        }

        .row-inactive td { color: #bbb; }

        .error-message {
          padding: 12px;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          color: #c33;
          margin-bottom: 15px;
          font-size: 14px;
        }

        .loading {
          padding: 20px;
          text-align: center;
          color: #666;
        }

        .empty-row {
          text-align: center;
          color: #999;
          padding: 20px !important;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 4px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .form-field.full { grid-column: 1 / -1; }

        .form-field label {
          font-size: 12px;
          font-weight: 500;
          color: #555;
        }

        .section-label {
          font-size: 11px !important;
          color: #999 !important;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding-top: 8px;
        }

        .form-field input,
        .form-field select {
          padding: 8px 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        }

        .form-field input:focus,
        .form-field select:focus {
          outline: none;
          border-color: #3498db;
          box-shadow: 0 0 4px rgba(52,152,219,0.2);
        }

        .form-row {
          margin-bottom: 12px;
          min-width: 0;
        }

        .form-row input,
        .form-row select {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-row input:focus,
        .form-row select:focus {
          outline: none;
          border-color: #3498db;
          box-shadow: 0 0 4px rgba(52,152,219,0.2);
        }

        .no-sources-hint {
          margin: 4px 0 8px;
          padding: 10px 14px;
          background: #fff8e1;
          border: 1px solid #ffe082;
          border-radius: 4px;
          color: #795548;
          font-size: 13px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          font-size: 14px;
          cursor: pointer;
        }

        .modal-error {
          padding: 10px 14px;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          color: #c33;
          font-size: 13px;
          margin-bottom: 12px;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 20px;
        }
      `}</style>
    </>
  );
}

export default ImportSourcesPage;
