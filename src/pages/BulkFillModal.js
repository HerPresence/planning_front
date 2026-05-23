import React, { useState, useEffect } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import SearchableSelect from "../components/ui/SearchableSelect";
import LevelCombobox from "../components/ui/LevelCombobox";
import { bulkFillPreview, bulkFillApply } from "../api/articleSourceMappingApi";
import { getLevel2, getLevel1 } from "../api/pnlLevelsApi";

const FIELD_OPTIONS = [
  { value: "master_l1",    label: "Master L1"           },
  { value: "master_l2",    label: "Master L2"           },
  { value: "pnl_id",       label: "PnL структура"       },
  { value: "article_type", label: "Тип"                 },
  { value: "article_name", label: "Назва master-статті" },
];

const FILTER_LABELS = {
  filterSource:       "Джерело",
  filterCompany:      "Компанія",
  filterStatus:       "Статус",
  filterLevel1:       "Source L1",
  filterLevel2:       "Source L2",
  filterMasterLevel1: "Master L1",
  filterMasterLevel2: "Master L2",
  filterPnl:          "PNL структура",
  search:             "Пошук",
};

function buildApiFilters(f) {
  return {
    source_id:        f.filterSource       ? Number(f.filterSource) : null,
    company:          f.filterCompany      || null,
    status:           (f.filterStatus && f.filterStatus !== "all") ? f.filterStatus : null,
    source_level1:    f.filterLevel1       || null,
    source_level2:    f.filterLevel2       || null,
    master_level1:    f.filterMasterLevel1 || null,
    master_level2:    f.filterMasterLevel2 || null,
    pnl_structure_id: f.filterPnl         ? Number(f.filterPnl) : null,
    search:           f.search             || null,
  };
}

function hasAnyFilter(f) {
  return !!(
    f.filterSource || f.filterCompany ||
    (f.filterStatus && f.filterStatus !== "all") ||
    f.filterLevel1 || f.filterLevel2 ||
    f.filterMasterLevel1 || f.filterMasterLevel2 ||
    f.filterPnl || f.search
  );
}

function FilterContext({ filters }) {
  const active = Object.entries(FILTER_LABELS)
    .filter(([key]) => {
      const v = filters[key];
      if (!v) return false;
      if (key === "filterStatus" && v === "all") return false;
      return true;
    });

  return (
    <div className="bulk-fill-context">
      <div className="bulk-fill-context-label">Поточна вибірка</div>
      {active.length === 0 ? (
        <div className="bulk-fill-no-filter">Фільтри не задано — операція заблокована</div>
      ) : (
        <div className="bulk-fill-tags">
          {active.map(([key, label]) => (
            <span key={key} className="bulk-fill-tag">{label}: {filters[key]}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkFillModal({ filters, sources, pnlStructures, onClose, onSuccess }) {
  const [field,        setField]        = useState("");
  const [value,        setValue]        = useState("");
  const [level2Options, setLevel2Options] = useState([]);
  const [level1Options, setLevel1Options] = useState([]);
  const [selectedL2,   setSelectedL2]   = useState("");

  const [preview,  setPreview]  = useState(null);
  const [loadingP, setLoadingP] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState(null);

  const noFilter = !hasAnyFilter(filters);

  useEffect(() => {
    getLevel2().then(setLevel2Options).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedL2) { setLevel1Options([]); return; }
    const matched = level2Options.find(
      (o) => o.name.toLowerCase() === selectedL2.trim().toLowerCase()
    );
    if (matched) {
      getLevel1(matched.id).then(setLevel1Options).catch(() => setLevel1Options([]));
    } else {
      setLevel1Options([]);
    }
  }, [selectedL2, level2Options]);

  const handleFieldChange = (e) => {
    setField(e.target.value);
    setValue("");
    setSelectedL2("");
    setLevel1Options([]);
    setPreview(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!field || !value.trim()) { setError("Оберіть поле та введіть значення"); return; }
    if (noFilter) { setError("Спочатку звузьте вибірку фільтром або пошуком."); return; }
    setLoadingP(true);
    setError(null);
    setPreview(null);
    try {
      const res = await bulkFillPreview({ filters: buildApiFilters(filters), field, value: value.trim() });
      if (res.status === "ok") setPreview(res);
      else setError(res.message || "Помилка preview");
    } catch {
      setError("Помилка preview");
    } finally {
      setLoadingP(false);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.total_affected_count === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await bulkFillApply({
        filters: buildApiFilters(filters),
        field,
        value:   value.trim(),
        confirm: true,
      });
      if (res.status === "ok") onSuccess(res);
      else setError(res.message || "Помилка застосування");
    } catch {
      setError("Помилка застосування");
    } finally {
      setApplying(false);
    }
  };

  const renderValueInput = () => {
    if (!field) return null;

    if (field === "master_l2") {
      return (
        <LevelCombobox
          options={level2Options}
          value={value}
          onChange={(name) => { setValue(name); setSelectedL2(name); }}
          onSelect={(name) => { setValue(name); setSelectedL2(name); }}
          placeholder="Пошук або введіть Master L2..."
        />
      );
    }

    if (field === "master_l1") {
      return (
        <>
          <div className="form-row" style={{ marginBottom: 8 }}>
            <LevelCombobox
              options={level2Options}
              value={selectedL2}
              onChange={(name) => { setSelectedL2(name); setValue(""); }}
              onSelect={(name) => { setSelectedL2(name); setValue(""); }}
              placeholder="Спочатку оберіть Master L2 (контекст)..."
            />
          </div>
          <LevelCombobox
            options={level1Options}
            value={value}
            onChange={(name) => setValue(name)}
            onSelect={(name) => setValue(name)}
            disabled={!selectedL2.trim()}
            placeholder={selectedL2.trim() ? "Пошук або введіть Master L1..." : "Оберіть Master L2 вище"}
          />
        </>
      );
    }

    if (field === "pnl_id") {
      return (
        <SearchableSelect
          options={pnlStructures}
          value={value}
          onChange={(val) => setValue(val || "")}
          getOptionValue={(p) => String(p.id)}
          getOptionLabel={(p) => `${p.id} — ${p.pnl_code || "—"} — ${p.pnl_name}`}
          placeholder="— Оберіть рядок PnL структури —"
        />
      );
    }

    if (field === "article_type") {
      return (
        <select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">— Оберіть тип —</option>
          <option value="Витрати">Витрати</option>
          <option value="Дохід">Дохід</option>
        </select>
      );
    }

    if (field === "article_name") {
      return (
        <>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Нова назва для всіх відфільтрованих master-статей..."
          />
          <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>
            Увага: перезапише назву у всіх відфільтрованих master-статтях
          </div>
        </>
      );
    }

    return null;
  };

  const canApply = preview && preview.total_affected_count > 0 && !applying;

  return (
    <Modal title="Масове заповнення полів" onClose={onClose} size="large">
      <FilterContext filters={filters} />

      {noFilter && (
        <div className="bulk-fill-warning" style={{ marginTop: 12 }}>
          Масове заповнення недоступне без активного фільтра. Звузьте вибірку та спробуйте знову.
        </div>
      )}

      {!noFilter && (
        <>
          <div className="form-row" style={{ marginTop: 16 }}>
            <select value={field} onChange={handleFieldChange}>
              <option value="">— Оберіть поле для заповнення —</option>
              {FIELD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {field && (
            <div className="form-row" style={{ marginTop: 8 }}>
              {renderValueInput()}
            </div>
          )}

          {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}

          {preview && (
            <div className="bulk-fill-preview">
              <div className="bulk-fill-preview-row">
                <span>Поле</span>
                <strong>{preview.field_label}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Нове значення</span>
                <strong>{preview.value}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Master-статей для оновлення</span>
                <strong>{preview.affected_master_count}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Unmapped рядків (запишуться як дефолт)</span>
                <strong>{preview.affected_source_count}</strong>
              </div>
              {(preview.warnings || []).map((w, i) => (
                <div key={i} className="bulk-fill-warning">{w}</div>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button
              variant="secondary"
              onClick={handlePreview}
              disabled={!field || !value.trim() || loadingP}
            >
              {loadingP ? "Розрахунок..." : "Перевірити"}
            </Button>
            <Button
              variant="primary"
              onClick={handleApply}
              disabled={!canApply}
            >
              {applying ? "Застосування..." : `Застосувати (${preview?.total_affected_count ?? 0})`}
            </Button>
          </div>
        </>
      )}

      {noFilter && (
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Закрити</Button>
        </div>
      )}
    </Modal>
  );
}

export default BulkFillModal;
