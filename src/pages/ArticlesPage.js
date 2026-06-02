import React, { useEffect, useState, useCallback, useRef } from "react";
import { usePagePermission } from "../hooks/usePagePermission";
import Modal from "../components/ui/Modal";
import SearchableSelect from "../components/ui/SearchableSelect";
import LevelCombobox from "../components/ui/LevelCombobox";
import { getArticles, createArticle, updateArticle, mergePreview, mergeArticles, exportCsv } from "../api/articlesApi";
import { getPnlStructures } from "../api/pnlStructureApi";
import { getLevel2, createLevel2, getLevel1, createLevel1 } from "../api/pnlLevelsApi";

// ── Style constants ───────────────────────────────────────────────────────────
const thS = {
  padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
  fontWeight: 600, fontSize: 10, color: "#6b7280", background: "#f9fafb",
  position: "sticky", top: 0, whiteSpace: "nowrap", userSelect: "none",
};
const tdS = { padding: "3px 8px", verticalAlign: "middle", fontSize: 11, lineHeight: 1.35 };
const inpS = { padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12, width: "100%" };

const ALL_COLS = [
  { key: "pnl_id",              label: "PnL ID",          width: 64  },
  { key: "article_name",        label: "Назва статті",    width: 200 },
  { key: "level2",              label: "Level 2",          width: 160 },
  { key: "level1",              label: "Level 1",          width: 160 },
  { key: "article_type",        label: "Тип",              width: 80  },
  { key: "uid_expense_article", label: "UID статті",       width: 170 },
  { key: "expense_element",     label: "Ел. витрат",       width: 140 },
  { key: "expense_company",     label: "Компанія",         width: 100 },
  { key: "level1_olap",         label: "L1 OLAP",          width: 120 },
  { key: "level2_olap",         label: "L2 OLAP",          width: 120 },
  { key: "is_active",           label: "Активна",          width: 72  },
];
const REQUIRED_COLS = new Set(["article_name", "article_type", "is_active"]);

const emptyForm = {
  article_id: "", article_name: "", article_type: "",
  level1: "", level2: "", pnl_id: "", is_active: true,
  uid_expense_article: "", expense_element: "",
  expense_company: "", level1_olap: "", level2_olap: "",
};

function TypeBadge({ type }) {
  if (!type) return <span style={{ color: "#d1d5db" }}>—</span>;
  const isIncome = type === "Дохід";
  return (
    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4,
                   fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
                   background: isIncome ? "#d1fae5" : "#fee2e2",
                   color:      isIncome ? "#065f46" : "#991b1b",
                   border: `1px solid ${isIncome ? "#6ee7b7" : "#fca5a5"}` }}>
      {type}
    </span>
  );
}

function ActiveBadge({ active }) {
  return (
    <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4,
                   fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
                   background: active !== false ? "#d1fae5" : "#f3f4f6",
                   color:      active !== false ? "#065f46" : "#6b7280",
                   border: `1px solid ${active !== false ? "#6ee7b7" : "#e5e7eb"}` }}>
      {active !== false ? "Активна" : "Неактивна"}
    </span>
  );
}

function UidCell({ uid }) {
  const [copied, setCopied] = useState(false);
  if (!uid) return <span style={{ color: "#d1d5db" }}>—</span>;
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(uid).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <code style={{ fontSize: 10, color: "#6b7280", overflow: "hidden",
                     textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}
            title={uid}>{uid}</code>
      <button onClick={copy} title="Копіювати UID"
        style={{ flexShrink: 0, padding: "1px 4px", fontSize: 9, border: "1px solid #e2e8f0",
                 borderRadius: 3, background: copied ? "#d1fae5" : "#f8fafc",
                 cursor: "pointer", color: copied ? "#065f46" : "#94a3b8" }}>
        {copied ? "✓" : "⎘"}
      </button>
    </div>
  );
}

function FilterChips({ filters, filterValues, onRemove, onClearAll }) {
  const LABELS = {
    search: "Пошук", article_type: "Тип", is_active: "Статус",
    level1: "Level 1", level2: "Level 2", pnl_id: "PnL ID",
    uid_expense_article: "UID", expense_element: "Ел. витрат",
    expense_company: "Компанія", level1_olap: "L1 OLAP", level2_olap: "L2 OLAP",
    only_with_uid: "Тільки з UID", only_without_uid: "Тільки без UID",
    only_without_element: "Без ел. витрат",
  };
  const active = Object.entries(filters).filter(([, v]) => v && v !== "");
  if (active.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 20px 6px",
                  background: "#fff", borderBottom: "1px solid #f1f5f9" }}>
      {active.map(([k, v]) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4,
                               padding: "2px 8px", borderRadius: 20, fontSize: 11,
                               background: "#eff6ff", border: "1px solid #93c5fd", color: "#1e40af" }}>
          <span style={{ fontWeight: 600 }}>{LABELS[k] || k}:</span>
          <span>{v === true ? "✓" : v}</span>
          <button onClick={() => onRemove(k)}
            style={{ background: "none", border: "none", cursor: "pointer",
                     color: "#93c5fd", fontWeight: 700, fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
        </span>
      ))}
      <button onClick={onClearAll}
        style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #e2e8f0",
                 borderRadius: 20, background: "#fff", cursor: "pointer", color: "#6b7280" }}>
        Очистити всі
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function ArticlesPage({ setActivePage }) {
  const { canEdit } = usePagePermission("articles");

  // ── Reference data ──────────────────────────────────────────────────────────
  const [pnlStructures, setPnlStructures] = useState([]);
  const [level2Options, setLevel2Options] = useState([]);
  const [level1Options, setLevel1Options] = useState([]);
  const [filterValues,  setFilterValues]  = useState({});

  // ── Table data ──────────────────────────────────────────────────────────────
  const [rows,      setRows]      = useState([]);
  const [total,     setTotal]     = useState(0);
  const [kpi,       setKpi]       = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [page,      setPage]      = useState(1);
  const PAGE_SIZE = 200;

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [searchInput,          setSearchInput]          = useState("");
  const [search,               setSearch]               = useState("");
  const [filterType,           setFilterType]           = useState("");
  const [filterActive,         setFilterActive]         = useState("");
  const [filterLevel1,         setFilterLevel1]         = useState("");
  const [filterLevel2,         setFilterLevel2]         = useState("");
  const [filterPnlId,          setFilterPnlId]          = useState("");
  const [filterUid,            setFilterUid]            = useState("");
  const [filterElement,        setFilterElement]        = useState("");
  const [filterCompany,        setFilterCompany]        = useState("");
  const [filterL1Olap,         setFilterL1Olap]         = useState("");
  const [filterL2Olap,         setFilterL2Olap]         = useState("");
  const [onlyWithUid,          setOnlyWithUid]          = useState(false);
  const [onlyWithoutUid,       setOnlyWithoutUid]       = useState(false);
  const [onlyWithoutElement,   setOnlyWithoutElement]   = useState(false);
  const [onlyDupName,          setOnlyDupName]          = useState(false);
  const [onlyDupUid,           setOnlyDupUid]           = useState(false);
  const [showAdvanced,         setShowAdvanced]         = useState(false);

  // ── Column settings ─────────────────────────────────────────────────────────
  const [hiddenCols, setHiddenCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem("articles_hiddenCols") || "[]"); }
    catch { return []; }
  });
  const [density,      setDensity]      = useState(() => localStorage.getItem("articles_density") || "normal");
  const [showColPanel, setShowColPanel] = useState(false);

  // ── Modal / form ─────────────────────────────────────────────────────────────
  const [showModal,     setShowModal]     = useState(false);
  const [editArticleId, setEditArticleId] = useState(null);
  const [formError,     setFormError]     = useState(null);
  const [form,          setForm]          = useState(emptyForm);

  // ── Selection + merge ───────────────────────────────────────────────────────
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [hideMerged,     setHideMerged]     = useState(true);
  const [mergeSuccess,   setMergeSuccess]   = useState(null);

  // ── CSV export ───────────────────────────────────────────────────────────
  const [exporting,    setExporting]    = useState(false);
  const [exportError,  setExportError]  = useState(null);

  // ── Load ─────────────────────────────────────────────────────────────────────
  const buildParams = useCallback(() => {
    const p = { page, page_size: PAGE_SIZE };
    if (search)               p.search               = search;
    if (filterType)           p.article_type         = filterType;
    if (filterActive)         p.is_active            = filterActive;
    if (filterLevel1)         p.level1               = filterLevel1;
    if (filterLevel2)         p.level2               = filterLevel2;
    if (filterPnlId)          p.pnl_id               = filterPnlId;
    if (filterUid)            p.uid_expense_article  = filterUid;
    if (filterElement)        p.expense_element      = filterElement;
    if (filterCompany)        p.expense_company      = filterCompany;
    if (filterL1Olap)         p.level1_olap          = filterL1Olap;
    if (filterL2Olap)         p.level2_olap          = filterL2Olap;
    if (onlyWithUid)          p.only_with_uid        = true;
    if (onlyWithoutUid)       p.only_without_uid     = true;
    if (onlyWithoutElement)   p.only_without_element = true;
    if (onlyDupName)          p.only_dup_name        = true;
    if (onlyDupUid)           p.only_dup_uid         = true;
    p.hide_merged = hideMerged;
    return p;
  }, [page, search, filterType, filterActive, filterLevel1, filterLevel2,
      filterPnlId, filterUid, filterElement, filterCompany,
      filterL1Olap, filterL2Olap, onlyWithUid, onlyWithoutUid, onlyWithoutElement,
      onlyDupName, onlyDupUid, hideMerged]);

  const loadData = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      const res = await getArticles(buildParams());
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setKpi(res.kpi || null);
      if (res.filter_values) setFilterValues(res.filter_values);
    } catch { setLoadError("Не вдалося завантажити статті"); }
    finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { getPnlStructures().then(setPnlStructures).catch(() => {}); }, []);
  useEffect(() => { getLevel2().then(setLevel2Options).catch(() => {}); }, []);

  useEffect(() => {
    const matched = level2Options.find(
      o => o.name.toLowerCase() === (form.level2 || "").trim().toLowerCase()
    );
    if (matched) getLevel1(matched.id).then(setLevel1Options).catch(() => setLevel1Options([]));
    else setLevel1Options([]);
  }, [form.level2, level2Options]);

  // Debounced search
  const searchTimer = useRef(null);
  const handleSearchInput = (v) => {
    setSearchInput(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1); }, 400);
  };

  const applyFilter = (setter) => (v) => { setter(v); setPage(1); };

  const clearAllFilters = () => {
    setSearch(""); setSearchInput("");
    setFilterType(""); setFilterActive(""); setFilterLevel1(""); setFilterLevel2("");
    setFilterPnlId(""); setFilterUid(""); setFilterElement(""); setFilterCompany("");
    setFilterL1Olap(""); setFilterL2Olap("");
    setOnlyWithUid(false); setOnlyWithoutUid(false); setOnlyWithoutElement(false);
    setOnlyDupName(false); setOnlyDupUid(false);
    setPage(1);
  };

  const removeFilter = (key) => {
    const map = {
      search: () => { setSearch(""); setSearchInput(""); },
      article_type: () => setFilterType(""),
      is_active: () => setFilterActive(""),
      level1: () => setFilterLevel1(""),
      level2: () => setFilterLevel2(""),
      pnl_id: () => setFilterPnlId(""),
      uid_expense_article: () => setFilterUid(""),
      expense_element: () => setFilterElement(""),
      expense_company: () => setFilterCompany(""),
      level1_olap: () => setFilterL1Olap(""),
      level2_olap: () => setFilterL2Olap(""),
      only_with_uid: () => setOnlyWithUid(false),
      only_without_uid: () => setOnlyWithoutUid(false),
      only_without_element: () => setOnlyWithoutElement(false),
      only_dup_name: () => setOnlyDupName(false),
      only_dup_uid:  () => setOnlyDupUid(false),
    };
    map[key]?.(); setPage(1);
  };

  const handleExport = async () => {
    setExporting(true); setExportError(null);
    try {
      const filters = {
        search:               search               || undefined,
        article_type:         filterType           || undefined,
        is_active:            filterActive         || undefined,
        level1:               filterLevel1         || undefined,
        level2:               filterLevel2         || undefined,
        pnl_id:               filterPnlId          || undefined,
        uid_expense_article:  filterUid            || undefined,
        expense_element:      filterElement        || undefined,
        expense_company:      filterCompany        || undefined,
        level1_olap:          filterL1Olap         || undefined,
        level2_olap:          filterL2Olap         || undefined,
        only_with_uid:        onlyWithUid          || undefined,
        only_without_uid:     onlyWithoutUid       || undefined,
        only_without_element: onlyWithoutElement   || undefined,
        only_dup_name:        onlyDupName          || undefined,
        only_dup_uid:         onlyDupUid           || undefined,
        hide_merged:          hideMerged,
      };
      // Clean undefined values
      Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);
      const ids = selectedIds.size > 0 ? [...selectedIds] : [];
      await exportCsv(filters, ids);
    } catch {
      setExportError("Помилка експорту — спробуйте ще раз");
    } finally {
      setExporting(false);
    }
  };

  const activeFilters = Object.fromEntries(
    Object.entries({
      search, article_type: filterType, is_active: filterActive,
      level1: filterLevel1, level2: filterLevel2, pnl_id: filterPnlId,
      uid_expense_article: filterUid, expense_element: filterElement,
      expense_company: filterCompany, level1_olap: filterL1Olap,
      level2_olap: filterL2Olap,
      only_with_uid: onlyWithUid || undefined,
      only_without_uid: onlyWithoutUid || undefined,
      only_without_element: onlyWithoutElement || undefined,
      only_dup_name: onlyDupName || undefined,
      only_dup_uid:  onlyDupUid  || undefined,
    }).filter(([, v]) => v && v !== "")
  );

  // ── Column settings ──────────────────────────────────────────────────────────
  const toggleCol = (key) => {
    if (REQUIRED_COLS.has(key)) return;
    setHiddenCols(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem("articles_hiddenCols", JSON.stringify(next));
      return next;
    });
  };
  const visibleCols = ALL_COLS.filter(c => !hiddenCols.includes(c.key));
  const tdDense = density === "compact"
    ? { padding: "1px 8px", verticalAlign: "middle", fontSize: 11, lineHeight: 1.2 }
    : tdS;

  // ── Modal helpers ────────────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditArticleId(null); setForm(emptyForm); setFormError(null); setShowModal(true);
  };
  const openEditModal = (a) => {
    setEditArticleId(a.article_id); setFormError(null);
    setForm({
      article_id: a.article_id || "", article_name: a.article_name || "",
      article_type: a.article_type || "", level1: a.level1 || "",
      level2: a.level2 || "", pnl_id: a.pnl_id ? String(a.pnl_id) : "",
      is_active: a.is_active !== false,
      uid_expense_article: a.uid_expense_article || "",
      expense_element: a.expense_element || "", expense_company: a.expense_company || "",
      level1_olap: a.level1_olap || "", level2_olap: a.level2_olap || "",
    });
    setShowModal(true);
  };
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAddLevel2 = async (name) => {
    const result = await createLevel2(name);
    const fresh  = await getLevel2();
    setLevel2Options(fresh);
    setForm(f => ({ ...f, level2: result.name, level1: "" }));
  };
  const handleAddLevel1 = async (name) => {
    const matched = level2Options.find(
      o => o.name.toLowerCase() === (form.level2 || "").trim().toLowerCase()
    );
    if (!matched) return;
    const result = await createLevel1(matched.id, name);
    const fresh  = await getLevel1(matched.id);
    setLevel1Options(fresh);
    setForm(f => ({ ...f, level1: result.name }));
  };

  const level2Valid = level2Options.some(
    o => o.name.toLowerCase() === (form.level2 || "").trim().toLowerCase()
  );

  const saveArticle = async (e) => {
    e.preventDefault(); setFormError(null);
    if (!form.article_type) { setFormError("Оберіть тип статті"); return; }
    if (!form.pnl_id || Number(form.pnl_id) === 0) { setFormError("Оберіть структуру PnL"); return; }
    try {
      if (editArticleId) await updateArticle(editArticleId, form);
      else               await createArticle(form);
      setShowModal(false); setEditArticleId(null); setForm(emptyForm);
      loadData();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setFormError(
        Array.isArray(detail) ? detail.map(e => e.msg).join("; ")
        : typeof detail === "string" ? detail
        : "Помилка збереження статті"
      );
    }
  };

  // ── KPI clickable filters ────────────────────────────────────────────────────
  const kpiPills = kpi ? [
    { label: "Всього",   value: kpi.total,       key: null,       filterVal: null },
    { label: "Активних", value: kpi.active,       key: "is_active", filterVal: "true",  color: "#065f46", bg: "#f0fdf4", border: "#6ee7b7" },
    { label: "Неактивних", value: kpi.inactive,   key: "is_active", filterVal: "false", color: "#991b1b", bg: "#fef2f2", border: "#fca5a5" },
    { label: "Дохід",   value: kpi.income,       key: "article_type", filterVal: "Дохід",   color: "#065f46", bg: "#f0fdf4", border: "#6ee7b7" },
    { label: "Витрати", value: kpi.expense,      key: "article_type", filterVal: "Витрати", color: "#991b1b", bg: "#fef2f2", border: "#fca5a5" },
    { label: "З UID",   value: kpi.with_uid,     key: "only_with_uid",    filterVal: true,  color: "#1e40af", bg: "#eff6ff", border: "#93c5fd" },
    { label: "Без UID", value: kpi.without_uid,  key: "only_without_uid", filterVal: true,  color: "#92400e", bg: "#fffbeb", border: "#fcd34d" },
    ...(kpi.dup_name > 0 ? [{ label: "Дубл. назва", value: kpi.dup_name, key: "only_dup_name", filterVal: true, color: "#7c3aed", bg: "#faf5ff", border: "#c084fc" }] : []),
    ...(kpi.dup_uid  > 0 ? [{ label: "Дубл. UID",   value: kpi.dup_uid,  key: "only_dup_uid",  filterVal: true, color: "#b45309", bg: "#fffbeb", border: "#fcd34d" }] : []),
  ] : [];

  const handleKpiClick = (pill) => {
    if (!pill.key) return;
    if (pill.key === "only_with_uid")    { setOnlyWithUid(v => !v);    setPage(1); return; }
    if (pill.key === "only_without_uid") { setOnlyWithoutUid(v => !v); setPage(1); return; }
    if (pill.key === "only_dup_name")    { setOnlyDupName(v => !v);    setPage(1); return; }
    if (pill.key === "only_dup_uid")     { setOnlyDupUid(v => !v);     setPage(1); return; }
    if (pill.key === "is_active") {
      applyFilter(setFilterActive)(filterActive === pill.filterVal ? "" : pill.filterVal); return;
    }
    if (pill.key === "article_type") {
      applyFilter(setFilterType)(filterType === pill.filterVal ? "" : pill.filterVal); return;
    }
  };

  const isKpiActive = (pill) => {
    if (pill.key === "is_active")       return filterActive === pill.filterVal;
    if (pill.key === "article_type")    return filterType === pill.filterVal;
    if (pill.key === "only_with_uid")   return onlyWithUid;
    if (pill.key === "only_without_uid")return onlyWithoutUid;
    if (pill.key === "only_dup_name")   return onlyDupName;
    if (pill.key === "only_dup_uid")    return onlyDupUid;
    return false;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const thAct = { ...thS, position: "sticky", right: 0, zIndex: 3, background: "#f9fafb", boxShadow: "-2px 0 4px rgba(0,0,0,.06)" };

  const selEl = (opts, val, setter, placeholder) => (
    <select value={val} onChange={e => applyFilter(setter)(e.target.value)}
      style={{ ...inpS, padding: "3px 6px" }}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <>
      <div style={{ background: "#f9fafb", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "10px 20px", display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>Статті PnL</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>Довідник статей PnL-моделі</div>
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
            <button
              onClick={handleExport}
              disabled={exporting}
              title={selectedIds.size > 0
                ? `Експортує ${selectedIds.size} вибраних рядків у CSV`
                : "Експортує всі рядки за поточними фільтрами у CSV"}
              style={{ padding: "5px 11px", fontSize: 12, fontWeight: 500,
                       border: "1px solid #6ee7b7", borderRadius: 5,
                       background: exporting ? "#f0fdf4" : "#f0fdf4",
                       cursor: exporting ? "default" : "pointer",
                       color: "#065f46", opacity: exporting ? 0.7 : 1 }}>
              {exporting ? "…" : selectedIds.size > 0 ? `⬇ Експорт CSV (${selectedIds.size})` : "⬇ Експорт CSV"}
            </button>
            <button onClick={() => setShowColPanel(v => !v)}
              title="Налаштування колонок"
              style={{ padding: "5px 11px", fontSize: 12, fontWeight: 500, border: "1px solid #bae6fd",
                       borderRadius: 5, background: "#f0f9ff", cursor: "pointer", color: "#0369a1" }}>
              ⚙ Таблиця
            </button>
            {canEdit && selectedIds.size >= 2 && (
              <button onClick={() => setShowMergeModal(true)}
                style={{ padding: "5px 13px", fontSize: 12, fontWeight: 600,
                         border: "1px solid #f59e0b", borderRadius: 5,
                         background: "#fffbeb", color: "#92400e", cursor: "pointer" }}>
                ⊕ Об'єднати статті ({selectedIds.size})
              </button>
            )}
            {canEdit && (
              <button onClick={openAddModal}
                style={{ padding: "5px 13px", fontSize: 12, fontWeight: 600, border: "none",
                         borderRadius: 5, background: "#7c3aed", color: "#fff", cursor: "pointer" }}>
                + Додати статтю
              </button>
            )}
          </div>
        </div>

        {/* ── Column settings panel ── */}
        {showColPanel && (
          <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
                        padding: "8px 20px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Колонки:</span>
            {ALL_COLS.map(c => (
              <label key={c.key} style={{ fontSize: 11, display: "flex", gap: 4,
                                          alignItems: "center", cursor: REQUIRED_COLS.has(c.key) ? "default" : "pointer",
                                          color: REQUIRED_COLS.has(c.key) ? "#9ca3af" : "#374151" }}>
                <input type="checkbox" checked={!hiddenCols.includes(c.key)}
                  disabled={REQUIRED_COLS.has(c.key)}
                  onChange={() => toggleCol(c.key)}/>
                {c.label}
              </label>
            ))}
            <span style={{ color: "#e2e8f0" }}>|</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>Щільність:</span>
            {["normal", "compact"].map(d => (
              <label key={d} style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                <input type="radio" checked={density === d} onChange={() => {
                  setDensity(d); localStorage.setItem("articles_density", d);
                }}/>
                {d === "normal" ? "Звичайна" : "Компактна"}
              </label>
            ))}
            <button onClick={() => {
              setHiddenCols([]); localStorage.removeItem("articles_hiddenCols");
            }} style={{ fontSize: 11, padding: "2px 8px", border: "1px solid #e2e8f0",
                        borderRadius: 4, background: "#fff", cursor: "pointer", color: "#6b7280" }}>
              Скинути
            </button>
          </div>
        )}

        {/* ── KPI pills ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "6px 20px", display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {kpiPills.map(pill => {
            const active = isKpiActive(pill);
            return (
              <span key={pill.label}
                onClick={() => handleKpiClick(pill)}
                style={{ display: "inline-flex", alignItems: "baseline", gap: 5,
                         padding: "3px 11px", borderRadius: 20,
                         background: active ? (pill.bg || "#e5e7eb") : "#f3f4f6",
                         border: `1.5px solid ${active ? (pill.border || "#d1d5db") : "transparent"}`,
                         fontSize: 12, cursor: pill.key ? "pointer" : "default",
                         transition: "all .15s", userSelect: "none" }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: active ? (pill.color || "#374151") : "#374151" }}>
                  {pill.value ?? "—"}
                </span>
                <span style={{ color: "#6b7280" }}>{pill.label}</span>
              </span>
            );
          })}
          {kpi?.merged > 0 && (
            <label style={{ marginLeft: "auto", fontSize: 11, display: "flex", gap: 4,
                            alignItems: "center", cursor: "pointer", color: "#6b7280" }}>
              <input type="checkbox" checked={!hideMerged}
                onChange={e => { setHideMerged(!e.target.checked); setPage(1); }}/>
              Показати об'єднані ({kpi.merged})
            </label>
          )}
          <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: kpi?.merged > 0 ? 8 : "auto" }}>
            {total} / {kpi?.total ?? "…"} статей
          </span>
        </div>

        {/* ── Main filters ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb",
                      padding: "8px 20px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* Search */}
          <div style={{ display: "flex", gap: 4, flex: "2 1 220px", minWidth: 180 }}>
            <input value={searchInput} onChange={e => handleSearchInput(e.target.value)}
              placeholder="Назва, ID, UID, ел. витрат…"
              style={{ ...inpS, flex: 1 }}/>
            {searchInput && (
              <button onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
                style={{ padding: "3px 7px", border: "1px solid #e2e8f0", borderRadius: 4,
                         background: "#fff", cursor: "pointer", color: "#9ca3af", fontSize: 12 }}>✕</button>
            )}
          </div>

          {/* Level 2 */}
          <div style={{ flex: "1 1 140px" }}>
            {selEl(filterValues.level2 || [], filterLevel2, setFilterLevel2, "Всі Level 2")}
          </div>

          {/* Level 1 */}
          <div style={{ flex: "1 1 140px" }}>
            {selEl(filterValues.level1 || [], filterLevel1, setFilterLevel1, "Всі Level 1")}
          </div>

          {/* Тип */}
          <div style={{ flex: "0 1 110px" }}>
            <select value={filterType} onChange={e => applyFilter(setFilterType)(e.target.value)}
              style={{ ...inpS, padding: "3px 6px" }}>
              <option value="">Всі типи</option>
              <option value="Дохід">Дохід</option>
              <option value="Витрати">Витрати</option>
            </select>
          </div>

          {/* Активність */}
          <div style={{ flex: "0 1 110px" }}>
            <select value={filterActive} onChange={e => applyFilter(setFilterActive)(e.target.value)}
              style={{ ...inpS, padding: "3px 6px" }}>
              <option value="">Всі статуси</option>
              <option value="true">Активні</option>
              <option value="false">Неактивні</option>
            </select>
          </div>

          {/* Компанія */}
          <div style={{ flex: "0 1 120px" }}>
            {selEl(filterValues.expense_company || [], filterCompany, setFilterCompany, "Всі компанії")}
          </div>

          {/* Clear */}
          {Object.keys(activeFilters).length > 0 && (
            <button onClick={clearAllFilters}
              style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #fca5a5",
                       borderRadius: 5, background: "#fef2f2", cursor: "pointer", color: "#991b1b",
                       whiteSpace: "nowrap" }}>
              Очистити всі
            </button>
          )}
        </div>

        {/* ── Advanced filters ── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #f1f5f9", padding: "0 20px" }}>
          <button onClick={() => setShowAdvanced(v => !v)}
            style={{ fontSize: 11, fontWeight: 600, color: "#475569", background: "none",
                     border: "none", cursor: "pointer", padding: "6px 0" }}>
            {showAdvanced ? "▼" : "▶"} Розширені фільтри
            {(filterPnlId || filterUid || filterElement || filterL1Olap || filterL2Olap ||
              onlyWithUid || onlyWithoutUid || onlyWithoutElement) &&
              <span style={{ marginLeft: 6, color: "#2563eb" }}>●</span>}
          </button>
          {showAdvanced && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8,
                          padding: "8px 0 10px", alignItems: "flex-end" }}>
              {/* PnL ID */}
              <div style={{ flex: "0 1 90px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>PnL ID</div>
                <input value={filterPnlId} onChange={e => applyFilter(setFilterPnlId)(e.target.value)}
                  placeholder="числовий" type="number"
                  style={{ ...inpS, padding: "3px 6px" }}/>
              </div>
              {/* UID */}
              <div style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>UID статті</div>
                <input value={filterUid} onChange={e => applyFilter(setFilterUid)(e.target.value)}
                  placeholder="UID або частина"
                  style={{ ...inpS, padding: "3px 6px", fontFamily: "monospace" }}/>
              </div>
              {/* Ел. витрат */}
              <div style={{ flex: "1 1 140px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Ел. витрат</div>
                {selEl(filterValues.expense_element || [], filterElement, setFilterElement, "Всі елементи")}
              </div>
              {/* L1 OLAP */}
              <div style={{ flex: "1 1 130px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>L1 OLAP</div>
                {selEl(filterValues.level1_olap || [], filterL1Olap, setFilterL1Olap, "Всі L1 OLAP")}
              </div>
              {/* L2 OLAP */}
              <div style={{ flex: "1 1 130px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>L2 OLAP</div>
                {selEl(filterValues.level2_olap || [], filterL2Olap, setFilterL2Olap, "Всі L2 OLAP")}
              </div>
              {/* Checkboxes */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyWithUid}
                    onChange={e => { setOnlyWithUid(e.target.checked); if (e.target.checked) setOnlyWithoutUid(false); setPage(1); }}/>
                  Тільки з UID
                </label>
                <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyWithoutUid}
                    onChange={e => { setOnlyWithoutUid(e.target.checked); if (e.target.checked) setOnlyWithUid(false); setPage(1); }}/>
                  Тільки без UID
                </label>
                <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={onlyWithoutElement}
                    onChange={e => { setOnlyWithoutElement(e.target.checked); setPage(1); }}/>
                  Без ел. витрат
                </label>
                <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center", cursor: "pointer",
                                 color: onlyDupName ? "#7c3aed" : "#374151" }}>
                  <input type="checkbox" checked={onlyDupName}
                    onChange={e => { setOnlyDupName(e.target.checked); if (e.target.checked) setOnlyDupUid(false); setPage(1); }}/>
                  Дублікати назви
                </label>
                <label style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center", cursor: "pointer",
                                 color: onlyDupUid ? "#b45309" : "#374151" }}>
                  <input type="checkbox" checked={onlyDupUid}
                    onChange={e => { setOnlyDupUid(e.target.checked); if (e.target.checked) setOnlyDupName(false); setPage(1); }}/>
                  Дублікати UID
                </label>
              </div>
              <button onClick={() => {
                setFilterPnlId(""); setFilterUid(""); setFilterElement("");
                setFilterL1Olap(""); setFilterL2Olap("");
                setOnlyWithUid(false); setOnlyWithoutUid(false); setOnlyWithoutElement(false);
                setOnlyDupName(false); setOnlyDupUid(false);
                setPage(1);
              }} style={{ fontSize: 11, padding: "3px 10px", border: "1px solid #e2e8f0",
                          borderRadius: 4, background: "#fff", cursor: "pointer", color: "#6b7280",
                          alignSelf: "flex-end" }}>
                Скинути
              </button>
            </div>
          )}
        </div>

        {/* ── Active filter chips ── */}
        <FilterChips filters={activeFilters} onRemove={removeFilter} onClearAll={clearAllFilters} />

        {mergeSuccess && (
          <div style={{ margin: "8px 20px", padding: "8px 14px", background: "#d1fae5",
                        border: "1px solid #6ee7b7", borderRadius: 6, fontSize: 13,
                        color: "#065f46", display: "flex", justifyContent: "space-between" }}>
            <span>✅ {mergeSuccess}</span>
            <button onClick={() => setMergeSuccess(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46", fontWeight: 700 }}>✕</button>
          </div>
        )}
        {exportError && (
          <div style={{ margin: "8px 20px", padding: "8px 12px", background: "#fee2e2",
                        border: "1px solid #fca5a5", borderRadius: 5, fontSize: 13,
                        color: "#991b1b", display: "flex", justifyContent: "space-between" }}>
            <span>{exportError}</span>
            <button onClick={() => setExportError(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: 700 }}>✕</button>
          </div>
        )}
        {loadError && (
          <div style={{ margin: "8px 20px", padding: "8px 12px", background: "#fee2e2",
                        border: "1px solid #fca5a5", borderRadius: 5, fontSize: 13, color: "#991b1b" }}>
            {loadError}
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, fontSize: 11 }}>
            <thead>
              <tr>
                {canEdit && (
                  <th style={{ ...thS, width: 30, textAlign: "center" }}>
                    <input type="checkbox"
                      checked={rows.length > 0 && rows.every(r => selectedIds.has(r.article_id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(rows.map(r => r.article_id)));
                        else setSelectedIds(new Set());
                      }}/>
                  </th>
                )}
                {visibleCols.map(c => (
                  <th key={c.key} style={{ ...thS, width: c.width }}>{c.label}</th>
                ))}
                {canEdit && <th style={{ ...thAct, textAlign: "center", width: 50 }}>Дії</th>}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={visibleCols.length + (canEdit ? 1 : 0)}
                  style={{ ...tdDense, textAlign: "center", padding: "28px 0", color: "#9ca3af" }}>
                  Завантаження…
                </td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={visibleCols.length + (canEdit ? 1 : 0)}
                  style={{ ...tdDense, textAlign: "center", padding: "32px 0", color: "#9ca3af" }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div>
                  Статей не знайдено
                </td></tr>
              )}
              {!loading && rows.map(row => {
                const isMerged = Boolean(row.merged_into_article_id);
                const isSelected = selectedIds.has(row.article_id);
                const isDup = (onlyDupName || onlyDupUid);
                const baseColor = isSelected ? "#eff6ff"
                  : isMerged ? "#f0fdf4"
                  : isDup ? "#fffbeb"
                  : row.is_active === false ? "#fafafa" : "#fff";
                const hoverColor = isSelected ? "#dbeafe"
                  : isMerged ? "#dcfce7"
                  : isDup ? "#fef9c3"
                  : row.is_active === false ? "#f5f5f5" : "#fafafa";
                return (
                <tr key={row.article_id}
                  style={{ borderBottom: "1px solid #f3f4f6", background: baseColor }}
                  onMouseEnter={e => { e.currentTarget.style.background = hoverColor; }}
                  onMouseLeave={e => { e.currentTarget.style.background = baseColor; }}>

                  {canEdit && (
                    <td style={{ ...tdDense, textAlign: "center", width: 30 }}>
                      <input type="checkbox" checked={isSelected}
                        onChange={() => setSelectedIds(prev => {
                          const next = new Set(prev);
                          next.has(row.article_id) ? next.delete(row.article_id) : next.add(row.article_id);
                          return next;
                        })}/>
                    </td>
                  )}

                  {visibleCols.map(c => {
                    const v = row[c.key];
                    switch (c.key) {
                      case "pnl_id":
                        return <td key={c.key} style={{ ...tdDense, fontFamily: "monospace", fontWeight: 600, color: "#374151" }}>
                          {v || <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>;
                      case "article_name":
                        return <td key={c.key} style={{ ...tdDense, maxWidth: 240 }}>
                          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden",
                                        textOverflow: "ellipsis" }} title={v}>{v || "—"}</div>
                          {isMerged && (
                            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                           background: "#d1fae5", color: "#065f46",
                                           border: "1px solid #6ee7b7", whiteSpace: "nowrap" }}>
                              Об'єднано →
                            </span>
                          )}
                        </td>;
                      case "level2":
                        return <td key={c.key} style={{ ...tdDense, maxWidth: 160 }}>
                          <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden",
                                         textOverflow: "ellipsis", color: "#1e40af", fontWeight: 500 }}
                                title={v || ""}>{v || <span style={{ color: "#d1d5db" }}>—</span>}</span>
                        </td>;
                      case "level1":
                        return <td key={c.key} style={{ ...tdDense, maxWidth: 160, whiteSpace: "nowrap",
                                                         overflow: "hidden", textOverflow: "ellipsis" }}
                                   title={v || ""}>{v || <span style={{ color: "#d1d5db" }}>—</span>}</td>;
                      case "article_type":
                        return <td key={c.key} style={tdDense}><TypeBadge type={v} /></td>;
                      case "uid_expense_article":
                        return <td key={c.key} style={{ ...tdDense, maxWidth: 175 }}><UidCell uid={v} /></td>;
                      case "expense_element":
                        return <td key={c.key} style={{ ...tdDense, maxWidth: 135, whiteSpace: "nowrap",
                                                         overflow: "hidden", textOverflow: "ellipsis" }}
                                   title={v || ""}>{v || <span style={{ color: "#d1d5db" }}>—</span>}</td>;
                      case "expense_company":
                        return <td key={c.key} style={{ ...tdDense, maxWidth: 95, whiteSpace: "nowrap",
                                                         overflow: "hidden", textOverflow: "ellipsis" }}
                                   title={v || ""}>{v || <span style={{ color: "#d1d5db" }}>—</span>}</td>;
                      case "level1_olap":
                      case "level2_olap":
                        return <td key={c.key} style={{ ...tdDense, maxWidth: 115, whiteSpace: "nowrap",
                                                         overflow: "hidden", textOverflow: "ellipsis",
                                                         color: "#6b7280" }} title={v || ""}>
                          {v || <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>;
                      case "is_active":
                        return <td key={c.key} style={tdDense}><ActiveBadge active={v} /></td>;
                      default:
                        return <td key={c.key} style={tdDense}>{v ?? "—"}</td>;
                    }
                  })}

                  {canEdit && (
                    <td style={{ ...tdDense, textAlign: "center", position: "sticky", right: 0, zIndex: 1,
                                 background: baseColor, boxShadow: "-2px 0 4px rgba(0,0,0,.04)" }}>
                      <button onClick={() => openEditModal(row)} title="Редагувати"
                        style={{ width: 26, height: 26, padding: 0, display: "inline-flex",
                                 alignItems: "center", justifyContent: "center", fontSize: 13,
                                 border: "1px solid #bfdbfe", background: "#eff6ff",
                                 color: "#1d4ed8", borderRadius: 4, cursor: "pointer" }}>✎</button>
                    </td>
                  )}
                </tr>
              ); })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ padding: "8px 20px", background: "#fff", borderTop: "1px solid #e5e7eb",
                        display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
            <button disabled={page <= 1} onClick={() => setPage(1)}
              style={{ padding: "3px 8px", border: "1px solid #e2e8f0", borderRadius: 4,
                       background: page <= 1 ? "#f9fafb" : "#fff", cursor: page <= 1 ? "default" : "pointer",
                       fontSize: 12, color: "#6b7280" }}>«</button>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: "3px 10px", border: "1px solid #e2e8f0", borderRadius: 4,
                       background: "#fff", cursor: "pointer", fontSize: 12 }}>← Назад</button>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {page} / {totalPages} ({total} статей)
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              style={{ padding: "3px 10px", border: "1px solid #e2e8f0", borderRadius: 4,
                       background: "#fff", cursor: "pointer", fontSize: 12 }}>Далі →</button>
            <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}
              style={{ padding: "3px 8px", border: "1px solid #e2e8f0", borderRadius: 4,
                       background: page >= totalPages ? "#f9fafb" : "#fff",
                       cursor: page >= totalPages ? "default" : "pointer",
                       fontSize: 12, color: "#6b7280" }}>»</button>
          </div>
        )}
      </div>

      {/* ── Edit/Add modal — logic unchanged ── */}
      {showModal && (
        <Modal
          title={editArticleId ? "Редагувати статтю PnL" : "Додати статтю PnL"}
          onClose={() => setShowModal(false)}
          size="large"
        >
          <form onSubmit={saveArticle}>
            <div className="form-grid">
              <div className="form-field">
                <label>ID статті {!editArticleId && <span style={{ color: "#e74c3c" }}>*</span>}</label>
                <input name="article_id" value={form.article_id} onChange={handleChange}
                  readOnly={!!editArticleId} required={!editArticleId} placeholder="Наприклад: 901"
                  style={editArticleId ? { background: "#f8f8f8", color: "#888" } : {}}/>
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
                <input name="article_name" value={form.article_name} onChange={handleChange} required/>
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
                  options={level2Options} value={form.level2}
                  onChange={(name) => setForm(f => ({ ...f, level2: name }))}
                  onSelect={(name) => setForm(f => ({ ...f, level2: name, level1: "" }))}
                  onAdd={handleAddLevel2} addLabel="у довідник Level 2"
                  placeholder="Пошук або введіть Level 2..."/>
              </div>
              <div className="form-field">
                <label>Level 1</label>
                <LevelCombobox
                  options={level1Options} value={form.level1}
                  onChange={(name) => setForm(f => ({ ...f, level1: name }))}
                  onAdd={handleAddLevel1}
                  disabled={!form.level2.trim() || !level2Valid}
                  addLabel="у довідник Level 1"
                  placeholder={!form.level2.trim() || !level2Valid ? "Спочатку оберіть Level 2" : "Пошук або введіть Level 1..."}/>
                {form.level2.trim() && !level2Valid && (
                  <div style={{ fontSize: 11, color: "#e67e22", marginTop: 4 }}>
                    Спочатку оберіть або створіть Level 2
                  </div>
                )}
              </div>
              <div className="form-field full">
                <label>UUID статті (uid_expense_article)</label>
                <input name="uid_expense_article" value={form.uid_expense_article}
                  onChange={handleChange} placeholder="GUID з OLAP"
                  style={{ fontFamily: "monospace", fontSize: 13 }}/>
              </div>
              <div className="form-field">
                <label>Елемент витрат</label>
                <input name="expense_element" value={form.expense_element} onChange={handleChange}/>
              </div>
              <div className="form-field">
                <label>Компанія</label>
                <input name="expense_company" value={form.expense_company} onChange={handleChange}/>
              </div>
              <div className="form-field">
                <label>Level 1 OLAP</label>
                <input name="level1_olap" value={form.level1_olap} onChange={handleChange}/>
              </div>
              <div className="form-field">
                <label>Level 2 OLAP</label>
                <input name="level2_olap" value={form.level2_olap} onChange={handleChange}/>
              </div>
              {editArticleId && (
                <div className="form-field full checkbox-field">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input name="is_active" type="checkbox" checked={!!form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}/>
                    Активна
                  </label>
                </div>
              )}
            </div>
            {formError && (
              <div className="error-message" style={{ marginTop: 12, marginBottom: 0 }}>{formError}</div>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setShowModal(false)}
                style={{ padding: "7px 18px", fontSize: 13, fontWeight: 500, border: "1px solid #d1d5db",
                         borderRadius: 5, background: "#fff", color: "#374151", cursor: "pointer" }}>
                Скасувати
              </button>
              <button type="submit"
                style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600, border: "none",
                         borderRadius: 5, background: "#7c3aed", color: "#fff", cursor: "pointer" }}>
                Зберегти
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showMergeModal && (
        <MergeArticlesModal
          selectedIds={selectedIds}
          allRows={rows}
          onClose={() => setShowMergeModal(false)}
          onMerged={(result) => {
            setShowMergeModal(false);
            setSelectedIds(new Set());
            setMergeSuccess(
              `Об'єднано ${result.merged_count} статей. ` +
              `Перенесено ${result.moved_mappings} прив'язок. ` +
              (result.fact_updated > 0 ? `Оновлено ${result.fact_updated} fact рядків. ` : "") +
              (result.plan_updated > 0 ? `Оновлено ${result.plan_updated} plan рядків.` : "")
            );
            loadData();
          }}
        />
      )}
    </>
  );
}


// ── MergeArticlesModal ────────────────────────────────────────────────────────
function MergeArticlesModal({ selectedIds, allRows, onClose, onMerged }) {
  const selectedRows = allRows.filter(r => selectedIds.has(r.article_id));
  const [targetId,   setTargetId]   = useState(selectedRows[0]?.article_id || "");
  const [preview,    setPreview]    = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [merging,    setMerging]    = useState(false);
  const [reason,     setReason]     = useState("");
  const [error,      setError]      = useState(null);

  const sourceIds = selectedRows.map(r => r.article_id).filter(id => id !== targetId);
  const targetRow = selectedRows.find(r => r.article_id === targetId);

  const fmtAmt = (n) => {
    if (!n) return "—";
    if (n >= 1_000_000) return `₴${(n/1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `₴${Math.round(n/1_000)}K`;
    return String(n);
  };

  const loadPreview = async () => {
    if (!targetId || sourceIds.length === 0) return;
    setPreviewLoading(true); setError(null);
    try {
      const res = await mergePreview(targetId, sourceIds);
      setPreview(res);
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка preview");
    } finally { setPreviewLoading(false); }
  };

  useEffect(() => { loadPreview(); }, [targetId]); // eslint-disable-line

  const handleMerge = async () => {
    if (!preview?.can_merge) return;
    setMerging(true); setError(null);
    try {
      const res = await mergeArticles(targetId, sourceIds, reason);
      onMerged(res);
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка об'єднання");
    } finally { setMerging(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:2000,
                  display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:10, width:"min(820px,96vw)",
                    maxHeight:"88vh", display:"flex", flexDirection:"column",
                    boxShadow:"0 8px 32px rgba(0,0,0,.2)" }}>

        {/* Header */}
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #e5e7eb",
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontWeight:700, fontSize:15 }}>⊕ Об'єднання статей PnL</span>
          <button onClick={onClose}
            style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
          {error && (
            <div style={{ padding:"8px 12px", background:"#fee2e2", border:"1px solid #fca5a5",
                          borderRadius:6, fontSize:12, color:"#991b1b", marginBottom:12 }}>{error}</div>
          )}

          {/* Step 1: Choose target */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:8, color:"#374151" }}>
              Крок 1: Оберіть головну статтю (всі інші об'єднаються в неї)
            </div>
            <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#f8fafc" }}>
                <th style={{ padding:"4px 8px", textAlign:"center", width:32 }}>Головна</th>
                <th style={{ padding:"4px 8px", textAlign:"left" }}>Назва</th>
                <th style={{ padding:"4px 8px", textAlign:"left" }}>ID</th>
                <th style={{ padding:"4px 8px", textAlign:"left" }}>Тип</th>
                <th style={{ padding:"4px 8px", textAlign:"left" }}>Level 2</th>
                <th style={{ padding:"4px 8px", textAlign:"left" }}>Level 1</th>
                <th style={{ padding:"4px 8px", textAlign:"left" }}>Компанія</th>
                <th style={{ padding:"4px 8px", textAlign:"left" }}>Активна</th>
              </tr></thead>
              <tbody>
                {selectedRows.map(r => {
                  const isTarget = r.article_id === targetId;
                  return (
                    <tr key={r.article_id}
                      style={{ borderTop:"1px solid #f1f5f9",
                               background: isTarget ? "#eff6ff" : "transparent",
                               cursor:"pointer" }}
                      onClick={() => setTargetId(r.article_id)}>
                      <td style={{ padding:"4px 8px", textAlign:"center" }}>
                        <input type="radio" checked={isTarget} onChange={() => setTargetId(r.article_id)}/>
                      </td>
                      <td style={{ padding:"4px 8px", fontWeight: isTarget ? 700 : 400 }}>{r.article_name}</td>
                      <td style={{ padding:"4px 8px", fontFamily:"monospace", fontSize:10, color:"#6b7280" }}>{r.article_id}</td>
                      <td style={{ padding:"4px 8px" }}>
                        {r.article_type ? (
                          <span style={{ padding:"1px 5px", borderRadius:3, fontSize:10, fontWeight:600,
                                         background: r.article_type === "Дохід" ? "#d1fae5" : "#fee2e2",
                                         color:      r.article_type === "Дохід" ? "#065f46" : "#991b1b" }}>
                            {r.article_type}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding:"4px 8px", color:"#1e40af" }}>{r.level2 || "—"}</td>
                      <td style={{ padding:"4px 8px" }}>{r.level1 || "—"}</td>
                      <td style={{ padding:"4px 8px", color:"#6b7280" }}>{r.expense_company || "—"}</td>
                      <td style={{ padding:"4px 8px" }}>
                        <span style={{ padding:"1px 5px", borderRadius:3, fontSize:10,
                                       background: r.is_active !== false ? "#d1fae5" : "#f3f4f6",
                                       color:      r.is_active !== false ? "#065f46" : "#6b7280" }}>
                          {r.is_active !== false ? "✓" : "✗"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Preview */}
          {previewLoading && <div style={{ fontSize:12, color:"#94a3b8", marginBottom:12 }}>Перевірка…</div>}

          {preview && (
            <div style={{ marginBottom:16 }}>
              {/* Conflicts — block */}
              {preview.conflicts?.length > 0 && (
                <div style={{ padding:"10px 14px", background:"#fee2e2", border:"1px solid #fca5a5",
                              borderRadius:7, marginBottom:10 }}>
                  <div style={{ fontWeight:700, color:"#991b1b", fontSize:12, marginBottom:4 }}>
                    ❌ Помилки — об'єднання неможливе:
                  </div>
                  {preview.conflicts.map((c,i) => (
                    <div key={i} style={{ fontSize:11, color:"#991b1b" }}>• {c}</div>
                  ))}
                </div>
              )}

              {/* Warnings — allow */}
              {preview.warnings?.length > 0 && (
                <div style={{ padding:"10px 14px", background:"#fffbeb", border:"1px solid #fcd34d",
                              borderRadius:7, marginBottom:10 }}>
                  <div style={{ fontWeight:700, color:"#92400e", fontSize:12, marginBottom:4 }}>
                    ⚠ Попередження (можна продовжити):
                  </div>
                  {preview.warnings.map((w,i) => (
                    <div key={i} style={{ fontSize:11, color:"#92400e" }}>• {w}</div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {preview.can_merge && (
                <div style={{ padding:"10px 14px", background:"#f0fdf4", border:"1px solid #6ee7b7",
                              borderRadius:7, marginBottom:10 }}>
                  <div style={{ fontWeight:700, color:"#065f46", fontSize:12, marginBottom:6 }}>
                    ✅ Буде виконано:
                  </div>
                  <div style={{ display:"flex", gap:20, fontSize:12, flexWrap:"wrap" }}>
                    <span>Статей для об'єднання: <strong>{preview.sources?.length}</strong></span>
                    <span>Перенести прив'язок: <strong>{preview.total_mappings_to_move}</strong></span>
                    {preview.total_fact_refs > 0 &&
                      <span>Оновити fact рядків: <strong>{preview.total_fact_refs}</strong></span>}
                    {preview.total_plan_refs > 0 &&
                      <span>Оновити plan рядків: <strong>{preview.total_plan_refs}</strong></span>}
                  </div>

                  <div style={{ marginTop:8, fontSize:11, color:"#374151" }}>
                    <strong>Головна стаття:</strong> {preview.target?.article_name}
                    {" "}<span style={{ color:"#6b7280" }}>({preview.target?.article_id})</span>
                    {" "}вже має {preview.target?.mappings_count} прив'язок
                  </div>

                  {/* Per-source rows */}
                  <table style={{ width:"100%", fontSize:11, marginTop:8, borderCollapse:"collapse" }}>
                    <thead><tr style={{ background:"#dcfce7" }}>
                      <th style={{ padding:"3px 6px", textAlign:"left" }}>Буде архівовано</th>
                      <th style={{ padding:"3px 6px", textAlign:"right" }}>Прив'язок</th>
                      <th style={{ padding:"3px 6px", textAlign:"right" }}>Fact</th>
                      <th style={{ padding:"3px 6px", textAlign:"right" }}>Plan</th>
                    </tr></thead>
                    <tbody>
                      {(preview.sources||[]).map(s => (
                        <tr key={s.article_id} style={{ borderTop:"1px solid #bbf7d0" }}>
                          <td style={{ padding:"2px 6px" }}>
                            <span style={{ fontWeight:500 }}>{s.article_name}</span>
                            <span style={{ marginLeft:6, fontFamily:"monospace", fontSize:9, color:"#6b7280" }}>
                              {s.article_id}
                            </span>
                          </td>
                          <td style={{ padding:"2px 6px", textAlign:"right" }}>{s.mappings_count}</td>
                          <td style={{ padding:"2px 6px", textAlign:"right", color: s.fact_refs > 0 ? "#b45309" : "#94a3b8" }}>
                            {s.fact_refs || "—"}
                          </td>
                          <td style={{ padding:"2px 6px", textAlign:"right", color: s.plan_refs > 0 ? "#b45309" : "#94a3b8" }}>
                            {s.plan_refs || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Reason */}
              {preview.can_merge && (
                <div style={{ marginBottom:4 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:"#374151", display:"block", marginBottom:4 }}>
                    Причина об'єднання (необов'язково):
                  </label>
                  <input value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="Наприклад: дублікати з різних джерел"
                    style={{ width:"100%", padding:"5px 8px", border:"1px solid #d1d5db",
                             borderRadius:5, fontSize:12 }}/>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"10px 20px", borderTop:"1px solid #e5e7eb",
                      display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button onClick={onClose}
            style={{ padding:"6px 18px", border:"1px solid #d1d5db", borderRadius:6,
                     background:"#fff", cursor:"pointer", fontSize:12 }}>
            Скасувати
          </button>
          <button onClick={handleMerge}
            disabled={!preview?.can_merge || merging}
            style={{ padding:"6px 18px", border:"none", borderRadius:6, cursor:"pointer",
                     fontSize:12, fontWeight:700,
                     background: preview?.can_merge && !merging ? "#7c3aed" : "#e5e7eb",
                     color:      preview?.can_merge && !merging ? "#fff" : "#9ca3af" }}>
            {merging ? "Об'єднання…"
              : preview?.can_merge ? `Об'єднати ${preview.sources?.length} → 1`
              : "Неможливо об'єднати"}
          </button>
        </div>
      </div>
    </div>
  );
}


export default ArticlesPage;
