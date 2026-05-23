import React, { useState, useEffect, useCallback } from "react";
import { getFactTurnover } from "../api/importEngineApi";
import { getEngineSources } from "../api/importEngineApi";

const fmt = (n, dec = 2) =>
  n == null ? "—" : Number(n).toLocaleString("uk-UA", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtN = (n, dec = 3) =>
  n == null ? "—" : Number(n).toLocaleString("uk-UA", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default function FactTurnoverPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [sources, setSources] = useState([]);

  const today   = new Date();
  const y       = today.getFullYear();
  const m       = String(today.getMonth() + 1).padStart(2, "0");
  const firstDayOfYear = `${y}-01-01`;
  const lastDayThisMonth = new Date(y, today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [filters, setFilters] = useState({
    period_from: firstDayOfYear,
    period_to:   lastDayThisMonth,
    source_id:   "",
  });

  useEffect(() => {
    getEngineSources().then(setSources).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = {};
    if (filters.period_from) params.period_from = filters.period_from;
    if (filters.period_to)   params.period_to   = filters.period_to;
    if (filters.source_id)   params.source_id   = filters.source_id;
    params.limit = 5000;

    getFactTurnover(params)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const setF = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  return (
    <div>
      {/* Filters */}
      <div className="content-card" style={{ marginBottom: 12, padding: "14px 20px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-field" style={{ margin: 0 }}>
            <label>Період з</label>
            <input type="date" value={filters.period_from}
              onChange={e => setF("period_from", e.target.value)} />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label>Період по</label>
            <input type="date" value={filters.period_to}
              onChange={e => setF("period_to", e.target.value)} />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label>Джерело</label>
            <select value={filters.source_id} onChange={e => setF("source_id", e.target.value)}>
              <option value="">— всі —</option>
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.source_name}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}
            style={{ marginBottom: 2 }}>
            {loading ? "Завантаження..." : "Оновити"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>
      )}

      {/* KPI summary */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
          {[
            { label: "Рядків",         value: data.total_count.toLocaleString("uk-UA"), unit: "" },
            { label: "Продажі з ПДВ",  value: fmt(data.total_sales_vat),    unit: "грн" },
            { label: "Продажі роздріб",value: fmt(data.total_sales_retail),  unit: "грн" },
            { label: "Акциз",          value: fmt(data.total_excise),        unit: "грн" },
            { label: "Дал",            value: fmtN(data.total_sales_dal),   unit: "дал" },
            { label: "Кг",             value: fmtN(data.total_sales_kg),    unit: "кг"  },
          ].map(k => (
            <div key={k.label} className="content-card" style={{ padding: "10px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{k.value}</div>
              {k.unit && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{k.unit}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="content-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading && !data ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            Завантаження...
          </div>
        ) : data?.rows?.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            Немає даних за обраний період
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 360px)" }}>
            <table className="data-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Період</th>
                  <th>Підрозділ</th>
                  <th>Товарна група</th>
                  <th style={{ textAlign: "right" }}>Продажі з ПДВ</th>
                  <th style={{ textAlign: "right" }}>Роздрібні</th>
                  <th style={{ textAlign: "right" }}>Акциз</th>
                  <th style={{ textAlign: "right" }}>Дал</th>
                  <th style={{ textAlign: "right" }}>Кг</th>
                  <th>Джерело</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows?.map(r => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.period_month?.slice(0, 7)}</td>
                    <td>{r.department_name || r.department_uid}</td>
                    <td>{r.product_group_name || r.product_group_uid}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(r.sales_vat)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(r.sales_retail)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(r.excise)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtN(r.sales_dal)}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtN(r.sales_kg)}</td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{r.source_name || r.source_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total_count > (data?.rows?.length || 0) && (
          <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
            Показано {data.rows.length} з {data.total_count.toLocaleString("uk-UA")} рядків. Уточніть фільтри для звуження вибірки.
          </div>
        )}
      </div>
    </div>
  );
}
