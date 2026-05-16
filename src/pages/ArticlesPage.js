import React, { useEffect, useState } from "react";

import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";
import LevelCombobox from "../components/ui/LevelCombobox";
import DataCard from "../components/layout/DataCard";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";

import {
  getArticles,
  createArticle,
  updateArticle,
} from "../api/articlesApi";

import { getPnlStructures } from "../api/pnlStructureApi";
import { getLevel2, createLevel2, getLevel1, createLevel1 } from "../api/pnlLevelsApi";

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
  const [level2Options, setLevel2Options] = useState([]);
  const [level1Options, setLevel1Options] = useState([]);
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
    getLevel2().then(setLevel2Options).catch(() => {});
  }, []);

  useEffect(() => {
    const matched = level2Options.find(
      (o) => o.name.toLowerCase() === (form.level2 || "").trim().toLowerCase()
    );
    if (matched) {
      getLevel1(matched.id).then(setLevel1Options).catch(() => setLevel1Options([]));
    } else {
      setLevel1Options([]);
    }
  }, [form.level2, level2Options]);

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

    if (!form.article_type) { setFormError("Оберіть тип статті"); return; }
    if (!form.pnl_id || Number(form.pnl_id) === 0) { setFormError("Оберіть структуру PnL"); return; }

    try {
      if (editArticleId) { await updateArticle(editArticleId, form); }
      else               { await createArticle(form); }
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

  const handleAddLevel2 = async (name) => {
    const result = await createLevel2(name);
    const fresh  = await getLevel2();
    setLevel2Options(fresh);
    setForm((f) => ({ ...f, level2: result.name, level1: "" }));
  };

  const handleAddLevel1 = async (name) => {
    const matched = level2Options.find(
      (o) => o.name.toLowerCase() === (form.level2 || "").trim().toLowerCase()
    );
    if (!matched) return;
    const result = await createLevel1(matched.id, name);
    const fresh  = await getLevel1(matched.id);
    setLevel1Options(fresh);
    setForm((f) => ({ ...f, level1: result.name }));
  };

  const level2Valid = level2Options.some(
    (o) => o.name.toLowerCase() === (form.level2 || "").trim().toLowerCase()
  );

  const filteredArticles = articles.filter((a) =>
    [
      a.article_id, a.article_name, a.article_type, a.level1, a.level2,
      a.pnl_id, a.uid_expense_article, a.expense_element,
      a.expense_company, a.level1_olap, a.level2_olap,
    ]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      key: "article_id", header: "ID статті",
      style: { fontFamily: "monospace", fontSize: 12 },
    },
    { key: "article_name", header: "Назва статті" },
    {
      key: "_type", header: "Тип",
      render: (row) => <span className="badge">{row.article_type}</span>,
    },
    { key: "level1", header: "Level 1" },
    { key: "level2", header: "Level 2" },
    { key: "pnl_id", header: "PnL ID" },
    {
      key: "uid_expense_article", header: "UUID статті",
      style: { fontFamily: "monospace", fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" },
      cellTitle: (row) => row.uid_expense_article || "",
      render: (row) => row.uid_expense_article || <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "expense_element", header: "Елемент витрат",
      style: { maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" },
      cellTitle: (row) => row.expense_element || "",
      render: (row) => row.expense_element || <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "expense_company", header: "Компанія",
      style: { maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" },
      cellTitle: (row) => row.expense_company || "",
      render: (row) => row.expense_company || <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "level1_olap", header: "Level 1 OLAP",
      style: { maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" },
      cellTitle: (row) => row.level1_olap || "",
      render: (row) => row.level1_olap || <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "level2_olap", header: "Level 2 OLAP",
      style: { maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" },
      cellTitle: (row) => row.level2_olap || "",
      render: (row) => row.level2_olap || <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "_status", header: "Активна",
      render: (row) => (
        <span className={row.is_active ? "status active" : "status inactive"}>
          {row.is_active ? "Активна" : "Неактивна"}
        </span>
      ),
    },
    {
      key: "_actions", header: "Дії",
      thStyle: { textAlign: "center" },
      style:   { textAlign: "center", whiteSpace: "nowrap" },
      render: (row) => (
        <>
          <button className="icon-btn edit"   onClick={() => openEditModal(row)}>✎</button>
          <button className="icon-btn delete" onClick={() => alert("Деактивацію підключимо наступним пакетом")}>×</button>
        </>
      ),
    },
  ];

  return (
    <>
      <DataCard
        title="Статті PnL"
        subtitle="Довідник статей, які використовуються у PnL-моделі."
        actions={
          <>
            <Button variant="secondary" onClick={() => setActivePage("articleImport")}>
              ⬇ Імпорт
            </Button>
            <Button variant="secondary" onClick={() => setActivePage("importSources", { tab: "articles" })}>
              🔗 Відповідність статей
            </Button>
            <Button variant="primary" onClick={openAddModal}>
              + Додати статтю
            </Button>
          </>
        }
      >
        {loadError && <div className="error-message">{loadError}</div>}

        <TableToolbar
          filters={[{
            key: "search", type: "search", label: "Пошук",
            value: search, onChange: setSearch, placeholder: "Пошук статті...",
          }]}
        />

        <DataTable
          columns={columns}
          rows={filteredArticles}
          rowKey="article_id"
          loading={isLoading}
          emptyMessage="Статей поки немає або нічого не знайдено."
        />
      </DataCard>

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
                <label>Level 2</label>
                <LevelCombobox
                  options={level2Options}
                  value={form.level2}
                  onChange={(name) => setForm((f) => ({ ...f, level2: name }))}
                  onSelect={(name) => setForm((f) => ({ ...f, level2: name, level1: "" }))}
                  onAdd={handleAddLevel2}
                  addLabel="у довідник Level 2"
                  placeholder="Пошук або введіть Level 2..."
                />
              </div>

              <div className="form-field">
                <label>Level 1</label>
                <LevelCombobox
                  options={level1Options}
                  value={form.level1}
                  onChange={(name) => setForm((f) => ({ ...f, level1: name }))}
                  onAdd={handleAddLevel1}
                  disabled={!form.level2.trim() || !level2Valid}
                  addLabel="у довідник Level 1"
                  placeholder={!form.level2.trim() || !level2Valid ? "Спочатку оберіть Level 2" : "Пошук або введіть Level 1..."}
                />
                {form.level2.trim() && !level2Valid && (
                  <div style={{ fontSize: 11, color: "#e67e22", marginTop: 4 }}>
                    Спочатку оберіть або створіть Level 2
                  </div>
                )}
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
                <input name="expense_element" value={form.expense_element} onChange={handleChange} />
              </div>

              <div className="form-field">
                <label>Компанія</label>
                <input name="expense_company" value={form.expense_company} onChange={handleChange} />
              </div>

              <div className="form-field">
                <label>Level 1 OLAP</label>
                <input name="level1_olap" value={form.level1_olap} onChange={handleChange} />
              </div>

              <div className="form-field">
                <label>Level 2 OLAP</label>
                <input name="level2_olap" value={form.level2_olap} onChange={handleChange} />
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
    </>
  );
}

export default ArticlesPage;
