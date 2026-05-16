import React, { useEffect, useState, useCallback } from "react";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";
import LevelCombobox from "../components/ui/LevelCombobox";
import StatusBadge from "../components/ui/StatusBadge";
import DataCard from "../components/layout/DataCard";
import KPIGrid from "../components/layout/KPIGrid";
import DataTable from "../components/table/DataTable";
import TableToolbar from "../components/table/TableToolbar";
import { getImportSources } from "../api/importSourcesApi";
import {
  getStagedArticles,
  getMasterArticles,
  getStagedCompanies,
  bindStagedArticle,
  deleteBind,
  previewAutoBindByUUID,
  confirmUUIDBindings,
} from "../api/articleSourceMappingApi";
import { getArticles, createArticle, updateArticle } from "../api/articlesApi";
import { getPnlStructures } from "../api/pnlStructureApi";
import { getLevel2, createLevel2, getLevel1, createLevel1 } from "../api/pnlLevelsApi";

// ── UUID preview modal ────────────────────────────────────────────────────────

function UUIDPreviewModal({ matches, onConfirm, onClose }) {
  const [selected, setSelected] = useState(
    () => new Set(matches.map((m) => `${m.source_id}__${m.source_article_id}`))
  );

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      selected.size === matches.length
        ? new Set()
        : new Set(matches.map((m) => `${m.source_id}__${m.source_article_id}`))
    );

  const handleConfirm = () => {
    const bindings = matches
      .filter((m) => selected.has(`${m.source_id}__${m.source_article_id}`))
      .map((m) => ({
        source_id:         m.source_id,
        source_article_id: m.source_article_id,
        master_article_id: m.master_article_id,
      }));
    onConfirm(bindings);
  };

  return (
    <Modal title="UUID-підбір: підтвердження прив'язок" onClose={onClose} size="large">
      <div style={{ marginBottom: 12, fontSize: 13, color: "#555" }}>
        Знайдено <strong>{matches.length}</strong> збігів за UUID (uid_expense_article).
        Відмітьте прив'язки, які потрібно підтвердити.
      </div>

      {matches.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#888", fontSize: 14 }}>
          Збігів за UUID не знайдено. Перевірте, що у master-статтях заповнено UUID.
        </div>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
          <table className="data-table compact" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={selected.size === matches.length} onChange={toggleAll} />
                </th>
                <th>Компанія</th>
                <th>Staging стаття</th>
                <th>UUID</th>
                <th>Master стаття</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const key = `${m.source_id}__${m.source_article_id}`;
                return (
                  <tr
                    key={key}
                    style={{ cursor: "pointer", background: selected.has(key) ? "#f0f7ff" : undefined }}
                    onClick={() => toggle(key)}
                  >
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggle(key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.expense_company || "—"}
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: 11 }}>{m.source_article_id}</span>
                      {" "}{m.source_article_name}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 10, color: "#666", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis" }} title={m.uuid}>
                      {m.uuid}
                    </td>
                    <td style={{ color: "#155724", fontWeight: 500 }}>
                      {m.master_article_id} — {m.master_article_name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>Скасувати</Button>
        {matches.length > 0 && (
          <Button variant="primary" onClick={handleConfirm} disabled={selected.size === 0}>
            Підтвердити обрані ({selected.size})
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ── Create article from staging modal ────────────────────────────────────────

const emptyCreateForm = {
  article_id: "", article_name: "", article_type: "", level1: "", level2: "",
  pnl_id: "", uid_expense_article: "", expense_element: "", expense_company: "",
  level1_olap: "", level2_olap: "",
};

function CreateFromStagingModal({ stagingRow, pnlStructures, onCreated, onClose }) {
  const [form, setForm] = useState(() => ({
    ...emptyCreateForm,
    article_id:          stagingRow.source_article_id   || "",
    article_name:        stagingRow.source_article_name || "",
    article_type:        stagingRow.source_article_type || "",
    level1:              stagingRow.source_level1        || "",
    level2:              stagingRow.source_level2        || "",
    uid_expense_article: stagingRow.uid_expense_article  || "",
    expense_element:     stagingRow.expense_element      || "",
    expense_company:     stagingRow.expense_company      || "",
    level1_olap:         stagingRow.level1_olap          || "",
    level2_olap:         stagingRow.level2_olap          || "",
  }));
  const [error,        setError]        = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [level2Options, setLevel2Options] = useState([]);
  const [level1Options, setLevel1Options] = useState([]);

  useEffect(() => {
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

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.article_type) { setError("Оберіть тип статті"); return; }
    if (!form.pnl_id || Number(form.pnl_id) === 0) { setError("Оберіть структуру PnL"); return; }
    setSaving(true);
    try {
      const res = await createArticle(form);
      onCreated(res.article?.article_id || form.article_id);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        Array.isArray(detail) ? detail.map((e) => e.msg).join("; ")
          : typeof detail === "string" ? detail
          : "Помилка створення статті"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Створити нову master-статтю зі staging" onClose={onClose} size="large">
      <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fff8e1", border: "1px solid #ffe066", borderRadius: 4, fontSize: 13, color: "#856404" }}>
        Дані попередньо заповнено зі staging-запису. Перевірте і доповніть поля.
        Після збереження буде автоматично створено прив'язку.
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>ID статті *</label>
            <input name="article_id" value={form.article_id} onChange={handleChange} required style={{ fontFamily: "monospace" }} />
          </div>
          <div className="form-field">
            <label>Тип *</label>
            <select name="article_type" value={form.article_type} onChange={handleChange} required>
              <option value="">— Оберіть тип —</option>
              <option value="Дохід">Дохід</option>
              <option value="Витрати">Витрати</option>
            </select>
          </div>
          <div className="form-field full">
            <label>Назва статті *</label>
            <input name="article_name" value={form.article_name} onChange={handleChange} required />
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
            <label>UUID статті</label>
            <input name="uid_expense_article" value={form.uid_expense_article} onChange={handleChange} style={{ fontFamily: "monospace", fontSize: 13 }} placeholder="GUID з OLAP" />
          </div>
          <div className="form-field"><label>Елемент витрат</label><input name="expense_element" value={form.expense_element} onChange={handleChange} /></div>
          <div className="form-field"><label>Компанія</label><input name="expense_company" value={form.expense_company} onChange={handleChange} /></div>
          <div className="form-field"><label>Level 1 OLAP</label><input name="level1_olap" value={form.level1_olap} onChange={handleChange} /></div>
          <div className="form-field"><label>Level 2 OLAP</label><input name="level2_olap" value={form.level2_olap} onChange={handleChange} /></div>
        </div>
        {error && <div className="error-message" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Скасувати</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Збереження..." : "Створити та прив'язати"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit master article modal ─────────────────────────────────────────────────

function EditArticleModal({ articleId, pnlStructures, onSaved, onClose }) {
  const [form,         setForm]         = useState(null);
  const [level2Options, setLevel2Options] = useState([]);
  const [level1Options, setLevel1Options] = useState([]);
  const [error,        setError]        = useState(null);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    Promise.all([getArticles(), getLevel2()])
      .then(([articles, lv2]) => {
        const art = articles.find((a) => a.article_id === articleId);
        if (art) {
          setForm({
            article_id:          art.article_id          || "",
            article_name:        art.article_name        || "",
            article_type:        art.article_type        || "",
            level1:              art.level1              || "",
            level2:              art.level2              || "",
            pnl_id:              art.pnl_id ? String(art.pnl_id) : "",
            is_active:           art.is_active !== false,
            uid_expense_article: art.uid_expense_article || "",
            expense_element:     art.expense_element     || "",
            expense_company:     art.expense_company     || "",
            level1_olap:         art.level1_olap         || "",
            level2_olap:         art.level2_olap         || "",
          });
        } else {
          setError("Статтю не знайдено");
        }
        setLevel2Options(lv2);
      })
      .catch(() => setError("Помилка завантаження даних статті"));
  }, [articleId]);

  useEffect(() => {
    if (!form) return;
    const matched = level2Options.find(
      (o) => o.name.toLowerCase() === (form.level2 || "").trim().toLowerCase()
    );
    if (matched) {
      getLevel1(matched.id).then(setLevel1Options).catch(() => setLevel1Options([]));
    } else {
      setLevel1Options([]);
    }
  }, [form?.level2, level2Options]);

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
    (o) => o.name.toLowerCase() === (form?.level2 || "").trim().toLowerCase()
  );

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.article_type) { setError("Оберіть тип статті"); return; }
    if (!form.pnl_id || Number(form.pnl_id) === 0) { setError("Оберіть структуру PnL"); return; }
    setSaving(true);
    try {
      await updateArticle(articleId, form);
      onSaved(articleId, form.article_name);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        Array.isArray(detail) ? detail.map((e) => e.msg).join("; ")
          : typeof detail === "string" ? detail
          : "Помилка збереження статті"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Редагувати master-статтю" onClose={onClose} size="large">
      {!form && !error && (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#888" }}>Завантаження...</div>
      )}
      {error && <div className="error-message">{error}</div>}
      {form && (
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>ID статті</label>
              <input value={form.article_id} readOnly style={{ background: "#f8f8f8", color: "#888" }} />
            </div>
            <div className="form-field">
              <label>Тип *</label>
              <select name="article_type" value={form.article_type} onChange={handleChange} required>
                <option value="">— Оберіть тип —</option>
                <option value="Дохід">Дохід</option>
                <option value="Витрати">Витрати</option>
              </select>
            </div>
            <div className="form-field full">
              <label>Назва статті *</label>
              <input name="article_name" value={form.article_name} onChange={handleChange} required />
            </div>
            <div className="form-field full">
              <label>PnL структура *</label>
              <SearchableSelect
                options={pnlStructures}
                value={form.pnl_id}
                onChange={(val) => setForm((f) => ({ ...f, pnl_id: val || "" }))}
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
              <label>UUID статті</label>
              <input name="uid_expense_article" value={form.uid_expense_article} onChange={handleChange} style={{ fontFamily: "monospace", fontSize: 13 }} placeholder="GUID з OLAP" />
            </div>
            <div className="form-field"><label>Елемент витрат</label><input name="expense_element" value={form.expense_element} onChange={handleChange} /></div>
            <div className="form-field"><label>Компанія</label><input name="expense_company" value={form.expense_company} onChange={handleChange} /></div>
            <div className="form-field"><label>Level 1 OLAP</label><input name="level1_olap" value={form.level1_olap} onChange={handleChange} /></div>
            <div className="form-field"><label>Level 2 OLAP</label><input name="level2_olap" value={form.level2_olap} onChange={handleChange} /></div>
            <div className="form-field full checkbox-field">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  name="is_active"
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Активна
              </label>
            </div>
          </div>
          {error && <div className="error-message" style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? "Збереження..." : "Зберегти"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Master cell renderer ──────────────────────────────────────────────────────

function MasterCell({ row, masters, saving, onBind }) {
  const isMapped = !!row.master_article_id;
  const isSaving = saving[`${row.source_id}__${row.source_article_id}`];

  if (isMapped) {
    return (
      <span
        style={{ fontSize: 12, color: "#155724", fontWeight: 500, display: "block", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
        title={`${row.master_article_id} — ${row.master_article_name}`}
      >
        {row.master_article_id} — {row.master_article_name}
      </span>
    );
  }
  return (
    <div style={{ minWidth: 220 }}>
      <SearchableSelect
        options={masters}
        value=""
        onChange={(val) => { if (val) onBind(row, val); }}
        getOptionValue={(m) => m.article_id}
        getOptionLabel={(m) => `${m.article_id} — ${m.article_name}`}
        placeholder="Пошук по ID або назві..."
        disabled={isSaving}
      />
    </div>
  );
}

// ── Actions cell renderer ─────────────────────────────────────────────────────

function ActionsCell({ row, saving, onClear, onReject, onCreate, onEdit }) {
  const isMapped = !!row.master_article_id;
  const isSaving = saving[`${row.source_id}__${row.source_article_id}`];

  if (isMapped) {
    return (
      <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
        <button
          className="icon-btn edit"
          onClick={() => onEdit(row.master_article_id)}
          disabled={isSaving}
          title="Редагувати master-статтю"
          style={{ fontSize: 15, padding: "2px 6px" }}
        >
          ✎
        </button>
        <button className="asm-btn asm-btn-clear" onClick={() => onClear(row)} disabled={isSaving}>
          Скинути
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {row.mapping_status !== "rejected" && (
        <button className="asm-btn asm-btn-reject" onClick={() => onReject(row)} disabled={isSaving}>
          Відхилити
        </button>
      )}
      <button className="asm-btn asm-btn-create" onClick={() => onCreate(row)} disabled={isSaving}>
        + Створити
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ArticleSourceMappingPage({ setActivePage, initialSourceId = "", asTab = false }) {
  // ── reference data ────────────────────────────────────────────────────────
  const [sources,       setSources]       = useState([]);
  const [masters,       setMasters]       = useState([]);
  const [companies,     setCompanies]     = useState([]);
  const [pnlStructures, setPnlStructures] = useState([]);

  // ── filters ───────────────────────────────────────────────────────────────
  const [filterSource,  setFilterSource]  = useState(String(initialSourceId || ""));
  const [filterCompany, setFilterCompany] = useState("");
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [searchInput,   setSearchInput]   = useState("");
  const [search,        setSearch]        = useState("");

  // ── pagination ────────────────────────────────────────────────────────────
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // ── data ──────────────────────────────────────────────────────────────────
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [kpi,     setKpi]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [saving,  setSaving]  = useState({});

  // ── modals ────────────────────────────────────────────────────────────────
  const [uuidPreview, setUuidPreview] = useState(null);
  const [uuidLoading, setUuidLoading] = useState(false);
  const [createModal, setCreateModal] = useState(null);
  const [editModal,   setEditModal]   = useState(null); // master_article_id

  // ── init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    getImportSources().then(setSources).catch(() => {});
    getMasterArticles().then(setMasters).catch(() => {});
    getPnlStructures().then(setPnlStructures).catch(() => {});
  }, []);

  useEffect(() => {
    getStagedCompanies(filterSource || undefined).then(setCompanies).catch(() => {});
  }, [filterSource]);

  // ── debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── data loading ──────────────────────────────────────────────────────────
  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, page_size: pageSize };
      if (filterSource)           params.source_id      = filterSource;
      if (filterCompany)          params.company         = filterCompany;
      if (filterStatus !== "all") params.mapping_status  = filterStatus;
      if (search)                 params.search          = search;
      const res = await getStagedArticles(params);
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setKpi(res.kpi || null);
    } catch {
      setError("Помилка завантаження даних");
    } finally {
      setLoading(false);
    }
  }, [filterSource, filterCompany, filterStatus, search, page, pageSize]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // ── filter handlers ───────────────────────────────────────────────────────
  const handleFilterSource  = (val) => { setFilterSource(val); setFilterCompany(""); setPage(1); };
  const handleFilterCompany = (val) => { setFilterCompany(val); setPage(1); };
  const handleFilterStatus  = (val) => { setFilterStatus(val);  setPage(1); };

  // ── bind / clear / reject ─────────────────────────────────────────────────
  // freshMasters — pass when masters state may be stale (e.g. right after createArticle)
  const handleBind = async (row, masterArticleId, freshMasters = null) => {
    const key = `${row.source_id}__${row.source_article_id}`;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await bindStagedArticle(row.source_id, row.source_article_id, masterArticleId || null);
      const masterList = freshMasters || masters;
      const masterName = masterList.find((m) => m.article_id === masterArticleId)?.article_name || null;
      setRows((prev) =>
        prev.map((r) =>
          r.source_id === row.source_id && r.source_article_id === row.source_article_id
            ? { ...r, master_article_id: masterArticleId || null, mapping_status: masterArticleId ? "mapped" : "rejected", master_article_name: masterName }
            : r
        )
      );
    } catch {
      setError("Помилка збереження прив'язки");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const handleClear = async (row) => {
    const key = `${row.source_id}__${row.source_article_id}`;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await deleteBind(row.source_id, row.source_article_id);
      setRows((prev) =>
        prev.map((r) =>
          r.source_id === row.source_id && r.source_article_id === row.source_article_id
            ? { ...r, master_article_id: null, mapping_status: "pending", master_article_name: null }
            : r
        )
      );
    } catch {
      setError("Помилка скидання прив'язки");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const handleReject = (row) => handleBind(row, null);

  // ── UUID preview ──────────────────────────────────────────────────────────
  const handleUUIDPreview = async () => {
    setUuidLoading(true);
    setError(null);
    try {
      const res = await previewAutoBindByUUID(filterSource || undefined);
      if (res.status === "ok") {
        setUuidPreview({ matches: res.matches });
      } else {
        setError(res.message || "Помилка UUID-підбору");
      }
    } catch {
      setError("Помилка UUID-підбору");
    } finally {
      setUuidLoading(false);
    }
  };

  const handleUUIDConfirm = async (bindings) => {
    try {
      const res = await confirmUUIDBindings(bindings);
      if (res.status === "ok") { setUuidPreview(null); await loadRows(); }
      else setError(res.message || "Помилка підтвердження UUID-прив'язок");
    } catch {
      setError("Помилка підтвердження UUID-прив'язок");
    }
  };

  const handleCreatedAndBound = async (articleId, stagingRow) => {
    setCreateModal(null);
    // Refresh masters so the new article is immediately available in dropdowns
    // and its name can be resolved for the bound row display.
    const freshMasters = await getMasterArticles().catch(() => null);
    if (freshMasters) setMasters(freshMasters);
    // Bind using the fresh list so masterName resolves correctly right away.
    await handleBind(stagingRow, articleId, freshMasters);
    // Reload rows + KPI to reflect the new binding.
    await loadRows();
  };

  const handleArticleSaved = (articleId, newName) => {
    setEditModal(null);
    // Update master name in both rows and masters lists
    setRows((prev) =>
      prev.map((r) =>
        r.master_article_id === articleId ? { ...r, master_article_name: newName } : r
      )
    );
    setMasters((prev) =>
      prev.map((m) =>
        m.article_id === articleId ? { ...m, article_name: newName } : m
      )
    );
  };

  // ── OLAP-source detection ─────────────────────────────────────────────────
  const OLAP_SOURCE_TYPES = ["olap_ssas_dax", "sql_odbc", "olap_sql"];
  const selectedSourceObj = sources.find((s) => String(s.id) === filterSource);
  const showUuidButton = !filterSource || OLAP_SOURCE_TYPES.includes(selectedSourceObj?.source_type || "");

  // ── column definitions ────────────────────────────────────────────────────
  const columns = [
    {
      key: "source_name", header: "Джерело",
      style: { maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" },
    },
    {
      key: "source_article_id", header: "ID",
      style: { fontFamily: "monospace", fontSize: 11 },
    },
    {
      key: "source_article_name", header: "Назва статті",
      style: { maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" },
      cellTitle: (row) => row.source_article_name,
    },
    {
      key: "expense_company", header: "Компанія",
      style: { maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" },
    },
    {
      key: "expense_element", header: "Ел. витрат",
      style: { maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" },
    },
    {
      key: "_l1", header: "L1",
      style: { maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" },
      render: (row) => row.level1_olap || row.source_level1,
    },
    {
      key: "_l2", header: "L2",
      style: { maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" },
      render: (row) => row.level2_olap || row.source_level2,
    },
    {
      key: "mapping_status", header: "Статус",
      render: (row) => <StatusBadge status={row.mapping_status} />,
    },
    {
      key: "_master", header: "Master-стаття",
      thStyle: { minWidth: 240 },
      style:   { minWidth: 240 },
      render: (row) => (
        <MasterCell row={row} masters={masters} saving={saving} onBind={handleBind} />
      ),
    },
    {
      key: "_actions", header: "Дії",
      thStyle: { textAlign: "center" },
      style:   { textAlign: "center", whiteSpace: "nowrap" },
      render: (row) => (
        <ActionsCell
          row={row}
          saving={saving}
          onClear={handleClear}
          onReject={handleReject}
          onCreate={setCreateModal}
          onEdit={setEditModal}
        />
      ),
    },
  ];

  // ── KPI cards config ──────────────────────────────────────────────────────
  const kpiCards = kpi
    ? [
        { label: "Всього",        value: kpi.total,    variant: "total"    },
        { label: "Не прив'язано", value: kpi.pending,  variant: "pending"  },
        { label: "Прив'язано",    value: kpi.mapped,   variant: "mapped"   },
        { label: "Відхилено",     value: kpi.rejected, variant: "rejected" },
      ]
    : null;

  // ── filter toolbar config ─────────────────────────────────────────────────
  const tableFilters = [
    {
      key: "source", type: "select", label: "Джерело",
      value: filterSource, onChange: handleFilterSource,
      options: [
        { value: "", label: "Всі джерела" },
        ...sources.map((s) => ({ value: String(s.id), label: s.source_name })),
      ],
    },
    {
      key: "company", type: "select", label: "Компанія",
      value: filterCompany, onChange: handleFilterCompany,
      options: [
        { value: "", label: "Всі компанії" },
        ...companies.map((c) => ({ value: c, label: c })),
      ],
    },
    {
      key: "status", type: "select", label: "Статус",
      value: filterStatus, onChange: handleFilterStatus,
      options: [
        { value: "all",      label: "Всі"           },
        { value: "pending",  label: "Не прив'язано" },
        { value: "mapped",   label: "Прив'язано"    },
        { value: "auto",     label: "Авто"           },
        { value: "rejected", label: "Відхилено"     },
      ],
    },
    {
      key: "search", type: "search", label: "Пошук",
      value: searchInput, onChange: setSearchInput,
      placeholder: "ID або назва статті...",
    },
  ];

  const emptyMsg = search || filterSource || filterCompany || filterStatus !== "all"
    ? "За вказаними фільтрами записів не знайдено."
    : "Staging-таблиця порожня. Спочатку виконайте «Імпорт статей» з OLAP-джерела.";

  // ── render ────────────────────────────────────────────────────────────────
  const uuidAction = showUuidButton ? [{
    label: uuidLoading ? "Пошук..." : "⚡ UUID-підбір",
    onClick: handleUUIDPreview,
    disabled: uuidLoading || loading,
    title: "Знайти збіги за UUID та запропонувати прив'язки",
  }] : [];

  const tableContent = (
    <>
      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c33", fontWeight: 700, fontSize: 16 }}>✕</button>
        </div>
      )}

      <KPIGrid cards={kpiCards} />

      <TableToolbar
        filters={tableFilters}
        pageSize={{
          value: pageSize,
          onChange: (n) => { setPageSize(n); setPage(1); },
        }}
        actions={uuidAction}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => `${row.source_id}__${row.source_article_id}`}
        rowClassName={(row) => !row.master_article_id && row.mapping_status !== "rejected" ? "row-pending" : ""}
        loading={loading}
        emptyMessage={emptyMsg}
        pagination={{ page, pageSize, total, onChange: setPage }}
      />
    </>
  );

  return (
    <>
      {asTab ? tableContent : (
        <DataCard
          title="Відповідність статей"
          subtitle="Прив'язка статей з усіх джерел (OLAP, Google Sheets, Excel, CSV) до master-довідника PnL."
          actions={
            <>
              <Button variant="secondary" onClick={() => setActivePage("articles")}>
                ← До статей PnL
              </Button>
              <Button variant="secondary" onClick={() => setActivePage("articleImport")}>
                ⬇ Імпорт статей
              </Button>
            </>
          }
        >
          {tableContent}
        </DataCard>
      )}

      {uuidPreview && (
        <UUIDPreviewModal
          matches={uuidPreview.matches}
          onConfirm={handleUUIDConfirm}
          onClose={() => setUuidPreview(null)}
        />
      )}

      {createModal && (
        <CreateFromStagingModal
          stagingRow={createModal}
          pnlStructures={pnlStructures}
          onCreated={(articleId) => handleCreatedAndBound(articleId, createModal)}
          onClose={() => setCreateModal(null)}
        />
      )}

      {editModal && (
        <EditArticleModal
          articleId={editModal}
          pnlStructures={pnlStructures}
          onSaved={handleArticleSaved}
          onClose={() => setEditModal(null)}
        />
      )}
    </>
  );
}

export default ArticleSourceMappingPage;
