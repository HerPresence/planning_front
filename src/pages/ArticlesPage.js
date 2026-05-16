import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";

import {
  getArticles,
  createArticle,
  updateArticle,
} from "../api/articlesApi";

import { getPnlStructures } from "../api/pnlStructureApi";

const emptyForm = {
  article_id:          "",
  article_name:        "",
  article_type:        "",
  level1:              "",
  level2:              "",
  pnl_id:              "",
  is_active:           true,
  uid_expense_article: "",
  expense_element:     "",
  expense_company:     "",
  level1_olap:         "",
  level2_olap:         "",
};

function ArticlesPage({ setActivePage }) {
  const [articles,      setArticles]      = useState([]);
  const [pnlStructures, setPnlStructures] = useState([]);
  const [search,        setSearch]        = useState("");
  const [showModal,     setShowModal]     = useState(false);
  const [editArticleId, setEditArticleId] = useState(null);
  const [formError,     setFormError]     = useState(null);
  const [loadError,     setLoadError]     = useState(null);
  const [isLoading,     setIsLoading]     = useState(false);

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadArticles();
    getPnlStructures().then(setPnlStructures).catch(() => {});
  }, []);

  const loadArticles = async () => {
    setLoadError(null);
    setIsLoading(true);

    try {
      const data = await getArticles();
      setArticles(data);
      setIsLoading(false);
      return;
    } catch (err) {
      console.warn("Перший запит статей не вдався, пробуємо ще раз:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, 900));

    try {
      const data = await getArticles();
      setArticles(data);
      setIsLoading(false);
      return;
    } catch (err) {
      console.error("Повторне завантаження статей не вдалося:", err);
      setLoadError("Не вдалося завантажити статті. Спробуйте оновити сторінку пізніше.");
    } finally {
      setIsLoading(false);
    }
  };

  const openAddModal = () => {
    setEditArticleId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (article) => {
    setEditArticleId(article.article_id);
    setFormError(null);
    setForm({
      article_id:          article.article_id          || "",
      article_name:        article.article_name        || "",
      article_type:        article.article_type        || "",
      level1:              article.level1              || "",
      level2:              article.level2              || "",
      pnl_id:              article.pnl_id ? String(article.pnl_id) : "",
      is_active:           article.is_active !== false,
      uid_expense_article: article.uid_expense_article || "",
      expense_element:     article.expense_element     || "",
      expense_company:     article.expense_company     || "",
      level1_olap:         article.level1_olap         || "",
      level2_olap:         article.level2_olap         || "",
    });
    setShowModal(true);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const saveArticle = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!form.article_type) {
      setFormError("Оберіть тип статті");
      return;
    }
    if (!form.pnl_id || Number(form.pnl_id) === 0) {
      setFormError("Оберіть структуру PnL");
      return;
    }

    try {
      if (editArticleId) {
        await updateArticle(editArticleId, form);
      } else {
        await createArticle(form);
      }

      setShowModal(false);
      setEditArticleId(null);
      setForm(emptyForm);
      await loadArticles();
    } catch (err) {
      console.error("Помилка збереження статті:", err);
      const detail = err?.response?.data?.detail;
      setFormError(
        Array.isArray(detail)
          ? detail.map((e) => e.msg).join("; ")
          : typeof detail === "string"
          ? detail
          : "Помилка збереження статті"
      );
    }
  };

  const filteredArticles = articles.filter((a) =>
    [
      a.article_id,
      a.article_name,
      a.article_type,
      a.level1,
      a.level2,
      a.pnl_id,
      a.uid_expense_article,
      a.expense_element,
      a.expense_company,
      a.level1_olap,
      a.level2_olap,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Статті PnL</h2>
            <p>Довідник статей, які використовуються у PnL-моделі.</p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук статті..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="secondary" onClick={() => setActivePage("articleImport")}>
              ⬇ Імпорт
            </Button>

            <Button variant="secondary" onClick={() => setActivePage("importSources", { tab: "articles" })}>
              🔗 Відповідність статей
            </Button>

            <Button variant="primary" onClick={openAddModal}>
              + Додати статтю
            </Button>
          </div>

          {loadError && <div className="error-message">{loadError}</div>}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table articles-table">
            <thead>
              <tr>
                <th>ID статті</th>
                <th>Назва статті</th>
                <th>Тип</th>
                <th>Level 1</th>
                <th>Level 2</th>
                <th>PnL ID</th>
                <th>UUID статті</th>
                <th>Елемент витрат</th>
                <th>Компанія</th>
                <th>Level 1 OLAP</th>
                <th>Level 2 OLAP</th>
                <th>Активна</th>
                <th>Дії</th>
              </tr>
            </thead>

            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan="13" className="empty-row">
                    Завантаження...
                  </td>
                </tr>
              )}

              {!isLoading && filteredArticles.length === 0 && (
                <tr>
                  <td colSpan="13" className="empty-row">
                    Статей поки немає або нічого не знайдено.
                  </td>
                </tr>
              )}

              {filteredArticles.map((a) => (
                <tr key={a.article_id}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{a.article_id}</td>
                  <td>{a.article_name}</td>
                  <td>
                    <span className="badge">{a.article_type}</span>
                  </td>
                  <td>{a.level1}</td>
                  <td>{a.level2}</td>
                  <td>{a.pnl_id}</td>
                  <td
                    style={{ fontFamily: "monospace", fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}
                    title={a.uid_expense_article || ""}
                  >
                    {a.uid_expense_article || <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                  <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }} title={a.expense_element || ""}>
                    {a.expense_element || <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                  <td style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }} title={a.expense_company || ""}>
                    {a.expense_company || <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                  <td style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }} title={a.level1_olap || ""}>
                    {a.level1_olap || <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                  <td style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }} title={a.level2_olap || ""}>
                    {a.level2_olap || <span style={{ color: "#bbb" }}>—</span>}
                  </td>
                  <td>
                    <span className={a.is_active ? "status active" : "status inactive"}>
                      {a.is_active ? "Активна" : "Неактивна"}
                    </span>
                  </td>
                  <td>
                    <button className="icon-btn edit" onClick={() => openEditModal(a)}>
                      ✎
                    </button>
                    <button
                      className="icon-btn delete"
                      onClick={() => alert("Деактивацію підключимо наступним пакетом")}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <Modal
          title={editArticleId ? "Редагувати статтю PnL" : "Додати статтю PnL"}
          onClose={() => setShowModal(false)}
          size="large"
        >
          <form onSubmit={saveArticle}>
            <div className="form-grid">

              <div className="form-field">
                <label>
                  ID статті {!editArticleId && <span style={{ color: "#e74c3c" }}>*</span>}
                </label>
                <input
                  name="article_id"
                  value={form.article_id}
                  onChange={handleChange}
                  readOnly={!!editArticleId}
                  required={!editArticleId}
                  placeholder="Наприклад: 901"
                  style={editArticleId ? { background: "#f8f8f8", color: "#888" } : {}}
                />
              </div>

              <div className="form-field">
                <label>Тип *</label>
                <select
                  name="article_type"
                  value={form.article_type}
                  onChange={handleChange}
                  required
                >
                  <option value="">— Оберіть тип —</option>
                  <option value="Дохід">Дохід</option>
                  <option value="Витрати">Витрати</option>
                </select>
              </div>

              <div className="form-field full">
                <label>Назва статті *</label>
                <input
                  name="article_name"
                  value={form.article_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field full">
                <label>PnL структура *</label>
                <SearchableSelect
                  options={pnlStructures}
                  value={form.pnl_id}
                  onChange={(val) => setForm({ ...form, pnl_id: val || "" })}
                  getOptionValue={(p) => String(p.id)}
                  getOptionLabel={(p) => `${p.id} — ${p.pnl_code || "—"} — ${p.pnl_name}`}
                  placeholder="— Оберіть рядок PnL структури —"
                />
              </div>

              <div className="form-field">
                <label>Level 1</label>
                <input name="level1" value={form.level1} onChange={handleChange} />
              </div>

              <div className="form-field">
                <label>Level 2</label>
                <input name="level2" value={form.level2} onChange={handleChange} />
              </div>

              <div className="form-field full">
                <label>UUID статті (uid_expense_article)</label>
                <input
                  name="uid_expense_article"
                  value={form.uid_expense_article}
                  onChange={handleChange}
                  placeholder="GUID з OLAP"
                  style={{ fontFamily: "monospace", fontSize: 13 }}
                />
              </div>

              <div className="form-field">
                <label>Елемент витрат</label>
                <input
                  name="expense_element"
                  value={form.expense_element}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Компанія</label>
                <input
                  name="expense_company"
                  value={form.expense_company}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Level 1 OLAP</label>
                <input
                  name="level1_olap"
                  value={form.level1_olap}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Level 2 OLAP</label>
                <input
                  name="level2_olap"
                  value={form.level2_olap}
                  onChange={handleChange}
                />
              </div>

              {editArticleId && (
                <div className="form-field full checkbox-field">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      name="is_active"
                      type="checkbox"
                      checked={!!form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    Активна
                  </label>
                </div>
              )}
            </div>

            {formError && (
              <div className="error-message" style={{ marginTop: 12, marginBottom: 0 }}>
                {formError}
              </div>
            )}

            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Скасувати
              </Button>
              <Button variant="primary" type="submit">
                Зберегти
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <style>{`
        .articles-table th,
        .articles-table td {
          font-size: 12px;
          padding: 6px 8px;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
}

export default ArticlesPage;
