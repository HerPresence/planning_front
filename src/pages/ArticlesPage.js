import React, { useEffect, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";
import LevelCombobox from "../components/ui/LevelCombobox";
import { getArticles, createArticle, updateArticle } from "../api/articlesApi";
import { getPnlStructures } from "../api/pnlStructureApi";
import { getLevel2, createLevel2, getLevel1, createLevel1 } from "../api/pnlLevelsApi";

// ── Compact styles ────────────────────────────────────────────────────────────
const thS = {
  padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
  fontWeight: 600, fontSize: 10, color: "#6b7280", background: "#f9fafb",
  position: "sticky", top: 0, whiteSpace: "nowrap",
};
const tdS = { padding: "3px 8px", verticalAlign: "middle", fontSize: 11, lineHeight: 1.35 };
const inpS = { padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12 };

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
  const { canEdit } = usePagePermission("articles");

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

  const iconBtn = (variant) => {
    const v = { blue: { bg: "#eff6ff", br: "#bfdbfe", cl: "#1d4ed8" }, red: { bg: "#fef2f2", br: "#fecaca", cl: "#dc2626" } }[variant] || { bg: "#f9fafb", br: "#e5e7eb", cl: "#374151" };
    return { width: 26, height: 26, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, border: `1px solid ${v.br}`, background: v.bg, color: v.cl, borderRadius: 4, cursor: "pointer" };
  };

  const thAct = { ...thS, position: "sticky", right: 0, zIndex: 3, background: "#f9fafb", boxShadow: "-2px 0 5px rgba(0,0,0,0.07)" };

  const activeCount   = articles.filter(a => a.is_active !== false).length;
  const inactiveCount = articles.filter(a => a.is_active === false).length;
  const dohodCount    = articles.filter(a => a.article_type === "Дохід").length;
  const vytrataCount  = articles.filter(a => a.article_type === "Витрати").length;

  return (
    <>
      <div style={{ background: "#f9fafb", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "10px 20px", display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>Статті PnL</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>Довідник статей, які використовуються у PnL-моделі.</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setActivePage("articleImport")}
              style={{ padding: "5px 11px", fontSize: 12, fontWeight: 500, border: "1px solid #d1d5db",
                       borderRadius: 5, background: "#fff", cursor: "pointer", color: "#374151" }}>
              ⬇ Імпорт
            </button>
            <button onClick={() => setActivePage("importSources", { tab: "articles" })}
              style={{ padding: "5px 11px", fontSize: 12, fontWeight: 500, border: "1px solid #d1d5db",
                       borderRadius: 5, background: "#fff", cursor: "pointer", color: "#374151" }}>
              🔗 Відповідність
            </button>
            {canEdit && (
              <button onClick={openAddModal}
                style={{ padding: "5px 13px", fontSize: 12, fontWeight: 600, border: "none",
                         borderRadius: 5, background: "#7c3aed", color: "#fff", cursor: "pointer",
                         boxShadow: "0 1px 4px rgba(124,58,237,0.25)" }}>
                + Додати статтю
              </button>
            )}
          </div>
        </div>

        {/* ── KPI pills ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "6px 20px", display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {[
            { label: "Всього",      value: articles.length, color: "#374151" },
            { label: "Активних",   value: activeCount,      color: "#059669" },
            { label: "Неактивних", value: inactiveCount,    color: "#dc2626" },
          ].map(({ label, value, color }) => (
            <span key={label} style={{ display: "inline-flex", alignItems: "baseline", gap: 5,
                                        padding: "3px 11px", borderRadius: 20, background: "#f3f4f6", fontSize: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color }}>{value}</span>
              <span style={{ color: "#6b7280" }}>{label}</span>
            </span>
          ))}
          <span style={{ color: "#e5e7eb", margin: "0 4px" }}>|</span>
          {[
            { label: "Дохід",   value: dohodCount,   color: "#059669" },
            { label: "Витрати", value: vytrataCount, color: "#dc2626" },
          ].map(({ label, value, color }) => (
            <span key={label} style={{ display: "inline-flex", alignItems: "baseline", gap: 5,
                                        padding: "3px 11px", borderRadius: 20, background: "#f3f4f6", fontSize: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color }}>{value}</span>
              <span style={{ color: "#6b7280" }}>{label}</span>
            </span>
          ))}
        </div>

        {/* ── Search + count ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "7px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Пошук за ID, назвою, типом, UUID, елементом витрат…"
            style={{ ...inpS, width: 360 }} />
          {search && (
            <button onClick={() => setSearch("")}
              style={{ padding: "4px 8px", fontSize: 11, border: "1px solid #d1d5db",
                       borderRadius: 4, cursor: "pointer", background: "#fff", color: "#6b7280" }}>✕</button>
          )}
          <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>
            {filteredArticles.length} / {articles.length} статей
          </span>
        </div>

        {loadError && (
          <div style={{ margin: "8px 20px", padding: "8px 12px", background: "#fee2e2",
                        border: "1px solid #fca5a5", borderRadius: 5, fontSize: 13, color: "#991b1b" }}>
            {loadError}
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000, fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: 70 }}>PnL ID</th>
                <th style={thS}>Level 2</th>
                <th style={thS}>Level 1</th>
                <th style={{ ...thS, width: 60 }}>Тип</th>
                <th style={{ ...thS, width: 160 }}>UUID статті</th>
                <th style={{ ...thS, width: 150 }}>Елемент витрат</th>
                <th style={{ ...thS, width: 100 }}>Компанія</th>
                <th style={{ ...thS, width: 110 }}>Level 1 OLAP</th>
                <th style={{ ...thS, width: 110 }}>Level 2 OLAP</th>
                <th style={{ ...thS, width: 72 }}>Активна</th>
                {canEdit && <th style={{ ...thAct, textAlign: "center", width: 56 }}>Дії</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={canEdit ? 11 : 10}
                  style={{ ...tdS, textAlign: "center", padding: "28px 0", color: "#9ca3af" }}>
                  Завантаження…
                </td></tr>
              )}
              {!isLoading && filteredArticles.length === 0 && (
                <tr><td colSpan={canEdit ? 11 : 10}
                  style={{ ...tdS, textAlign: "center", padding: "32px 0", color: "#9ca3af" }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div>
                  Статей не знайдено
                </td></tr>
              )}
              {!isLoading && filteredArticles.map(row => (
                <tr key={row.article_id}
                  style={{ borderBottom: "1px solid #f3f4f6", background: row.is_active === false ? "#fff5f5" : "#fff" }}
                  onMouseEnter={e => { e.currentTarget.style.background = row.is_active === false ? "#fef2f2" : "#fafafa"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = row.is_active === false ? "#fff5f5" : "#fff"; }}>

                  {/* PnL ID */}
                  <td style={{ ...tdS, fontFamily: "monospace", fontWeight: 600, color: "#374151" }}>
                    {row.pnl_id || <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>

                  {/* Level 2 */}
                  <td style={{ ...tdS, maxWidth: 200 }}>
                    <span style={{ fontWeight: 500, display: "block", whiteSpace: "nowrap",
                                   overflow: "hidden", textOverflow: "ellipsis" }}
                          title={row.level2 || ""}>
                      {row.level2 || <span style={{ color: "#d1d5db" }}>—</span>}
                    </span>
                    {row.article_name && (
                      <span style={{ fontSize: 10, color: "#9ca3af", display: "block", whiteSpace: "nowrap",
                                     overflow: "hidden", textOverflow: "ellipsis" }}>
                        {row.article_name}
                      </span>
                    )}
                  </td>

                  {/* Level 1 */}
                  <td style={{ ...tdS, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={row.level1 || ""}>
                    {row.level1 || <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>

                  {/* Тип */}
                  <td style={tdS}>
                    {row.article_type ? (
                      <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4,
                                     fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
                                     background: row.article_type === "Дохід" ? "#d1fae5" : "#fee2e2",
                                     color:      row.article_type === "Дохід" ? "#065f46" : "#991b1b" }}>
                        {row.article_type}
                      </span>
                    ) : <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>

                  {/* UUID */}
                  <td style={tdS}>
                    {row.uid_expense_article ? (
                      <code style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap",
                                     display: "block", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 155 }}
                            title={row.uid_expense_article}>
                        {row.uid_expense_article}
                      </code>
                    ) : <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>

                  {/* Елемент витрат */}
                  <td style={{ ...tdS, maxWidth: 145, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={row.expense_element || ""}>
                    {row.expense_element || <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>

                  {/* Компанія */}
                  <td style={{ ...tdS, maxWidth: 95, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={row.expense_company || ""}>
                    {row.expense_company || <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>

                  {/* Level 1 OLAP */}
                  <td style={{ ...tdS, maxWidth: 105, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={row.level1_olap || ""}>
                    {row.level1_olap || <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>

                  {/* Level 2 OLAP */}
                  <td style={{ ...tdS, maxWidth: 105, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={row.level2_olap || ""}>
                    {row.level2_olap || <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>

                  {/* Активна */}
                  <td style={tdS}>
                    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4,
                                   fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
                                   background: row.is_active !== false ? "#d1fae5" : "#fee2e2",
                                   color:      row.is_active !== false ? "#065f46" : "#991b1b" }}>
                      {row.is_active !== false ? "Активна" : "Неактивна"}
                    </span>
                  </td>

                  {/* Дії */}
                  {canEdit && (
                    <td style={{ ...tdS, textAlign: "center", position: "sticky", right: 0, zIndex: 1,
                                 background: row.is_active === false ? "#fff5f5" : "#fff",
                                 boxShadow: "-2px 0 5px rgba(0,0,0,0.04)" }}>
                      <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                        <button onClick={() => openEditModal(row)} title="Редагувати" style={iconBtn("blue")}>✎</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
              <button type="button" onClick={() => setShowModal(false)}
                style={{ padding: "7px 18px", fontSize: 13, fontWeight: 500, border: "1px solid #d1d5db",
                         borderRadius: 5, background: "#fff", color: "#374151", cursor: "pointer" }}>
                Скасувати
              </button>
              <button type="submit"
                style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600, border: "none",
                         borderRadius: 5, background: "#7c3aed", color: "#fff", cursor: "pointer",
                         boxShadow: "0 1px 4px rgba(124,58,237,0.25)" }}>
                Зберегти
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default ArticlesPage;
