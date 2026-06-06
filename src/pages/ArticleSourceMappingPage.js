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
  getArticleCoverage,
} from "../api/articleSourceMappingApi";
import { getArticles, getArticleById, createArticle, updateArticle } from "../api/articlesApi";
import BulkFillModal from "./BulkFillModal";
import BulkCreateModal from "./BulkCreateModal";
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
    // defaults from bulk-fill take priority over raw staging values
    article_name:        stagingRow.default_master_article_name || stagingRow.source_article_name || "",
    article_type:        stagingRow.default_article_type        || stagingRow.source_article_type || "",
    level1:              stagingRow.default_master_level1       || stagingRow.source_level1        || "",
    level2:              stagingRow.default_master_level2       || stagingRow.source_level2        || "",
    pnl_id:              stagingRow.default_pnl_id ? String(stagingRow.default_pnl_id) : "",
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
    Promise.all([getArticleById(articleId), getLevel2()])
      .then(([art, lv2]) => {
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
      onSaved(articleId, form);
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

// ── Eligible-row check (pending + all required staging defaults present) ──────

function isEligible(row) {
  if (row.master_article_id || row.mapping_status === "rejected") return false;
  return !!(
    (row.default_article_type || row.source_article_type) &&
    row.default_pnl_id &&
    (row.default_master_article_name || row.source_article_name)
  );
}

// ── Actions cell renderer ─────────────────────────────────────────────────────

function ActionsCell({ row, saving, onClear, onReject, onCreate, onEdit }) {
  const isMapped = !!row.master_article_id;
  const isSaving = saving[`${row.source_id}__${row.source_article_id}`];
  const eligible = isEligible(row);

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
      <button
        className={`asm-btn ${eligible ? "asm-btn-create-ready" : "asm-btn-create"}`}
        onClick={() => onCreate(row)}
        disabled={isSaving}
        title={eligible ? "Всі поля заповнено — готово до створення" : "Створити master-статтю"}
      >
        {eligible ? "✓ Створити" : "+ Створити"}
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
  const [filterLevel1,       setFilterLevel1]       = useState("");
  const [filterLevel2,       setFilterLevel2]       = useState("");
  const [filterMasterLevel1, setFilterMasterLevel1] = useState("");
  const [filterMasterLevel2, setFilterMasterLevel2] = useState("");
  const [filterPnl,     setFilterPnl]     = useState("");
  const [searchInput,   setSearchInput]   = useState("");
  const [search,        setSearch]        = useState("");
  // advanced filters
  const [showAdvanced,        setShowAdvanced]        = useState(false);
  const [filterOnlyUnmapped,  setFilterOnlyUnmapped]  = useState(false);
  const [filterSourceChanged, setFilterSourceChanged] = useState(false);
  const [filterRecommendation,setFilterRecommendation]= useState("");
  const [filterExpenseType,   setFilterExpenseType]   = useState("");
  const [filterAmountMin,     setFilterAmountMin]      = useState("");
  const [filterAmountMax,     setFilterAmountMax]      = useState("");
  // column visibility (п.9)
  const [hiddenCols, setHiddenCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem("articleMapping_hiddenCols") || "[]"); }
    catch { return []; }
  });
  const [showColSettings, setShowColSettings] = useState(false);
  // planning explanation (п.10)
  const [showPlanningInfo, setShowPlanningInfo] = useState(false);

  // ── pagination ────────────────────────────────────────────────────────────
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // ── data ──────────────────────────────────────────────────────────────────
  const [rows,         setRows]         = useState([]);
  const [total,        setTotal]        = useState(0);
  const [kpi,          setKpi]          = useState(null);
  const [level1Values,       setLevel1Values]       = useState([]);
  const [level2Values,       setLevel2Values]       = useState([]);
  const [masterLevel1Values, setMasterLevel1Values] = useState([]);
  const [masterLevel2Values, setMasterLevel2Values] = useState([]);
  const [pnlValues,          setPnlValues]          = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [saving,       setSaving]       = useState({});

  // ── modals ────────────────────────────────────────────────────────────────
  const [uuidPreview,  setUuidPreview]  = useState(null);
  const [uuidLoading,  setUuidLoading]  = useState(false);
  const [createModal,  setCreateModal]  = useState(null);
  const [editModal,    setEditModal]    = useState(null); // master_article_id
  const [showBulkFill,   setShowBulkFill]   = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkSuccess,    setBulkSuccess]    = useState(null);

  // ── coverage ──────────────────────────────────────────────────────────────
  const [coverage,        setCoverage]        = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

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
      if (filterLevel1)           params.level1          = filterLevel1;
      if (filterLevel2)           params.level2          = filterLevel2;
      if (filterMasterLevel1)     params.master_level1      = filterMasterLevel1;
      if (filterMasterLevel2)     params.master_level2      = filterMasterLevel2;
      if (filterPnl)              params.pnl_structure_id   = filterPnl;
      if (filterOnlyUnmapped)     params.only_unmapped      = true;
      if (filterSourceChanged)    params.source_changed     = true;
      if (filterRecommendation)   params.recommendation     = filterRecommendation;
      if (filterAmountMin)        params.amount_min         = filterAmountMin;
      if (filterAmountMax)        params.amount_max         = filterAmountMax;
      const res = await getStagedArticles(params);
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setKpi(res.kpi || null);
      if (res.filters) {
        setLevel1Values(res.filters.level1_values || []);
        setLevel2Values(res.filters.level2_values || []);
        setMasterLevel1Values(res.filters.master_level1_values || []);
        setMasterLevel2Values(res.filters.master_level2_values || []);
        setPnlValues(res.filters.pnl_structure_values || []);
      }
    } catch {
      setError("Помилка завантаження даних");
    } finally {
      setLoading(false);
    }
  }, [filterSource, filterCompany, filterStatus, search, filterLevel1, filterLevel2, filterMasterLevel1, filterMasterLevel2, filterPnl, filterOnlyUnmapped, filterSourceChanged, filterRecommendation, filterAmountMin, filterAmountMax, page, pageSize]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const loadCoverage = useCallback(() => {
    setCoverageLoading(true);
    getArticleCoverage(filterSource || undefined)
      .then(setCoverage)
      .catch(() => {})
      .finally(() => setCoverageLoading(false));
  }, [filterSource]);

  useEffect(() => { loadCoverage(); }, [loadCoverage]);

  // ── filter handlers ───────────────────────────────────────────────────────
  const handleFilterSource       = (val) => { setFilterSource(val); setFilterCompany(""); setFilterLevel1(""); setFilterLevel2(""); setFilterMasterLevel1(""); setFilterMasterLevel2(""); setFilterPnl(""); setPage(1); };
  const handleFilterCompany      = (val) => { setFilterCompany(val); setPage(1); };
  const handleFilterStatus       = (val) => { setFilterStatus(val);  setPage(1); };
  const handleFilterLevel1       = (val) => { setFilterLevel1(val); setPage(1); };
  const handleFilterLevel2       = (val) => { setFilterLevel2(val); setPage(1); };
  const handleFilterMasterLevel1 = (val) => { setFilterMasterLevel1(val); setPage(1); };
  const handleFilterMasterLevel2 = (val) => { setFilterMasterLevel2(val); setPage(1); };
  const handleFilterPnl          = (val) => { setFilterPnl(val); setPage(1); };

  // ── bind / clear / reject ─────────────────────────────────────────────────
  // freshMasters — pass when masters state may be stale (e.g. right after createArticle)
  const handleBind = async (row, masterArticleId, freshMasters = null) => {
    const key = `${row.source_id}__${row.source_article_id}`;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await bindStagedArticle(row.source_id, row.source_article_id, masterArticleId || null);
      // Optimistic update for instant feedback, then reload for full data (pnl_structure etc.)
      const masterList = freshMasters || masters;
      const masterName = masterList.find((m) => m.article_id === masterArticleId)?.article_name || null;
      setRows((prev) =>
        prev.map((r) =>
          r.source_id === row.source_id && r.source_article_id === row.source_article_id
            ? { ...r, master_article_id: masterArticleId || null, mapping_status: masterArticleId ? "mapped" : "rejected", master_article_name: masterName }
            : r
        )
      );
      await loadRows();
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
      await loadRows();
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

  const handleArticleSaved = async (articleId, form) => {
    setEditModal(null);
    // Optimistic update: reflect changes immediately in visible rows and masters dropdown
    const pnlMatch = pnlValues.find((p) => String(p.id) === String(form.pnl_id));
    setRows((prev) =>
      prev.map((r) =>
        r.master_article_id === articleId
          ? {
              ...r,
              master_article_name: form.article_name,
              master_level1:       form.level1       || null,
              master_level2:       form.level2       || null,
              master_article_type: form.article_type || null,
              pnl_structure_id:    pnlMatch ? pnlMatch.id        : null,
              pnl_structure_code:  pnlMatch ? pnlMatch.pnl_code  : null,
              pnl_structure_name:  pnlMatch ? pnlMatch.pnl_name  : null,
            }
          : r
      )
    );
    setMasters((prev) =>
      prev.map((m) =>
        m.article_id === articleId
          ? { ...m, article_name: form.article_name, level1: form.level1, level2: form.level2, uid_expense_article: form.uid_expense_article }
          : m
      )
    );
    // Reload rows + KPI to pick up any server-side changes (no filter reset)
    await loadRows();
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
      key: "_amount_impact", header: "Сума (PnL)",
      thStyle: { textAlign: "right" },
      style: { textAlign: "right", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" },
      render: (row) => {
        const amt = row.amount_impact;
        if (!amt) return <span style={{color:"#94a3b8"}}>—</span>;
        const color = row.mapping_status === "pending" || !row.master_article_id ? "#991b1b" : "#065f46";
        if (amt >= 1_000_000) return <span style={{color}}>{(amt/1_000_000).toFixed(1)}M</span>;
        if (amt >= 1_000)     return <span style={{color}}>{(amt/1_000).toFixed(0)}K</span>;
        return <span style={{color}}>{Math.round(amt)}</span>;
      },
    },
    {
      key: "expense_element", header: "Ел. витрат",
      style: { maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" },
    },
    {
      key: "_src_l1", header: "Source L1",
      style: { maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-secondary)" },
      cellTitle: (row) => row.level1_olap || row.source_level1 || "",
      render: (row) => row.level1_olap || row.source_level1 || "—",
    },
    {
      key: "_src_l2", header: "Source L2",
      style: { maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-secondary)" },
      cellTitle: (row) => row.level2_olap || row.source_level2 || "",
      render: (row) => row.level2_olap || row.source_level2 || "—",
    },
    {
      key: "_master_l1", header: "Master L1",
      style: { maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 },
      cellTitle: (row) => row.master_level1 || row.default_master_level1 || "",
      render: (row) => row.master_level1
        ? row.master_level1
        : row.default_master_level1
          ? <span className="draft-value">{row.default_master_level1}</span>
          : "—",
    },
    {
      key: "_master_l2", header: "Master L2",
      style: { maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 },
      cellTitle: (row) => row.master_level2 || row.default_master_level2 || "",
      render: (row) => row.master_level2
        ? row.master_level2
        : row.default_master_level2
          ? <span className="draft-value">{row.default_master_level2}</span>
          : "—",
    },
    {
      key: "_master_type", header: "Тип",
      style: { maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis" },
      render: (row) => row.master_article_type
        ? row.master_article_type
        : (row.default_article_type || row.source_article_type)
          ? <span className="draft-value">{row.default_article_type || row.source_article_type}</span>
          : "—",
    },
    {
      key: "_pnl_structure", header: "PNL структура",
      style: { maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" },
      cellTitle: (row) => row.pnl_structure_id
        ? `${row.pnl_structure_id} — ${row.pnl_structure_code || "—"} — ${row.pnl_structure_name || ""}`
        : "",
      render: (row) => row.pnl_structure_id
        ? `${row.pnl_structure_id} — ${row.pnl_structure_code || "—"} — ${row.pnl_structure_name || ""}`
        : "—",
    },
    {
      key: "_source_changed", header: "Зміна",
      thStyle: { textAlign: "center" },
      style: { textAlign: "center" },
      render: (row) => row.source_changed
        ? <span title={row.changed_fields ? JSON.stringify(row.changed_fields, null, 2) : "Поля змінились"}
                style={{cursor:"help", fontSize:14}}>⚠️</span>
        : null,
    },
    {
      key: "_recommendation", header: "Рекомендація",
      render: (row) => {
        const s = row.suggestion;
        if (!s || row.master_article_id) return null;
        const cfg = {
          AUTO_BIND:      { color: "#065f46", bg: "#f0fdf4", border: "#6ee7b7" },
          RECOMMEND:      { color: "#1e40af", bg: "#eff6ff", border: "#93c5fd" },
          REVIEW:         { color: "#92400e", bg: "#fffbeb", border: "#fcd34d" },
          CREATE_MASTER:  { color: "#991b1b", bg: "#fef2f2", border: "#fca5a5" },
        }[s.recommendation] || { color: "#374151", bg: "#f9fafb", border: "#e5e7eb" };
        return (
          <span title={`${s.reason}\nМатч: ${s.match_score}%\nПоля: ${(s.matched_fields||[]).join(', ')}`}
                style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:4,
                        color:cfg.color,background:cfg.bg,border:`1px solid ${cfg.border}`,
                        cursor:"help",whiteSpace:"nowrap"}}>
            {s.recommendation?.replace("_"," ")} {s.match_score > 0 ? `${Math.round(s.match_score)}%` : ""}
          </span>
        );
      },
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

  // ── Lifecycle KPI cards (clickable filters) ───────────────────────────────
  const fmt = (n) => (n ?? 0).toLocaleString("uk-UA");
  const fmtAmt = (n) => {
    if (!n) return "₴0";
    if (n >= 1_000_000) return `₴${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `₴${(n / 1_000).toFixed(0)}K`;
    return `₴${Math.round(n)}`;
  };

  const lifecycleKpis = kpi ? [
    { key: "all",            label: "Всього",          value: kpi.total,          color: "#374151", bg: "#f9fafb", border: "#e5e7eb" },
    { key: "pending",        label: "Pending",          value: kpi.pending,        color: "#92400e", bg: "#fffbeb", border: "#fcd34d" },
    { key: "mapped",         label: "Прив'язано",       value: kpi.mapped_manual,  color: "#065f46", bg: "#f0fdf4", border: "#6ee7b7" },
    { key: "auto",           label: "Авто",             value: kpi.auto,           color: "#1e40af", bg: "#eff6ff", border: "#93c5fd" },
    { key: "rejected",       label: "Відхилено",        value: kpi.rejected,       color: "#991b1b", bg: "#fef2f2", border: "#fca5a5" },
    { key: "source_changed", label: "Source Changed",   value: kpi.source_changed, color: "#7c3aed", bg: "#faf5ff", border: "#c084fc" },
  ] : [];

  const activeKpiFilter = filterStatus === "all" ? "all" : filterStatus;

  // ── Column visibility (п.9) ───────────────────────────────────────────────
  const toggleCol = (key) => {
    setHiddenCols(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem("articleMapping_hiddenCols", JSON.stringify(next));
      return next;
    });
  };
  const visibleColumns = columns.filter(c => !hiddenCols.includes(c.key));

  const ALL_COL_LABELS = {
    "source_name": "Джерело", "source_article_id": "ID",
    "source_article_name": "Назва статті", "expense_company": "Компанія",
    "_amount_impact": "Сума (PnL)", "expense_element": "Ел. витрат",
    "_src_l1": "Source L1", "_src_l2": "Source L2",
    "_master_l1": "Master L1", "_master_l2": "Master L2",
    "_master_type": "Тип", "_pnl_structure": "PNL структура",
    "_source_changed": "Зміна", "_recommendation": "Рекомендація",
    "mapping_status": "Статус", "_master": "Master-стаття", "_actions": "Дії",
  };

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
      key: "level1", type: "select", label: "Source L1",
      value: filterLevel1, onChange: handleFilterLevel1,
      options: [
        { value: "", label: "Всі Source L1" },
        ...level1Values.map((v) => ({ value: v, label: v })),
      ],
    },
    {
      key: "level2", type: "select", label: "Source L2",
      value: filterLevel2, onChange: handleFilterLevel2,
      options: [
        { value: "", label: "Всі Source L2" },
        ...level2Values.map((v) => ({ value: v, label: v })),
      ],
    },
    {
      key: "master_level1", type: "select", label: "Master L1",
      value: filterMasterLevel1, onChange: handleFilterMasterLevel1,
      options: [
        { value: "", label: "Всі Master L1" },
        ...masterLevel1Values.map((v) => ({ value: v, label: v })),
      ],
    },
    {
      key: "master_level2", type: "select", label: "Master L2",
      value: filterMasterLevel2, onChange: handleFilterMasterLevel2,
      options: [
        { value: "", label: "Всі Master L2" },
        ...masterLevel2Values.map((v) => ({ value: v, label: v })),
      ],
    },
    {
      key: "pnl_structure", type: "select", label: "PNL структура",
      value: filterPnl, onChange: handleFilterPnl,
      options: [
        { value: "", label: "Всі PNL структури" },
        ...pnlValues.map((p) => ({
          value: String(p.id),
          label: `${p.id} — ${p.pnl_code || "—"} — ${p.pnl_name}`,
        })),
      ],
    },
    {
      key: "search", type: "search", label: "Пошук",
      value: searchInput, onChange: setSearchInput,
      placeholder: "ID або назва статті...",
    },
  ];

  const emptyMsg = search || filterSource || filterCompany || filterStatus !== "all" || filterLevel1 || filterLevel2 || filterMasterLevel1 || filterMasterLevel2 || filterPnl
    ? "За вказаними фільтрами записів не знайдено."
    : "Staging-таблиця порожня. Спочатку виконайте «Імпорт статей» з OLAP-джерела.";

  // ── render ────────────────────────────────────────────────────────────────
  const handleBulkSuccess = async (res) => {
    setShowBulkFill(false);
    const parts = [];
    if (res.updated_masters > 0) parts.push(`${res.updated_masters} master-статей`);
    if (res.updated_staging  > 0) parts.push(`${res.updated_staging} staging-рядків (дефолт)`);
    setBulkSuccess(`Оновлено: ${parts.join(", ")} — ${res.field_label}: "${res.value}"`);
    getMasterArticles().then(setMasters).catch(() => {});
    await loadRows();
  };

  const handleBulkCreateSuccess = async (res) => {
    setShowBulkCreate(false);
    setBulkSuccess(`Створено master-статей: ${res.created ?? 0}, прив'язано: ${res.bound ?? 0}`);
    getMasterArticles().then(setMasters).catch(() => {});
    await loadRows();
  };

  const uuidAction = showUuidButton ? [{
    label: uuidLoading ? "Пошук..." : "⚡ UUID-підбір",
    onClick: handleUUIDPreview,
    disabled: uuidLoading || loading,
    title: "Знайти збіги за UUID та запропонувати прив'язки",
  }] : [];

  const bulkFillAction = [{
    label: "Заповнити",
    onClick: () => { setBulkSuccess(null); setShowBulkFill(true); },
    disabled: loading,
    title: "Масове заповнення полів master-статей за фільтром",
  }];

  const bulkCreateAction = [{
    label: "Створити все",
    onClick: () => { setBulkSuccess(null); setShowBulkCreate(true); },
    disabled: loading,
    title: "Масове створення master-статей для eligible рядків у фільтрі",
  }];

  const tableContent = (
    <>
      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c33", fontWeight: 700, fontSize: 16 }}>✕</button>
        </div>
      )}
      {bulkSuccess && (
        <div className="success-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{bulkSuccess}</span>
          <button onClick={() => setBulkSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#155724", fontWeight: 700, fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── Lifecycle KPIs ── */}
      {lifecycleKpis.length > 0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {lifecycleKpis.map(k => (
            <div
              key={k.key}
              onClick={() => handleFilterStatus(k.key === "all" ? "all" : k.key)}
              title={`Фільтр: ${k.label}`}
              style={{
                padding:"6px 14px", borderRadius:6, cursor:"pointer", userSelect:"none",
                background: activeKpiFilter === k.key ? k.color : k.bg,
                border:`1.5px solid ${activeKpiFilter === k.key ? k.color : k.border}`,
                color: activeKpiFilter === k.key ? "#fff" : k.color,
                fontWeight:600, fontSize:12, transition:"all .15s",
                display:"flex", flexDirection:"column", alignItems:"center", minWidth:80,
              }}
            >
              <span style={{fontSize:18,lineHeight:1.2}}>{fmt(k.value)}</span>
              <span style={{fontSize:10,marginTop:2,opacity:.85}}>{k.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Coverage block ── */}
      {coverage && (
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontWeight:700,fontSize:13,color:"#1e293b"}}>Покриття маппінгу статей</span>
            <button onClick={loadCoverage} disabled={coverageLoading}
              style={{fontSize:11,padding:"2px 8px",border:"1px solid #cbd5e1",borderRadius:4,background:"#fff",cursor:"pointer",color:"#475569"}}>
              {coverageLoading ? "…" : "↻ Оновити"}
            </button>
          </div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:8}}>
            {[
              {l:"Всього статей",  v:fmt(coverage.total_source_articles), c:"#374151"},
              {l:"Замаплено",      v:fmt(coverage.mapped_articles),        c:"#065f46"},
              {l:"Незамаплено",    v:fmt(coverage.unmapped_articles),       c:coverage.unmapped_articles>0?"#991b1b":"#374151"},
              {l:"Coverage",       v:`${coverage.coverage_pct}%`,           c:coverage.coverage_pct>=90?"#065f46":coverage.coverage_pct>=70?"#92400e":"#991b1b"},
              {l:"Сума замаплено", v:fmtAmt(coverage.sum_amount_mapped),   c:"#065f46"},
              {l:"Сума незамаплено",v:fmtAmt(coverage.sum_amount_unmapped),c:coverage.sum_amount_unmapped>0?"#991b1b":"#374151"},
            ].map((s,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",minWidth:90}}>
                <span style={{fontSize:16,fontWeight:700,color:s.c}}>{s.v}</span>
                <span style={{fontSize:10,color:"#64748b"}}>{s.l}</span>
              </div>
            ))}
          </div>
          {coverage.coverage_pct < 90 && (
            <div style={{fontSize:11,color:"#92400e",background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:4,padding:"4px 8px",marginBottom:6}}>
              ⚠ {(100-coverage.coverage_pct).toFixed(1)}% статей не замаплено ({fmt(coverage.unmapped_articles)} UID) — PnL та бюджети будуть неповні
            </div>
          )}
          {coverage.sum_amount_unmapped > 0 && (
            <div style={{fontSize:11,color:"#7c2d12",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:4,padding:"4px 8px",marginBottom:6}}>
              ⚠ {fmtAmt(coverage.sum_amount_unmapped)} у незамаплених статтях — ці суми не потраплять до PnL-агрегатів
            </div>
          )}
          {coverage.top_unmapped?.length > 0 && (
            <details style={{marginTop:4}}>
              <summary style={{fontSize:11,fontWeight:600,color:"#475569",cursor:"pointer"}}>
                Топ незамаплених за сумою ({coverage.top_unmapped.length})
              </summary>
              <table style={{width:"100%",fontSize:11,marginTop:6,borderCollapse:"collapse"}}>
                <thead><tr style={{background:"#f1f5f9"}}>
                  <th style={{textAlign:"left",padding:"2px 6px",fontWeight:600}}>Стаття</th>
                  <th style={{textAlign:"left",padding:"2px 6px",fontWeight:600}}>Компанія</th>
                  <th style={{textAlign:"left",padding:"2px 6px",fontWeight:600}}>L1</th>
                  <th style={{textAlign:"right",padding:"2px 6px",fontWeight:600}}>Сума (est.)</th>
                </tr></thead>
                <tbody>
                  {coverage.top_unmapped.map((r,i)=>(
                    <tr key={i} style={{borderTop:"1px solid #e2e8f0"}}>
                      <td style={{padding:"2px 6px",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.source_article_name}>{r.source_article_name}</td>
                      <td style={{padding:"2px 6px",color:"#64748b"}}>{r.company||"—"}</td>
                      <td style={{padding:"2px 6px",color:"#64748b"}}>{r.level1||"—"}</td>
                      <td style={{padding:"2px 6px",textAlign:"right",fontWeight:600,color:"#991b1b"}}>{fmtAmt(r.amount_estimate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}

      <TableToolbar
        filters={tableFilters}
        pageSize={{
          value: pageSize,
          onChange: (n) => { setPageSize(n); setPage(1); },
        }}
        actions={[...uuidAction, ...bulkFillAction, ...bulkCreateAction]}
      />

      {/* ── Advanced filters (п.8) ── */}
      <div style={{marginBottom:8}}>
        <button onClick={() => setShowAdvanced(v => !v)}
          style={{fontSize:11,fontWeight:600,color:"#475569",background:"none",border:"none",cursor:"pointer",padding:0}}>
          {showAdvanced ? "▼" : "▶"} Розширені фільтри
          {(filterOnlyUnmapped||filterSourceChanged||filterRecommendation||filterAmountMin||filterAmountMax) &&
            <span style={{marginLeft:6,color:"#2563eb"}}>●</span>}
        </button>
        {showAdvanced && (
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8,padding:"10px 12px",
                       background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6}}>
            <label style={{fontSize:11,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
              <input type="checkbox" checked={filterOnlyUnmapped} onChange={e=>{setFilterOnlyUnmapped(e.target.checked);setPage(1);}}/>
              Тільки незамаплені
            </label>
            <label style={{fontSize:11,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
              <input type="checkbox" checked={filterSourceChanged} onChange={e=>{setFilterSourceChanged(e.target.checked);setPage(1);}}/>
              Source changed
            </label>
            <select value={filterRecommendation} onChange={e=>{setFilterRecommendation(e.target.value);setPage(1);}}
              style={{fontSize:11,padding:"2px 6px",border:"1px solid #cbd5e1",borderRadius:4}}>
              <option value="">Всі рекомендації</option>
              <option value="AUTO_BIND">AUTO BIND</option>
              <option value="RECOMMEND">RECOMMEND</option>
              <option value="REVIEW">REVIEW</option>
              <option value="CREATE_MASTER">CREATE MASTER</option>
            </select>
            <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11}}>
              <span style={{color:"#64748b"}}>Сума від</span>
              <input type="number" value={filterAmountMin} onChange={e=>{setFilterAmountMin(e.target.value);setPage(1);}}
                placeholder="0" style={{width:80,fontSize:11,padding:"2px 6px",border:"1px solid #cbd5e1",borderRadius:4}}/>
              <span style={{color:"#64748b"}}>до</span>
              <input type="number" value={filterAmountMax} onChange={e=>{setFilterAmountMax(e.target.value);setPage(1);}}
                placeholder="∞" style={{width:80,fontSize:11,padding:"2px 6px",border:"1px solid #cbd5e1",borderRadius:4}}/>
            </div>
            <button onClick={()=>{setFilterOnlyUnmapped(false);setFilterSourceChanged(false);setFilterRecommendation("");setFilterAmountMin("");setFilterAmountMax("");setPage(1);}}
              style={{fontSize:11,padding:"2px 8px",border:"1px solid #cbd5e1",borderRadius:4,background:"#fff",cursor:"pointer",color:"#64748b"}}>
              Скинути
            </button>
          </div>
        )}
      </div>

      {/* ── Column visibility (п.9) ── */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}>
        <button onClick={() => setShowColSettings(v => !v)}
          style={{fontSize:11,color:"#64748b",background:"none",border:"1px solid #e2e8f0",
                  borderRadius:4,padding:"2px 8px",cursor:"pointer"}}>
          ⚙ Колонки
        </button>
      </div>
      {showColSettings && (
        <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:"8px 10px",
                     background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,marginBottom:8}}>
          {Object.entries(ALL_COL_LABELS).map(([key, label]) => (
            <label key={key} style={{fontSize:11,display:"flex",alignItems:"center",gap:3,cursor:"pointer"}}>
              <input type="checkbox" checked={!hiddenCols.includes(key)}
                onChange={() => toggleCol(key)}/>
              {label}
            </label>
          ))}
        </div>
      )}

      <DataTable
        columns={visibleColumns}
        rows={rows}
        rowKey={(row) => `${row.source_id}__${row.source_article_id}`}
        rowClassName={(row) => {
          if (isEligible(row)) return "row-eligible";
          if (!row.master_article_id && row.mapping_status !== "rejected") return "row-pending";
          return "";
        }}
        loading={loading}
        emptyMessage={emptyMsg}
        pagination={{ page, pageSize, total, onChange: setPage }}
      />

      {/* ── Planning explanation (п.10) ── */}
      <div style={{marginTop:16,border:"1px solid #e2e8f0",borderRadius:8,overflow:"hidden"}}>
        <button onClick={() => setShowPlanningInfo(v => !v)}
          style={{width:"100%",textAlign:"left",padding:"10px 14px",background:"#f8fafc",
                  border:"none",cursor:"pointer",fontWeight:600,fontSize:12,color:"#374151",
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>Як маппінг статей впливає на Planning та PnL</span>
          <span>{showPlanningInfo ? "▲" : "▼"}</span>
        </button>
        {showPlanningInfo && (
          <div style={{padding:"12px 16px",fontSize:12,color:"#374151",lineHeight:1.6}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div>
                <div style={{fontWeight:700,color:"#991b1b",marginBottom:6}}>❌ Без маппінгу:</div>
                <ul style={{margin:0,paddingLeft:18,color:"#64748b"}}>
                  <li>PnL-агрегація по структурі не формується</li>
                  <li>Бюджети за статтями витрат не заповнюються</li>
                  <li>Rules не можуть посилатись на незамаплені статті</li>
                  <li>Rollup-ієрархія обривається на незамаплених рівнях</li>
                  <li>Звіти показують порожні рядки замість сум</li>
                </ul>
              </div>
              <div>
                <div style={{fontWeight:700,color:"#065f46",marginBottom:6}}>✅ З маппінгом:</div>
                <ul style={{margin:0,paddingLeft:18,color:"#64748b"}}>
                  <li>Факт PnL агрегується по master-структурі</li>
                  <li>Бюджети прив'язані до правильних статей</li>
                  <li>Планові rules застосовуються коректно</li>
                  <li>Rollup повний — від L2 до холдингу</li>
                  <li>Порівняння факт/план працює по всіх рівнях</li>
                </ul>
              </div>
            </div>
            {coverage?.top_unmapped?.length > 0 && (
              <div style={{marginTop:10,padding:"8px 10px",background:"#fef2f2",borderRadius:6,border:"1px solid #fca5a5"}}>
                <span style={{fontWeight:600,color:"#991b1b"}}>Найбільший фінансовий ризик — незамаплені статті:</span>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:4}}>
                  {coverage.top_unmapped.slice(0,5).map((r,i)=>(
                    <span key={i} style={{fontSize:11,color:"#64748b"}}>
                      {r.source_article_name} <strong style={{color:"#991b1b"}}>{fmtAmt(r.amount_estimate)}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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

      {showBulkFill && (
        <BulkFillModal
          filters={{
            filterSource,
            filterCompany,
            filterStatus,
            filterLevel1,
            filterLevel2,
            filterMasterLevel1,
            filterMasterLevel2,
            filterPnl,
            search,
          }}
          sources={sources}
          pnlStructures={pnlStructures}
          onClose={() => setShowBulkFill(false)}
          onSuccess={handleBulkSuccess}
        />
      )}

      {showBulkCreate && (
        <BulkCreateModal
          filters={{
            filterSource,
            filterCompany,
            filterStatus,
            filterLevel1,
            filterLevel2,
            filterMasterLevel1,
            filterMasterLevel2,
            filterPnl,
            search,
          }}
          onClose={() => setShowBulkCreate(false)}
          onSuccess={handleBulkCreateSuccess}
        />
      )}
    </>
  );
}

export default ArticleSourceMappingPage;
