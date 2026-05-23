import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePagePermission } from "../hooks/usePagePermission";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import {
  getPlanPnL, createPlanPnL, updatePlanPnL, deletePlanPnL,
  getFactPnL, createFactPnL, updateFactPnL, deleteFactPnL,
  exportPlanPnL, exportFactPnL,
} from "../api/pnlDataApi";
import { getReferenceDepartments, getReferenceArticles, getReferenceSources } from "../api/referenceApi";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const EMPTY_FILTERS = {
  period_from: "", period_to: "",
  holding_name: "", organization_name: "", region_name: "", branch_name: "", department_name: "",
  article_name: "", pnl_id: "",
  scenario: "", version_name: "",
  registrar: "", source_name: "",
  search: "",
};

const EMPTY_PLAN = {
  period: "", holding_name: "", organization_name: "", region_name: "", branch_name: "",
  department_id: "", department_name: "", article_id: "", article_name: "", pnl_id: "",
  scenario: "", version_name: "", amount: "", comment: "",
};

const EMPTY_FACT = {
  period: "", holding_name: "", organization_name: "", region_name: "", branch_name: "",
  department_id: "", department_name: "", article_id: "", article_name: "", pnl_id: "",
  amount: "", registrar: "", source_name: "",
};

const EMPTY_RESULT = { items: [], total_count: 0, total_amount: 0, page: 1, page_size: PAGE_SIZE };

// ── Helpers ────────────────────────────────────────────────────────────────────

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))].sort();
}

function fmtAmount(v) {
  if (v === null || v === undefined || v === "") return "—";
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(v));
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const SEL = {
  padding: "5px 6px", border: "1px solid var(--border, #d1d5db)",
  borderRadius: 4, fontSize: 12, background: "#fff",
  flex: "1 1 90px", minWidth: 85, maxWidth: 200,
};
const INP = { ...SEL, flex: "1 1 120px", minWidth: 110 };
const PAGER_BTN = {
  padding: "3px 9px", border: "1px solid var(--border, #d1d5db)",
  borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 13, lineHeight: "1.4",
};

// ── Component ──────────────────────────────────────────────────────────────────

function PnlDataPage() {
  const { canEdit } = usePagePermission("pnlData");

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("plan");

  // ── Data ──────────────────────────────────────────────────────────────────────
  const [planResult, setPlanResult] = useState({ ...EMPTY_RESULT });
  const [factResult, setFactResult] = useState({ ...EMPTY_RESULT });

  // ── Reference data ────────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState([]);
  const [articles,    setArticles]    = useState([]);
  const [sources,     setSources]     = useState([]);

  // ── Filters ───────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [page,    setPage]    = useState(1);

  // ── Status ────────────────────────────────────────────────────────────────────
  const [loading,   setLoading]  = useState(false);
  const [error,     setError]    = useState(null);
  const [success,   setSuccess]  = useState(null);

  // ── CRUD modal ────────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [form,      setForm]      = useState({ ...EMPTY_PLAN });
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState(null);

  // search debounce
  const searchTimer = useRef(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // ── Load reference data once ──────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([getReferenceDepartments(), getReferenceArticles(), getReferenceSources()])
      .then(([d, a, s]) => { setDepartments(d); setArticles(a); setSources(s); })
      .catch(() => {});
  }, []);

  // ── Data loader ───────────────────────────────────────────────────────────────

  // Handles both old backend (plain array) and new backend ({items,...}) format
  const normalizeResult = useCallback((res) => {
    if (Array.isArray(res)) {
      return {
        items: res,
        total_count: res.length,
        total_amount: res.reduce((s, r) => s + Number(r.amount || 0), 0),
        page: 1,
        page_size: PAGE_SIZE,
      };
    }
    return (res && Array.isArray(res.items)) ? res : { ...EMPTY_RESULT };
  }, []);

  const loadData = useCallback(async (tab, pg, flt) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: pg, page_size: PAGE_SIZE };
      Object.entries(flt).forEach(([k, v]) => { if (v !== "") params[k] = v; });
      if (tab === "plan") {
        setPlanResult(normalizeResult(await getPlanPnL(params)));
      } else {
        setFactResult(normalizeResult(await getFactPnL(params)));
      }
    } catch {
      setError("Помилка завантаження даних");
    } finally {
      setLoading(false);
    }
  }, [normalizeResult]);

  // Initial load of both tabs
  useEffect(() => {
    loadData("plan", 1, EMPTY_FILTERS);
    loadData("fact", 1, EMPTY_FILTERS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter handlers ───────────────────────────────────────────────────────────

  const applyFilters = useCallback(() => {
    setPage(1);
    loadData(activeTab, 1, filters);
  }, [activeTab, filters, loadData]);

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setPage(1);
    loadData(activeTab, 1, { ...EMPTY_FILTERS });
  };

  // Dropdown: apply immediately
  const handleDropdown = (key, value) => {
    const nf = { ...filters, [key]: value };
    setFilters(nf);
    setPage(1);
    loadData(activeTab, 1, nf);
  };

  // Period inputs: update state only (apply on button click or blur)
  const handlePeriod = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Search: debounce 500 ms, filtersRef avoids stale closure
  const handleSearch = (value) => {
    setFilters(prev => ({ ...prev, search: value }));
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      loadData(activeTab, 1, { ...filtersRef.current, search: value });
    }, 500);
  };

  // ── Tab change ────────────────────────────────────────────────────────────────

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setShowModal(false);
    setPage(1);
    loadData(tab, 1, filters);
  };

  // ── Pagination ────────────────────────────────────────────────────────────────

  const goPage = (pg) => {
    setPage(pg);
    loadData(activeTab, pg, filters);
  };

  // ── Export ────────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const exportFilters = {};
      Object.entries(filters).forEach(([k, v]) => { if (v !== "") exportFilters[k] = v; });
      const res = activeTab === "plan"
        ? await exportPlanPnL(exportFilters)
        : await exportFactPnL(exportFilters);
      const now = new Date();
      const pad = n => String(n).padStart(2, "0");
      const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const filename = `pnl_${activeTab}_${ts}.csv`;
      const url = URL.createObjectURL(res.data);
      Object.assign(document.createElement("a"), { href: url, download: filename }).click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err?.response?.status === 403) {
        setError("Немає прав на експорт");
      } else if (err?.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          setError(JSON.parse(text)?.detail || "Помилка експорту");
        } catch {
          setError("Помилка експорту");
        }
      } else {
        setError(err?.response?.data?.detail || "Помилка експорту");
      }
    }
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditId(null);
    setForm(activeTab === "plan" ? { ...EMPTY_PLAN } : { ...EMPTY_FACT });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditId(activeTab === "plan" ? item.plan_id : item.fact_id);
    setForm({ ...item });
    setFormError(null);
    setShowModal(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleDeptChange = (e) => {
    const d = departments.find(d => d.department_id === e.target.value);
    if (d) setForm(prev => ({
      ...prev,
      department_id: d.department_id, department_name: d.department_name,
      holding_name: d.holding_name, organization_name: d.organization_name,
      region_name: d.region_name, branch_name: d.branch_name,
    }));
  };

  const handleArticleChange = (e) => {
    const a = articles.find(a => a.article_id === e.target.value);
    if (a) setForm(prev => ({
      ...prev,
      article_id: a.article_id, article_name: a.article_name, pnl_id: a.pnl_id,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError(null);
    try {
      if (activeTab === "plan") {
        editId ? await updatePlanPnL(editId, form) : await createPlanPnL(form);
      } else {
        editId ? await updateFactPnL(editId, form) : await createFactPnL(form);
      }
      setShowModal(false);
      setSuccess(editId ? "Запис оновлено" : "Запис додано");
      loadData(activeTab, page, filters);
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    const id = activeTab === "plan" ? item.plan_id : item.fact_id;
    if (!window.confirm(`Видалити запис ID: ${id}?`)) return;
    try {
      activeTab === "plan" ? await deletePlanPnL(id) : await deleteFactPnL(id);
      setSuccess("Запис видалено");
      loadData(activeTab, page, filters);
    } catch (err) {
      setError(err?.response?.data?.detail || "Помилка видалення");
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const holdings      = uniq(departments.map(d => d.holding_name));
  const organizations = uniq(departments.map(d => d.organization_name));
  const regions       = uniq(departments.map(d => d.region_name));
  const branches      = uniq(departments.map(d => d.branch_name));
  const deptNames     = uniq(departments.map(d => d.department_name));
  const articleNames  = uniq(articles.map(a => a.article_name));
  const pnlIds        = uniq(articles.map(a => a.pnl_id));
  const sourceNames   = uniq(sources.map(s => s.source_name));

  const currentResult = activeTab === "plan" ? planResult : factResult;
  const totalPages    = Math.max(1, Math.ceil(currentResult.total_count / PAGE_SIZE));
  const hasFilters    = Object.values(filters).some(v => v !== "");

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <section className="content-card">

        {/* Header */}
        <div className="card-top">
          <div className="card-title-block">
            <h2>План / Факт PnL</h2>
            <p>Керування плановими та фактичними даними PnL.</p>
          </div>
          <div className="tabs-header">
            <button
              className={`tab-btn ${activeTab === "plan" ? "active" : ""}`}
              onClick={() => handleTabChange("plan")}
            >📋 План PnL</button>
            <button
              className={`tab-btn ${activeTab === "fact" ? "active" : ""}`}
              onClick={() => handleTabChange("fact")}
            >📊 Факт PnL</button>
          </div>
        </div>

        {/* ── Filter panel ── */}
        <div style={{
          background: "var(--bg-secondary, #f8f9fa)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 14,
        }}>

          {/* Row 1: Period + search */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Період від</span>
              <input
                type="month"
                value={filters.period_from}
                onChange={e => handlePeriod("period_from", e.target.value)}
                onBlur={applyFilters}
                style={{ ...INP, minWidth: 128, flex: "0 0 128px" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Період до</span>
              <input
                type="month"
                value={filters.period_to}
                onChange={e => handlePeriod("period_to", e.target.value)}
                onBlur={applyFilters}
                style={{ ...INP, minWidth: 128, flex: "0 0 128px" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Пошук</span>
              <input
                value={filters.search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Пошук по статті, підрозділу, реєстратору…"
                style={{ ...INP, width: "100%", maxWidth: "none" }}
              />
            </div>
          </div>

          {/* Row 2: Dimension dropdowns */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <select value={filters.holding_name} onChange={e => handleDropdown("holding_name", e.target.value)} style={SEL}>
              <option value="">Холдинг</option>
              {holdings.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.organization_name} onChange={e => handleDropdown("organization_name", e.target.value)} style={SEL}>
              <option value="">Організація</option>
              {organizations.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.region_name} onChange={e => handleDropdown("region_name", e.target.value)} style={SEL}>
              <option value="">Регіон</option>
              {regions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.branch_name} onChange={e => handleDropdown("branch_name", e.target.value)} style={SEL}>
              <option value="">Філія</option>
              {branches.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select
              value={filters.department_name}
              onChange={e => handleDropdown("department_name", e.target.value)}
              style={{ ...SEL, flex: "2 1 130px", maxWidth: 260 }}
            >
              <option value="">Підрозділ</option>
              {deptNames.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Row 3: Article / PnL / tab-specific / buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <select
              value={filters.article_name}
              onChange={e => handleDropdown("article_name", e.target.value)}
              style={{ ...SEL, flex: "2 1 130px", maxWidth: 260 }}
            >
              <option value="">Стаття PnL</option>
              {articleNames.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={filters.pnl_id} onChange={e => handleDropdown("pnl_id", e.target.value)} style={SEL}>
              <option value="">PnL</option>
              {pnlIds.map(v => <option key={v} value={v}>{v}</option>)}
            </select>

            {activeTab === "plan" && (
              <>
                <select value={filters.scenario} onChange={e => handleDropdown("scenario", e.target.value)} style={SEL}>
                  <option value="">Сценарій</option>
                  {["План","Прогноз","Факт","Коригування"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select value={filters.version_name} onChange={e => handleDropdown("version_name", e.target.value)} style={SEL}>
                  <option value="">Версія</option>
                  {["Базова","V1","V2"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </>
            )}

            {activeTab === "fact" && (
              <>
                <input
                  value={filters.registrar}
                  onChange={e => handleDropdown("registrar", e.target.value)}
                  placeholder="Реєстратор"
                  style={INP}
                />
                <select value={filters.source_name} onChange={e => handleDropdown("source_name", e.target.value)} style={SEL}>
                  <option value="">Джерело</option>
                  {sourceNames.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </>
            )}

            {/* Action buttons */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button variant="primary" onClick={applyFilters}>Застосувати</Button>
              {hasFilters && (
                <Button variant="secondary" onClick={clearFilters}>Очистити</Button>
              )}
              <Button variant="secondary" onClick={handleExport} title="Завантажити CSV з поточними фільтрами">
                ↓ CSV
              </Button>
              {canEdit && (
                <Button variant="primary" onClick={openAdd}>+ Додати</Button>
              )}
            </div>
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="error-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 16, color: "#c33" }}>✕</button>
          </div>
        )}
        {success && (
          <div className="success-message" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* Totals row */}
        <div style={{ display: "flex", gap: 24, padding: "6px 2px 10px", fontSize: 13, color: "var(--text-secondary)", flexWrap: "wrap", alignItems: "center" }}>
          <span>
            Знайдено: <strong style={{ color: "var(--text-primary)" }}>{currentResult.total_count}</strong>
          </span>
          <span>
            Загальна сума: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {fmtAmount(currentResult.total_amount)}
            </strong>
          </span>
          {loading && (
            <span style={{ color: "var(--info, #2563eb)", fontSize: 12 }}>Завантаження...</span>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>ID</th>
                <th>Період</th>
                <th>Холдинг</th>
                <th>Організація</th>
                <th>Регіон</th>
                <th>Філія</th>
                <th>Підрозділ</th>
                <th>Стаття</th>
                <th>PnL</th>
                {activeTab === "plan" && <><th>Сценарій</th><th>Версія</th></>}
                <th style={{ textAlign: "right" }}>Сума</th>
                {activeTab === "fact" && <><th>Реєстратор</th><th>Джерело</th></>}
                {canEdit && <th style={{ textAlign: "center", width: 72 }}>Дії</th>}
              </tr>
            </thead>
            <tbody>
              {!loading && (currentResult.items || []).length === 0 ? (
                <tr>
                  <td colSpan="100%" className="empty-row">
                    {hasFilters
                      ? "За заданими фільтрами даних не знайдено"
                      : "Немає даних для відображення"}
                  </td>
                </tr>
              ) : (
                (currentResult.items || []).map(item => {
                  const id = activeTab === "plan" ? item.plan_id : item.fact_id;
                  return (
                    <tr key={id}>
                      <td style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                        {id}
                      </td>
                      <td>{item.period}</td>
                      <td>{item.holding_name}</td>
                      <td>{item.organization_name}</td>
                      <td>{item.region_name}</td>
                      <td>{item.branch_name}</td>
                      <td>{item.department_name}</td>
                      <td>{item.article_name}</td>
                      <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.pnl_id}</td>
                      {activeTab === "plan" && (
                        <><td>{item.scenario}</td><td>{item.version_name}</td></>
                      )}
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, whiteSpace: "nowrap" }}>
                        {fmtAmount(item.amount)}
                      </td>
                      {activeTab === "fact" && (
                        <><td>{item.registrar}</td><td>{item.source_name}</td></>
                      )}
                      {canEdit && (
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          <button className="icon-btn edit" onClick={() => openEdit(item)} title="Редагувати">✎</button>
                          <button className="icon-btn delete" onClick={() => handleDelete(item)} title="Видалити" style={{ marginLeft: 4 }}>✕</button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {currentResult.total_count > PAGE_SIZE && (
          <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
            <button style={PAGER_BTN} onClick={() => goPage(1)} disabled={page === 1}>«</button>
            <button style={PAGER_BTN} onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
            <span style={{ fontSize: 13, padding: "0 8px" }}>
              Стор. {page} / {totalPages}
            </span>
            <button style={PAGER_BTN} onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
            <button style={PAGER_BTN} onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6 }}>
              Всього: {currentResult.total_count}
            </span>
          </div>
        )}
      </section>

      {/* ── Add / Edit modal ── */}
      {showModal && (
        <Modal
          title={editId ? "Редагування запису" : "Новий запис"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="form-field full">
                <label>Період *</label>
                <input
                  type="date"
                  name="period"
                  value={form.period}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <div className="form-field full">
                <label>Підрозділ *</label>
                <select
                  name="department_id"
                  value={form.department_id}
                  onChange={handleDeptChange}
                  required
                >
                  <option value="">— оберіть підрозділ —</option>
                  {departments.map(d => (
                    <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field full">
                <label>Стаття PnL *</label>
                <select
                  name="article_id"
                  value={form.article_id}
                  onChange={handleArticleChange}
                  required
                >
                  <option value="">— оберіть статтю —</option>
                  {articles.map(a => (
                    <option key={a.article_id} value={a.article_id}>{a.article_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field full">
                <label>Сума *</label>
                <input
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleFormChange}
                  step="0.01"
                  required
                />
              </div>

              {activeTab === "plan" && (
                <>
                  <div className="form-field">
                    <label>Сценарій</label>
                    <select name="scenario" value={form.scenario} onChange={handleFormChange}>
                      <option value="">—</option>
                      {["План","Прогноз","Факт","Коригування"].map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Версія</label>
                    <select name="version_name" value={form.version_name} onChange={handleFormChange}>
                      <option value="">—</option>
                      {["Базова","V1","V2"].map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field full">
                    <label>Коментар</label>
                    <input
                      type="text"
                      name="comment"
                      value={form.comment}
                      onChange={handleFormChange}
                      placeholder="Необов'язково"
                    />
                  </div>
                </>
              )}

              {activeTab === "fact" && (
                <>
                  <div className="form-field">
                    <label>Реєстратор</label>
                    <input type="text" name="registrar" value={form.registrar} onChange={handleFormChange} />
                  </div>
                  <div className="form-field">
                    <label>Джерело</label>
                    <input type="text" name="source_name" value={form.source_name} onChange={handleFormChange} />
                  </div>
                </>
              )}
            </div>

            {formError && (
              <div className="error-message" style={{ marginTop: 10, marginBottom: 0 }}>{formError}</div>
            )}
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Скасувати</Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Збереження..." : editId ? "Зберегти" : "Створити"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default PnlDataPage;
