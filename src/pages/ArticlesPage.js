import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getArticles,
  createArticle,
  updateArticle,
} from "../api/articlesApi";

import { importArticlesFromSource } from "../api/importArticlesApi";

function ArticlesPage({ setActivePage }) {
  const [articles, setArticles] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editArticleId, setEditArticleId] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const emptyForm = {
    article_id: "",
    article_name: "",
    article_type: "",
    level1: "",
    level2: "",
    pnl_id: "",
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadArticles();
  }, []);

  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const runImport = async () => {
    try {
      setIsImporting(true);

      const result = await importArticlesFromSource(1);

      if (result.status !== "ok") {
        alert(result.message || "Помилка імпорту");
        return;
      }

      alert(
        `Імпорт виконано\n\n` +
          `Усього рядків: ${result.total_rows}\n` +
          `Додано: ${result.imported}\n` +
          `Оновлено: ${result.updated}\n` +
          `Пропущено: ${result.skipped}`
      );

      await loadArticles();
    } catch (err) {
      console.error("Помилка імпорту:", err);
      alert("Помилка імпорту");
    } finally {
      setIsImporting(false);
    }
  };

  const openAddModal = () => {
    setEditArticleId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (article) => {
    setEditArticleId(article.article_id);

    setForm({
      article_id: article.article_id || "",
      article_name: article.article_name || "",
      article_type: article.article_type || "",
      level1: article.level1 || "",
      level2: article.level2 || "",
      pnl_id: article.pnl_id || "",
    });

    setShowModal(true);
  };

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const saveArticle = async (e) => {
    e.preventDefault();

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
      alert("Помилка збереження статті");
    }
  };

  const filteredArticles = articles.filter((a) =>
    `
      ${a.article_id}
      ${a.article_name}
      ${a.article_type}
      ${a.level1}
      ${a.level2}
      ${a.pnl_id}
    `
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

            <Button variant="secondary" onClick={runImport}>
              {isImporting ? "Імпорт..." : "⬇ Імпорт"}
            </Button>

            <Button variant="secondary" onClick={() => setActivePage("importSources")}>
              🔗 Відповідність
            </Button>

            <Button variant="primary" onClick={openAddModal}>
              + Додати статтю
            </Button>
          </div>

          {loadError && <div className="error-message">{loadError}</div>}
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>ID статті</th>
              <th>Назва статті</th>
              <th>Тип</th>
              <th>Level 1</th>
              <th>Level 2</th>
              <th>PnL ID</th>
              <th>Активна</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {filteredArticles.length === 0 && (
              <tr>
                <td colSpan="8" className="empty-row">
                  Статей поки немає або нічого не знайдено.
                </td>
              </tr>
            )}

            {filteredArticles.map((a) => (
              <tr key={a.article_id}>
                <td>{a.article_id}</td>
                <td>{a.article_name}</td>
                <td>
                  <span className="badge">{a.article_type}</span>
                </td>
                <td>{a.level1}</td>
                <td>{a.level2}</td>
                <td>{a.pnl_id}</td>
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
      </section>

      {showModal && (
        <Modal
          title={editArticleId ? "Редагувати статтю PnL" : "Додати статтю PnL"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={saveArticle}>
            <div className="form-grid">
              <div className="form-field">
                <label>ID статті</label>
                <input
                  name="article_id"
                  value={form.article_id}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>PnL ID</label>
                <input
                  name="pnl_id"
                  type="number"
                  value={form.pnl_id}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field full">
                <label>Назва статті</label>
                <input
                  name="article_name"
                  value={form.article_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Тип</label>
                <input
                  name="article_type"
                  value={form.article_type}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Level 1</label>
                <input
                  name="level1"
                  value={form.level1}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field full">
                <label>Level 2</label>
                <input
                  name="level2"
                  value={form.level2}
                  onChange={handleChange}
                />
              </div>
            </div>

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
    </>
  );
}

export default ArticlesPage;