import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

import {
  getImportSources,
  createImportSource,
} from "../api/importSourcesApi";

function ImportSourcesPage({ setActivePage }) {
  const [sources, setSources] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const emptyForm = {
    source_name: "",
    source_type: "google_sheet",
    source_url: "",
    article_id_field: "",
    article_name_field: "",
    article_type_field: "",
    level1_field: "",
    level2_field: "",
    pnl_id_field: "",
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const data = await getImportSources();
      setSources(data);
    } catch (err) {
      console.error("Помилка завантаження джерел імпорту:", err);
      setSources([]);
    }
  };

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const saveSource = async (e) => {
    e.preventDefault();

    try {
      await createImportSource(form);

      setShowModal(false);
      setForm(emptyForm);

      await loadSources();

      alert("Схему відповідності збережено");
    } catch (err) {
      console.error("Помилка збереження відповідності:", err);
      alert("Помилка збереження відповідності");
    }
  };

  const filteredSources = sources.filter((s) =>
    `
      ${s.source_name}
      ${s.source_type}
      ${s.source_url}
      ${s.article_id_field}
      ${s.article_name_field}
      ${s.article_type_field}
      ${s.level1_field}
      ${s.level2_field}
      ${s.pnl_id_field}
    `
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <>
      <section className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Відповідність полів імпорту</h2>
            <p>
              Тут ми зберігаємо, яка колонка з Google Sheets / Excel відповідає
              нашому полю в базі.
            </p>
          </div>

          <div className="actions-row">
            <input
              className="search"
              placeholder="Пошук джерела..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Button variant="secondary" onClick={() => setActivePage("articles")}>
              ← До статей
            </Button>

            <Button variant="primary" onClick={() => setShowModal(true)}>
              + Додати відповідність
            </Button>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Назва джерела</th>
              <th>Тип</th>
              <th>Наш article_id</th>
              <th>Наш article_name</th>
              <th>Наш article_type</th>
              <th>Наш level1</th>
              <th>Наш level2</th>
              <th>Наш pnl_id</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {filteredSources.length === 0 && (
              <tr>
                <td colSpan="9" className="empty-row">
                  Схем відповідності поки немає.
                </td>
              </tr>
            )}

            {filteredSources.map((s) => (
              <tr key={s.id}>
                <td>{s.source_name}</td>
                <td>
                  <span className="badge">{s.source_type}</span>
                </td>
                <td>{s.article_id_field}</td>
                <td>{s.article_name_field}</td>
                <td>{s.article_type_field}</td>
                <td>{s.level1_field}</td>
                <td>{s.level2_field}</td>
                <td>{s.pnl_id_field}</td>
                <td>
                  <button
                    className="icon-btn edit"
                    onClick={() => alert("Редагування підключимо наступним пакетом")}
                  >
                    ✎
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showModal && (
        <Modal
          title="Додати відповідність полів"
          onClose={() => setShowModal(false)}
          size="large"
        >
          <form onSubmit={saveSource}>
            <div className="form-grid">
              <div className="form-field">
                <label>Назва джерела</label>
                <input
                  name="source_name"
                  placeholder="Наприклад: articles_costs"
                  value={form.source_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Тип джерела</label>
                <select
                  name="source_type"
                  value={form.source_type}
                  onChange={handleChange}
                >
                  <option value="google_sheet">Google Sheets</option>
                  <option value="excel_file">Excel / CSV файл</option>
                </select>
              </div>

              <div className="form-field full">
                <label>Посилання на Google Sheet або опис файлу</label>
                <input
                  name="source_url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={form.source_url}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Наше поле: article_id</label>
                <input
                  name="article_id_field"
                  placeholder="Колонка в джерелі, наприклад ArticleID"
                  value={form.article_id_field}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Наше поле: article_name</label>
                <input
                  name="article_name_field"
                  placeholder="Колонка в джерелі, наприклад Level1"
                  value={form.article_name_field}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Наше поле: article_type</label>
                <input
                  name="article_type_field"
                  placeholder="Колонка в джерелі"
                  value={form.article_type_field}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Наше поле: level1</label>
                <input
                  name="level1_field"
                  placeholder="Колонка в джерелі"
                  value={form.level1_field}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Наше поле: level2</label>
                <input
                  name="level2_field"
                  placeholder="Колонка в джерелі"
                  value={form.level2_field}
                  onChange={handleChange}
                />
              </div>

              <div className="form-field">
                <label>Наше поле: pnl_id</label>
                <input
                  name="pnl_id_field"
                  placeholder="Колонка в джерелі"
                  value={form.pnl_id_field}
                  onChange={handleChange}
                />
              </div>
            </div>

            <p className="note">
              Приклад: якщо в Google Sheets колонка називається ArticleID, а в
              нашій базі це article_id — у полі article_id потрібно написати
              ArticleID.
            </p>

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

export default ImportSourcesPage;