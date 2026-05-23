import React, { useState } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import { bulkCreatePreview, bulkCreateApply } from "../api/articleSourceMappingApi";

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
  const active = Object.entries(FILTER_LABELS).filter(([key]) => {
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

function PreviewStats({ preview }) {
  return (
    <div className="bulk-create-preview">
      <div className="bulk-create-preview-title">Результат перевірки</div>

      <div className="bulk-create-stat-row">
        <span>Unmapped рядків у фільтрі</span>
        <strong>{preview.total_unmapped}</strong>
      </div>

      <div className="bulk-create-divider" />

      <div className="bulk-create-stat-row eligible">
        <span>
          <span className="bulk-create-dot green" />
          Готові до створення
        </span>
        <strong className="text-success">{preview.will_create}</strong>
      </div>

      {preview.skipped_existing > 0 && (
        <div className="bulk-create-stat-row skipped">
          <span>
            <span className="bulk-create-dot orange" />
            Вже існують (пропустити)
          </span>
          <strong className="text-warning">{preview.skipped_existing}</strong>
        </div>
      )}

      {(preview.missing_reasons || []).map((r, i) => (
        <div key={i} className="bulk-create-stat-row missing">
          <span>
            <span className="bulk-create-dot gray" />
            {r}
          </span>
        </div>
      ))}

      {preview.will_create === 0 && (
        <div className="bulk-fill-warning" style={{ marginTop: 12 }}>
          Немає рядків готових до створення. Заповніть обов'язкові поля через "Заповнити".
        </div>
      )}
    </div>
  );
}

function BulkCreateModal({ filters, onClose, onSuccess }) {
  const [preview,  setPreview]  = useState(null);
  const [loadingP, setLoadingP] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState(null);

  const noFilter = !hasAnyFilter(filters);

  const handlePreview = async () => {
    setLoadingP(true);
    setError(null);
    setPreview(null);
    try {
      const res = await bulkCreatePreview({ filters: buildApiFilters(filters) });
      if (res.status === "ok") setPreview(res);
      else setError(res.message || "Помилка перевірки");
    } catch {
      setError("Помилка перевірки");
    } finally {
      setLoadingP(false);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.will_create === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await bulkCreateApply({ filters: buildApiFilters(filters), confirm: true });
      if (res.status === "ok") onSuccess(res);
      else setError(res.message || "Помилка створення");
    } catch {
      setError("Помилка створення");
    } finally {
      setApplying(false);
    }
  };

  const canApply = preview && preview.will_create > 0 && !applying;

  return (
    <Modal title="Масове створення master-статей" onClose={onClose} size="large">
      <FilterContext filters={filters} />

      {noFilter && (
        <div className="bulk-fill-warning" style={{ marginTop: 12 }}>
          Масове створення недоступне без активного фільтра. Звузьте вибірку та спробуйте знову.
        </div>
      )}

      {!noFilter && (
        <>
          <div className="bulk-create-info">
            <div className="bulk-create-info-title">Умови eligible-рядка</div>
            <div className="bulk-create-conditions">
              <span className="bulk-create-condition">✓ Статус: Не прив'язано</span>
              <span className="bulk-create-condition">✓ Тип статті заповнено</span>
              <span className="bulk-create-condition">✓ PNL структура заповнена</span>
              <span className="bulk-create-condition">✓ Назва статті є</span>
            </div>
          </div>

          {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}

          {preview && <PreviewStats preview={preview} />}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button
              variant="secondary"
              onClick={handlePreview}
              disabled={loadingP}
            >
              {loadingP ? "Перевірка..." : "Перевірити"}
            </Button>
            <Button
              variant="primary"
              onClick={handleApply}
              disabled={!canApply}
            >
              {applying
                ? "Створення..."
                : `Створити (${preview?.will_create ?? 0})`}
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

export default BulkCreateModal;
