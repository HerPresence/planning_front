import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getFactTurnover,
  getEngineSources,
  getFactTurnoverDeptOptions,
  getFactTurnoverPGOptions,
} from "../api/importEngineApi";

// ── Formatting ────────────────────────────────────────────────────────────────

const fmt  = (n, dec = 2) =>
  n == null ? "—" : Number(n).toLocaleString("uk-UA", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtN = (n, dec = 3) =>
  n == null ? "—" : Number(n).toLocaleString("uk-UA", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ── UIDCell ───────────────────────────────────────────────────────────────────

function UIDCell({ value, maxWidth = 160 }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };
  return (
    <span className="uid-cell">
      <span className="uid-value" style={{ maxWidth }} title={value}>{value}</span>
      <button className={`uid-copy${copied ? " copied" : ""}`} onClick={handleCopy} title="Скопіювати">
        {copied ? "✓" : "⎘"}
      </button>
    </span>
  );
}

// ── SearchableDropdown ────────────────────────────────────────────────────────
// Generic searchable combobox with server-side fetch.
// selected: { label, sub } | null
// onSelect: (option | null) => void
// fetchOptions: (search: string) => Promise<option[]>
// renderOption: (option) => { label, sub }

function SearchableDropdown({
  selected,
  onSelect,
  fetchOptions,
  renderOption,
  placeholder = "Пошук...",
}) {
  const [query,   setQuery]   = useState("");
  const [options, setOptions] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef     = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doFetch = useCallback((q) => {
    setLoading(true);
    fetchOptions(q)
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [fetchOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doFetch(q), 400);
  };

  const handleFocus = () => {
    setOpen(true);
    if (!options.length) doFetch(query);
  };

  const handleSelect = (opt) => {
    onSelect(opt);
    setQuery("");
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onSelect(null);
    setQuery("");
    setOptions([]);
    setOpen(false);
  };

  if (selected) {
    return (
      <div className="ss-selected">
        <span className="ss-selected-label" title={selected.label}>{selected.label}</span>
        {selected.sub && <span className="ss-selected-sub">{selected.sub}</span>}
        <button className="ss-clear-btn" onClick={handleClear} title="Скинути">×</button>
      </div>
    );
  }

  return (
    <div className="ss-wrap" ref={wrapRef}>
      <input
        type="text"
        className="ss-input"
        value={query}
        onChange={handleInput}
        onFocus={handleFocus}
        placeholder={placeholder}
      />
      {open && (
        <div className="ss-dropdown">
          {loading ? (
            <div className="ss-empty">Завантаження…</div>
          ) : options.length === 0 ? (
            <div className="ss-empty">{query ? "Не знайдено" : "Почніть вводити для пошуку"}</div>
          ) : (
            options.map((opt, i) => {
              const { label, sub, value } = renderOption(opt);
              return (
                <div key={value || i} className="ss-option" onClick={() => handleSelect(opt)}>
                  <div className="ss-option-label">{label}</div>
                  {sub && <div className="ss-option-sub">{sub}</div>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, total, pageRows, onPage }) {
  if (totalPages <= 1) return null;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }
  return (
    <div className="pagination">
      <button className="pg-btn" onClick={() => onPage(page - 1)} disabled={page <= 1}>←</button>
      {pages.map((p, idx) =>
        p === "…"
          ? <span key={`e${idx}`} className="pg-ellipsis">…</span>
          : <button key={p} className={`pg-btn${page === p ? " pg-active" : ""}`} onClick={() => onPage(p)}>{p}</button>
      )}
      <button className="pg-btn" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>→</button>
      <span className="pg-info">
        {pageRows} з {(total ?? 0).toLocaleString("uk-UA")} · Стор. {page}/{totalPages}
      </span>
    </div>
  );
}

// ── Option renderers ──────────────────────────────────────────────────────────

const renderDeptOption = (opt) => ({
  value: opt.department_uid,
  label: opt.department_name || opt.department_uid,
  sub:   opt.department_uid,
});

const renderPGOption = (opt) => ({
  value: opt.product_group_uid || opt.product_group_id,
  label: opt.product_group_name || opt.product_group_uid,
  sub:   [opt.product_group_uid, opt.product_group_id].filter(Boolean).join(" · "),
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function FactTurnoverPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [sources, setSources] = useState([]);

  const today            = new Date();
  const y                = today.getFullYear();
  const firstDayOfYear   = `${y}-01-01`;
  const lastDayThisMonth = new Date(y, today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);

  // ── Period / source filters ──
  const [filters, setFilters] = useState({
    period_from: firstDayOfYear,
    period_to:   lastDayThisMonth,
    source_id:   "",
  });

  // ── Dropdown selections (by name) ──
  const [deptSelected, setDeptSelected] = useState(null); // { department_uid, department_name }
  const [pgSelected,   setPgSelected]   = useState(null); // { product_group_uid, product_group_name, product_group_id }

  // ── UID text inputs (direct UID search) ──
  const [deptUidInput, setDeptUidInput] = useState("");
  const [pgUidInput,   setPgUidInput]   = useState("");

  // Debounced UID values that actually trigger the API call
  const [deptUidDebounced, setDeptUidDebounced] = useState("");
  const [pgUidDebounced,   setPgUidDebounced]   = useState("");
  const deptUidTimer = useRef(null);
  const pgUidTimer   = useRef(null);

  useEffect(() => {
    getEngineSources().then(setSources).catch(() => {});
  }, []);

  // Debounce UID text inputs
  const handleDeptUidChange = (val) => {
    setDeptUidInput(val);
    if (deptSelected) setDeptSelected(null); // typing in UID clears dropdown
    clearTimeout(deptUidTimer.current);
    deptUidTimer.current = setTimeout(() => { setDeptUidDebounced(val); setPage(1); }, 400);
  };

  const handlePgUidChange = (val) => {
    setPgUidInput(val);
    if (pgSelected) setPgSelected(null); // typing in UID clears dropdown
    clearTimeout(pgUidTimer.current);
    pgUidTimer.current = setTimeout(() => { setPgUidDebounced(val); setPage(1); }, 400);
  };

  const handleDeptSelect = (opt) => {
    setDeptSelected(opt);
    if (opt) { setDeptUidInput(""); setDeptUidDebounced(""); }
    setPage(1);
  };

  const handlePgSelect = (opt) => {
    setPgSelected(opt);
    if (opt) { setPgUidInput(""); setPgUidDebounced(""); }
    setPage(1);
  };

  // Effective filter values for API
  const effectiveDeptUid = deptSelected?.department_uid || deptUidDebounced;
  const effectivePgUid   = pgSelected?.product_group_uid || pgUidDebounced;

  const setF = (key, val) => { setPage(1); setFilters(f => ({ ...f, [key]: val })); };

  const load = useCallback((p = 1) => {
    setLoading(true);
    setError(null);
    const params = { page: p, page_size: PAGE_SIZE };
    if (filters.period_from) params.period_from = filters.period_from;
    if (filters.period_to)   params.period_to   = filters.period_to;
    if (filters.source_id)   params.source_id   = filters.source_id;
    if (effectiveDeptUid)    params.department_uid    = effectiveDeptUid;
    if (effectivePgUid)      params.product_group_uid = effectivePgUid;

    getFactTurnover(params)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
  }, [filters, effectiveDeptUid, effectivePgUid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when filters or page changes
  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); load(1); }, [filters, deptSelected, pgSelected, deptUidDebounced, pgUidDebounced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch functions for dropdowns (memoized to avoid SearchableDropdown re-mounting)
  const fetchDepts = useCallback(
    (search) => getFactTurnoverDeptOptions(search, 50),
    []
  );
  const fetchPGs = useCallback(
    (search) => getFactTurnoverPGOptions(search, 50),
    []
  );

  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1>Факт продажів</h1>
          <p>Перегляд даних fact_turnover з фільтрами та агрегатами</p>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="content-card">
        <div className="filter-bar" style={{ marginBottom: 0 }}>

          {/* Period */}
          <div className="filter-group">
            <label>Період з</label>
            <input type="date" value={filters.period_from}
              onChange={e => setF("period_from", e.target.value)} />
          </div>
          <div className="filter-group">
            <label>Період по</label>
            <input type="date" value={filters.period_to}
              onChange={e => setF("period_to", e.target.value)} />
          </div>

          {/* Source */}
          <div className="filter-group">
            <label>Джерело</label>
            <select value={filters.source_id} onChange={e => setF("source_id", e.target.value)}>
              <option value="">— всі —</option>
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.source_name}</option>
              ))}
            </select>
          </div>

          {/* Department dropdown by name */}
          <div className="filter-group" style={{ minWidth: 220 }}>
            <label>Підрозділ (назва)</label>
            <SearchableDropdown
              selected={deptSelected ? { label: deptSelected.department_name, sub: deptSelected.department_uid } : null}
              onSelect={handleDeptSelect}
              fetchOptions={fetchDepts}
              renderOption={renderDeptOption}
              placeholder="Пошук по назві..."
            />
          </div>

          {/* Department UID direct input */}
          <div className="filter-group" style={{ minWidth: 160 }}>
            <label>Dept UID</label>
            <div className="filter-input-wrap">
              <input
                type="text"
                value={deptUidInput}
                onChange={e => handleDeptUidChange(e.target.value)}
                placeholder="0xAEFA..."
                disabled={!!deptSelected}
                style={{ opacity: deptSelected ? 0.4 : 1 }}
              />
              {deptUidInput && (
                <button className="filter-clear" onClick={() => handleDeptUidChange("")}>×</button>
              )}
            </div>
          </div>

          {/* Product group dropdown by name */}
          <div className="filter-group" style={{ minWidth: 220 }}>
            <label>Товарна група (назва)</label>
            <SearchableDropdown
              selected={pgSelected ? {
                label: pgSelected.product_group_name,
                sub: [pgSelected.product_group_uid, pgSelected.product_group_id].filter(Boolean).join(" · "),
              } : null}
              onSelect={handlePgSelect}
              fetchOptions={fetchPGs}
              renderOption={renderPGOption}
              placeholder="Пошук по назві..."
            />
          </div>

          {/* PG UID direct input */}
          <div className="filter-group" style={{ minWidth: 160 }}>
            <label>PG UID</label>
            <div className="filter-input-wrap">
              <input
                type="text"
                value={pgUidInput}
                onChange={e => handlePgUidChange(e.target.value)}
                placeholder="0xA480..."
                disabled={!!pgSelected}
                style={{ opacity: pgSelected ? 0.4 : 1 }}
              />
              {pgUidInput && (
                <button className="filter-clear" onClick={() => handlePgUidChange("")}>×</button>
              )}
            </div>
          </div>

          <div className="filter-actions">
            <button className="btn btn-primary" onClick={() => { setPage(1); load(1); }} disabled={loading}>
              {loading ? "Оновити…" : "Оновити"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ margin: "12px 0" }}>{error}</div>
      )}

      {/* ── KPI cards ── */}
      {data && (
        <div className="kpi-row">
          <div className="kpi-card kpi-total">
            <div className="kpi-value">{data.total_count.toLocaleString("uk-UA")}</div>
            <div className="kpi-label">Рядків</div>
          </div>
          <div className="kpi-card kpi-ok">
            <div className="kpi-value">{fmt(data.total_sales_vat)}</div>
            <div className="kpi-label">Продажі з ПДВ</div>
          </div>
          <div className="kpi-card kpi-update">
            <div className="kpi-value">{fmt(data.total_sales_retail)}</div>
            <div className="kpi-label">Роздріб</div>
          </div>
          <div className="kpi-card kpi-pending">
            <div className="kpi-value">{fmt(data.total_excise)}</div>
            <div className="kpi-label">Акциз</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{fmtN(data.total_sales_dal)}</div>
            <div className="kpi-label">Дал</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{fmtN(data.total_sales_kg)}</div>
            <div className="kpi-label">Кг</div>
          </div>
        </div>
      )}

      {/* ── Data table ── */}
      <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading && !data ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <div className="loading-message">Завантаження…</div>
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-message">Немає даних за обраний фільтр</div>
          </div>
        ) : (
          <div className="table-wrap-sticky">
            <table className="data-table compact" style={{ minWidth: 1060 }}>
              <thead>
                <tr>
                  <th>Період</th>
                  <th>Dept UID</th>
                  <th>Підрозділ</th>
                  <th>PG ID</th>
                  <th>PG UID</th>
                  <th>Товарна група</th>
                  <th style={{ textAlign: "right" }}>з ПДВ</th>
                  <th style={{ textAlign: "right" }}>Роздріб</th>
                  <th style={{ textAlign: "right" }}>Акциз</th>
                  <th style={{ textAlign: "right" }}>Дал</th>
                  <th style={{ textAlign: "right" }}>Кг</th>
                  <th>Джерело</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {r.period_month?.slice(0, 7)}
                    </td>
                    <td><UIDCell value={r.department_uid} /></td>
                    <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={r.department_name}>{r.department_name || "—"}</td>
                    <td><UIDCell value={r.product_group_id} maxWidth={90} /></td>
                    <td><UIDCell value={r.product_group_uid} /></td>
                    <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={r.product_group_name}>{r.product_group_name || "—"}</td>
                    <td className="amount-cell">{fmt(r.sales_vat)}</td>
                    <td className="amount-cell">{fmt(r.sales_retail)}</td>
                    <td className="amount-cell">{fmt(r.excise)}</td>
                    <td className="amount-cell">{fmtN(r.sales_dal)}</td>
                    <td className="amount-cell">{fmtN(r.sales_kg)}</td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {r.source_name || r.source_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total_pages > 1 && (
          <div style={{ padding: "4px 16px 8px", borderTop: "1px solid var(--border)" }}>
            <Pagination
              page={page}
              totalPages={data.total_pages}
              total={data.total_count}
              pageRows={data.rows.length}
              onPage={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
