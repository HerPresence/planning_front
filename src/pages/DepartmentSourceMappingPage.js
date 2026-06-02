import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { getTablePreferences, saveTablePreferences } from "../api/userPreferencesApi";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import { getDeptPlanningCoverage, getBulkCreateParentsPreview, bulkCreateParents, getUidGroups, uidGroupBind, bulkProcessUidGroups, autoMatchByUid, getSameNameConflicts, bulkRemap } from "../api/departmentSourceMappingApi";
import {
  getStagedDepartments,
  getMasterDepartments,
  bindDepartment,
  rejectDepartment,
  resetMapping,
  autoBindDepartments,
  createMasterFromSource,
  bulkFillDeptPreview,
  bulkFillDeptApply,
  bulkCreateDeptPreview,
  bulkCreateDeptApply,
  resolveContext,
  createDictEntry,
  createStandaloneDept,
  getDictEntries,
  suggestMatch,
  getSimilarDepartments,
  bulkBindSuggested,
  bulkBindSuggestedPreview,
} from "../api/departmentSourceMappingApi";

// ── Styles ────────────────────────────────────────────────────────────────────

const thS = {
  padding: "4px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
  fontWeight: 600, fontSize: 10, color: "#6b7280", background: "#f9fafb",
  position: "sticky", top: 0, whiteSpace: "nowrap",
};
const tdS = { padding: "3px 8px", verticalAlign: "middle", fontSize: 11, lineHeight: 1.35 };

const selS = {
  padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 12, background: "#fff", cursor: "pointer",
};
const inpS = {
  padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12,
};
const lblS = { fontSize: 10, color: "#9ca3af", marginBottom: 2 };

// ── Table column definitions ──────────────────────────────────────────────────

const DEPT_TABLE_PAGE_KEY = "department_mapping_table";

const DEPT_TABLE_COLS = [
  { key: "source_id",      label: "Джерело · ID",         required: true,  defaultOn: true  },
  { key: "name",           label: "Назва (source)",        required: true,  defaultOn: true  },
  { key: "type_level",     label: "Тип · Рівень",          required: false, defaultOn: true  },
  { key: "parent",         label: "Parent (source)",       required: false, defaultOn: false },
  { key: "separated",      label: "Separated",             required: false, defaultOn: true  },
  { key: "org",            label: "Орг / Філія / Регіон",  required: false, defaultOn: true  },
  { key: "extra_fields",   label: "Додаткові поля",        required: false, defaultOn: false },
  { key: "suggested",      label: "Suggested Master",      required: false, defaultOn: true  },
  { key: "match",          label: "Match",                 required: false, defaultOn: true  },
  { key: "recommendation", label: "Рекомендація",          required: false, defaultOn: true  },
  { key: "status",         label: "Статус",                required: true,  defaultOn: true  },
  { key: "master",         label: "Master підрозділ",      required: false, defaultOn: true  },
  { key: "master_type",    label: "Тип (master)",          required: false, defaultOn: false },
  { key: "master_parent",  label: "Parent (master)",       required: false, defaultOn: false },
  { key: "actions",        label: "Дії",                   required: true,  defaultOn: true  },
];

const DEPT_PRESETS = {
  standard:  DEPT_TABLE_COLS.filter(c => c.defaultOn || c.required).map(c => c.key),
  minimal:   ["source_id","name","suggested","match","status","actions"],
  mapping:   ["source_id","name","parent","org","suggested","recommendation","status","actions"],
  analytics: DEPT_TABLE_COLS.map(c => c.key),
};

const _REQUIRED_COLS = new Set(DEPT_TABLE_COLS.filter(c => c.required).map(c => c.key));
const _DEFAULT_VISIBLE = new Set(DEPT_PRESETS.standard);
const _DEFAULT_ORDER   = DEPT_TABLE_COLS.map(c => c.key);

// ── TableSettingsModal ────────────────────────────────────────────────────────

function TableSettingsModal({
  visibleCols, colOrder, density, myPreset,
  onApply, onSaveMyPreset, onClose,
}) {
  const [localVis,     setLocalVis]     = useState(new Set(visibleCols));
  const [localOrder,   setLocalOrder]   = useState([...colOrder]);
  const [localDensity, setLocalDensity] = useState(density);

  const toggle = (key) => {
    if (_REQUIRED_COLS.has(key)) return;
    setLocalVis(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const moveUp   = (i) => {
    if (i === 0) return;
    const a = [...localOrder];
    [a[i-1], a[i]] = [a[i], a[i-1]];
    setLocalOrder(a);
  };
  const moveDown = (i) => {
    if (i === localOrder.length - 1) return;
    const a = [...localOrder];
    [a[i], a[i+1]] = [a[i+1], a[i]];
    setLocalOrder(a);
  };

  const applyPreset = (keys) => {
    setLocalVis(new Set([..._REQUIRED_COLS, ...keys]));
    setLocalOrder(_DEFAULT_ORDER);
  };

  const handleApply = () => {
    onApply({ visibleCols: new Set([..._REQUIRED_COLS, ...localVis]), colOrder: localOrder, density: localDensity });
    onClose();
  };

  const handleExport = () => {
    const cfg = {
      visible_columns: [...localVis],
      column_order:    localOrder,
      density:         localDensity,
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" }));
    a.download = "table-settings.json";
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const cfg = JSON.parse(ev.target.result);
          if (cfg.visible_columns) setLocalVis(new Set(cfg.visible_columns));
          if (cfg.column_order)    setLocalOrder(cfg.column_order);
          if (cfg.density)         setLocalDensity(cfg.density);
        } catch { alert("Невалідний JSON файл"); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const orderedCols = localOrder
    .map(key => DEPT_TABLE_COLS.find(c => c.key === key))
    .filter(Boolean);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1200,
                  display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}
         onClick={onClose}>
      <div style={{ background:"#fff",borderRadius:10,width:"100%",maxWidth:560,
                    maxHeight:"92vh",display:"flex",flexDirection:"column",
                    boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:"14px 20px",borderBottom:"1px solid #e5e7eb",flexShrink:0,
                      display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:700,fontSize:16 }}>⚙ Налаштування таблиці</div>
            <div style={{ fontSize:11,color:"#6b7280",marginTop:2 }}>
              Налаштування зберігаються для вашого акаунту
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9ca3af" }}>✕</button>
        </div>

        <div style={{ flex:1,overflowY:"auto",padding:"16px 20px" }}>

          {/* Presets */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:700,color:"#374151",marginBottom:6 }}>Пресети</div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {[
                { key:"standard",  label:"Стандарт" },
                { key:"minimal",   label:"Мінімальний" },
                { key:"mapping",   label:"Mapping" },
                { key:"analytics", label:"Аналітика" },
              ].map(p => (
                <button key={p.key} onClick={() => applyPreset(DEPT_PRESETS[p.key])}
                  style={{ padding:"4px 12px",fontSize:12,border:"1px solid #d1d5db",borderRadius:20,
                           cursor:"pointer",background:"#f9fafb",color:"#374151",fontWeight:500 }}>
                  {p.label}
                </button>
              ))}
              {myPreset && (
                <button onClick={() => applyPreset(myPreset.visible_columns || [])}
                  style={{ padding:"4px 12px",fontSize:12,border:"1px solid #3b82f6",borderRadius:20,
                           cursor:"pointer",background:"#eff6ff",color:"#1e40af",fontWeight:600 }}>
                  ★ Мій пресет
                </button>
              )}
            </div>
          </div>

          {/* Quick controls */}
          <div style={{ display:"flex",gap:6,marginBottom:14,flexWrap:"wrap" }}>
            <button onClick={() => setLocalVis(new Set(DEPT_TABLE_COLS.map(c => c.key)))}
              style={{ padding:"3px 10px",fontSize:11,border:"1px solid #d1d5db",borderRadius:4,
                       cursor:"pointer",background:"#fff",color:"#374151" }}>
              Показати все
            </button>
            <button onClick={() => setLocalVis(new Set(_REQUIRED_COLS))}
              style={{ padding:"3px 10px",fontSize:11,border:"1px solid #d1d5db",borderRadius:4,
                       cursor:"pointer",background:"#fff",color:"#374151" }}>
              Сховати необов'язкове
            </button>
            <button onClick={() => { setLocalVis(new Set(_DEFAULT_VISIBLE)); setLocalOrder(_DEFAULT_ORDER); }}
              style={{ padding:"3px 10px",fontSize:11,border:"1px solid #d1d5db",borderRadius:4,
                       cursor:"pointer",background:"#fff",color:"#374151" }}>
              Скинути
            </button>
          </div>

          {/* Column list with visibility + order */}
          <div style={{ border:"1px solid #e5e7eb",borderRadius:6,overflow:"hidden",marginBottom:16 }}>
            {orderedCols.map((col, i) => {
              const isOn = localVis.has(col.key) || _REQUIRED_COLS.has(col.key);
              const req  = _REQUIRED_COLS.has(col.key);
              return (
                <div key={col.key} style={{
                  display:"flex",alignItems:"center",gap:10,padding:"7px 12px",
                  borderBottom: i < orderedCols.length - 1 ? "1px solid #f3f4f6" : "none",
                  background: isOn ? "#fafafa" : "#fff",
                }}>
                  {/* Checkbox */}
                  <input type="checkbox" checked={isOn} disabled={req}
                    onChange={() => toggle(col.key)}
                    title={req ? "Обов'язкове поле" : ""}
                    style={{ width:15,height:15,cursor: req ? "not-allowed" : "pointer",flexShrink:0 }} />

                  {/* Label */}
                  <span style={{ flex:1,fontSize:12,fontWeight: req ? 600 : 400,
                                  color: isOn ? "#111827" : "#9ca3af" }}>
                    {col.label}
                    {req && <span style={{ fontSize:9,color:"#9ca3af",marginLeft:4 }}>●</span>}
                  </span>

                  {/* Up/Down */}
                  <div style={{ display:"flex",gap:2 }}>
                    <button onClick={() => moveUp(i)} disabled={i === 0}
                      style={{ width:22,height:22,padding:0,border:"1px solid #e5e7eb",borderRadius:3,
                               background:"#f9fafb",cursor: i===0?"not-allowed":"pointer",
                               fontSize:11,color: i===0?"#d1d5db":"#374151",lineHeight:1 }}>↑</button>
                    <button onClick={() => moveDown(i)} disabled={i === orderedCols.length - 1}
                      style={{ width:22,height:22,padding:0,border:"1px solid #e5e7eb",borderRadius:3,
                               background:"#f9fafb",cursor: i===orderedCols.length-1?"not-allowed":"pointer",
                               fontSize:11,color: i===orderedCols.length-1?"#d1d5db":"#374151",lineHeight:1 }}>↓</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Density */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:700,color:"#374151",marginBottom:8 }}>Щільність рядків</div>
            <div style={{ display:"flex",gap:8 }}>
              {[
                { v:"compact",     label:"Compact",     hint:"Максимум рядків" },
                { v:"normal",      label:"Normal",       hint:"Стандарт" },
                { v:"comfortable", label:"Comfortable", hint:"Комфортний перегляд" },
              ].map(({ v, label, hint }) => (
                <label key={v} title={hint}
                  style={{ display:"flex",alignItems:"center",gap:5,cursor:"pointer",
                           padding:"5px 10px",border:`1px solid ${localDensity===v?"#3b82f6":"#e5e7eb"}`,
                           borderRadius:6,background: localDensity===v?"#eff6ff":"#fff",
                           fontSize:12,color: localDensity===v?"#1e40af":"#374151" }}>
                  <input type="radio" name="density" value={v}
                    checked={localDensity === v} onChange={() => setLocalDensity(v)}
                    style={{ margin:0 }} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Export / Import */}
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={handleExport}
              style={{ padding:"4px 12px",fontSize:11,border:"1px solid #d1d5db",borderRadius:4,
                       cursor:"pointer",background:"#fff",color:"#374151" }}>
              ↓ Експортувати JSON
            </button>
            <button onClick={handleImport}
              style={{ padding:"4px 12px",fontSize:11,border:"1px solid #d1d5db",borderRadius:4,
                       cursor:"pointer",background:"#fff",color:"#374151" }}>
              ↑ Імпортувати JSON
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 20px",borderTop:"1px solid #e5e7eb",display:"flex",
                      gap:10,justifyContent:"flex-end",flexShrink:0,flexWrap:"wrap" }}>
          <button
            onClick={() => {
              onSaveMyPreset({ visible_columns: [...localVis], column_order: localOrder, density: localDensity });
            }}
            style={{ padding:"6px 14px",fontSize:12,border:"1px solid #3b82f6",borderRadius:5,
                     cursor:"pointer",background:"#eff6ff",color:"#1e40af",fontWeight:600 }}>
            ★ Зберегти як мій пресет
          </button>
          <button onClick={onClose}
            style={{ padding:"6px 14px",fontSize:12,border:"1px solid #d1d5db",borderRadius:5,
                     cursor:"pointer",background:"#f9fafb",color:"#374151" }}>
            Скасувати
          </button>
          <button onClick={handleApply}
            style={{ padding:"6px 20px",fontSize:12,fontWeight:700,border:"none",borderRadius:5,
                     cursor:"pointer",background:"#2563eb",color:"#fff" }}>
            Застосувати
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MappingExplainerPanel ─────────────────────────────────────────────────────

function MappingExplainerPanel() {
  const [tab, setTab] = useState("business");

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)}
      style={{
        padding: "5px 14px", fontSize: 12, fontWeight: tab === id ? 700 : 400,
        border: "none", borderBottom: tab === id ? "2px solid #2563eb" : "2px solid transparent",
        background: "none", cursor: "pointer",
        color: tab === id ? "#1e40af" : "#6b7280",
      }}>
      {label}
    </button>
  );

  // ── Shared helpers ──────────────────────────────────────────────────────────
  const Arrow = () => (
    <div style={{ textAlign: "center", fontSize: 18, color: "#9ca3af", margin: "2px 0" }}>↓</div>
  );

  const Step = ({ icon, title, table, desc, user, system, ok }) => (
    <div style={{
      border: `1px solid ${ok ? "#6ee7b7" : "#e5e7eb"}`,
      borderRadius: 6, padding: "10px 14px",
      background: ok ? "#f0fdf4" : "#fafafa",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{title}</span>
        {table && (
          <code style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3,
                          background: "#e0e7ff", color: "#3730a3", marginLeft: 4 }}>
            {table}
          </code>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#374151", margin: "0 0 6px" }}>{desc}</p>
      {user && (
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>
          <strong style={{ color: "#374151" }}>Користувач:</strong> {user}
        </div>
      )}
      {system && (
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          <strong style={{ color: "#374151" }}>Система:</strong> {system}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", background: "#f9fafb",
                    padding: "0 12px" }}>
        <TabBtn id="business"  label="🏢 Business Flow" />
        <TabBtn id="technical" label="🔧 Technical Flow" />
        <TabBtn id="planning"  label="📊 Planning Usage" />
        <TabBtn id="lifecycle" label="🔄 Lifecycle" />
        <TabBtn id="faq"       label="❓ FAQ" />
      </div>

      <div style={{ padding: 16, background: "#fff" }}>

        {/* ── Business Flow ── */}
        {tab === "business" && (
          <div style={{ maxWidth: 540 }}>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 14 }}>
              Як source-підрозділи з файлів імпорту перетворюються на вимірники для планування.
            </p>
            <Step icon="📥" title="Імпорт файлу"
              desc="Excel або CSV з підрозділами завантажується через Імпорт даних."
              user="Завантажує файл з колонками: назва, орг, філія, регіон, parent тощо."
              system="Розбирає файл, нормалізує поля, записує в staging." />
            <Arrow />
            <Step icon="📋" title="Source Registry" table="dim_department_source"
              desc="Стабільний реєстр всіх унікальних source-підрозділів за (source_id, source_department_id)."
              user="—"
              system="UPSERT: оновлює поля якщо вони змінились, встановлює source_changed=true. Нові рядки додаються. Дублікатів не виникає." />
            <Arrow />
            <Step icon="🔗" title="Mapping" table="department_source_mapping"
              desc="Зв'язок source-підрозділу з master-підрозділом. Зберігається незалежно від ре-імпортів."
              user="Прив'язує source до master вручну або через AUTO."
              system="Нові source-рядки отримують статус pending. Вже прив'язані рядки НЕ скидаються." ok />
            <Arrow />
            <Step icon="🏛️" title="Master довідник" table="dim_department"
              desc="Еталонний довідник підрозділів з повним контекстом: org, branch, region, holding, parent."
              user="Створює master вручну або авто-прив'язує до існуючого."
              system="—" />
            <Arrow />
            <Step icon="📊" title="Planning та Факти" table="fact_turnover"
              desc="Продажі та плани використовують dim_department через mapping для застосування фільтрів."
              user="—"
              system="JOIN: fact_turnover → mapping → dim_department. Без mapping → NULL для всіх вимірників." ok />
          </div>
        )}

        {/* ── Technical Flow ── */}
        {tab === "technical" && (
          <div>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 12 }}>
              Верифікований JOIN-ланцюг у planning_engine.py. Шлях прямий — dim_department_source не входить у planning-запити.
            </p>
            <div style={{ background: "#1e293b", borderRadius: 6, padding: "14px 16px",
                          fontFamily: "monospace", fontSize: 12, lineHeight: 1.9, color: "#e2e8f0" }}>
              <span style={{ color: "#38bdf8" }}>fact_turnover</span>
              <span style={{ color: "#94a3b8" }}>.department_uid</span>
              <br/>
              {"  "}↓{" "}
              <span style={{ color: "#64748b" }}>ON source_id + source_department_id</span>
              <br/>
              <span style={{ color: "#a78bfa" }}>department_source_mapping</span>
              <span style={{ color: "#94a3b8" }}>.master_department_id</span>
              <br/>
              {"  "}↓{" "}
              <span style={{ color: "#64748b" }}>ON master_department_id</span>
              <br/>
              <span style={{ color: "#34d399" }}>dim_department</span>
              <span style={{ color: "#94a3b8" }}>.region / branch / org / holding</span>
              <br/>
              {"  "}↓
              <br/>
              <span style={{ color: "#fbbf24" }}>Planning filters & scope rules</span>
            </div>

            <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0f9ff",
                          border: "1px solid #bae6fd", borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0369a1", marginBottom: 6 }}>
                dim_department_source — роль
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                Таблиця <code>dim_department_source</code> є адміністративним реєстром —
                вона використовується для відображення в цьому UI, але <strong>не входить
                у JOIN-ланцюг planning-запитів</strong>. Planning-запит iде напряму:
                fact_turnover → mapping → dim_department.
              </div>
            </div>

            <div style={{ marginTop: 12, padding: "10px 14px", background: "#f9fafb",
                          border: "1px solid #e5e7eb", borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                Import UPSERT (import_engine.py)
              </div>
              <div style={{ background: "#1e293b", borderRadius: 4, padding: "10px 12px",
                            fontFamily: "monospace", fontSize: 11, lineHeight: 1.8, color: "#e2e8f0" }}>
                <span style={{ color: "#38bdf8" }}>INSERT INTO</span>{" "}
                <span style={{ color: "#a78bfa" }}>dim_department_source</span> ...<br/>
                <span style={{ color: "#38bdf8" }}>ON CONFLICT</span>{" "}
                <span style={{ color: "#94a3b8" }}>(source_id, source_department_id)</span><br/>
                {"  "}<span style={{ color: "#38bdf8" }}>DO UPDATE SET</span>{" "}
                <span style={{ color: "#94a3b8" }}>name=..., org=..., source_changed=...;</span><br/>
                <br/>
                <span style={{ color: "#38bdf8" }}>INSERT INTO</span>{" "}
                <span style={{ color: "#a78bfa" }}>department_source_mapping</span> ...<br/>
                {"  "}(status=<span style={{ color: "#34d399" }}>'pending'</span>)<br/>
                <span style={{ color: "#38bdf8" }}>ON CONFLICT DO NOTHING</span>
                <span style={{ color: "#94a3b8" }}>;  -- зберігає mapped/auto</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Planning Usage ── */}
        {tab === "planning" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ padding: "12px 14px", background: "#fff1f2",
                          border: "1px solid #fca5a5", borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#991b1b", marginBottom: 8 }}>
                ❌ Без mapping
              </div>
              {[
                "Region-фільтри → NULL → правила не спрацьовують",
                "Branch-фільтри → NULL → неповне покриття",
                "Org-скопінг → NULL → план без прив'язки",
                "Dimension-фільтри в Planning повертають порожні результати",
                "Coverage % залишається низьким",
                "Підрозділ не враховується в жодній planning rule",
              ].map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: "#7f1d1d", marginBottom: 4, display: "flex", gap: 6 }}>
                  <span>·</span><span>{t}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: "12px 14px", background: "#f0fdf4",
                          border: "1px solid #6ee7b7", borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#065f46", marginBottom: 8 }}>
                ✅ З mapping
              </div>
              {[
                "Region → отримується з dim_department.region_name",
                "Branch → отримується з dim_department.branch_name",
                "Org → правила скопінгу застосовуються",
                "Holding → зведення за холдингом працює",
                "Parent-ієрархія → drill-down у звітах",
                "Підрозділ повністю доступний у всіх planning views",
              ].map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: "#064e3b", marginBottom: 4, display: "flex", gap: 6 }}>
                  <span>·</span><span>{t}</span>
                </div>
              ))}
            </div>

            <div style={{ gridColumn: "1/-1", padding: "10px 14px", background: "#fef3c7",
                          border: "1px solid #fde68a", borderRadius: 6, fontSize: 12, color: "#78350f" }}>
              <strong>⚠ Ціна низького coverage:</strong> при coverage &lt;90% більшість
              planning-правил із фільтром по регіону або філії не покриватиме всі продажі.
              Залишковий unmapped-оборот з'являється у рядку "без прив'язки".
            </div>
          </div>
        )}

        {/* ── Lifecycle ── */}
        {tab === "lifecycle" && (
          <div style={{ maxWidth: 480 }}>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 14 }}>
              Статуси mapping-рядка від появи у файлі до використання у плануванні.
            </p>
            {[
              {
                status: "NEW IMPORT",
                color: "#1e40af", bg: "#dbeafe",
                desc: "Новий source_department_id з'явився у файлі імпорту. Система записує його в dim_department_source.",
              },
              {
                status: "PENDING",
                color: "#92400e", bg: "#fef3c7",
                desc: "Mapping-рядок створено автоматично. master_department_id = NULL. Підрозділ чекає на прив'язку. Не впливає на Planning.",
              },
              {
                status: "MAPPED",
                color: "#065f46", bg: "#d1fae5",
                desc: "Користувач вручну прив'язав source до master. Зберігається при будь-якому ре-імпорті. Planning використовує цей зв'язок.",
              },
              {
                status: "AUTO",
                color: "#065f46", bg: "#d1fae5",
                desc: "Система автоматично прив'язала з confidence≥95 без ризиків. Функціонально еквівалентно MAPPED.",
              },
              {
                status: "REJECTED",
                color: "#991b1b", bg: "#fee2e2",
                desc: "Підрозділ навмисно виключений. Не прив'язується і не використовується. Можна повернути в pending.",
              },
              {
                status: "SOURCE CHANGED",
                color: "#7c3aed", bg: "#ede9fe",
                desc: "Поля source-рядка змінились після ре-імпорту (назва, орг, parent тощо). Mapping зберігається — його треба перевірити.",
              },
              {
                status: "USED IN PLANNING",
                color: "#065f46", bg: "#f0fdf4",
                desc: "Кінцевий стан: mapped або auto + підрозділ є у fact_turnover. Dimension-контекст повністю доступний.",
              },
            ].map((item, i, arr) => (
              <React.Fragment key={item.status}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: item.color, marginTop: 4 }} />
                    {i < arr.length - 1 && (
                      <div style={{ width: 2, height: 28, background: "#e5e7eb", margin: "2px 0" }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: 8 }}>
                    <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 4,
                                    fontSize: 10, fontWeight: 700, background: item.bg, color: item.color,
                                    marginBottom: 4 }}>
                      {item.status}
                    </span>
                    <div style={{ fontSize: 12, color: "#374151" }}>{item.desc}</div>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* ── FAQ ── */}
        {tab === "faq" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                q: "Повторний імпорт створить дублікати?",
                a: "Ні. dim_department_source використовує UPSERT по (source_id, source_department_id). Якщо запис вже є — він оновлюється, новий не створюється.",
              },
              {
                q: "Що відбувається якщо поля source-підрозділу змінились?",
                a: "Поля (назва, org, branch тощо) оновляться в dim_department_source. Mapping залишається незмінним. Рядок отримає source_changed=true — ознаку для ручної перевірки.",
              },
              {
                q: "Що якщо підрозділ зник з файлу імпорту?",
                a: "На відміну від брендів, для підрозділів немає автоматичного deactivation. Рядок залишається в реєстрі з останніми даними. Mapping також зберігається.",
              },
              {
                q: "Чи може mapping зникнути при ре-імпорті?",
                a: "Ні. Mapping-таблиця використовує ON CONFLICT DO NOTHING при ре-імпорті. Вже прив'язані (mapped/auto/rejected) рядки ніколи не перезаписуються і не скидаються в pending.",
              },
              {
                q: "Як source_changed визначається?",
                a: "Система порівнює 9 полів: department_name, parent_department_id, parent_department_name, separated_department_id, separated_department_name, organization_name, branch_name, region_name, holding_name. Якщо хоч одне змінилось — source_changed=true.",
              },
              {
                q: "Чи використовується dim_department_source у planning-запитах?",
                a: "Ні. dim_department_source — адміністративний реєстр для цього UI. Planning йде напряму: fact_turnover → department_source_mapping → dim_department, минаючи source registry.",
              },
              {
                q: "Новий підрозділ потрапить в Planning одразу після import?",
                a: "Ні. Новий рядок отримує статус pending у mapping. Planning використовує тільки mapped/auto рядки. Потрібно прив'язати підрозділ до master перш ніж він з'явиться у Planning filters.",
              },
            ].map(({ q, a }, i) => (
              <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
                  ❓ {q}
                </div>
                <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{a}</div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Extra-fields chips ────────────────────────────────────────────────────────

function ExtraFieldsChips({ fields }) {
  const entries = Object.entries(fields || {}).filter(([, v]) => v !== null && v !== "");
  if (entries.length === 0) return <span style={{ color: "#d1d5db", fontSize: 10 }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
      {entries.map(([k, v]) => (
        <span key={k} title={`${k}: ${v}`} style={{
          display: "inline-block", background: "#f3f4f6", border: "1px solid #e5e7eb",
          borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#374151",
          whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
        }}>
          <span style={{ color: "#9ca3af" }}>{k}:</span> {String(v)}
        </span>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:           { label: "Очікує",         bg: "#fef3c7", color: "#92400e" },
  ready_to_create:   { label: "Можна створити", bg: "#d1fae5", color: "#065f46" },
  parent_missing:    { label: "Немає parent",   bg: "#fee2e2", color: "#991b1b" },
  duplicate_warning: { label: "Дублікат ID",    bg: "#fff7ed", color: "#c2410c" },
  mapped:            { label: "Прив'язано",     bg: "#d1fae5", color: "#065f46" },
  rejected:          { label: "Відхилено",      bg: "#fee2e2", color: "#991b1b" },
  auto:              { label: "Авто",           bg: "#dbeafe", color: "#1e40af" },
};

function StatusBadge({ status, computedStatus, reason }) {
  const cfg = STATUS_CFG[computedStatus] || STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span title={reason || undefined}
      style={{ background: cfg.bg, color: cfg.color, borderRadius: 4,
               padding: "1px 6px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
               cursor: reason ? "help" : "default", display: "inline-block" }}>
      {cfg.label}
    </span>
  );
}

// ── Recommendation ────────────────────────────────────────────────────────────

const RECOMMENDATION_CFG = {
  AUTO_BIND:           { label: "Авто-прив'язка",   bg: "#d1fae5", color: "#065f46",  hint: "Безпечна автоматична прив'язка — точний збіг за ID або score≥95 без ризиків" },
  RECOMMEND_BIND:      { label: "Рекомендовано",     bg: "#dbeafe", color: "#1e40af",  hint: "Знайдено високий збіг — рекомендовано прив'язати вручну" },
  REVIEW:              { label: "Перевірити",        bg: "#fef3c7", color: "#92400e",  hint: "Є часткові розбіжності — перегляньте схожі підрозділи перед прив'язкою" },
  CREATE_PARENT_FIRST: { label: "Спочатку parent",   bg: "#fee2e2", color: "#991b1b",  hint: "Спочатку створіть parent-підрозділ, потім повертайтесь до цього рядка" },
  CREATE:              { label: "Створити",          bg: "#f3f4f6", color: "#374151",  hint: "Не знайдено достатньо збігів — створіть новий master-підрозділ" },
};

const SCORE_FIELD_LABELS_EXT = {
  dept_id: "Dept ID", dept_name: "Назва", org: "Організація",
  branch: "Філія", region: "Регіон", holding: "Холдинг",
  parent_id: "Parent ID", parent_name: "Parent назва",
};

function _buildMatchTooltip(score, matched, mismatched) {
  const fl = f => SCORE_FIELD_LABELS_EXT[f] || f;
  const lines = [`${score}%`];
  if (matched?.length)    lines.push("", "Збіги:", ...matched.map(f => `✓ ${fl(f)}`));
  if (mismatched?.length) lines.push("", "Розбіжності:", ...mismatched.map(f => `✗ ${fl(f)}`));
  return lines.join("\n");
}

function RecommendationBadge({ recommendation, reason, risky }) {
  if (!recommendation) return null;
  const cfg = RECOMMENDATION_CFG[recommendation] || RECOMMENDATION_CFG.CREATE;
  const tooltip = reason ? `${reason}\n\n${cfg.hint}` : cfg.hint;
  return (
    <span title={tooltip}
      style={{ background: cfg.bg, color: cfg.color, borderRadius: 4,
               padding: "1px 6px", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
               cursor: "help", display: "inline-block" }}>
      {risky && <span title="Схожа назва, але інший parent / org" style={{ marginRight: 3 }}>⚠</span>}
      {cfg.label}
    </span>
  );
}

function MatchBar({ score, confidence, matchedFields, mismatchedFields }) {
  if (score === null || score === undefined) return <span style={{ color: "#d1d5db" }}>—</span>;
  const color = score >= 90 ? "#059669" : score >= 60 ? "#d97706" : "#dc2626";
  const confLabel = confidence === "HIGH" ? "HIGH" : confidence === "MEDIUM" ? "MED" : "LOW";
  const tooltip = _buildMatchTooltip(score, matchedFields, mismatchedFields);
  return (
    <div title={tooltip} style={{ minWidth: 72, cursor: "help" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{score}%</span>
        <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, fontWeight: 600,
                       background: score >= 90 ? "#d1fae5" : score >= 60 ? "#fef3c7" : "#fee2e2",
                       color: score >= 90 ? "#065f46" : score >= 60 ? "#92400e" : "#991b1b" }}>
          {confLabel}
        </span>
      </div>
      <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, score)}%`, height: "100%",
                      background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ── SimilarDepartmentsModal (side-by-side) ────────────────────────────────────

const _CMP_ROWS = [
  { label: "Назва",       srcKey: "source_name",   mstKey: "department_name" },
  { label: "Організація", srcKey: "source_org",    mstKey: "organization_name" },
  { label: "Філія",       srcKey: "source_branch",  mstKey: "branch_name" },
  { label: "Регіон",      srcKey: "source_region",  mstKey: "region_name" },
  { label: "Parent ID",   srcKey: "source_pid",     mstKey: "parent_department_id" },
];

function _cmpCell(src, mst) {
  const match = src && mst && src.trim().toLowerCase() === mst.trim().toLowerCase();
  const mismatch = src && mst && !match;
  return { match, mismatch };
}

function SimilarDepartmentsModal({ row, onBind, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [binding, setBinding] = useState(null);
  const [selected, setSelected] = useState(null);

  const srcOrg    = row.effective_organization_name || row.organization_name || "";
  const srcBranch = row.effective_branch || row.branch_name || "";
  const srcRegion = row.effective_region || row.region_name || "";
  const srcPid    = row.effective_parent_id || "";
  const srcName   = row.effective_department_name || row.source_department_name || "";

  useEffect(() => {
    getSimilarDepartments(row.source_id, row.source_department_id)
      .then(d => { setData(d); if (d?.candidates?.[0]) setSelected(d.candidates[0]); })
      .catch(() => setErr("Помилка завантаження кандидатів"))
      .finally(() => setLoading(false));
  }, [row.source_id, row.source_department_id]);

  const handleBind = async (masterId) => {
    setBinding(masterId);
    try { await onBind(row.source_id, row.source_department_id, masterId); }
    catch (e) { setErr(e?.response?.data?.detail || "Помилка прив'язки"); setBinding(null); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 0, maxWidth: 1060, width: "97%",
                    maxHeight: "92vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #e5e7eb",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      flexShrink: 0 }}>
          <div>
            <strong style={{ fontSize: 16 }}>Схожі master-підрозділи</strong>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              <code style={{ color: "#1e40af" }}>{row.source_department_id}</code>
              {" · "}{srcName}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#9ca3af" }}>✕</button>
        </div>

        {err && (
          <div style={{ padding: "8px 20px", background: "#fee2e2", fontSize: 12,
                        color: "#991b1b", flexShrink: 0 }}>{err}</div>
        )}

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* LEFT — candidate list */}
          <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid #e5e7eb",
                        overflowY: "auto", padding: "8px 0" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>Завантаження...</div>
            ) : !data?.candidates?.length ? (
              <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>Кандидатів не знайдено</div>
            ) : data.candidates.map(c => {
              const isActive = selected?.department_id === c.department_id;
              return (
                <div key={c.department_id} onClick={() => setSelected(c)}
                  style={{ padding: "8px 14px", cursor: "pointer", borderLeft: `3px solid ${isActive ? "#3b82f6" : "transparent"}`,
                            background: isActive ? "#eff6ff" : "transparent",
                            borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: "#111827",
                                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.risky_duplicate && <span title="Схожа назва, але інший parent / org" style={{ color: "#d97706", marginRight: 4 }}>⚠</span>}
                        {c.department_name}
                      </div>
                      <code style={{ fontSize: 10, color: "#6b7280" }}>{c.department_id}</code>
                    </div>
                    <MatchBar score={c.score}
                      confidence={c.score >= 90 ? "HIGH" : c.score >= 60 ? "MEDIUM" : "LOW"}
                      matchedFields={c.matched_fields} mismatchedFields={c.mismatched_fields} />
                  </div>
                  <RecommendationBadge recommendation={c.recommendation}
                    reason={c.recommendation_reason} risky={c.risky_duplicate} />
                </div>
              );
            })}
          </div>

          {/* RIGHT — side-by-side comparison */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {!selected ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                Оберіть кандидата з лівого списку
              </div>
            ) : (() => {
              const mst = selected;
              const srcVals = { source_name: srcName, source_org: srcOrg, source_branch: srcBranch, source_region: srcRegion, source_pid: srcPid };
              const mstVals = { department_name: mst.department_name, organization_name: mst.organization_name,
                                branch_name: mst.branch_name, region_name: mst.region_name,
                                parent_department_id: mst.parent_department_id };
              return (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                      {mst.department_name}
                    </span>
                    <code style={{ marginLeft: 8, fontSize: 11, color: "#6b7280" }}>{mst.department_id}</code>
                    {mst.risky_duplicate && (
                      <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 4, fontSize: 11,
                                     background: "#fff7ed", color: "#d97706", fontWeight: 600, border: "1px solid #fed7aa" }}>
                        ⚠ Ризиковий дублікат
                      </span>
                    )}
                  </div>

                  {/* Comparison table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        <th style={{ padding: "5px 10px", width: "18%", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 10, borderBottom: "1px solid #e5e7eb" }}>Поле</th>
                        <th style={{ padding: "5px 10px", width: "37%", textAlign: "left", fontWeight: 600, color: "#1e40af", fontSize: 10, borderBottom: "1px solid #e5e7eb" }}>Source (джерело)</th>
                        <th style={{ padding: "5px 10px", width: "37%", textAlign: "left", fontWeight: 600, color: "#065f46", fontSize: 10, borderBottom: "1px solid #e5e7eb" }}>Master (довідник)</th>
                        <th style={{ padding: "5px 10px", width: "8%", textAlign: "center", fontSize: 10, borderBottom: "1px solid #e5e7eb" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {_CMP_ROWS.map(({ label, srcKey, mstKey }) => {
                        const sv = srcVals[srcKey] || "";
                        const mv = mstVals[mstKey] || "";
                        const { match, mismatch } = _cmpCell(sv, mv);
                        return (
                          <tr key={label} style={{ borderBottom: "1px solid #f3f4f6",
                            background: mismatch ? "#fff7ed" : match ? "#f0fdf4" : "transparent" }}>
                            <td style={{ padding: "5px 10px", color: "#9ca3af", fontWeight: 500 }}>{label}</td>
                            <td style={{ padding: "5px 10px", color: "#1d4ed8" }}>
                              {sv || <span style={{ color: "#d1d5db", fontStyle: "italic" }}>порожньо</span>}
                            </td>
                            <td style={{ padding: "5px 10px", color: mismatch ? "#c2410c" : "#065f46", fontWeight: mismatch ? 600 : 400 }}>
                              {mv || <span style={{ color: "#d1d5db", fontStyle: "italic" }}>порожньо</span>}
                            </td>
                            <td style={{ padding: "5px 10px", textAlign: "center" }}>
                              {sv && mv ? (match ? "✅" : "❌") : (sv || mv ? "⚠️" : "")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Matched / Mismatched chips */}
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(mst.matched_fields || []).map(f => (
                      <span key={f} style={{ padding: "1px 7px", borderRadius: 3, fontSize: 11,
                                             background: "#d1fae5", color: "#065f46" }}>
                        ✓ {SCORE_FIELD_LABELS_EXT[f] || f}
                      </span>
                    ))}
                    {(mst.mismatched_fields || []).map(f => (
                      <span key={f} style={{ padding: "1px 7px", borderRadius: 3, fontSize: 11,
                                             background: "#fee2e2", color: "#dc2626" }}>
                        ✗ {SCORE_FIELD_LABELS_EXT[f] || f}
                      </span>
                    ))}
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <button
                      onClick={() => handleBind(mst.department_id)}
                      disabled={!!binding}
                      style={{ padding: "7px 22px", fontSize: 13, fontWeight: 700,
                               background: "#2563eb", color: "#fff", border: "none",
                               borderRadius: 5, cursor: "pointer" }}>
                      {binding === mst.department_id ? "..." : `Прив'язати → ${mst.department_id}`}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div style={{ padding: "10px 20px", borderTop: "1px solid #e5e7eb",
                      display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ padding: "6px 18px", fontSize: 12, border: "1px solid #d1d5db",
                     borderRadius: 4, cursor: "pointer", background: "#fff", color: "#6b7280" }}>
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SmartAutoPreviewModal ─────────────────────────────────────────────────────

function SmartAutoPreviewModal({ sourceId, onConfirm, onClose }) {
  const [preview,  setPreview]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [applying, setApplying] = useState(false);
  const [err,      setErr]      = useState(null);

  useEffect(() => {
    bulkBindSuggestedPreview({ source_id: sourceId || null })
      .then(setPreview)
      .catch(() => setErr("Помилка завантаження preview"))
      .finally(() => setLoading(false));
  }, [sourceId]);

  const SKIP_LABELS = {
    risky_duplicate: "Ризикові дублікати (схожа назва, різний контекст)",
    parent_mismatch: "Розбіжність parent",
    org_mismatch:    "Розбіжність організації",
    low_score:       "Недостатній score",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 700, width: "97%",
                    maxHeight: "88vh", overflowY: "auto",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <strong style={{ fontSize: 16 }}>🎯 Попередній перегляд Smart AUTO</strong>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Прив'язуються тільки AUTO_BIND з score≥95 без ризикових дублікатів
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af" }}>✕</button>
        </div>

        {err && <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 5, fontSize: 12, color: "#991b1b", marginBottom: 12 }}>{err}</div>}

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Обчислення...</div>
        ) : preview && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Pending рядків", value: preview.total, color: "#374151" },
                { label: "Буде прив'язано", value: preview.will_bind_count, color: "#065f46" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: "10px 14px", background: "#f9fafb",
                                          border: "1px solid #e5e7eb", borderRadius: 6 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Skip reasons */}
            {Object.entries(preview.skip_counts || {}).some(([, v]) => v > 0) && (
              <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fff7ed",
                            border: "1px solid #fed7aa", borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>Пропущено:</div>
                {Object.entries(preview.skip_counts).filter(([, v]) => v > 0).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12, color: "#78350f", marginBottom: 3 }}>
                    · {v} — {SKIP_LABELS[k] || k}
                  </div>
                ))}
              </div>
            )}

            {/* Will bind list */}
            {preview.will_bind_count > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 6 }}>
                  Буде прив'язано ({preview.will_bind_count}){preview.will_bind_count > 20 ? " — показано перші 20" : ""}:
                </div>
                <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e5e7eb",
                              borderRadius: 5, fontSize: 11 }}>
                  {preview.will_bind.map((item, i) => (
                    <div key={i} style={{ padding: "5px 10px", borderBottom: "1px solid #f3f4f6",
                                          display: "flex", gap: 8, alignItems: "baseline" }}>
                      <code style={{ color: "#1e40af", flexShrink: 0, fontSize: 10 }}>{item.source_department_id}</code>
                      <span style={{ color: "#374151", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.source_department_name}</span>
                      <span style={{ color: "#9ca3af" }}>→</span>
                      <code style={{ color: "#065f46", flexShrink: 0, fontSize: 10 }}>{item.master_department_id}</code>
                      <span style={{ color: "#6b7280", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.master_department_name}</span>
                      <span style={{ color: "#9ca3af", flexShrink: 0, fontSize: 10 }}>{item.score}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.will_bind_count === 0 && (
              <div style={{ padding: "16px", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                Немає безпечних кандидатів для AUTO прив'язки
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <button onClick={onClose}
                style={{ padding: "7px 18px", fontSize: 13, border: "1px solid #d1d5db",
                         borderRadius: 5, cursor: "pointer", background: "#fff", color: "#6b7280" }}>
                Скасувати
              </button>
              <button onClick={async () => { setApplying(true); await onConfirm(); }}
                disabled={applying || preview.will_bind_count === 0}
                style={{ padding: "7px 22px", fontSize: 13, fontWeight: 700,
                         background: preview.will_bind_count > 0 ? "#059669" : "#9ca3af",
                         color: "#fff", border: "none", borderRadius: 5,
                         cursor: preview.will_bind_count > 0 ? "pointer" : "not-allowed" }}>
                {applying ? "Виконання..." : `Прив'язати ${preview.will_bind_count}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── HelpModal ─────────────────────────────────────────────────────────────────

function HelpModal({ onClose }) {
  const EXAMPLES = [
    { name: "АДМІНІСТРАЦІЯ ЛЬВІВ", scenario: "та сама орг + той самий parent", outcome: "Bind", color: "#065f46", bg: "#d1fae5", icon: "✅" },
    { name: "АДМІНІСТРАЦІЯ ЛЬВІВ", scenario: "схожа назва, але інша організація",  outcome: "Review", color: "#92400e", bg: "#fef3c7", icon: "⚠" },
    { name: "АДМІНІСТРАЦІЯ ЛЬВІВ", scenario: "схожа назва, parent відсутній в dim", outcome: "Create Parent", color: "#991b1b", bg: "#fee2e2", icon: "🔴" },
    { name: "СКЛАД ХОДОСІВКА",     scenario: "немає подібного master",              outcome: "Create", color: "#374151", bg: "#f3f4f6", icon: "➕" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1200,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 640, width: "97%",
                    maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>? Довідка — Відповідність підрозділів</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af" }}>✕</button>
        </div>

        {/* Decision guide */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Як читати рекомендацію Engine:</div>
          {Object.entries(RECOMMENDATION_CFG).map(([key, cfg]) => (
            <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
              <span style={{ flexShrink: 0, padding: "1px 8px", borderRadius: 4, fontSize: 10,
                             fontWeight: 700, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>
                {cfg.label}
              </span>
              <span style={{ fontSize: 11, color: "#374151" }}>{cfg.hint}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Приклади рішень:</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Підрозділ", "Ситуація", "Дія"].map(h => (
                  <th key={h} style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600,
                                       fontSize: 10, color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EXAMPLES.map((ex, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "6px 10px", fontWeight: 600, color: "#111827" }}>{ex.name}</td>
                  <td style={{ padding: "6px 10px", color: "#374151" }}>{ex.scenario}</td>
                  <td style={{ padding: "6px 10px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                                   background: ex.bg, color: ex.color }}>
                      {ex.icon} {ex.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "10px 12px", background: "#f0fdf4", border: "1px solid #6ee7b7",
                      borderRadius: 6, fontSize: 11, color: "#374151" }}>
          <strong>Правила безпеки:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li>Ніколи не створюй дублікатів master за назвою — перевіряй орг + parent</li>
            <li>Parent повинен існувати в dim_department перед створенням child</li>
            <li>AUTO прив'язка безпечна лише при score≥95 без ризикових дублікатів</li>
            <li>⚠ REVIEW = схожа назва але різний контекст — потрібна ручна перевірка</li>
          </ul>
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ padding: "6px 18px", fontSize: 12, border: "1px solid #d1d5db",
                     borderRadius: 4, cursor: "pointer", color: "#6b7280" }}>
            Зрозуміло
          </button>
        </div>
      </div>
    </div>
  );
}

function KpiPill({ label, value, color, active, onClick, title }) {
  const activeColor = color || "#374151";
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex", alignItems: "baseline", gap: 5,
        padding: "3px 11px", borderRadius: 20, border: "none",
        background: active ? `${activeColor}18` : "#f3f4f6",
        outline: active ? `2px solid ${activeColor}` : "none",
        cursor: onClick ? "pointer" : "default",
        fontSize: 12, lineHeight: 1,
      }}>
      <span style={{ fontWeight: 700, fontSize: 15, color: activeColor }}>{value}</span>
      <span style={{ color: active ? activeColor : "#6b7280", fontWeight: active ? 600 : 400 }}>{label}</span>
    </button>
  );
}

// ── Hierarchy helpers ─────────────────────────────────────────────────────────

const NODE_TYPE_CFG = {
  root:         { label: "Root",         bg: "#f3f4f6", color: "#6b7280" },
  root_parent:  { label: "Root·Parent",  bg: "#dbeafe", color: "#1e40af" },
  leaf:         { label: "Leaf",         bg: "#d1fae5", color: "#065f46" },
  parent_child: { label: "Parent·Child", bg: "#ede9fe", color: "#7c3aed" },
};

const NODE_TYPE_TITLES = {
  root:         "Root: немає parent і немає дітей",
  root_parent:  "Root·Parent: немає parent, але є діти",
  leaf:         "Leaf: є parent, немає дітей",
  parent_child: "Parent·Child: є parent і є діти",
};

function NodeTypeBadge({ nodeType, level }) {
  const cfg   = NODE_TYPE_CFG[nodeType] || { label: "—", bg: "#f3f4f6", color: "#9ca3af" };
  const title = NODE_TYPE_TITLES[nodeType] || "";
  return (
    <span title={title} style={{
      fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap",
      display: "inline-block", cursor: "help",
    }}>
      {cfg.label}{level !== undefined && level !== null && (
        <span style={{ opacity: 0.6, marginLeft: 3, fontWeight: 400 }}>L{level}</span>
      )}
    </span>
  );
}

function HierarchyInfo({ row, prefix = "Source" }) {
  const nodeType = prefix === "Source" ? row?.source_node_type : row?.master_node_type;
  const level    = prefix === "Source" ? row?.source_level     : row?.master_level;
  const parentId = prefix === "Source" ? row?.effective_parent_id   : row?.master_parent_id;
  const parentNm = prefix === "Source" ? row?.effective_parent_name : row?.master_parent_name;
  if (!nodeType) return null;
  const cfg = NODE_TYPE_CFG[nodeType] || NODE_TYPE_CFG.leaf;
  return (
    <div style={{ padding: "6px 10px", background: "#f9fafb", border: "1px solid #e5e7eb",
                  borderRadius: 5, fontSize: 11, color: "#374151", marginBottom: 8 }}>
      <span style={{ color: "#9ca3af", marginRight: 6 }}>Поточний вузол ({prefix}):</span>
      <span style={{ fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                     background: cfg.bg, color: cfg.color, marginRight: 8 }}>
        {cfg.label}
      </span>
      <span style={{ color: "#9ca3af" }}>Рівень {level}</span>
      {parentId && (
        <div style={{ marginTop: 3, color: "#6b7280" }}>
          Parent: <code style={{ fontSize: 10, color: "#374151" }}>{parentId}</code>
          {parentNm && <span style={{ color: "#9ca3af" }}> — {parentNm}</span>}
        </div>
      )}
    </div>
  );
}

// ── BindModal ─────────────────────────────────────────────────────────────────

const COMPARE_FIELDS = [
  { label: "Організація", srcKey: "org",        masterKey: "organization_name" },
  { label: "Холдинг",     srcKey: "holding",    masterKey: "holding_name" },
  { label: "Філія",       srcKey: "branch",     masterKey: "branch_name" },
  { label: "Регіон",      srcKey: "region",     masterKey: "region_name" },
  { label: "Parent ID",   srcKey: "parentId",   masterKey: "parent_department_id" },
  { label: "Parent назва", srcKey: "parentName", masterKey: "parent_department_name" },
];

function cmpIcon(a, b) {
  if (!a && !b) return <span style={{ color: "#d1d5db" }}>—</span>;
  if (!a || !b) return <span title="Одна сторона порожня">⚠️</span>;
  return a.trim().toLowerCase() === b.trim().toLowerCase()
    ? <span style={{ color: "#059669" }}>✅</span>
    : <span style={{ color: "#dc2626" }}>❌</span>;
}

const SCORE_FIELD_LABELS = {
  dept_id: "Dept ID", dept_name: "Назва", org: "Організація",
  branch: "Філія", region: "Регіон", holding: "Холдинг",
  parent_id: "Parent ID", parent_name: "Parent назва",
};

function BindModal({ row, masters, onBind, onClose, onCreateInstead }) {
  const [search,          setSearch]          = useState("");
  const [selectedId,      setSelectedId]      = useState(row.master_department_id || "");
  const [busy,            setBusy]            = useState(false);
  const [err,             setErr]             = useState(null);
  const [suggestion,      setSuggestion]      = useState(null);
  const [loadingSuggest,  setLoadingSuggest]  = useState(false);
  const [suggestErr,      setSuggestErr]      = useState(null);

  const handleSuggest = async () => {
    setLoadingSuggest(true); setSuggestErr(null); setSuggestion(null);
    try {
      const result = await suggestMatch(row.source_id, row.source_department_id);
      setSuggestion(result);
      if (result.best_match && result.score_level !== "low") {
        setSelectedId(result.best_match.department_id);
      }
    } catch {
      setSuggestErr("Помилка підбору — спробуйте вручну");
    } finally {
      setLoadingSuggest(false);
    }
  };

  const src = {
    id:         row.source_department_id,
    name:       row.effective_department_name    || row.source_department_name || "",
    org:        row.effective_organization_name  || row.organization_name      || "",
    holding:    row.effective_holding            || row.holding_name           || "",
    branch:     row.effective_branch             || row.branch_name            || "",
    region:     row.effective_region             || row.region_name            || "",
    parentId:   row.effective_parent_id          || row.source_parent_department_id   || "",
    parentName: row.effective_parent_name        || row.source_parent_department_name || "",
  };

  const filtered = !search ? masters : masters.filter(m => {
    const q = search.toLowerCase();
    return (
      (m.department_id        || "").toLowerCase().includes(q) ||
      (m.department_name      || "").toLowerCase().includes(q) ||
      (m.organization_name    || "").toLowerCase().includes(q) ||
      (m.branch_name          || "").toLowerCase().includes(q) ||
      (m.parent_department_id || "").toLowerCase().includes(q)
    );
  });

  const selected = masters.find(m => m.department_id === selectedId) || null;

  const handleBind = async () => {
    if (!selectedId) { setErr("Оберіть master підрозділ"); return; }
    setBusy(true); setErr(null);
    try {
      await onBind(row.source_id, row.source_department_id, selectedId);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка прив'язки");
    } finally { setBusy(false); }
  };

  const TH = ({ children, w }) => (
    <th style={{ padding: "5px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb",
                 fontWeight: 600, fontSize: 10, color: "#6b7280", background: "#f9fafb",
                 whiteSpace: "nowrap", width: w }}>
      {children}
    </th>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 1000, width: "97%",
                    maxHeight: "93vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        {/* ── Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      marginBottom: 14, flexShrink: 0 }}>
          <div>
            <strong style={{ fontSize: 17 }}>Прив'язати до master підрозділу</strong>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Оберіть запис з таблиці — порівняльна панель оновиться автоматично
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer",
                     fontSize: 22, color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Source context bar */}
        <div style={{ padding: "8px 14px", background: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: 6, marginBottom: 12, flexShrink: 0,
                      display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12 }}>
          <div>
            <span style={{ color: "#6b7280" }}>Source ID: </span>
            <code style={{ fontWeight: 700, color: "#1e40af" }}>{src.id}</code>
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>Назва: </span>
            <strong>{src.name}</strong>
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>Орг: </span>
            <strong>{src.org || "—"}</strong>
          </div>
          {src.branch   && <div><span style={{ color: "#6b7280" }}>Філія: </span><strong>{src.branch}</strong></div>}
          {src.region   && <div><span style={{ color: "#6b7280" }}>Регіон: </span><strong>{src.region}</strong></div>}
          {src.holding  && <div><span style={{ color: "#6b7280" }}>Холдинг: </span><strong>{src.holding}</strong></div>}
          {src.parentId && (
            <div>
              <span style={{ color: "#6b7280" }}>Parent: </span>
              <code style={{ color: "#7c3aed" }}>{src.parentId}</code>
              {src.parentName && <span style={{ color: "#9ca3af" }}> · {src.parentName}</span>}
            </div>
          )}
          {Object.keys(row.extra_fields || {}).length > 0 && (
            <div style={{ width: "100%", marginTop: 4 }}>
              <span style={{ color: "#6b7280", fontSize: 11 }}>Доп. поля: </span>
              <ExtraFieldsChips fields={row.extra_fields} />
            </div>
          )}
          {row.source_node_type && (
            <div style={{ width: "100%", marginTop: 6, display: "flex", gap: 6, alignItems: "center",
                          flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#6b7280" }}>Поточний вузол (Source):</span>
              {(() => {
                const cfg = NODE_TYPE_CFG[row.source_node_type] || NODE_TYPE_CFG.leaf;
                return (
                  <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                                 background: cfg.bg, color: cfg.color }}>
                    {cfg.label}
                  </span>
                );
              })()}
              <span style={{ fontSize: 11, color: "#9ca3af" }}>Рівень {row.source_level}</span>
            </div>
          )}
        </div>

        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 10, flexShrink: 0 }}>{err}</div>
        )}

        {/* ── Suggest button + panel */}
        <div style={{ marginBottom: 10, flexShrink: 0 }}>
          <button
            onClick={handleSuggest}
            disabled={loadingSuggest}
            title="Автоматично підібрати найближчий master-підрозділ за збігом ID, назви, організації та ін."
            style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600,
                     background: "#f5f3ff", border: "1px solid #a78bfa",
                     borderRadius: 5, cursor: "pointer", color: "#5b21b6" }}>
            {loadingSuggest ? "Шукаю..." : "🎯 Підібрати найкращий варіант"}
          </button>
          {suggestErr && (
            <span style={{ marginLeft: 10, fontSize: 12, color: "#dc2626" }}>{suggestErr}</span>
          )}
          {suggestion && (
            <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 6, fontSize: 12,
                          border: `1px solid ${suggestion.score_level === "high" ? "#6ee7b7" : suggestion.score_level === "medium" ? "#fde68a" : "#fca5a5"}`,
                          background: suggestion.score_level === "high" ? "#f0fdf4" : suggestion.score_level === "medium" ? "#fffbeb" : "#fff1f2" }}>
              {!suggestion.best_match ? (
                <span style={{ color: "#6b7280" }}>Жодного кандидата не знайдено</span>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: "#111827" }}>
                      {suggestion.score_level === "high" ? "✅" : suggestion.score_level === "medium" ? "⚠️" : "❌"} Найкращий варіант:
                    </span>
                    <code style={{ color: "#1e40af", background: "#eff6ff", padding: "1px 8px", borderRadius: 4 }}>
                      {suggestion.best_match.department_id}
                    </code>
                    <span style={{ color: "#374151" }}>{suggestion.best_match.department_name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 10,
                                   background: suggestion.score_level === "high" ? "#d1fae5" : suggestion.score_level === "medium" ? "#fef3c7" : "#fee2e2",
                                   color: suggestion.score_level === "high" ? "#065f46" : suggestion.score_level === "medium" ? "#92400e" : "#991b1b" }}>
                      {suggestion.best_match.score} балів
                    </span>
                    {suggestion.score_level === "low" && (
                      <span style={{ fontSize: 11, color: "#dc2626" }}>Низький збіг — не обрано автоматично</span>
                    )}
                  </div>
                  {suggestion.best_match.matched_fields.length > 0 && (
                    <div style={{ marginBottom: 3 }}>
                      <span style={{ color: "#6b7280" }}>Збіг: </span>
                      {suggestion.best_match.matched_fields.map(f => (
                        <span key={f} style={{ marginRight: 4, padding: "1px 6px", borderRadius: 3,
                                               background: "#d1fae5", color: "#065f46", fontSize: 11 }}>
                          {SCORE_FIELD_LABELS[f] || f}
                        </span>
                      ))}
                    </div>
                  )}
                  {suggestion.best_match.mismatched_fields.length > 0 && (
                    <div>
                      <span style={{ color: "#6b7280" }}>Розбіжність: </span>
                      {suggestion.best_match.mismatched_fields.map(f => (
                        <span key={f} style={{ marginRight: 4, padding: "1px 6px", borderRadius: 3,
                                               background: "#fee2e2", color: "#991b1b", fontSize: 11 }}>
                          {SCORE_FIELD_LABELS[f] || f}
                        </span>
                      ))}
                    </div>
                  )}
                  {suggestion.candidates.length > 1 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ color: "#9ca3af", fontSize: 11 }}>Інші кандидати:</span>
                      {suggestion.candidates.slice(1).map(c => (
                        <button key={c.department_id}
                          onClick={() => setSelectedId(c.department_id)}
                          title={`${c.department_name} · ${c.score} балів`}
                          style={{ padding: "2px 8px", fontSize: 11, cursor: "pointer",
                                   border: "1px solid #d1d5db", borderRadius: 3,
                                   background: selectedId === c.department_id ? "#eff6ff" : "#f9fafb",
                                   color: selectedId === c.department_id ? "#1e40af" : "#374151" }}>
                          {c.department_id} <span style={{ color: "#9ca3af" }}>({c.score})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Search quick-fill buttons */}
        {(src.name || src.id) && (
          <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
            {src.name && (
              <button
                onClick={() => setSearch(src.name)}
                title={`Підставити назву: ${src.name}`}
                style={{ fontSize:11, padding:"2px 8px", border:"1px solid #93c5fd",
                         borderRadius:4, background:"#eff6ff", cursor:"pointer",
                         color:"#1e40af", maxWidth:260, overflow:"hidden",
                         textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                📋 {src.name}
              </button>
            )}
            {src.id && (
              <button
                onClick={() => setSearch(
                  src.id.match(/^\d+_(.+)$/) ? src.id.replace(/^\d+_/, "") : src.id
                )}
                title={`Підставити UID: ${src.id}`}
                style={{ fontSize:11, padding:"2px 8px", border:"1px solid #a78bfa",
                         borderRadius:4, background:"#f5f3ff", cursor:"pointer",
                         color:"#6d28d9", fontFamily:"monospace",
                         maxWidth:220, overflow:"hidden",
                         textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                🔑 {src.id.match(/^\d+_(.+)$/) ? src.id.replace(/^\d+_/, "") : src.id}
              </button>
            )}
          </div>
        )}

        {/* ── Search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук по ID, назві, організації, філії, parent ID..."
            autoFocus
            style={{ flex: 1, padding: "7px 10px", border: "1px solid #d1d5db",
                     borderRadius: 5, fontSize: 13 }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 5,
                       background: "none", cursor: "pointer", color: "#6b7280" }}>✕</button>
          )}
          <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
            {filtered.length} / {masters.length}
          </span>
        </div>

        {/* ── Candidate table (scrollable) */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden",
                      maxHeight: 240, overflowY: "auto", flexShrink: 0, marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <TH w={60}></TH>
                <TH w={110}>Dept ID</TH>
                <TH>Назва</TH>
                <TH w={110}>Холдинг</TH>
                <TH w={140}>Організація</TH>
                <TH w={100}>Філія</TH>
                <TH w={90}>Регіон</TH>
                <TH w={90}>Parent ID</TH>
                <TH>Parent назва</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9}
                    style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
                    Нічого не знайдено
                  </td>
                </tr>
              )}
              {filtered.map(m => {
                const isSelected = m.department_id === selectedId;
                const isChild    = !!m.parent_department_id;
                return (
                  <tr key={m.department_id}
                    onClick={() => setSelectedId(m.department_id)}
                    style={{
                      cursor: "pointer",
                      background: isSelected ? "#eff6ff" : "transparent",
                      borderBottom: "1px solid #f3f4f6",
                      boxShadow: isSelected ? "inset 2px 0 0 #3b82f6" : "none",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>

                    <td style={{ padding: "4px 8px" }}>
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedId(m.department_id); }}
                        style={{
                          padding: "2px 8px", fontSize: 10, fontWeight: 700,
                          background: isSelected ? "#3b82f6" : "#f3f4f6",
                          color: isSelected ? "#fff" : "#374151",
                          border: isSelected ? "1px solid #3b82f6" : "1px solid #d1d5db",
                          borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
                        }}>
                        {isSelected ? "✓ Обрано" : "Обрати"}
                      </button>
                    </td>

                    <td style={{ padding: "4px 8px" }}>
                      <code style={{ fontSize: 10, color: "#374151" }}>{m.department_id}</code>
                    </td>

                    <td style={{ padding: "4px 8px", color: "#111827" }}>
                      {isChild ? (
                        <span style={{ color: "#6b7280", marginRight: 4, fontSize: 10 }}>↳</span>
                      ) : (
                        <span style={{ marginRight: 4, fontSize: 10 }}>📁</span>
                      )}
                      <span style={{ fontWeight: isChild ? 400 : 600 }}>{m.department_name}</span>
                    </td>

                    <td style={{ padding: "4px 8px", color: "#6b7280" }}>{m.holding_name || <span style={{ color: "#e5e7eb" }}>—</span>}</td>
                    <td style={{ padding: "4px 8px", color: "#374151" }}>{m.organization_name || <span style={{ color: "#e5e7eb" }}>—</span>}</td>
                    <td style={{ padding: "4px 8px", color: "#6b7280" }}>{m.branch_name || <span style={{ color: "#e5e7eb" }}>—</span>}</td>
                    <td style={{ padding: "4px 8px", color: "#6b7280" }}>{m.region_name || <span style={{ color: "#e5e7eb" }}>—</span>}</td>

                    <td style={{ padding: "4px 8px" }}>
                      {m.parent_department_id
                        ? <code style={{ fontSize: 10, color: "#7c3aed" }}>{m.parent_department_id}</code>
                        : <span style={{ color: "#e5e7eb" }}>—</span>}
                    </td>
                    <td style={{ padding: "4px 8px", color: "#9ca3af", fontSize: 10 }}>
                      {m.parent_department_name || ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Comparison panel */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {!selected ? (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>
                Оберіть master підрозділ з таблиці. Якщо відповідного master немає — створіть новий із staging.
              </div>
            </div>
          ) : (
            <>
              {/* Selected header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  Порівняння:
                </span>
                <code style={{ fontSize: 12, color: "#1e40af", background: "#eff6ff",
                               padding: "1px 8px", borderRadius: 4 }}>
                  {selected.department_id}
                </code>
                <span style={{ fontSize: 13, color: "#374151" }}>· {selected.department_name}</span>
                {!selected.parent_department_id ? (
                  <span style={{ fontSize: 10, background: "#f3f4f6", padding: "2px 8px",
                                 borderRadius: 10, color: "#6b7280", fontWeight: 600 }}>
                    📁 Root підрозділ
                  </span>
                ) : (
                  <span style={{ fontSize: 10, background: "#ede9fe", padding: "2px 8px",
                                 borderRadius: 10, color: "#7c3aed", fontWeight: 600 }}>
                    ↳ Child → {selected.parent_department_id}
                  </span>
                )}
              </div>

              {/* Comparison table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12,
                              border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                                 color: "#6b7280", width: "14%", borderBottom: "1px solid #e5e7eb" }}>
                      Поле
                    </th>
                    <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                                 color: "#1e40af", width: "38%", borderBottom: "1px solid #e5e7eb" }}>
                      Staging (source)
                    </th>
                    <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600,
                                 color: "#065f46", width: "38%", borderBottom: "1px solid #e5e7eb" }}>
                      Master dim_department
                    </th>
                    <th style={{ padding: "6px 12px", textAlign: "center", fontWeight: 600,
                                 width: "10%", borderBottom: "1px solid #e5e7eb" }}>
                      Збіг
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_FIELDS.map(({ label, srcKey, masterKey }) => {
                    const srcVal    = src[srcKey] || "";
                    const masterVal = (selected[masterKey] || "");
                    const match     = srcVal && masterVal &&
                      srcVal.trim().toLowerCase() === masterVal.trim().toLowerCase();
                    const mismatch  = srcVal && masterVal && !match;
                    return (
                      <tr key={label} style={{
                        background: mismatch ? "#fff7ed" : match ? "#f0fdf4" : "transparent",
                        borderBottom: "1px solid #f3f4f6",
                      }}>
                        <td style={{ padding: "5px 12px", color: "#9ca3af", fontWeight: 500 }}>
                          {label}
                        </td>
                        <td style={{ padding: "5px 12px", color: "#1d4ed8" }}>
                          {srcVal || <span style={{ color: "#d1d5db", fontStyle: "italic" }}>порожньо</span>}
                        </td>
                        <td style={{ padding: "5px 12px", color: "#065f46" }}>
                          {masterVal || <span style={{ color: "#d1d5db", fontStyle: "italic" }}>порожньо</span>}
                        </td>
                        <td style={{ padding: "5px 12px", textAlign: "center" }}>
                          {cmpIcon(srcVal, masterVal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* ── Action bar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center",
                      marginTop: 14, paddingTop: 14, borderTop: "1px solid #f3f4f6", flexShrink: 0,
                      flexWrap: "wrap" }}>
          <button
            onClick={handleBind}
            disabled={busy || !selectedId}
            style={{
              padding: "8px 24px", fontSize: 13, fontWeight: 700,
              background: selectedId ? "var(--primary, #2563eb)" : "#d1d5db",
              color: "#fff", border: "none", borderRadius: 5,
              cursor: selectedId ? "pointer" : "not-allowed",
            }}>
            {busy ? "Прив'язка..." : selectedId ? `Прив'язати → ${selectedId}` : "Оберіть master підрозділ"}
          </button>
          <button onClick={onClose}
            style={{ padding: "8px 16px", background: "none", border: "1px solid #d1d5db",
                     borderRadius: 5, cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
            Скасувати
          </button>

          {onCreateInstead && (
            <button
              onClick={() => { onClose(); onCreateInstead(row); }}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 600,
                background: "#f0fdf4", border: "1px solid #34d399",
                borderRadius: 5, cursor: "pointer", color: "#065f46",
              }}>
              + Створити master з поточного staging
            </button>
          )}

          {selected && (
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
              {COMPARE_FIELDS.filter(({ srcKey, masterKey }) => {
                const s = src[srcKey] || ""; const m = selected[masterKey] || "";
                return s && m && s.trim().toLowerCase() !== m.trim().toLowerCase();
              }).length} розбіжностей
            </span>
          )}
        </div>

      </div>
    </div>
  );
}

// ── DictLookupModal ───────────────────────────────────────────────────────────

const DICT_LABELS = {
  holding:      "Холдинг",
  organization: "Організація",
  region:       "Регіон",
  branch:       "Філія",
  department:   "Підрозділ",
};

function DictLookupModal({ dictType, onSelect, onClose }) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    setLoading(true);
    getDictEntries(dictType)
      .then(setItems)
      .catch(() => setErr("Помилка завантаження довідника"))
      .finally(() => setLoading(false));
  }, [dictType]);

  const filtered = !search.trim()
    ? items
    : items.filter(it => (it.name || "").toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 20, maxWidth: 480, width: "95%",
                    maxHeight: "80vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}
           onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginBottom: 12, flexShrink: 0 }}>
          <strong style={{ fontSize: 15 }}>Вибрати з довідника: {DICT_LABELS[dictType] || dictType}</strong>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af" }}>
            ✕
          </button>
        </div>

        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Пошук за назвою..."
          style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 5,
                   fontSize: 13, marginBottom: 8, flexShrink: 0 }}
        />

        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, flexShrink: 0 }}>
          {loading ? "Завантаження..." : `${filtered.length} / ${items.length} записів`}
        </div>

        {err && (
          <div style={{ padding: "6px 10px", background: "#fee2e2", borderRadius: 5,
                        fontSize: 12, color: "#991b1b", marginBottom: 8, flexShrink: 0 }}>
            {err}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              Завантаження...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
              Нічого не знайдено
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600,
                               color: "#6b7280", borderBottom: "1px solid #e5e7eb", width: 60 }}>ID</th>
                  <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600,
                               color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>Назва</th>
                  <th style={{ padding: "5px 10px", width: 70, borderBottom: "1px solid #e5e7eb" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(it => (
                  <tr key={it.id}
                    style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                    onClick={() => onSelect(it)}
                    onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "5px 10px" }}>
                      <code style={{ fontSize: 10, color: "#374151" }}>{it.id}</code>
                    </td>
                    <td style={{ padding: "5px 10px", color: "#111827", fontWeight: 500 }}>
                      {it.name}
                    </td>
                    <td style={{ padding: "5px 10px", textAlign: "right" }}>
                      <button
                        onClick={e => { e.stopPropagation(); onSelect(it); }}
                        style={{ padding: "2px 10px", fontSize: 10, fontWeight: 700,
                                 background: "#f0fdf4", border: "1px solid #34d399",
                                 borderRadius: 3, cursor: "pointer", color: "#065f46",
                                 whiteSpace: "nowrap" }}>
                        Обрати
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ padding: "5px 16px", fontSize: 12, border: "1px solid #d1d5db",
                     borderRadius: 4, cursor: "pointer", background: "#fff", color: "#6b7280" }}>
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ResolutionCard ────────────────────────────────────────────────────────────

function ResolutionCard({ label, name, resolution, resolving, creating, onCreateDict, onSelectFromDict, required }) {
  const empty = !name || !name.trim();

  let bg      = "#f9fafb";
  let border  = "#e5e7eb";
  let icon    = null;
  let statusText = "";

  if (!empty) {
    if (resolving) {
      bg = "#f9fafb"; border = "#e5e7eb"; statusText = "Перевірка...";
    } else if (resolution?.found) {
      bg = "#f0fdf4"; border = "#86efac"; icon = "✅"; statusText = `ID: ${resolution.id}`;
    } else if (resolution?.required && !resolution.found) {
      bg = "#fff7ed"; border = "#fdba74"; icon = "⚠️"; statusText = "Не знайдено";
    }
  }

  return (
    <div style={{ padding: "8px 10px", background: bg, border: `1px solid ${border}`,
                  borderRadius: 6, display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#6b7280" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis" }}>
        {empty ? <span style={{ color: "#9ca3af", fontWeight: 400, fontStyle: "italic" }}>не вказано</span>
               : name.trim()}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 20, flexWrap: "wrap" }}>
        {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
        {statusText && (
          <span style={{ fontSize: 11, color: resolution?.found ? "#065f46" : "#92400e" }}>
            {statusText}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
          {!resolving && onSelectFromDict && (
            <button
              type="button"
              onClick={onSelectFromDict}
              style={{ fontSize: 10, fontWeight: 600,
                       padding: "2px 7px", background: "#eff6ff", border: "1px solid #93c5fd",
                       borderRadius: 3, cursor: "pointer",
                       color: "#1d4ed8", whiteSpace: "nowrap" }}>
              Вибрати
            </button>
          )}
          {!empty && resolution?.required && !resolution.found && !resolving && (
            <button
              type="button"
              onClick={onCreateDict}
              disabled={creating}
              style={{ fontSize: 10, fontWeight: 700,
                       padding: "2px 8px", background: "#fef3c7", border: "1px solid #fbbf24",
                       borderRadius: 3, cursor: creating ? "not-allowed" : "pointer",
                       color: "#92400e", whiteSpace: "nowrap" }}>
              {creating ? "..." : "+ Створити"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CreateParentModal ─────────────────────────────────────────────────────────

function CreateParentModal({ childRow, onCreated, onClose }) {
  const effParentId   = childRow.effective_parent_id   || childRow.source_parent_department_id   || "";
  const effParentName = childRow.effective_parent_name || childRow.source_parent_department_name || "";

  const [deptId,     setDeptId]     = useState(effParentId);
  const [deptName,   setDeptName]   = useState(effParentName);
  const [orgName,    setOrgName]    = useState(childRow.effective_organization_name || childRow.organization_name || "");
  const [branch,     setBranch]     = useState(childRow.effective_branch || childRow.branch_name || "");
  const [region,     setRegion]     = useState(childRow.effective_region || childRow.region_name || "");
  const [holding,    setHolding]    = useState(childRow.effective_holding || childRow.holding_name || "");
  const [parentId,   setParentId]   = useState("");
  const [parentName, setParentName] = useState("");

  const [resolution,      setResolution]      = useState(null);
  const [resolving,       setResolving]       = useState(false);
  const [resolutionStale, setResolutionStale] = useState(false);
  const [creatingDict,    setCreatingDict]    = useState(null);
  const [lookupType,      setLookupType]      = useState(null);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);

  const runResolve = useCallback(async (h, o, r, b) => {
    setResolving(true);
    setResolutionStale(false);
    try {
      const res = await resolveContext({
        holding_name:      h || null,
        organization_name: o || null,
        region_name:       r || null,
        branch_name:       b || null,
      });
      setResolution(res);
    } catch {
      setResolution(null);
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    runResolve(
      childRow.effective_holding          || childRow.holding_name          || "",
      childRow.effective_organization_name || childRow.organization_name    || "",
      childRow.effective_region           || childRow.region_name           || "",
      childRow.effective_branch           || childRow.branch_name           || "",
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateDict = async (type, name) => {
    if (!name || !name.trim()) return;
    setCreatingDict(type);
    setErr(null);
    try {
      await createDictEntry({ entry_type: type, name: name.trim() });
      await runResolve(holding, orgName, region, branch);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка створення запису довідника");
    } finally {
      setCreatingDict(null);
    }
  };

  const handleSelectFromDict = (type, item) => {
    if (type === "holding")      { setHolding(item.name); }
    if (type === "organization") { setOrgName(item.name); }
    if (type === "region")       { setRegion(item.name); }
    if (type === "branch")       { setBranch(item.name); }
    setResolution(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [type]: { required: true, found: true, id: item.id, name: item.name } };
      updated.all_resolved = ["holding", "organization", "region", "branch"].every(
        k => !updated[k]?.required || updated[k]?.found
      );
      return updated;
    });
    setResolutionStale(false);
    setLookupType(null);
  };

  const blockingMissing = resolution && !resolution.all_resolved;
  const canCreate = !busy && !resolving && !blockingMissing && !resolutionStale
                    && deptId.trim() && deptName.trim() && orgName.trim();

  const handleCreate = async () => {
    if (!deptId.trim())   { setErr("department_id обов'язковий"); return; }
    if (!deptName.trim()) { setErr("Назва підрозділу обов'язкова"); return; }
    if (!orgName.trim())  { setErr("Організація обов'язкова"); return; }
    if (blockingMissing)  { setErr("Деякі записи довідника не знайдені."); return; }
    const autoBindSrcDeptId = (childRow.effective_parent_id || childRow.source_parent_department_id || "").trim();
    setBusy(true); setErr(null);
    try {
      const res = await createStandaloneDept({
        department_id:          deptId.trim(),
        department_name:        deptName.trim(),
        organization_name:      orgName.trim(),
        parent_department_id:   parentId.trim()   || null,
        parent_department_name: parentName.trim() || null,
        branch_name:            branch.trim()     || null,
        region_name:            region.trim()     || null,
        holding_name:           holding.trim()    || null,
        holding_id:             resolution?.holding?.id      ?? null,
        organization_id:        resolution?.organization?.id ?? null,
        region_id:              resolution?.region?.id       ?? null,
        branch_id:              resolution?.branch?.id       ?? null,
        auto_bind_source_id:            childRow.source_id || null,
        auto_bind_source_department_id: autoBindSrcDeptId  || null,
      });
      onCreated(res.department_id, res.department_name, res.parent_bound === true);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка створення батьківського підрозділу");
    } finally {
      setBusy(false);
    }
  };

  const inS    = { display: "block", width: "100%", padding: "6px 8px", marginTop: 3,
                   border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
  const inSReq = { ...inS, borderColor: "#3b82f6" };

  const DICT_ITEMS = [
    { key: "holding",      label: "Холдинг",     type: "holding",      name: holding,  required: false },
    { key: "organization", label: "Організація", type: "organization", name: orgName,  required: true  },
    { key: "region",       label: "Регіон",      type: "region",       name: region,   required: false },
    { key: "branch",       label: "Філія",       type: "branch",       name: branch,   required: false },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 580, width: "95%",
                    maxHeight: "93vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}
           onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <strong style={{ fontSize: 16 }}>Створити батьківський підрозділ</strong>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              Після збереження буде знято блокування дочірнього підрозділу
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        <div style={{ padding: "7px 12px", background: "#fefce8", border: "1px solid #fde047",
                      borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          <span style={{ color: "#713f12" }}>Дочірній підрозділ: </span>
          <code style={{ color: "#92400e", fontWeight: 700 }}>{childRow.source_department_id}</code>
          {" · "}{childRow.effective_department_name || childRow.source_department_name || ""}
        </div>

        {/* Resolution panel */}
        <div style={{ marginBottom: 14, padding: "12px 14px", background: "#f9fafb",
                      border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Перевірка довідників</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {resolutionStale && (
                <span style={{ fontSize: 11, color: "#d97706" }}>Дані змінились — перевірте знову</span>
              )}
              <button type="button" onClick={() => runResolve(holding, orgName, region, branch)}
                disabled={resolving}
                style={{ fontSize: 11, padding: "3px 10px", border: "1px solid #d1d5db",
                         borderRadius: 4, background: "#fff", cursor: resolving ? "not-allowed" : "pointer",
                         color: "#374151" }}>
                {resolving ? "..." : "↻ Перевірити"}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {DICT_ITEMS.map(({ key, label, type, name, required }) => (
              <ResolutionCard
                key={key}
                label={label}
                name={name}
                resolution={resolution?.[key]}
                resolving={resolving}
                creating={creatingDict === type}
                required={required}
                onCreateDict={() => handleCreateDict(type, name)}
                onSelectFromDict={() => setLookupType(type)}
              />
            ))}
          </div>
          {blockingMissing && !resolving && (
            <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff7ed",
                          border: "1px solid #fdba74", borderRadius: 5, fontSize: 12, color: "#92400e" }}>
              ⚠ Деякі записи відсутні в довідниках. Натисніть «+ Створити» або «Вибрати».
            </div>
          )}
        </div>

        {lookupType && (
          <DictLookupModal
            dictType={lookupType}
            onSelect={item => handleSelectFromDict(lookupType, item)}
            onClose={() => setLookupType(null)}
          />
        )}

        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 10 }}>{err}</div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Department ID <span style={{ color: "#ef4444" }}>*</span>
            <input value={deptId} onChange={e => setDeptId(e.target.value)} style={inSReq} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Назва підрозділу <span style={{ color: "#ef4444" }}>*</span>
            <input value={deptName} onChange={e => setDeptName(e.target.value)} style={inSReq} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Організація <span style={{ color: "#ef4444" }}>*</span>
            <input value={orgName}
                   onChange={e => { setOrgName(e.target.value); setResolutionStale(true); }}
                   style={inSReq} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Parent ID (власний)
              <input value={parentId} onChange={e => setParentId(e.target.value)} style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Parent назва
              <input value={parentName} onChange={e => setParentName(e.target.value)} style={inS} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Філія
              <input value={branch}
                     onChange={e => { setBranch(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Регіон
              <input value={region}
                     onChange={e => { setRegion(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Холдинг
              <input value={holding}
                     onChange={e => { setHolding(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{
              padding: "7px 20px",
              background: canCreate ? "#059669" : "#9ca3af",
              color: "#fff", border: "none", borderRadius: 4,
              cursor: canCreate ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600,
            }}>
            {busy ? "..." : "Створити parent-підрозділ"}
          </button>
          <button onClick={onClose} className="btn btn-secondary">Скасувати</button>
          {resolving && <span style={{ fontSize: 11, color: "#9ca3af" }}>Перевірка довідників...</span>}
        </div>
      </div>
    </div>
  );
}

// ── CreateModal ───────────────────────────────────────────────────────────────

function CreateModal({ row, onCreate, onClose }) {
  const [deptId,     setDeptId]     = useState(row.effective_department_id    || row.source_department_id           || "");
  const [deptName,   setDeptName]   = useState(row.effective_department_name  || row.source_department_name         || "");
  const [orgName,    setOrgName]    = useState(row.effective_organization_name || row.organization_name              || "");
  const [parentId,   setParentId]   = useState(row.effective_parent_id        || row.source_parent_department_id    || "");
  const [parentName, setParentName] = useState(row.effective_parent_name      || row.source_parent_department_name  || "");
  const [branch,     setBranch]     = useState(row.effective_branch           || row.branch_name  || "");
  const [region,     setRegion]     = useState(row.effective_region           || row.region_name  || "");
  const [holding,    setHolding]    = useState(row.effective_holding          || row.holding_name || "");

  const [resolution,      setResolution]      = useState(null);
  const [resolving,       setResolving]       = useState(false);
  const [resolutionStale, setResolutionStale] = useState(false);
  const [creatingDict,    setCreatingDict]    = useState(null);
  const [lookupType,      setLookupType]      = useState(null);

  const [parentCreated,    setParentCreated]    = useState(false);
  const [parentBound,      setParentBound]      = useState(false);
  const [showParentCreate, setShowParentCreate] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);

  const runResolve = useCallback(async (h, o, r, b) => {
    setResolving(true);
    setResolutionStale(false);
    try {
      const res = await resolveContext({
        holding_name:      h || null,
        organization_name: o || null,
        region_name:       r || null,
        branch_name:       b || null,
      });
      setResolution(res);
    } catch {
      setResolution(null);
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    runResolve(
      row.effective_holding           || row.holding_name          || "",
      row.effective_organization_name || row.organization_name     || "",
      row.effective_region            || row.region_name           || "",
      row.effective_branch            || row.branch_name           || "",
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateDict = async (type, name) => {
    if (!name || !name.trim()) return;
    setCreatingDict(type);
    setErr(null);
    try {
      await createDictEntry({ entry_type: type, name: name.trim() });
      await runResolve(holding, orgName, region, branch);
    } catch (e) {
      setErr(e?.response?.data?.detail || `Помилка створення запису довідника`);
    } finally {
      setCreatingDict(null);
    }
  };

  const handleSelectFromDict = (type, item) => {
    if (type === "holding")      { setHolding(item.name); }
    if (type === "organization") { setOrgName(item.name); }
    if (type === "region")       { setRegion(item.name); }
    if (type === "branch")       { setBranch(item.name); }
    setResolution(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [type]: { required: true, found: true, id: item.id, name: item.name } };
      updated.all_resolved = ["holding", "organization", "region", "branch"].every(
        k => !updated[k]?.required || updated[k]?.found
      );
      return updated;
    });
    setResolutionStale(false);
    setLookupType(null);
  };

  const handleCreate = async () => {
    if (!deptId.trim())   { setErr("department_id обов'язковий"); return; }
    if (!deptName.trim()) { setErr("Назва підрозділу обов'язкова"); return; }
    if (!orgName.trim())  { setErr("Організація обов'язкова"); return; }
    if (resolution && !resolution.all_resolved) {
      setErr("Деякі записи довідника не знайдені. Натисніть «+ Створити» або очистіть відповідне поле.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      await onCreate({
        source_id:              row.source_id,
        source_department_id:   row.source_department_id,
        department_id:          deptId.trim(),
        department_name:        deptName.trim(),
        organization_name:      orgName.trim(),
        parent_department_id:   parentId.trim()   || null,
        parent_department_name: parentName.trim() || null,
        branch_name:            branch.trim()     || null,
        region_name:            region.trim()     || null,
        holding_name:           holding.trim()    || null,
        holding_id:             resolution?.holding?.id      ?? null,
        organization_id:        resolution?.organization?.id ?? null,
        region_id:              resolution?.region?.id       ?? null,
        branch_id:              resolution?.branch?.id       ?? null,
      });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка створення");
    } finally { setBusy(false); }
  };

  const inS    = { display: "block", width: "100%", padding: "6px 8px", marginTop: 3,
                   border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
  const inSReq = { ...inS, borderColor: "#3b82f6" };

  const effectiveParentMissing = row.parent_missing && !parentCreated;
  const blockingMissing = resolution && !resolution.all_resolved;
  const canCreate = !busy && !resolving && !effectiveParentMissing && !blockingMissing && !resolutionStale;

  const DICT_ITEMS = [
    { key: "holding",      label: "Холдинг",     type: "holding",      name: holding,  required: false },
    { key: "organization", label: "Організація", type: "organization", name: orgName,  required: true  },
    { key: "region",       label: "Регіон",      type: "region",       name: region,   required: false },
    { key: "branch",       label: "Філія",       type: "branch",       name: branch,   required: false },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 24, maxWidth: 620, width: "95%",
                    maxHeight: "93vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <strong style={{ fontSize: 16 }}>Створити master-підрозділ</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        {/* Source info */}
        <div style={{ padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: "#1e40af" }}>Джерело:</span>{" "}
          <strong>{row.source_department_id}</strong>
          {row.source_department_name ? ` · ${row.source_department_name}` : ""}
          {row.source_name ? <span style={{ color: "#6b7280" }}> ({row.source_name})</span> : ""}
        </div>

        {/* Source hierarchy context */}
        <HierarchyInfo row={row} prefix="Source" />

        {/* Parent missing — interactive block */}
        {effectiveParentMissing && (
          <div style={{ padding: "10px 12px", background: "#fee2e2", border: "1px solid #fca5a5",
                        borderRadius: 6, fontSize: 12, color: "#991b1b", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              ⛔ Батьківський підрозділ «{row.effective_parent_id || row.source_parent_department_id}» не знайдено в dim_department.
            </div>
            <div style={{ color: "#7f1d1d", marginBottom: 8 }}>
              Щоб продовжити, спочатку створіть батьківський підрозділ.
            </div>
            <button
              type="button"
              onClick={() => setShowParentCreate(true)}
              disabled={!(row.effective_parent_id || row.source_parent_department_id)}
              style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 700,
                background: "#fff", border: "1px solid #fca5a5",
                borderRadius: 4, cursor: "pointer", color: "#991b1b",
              }}>
              Спочатку створити parent-підрозділ
            </button>
          </div>
        )}

        {/* Parent created confirmation */}
        {!effectiveParentMissing && parentCreated && (
          <div style={{ padding: "8px 12px", background: "#d1fae5", border: "1px solid #6ee7b7",
                        borderRadius: 6, fontSize: 12, color: "#065f46", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>✅ Parent створено. Тепер можна створити поточний підрозділ.</div>
            {parentBound && (
              <div style={{ fontSize: 11, color: "#065f46", marginTop: 3 }}>
                Staging-рядок parent автоматично прив'язано.
              </div>
            )}
          </div>
        )}

        {/* Nested parent create modal */}
        {showParentCreate && (
          <CreateParentModal
            childRow={row}
            onCreated={(deptId, deptName, bound) => {
              setParentCreated(true);
              setParentBound(!!bound);
              setShowParentCreate(false);
            }}
            onClose={() => setShowParentCreate(false)}
          />
        )}

        {/* ── Resolution panel */}
        <div style={{ marginBottom: 14, padding: "12px 14px", background: "#f9fafb",
                      border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
              Перевірка довідників
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {resolutionStale && (
                <span style={{ fontSize: 11, color: "#d97706" }}>Дані змінились — перевірте знову</span>
              )}
              <button
                type="button"
                onClick={() => runResolve(holding, orgName, region, branch)}
                disabled={resolving}
                style={{ fontSize: 11, padding: "3px 10px", border: "1px solid #d1d5db",
                         borderRadius: 4, background: "#fff", cursor: resolving ? "not-allowed" : "pointer",
                         color: "#374151" }}>
                {resolving ? "..." : "↻ Перевірити"}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {DICT_ITEMS.map(({ key, label, type, name, required }) => (
              <ResolutionCard
                key={key}
                label={label}
                name={name}
                resolution={resolution?.[key]}
                resolving={resolving}
                creating={creatingDict === type}
                required={required}
                onCreateDict={() => handleCreateDict(type, name)}
                onSelectFromDict={() => setLookupType(type)}
              />
            ))}
          </div>
          {blockingMissing && !resolving && (
            <div style={{ marginTop: 8, padding: "6px 10px", background: "#fff7ed",
                          border: "1px solid #fdba74", borderRadius: 5, fontSize: 12, color: "#92400e" }}>
              ⚠ Деякі записи відсутні в довідниках. Натисніть «+ Створити» або «Вибрати».
            </div>
          )}
        </div>

        {lookupType && (
          <DictLookupModal
            dictType={lookupType}
            onSelect={item => handleSelectFromDict(lookupType, item)}
            onClose={() => setLookupType(null)}
          />
        )}

        {/* Error */}
        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 10 }}>{err}</div>
        )}

        {/* Core fields */}
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Department ID <span style={{ color: "#ef4444" }}>*</span>
            <input value={deptId} onChange={e => setDeptId(e.target.value)} style={inSReq} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Назва підрозділу <span style={{ color: "#ef4444" }}>*</span>
            <input value={deptName} onChange={e => setDeptName(e.target.value)}
                   placeholder="Назва master-підрозділу" style={inSReq} />
          </label>
          <label style={{ fontSize: 12, color: "#6b7280" }}>
            Організація <span style={{ color: "#ef4444" }}>*</span>
            <input value={orgName}
                   onChange={e => { setOrgName(e.target.value); setResolutionStale(true); }}
                   placeholder="Організація" style={inSReq} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Parent ID
              <input value={parentId} onChange={e => setParentId(e.target.value)} style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Parent назва
              <input value={parentName} onChange={e => setParentName(e.target.value)} style={inS} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Філія
              <input value={branch}
                     onChange={e => { setBranch(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Регіон
              <input value={region}
                     onChange={e => { setRegion(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
            <label style={{ fontSize: 12, color: "#6b7280" }}>
              Холдинг
              <input value={holding}
                     onChange={e => { setHolding(e.target.value); setResolutionStale(true); }}
                     style={inS} />
            </label>
          </div>
        </div>

        {/* Extra fields */}
        {Object.keys(row.extra_fields || {}).length > 0 && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: "#f9fafb",
                        border: "1px solid #e5e7eb", borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
              Додаткові поля з джерела
            </div>
            <ExtraFieldsChips fields={row.extra_fields} />
          </div>
        )}

        <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
          Значення попередньо заповнені з default_* або source полів. Усі поля редаговані.
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            style={{ padding: "7px 20px",
                     background: canCreate ? "var(--primary, #2563eb)" : "#9ca3af",
                     color: "#fff", border: "none", borderRadius: 4,
                     cursor: canCreate ? "pointer" : "not-allowed",
                     fontSize: 13, fontWeight: 600 }}>
            {busy ? "..." : "Створити цей підрозділ і прив'язати"}
          </button>
          <button onClick={onClose} className="btn btn-secondary">Скасувати</button>
          {resolving && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Перевірка довідників...</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bulk fill helpers ─────────────────────────────────────────────────────────

// type: "text" | "dict" | "dept"
// dict fields require selecting from a dictionary (DictLookupModal)
// dept fields require selecting from dim_department
const FILL_FIELD_CONFIG = [
  { value: "department_name",   label: "Назва підрозділу", type: "text" },
  { value: "organization_name", label: "Організація",      type: "dict", dictType: "organization" },
  { value: "holding_name",      label: "Холдинг",          type: "dict", dictType: "holding"       },
  { value: "region_name",       label: "Регіон",           type: "dict", dictType: "region"        },
  { value: "branch_name",       label: "Філія",            type: "dict", dictType: "branch"        },
  { value: "parent_department", label: "Parent підрозділ", type: "dept" },
];

function buildApiFilters(f) {
  return {
    source_id:              f.filterSource       ? Number(f.filterSource) : null,
    organization_name:      f.filterOrg          || null,
    branch_name:            f.filterBranch       || null,
    region_name:            f.filterRegion       || null,
    master_department_id:   f.filterMaster       || null,
    mapping_status:         (f.filterStatus && f.filterStatus !== "all") ? f.filterStatus : null,
    computed_status:        f.filterComputedStatus || null,
    search:                 f.search             || null,
    has_parent:             f.filterHasParent    || null,
    parent_status:          f.filterParentStatus || null,
    parent_department_id:   f.filterParentId     || null,
    parent_department_name: f.filterParentName   || null,
    source_level:           f.filterSourceLevel !== "" ? Number(f.filterSourceLevel) : null,
    source_node_type:       f.filterSourceType   || null,
  };
}

function hasFilter(f) {
  return !!(
    f.filterSource || f.filterOrg || f.filterBranch || f.filterRegion || f.filterMaster ||
    (f.filterStatus && f.filterStatus !== "all") || f.filterComputedStatus || f.search ||
    f.filterHasParent || f.filterParentStatus || f.filterParentId || f.filterParentName ||
    f.filterSourceLevel !== "" || f.filterSourceType
  );
}

// ── BulkFillModal ─────────────────────────────────────────────────────────────

function BulkFillModal({ filters, onClose, onSuccess }) {
  const [field,      setField]      = useState("");
  const [value,      setValue]      = useState("");    // display name / free text
  const [valueId,    setValueId]    = useState(null);  // dict ID or dept_id (null for text fields)
  const [preview,    setPreview]    = useState(null);
  const [loadingP,   setLoadingP]   = useState(false);
  const [applying,   setApplying]   = useState(false);
  const [error,      setError]      = useState(null);
  const [showLookup, setShowLookup] = useState(false);

  const noFilter  = !hasFilter(filters);
  const fieldCfg  = FILL_FIELD_CONFIG.find(o => o.value === field);

  const resetValue = () => { setValue(""); setValueId(null); setPreview(null); setError(null); };

  const handleFieldChange = (e) => { setField(e.target.value); resetValue(); };

  const handleSelectItem = (item) => {
    setValue(item.name || "");
    setValueId(item.id != null ? item.id : null);
    setShowLookup(false);
    setPreview(null);
    setError(null);
  };

  const isValueReady = !!field && (
    fieldCfg?.type === "text"
      ? !!value.trim()
      : (!!value && valueId != null)
  );

  const lookupDictType = fieldCfg?.type === "dept"
    ? "department"
    : (fieldCfg?.type === "dict" ? fieldCfg.dictType : null);

  const handlePreview = async () => {
    if (!isValueReady) { setError("Оберіть поле та значення"); return; }
    setLoadingP(true); setError(null); setPreview(null);
    try {
      const res = await bulkFillDeptPreview({
        filters:  buildApiFilters(filters),
        field,
        value:    value.trim(),
        value_id: valueId != null ? String(valueId) : null,
      });
      if (res.status === "ok") setPreview(res);
      else setError(res.message || "Помилка preview");
    } catch { setError("Помилка preview"); }
    finally { setLoadingP(false); }
  };

  const handleApply = async () => {
    if (!preview || preview.total_affected_count === 0) return;
    setApplying(true); setError(null);
    try {
      const res = await bulkFillDeptApply({
        filters:  buildApiFilters(filters),
        field,
        value:    value.trim(),
        value_id: valueId != null ? String(valueId) : null,
        confirm:  true,
      });
      if (res.status === "ok") onSuccess(res);
      else setError(res.message || "Помилка застосування");
    } catch { setError("Помилка застосування"); }
    finally { setApplying(false); }
  };

  return (
    <Modal title="Масове заповнення полів підрозділу" onClose={onClose} size="large">
      {showLookup && lookupDictType && (
        <DictLookupModal
          dictType={lookupDictType}
          onSelect={handleSelectItem}
          onClose={() => setShowLookup(false)}
        />
      )}
      {noFilter && (
        <div className="bulk-fill-warning">
          Масове заповнення недоступне без активного фільтра.
        </div>
      )}
      {!noFilter && (
        <>
          {/* Field selector */}
          <div className="form-row" style={{ marginTop: 12 }}>
            <select value={field} onChange={handleFieldChange}>
              <option value="">— Оберіть поле —</option>
              {FILL_FIELD_CONFIG.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Value input — varies by field type */}
          {field && fieldCfg?.type === "text" && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <input
                type="text" value={value}
                onChange={e => { setValue(e.target.value); setPreview(null); }}
                placeholder={`Значення для «${fieldCfg.label}»...`}
              />
            </div>
          )}

          {field && (fieldCfg?.type === "dict" || fieldCfg?.type === "dept") && (
            <div style={{ marginTop: 10 }}>
              {value ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, background: "#f0fdf4", border: "1px solid #86efac",
                                 borderRadius: 4, padding: "4px 10px", color: "#166534" }}>
                    {value}
                    {valueId != null && (
                      <span style={{ marginLeft: 6, color: "#6b7280", fontSize: 11 }}>
                        [{valueId}]
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => { setShowLookup(true); setPreview(null); }}
                    style={{ fontSize: 11, padding: "3px 8px", background: "#eff6ff",
                             border: "1px solid #93c5fd", borderRadius: 3, cursor: "pointer",
                             color: "#1d4ed8" }}>
                    Змінити
                  </button>
                  <button type="button" onClick={resetValue}
                    style={{ fontSize: 11, padding: "3px 8px", background: "#fee2e2",
                             border: "1px solid #fca5a5", borderRadius: 3, cursor: "pointer",
                             color: "#991b1b" }}>
                    ✕ Скинути
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowLookup(true)}
                  style={{ fontSize: 12, padding: "6px 14px", background: "#eff6ff",
                           border: "1px solid #93c5fd", borderRadius: 4, cursor: "pointer",
                           color: "#1d4ed8" }}>
                  Вибрати зі списку...
                </button>
              )}
            </div>
          )}

          {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}

          {preview && (
            <div className="bulk-fill-preview">
              <div className="bulk-fill-preview-row">
                <span>Поле</span><strong>{preview.field_label}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Нове значення</span>
                <strong>
                  {preview.value}
                  {preview.value_id && (
                    <span style={{ marginLeft: 6, color: "#6b7280", fontSize: 11 }}>
                      [{preview.value_id}]
                    </span>
                  )}
                </strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Master-підрозділів для оновлення</span>
                <strong>{preview.affected_master_count}</strong>
              </div>
              <div className="bulk-fill-preview-row">
                <span>Pending рядків (default значення)</span>
                <strong>{preview.affected_source_count}</strong>
              </div>
              {preview.affected_master_count > 0 && (
                <div className="bulk-fill-warning">
                  Увага: будуть оновлені реальні поля у dim_department для {preview.affected_master_count} підрозділів.
                </div>
              )}
              {(preview.warnings || []).map((w, i) => (
                <div key={i} className="bulk-fill-warning">{w}</div>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button variant="secondary" onClick={handlePreview} disabled={!isValueReady || loadingP}>
              {loadingP ? "Розрахунок..." : "Перевірити"}
            </Button>
            <Button variant="primary" onClick={handleApply}
                    disabled={!preview || preview.total_affected_count === 0 || applying}>
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

// ── BulkCreateModal ───────────────────────────────────────────────────────────

function BulkCreateModal({ filters, onClose, onSuccess }) {
  const [preview,  setPreview]  = useState(null);
  const [loadingP, setLoadingP] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error,    setError]    = useState(null);

  const noFilter = !hasFilter(filters);

  const handlePreview = async () => {
    setLoadingP(true); setError(null); setPreview(null);
    try {
      const res = await bulkCreateDeptPreview({ filters: buildApiFilters(filters) });
      if (res.status === "ok") setPreview(res);
      else setError(res.message || "Помилка перевірки");
    } catch { setError("Помилка перевірки"); }
    finally { setLoadingP(false); }
  };

  const handleApply = async () => {
    if (!preview?.can_apply) return;
    setApplying(true); setError(null);
    try {
      const res = await bulkCreateDeptApply({ filters: buildApiFilters(filters), confirm: true });
      if (res.status === "ok") onSuccess(res);
      else setError(res.message || "Помилка створення");
    } catch { setError("Помилка створення"); }
    finally { setApplying(false); }
  };

  return (
    <Modal title="Масове створення master-підрозділів" onClose={onClose} size="large">
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        Створює master-підрозділи для pending рядків, де заповнені ID, назва, організація,
        і parent (якщо є) знайдений у довіднику. Рядки з parent_missing, дублікатами або
        відсутніми полями залишаються в staging без змін.
      </div>
      {noFilter && (
        <div className="bulk-fill-warning">
          Масове створення недоступне без активного фільтра.
        </div>
      )}
      {!noFilter && (
        <>
          {error && <div className="modal-error" style={{ marginTop: 10 }}>{error}</div>}
          {preview && (
            <div className="bulk-create-preview">
              <div className="bulk-create-preview-title">Результат перевірки</div>
              <div className="bulk-create-stat-row">
                <span>Pending рядків у фільтрі</span><strong>{preview.total_pending}</strong>
              </div>
              <div className="bulk-create-divider" />
              <div className="bulk-create-stat-row eligible">
                <span><span className="bulk-create-dot green" />Готові до створення</span>
                <strong className="text-success">{preview.will_create}</strong>
              </div>
              {preview.missing_id > 0 && (
                <div className="bulk-create-stat-row missing">
                  <span><span className="bulk-create-dot gray" />Не вистачає ID</span>
                  <strong>{preview.missing_id}</strong>
                </div>
              )}
              {preview.missing_name > 0 && (
                <div className="bulk-create-stat-row missing">
                  <span><span className="bulk-create-dot gray" />Не вистачає назви</span>
                  <strong>{preview.missing_name}</strong>
                </div>
              )}
              {preview.missing_org > 0 && (
                <div className="bulk-create-stat-row missing">
                  <span><span className="bulk-create-dot gray" />Не вистачає організації</span>
                  <strong>{preview.missing_org}</strong>
                </div>
              )}
              {preview.skipped_existing > 0 && (
                <div className="bulk-create-stat-row skipped">
                  <span><span className="bulk-create-dot orange" />Дублікати ID</span>
                  <strong className="text-warning">{preview.skipped_existing}</strong>
                </div>
              )}
              {preview.parent_missing > 0 && (
                <div className="bulk-create-stat-row missing">
                  <span><span className="bulk-create-dot gray" />Немає parent у довіднику</span>
                  <strong>{preview.parent_missing}</strong>
                </div>
              )}
              {preview.can_apply && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "#fffbeb",
                              border: "1px solid #fcd34d", borderRadius: 5, fontSize: 12,
                              color: "#92400e" }}>
                  Буде створено <strong>{preview.will_create}</strong> master-підрозділів.
                  Рядки з parent_missing / дублікатами / відсутніми полями залишаться в staging.
                </div>
              )}
            </div>
          )}
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>Скасувати</Button>
            <Button variant="secondary" onClick={handlePreview} disabled={loadingP}>
              {loadingP ? "Перевірка..." : "Перевірити"}
            </Button>
            <Button variant="primary" onClick={handleApply} disabled={!preview?.can_apply || applying}>
              {applying ? "Створення..." : `Створити (${preview?.will_create ?? 0})`}
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

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════


// ── BulkUidPreviewModal ───────────────────────────────────────────────────────
const CONFLICT_META = {
  different_orgs: {
    label: "Різні організації",
    hint:  "Рядки в групі мають різні організації. Буде взято орг. з найбільш заповненого рядка.",
    flag:  "ignore_different_orgs",
    risky: false,
  },
  different_branches: {
    label: "Різні філії",
    hint:  "Рядки мають різні філії. Буде взято філію з найбільш заповненого рядка.",
    flag:  "ignore_different_branches",
    risky: false,
  },
  mixed_mapping: {
    label: "Різні master-прив'язки",
    hint:  "Деякі рядки вже прив'язані до різних master. Незамаплені рядки будуть прив'язані до найпоширенішого master у групі. Ризиковано — перевірте вручну після.",
    flag:  "ignore_mixed_mapping",
    risky: true,
  },
};

const IGNORED_REASON_LABEL = {
  different_orgs:     "різні орг.",
  different_branches: "різні філії",
  mixed_mapping:      "різні master",
};

function BulkUidPreviewModal({ sourceId, onBound, onSuccess, onClose }) {
  const [preview,   setPreview]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [executing, setExecuting] = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);
  const [ignoreFlags, setIgnoreFlags] = useState({
    ignore_different_orgs:     false,
    ignore_different_branches: false,
    ignore_mixed_mapping:      false,
  });

  const buildBody = (flags = ignoreFlags, dryRun = true) => ({
    source_id: sourceId || null,
    only_unmapped: true,
    mode: "safe",
    dry_run: dryRun,
    ...flags,
  });

  useEffect(() => {
    setLoading(true); setError(null);
    bulkProcessUidGroups(buildBody(ignoreFlags, true))
      .then(setPreview)
      .catch(e => setError(e?.response?.data?.detail || "Помилка завантаження preview"))
      .finally(() => setLoading(false));
  }, [ignoreFlags]); // eslint-disable-line

  const toggleFlag = (flag) => setIgnoreFlags(prev => ({ ...prev, [flag]: !prev[flag] }));

  const handleExecute = async () => {
    setExecuting(true); setError(null);
    try {
      const res = await bulkProcessUidGroups(buildBody(ignoreFlags, false));
      setResult(res);
      onBound();
      if (onSuccess) onSuccess(res);
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка виконання");
    } finally { setExecuting(false); }
  };

  const ACT_COLOR = { create_and_bind: "#065f46", bind_existing: "#1e40af" };
  const ACT_LABEL = { create_and_bind: "Створити + прив'язати", bind_existing: "Прив'язати до існуючого" };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1100,
                  display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}
         onClick={onClose}>
      <div style={{ background:"#fff",borderRadius:10,width:"100%",maxWidth:820,
                    maxHeight:"90vh",display:"flex",flexDirection:"column",
                    boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:"14px 20px",borderBottom:"1px solid #e5e7eb",flexShrink:0 }}>
          <div style={{ fontWeight:700,fontSize:16 }}>Масова обробка UID-груп</div>
          <div style={{ fontSize:12,color:"#6b7280",marginTop:2 }}>
            Автоматично створює master-підрозділи та прив'язує незамаплені source-рядки.
            Пропускає конфлікти та групи без parent.
          </div>
        </div>

        <div style={{ flex:1,overflowY:"auto",padding:20 }}>
          {error && (
            <div style={{ padding:"8px 12px",background:"#fee2e2",border:"1px solid #fca5a5",
                          borderRadius:6,fontSize:12,color:"#991b1b",marginBottom:12 }}>{error}</div>
          )}

          {loading && <div style={{ textAlign:"center",padding:40,color:"#6b7280" }}>Аналіз UID-груп…</div>}

          {/* Success result */}
          {result && (
            <div style={{ padding:"14px 16px",background:"#f0fdf4",border:"1px solid #6ee7b7",
                          borderRadius:8,marginBottom:12 }}>
              <div style={{ fontWeight:700,fontSize:15,color:"#065f46",marginBottom:8 }}>✅ Виконано успішно</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
                {[
                  { label:"Створено master",      v: result.created_masters,       color:"#065f46" },
                  { label:"Прив'язано рядків",    v: result.bound_rows,            color:"#1e40af" },
                  { label:"Пропущено конфлікти",  v: result.skipped_conflict,      color:"#92400e" },
                ].map(({ label, v, color }) => (
                  <div key={label} style={{ padding:"8px 12px",background:"#fff",border:"1px solid #e5e7eb",borderRadius:6 }}>
                    <div style={{ fontSize:22,fontWeight:700,color }}>{v ?? 0}</div>
                    <div style={{ fontSize:11,color:"#6b7280" }}>{label}</div>
                  </div>
                ))}
              </div>
              {result.errors?.length > 0 && (
                <div style={{ marginTop:10,fontSize:11,color:"#92400e" }}>
                  Помилки ({result.errors.length}): {result.errors.slice(0,3).join("; ")}
                </div>
              )}
            </div>
          )}

          {/* Preview stats */}
          {preview && !result && (
            <>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16 }}>
                {[
                  { label:"Буде створено master",       v: preview.will_create_masters,       color:"#065f46", bg:"#f0fdf4" },
                  { label:"Прив'язати до існуючого",    v: preview.will_bind_existing_groups,  color:"#1e40af", bg:"#eff6ff" },
                  { label:"Всього прив'яжеться рядків", v: preview.will_bind_rows,             color:"#374151", bg:"#f9fafb" },
                  { label:"Пропущено (parent відсутній)",v: preview.skipped_parent_missing,   color:"#92400e", bg:"#fff7ed" },
                  { label:"Пропущено (конфлікт)",       v: preview.skipped_conflict,           color:"#991b1b", bg:"#fff1f2" },
                  { label:"Вже замаплені",               v: preview.skipped_all_mapped,        color:"#6b7280", bg:"#f9fafb" },
                ].map(({ label, v, color, bg }) => (
                  <div key={label} style={{ padding:"10px 14px",background:bg,
                                            border:"1px solid #e5e7eb",borderRadius:6 }}>
                    <div style={{ fontSize:20,fontWeight:700,color }}>{v ?? 0}</div>
                    <div style={{ fontSize:10,color:"#6b7280",marginTop:2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Conflict breakdown + ignore flags */}
              {preview.skipped_conflict > 0 && (
                <div style={{ marginBottom:14,border:"1px solid #fca5a5",borderRadius:8,overflow:"hidden" }}>
                  <div style={{ padding:"8px 14px",background:"#fff1f2",borderBottom:"1px solid #fca5a5",
                                fontWeight:700,fontSize:12,color:"#991b1b",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
                    <span>⚠</span>
                    <span>{preview.skipped_conflict} груп пропущено через конфлікти</span>
                    <span style={{ fontSize:11,fontWeight:400,color:"#6b7280" }}>
                      — позначте причини, які хочете ігнорувати:
                    </span>
                  </div>

                  {/* Explanation if all are multi-reason */}
                  {(preview.conflict_breakdown?.multiple ?? 0) === preview.skipped_conflict && (
                    <div style={{ padding:"8px 14px",background:"#fffbeb",borderBottom:"1px solid #fde68a",
                                  fontSize:11,color:"#92400e" }}>
                      💡 Всі конфліктні групи мають <strong>кілька причин одночасно</strong>.
                      Щоб розблокувати їх — позначте всі причини які присутні у вашому наборі.
                      Наприклад, якщо в групах є і різні орг., і різні філії — позначте обидва.
                    </div>
                  )}

                  <div style={{ background:"#fff" }}>
                    {Object.entries(CONFLICT_META).map(([key, meta]) => {
                      // Count groups that CONTAIN this reason (even alongside other reasons)
                      const count = (preview.conflict_reasons_count ?? {})[key] ?? 0;
                      const isOn  = ignoreFlags[meta.flag];
                      return (
                        <div key={key} style={{ padding:"10px 14px",borderBottom:"1px solid #f3f4f6",
                                                display:"flex",alignItems:"flex-start",gap:12,
                                                background: isOn ? "#f0fdf4" : "#fff" }}>
                          <label style={{ display:"flex",alignItems:"center",gap:6,
                                           cursor: count > 0 ? "pointer" : "default", minWidth:28 }}>
                            <input type="checkbox" disabled={count === 0}
                              checked={isOn} onChange={() => count > 0 && toggleFlag(meta.flag)}
                              style={{ width:15,height:15,cursor: count > 0 ? "pointer" : "not-allowed" }} />
                            <span style={{ fontSize:12,fontWeight:600,
                                           color: count === 0 ? "#d1d5db" : isOn ? "#065f46" : "#374151",
                                           whiteSpace:"nowrap" }}>
                              Ігнорувати
                            </span>
                          </label>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:2 }}>
                              <span style={{ fontSize:12,fontWeight:600,
                                             color: count === 0 ? "#d1d5db" : "#374151" }}>
                                {meta.label}
                              </span>
                              {meta.risky && count > 0 && (
                                <span style={{ fontSize:10,padding:"1px 6px",borderRadius:4,
                                               background:"#fff7ed",color:"#c2410c",
                                               border:"1px solid #fed7aa",fontWeight:700 }}>
                                  ⚠ Ризиковано
                                </span>
                              )}
                              <span style={{ marginLeft:"auto",fontSize:12,fontWeight:700,
                                             color: count === 0 ? "#d1d5db" : "#991b1b" }}>
                                {count > 0 ? `${count} груп містять цю причину` : "0 груп"}
                              </span>
                            </div>
                            <div style={{ fontSize:11,color:"#6b7280",lineHeight:1.4 }}>
                              {meta.hint}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Groups that will remain blocked even after ignoring selected reasons */}
                    {(() => {
                      const activeIgnoreKeys = Object.entries(CONFLICT_META)
                        .filter(([, m]) => ignoreFlags[m.flag])
                        .map(([k]) => k);
                      // Groups still blocked = those that have at least one reason NOT in activeIgnoreKeys
                      const stillBlocked = preview.conflict_breakdown?.multiple ?? 0;
                      const onlyReasonBlocked = Object.entries(CONFLICT_META)
                        .reduce((sum, [k, m]) => ignoreFlags[m.flag] ? sum : sum + (preview.conflict_breakdown?.[`${k}_only`] ?? 0), 0);
                      return (
                        <div style={{ padding:"10px 14px",fontSize:11,color:"#6b7280",
                                      background:"#f9fafb",display:"flex",justifyContent:"space-between",
                                      alignItems:"center" }}>
                          <span>
                            Групи з кількома причинами одночасно — стануть доступні лише якщо позначити всі присутні причини
                          </span>
                          <strong style={{ color:"#374151",flexShrink:0,marginLeft:8 }}>
                            {preview.conflict_breakdown?.multiple ?? 0} груп
                          </strong>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Warning if nothing to do */}
              {preview.will_create_masters === 0 && preview.will_bind_existing_groups === 0 && (
                <div style={{ padding:"12px 16px",background:"#fef3c7",border:"1px solid #fde68a",
                              borderRadius:6,fontSize:12,color:"#92400e",marginBottom:12 }}>
                  {preview.skipped_conflict > 0
                    ? "Усі групи мають конфлікти. Позначте типи конфліктів для ігнорування вище — деякі групи стануть доступні для обробки."
                    : "Немає груп для автоматичної обробки. Всі групи або вже замаплені, або мають конфлікти."}
                </div>
              )}

              {/* Examples */}
              {preview.examples?.length > 0 && (
                <>
                  <div style={{ fontWeight:600,fontSize:12,color:"#374151",marginBottom:6 }}>
                    Приклади груп, що будуть оброблені (перші {preview.examples.length}):
                  </div>
                  <div style={{ border:"1px solid #e5e7eb",borderRadius:6,overflow:"hidden",
                                maxHeight:280,overflowY:"auto" }}>
                    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:11 }}>
                      <thead>
                        <tr style={{ background:"#f9fafb",borderBottom:"1px solid #e5e7eb" }}>
                          {["Дія","UID","Назва","Організація","Рядків","Ігнорується"].map(h => (
                            <th key={h} style={{ padding:"5px 10px",textAlign:"left",fontWeight:600,
                                                  color:"#6b7280",whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.examples.map((ex, i) => (
                          <tr key={i} style={{ borderBottom:"1px solid #f3f4f6" }}>
                            <td style={{ padding:"5px 10px",whiteSpace:"nowrap" }}>
                              <span style={{ padding:"1px 7px",borderRadius:4,fontSize:10,fontWeight:700,
                                             background: ex.action === "create_and_bind" ? "#d1fae5" : "#dbeafe",
                                             color: ACT_COLOR[ex.action] }}>
                                {ACT_LABEL[ex.action] || ex.action}
                              </span>
                            </td>
                            <td style={{ padding:"5px 10px" }}>
                              <code style={{ fontSize:10,color:"#1e40af" }}>{ex.normalized_uid}</code>
                            </td>
                            <td style={{ padding:"5px 10px",color:"#111827",maxWidth:200,
                                         overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                              {ex.department_name || "—"}
                            </td>
                            <td style={{ padding:"5px 10px",color:"#374151" }}>{ex.organization_name || "—"}</td>
                            <td style={{ padding:"5px 10px",textAlign:"center",fontWeight:700,
                                         color:"#374151" }}>{ex.unmapped_count}</td>
                            <td style={{ padding:"5px 10px" }}>
                              {(ex.ignored_reasons || []).map(r => (
                                <span key={r} style={{ display:"inline-block",padding:"1px 5px",
                                  fontSize:9,borderRadius:3,marginRight:2,
                                  background:"#fef3c7",color:"#92400e",fontWeight:600,
                                  border:"1px solid #fde68a" }}>
                                  {IGNORED_REASON_LABEL[r] || r}
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"12px 20px",borderTop:"1px solid #e5e7eb",display:"flex",
                      gap:10,justifyContent:"flex-end",flexShrink:0 }}>
          <button onClick={onClose}
            style={{ padding:"7px 18px",fontSize:13,border:"1px solid #d1d5db",
                     borderRadius:5,cursor:"pointer",background:"#f9fafb",color:"#374151" }}>
            {result ? "Закрити" : "Скасувати"}
          </button>
          {preview && !result && (preview.will_create_masters > 0 || preview.will_bind_existing_groups > 0) && (
            <button onClick={handleExecute} disabled={executing}
              style={{ padding:"7px 22px",fontSize:13,fontWeight:700,
                       background: executing ? "#9ca3af" : "#065f46",
                       color:"#fff",border:"none",borderRadius:5,
                       cursor: executing ? "not-allowed" : "pointer" }}>
              {executing
                ? "Виконання…"
                : `Підтвердити: створити ${preview.will_create_masters} + прив'язати ${preview.will_bind_rows}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MasterSearchSelect ────────────────────────────────────────────────────────
function MasterSearchSelect({ masters, value, onChange, suggestedId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const selected = masters.find(m => m.department_id === value) || null;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = masters.filter(m => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (m.department_id          || "").toLowerCase().includes(q) ||
      (m.department_name        || "").toLowerCase().includes(q) ||
      (m.organization_name      || "").toLowerCase().includes(q) ||
      (m.branch_name            || "").toLowerCase().includes(q) ||
      (m.region_name            || "").toLowerCase().includes(q) ||
      (m.parent_department_id   || "").toLowerCase().includes(q) ||
      (m.parent_department_name || "").toLowerCase().includes(q)
    );
  }).slice(0, 60);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 220, maxWidth: 340, flexShrink: 0 }}>
      <div
        onClick={() => setOpen(o => !o)}
        title={selected
          ? `${selected.department_id} · ${selected.department_name}`
          : "Оберіть master-підрозділ для цієї UID-групи"}
        style={{
          padding: "3px 8px", border: `1px solid ${open ? "#3b82f6" : "#d1d5db"}`,
          borderRadius: 4, fontSize: 11, background: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          overflow: "hidden", maxWidth: "100%",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, whiteSpace: "nowrap" }}>
          {selected ? (
            <><strong>{selected.department_name}</strong>&nbsp;
              <span style={{ color: "#9ca3af" }}>({selected.department_id})</span></>
          ) : (
            <span style={{ color: "#9ca3af" }}>Оберіть master-підрозділ для цієї UID-групи</span>
          )}
        </span>
        <span style={{ color: "#9ca3af", fontSize: 9, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, zIndex: 500, width: 380,
          background: "#fff", border: "1px solid #d1d5db", borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)", marginTop: 2,
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Пошук master по ID, назві, організації, філії, parent…"
              style={{ width: "100%", padding: "4px 7px", border: "1px solid #d1d5db",
                       borderRadius: 4, fontSize: 11, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "12px", textAlign: "center", color: "#9ca3af", fontSize: 11 }}>
                Нічого не знайдено
              </div>
            )}
            {filtered.map(m => {
              const isSuggested = m.department_id === suggestedId;
              const isSelected  = m.department_id === value;
              const meta = [m.organization_name, m.branch_name, m.region_name].filter(Boolean).join(" · ");
              return (
                <div key={m.department_id}
                  onClick={() => { onChange(m.department_id); setOpen(false); setSearch(""); }}
                  style={{
                    padding: "6px 10px", cursor: "pointer", fontSize: 11,
                    background: isSelected ? "#eff6ff" : isSuggested ? "#f0fdf4" : "transparent",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "#eff6ff" : isSuggested ? "#f0fdf4" : "transparent"; }}>
                  <div style={{ fontWeight: 600, color: "#111827" }}>
                    {m.department_name}
                    {isSuggested && <span style={{ color: "#059669", marginLeft: 4, fontSize: 10 }}>★ suggested</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
                    <code>{m.department_id}</code>
                    {meta && <span style={{ marginLeft: 5 }}>{meta}</span>}
                    {m.parent_department_id && (
                      <span style={{ marginLeft: 5, color: "#7c3aed" }}>parent: {m.parent_department_id}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {value && (
            <div style={{ padding: "5px 8px", borderTop: "1px solid #e5e7eb" }}>
              <button
                onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                style={{ fontSize: 10, color: "#dc2626", background: "none", border: "none",
                         cursor: "pointer", padding: 0 }}>
                × Скинути вибір
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── UidGroupsModal ────────────────────────────────────────────────────────────
function UidGroupsModal({ masters, onClose, onBound }) {
  const [groups,   setGroups]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [onlyUnmapped,    setOnlyUnmapped]    = useState(true);
  const [inFact,          setInFact]          = useState(false);
  const [search,          setSearch]          = useState("");
  const [searchInput,     setSearchInput]     = useState("");

  // Per-group state: expanded, selected master override, binding result
  const [expanded,   setExpanded]   = useState(new Set());
  const [overrides,  setOverrides]  = useState({});  // uid → master_department_id
  const [binding,    setBinding]    = useState({});   // uid → "loading"|"ok"|"error"
  const [bindResult, setBindResult] = useState({});   // uid → {bound, conflicts}
  const [rowWarning,    setRowWarning]    = useState({});  // uid → warning string
  const [createMasterFor, setCreateMasterFor] = useState({});  // uid → source row s
  const [createMasterModal, setCreateMasterModal] = useState(null);  // {g, s}

  // Bulk select (high-confidence, no mixed_mapping, has suggested)
  const [bulkSel,    setBulkSel]    = useState(new Set());
  const [bulkBinding, setBulkBinding] = useState(false);
  const [showBulkProcess, setShowBulkProcess] = useState(false);
  const [bulkSuccessBanner, setBulkSuccessBanner] = useState(null);

  const load = () => {
    setLoading(true); setError(null);
    getUidGroups({ only_unmapped: onlyUnmapped, in_fact_turnover: inFact,
                   min_sources: 2, page, limit: 50, search: search || undefined })
      .then(data => {
        setGroups(data.groups || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
      })
      .catch(e => setError(e?.response?.data?.detail || "Помилка завантаження"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, onlyUnmapped, inFact, search]); // eslint-disable-line

  const toggleExpand = (uid) => setExpanded(prev => {
    const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n;
  });

  const canBulkBind = (g) =>
    g.confidence >= 85 && !g.conflict_flags.mixed_mapping && g.suggested_master_department_id;

  const handleBindWithMaster = async (g, masterId) => {
    if (!masterId) return;
    const unmapped = g.sources.filter(s => s.mapping_status === "pending" || !s.mapping_status);
    if (!unmapped.length) return;
    setBinding(prev => ({ ...prev, [g.normalized_uid]: "loading" }));
    try {
      const res = await uidGroupBind({
        normalized_uid:       g.normalized_uid,
        master_department_id: masterId,
        rows: unmapped.map(s => ({ source_id: s.source_id, source_department_id: s.source_department_id })),
      });
      setBinding(prev => ({ ...prev, [g.normalized_uid]: "ok" }));
      setBindResult(prev => ({ ...prev, [g.normalized_uid]: res }));
      if (res.bound > 0) onBound();
    } catch (e) {
      setBinding(prev => ({ ...prev, [g.normalized_uid]: "error" }));
      setError(e?.response?.data?.detail || "Помилка прив'язки");
    }
  };

  const handleBind = (g) => {
    const masterId = overrides[g.normalized_uid] || g.suggested_master_department_id;
    handleBindWithMaster(g, masterId);
  };

  // Resolve a master from a source row; returns the department_id or null
  const resolveRowMaster = (s) => {
    if (s.master_department_id) return s.master_department_id;
    const found = masters.find(m => m.department_id === s.source_department_id);
    return found ? found.department_id : null;
  };

  const _setNotFoundWarning = (uid, s) => {
    setRowWarning(prev => ({
      ...prev,
      [uid]: `${s.source_department_id}: Цей рядок ще не існує в master. Спочатку створіть master або виберіть інший.`,
    }));
    setCreateMasterFor(prev => ({ ...prev, [uid]: s }));
  };

  // "Обрати як master" — sets the group override to this row's resolved master
  const handleSelectAsMaster = (g, s) => {
    const uid = g.normalized_uid;
    const masterId = resolveRowMaster(s);
    if (masterId) {
      setOverrides(prev => ({ ...prev, [uid]: masterId }));
      setRowWarning(prev => ({ ...prev, [uid]: null }));
      setCreateMasterFor(prev => ({ ...prev, [uid]: null }));
    } else {
      _setNotFoundWarning(uid, s);
    }
  };

  // "Прив'язати до цього рядка" — resolves master and immediately binds all unmapped rows
  const handleBindFromRow = (g, s) => {
    const uid = g.normalized_uid;
    const masterId = resolveRowMaster(s);
    if (masterId) {
      setOverrides(prev => ({ ...prev, [uid]: masterId }));
      setRowWarning(prev => ({ ...prev, [uid]: null }));
      setCreateMasterFor(prev => ({ ...prev, [uid]: null }));
      handleBindWithMaster(g, masterId);
    } else {
      _setNotFoundWarning(uid, s);
    }
  };

  const handleBulkBind = async () => {
    if (!groups) return;
    const targets = groups.filter(g => canBulkBind(g) && bulkSel.has(g.normalized_uid));
    if (!targets.length) return;
    setBulkBinding(true); setError(null);
    let totalBound = 0;
    for (const g of targets) {
      const masterId = overrides[g.normalized_uid] || g.suggested_master_department_id;
      const unmapped = g.sources.filter(s => s.mapping_status === "pending" || !s.mapping_status);
      if (!unmapped.length || !masterId) continue;
      try {
        const res = await uidGroupBind({
          normalized_uid:       g.normalized_uid,
          master_department_id: masterId,
          rows: unmapped.map(s => ({ source_id: s.source_id, source_department_id: s.source_department_id })),
        });
        totalBound += res.bound;
        setBinding(prev => ({ ...prev, [g.normalized_uid]: "ok" }));
        setBindResult(prev => ({ ...prev, [g.normalized_uid]: res }));
      } catch { /* individual errors are non-fatal in bulk */ }
    }
    setBulkBinding(false);
    setBulkSel(new Set());
    if (totalBound > 0) { onBound(); load(); }
  };

  const eligibleCount   = (groups || []).filter(canBulkBind).length;
  const bulkReadyCount  = (groups || []).filter(g => canBulkBind(g) && bulkSel.has(g.normalized_uid)).length;

  const S = {
    overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16 },
    box:     { background:"#fff",borderRadius:10,width:"100%",maxWidth:1140,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)" },
    hdr:     { padding:"14px 20px",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexShrink:0 },
    body:    { flex:1,overflowY:"auto",padding:"12px 20px" },
    foot:    { padding:"10px 20px",borderTop:"1px solid #e5e7eb",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",flexShrink:0 },
  };

  const CONF_COLOR = (c) => c >= 85 ? "#065f46" : c >= 60 ? "#92400e" : "#991b1b";
  const CONF_BG    = (c) => c >= 85 ? "#d1fae5" : c >= 60 ? "#fef3c7" : "#fee2e2";

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={S.hdr}>
          <div style={{ flex: 1 }}>
            <div style={{fontWeight:700,fontSize:16}}>Однаковий UID у різних джерелах</div>
            <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>
              Групує source_department_id з однаковим нормалізованим UID (після зняття числового prefix).
              Дозволяє вручну прив'язати дублікати до одного master-підрозділу.
            </div>
            <div style={{fontSize:12,color:"#374151",marginTop:6,padding:"6px 10px",
                          background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:5}}>
              Оберіть один master-підрозділ, до якого будуть прив'язані всі незамаплені
              source-підрозділи з однаковим normalized UID.
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#6b7280",flexShrink:0}}>✕</button>
        </div>

        <div style={S.body}>
          {/* Toolbar */}
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <label style={{fontSize:12,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
              <input type="checkbox" checked={onlyUnmapped} onChange={e=>{ setOnlyUnmapped(e.target.checked); setPage(1); }} />
              Тільки незамаплені
            </label>
            <label style={{fontSize:12,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
              <input type="checkbox" checked={inFact} onChange={e=>{ setInFact(e.target.checked); setPage(1); }} />
              Тільки у fact_turnover
            </label>
            <input value={searchInput} onChange={e=>setSearchInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&(setSearch(searchInput),setPage(1))}
              placeholder="Пошук по UID або назві…"
              style={{padding:"4px 8px",border:"1px solid #d1d5db",borderRadius:4,fontSize:12,width:200}} />
            <button onClick={()=>{setSearch(searchInput);setPage(1);}}
              style={{padding:"4px 10px",border:"1px solid #d1d5db",borderRadius:4,fontSize:12,cursor:"pointer"}}>🔍</button>
            {search && <button onClick={()=>{setSearch("");setSearchInput("");setPage(1);}}
              style={{padding:"4px 8px",border:"1px solid #d1d5db",borderRadius:4,fontSize:12,cursor:"pointer",color:"#6b7280"}}>✕</button>}
            <button onClick={() => setShowBulkProcess(true)}
              style={{padding:"4px 14px",background:"#1e40af",color:"#fff",border:"none",
                       borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
              ⚡ Масово обробити UID-групи
            </button>
            <span style={{marginLeft:"auto",fontSize:11,color:"#6b7280"}}>
              Знайдено груп: <strong>{total}</strong>
            </span>
          </div>

          {/* Bulk process success banner */}
          {bulkSuccessBanner && (
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",
                          background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:6,
                          fontSize:12,color:"#065f46",marginBottom:10}}>
              <span style={{fontWeight:700}}>✅</span>
              <span>{bulkSuccessBanner}</span>
              <button onClick={()=>setBulkSuccessBanner(null)}
                style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",
                         color:"#9ca3af",fontSize:14,padding:0}}>✕</button>
            </div>
          )}

          {/* Bulk actions bar */}
          {eligibleCount > 0 && (
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,padding:"8px 12px",
                         background:"#f0fdf4",border:"1px solid #6ee7b7",borderRadius:6,flexWrap:"wrap"}}>
              <label style={{fontSize:12,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                <input type="checkbox"
                  checked={bulkSel.size > 0 && bulkSel.size === eligibleCount}
                  onChange={e => {
                    if (e.target.checked) {
                      setBulkSel(new Set((groups||[]).filter(canBulkBind).map(g=>g.normalized_uid)));
                    } else { setBulkSel(new Set()); }
                  }} />
                Вибрати всі придатні ({eligibleCount})
              </label>
              {bulkSel.size > 0 && (
                <button onClick={handleBulkBind} disabled={bulkBinding}
                  style={{padding:"4px 14px",background:"#065f46",color:"#fff",border:"none",
                           borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600}}>
                  {bulkBinding?"Прив'язка…":`Прив'язати вибрані (${bulkReadyCount})`}
                </button>
              )}
              <span style={{fontSize:11,color:"#6b7280"}}>
                Confidence ≥ 85%, без конфліктів master, є suggested
              </span>
            </div>
          )}

          {error && <div style={{color:"#dc2626",background:"#fee2e2",border:"1px solid #fca5a5",
                                  borderRadius:6,padding:"8px 12px",marginBottom:10,fontSize:12}}>{error}</div>}
          {loading && <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Пошук UID-груп…</div>}

          {!loading && groups && groups.length === 0 && (
            <div style={{textAlign:"center",padding:40,color:"#9ca3af"}}>
              <div style={{fontSize:28,marginBottom:8}}>✅</div>
              <div style={{fontWeight:600}}>Груп з однаковим UID не знайдено</div>
              <div style={{fontSize:12,marginTop:4}}>
                {onlyUnmapped ? "Всі підрозділи вже замаплені або немає дублікатів UID." : "Немає підрозділів з однаковим UID у різних джерелах."}
              </div>
            </div>
          )}

          {/* Groups list */}
          {!loading && (groups||[]).map(g => {
            const uid  = g.normalized_uid;
            const isExp = expanded.has(uid);
            const bst  = binding[uid];
            const res  = bindResult[uid];
            const masterOv = overrides[uid];
            const activeMaster = masterOv || g.suggested_master_department_id;
            const unmappedCount = g.sources.filter(s => s.mapping_status === "pending" || !s.mapping_status).length;
            const isBulkSelected = bulkSel.has(uid);
            const warn = rowWarning[uid];

            return (
              <div key={uid} style={{
                border:`1px solid ${g.conflict_flags.mixed_mapping?"#fca5a5":g.confidence>=85?"#6ee7b7":"#fcd34d"}`,
                borderRadius:8,marginBottom:8,overflow:"hidden",
                opacity: bst === "ok" ? 0.6 : 1,
              }}>
                {/* Group header */}
                <div style={{
                  display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                  background:g.conflict_flags.mixed_mapping?"#fef2f2":g.confidence>=85?"#f0fdf4":"#fffbeb",
                  flexWrap:"wrap",
                }}>
                  {canBulkBind(g) && bst !== "ok" && (
                    <input type="checkbox" checked={isBulkSelected}
                      onChange={e => setBulkSel(prev => {
                        const n = new Set(prev); e.target.checked ? n.add(uid) : n.delete(uid); return n;
                      })} />
                  )}

                  <button onClick={()=>toggleExpand(uid)}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#374151",padding:0}}>
                    {isExp?"▲":"▼"}
                  </button>

                  <code style={{fontSize:11,color:"#1e40af",fontWeight:700,background:"#eff6ff",
                                 padding:"1px 6px",borderRadius:4}}>{uid}</code>

                  <span style={{fontSize:11,color:"#6b7280"}}>{g.source_count} джерела · {g.row_count} рядки</span>

                  <span style={{fontSize:10,padding:"1px 6px",borderRadius:8,fontWeight:700,
                                 background:CONF_BG(g.confidence),color:CONF_COLOR(g.confidence)}}>
                    {g.confidence}% збіг
                  </span>

                  {g.conflict_flags.mixed_mapping && (
                    <span title="Різні master-прив'язки у цій групі — потрібна ручна перевірка"
                      style={{fontSize:10,padding:"1px 6px",borderRadius:8,background:"#fee2e2",color:"#dc2626",fontWeight:700}}>
                      ⚠ Різні masters
                    </span>
                  )}
                  {g.conflict_flags.different_orgs && (
                    <span style={{fontSize:10,color:"#b45309"}}>Різні орг.</span>
                  )}
                  {g.conflict_flags.different_branches && (
                    <span style={{fontSize:10,color:"#b45309"}}>Різні філії</span>
                  )}
                  {g.conflict_flags.different_names && (
                    <span style={{fontSize:10,color:"#6b7280"}}>Різні назви</span>
                  )}

                  {/* Bind controls */}
                  <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    {bst === "ok" && (
                      <span style={{fontSize:11,color:"#065f46",fontWeight:700}}>
                        ✓ Прив'язано {res?.bound ?? ""}
                      </span>
                    )}
                    {bst !== "ok" && unmappedCount > 0 && !g.conflict_flags.mixed_mapping && (
                      <>
                        <MasterSearchSelect
                          masters={masters}
                          value={activeMaster || ""}
                          onChange={val => {
                            setOverrides(prev => ({ ...prev, [uid]: val }));
                            setRowWarning(prev => ({ ...prev, [uid]: null }));
                          }}
                          suggestedId={g.suggested_master_department_id}
                        />
                        <button onClick={()=>handleBind(g)} disabled={!activeMaster||bst==="loading"}
                          style={{padding:"3px 10px",background:activeMaster?"#065f46":"#d1d5db",color:"#fff",
                                   border:"none",borderRadius:4,fontSize:11,cursor:activeMaster?"pointer":"default",
                                   fontWeight:600,whiteSpace:"nowrap"}}>
                          {bst==="loading"?"…":`Прив'язати незамаплені (${unmappedCount})`}
                        </button>
                      </>
                    )}
                    {g.conflict_flags.mixed_mapping && (
                      <span style={{fontSize:11,color:"#dc2626"}}>
                        Ручна перевірка required
                      </span>
                    )}
                    {unmappedCount === 0 && bst !== "ok" && (
                      <span style={{fontSize:11,color:"#6b7280"}}>Всі замаплені</span>
                    )}
                  </div>
                </div>

                {/* Warning from row action */}
                {warn && (
                  <div style={{padding:"6px 12px",background:"#fff7ed",borderTop:"1px solid #fed7aa",
                                fontSize:11,color:"#c2410c",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span>⚠</span>
                    <span style={{flex:1}}>{warn}</span>
                    {createMasterFor[uid] && (
                      <button
                        onClick={() => setCreateMasterModal({ g, s: createMasterFor[uid] })}
                        style={{padding:"2px 10px",fontSize:11,fontWeight:700,cursor:"pointer",
                                 background:"#065f46",color:"#fff",border:"none",
                                 borderRadius:4,whiteSpace:"nowrap"}}>
                        + Створити master
                      </button>
                    )}
                    <button onClick={()=>{
                      setRowWarning(prev=>({...prev,[uid]:null}));
                      setCreateMasterFor(prev=>({...prev,[uid]:null}));
                    }} style={{background:"none",border:"none",cursor:"pointer",
                               color:"#9ca3af",fontSize:13,padding:0}}>✕</button>
                  </div>
                )}

                {/* Expanded sources table */}
                {isExp && (
                  <div style={{overflowX:"auto",borderTop:"1px solid #e5e7eb"}}>
                    <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                      <thead>
                        <tr style={{background:"#f9fafb",borderBottom:"1px solid #e5e7eb"}}>
                          <th style={{padding:"4px 8px",textAlign:"left"}}>Джерело</th>
                          <th style={{padding:"4px 8px",textAlign:"left"}}>Source ID</th>
                          <th style={{padding:"4px 8px",textAlign:"left"}}>Назва</th>
                          <th style={{padding:"4px 8px",textAlign:"left"}}>Організація</th>
                          <th style={{padding:"4px 8px",textAlign:"left"}}>Філія</th>
                          <th style={{padding:"4px 8px",textAlign:"left"}}>Регіон</th>
                          <th style={{padding:"4px 8px",textAlign:"center"}}>Статус</th>
                          <th style={{padding:"4px 8px",textAlign:"left"}}>Master</th>
                          <th style={{padding:"4px 8px",textAlign:"left",whiteSpace:"nowrap"}}>Дія</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.sources.map((s, i) => {
                          const isMapped = s.mapping_status === "mapped" || s.mapping_status === "auto";
                          const isUnmapped = s.mapping_status === "pending" || !s.mapping_status;
                          return (
                            <tr key={i} style={{
                              borderBottom:"1px solid #f3f4f6",
                              background: isMapped ? "#f0fdf4" : undefined,
                            }}>
                              <td style={{padding:"4px 8px",color:"#6b7280"}}>{s.source_name}</td>
                              <td style={{padding:"4px 8px",fontFamily:"monospace",fontSize:10,color:"#1e40af"}}>
                                {s.source_department_id}
                              </td>
                              <td style={{padding:"4px 8px",fontWeight:500}}>{s.source_department_name||"—"}</td>
                              <td style={{padding:"4px 8px",color:"#374151"}}>{s.eff_org||"—"}</td>
                              <td style={{padding:"4px 8px",color:"#374151"}}>{s.eff_branch||"—"}</td>
                              <td style={{padding:"4px 8px",color:"#374151"}}>{s.eff_region||"—"}</td>
                              <td style={{padding:"4px 8px",textAlign:"center"}}>
                                <span style={{
                                  fontSize:10,padding:"1px 5px",borderRadius:3,fontWeight:600,
                                  background: isMapped ? "#d1fae5"
                                            : s.mapping_status==="rejected" ? "#fee2e2" : "#fef3c7",
                                  color: isMapped ? "#065f46"
                                       : s.mapping_status==="rejected" ? "#991b1b" : "#92400e",
                                }}>
                                  {s.mapping_status === "auto" ? "Авто" : s.mapping_status === "mapped" ? "Прив'язано"
                                   : s.mapping_status === "rejected" ? "Відхилено" : "Очікує"}
                                </span>
                              </td>
                              <td style={{padding:"4px 8px",color:"#065f46",fontWeight:s.master_department_name?500:400}}>
                                {s.master_department_name
                                  ? <><span style={{fontSize:9,color:"#9ca3af"}}>{s.master_department_id}&nbsp;</span>{s.master_department_name}</>
                                  : <span style={{color:"#9ca3af"}}>—</span>}
                              </td>
                              <td style={{padding:"4px 8px",whiteSpace:"nowrap"}}>
                                {bst !== "ok" && (
                                  <div style={{display:"flex",gap:4,flexWrap:"nowrap"}}>
                                    <button
                                      onClick={() => handleSelectAsMaster(g, s)}
                                      title="Встановити цей рядок як master для групи"
                                      style={{padding:"2px 7px",fontSize:10,cursor:"pointer",
                                               background:"#eff6ff",border:"1px solid #93c5fd",
                                               borderRadius:3,color:"#1d4ed8",fontWeight:600,
                                               whiteSpace:"nowrap"}}>
                                      Обрати як master
                                    </button>
                                    {isUnmapped && (
                                      <button
                                        onClick={() => handleBindFromRow(g, s)}
                                        title="Прив'язати всі незамаплені рядки групи до цього рядка"
                                        style={{padding:"2px 7px",fontSize:10,cursor:"pointer",
                                                 background:"#f0fdf4",border:"1px solid #6ee7b7",
                                                 borderRadius:3,color:"#065f46",fontWeight:600,
                                                 whiteSpace:"nowrap"}}>
                                        Прив'язати до цього рядка
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12,alignItems:"center"}}>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}
                style={{padding:"4px 12px",border:"1px solid #d1d5db",borderRadius:4,cursor:"pointer",fontSize:12}}>
                ← Назад
              </button>
              <span style={{fontSize:12,color:"#6b7280"}}>Стор. {page}/{totalPages}</span>
              <button onClick={()=>setPage(p=>p+1)} disabled={page>=totalPages}
                style={{padding:"4px 12px",border:"1px solid #d1d5db",borderRadius:4,cursor:"pointer",fontSize:12}}>
                Далі →
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.foot}>
          <span style={{fontSize:12,color:"#6b7280"}}>
            mapping_method = <code>uid_group_manual</code> · Тільки unmapped рядки · Не перезаписує існуючі прив'язки
          </span>
          <button onClick={onClose}
            style={{marginLeft:"auto",padding:"6px 16px",border:"1px solid #d1d5db",borderRadius:6,
                     cursor:"pointer",fontSize:13,background:"#f9fafb"}}>
            Закрити
          </button>
        </div>
      </div>

      {/* Create master modal — opened from "not found in master" warning */}
      {createMasterModal && (() => {
        const { g: cmG, s: cmS } = createMasterModal;
        const adaptedRow = {
          source_id:                      cmS.source_id,
          source_department_id:           cmS.source_department_id,
          source_department_name:         cmS.source_department_name || "",
          source_name:                    cmS.source_name || "",
          effective_department_id:        cmS.source_department_id,
          effective_department_name:      cmS.source_department_name || "",
          effective_organization_name:    cmS.eff_org     || "",
          effective_branch:               cmS.eff_branch  || "",
          effective_region:               cmS.eff_region  || "",
          effective_holding:              cmS.eff_holding || "",
          effective_parent_id:            "",
          effective_parent_name:          "",
          source_parent_department_id:    "",
          source_parent_department_name:  "",
          source_node_type:               null,
          source_level:                   null,
          parent_missing:                 false,
        };
        const uid = cmG.normalized_uid;
        const _afterBind = async (masterId) => {
          setCreateMasterModal(null);
          setRowWarning(prev => ({ ...prev, [uid]: null }));
          setCreateMasterFor(prev => ({ ...prev, [uid]: null }));
          setOverrides(prev => ({ ...prev, [uid]: masterId }));
          await handleBindWithMaster(cmG, masterId);
          load();
        };
        return (
          <CreateModal
            row={adaptedRow}
            onCreate={async (body) => {
              try {
                const res = await createMasterFromSource(body);
                await _afterBind(res.department_id);
              } catch (e) {
                // If master already exists (409), extract its ID and bind directly
                const detail = e?.response?.data?.detail || "";
                const match = detail.match(/\[([^\]]+)\]/);
                if (e?.response?.status === 409 && match) {
                  await _afterBind(match[1]);
                  return;
                }
                throw e;
              }
            }}
            onClose={() => setCreateMasterModal(null)}
          />
        );
      })()}

      {/* Bulk process modal */}
      {showBulkProcess && (
        <BulkUidPreviewModal
          sourceId={null}
          onBound={() => load()}
          onSuccess={(res) => {
            setBulkSuccessBanner(
              `Створено ${res.created_masters} master-підрозділів, прив'язано ${res.bound_rows} source-рядків, пропущено ${(res.skipped_parent_missing || 0) + (res.skipped_conflict || 0)} конфліктів.`
            );
          }}
          onClose={() => setShowBulkProcess(false)}
        />
      )}
    </div>
  );
}

// ── SameNameConflictsModal ────────────────────────────────────────────────────

// Full-context master card (PART 2)
function MasterCard({ m, isTarget, onSelect, onSelectAll }) {
  const fmtAmt = (n) => {
    if (!n) return null;
    if (n >= 1_000_000) return `₴${(n/1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `₴${Math.round(n/1_000)}K`;
    return `₴${Math.round(n)}`;
  };
  const nodeColor = { root:"#1e40af", leaf:"#065f46", parent_child:"#92400e", root_parent:"#6b7280" };
  const nodeBg    = { root:"#eff6ff", leaf:"#f0fdf4", parent_child:"#fffbeb", root_parent:"#f9fafb" };
  const ctxLine = [m.organization_name, m.branch_name, m.region_name].filter(Boolean).join(" · ");

  return (
    <div style={{ border:`2px solid ${isTarget?"#2563eb":"#fca5a5"}`,
                  borderRadius:8, padding:"10px 12px", minWidth:220, maxWidth:280,
                  background: isTarget?"#eff6ff":"#fef2f2", display:"flex", flexDirection:"column", gap:4 }}>
      {/* Title */}
      <div style={{ fontWeight:700, fontSize:12, color: isTarget?"#1e40af":"#991b1b",
                    lineHeight:1.3 }}>{m.master_name}</div>
      {/* ID */}
      <div style={{ fontSize:10, fontFamily:"monospace", color:"#6b7280",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
           title={m.master_id}>ID: {m.master_id}</div>
      {/* Context */}
      {ctxLine && <div style={{ fontSize:10, color:"#374151" }}>{ctxLine}</div>}
      {/* Parent */}
      {(m.parent_department_id || m.parent_department_name) && (
        <div style={{ fontSize:10, color:"#64748b" }}>
          Parent: <span style={{ fontFamily:"monospace" }}>{m.parent_department_id}</span>
          {m.parent_department_name && ` / ${m.parent_department_name}`}
        </div>
      )}
      {/* Badges */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:2 }}>
        {m.node_type && (
          <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3, fontWeight:600,
                         color: nodeColor[m.node_type]||"#6b7280",
                         background: nodeBg[m.node_type]||"#f9fafb",
                         border:`1px solid ${nodeColor[m.node_type]||"#e5e7eb"}` }}>
            {m.node_type}
          </span>
        )}
        <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3,
                       background:"#f1f5f9", color:"#475569", border:"1px solid #e2e8f0" }}>
          {m.rows_count} рядків
        </span>
        {m.fact_rows > 0 && (
          <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3,
                         background:"#fef9c3", color:"#713f12", border:"1px solid #fde047" }}>
            {m.fact_rows} fact
          </span>
        )}
        {m.sales_amount > 0 && (
          <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3,
                         background:"#dcfce7", color:"#166534", border:"1px solid #6ee7b7",
                         fontWeight:600 }}>
            {fmtAmt(m.sales_amount)}
          </span>
        )}
      </div>
      {/* Actions */}
      <div style={{ display:"flex", gap:4, marginTop:4 }}>
        <button onClick={() => onSelect(m.master_id)}
          style={{ flex:1, fontSize:10, padding:"3px 6px", borderRadius:4, cursor:"pointer",
                   border:`1px solid ${isTarget?"#2563eb":"#fca5a5"}`,
                   background: isTarget?"#2563eb":"#fff",
                   color: isTarget?"#fff":"#991b1b", fontWeight: isTarget?700:400 }}>
          {isTarget ? "✓ Обрано" : "Вибрати цей master"}
        </button>
        <button onClick={() => onSelectAll(m.master_id)}
          style={{ fontSize:10, padding:"3px 6px", borderRadius:4, cursor:"pointer",
                   border:"1px solid #e2e8f0", background:"#f8fafc", color:"#64748b" }}
          title="Позначити всі рядки цього master">
          ☑ всі
        </button>
      </div>
    </div>
  );
}

// Searchable master selector with full context (PART 3)
function ConflictMasterSelector({ masters, value, onChange }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const selected = masters.find(m => m.department_id === value) || null;

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const filtered = masters.filter(m => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [m.department_id, m.department_name, m.organization_name,
            m.branch_name, m.region_name, m.holding_name,
            m.parent_department_id, m.parent_department_name]
      .some(v => (v||"").toLowerCase().includes(q));
  }).slice(0, 80);

  const ctx = (m) => [m.organization_name, m.branch_name, m.region_name].filter(Boolean).join(" · ");

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div onClick={() => setOpen(v => !v)}
        style={{ padding:"5px 10px", border:`1px solid ${open?"#2563eb":"#d1d5db"}`,
                 borderRadius:5, cursor:"pointer", background:"#fff", fontSize:12,
                 display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        {selected ? (
          <span>
            <strong>{selected.department_name}</strong>
            <span style={{ marginLeft:6, fontSize:10, color:"#6b7280" }}>
              {ctx(selected)}
            </span>
          </span>
        ) : <span style={{ color:"#9ca3af" }}>Оберіть target master…</span>}
        <span style={{ marginLeft:8, color:"#9ca3af" }}>▾</span>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:100,
                      background:"#fff", border:"1px solid #d1d5db", borderRadius:6,
                      boxShadow:"0 4px 16px rgba(0,0,0,.12)", maxHeight:300, overflow:"hidden",
                      display:"flex", flexDirection:"column" }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Пошук по назві, ID, орг, філії, регіону, parent…"
            style={{ margin:6, padding:"4px 8px", border:"1px solid #e2e8f0",
                     borderRadius:4, fontSize:12, outline:"none" }}/>
          <div style={{ overflowY:"auto", flex:1 }}>
            {filtered.length === 0 && (
              <div style={{ padding:"10px 12px", fontSize:11, color:"#94a3b8" }}>Нічого не знайдено</div>
            )}
            {filtered.map(m => (
              <div key={m.department_id}
                onClick={() => { onChange(m.department_id); setOpen(false); setSearch(""); }}
                style={{ padding:"6px 10px", cursor:"pointer", borderBottom:"1px solid #f1f5f9",
                         background: m.department_id === value ? "#eff6ff" : "transparent" }}>
                <div style={{ fontSize:12, fontWeight:600 }}>{m.department_name}</div>
                <div style={{ fontSize:10, fontFamily:"monospace", color:"#94a3b8" }}>{m.department_id}</div>
                {ctx(m) && <div style={{ fontSize:10, color:"#6b7280" }}>{ctx(m)}</div>}
                {(m.parent_department_id||m.parent_department_name) && (
                  <div style={{ fontSize:10, color:"#94a3b8" }}>
                    Parent: {m.parent_department_id}{m.parent_department_name ? ` / ${m.parent_department_name}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
          {value && (
            <div style={{ borderTop:"1px solid #f1f5f9", padding:"4px 8px" }}>
              <button onClick={() => { onChange(""); setOpen(false); }}
                style={{ fontSize:11, background:"none", border:"none", cursor:"pointer", color:"#ef4444" }}>
                ✕ Скинути вибір
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SameNameConflictsModal({ masters, onClose, onRemapped }) {
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [page,          setPage]          = useState(1);
  const [expanded,      setExpanded]      = useState({});
  const [filterSrc,     setFilterSrc]     = useState("");
  const [filterOrg,     setFilterOrg]     = useState("");
  const [onlyFact,      setOnlyFact]      = useState(false);
  // remap state per group
  const [remapTarget,   setRemapTarget]   = useState({});   // norm_name → master_id
  const [remapSelected, setRemapSelected] = useState({});   // norm_name → Set of "sid__deptid"
  const [preview,       setPreview]       = useState(null);
  const [remapping,     setRemapping]     = useState(false);
  const [remapResult,   setRemapResult]   = useState(null);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = { page, page_size: PAGE_SIZE, only_fact_used: onlyFact };
      if (filterSrc) params.source_id = filterSrc;
      if (filterOrg) params.organization = filterOrg;
      const res = await getSameNameConflicts(params);
      setData(res);
    } catch { setError("Помилка завантаження конфліктів"); }
    finally { setLoading(false); }
  }, [page, filterSrc, filterOrg, onlyFact]);

  useEffect(() => { load(); }, [load]);

  const fmtAmt = (n) => {
    if (!n) return "—";
    if (n >= 1_000_000) return `₴${(n/1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `₴${Math.round(n/1_000)}K`;
    return `₴${Math.round(n)}`;
  };

  const toggleExpand = (name) => setExpanded(p => ({ ...p, [name]: !p[name] }));

  const toggleRowSelect = (normName, key) => {
    setRemapSelected(p => {
      const prev = new Set(p[normName] || []);
      prev.has(key) ? prev.delete(key) : prev.add(key);
      return { ...p, [normName]: prev };
    });
  };

  const selectAllInGroup = (g, master_id) => {
    const keys = g.source_rows
      .filter(r => r.master_id === master_id)
      .map(r => `${r.source_id}__${r.source_department_id}`);
    setRemapSelected(p => ({ ...p, [g.norm_name]: new Set([...(p[g.norm_name] || []), ...keys]) }));
  };

  const handlePreview = async (g) => {
    const selected = remapSelected[g.norm_name];
    const target   = remapTarget[g.norm_name];
    if (!target) { setError("Оберіть target master"); return; }
    const items = g.source_rows
      .filter(r => !selected?.size || selected.has(`${r.source_id}__${r.source_department_id}`))
      .map(r => ({ source_id: r.source_id, source_department_id: r.source_department_id }));
    try {
      const res = await bulkRemap({ items, new_master_id: target, dry_run: true });
      // Attach target master context for preview display
      const targetMaster = masters.find(m => m.department_id === target);
      setPreview({ norm_name: g.norm_name, targetMaster, group: g, ...res });
    } catch { setError("Помилка preview"); }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setRemapping(true);
    try {
      const g = data?.groups?.find(x => x.norm_name === preview.norm_name);
      const selected = remapSelected[preview.norm_name];
      const target   = remapTarget[preview.norm_name];
      const items = (g?.source_rows || [])
        .filter(r => !selected?.size || selected.has(`${r.source_id}__${r.source_department_id}`))
        .map(r => ({ source_id: r.source_id, source_department_id: r.source_department_id }));
      const res = await bulkRemap({ items, new_master_id: target, dry_run: false });
      setRemapResult(res);
      setPreview(null);
      onRemapped?.();
      load();
    } catch { setError("Помилка переприв'язки"); }
    finally { setRemapping(false); }
  };

  // Safety warning: check if target master context differs from selected source rows
  const getSafetyWarning = (g, targetId) => {
    if (!targetId || !g) return null;
    const targetMaster = masters.find(m => m.department_id === targetId);
    if (!targetMaster) return null;
    const rows = g.source_rows.filter(r =>
      !remapSelected[g.norm_name]?.size ||
      remapSelected[g.norm_name].has(`${r.source_id}__${r.source_department_id}`)
    );
    const warnings = [];
    const srcBranches = [...new Set(rows.map(r => r.branch_name).filter(Boolean))];
    const srcRegions  = [...new Set(rows.map(r => r.region_name).filter(Boolean))];
    const srcParents  = [...new Set(rows.map(r => r.master_parent_id).filter(Boolean))];
    if (targetMaster.branch_name && srcBranches.length > 0 &&
        !srcBranches.includes(targetMaster.branch_name))
      warnings.push(`інша філія (target: ${targetMaster.branch_name}, source: ${srcBranches.join(", ")})`);
    if (targetMaster.region_name && srcRegions.length > 0 &&
        !srcRegions.includes(targetMaster.region_name))
      warnings.push(`інший регіон (target: ${targetMaster.region_name})`);
    if (targetMaster.parent_department_id && srcParents.length > 0 &&
        !srcParents.includes(targetMaster.parent_department_id))
      warnings.push(`інший parent (target: ${targetMaster.parent_department_id})`);
    return warnings.length > 0 ? warnings : null;
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:2000,
                  display:"flex", alignItems:"flex-start", justifyContent:"center",
                  paddingTop:40, overflowY:"auto" }}>
      <div style={{ background:"#fff", borderRadius:10, width:"min(1200px,98vw)",
                    maxHeight:"88vh", display:"flex", flexDirection:"column",
                    boxShadow:"0 8px 32px rgba(0,0,0,.18)" }}>

        {/* Header */}
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #e5e7eb",
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <span style={{ fontWeight:700, fontSize:15, color:"#991b1b" }}>
              ⚠ Конфлікт назв → різні master
            </span>
            {data && (
              <span style={{ marginLeft:10, fontSize:12, color:"#6b7280" }}>
                {data.total_groups} груп · {data.conflict_count_all} всього
              </span>
            )}
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
        </div>

        {/* Filters */}
        <div style={{ padding:"10px 20px", borderBottom:"1px solid #f1f5f9",
                      display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <input value={filterSrc} onChange={e=>{setFilterSrc(e.target.value);setPage(1);}}
            placeholder="Source ID" type="number"
            style={{ width:90, fontSize:12, padding:"3px 6px", border:"1px solid #cbd5e1", borderRadius:4 }}/>
          <input value={filterOrg} onChange={e=>{setFilterOrg(e.target.value);setPage(1);}}
            placeholder="Організація" style={{ width:150, fontSize:12, padding:"3px 6px", border:"1px solid #cbd5e1", borderRadius:4 }}/>
          <label style={{ fontSize:12, display:"flex", gap:4, alignItems:"center" }}>
            <input type="checkbox" checked={onlyFact} onChange={e=>{setOnlyFact(e.target.checked);setPage(1);}}/>
            Тільки з факту продажів
          </label>
          <button onClick={() => { setFilterSrc(""); setFilterOrg(""); setOnlyFact(false); setPage(1); }}
            style={{ fontSize:11, padding:"2px 8px", border:"1px solid #e2e8f0", borderRadius:4, background:"#fff", cursor:"pointer", color:"#64748b" }}>
            Скинути
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 20px" }}>
          {error && <div style={{ color:"#991b1b", marginBottom:8, fontSize:12 }}>{error}</div>}
          {remapResult && (
            <div style={{ background:"#f0fdf4", border:"1px solid #6ee7b7", borderRadius:6,
                          padding:"8px 12px", marginBottom:10, fontSize:12 }}>
              ✅ Переприв'язано: {remapResult.rows_remapped} рядків → {remapResult.new_master_name}
              <button onClick={() => setRemapResult(null)}
                style={{ marginLeft:8, background:"none", border:"none", cursor:"pointer", color:"#065f46" }}>✕</button>
            </div>
          )}
          {loading && <div style={{ textAlign:"center", padding:20, color:"#94a3b8" }}>Завантаження…</div>}

          {/* ── Preview modal (PART 5) ── */}
          {preview && (() => {
            const tm = preview.targetMaster;
            const totalSales = (preview.preview||[]).reduce((s,r) => s + (r.sales_vat||0), 0);
            const ctxStr = m => m ? [m.organization_name, m.branch_name, m.region_name].filter(Boolean).join(" · ") : "—";
            return (
              <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:3000,
                            display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
                <div style={{ background:"#fff", borderRadius:10, padding:24,
                              width:"min(700px,96vw)", maxHeight:"88vh", overflowY:"auto",
                              boxShadow:"0 8px 32px rgba(0,0,0,.25)" }}>
                  <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>
                    Підтвердження переприв'язки
                  </div>

                  {/* New master context */}
                  <div style={{ background:"#f0fdf4", border:"1px solid #6ee7b7", borderRadius:8,
                                padding:"10px 14px", marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#065f46", marginBottom:4 }}>
                      Новий master:
                    </div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{tm?.department_name || preview.new_master_name}</div>
                    {tm?.department_id && <div style={{ fontSize:10, fontFamily:"monospace", color:"#64748b" }}>ID: {tm.department_id}</div>}
                    {ctxStr(tm) !== "—" && <div style={{ fontSize:11, color:"#374151" }}>{ctxStr(tm)}</div>}
                    {(tm?.parent_department_id||tm?.parent_department_name) && (
                      <div style={{ fontSize:10, color:"#6b7280" }}>
                        Parent: {tm.parent_department_id}{tm.parent_department_name ? ` / ${tm.parent_department_name}` : ""}
                      </div>
                    )}
                  </div>

                  {/* Summary line */}
                  <div style={{ fontSize:12, marginBottom:10, color:"#374151",
                                padding:"6px 10px", background:"#f8fafc", borderRadius:6 }}>
                    Рядків: <strong>{preview.rows_affected}</strong> ·
                    Продажі: <strong>{fmtAmt(totalSales)}</strong>
                  </div>

                  {/* Affected rows table */}
                  <div style={{ maxHeight:220, overflowY:"auto", marginBottom:12,
                                border:"1px solid #e5e7eb", borderRadius:6 }}>
                    <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
                      <thead><tr style={{ background:"#f8fafc", position:"sticky", top:0 }}>
                        <th style={{ padding:"4px 8px", textAlign:"left" }}>Dept ID</th>
                        <th style={{ padding:"4px 8px", textAlign:"left" }}>Старий master</th>
                        <th style={{ padding:"4px 8px", textAlign:"left" }}>Орг / Філія</th>
                        <th style={{ padding:"4px 8px", textAlign:"right" }}>Продажі</th>
                      </tr></thead>
                      <tbody>
                        {(preview.preview||[]).map((r,i) => {
                          // Find source row for context
                          const sr = preview.group?.source_rows?.find(
                            s => s.source_department_id === r.source_department_id
                          );
                          return (
                            <tr key={i} style={{ borderTop:"1px solid #f1f5f9" }}>
                              <td style={{ padding:"3px 8px", fontFamily:"monospace", fontSize:10,
                                           maxWidth:120, overflow:"hidden", textOverflow:"ellipsis",
                                           whiteSpace:"nowrap" }} title={r.source_department_id}>
                                {r.source_department_id}
                              </td>
                              <td style={{ padding:"3px 8px" }}>
                                <div style={{ color:"#ef4444", fontWeight:500 }}>{r.old_master_name||"—"}</div>
                                {sr?.master_parent_id && (
                                  <div style={{ fontSize:9, color:"#94a3b8" }}>↳ {sr.master_parent_id}</div>
                                )}
                              </td>
                              <td style={{ padding:"3px 8px", fontSize:10, color:"#6b7280" }}>
                                {[sr?.organization_name, sr?.branch_name].filter(Boolean).join(" / ")||"—"}
                              </td>
                              <td style={{ padding:"3px 8px", textAlign:"right", fontWeight:600 }}>
                                {fmtAmt(r.sales_vat)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                    <button onClick={() => setPreview(null)}
                      style={{ padding:"7px 18px", border:"1px solid #cbd5e1", borderRadius:6,
                               background:"#fff", cursor:"pointer", fontSize:12 }}>
                      Скасувати
                    </button>
                    <button onClick={handleConfirm} disabled={remapping}
                      style={{ padding:"7px 18px", border:"none", borderRadius:6,
                               background:"#991b1b", color:"#fff", cursor:"pointer",
                               fontSize:12, fontWeight:700 }}>
                      {remapping ? "…" : `Переприв'язати ${preview.rows_affected} рядків`}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Conflict groups */}
          {(data?.groups || []).map(g => {
            const targetId = remapTarget[g.norm_name];
            const warnings = getSafetyWarning(g, targetId);
            return (
            <div key={g.norm_name} style={{ border:"1px solid #fecaca", borderRadius:8,
                                           marginBottom:12, overflow:"hidden" }}>
              {/* PART 4 — Group header */}
              <div style={{ background:"#fff5f5", padding:"10px 14px", cursor:"pointer" }}
                   onClick={() => toggleExpand(g.norm_name)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <span style={{ fontWeight:700, color:"#991b1b", fontSize:14 }}>
                      {expanded[g.norm_name] ? "▼" : "▶"} {g.norm_name}
                    </span>
                    <span style={{ marginLeft:8, fontSize:11, fontWeight:600, color:"#dc2626",
                                   background:"#fee2e2", padding:"1px 6px", borderRadius:4 }}>
                      {g.distinct_masters} master
                    </span>
                  </div>
                  <div style={{ display:"flex", gap:8, fontSize:11, color:"#6b7280" }}>
                    <span>{g.rows_count} рядків</span>
                    {g.fact_rows > 0 && <span>{g.fact_rows} fact</span>}
                    {g.sales_amount > 0 && <span style={{ fontWeight:600, color:"#991b1b" }}>{fmtAmt(g.sales_amount)}</span>}
                  </div>
                </div>
                {/* Involved orgs/branches/regions */}
                <div style={{ display:"flex", gap:12, marginTop:4, flexWrap:"wrap" }}>
                  {g.organizations?.length > 0 && (
                    <span style={{ fontSize:10, color:"#6b7280" }}>
                      Орг: {g.organizations.slice(0,3).join(", ")}{g.organizations.length > 3 ? ` +${g.organizations.length-3}` : ""}
                    </span>
                  )}
                  {g.branches?.length > 0 && (
                    <span style={{ fontSize:10, color:"#6b7280" }}>
                      Філії: {g.branches.slice(0,3).join(", ")}{g.branches.length > 3 ? ` +${g.branches.length-3}` : ""}
                    </span>
                  )}
                  {g.regions?.length > 0 && (
                    <span style={{ fontSize:10, color:"#6b7280" }}>
                      Регіони: {g.regions.slice(0,3).join(", ")}{g.regions.length > 3 ? ` +${g.regions.length-3}` : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* PART 2 — Master cards */}
              <div style={{ padding:"10px 14px", display:"flex", gap:10, flexWrap:"wrap",
                            borderBottom:"1px solid #fee2e2", background:"#fffafa" }}>
                {g.master_info.map(m => (
                  <MasterCard key={m.master_id} m={m}
                    isTarget={targetId === m.master_id}
                    onSelect={id => setRemapTarget(p => ({ ...p, [g.norm_name]: id }))}
                    onSelectAll={id => selectAllInGroup(g, id)}
                  />
                ))}
              </div>

              {/* PART 3 — Target selector + remap button */}
              <div style={{ padding:"10px 14px", background:"#fafafa",
                            borderBottom: expanded[g.norm_name] ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ display:"flex", gap:8, alignItems:"flex-start", flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:250 }}>
                    <div style={{ fontSize:11, color:"#6b7280", marginBottom:4, fontWeight:600 }}>
                      Target master для переприв'язки:
                    </div>
                    <ConflictMasterSelector
                      masters={masters}
                      value={targetId || ""}
                      onChange={v => setRemapTarget(p => ({ ...p, [g.norm_name]: v }))}
                    />
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:4, paddingTop:18 }}>
                    <button
                      onClick={() => handlePreview(g)}
                      disabled={!targetId}
                      style={{ padding:"6px 16px", fontSize:12, fontWeight:600, borderRadius:5,
                               border:"none", cursor: targetId ? "pointer" : "default",
                               background: targetId ? "#991b1b" : "#e5e7eb",
                               color: targetId ? "#fff" : "#9ca3af" }}>
                      {(remapSelected[g.norm_name]?.size || 0) > 0
                        ? `Preview вибраних (${remapSelected[g.norm_name].size})`
                        : "Preview всіх у групі"}
                    </button>
                  </div>
                </div>

                {/* PART 6 — Safety warning */}
                {warnings && (
                  <div style={{ marginTop:8, padding:"6px 10px", background:"#fffbeb",
                                border:"1px solid #fcd34d", borderRadius:5, fontSize:11,
                                color:"#92400e" }}>
                    ⚠ Увага: target master має відмінності — {warnings.join("; ")}. Перевірте перед підтвердженням.
                  </div>
                )}
              </div>

              {/* Expanded source rows */}
              {expanded[g.norm_name] && (
                <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
                  <thead><tr style={{ background:"#f1f5f9" }}>
                    <th style={{ padding:"3px 8px", width:24 }}></th>
                    <th style={{ padding:"3px 8px", textAlign:"left" }}>Джерело</th>
                    <th style={{ padding:"3px 8px", textAlign:"left" }}>ID</th>
                    <th style={{ padding:"3px 8px", textAlign:"left" }}>Назва</th>
                    <th style={{ padding:"3px 8px", textAlign:"left" }}>Орг / Філія / Регіон</th>
                    <th style={{ padding:"3px 8px", textAlign:"left" }}>Parent</th>
                    <th style={{ padding:"3px 8px", textAlign:"left" }}>Поточний master</th>
                    <th style={{ padding:"3px 8px", textAlign:"left" }}>Статус</th>
                  </tr></thead>
                  <tbody>
                    {g.source_rows.map((r, i) => {
                      const key = `${r.source_id}__${r.source_department_id}`;
                      const checked = remapSelected[g.norm_name]?.has(key) || false;
                      return (
                        <tr key={i} style={{ borderTop:"1px solid #f1f5f9",
                                             background: checked ? "#fef2f2" : "transparent" }}>
                          <td style={{ padding:"2px 8px", textAlign:"center" }}>
                            <input type="checkbox" checked={checked}
                              onChange={() => toggleRowSelect(g.norm_name, key)}/>
                          </td>
                          <td style={{ padding:"2px 8px", color:"#6b7280" }}>{r.source_name}</td>
                          <td style={{ padding:"2px 8px", fontFamily:"monospace", fontSize:10,
                                       maxWidth:120, overflow:"hidden", textOverflow:"ellipsis",
                                       whiteSpace:"nowrap" }} title={r.source_department_id}>
                            {r.source_department_id}
                          </td>
                          <td style={{ padding:"2px 8px" }}>{r.source_name_fact}</td>
                          <td style={{ padding:"2px 8px", fontSize:10, color:"#374151" }}>
                            {[r.organization_name, r.branch_name, r.region_name].filter(Boolean).join(" / ") || "—"}
                          </td>
                          <td style={{ padding:"2px 8px", fontSize:10, color:"#6b7280",
                                       fontFamily:"monospace", maxWidth:100,
                                       overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
                              title={r.parent_department_id}>
                            {r.parent_department_id || "—"}
                          </td>
                          <td style={{ padding:"2px 8px" }}>
                            <div style={{ fontWeight:500, fontSize:11 }}>{r.master_name}</div>
                            {r.master_parent_id && (
                              <div style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>↳ {r.master_parent_id}</div>
                            )}
                            {[r.master_org, r.master_branch].filter(Boolean).length > 0 && (
                              <div style={{ fontSize:9, color:"#94a3b8" }}>
                                {[r.master_org, r.master_branch].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </td>
                          <td style={{ padding:"2px 8px" }}>
                            <span style={{ fontSize:10, padding:"1px 5px", borderRadius:3,
                                           background: r.mapping_status === "mapped" ? "#f0fdf4" : "#eff6ff",
                                           color: r.mapping_status === "mapped" ? "#065f46" : "#1e40af",
                                           border: `1px solid ${r.mapping_status === "mapped" ? "#6ee7b7" : "#93c5fd"}` }}>
                              {r.mapping_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ); })}

          {/* Pagination */}
          {data && data.total_groups > PAGE_SIZE && (
            <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:8 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p-1)}
                style={{ padding:"3px 10px", border:"1px solid #e2e8f0", borderRadius:4,
                         background:"#fff", cursor:"pointer", fontSize:12 }}>← Назад</button>
              <span style={{ fontSize:12, color:"#6b7280", padding:"3px 6px" }}>
                {page} / {Math.ceil(data.total_groups / PAGE_SIZE)}
              </span>
              <button disabled={page >= Math.ceil(data.total_groups / PAGE_SIZE)}
                onClick={() => setPage(p => p+1)}
                style={{ padding:"3px 10px", border:"1px solid #e2e8f0", borderRadius:4,
                         background:"#fff", cursor:"pointer", fontSize:12 }}>Далі →</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"10px 20px", borderTop:"1px solid #e5e7eb",
                      display:"flex", justifyContent:"flex-end" }}>
          <button onClick={onClose}
            style={{ padding:"6px 18px", border:"1px solid #d1d5db", borderRadius:6,
                     background:"#fff", cursor:"pointer", fontSize:12 }}>
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}


// ── BulkCreateParentsModal ────────────────────────────────────────────────────
function BulkCreateParentsModal({ filterParams, onClose, onCreated }) {
  const [preview,   setPreview]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(new Set());
  // edited[dept_id] = { organization_name, branch_name, region_name, holding_name, ... }
  const [edited,    setEdited]    = useState({});
  const [expanded,  setExpanded]  = useState(new Set());

  useEffect(() => {
    setLoading(true);
    getBulkCreateParentsPreview(filterParams)
      .then(data => {
        setPreview(data.parents || []);
        // Auto-select rows that are ready and have no conflict
        const autoSel = new Set((data.parents || [])
          .filter(p => p.ready && !p.has_conflict)
          .map(p => p.department_id));
        setSelected(autoSel);
      })
      .catch(e => setError(e?.response?.data?.detail || "Помилка завантаження"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const toggleAll = () => {
    if (!preview) return;
    const ready = preview.filter(p => p.ready);
    const allReady = new Set(ready.map(p => p.department_id));
    const allSelected = ready.every(p => selected.has(p.department_id));
    setSelected(allSelected ? new Set() : allReady);
  };

  const toggleRow = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const setField = (deptId, field, value) => {
    setEdited(prev => ({ ...prev, [deptId]: { ...(prev[deptId] || {}), [field]: value } }));
  };

  const toggleExpand = (id) => {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const isResolved = (p) => {
    if (!p.has_conflict) return true;
    const ov = edited[p.department_id] || {};
    return (p.conflict_details || []).every(cd => {
      if (cd.field === 'organization') return ov.organization_name !== undefined;
      if (cd.field === 'branch')       return ov.branch_name       !== undefined;
      if (cd.field === 'region')       return ov.region_name       !== undefined;
      if (cd.field === 'holding')      return ov.holding_name      !== undefined;
      return true;
    });
  };

  const acceptRecommendations = (p) => {
    const patch = {};
    (p.conflict_details || []).forEach(cd => {
      if (cd.field === 'organization') patch.organization_name = cd.recommended_value;
      if (cd.field === 'branch')       patch.branch_name       = cd.recommended_value;
      if (cd.field === 'region')       patch.region_name       = cd.recommended_value;
      if (cd.field === 'holding')      patch.holding_name      = cd.recommended_value;
    });
    setEdited(prev => ({ ...prev, [p.department_id]: { ...(prev[p.department_id] || {}), ...patch } }));
    if (p.ready) setSelected(prev => { const n = new Set(prev); n.add(p.department_id); return n; });
  };

  const acceptAllRecommendations = () => {
    if (!preview) return;
    const newEdited = { ...edited };
    const newSelected = new Set(selected);
    preview.filter(q => q.has_conflict).forEach(q => {
      const patch = {};
      (q.conflict_details || []).forEach(cd => {
        if (cd.field === 'organization') patch.organization_name = cd.recommended_value;
        if (cd.field === 'branch')       patch.branch_name       = cd.recommended_value;
        if (cd.field === 'region')       patch.region_name       = cd.recommended_value;
        if (cd.field === 'holding')      patch.holding_name      = cd.recommended_value;
      });
      newEdited[q.department_id] = { ...(newEdited[q.department_id] || {}), ...patch };
      if (q.ready) newSelected.add(q.department_id);
    });
    setEdited(newEdited);
    setSelected(newSelected);
  };

  const handleCreate = async () => {
    if (!preview || selected.size === 0) return;
    const toCreate = preview
      .filter(p => selected.has(p.department_id))
      .map(p => {
        const ov = edited[p.department_id] || {};
        return {
          department_id:    p.department_id,
          department_name:  p.department_name,
          organization_name: ov.organization_name ?? p.suggested_org ?? "",
          branch_name:      ov.branch_name ?? p.suggested_branch ?? null,
          region_name:      ov.region_name  ?? p.suggested_region  ?? null,
          holding_name:     ov.holding_name ?? p.suggested_holding ?? null,
          organization_id:  p.suggested_org_id,
          region_id:        p.suggested_region_id,
          branch_id:        ov.branch_id ?? p.suggested_branch_id,
          holding_id:       p.suggested_holding_id,
        };
      });
    setCreating(true); setError(null);
    try {
      const res = await bulkCreateParents({ parents: toCreate });
      setResult(res);
      onCreated(res);
    } catch (e) { setError(e?.response?.data?.detail || "Помилка створення"); }
    finally { setCreating(false); }
  };

  const readyCount  = preview ? preview.filter(p => p.ready).length : 0;
  const conflictCnt = preview ? preview.filter(p => p.has_conflict).length : 0;
  const missingOrg  = preview ? preview.filter(p => !p.suggested_org).length : 0;

  const impS = {
    overlay:  { position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20 },
    box:      { background:"#fff",borderRadius:10,width:"100%",maxWidth:1100,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)" },
    hdr:      { padding:"16px 20px",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12 },
    body:     { flex:1,overflowY:"auto",padding:"14px 20px" },
    footer:   { padding:"12px 20px",borderTop:"1px solid #e5e7eb",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" },
  };

  return (
    <div style={impS.overlay} onClick={onClose}>
      <div style={impS.box} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={impS.hdr}>
          <div>
            <div style={{fontWeight:700,fontSize:16}}>Створити батьківські підрозділи</div>
            <div style={{fontSize:12,color:"#6b7280",marginTop:2}}>
              Унікальні parent IDs з відфільтрованих рядків, яких немає в dim_department.
              Організація/Філія визначена як найчастіша серед дочірніх підрозділів.
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#6b7280"}}>✕</button>
        </div>

        <div style={impS.body}>
          {/* Loading */}
          {loading && <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Пошук батьківських підрозділів…</div>}

          {/* Error */}
          {error && <div style={{color:"#dc2626",background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:6,padding:"8px 12px",marginBottom:12}}>{error}</div>}

          {/* Result */}
          {result && (
            <div style={{padding:"12px 16px",background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:8,marginBottom:14}}>
              <div style={{fontWeight:700,color:"#065f46",marginBottom:4}}>✓ Завершено</div>
              <div style={{fontSize:13}}>Створено: <strong>{result.created}</strong> · Пропущено (вже існують): <strong>{result.skipped}</strong>{result.errors?.length>0&&<span style={{color:"#dc2626"}}> · Помилок: {result.errors.length}</span>}</div>
              {result.errors?.length>0&&(
                <div style={{marginTop:8,fontSize:11,maxHeight:80,overflowY:"auto"}}>
                  {result.errors.map((e,i)=><div key={i} style={{color:"#dc2626"}}>{e.department_id}: {e.error}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          {!loading && preview && preview.length === 0 && (
            <div style={{textAlign:"center",padding:40,color:"#6b7280"}}>
              <div style={{fontSize:32,marginBottom:8}}>✅</div>
              <div style={{fontWeight:600}}>Немає відсутніх батьківських підрозділів</div>
              <div style={{fontSize:12,marginTop:4}}>Всі батьки вже існують у dim_department або немає рядків із parent_missing в поточному фільтрі.</div>
            </div>
          )}

          {!loading && preview && preview.length > 0 && (
            <>
              {/* Summary pills */}
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                <span style={{fontSize:11,padding:"2px 10px",borderRadius:10,background:"#eff6ff",color:"#1e40af",border:"1px solid #93c5fd"}}>Всього: {preview.length}</span>
                <span style={{fontSize:11,padding:"2px 10px",borderRadius:10,background:"#d1fae5",color:"#065f46",border:"1px solid #6ee7b7"}}>Готово: {readyCount}</span>
                {conflictCnt>0&&<span style={{fontSize:11,padding:"2px 10px",borderRadius:10,background:"#fef3c7",color:"#92400e",border:"1px solid #fcd34d"}}>⚠ Конфлікт: {conflictCnt}</span>}
                {missingOrg>0&&<span style={{fontSize:11,padding:"2px 10px",borderRadius:10,background:"#fee2e2",color:"#991b1b",border:"1px solid #fca5a5"}}>Немає Org: {missingOrg}</span>}
                {conflictCnt>0&&<button onClick={acceptAllRecommendations} style={{fontSize:11,padding:"2px 10px",borderRadius:10,background:"#f0fdf4",color:"#065f46",border:"1px solid #6ee7b7",cursor:"pointer"}}>✓ Прийняти всі рекомендації</button>}
                <button style={{fontSize:11,marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#6366f1",textDecoration:"underline"}} onClick={toggleAll}>
                  {preview.filter(p=>p.ready).every(p=>selected.has(p.department_id))?"Зняти всі":"Вибрати всі готові"}
                </button>
              </div>

              {conflictCnt>0&&(
                <div style={{padding:"8px 12px",background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:6,marginBottom:12,fontSize:12,color:"#78350f"}}>
                  <strong>⚠ Що означає «Конфлікт»:</strong> дочірні підрозділи цього parent мають різні організації / філії / регіони. Оберіть правильний варіант у кожному рядку або натисніть «Прийняти всі рекомендації» вгорі.
                </div>
              )}

              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:"#f9fafb",borderBottom:"2px solid #e5e7eb"}}>
                      <th style={{padding:"6px 8px",textAlign:"center",width:32}}></th>
                      <th style={{padding:"6px 8px",textAlign:"left",minWidth:120}}>ID</th>
                      <th style={{padding:"6px 8px",textAlign:"left",minWidth:180}}>Назва</th>
                      <th style={{padding:"6px 8px",textAlign:"left",minWidth:120}}>Організація</th>
                      <th style={{padding:"6px 8px",textAlign:"left",minWidth:100}}>Філія</th>
                      <th style={{padding:"6px 8px",textAlign:"left",minWidth:80}}>Регіон</th>
                      <th style={{padding:"6px 8px",textAlign:"right",width:70}}>Дочірніх</th>
                      <th style={{padding:"6px 8px",textAlign:"center",width:110}}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(p => {
                      const ov = edited[p.department_id] || {};
                      const isConflict = p.has_conflict;
                      const isReady = p.ready;
                      const resolved = isResolved(p);
                      const isSel = selected.has(p.department_id);
                      const isExp = expanded.has(p.department_id);
                      const canSelect = isReady && (!isConflict || resolved);
                      const rowBg = !isReady ? "#fff7ed" : (isConflict && !resolved) ? "#fffbeb" : isSel ? "#f0fdf4" : "#fff";
                      const conflictLabels = (p.conflict_details || []).map(cd => cd.label).join(', ');
                      const orgCd = (p.conflict_details || []).find(c => c.field === 'organization');
                      const brnCd = (p.conflict_details || []).find(c => c.field === 'branch');
                      return (
                        <React.Fragment key={p.department_id}>
                          <tr style={{borderBottom:isExp?"none":"1px solid #f3f4f6",background:rowBg}}>
                            <td style={{padding:"6px 8px",textAlign:"center"}}>
                              <input type="checkbox" checked={isSel} disabled={!canSelect}
                                onChange={()=>toggleRow(p.department_id)}/>
                            </td>
                            <td style={{padding:"6px 8px",fontFamily:"monospace",fontSize:10,color:"#374151"}} title={p.department_id}>
                              {p.department_id?.slice(0,18)}{p.department_id?.length>18?"…":""}
                            </td>
                            <td style={{padding:"6px 8px",fontWeight:500}}>{p.department_name||<span style={{color:"#ef4444",fontStyle:"italic"}}>відсутня</span>}</td>
                            <td style={{padding:"6px 8px"}}>
                              {p.org_variants>1 && orgCd ? (
                                <select value={ov.organization_name??p.suggested_org??""} style={{fontSize:11,padding:"2px 4px",width:"100%",borderColor:resolved?"#6ee7b7":"#f59e0b"}}
                                  onChange={e=>setField(p.department_id,"organization_name",e.target.value)}>
                                  <option value="">— оберіть —</option>
                                  {orgCd.variants.map(v=>(
                                    <option key={v.value} value={v.value}>
                                      {v.value} ({v.child_count}){v.value===orgCd.recommended_value?" ★ рекомендовано":""}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{color:p.suggested_org?"#374151":"#ef4444"}}>{p.suggested_org||"—"}</span>
                              )}
                            </td>
                            <td style={{padding:"6px 8px"}}>
                              {p.branch_variants>1 && brnCd ? (
                                <select value={ov.branch_name??p.suggested_branch??""} style={{fontSize:11,padding:"2px 4px",width:"100%",borderColor:resolved?"#6ee7b7":"#f59e0b"}}
                                  onChange={e=>setField(p.department_id,"branch_name",e.target.value)}>
                                  <option value="">— оберіть —</option>
                                  {brnCd.variants.map(v=>(
                                    <option key={v.value} value={v.value}>
                                      {v.value} ({v.child_count}){v.value===brnCd.recommended_value?" ★ рекомендовано":""}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{color:"#374151"}}>{p.suggested_branch||"—"}</span>
                              )}
                            </td>
                            <td style={{padding:"6px 8px",color:"#374151"}}>{p.suggested_region||"—"}</td>
                            <td style={{padding:"6px 8px",textAlign:"right"}}>
                              <span style={{fontWeight:600,color:"#1e40af"}}>{p.child_count}</span>
                              {p.example_children?.length>0&&(
                                <div style={{fontSize:9,color:"#6b7280",marginTop:2,textAlign:"left"}}>
                                  {p.example_children.slice(0,3).map((ch,i)=><div key={i} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>└ {ch}</div>)}
                                  {p.child_count>3&&<div style={{color:"#9ca3af"}}>+{p.child_count-3} ще</div>}
                                </div>
                              )}
                            </td>
                            <td style={{padding:"6px 8px",textAlign:"center"}}>
                              {!isReady ? (
                                <span title={!p.department_name?"Відсутня назва":"Відсутня організація"} style={{fontSize:10,color:"#ef4444",fontWeight:600}}>✕ {!p.department_name?"Назва":"Org"}</span>
                              ) : isConflict && !resolved ? (
                                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                  <div style={{fontSize:10,color:"#92400e",fontWeight:600}}>⚠ Конфлікт</div>
                                  <div style={{fontSize:9,color:"#b45309",maxWidth:90,textAlign:"center"}}>{conflictLabels}</div>
                                  <div style={{display:"flex",gap:3,marginTop:2,flexWrap:"wrap",justifyContent:"center"}}>
                                    <button onClick={()=>toggleExpand(p.department_id)} style={{fontSize:9,padding:"1px 5px",border:"1px solid #d97706",borderRadius:3,background:"#fef3c7",color:"#92400e",cursor:"pointer"}}>
                                      {isExp?"▲ Сховати":"▼ Деталі"}
                                    </button>
                                    <button onClick={()=>acceptRecommendations(p)} style={{fontSize:9,padding:"1px 5px",border:"1px solid #059669",borderRadius:3,background:"#d1fae5",color:"#065f46",cursor:"pointer"}}>
                                      ✓ Рекомендації
                                    </button>
                                  </div>
                                </div>
                              ) : isConflict && resolved ? (
                                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                  <span style={{fontSize:10,color:"#059669",fontWeight:600}}>✓ Вирішено</span>
                                  <button onClick={()=>toggleExpand(p.department_id)} style={{fontSize:9,padding:"1px 5px",border:"1px solid #6ee7b7",borderRadius:3,background:"#d1fae5",color:"#059669",cursor:"pointer"}}>
                                    {isExp?"▲ Сховати":"▼ Деталі"}
                                  </button>
                                </div>
                              ) : (
                                <span style={{fontSize:10,color:"#065f46",fontWeight:600}}>✓ Готово</span>
                              )}
                            </td>
                          </tr>
                          {isExp && isConflict && (
                            <tr style={{background:"#fffbeb",borderBottom:"1px solid #f3f4f6"}}>
                              <td colSpan={8} style={{padding:"8px 16px 10px"}}>
                                <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
                                  {(p.conflict_details||[]).map(cd=>(
                                    <div key={cd.field}>
                                      <div style={{fontSize:11,fontWeight:700,color:"#78350f",marginBottom:4}}>{cd.label}:</div>
                                      {cd.variants.map(v=>(
                                        <div key={v.value} style={{fontSize:11,color:"#374151",display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                                          <span style={{minWidth:100}}>{v.value}</span>
                                          <span style={{color:"#6b7280"}}>— {v.child_count} дочірніх</span>
                                          {v.value===cd.recommended_value&&(
                                            <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:"#d1fae5",color:"#065f46",border:"1px solid #6ee7b7",fontWeight:600}}>рекомендовано</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={impS.footer}>
          {!result && preview && preview.length > 0 && (
            <>
              <span style={{fontSize:12,color:"#6b7280"}}>Вибрано: <strong>{selected.size}</strong> з {preview.length}</span>
              <button
                onClick={handleCreate}
                disabled={creating||selected.size===0}
                style={{padding:"7px 18px",background:selected.size>0?"#065f46":"#d1d5db",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:13,cursor:selected.size>0?"pointer":"default"}}>
                {creating?"Створення…":`➕ Створити вибрані (${selected.size})`}
              </button>
            </>
          )}
          <button onClick={onClose} style={{marginLeft:"auto",padding:"6px 16px",background:"#f9fafb",border:"1px solid #d1d5db",borderRadius:6,cursor:"pointer",fontSize:13}}>
            {result?"Закрити":"Скасувати"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DepartmentSourceMappingPage({ initialSourceId = "", initialDeptUid = "", setActivePage }) {
  const [data,          setData]          = useState(null);
  const [masters,       setMasters]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [autoBinding,   setAutoBinding]   = useState(false);
  const [bindRow,       setBindRow]       = useState(null);
  const [createRow,     setCreateRow]     = useState(null);
  const [showBulkFill,  setShowBulkFill]  = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [error,         setError]         = useState(null);
  const [success,       setSuccess]       = useState(null);

  // Filters
  const [filterSource,  setFilterSource]  = useState(initialSourceId || "");
  // Pre-fill search from navigation (e.g. from planning coverage unmapped table)
  const _initSearch = initialDeptUid || "";
  const [filterOrg,     setFilterOrg]     = useState("");
  const [filterBranch,  setFilterBranch]  = useState("");
  const [filterRegion,  setFilterRegion]  = useState("");
  const [filterMaster,  setFilterMaster]  = useState("");
  const [filterStatus,          setFilterStatus]          = useState("pending");
  const [filterComputedStatus,  setFilterComputedStatus]  = useState("");
  const [filterHasParent,       setFilterHasParent]       = useState("");
  const [filterParentStatus,    setFilterParentStatus]    = useState("");
  const [filterParentId,        setFilterParentId]        = useState("");
  const [filterParentName,      setFilterParentName]      = useState("");
  const [filterSourceLevel,     setFilterSourceLevel]     = useState("");
  const [filterSourceType,      setFilterSourceType]      = useState("");
  const [filterSourceChanged,   setFilterSourceChanged]   = useState("");
  const [search,                setSearch]                = useState(_initSearch);
  const [searchInput,           setSearchInput]           = useState(_initSearch);
  const [parentIdInput,         setParentIdInput]         = useState("");
  const [parentNameInput,       setParentNameInput]       = useState("");
  const [filterRecommendation,  setFilterRecommendation]  = useState("");
  const [filterMode, setFilterMode] = useState(initialDeptUid ? "fact_unmapped" : "all");
  const [coverage, setCoverage]       = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showSimilarModal,      setShowSimilarModal]      = useState(false);
  const [similarRow,            setSimilarRow]            = useState(null);
  const [bulkBindingSugg,       setBulkBindingSugg]       = useState(false);
  const [showSmartPreview,      setShowSmartPreview]      = useState(false);
  const [showHelp,              setShowHelp]              = useState(false);
  const [showLegend,            setShowLegend]            = useState(false);
  const [showBulkCreateParents, setShowBulkCreateParents] = useState(false);
  const [showUidGroups,         setShowUidGroups]         = useState(false);
  const [autoMatchingUid,       setAutoMatchingUid]       = useState(false);
  const [autoMatchUidResult,    setAutoMatchUidResult]    = useState(null);
  const [showNameConflicts,     setShowNameConflicts]     = useState(false);
  const [conflictCountAll,      setConflictCountAll]      = useState(null);
  const [showAdvanced,          setShowAdvanced]          = useState(false);
  const [page,                  setPage]                  = useState(1);
  const PAGE_SIZE = 100;

  // ── Table settings ──────────────────────────────────────────────────────────
  const [showTableSettings, setShowTableSettings] = useState(false);
  const [visibleCols,       setVisibleCols]       = useState(_DEFAULT_VISIBLE);
  const [colOrder,          setColOrder]          = useState(_DEFAULT_ORDER);
  const [density,           setDensity]           = useState("normal");
  const [myPreset,          setMyPreset]          = useState(null);
  const _prefsLoaded = useRef(false);
  const _saveTimer   = useRef(null);

  // Load preferences on mount
  useEffect(() => {
    getTablePreferences(DEPT_TABLE_PAGE_KEY)
      .then(p => {
        if (p.found) {
          if (p.visible_columns?.length)
            setVisibleCols(new Set([..._REQUIRED_COLS, ...p.visible_columns]));
          if (p.column_order?.length)
            setColOrder(p.column_order);
          if (p.density)
            setDensity(p.density);
          if (p.my_preset)
            setMyPreset(p.my_preset);
        }
      })
      .catch(() => {})
      .finally(() => { _prefsLoaded.current = true; });
  }, []); // eslint-disable-line

  // Auto-save on change (debounced)
  useEffect(() => {
    if (!_prefsLoaded.current) return;
    if (_saveTimer.current) clearTimeout(_saveTimer.current);
    _saveTimer.current = setTimeout(() => {
      saveTablePreferences(DEPT_TABLE_PAGE_KEY, {
        visible_columns: [...visibleCols].filter(k => !_REQUIRED_COLS.has(k)),
        column_order:    colOrder,
        density,
        my_preset:       myPreset,
      }).catch(() => {});
    }, 800);
  }, [visibleCols, colOrder, density, myPreset]); // eslint-disable-line

  // Computed ordered visible columns
  const activeCols = useMemo(() =>
    colOrder
      .map(key => DEPT_TABLE_COLS.find(c => c.key === key))
      .filter(Boolean)
      .filter(col => visibleCols.has(col.key) || _REQUIRED_COLS.has(col.key)),
    [visibleCols, colOrder]
  );

  // Density-aware td style
  const tdStyle = useMemo(() => ({
    ...(density === "compact"     ? { padding: "1px 6px",  fontSize: 10, lineHeight: 1.3 }
      : density === "comfortable" ? { padding: "6px 10px", fontSize: 12, lineHeight: 1.5 }
      :                             { padding: "3px 8px",  fontSize: 11, lineHeight: 1.35 }),
    verticalAlign: "middle",
  }), [density]);

  const setMappingStatus = (val) => {
    setFilterStatus(val); setFilterComputedStatus(""); setPage(1);
  };
  const setComputedStatus = (val) => {
    setFilterComputedStatus(val); setFilterStatus(""); setPage(1);
  };

  const load = useCallback(() => {
    setLoading(true); setError(null);
    const params = { page, page_size: PAGE_SIZE };
    if (filterSource)          params.source_id              = filterSource;
    if (filterStatus)          params.mapping_status          = filterStatus;
    if (filterComputedStatus)  params.computed_status         = filterComputedStatus;
    if (filterOrg)             params.organization_name       = filterOrg;
    if (filterBranch)          params.branch_name             = filterBranch;
    if (filterRegion)          params.region_name             = filterRegion;
    if (filterMaster)          params.master_department_id    = filterMaster;
    if (search)                params.search                  = search;
    if (filterParentId)        params.parent_department_id    = filterParentId;
    if (filterParentName)      params.parent_department_name  = filterParentName;
    if (filterHasParent)       params.has_parent              = filterHasParent;
    if (filterParentStatus)    params.parent_status           = filterParentStatus;
    if (filterSourceLevel !== "") params.source_level         = Number(filterSourceLevel);
    if (filterSourceType)      params.source_node_type        = filterSourceType;
    if (filterSourceChanged === "yes") params.source_changed  = true;
    if (filterSourceChanged === "no")  params.source_changed  = false;
    if (filterRecommendation)          params.recommendation  = filterRecommendation;
    if (filterMode && filterMode !== 'all') params.mapping_mode = filterMode;

    getStagedDepartments(params)
      .then(setData)
      .catch(() => setError("Помилка завантаження"))
      .finally(() => setLoading(false));
  }, [page, filterSource, filterOrg, filterBranch, filterRegion, filterMaster,
      filterStatus, filterComputedStatus, search,
      filterParentId, filterParentName, filterHasParent, filterParentStatus,
      filterSourceLevel, filterSourceType, filterSourceChanged, filterRecommendation,
      filterMode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getMasterDepartments().then(setMasters).catch(() => {}); }, []);
  // Load conflict count for KPI pill
  useEffect(() => {
    getSameNameConflicts({ page: 1, page_size: 1 })
      .then(r => setConflictCountAll(r.conflict_count_all ?? 0))
      .catch(() => {});
  }, []); // eslint-disable-line
  // Load planning coverage on mount and when source filter changes
  useEffect(() => {
    setCoverageLoading(true);
    getDeptPlanningCoverage(filterSource ? Number(filterSource) : null)
      .then(setCoverage).catch(() => {}).finally(() => setCoverageLoading(false));
  }, [filterSource]); // eslint-disable-line

  const handleBind = async (source_id, source_department_id, master_department_id) => {
    await bindDepartment(source_id, source_department_id, master_department_id);
    setSuccess("Підрозділ прив'язано");
    load();
  };

  const handleCreateInsteadOfBind = (row) => {
    setBindRow(null);
    setCreateRow(row);
  };

  const handleReject = async (row) => {
    if (!window.confirm(`Відхилити "${row.source_department_name}"?`)) return;
    setError(null);
    try {
      await rejectDepartment(row.source_id, row.source_department_id);
      setSuccess("Підрозділ відхилено");
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка");
    }
  };

  const handleReset = async (row) => {
    if (!window.confirm(`Скинути прив'язку для "${row.source_department_name}"?`)) return;
    setError(null);
    try {
      await resetMapping(row.source_id, row.source_department_id);
      setSuccess("Прив'язку скинуто → pending");
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка скидання");
    }
  };

  const handleAutoBind = async () => {
    setAutoBinding(true); setError(null); setSuccess(null);
    try {
      const res = await autoBindDepartments(filterSource ? Number(filterSource) : null);
      setSuccess(`Авто-прив'язка: ${res.auto_bound} підрозділів прив'язано за точним збігом department_id.`);
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка авто-прив'язки");
    } finally { setAutoBinding(false); }
  };

  const handleBulkBindSuggested = () => {
    setShowSmartPreview(true);
  };

  const handleSmartAutoConfirm = async () => {
    setShowSmartPreview(false);
    setBulkBindingSugg(true); setError(null); setSuccess(null);
    try {
      const res = await bulkBindSuggested({ source_id: filterSource ? Number(filterSource) : null });
      setSuccess(`Smart прив'язка: ${res.bound} прив'язано, ${res.skipped} пропущено.`);
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка Smart прив'язки");
    } finally { setBulkBindingSugg(false); }
  };

  const handleCreateFromSource = async (body) => {
    setError(null);
    try {
      const res = await createMasterFromSource(body);
      setSuccess(`Створено master-підрозділ «${res.department_name}» [${res.department_id}] і прив'язано`);
      setCreateRow(null);
      load();
      getMasterDepartments().then(setMasters).catch(() => {});
    } catch (e) {
      setError(e?.response?.data?.detail || "Помилка створення master-підрозділу");
      throw e;
    }
  };

  const handleBulkFillSuccess = (res) => {
    setShowBulkFill(false);
    setSuccess(`Оновлено: ${res.updated_masters} master-підрозділів, ${res.updated_staging} pending записів.`);
    load();
  };

  const handleBulkCreateSuccess = (res) => {
    setShowBulkCreate(false);
    setSuccess(`Створено: ${res.created}, прив'язано: ${res.bound}, пропущено: ${res.skipped}.`);
    load();
    getMasterDepartments().then(setMasters).catch(() => {});
  };

  // Debounced search — fires 400ms after user stops typing
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
        setPage(1);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => { setPage(1); setSearch(searchInput); };

  const sources       = data?.sources       || [];
  const organizations = data?.organizations || [];
  const branches      = data?.branches      || [];
  const regions       = data?.regions       || [];

  const brandFilters = {
    filterSource, filterOrg, filterBranch, filterRegion,
    filterMaster, filterStatus, filterComputedStatus, search,
    filterParentId, filterParentName, filterHasParent, filterParentStatus,
    filterSourceLevel, filterSourceType, filterSourceChanged,
  };

  // Counts filters in the collapsed Advanced section
  const advancedActiveCount = [
    filterSourceType,
    filterHasParent,
    filterParentStatus,
    filterParentId,
    filterParentName,
    filterSourceLevel !== "",
    filterSourceChanged,
    filterRecommendation,
  ].filter(Boolean).length;

  // ── Cascading filter values (derived from current loaded rows) ───────────────
  // When a filter is active, narrow sibling filters to values present in result set.
  // Falls back to full server-side list when no sibling filter is active.
  const _rows = data?.rows || [];

  // Current filter params for passing to BulkCreateParentsModal
  const currentFilterParams = {
    ...(filterSource ? { source_id: Number(filterSource) } : {}),
    ...(filterStatus && filterStatus !== 'all' ? { mapping_status: filterStatus } : {}),
    ...(filterOrg    ? { organization_name: filterOrg }    : {}),
    ...(filterBranch ? { branch_name: filterBranch }       : {}),
    ...(filterRegion ? { region_name: filterRegion }       : {}),
    ...(filterMaster ? { master_department_id: filterMaster } : {}),
    ...(search       ? { search }                          : {}),
    ...(filterMode && filterMode !== 'all' ? { mapping_mode: filterMode } : {}),
    ...(filterHasParent ? { has_parent: filterHasParent }  : {}),
    ...(filterParentStatus ? { parent_status: filterParentStatus } : {}),
  };
  const availableOrgs = (filterBranch || filterRegion)
    ? [...new Set(_rows.map(r => r.effective_organization_name || r.organization_name).filter(Boolean))].sort()
    : organizations;
  const availableBranches = (filterOrg || filterRegion)
    ? [...new Set(_rows.map(r => r.effective_branch || r.branch_name).filter(Boolean))].sort()
    : branches;
  const availableRegions = (filterOrg || filterBranch)
    ? [...new Set(_rows.map(r => r.effective_region || r.region_name).filter(Boolean))].sort()
    : regions;
  const availableParentIds   = [...new Set(_rows.map(r => r.effective_parent_id).filter(Boolean))].sort();
  const availableParentNames = [...new Set(_rows.map(r => r.effective_parent_name).filter(Boolean))].sort();

  // Helper: row background by mapping status
  const rowBg = (st) =>
    st === "rejected" ? "#fef2f2" : st === "mapped" ? "#f0fdf4" : st === "auto" ? "#eff6ff" : "#fff";

  // Compact icon-button style for actions column
  const iconBtn = (variant) => {
    const v = {
      blue:  { bg: "#eff6ff", br: "#93c5fd", cl: "#1e40af" },
      green: { bg: "#f0fdf4", br: "#6ee7b7", cl: "#065f46" },
      amber: { bg: "#fffbeb", br: "#fcd34d", cl: "#92400e" },
      red:   { bg: "#fef2f2", br: "#fca5a5", cl: "#dc2626" },
      gray:  { bg: "#f9fafb", br: "#d1d5db", cl: "#6b7280" },
    }[variant] || { bg: "#f9fafb", br: "#d1d5db", cl: "#6b7280" };
    return {
      width: 26, height: 26, padding: 0, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700,
      border: `1px solid ${v.br}`, background: v.bg, color: v.cl,
      borderRadius: 4, cursor: "pointer",
    };
  };

  // Sticky right column styles
  const thAct = {
    ...thS, position: "sticky", right: 0, zIndex: 3,
    background: "#f9fafb", boxShadow: "-2px 0 5px rgba(0,0,0,0.07)",
  };

  return (
    <div style={{ padding: "12px 20px", maxWidth: 1600 }}>

      {/* ── Coverage block ── */}
      {(coverage || coverageLoading) && (
        <div style={{ marginBottom: 12, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Coverage для Planning</div>
            <button style={{ background: "none", border: "none", fontSize: 12, cursor: "pointer", color: "#6366f1" }}
              onClick={() => setShowExplainer(v => !v)}>
              {showExplainer ? "▲ Сховати" : "▼ Як працює mapping"}
            </button>
          </div>
          {coverageLoading ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Завантаження…</div>
          ) : coverage && (
            <>
              {/* Progress bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>Покриття підрозділів: {coverage.coverage_pct ?? 0}%</span>
                  <span style={{ color: "var(--text-muted)" }}>{(coverage.mapped_departments ?? 0).toLocaleString("uk-UA")} / {(coverage.unique_fact_departments ?? 0).toLocaleString("uk-UA")} dept</span>
                </div>
                <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(coverage.coverage_pct ?? 0, 100)}%`,
                    background: (coverage.coverage_pct ?? 0) >= 90 ? "#10b981" : (coverage.coverage_pct ?? 0) >= 60 ? "#f59e0b" : "#ef4444",
                    borderRadius: 4, transition: "width 0.3s" }} />
                </div>
              </div>
              {/* KPI grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 8 }}>
                {[
                  { label: "Fact rows",           val: (coverage.total_fact_rows ?? 0).toLocaleString("uk-UA"),                             color: "#374151" },
                  { label: "Unique dept у fact",  val: (coverage.unique_fact_departments ?? 0).toLocaleString("uk-UA"),                     color: "#374151" },
                  { label: "Mapped dept",          val: (coverage.mapped_departments ?? 0).toLocaleString("uk-UA"),                          color: "#065f46" },
                  { label: "Unmapped dept",        val: (coverage.unmapped_departments ?? 0).toLocaleString("uk-UA"),                        color: (coverage.unmapped_departments ?? 0) > 0 ? "#b91c1c" : "#374151" },
                  { label: "Sales VAT mapped",     val: (coverage.mapped_sales_vat ?? 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 }), color: "#065f46" },
                  { label: "Sales VAT unmapped",   val: (coverage.unmapped_sales_vat ?? 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 }), color: (coverage.unmapped_sales_vat ?? 0) > 0 ? "#b91c1c" : "#374151" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ padding: "6px 10px", background: "var(--gray-50)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color }}>{val}</div>
                  </div>
                ))}
              </div>
              {/* Explanation */}
              {coverage.explanation && (
                <div style={{ fontSize: 12, padding: "6px 10px", borderRadius: 5,
                  background: (coverage.coverage_pct ?? 0) >= 90 ? "#d1fae5" : (coverage.coverage_pct ?? 0) >= 60 ? "#fef3c7" : "#fee2e2",
                  color: (coverage.coverage_pct ?? 0) >= 90 ? "#065f46" : (coverage.coverage_pct ?? 0) >= 60 ? "#92400e" : "#991b1b",
                  border: "1px solid currentColor" }}>
                  {coverage.explanation}
                </div>
              )}
            </>
          )}
          {/* Mapping explainer panel — tabbed */}
          {showExplainer && <MappingExplainerPanel />}
        </div>
      )}

      {/* Modals */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {showTableSettings && (
        <TableSettingsModal
          visibleCols={visibleCols}
          colOrder={colOrder}
          density={density}
          myPreset={myPreset}
          onApply={({ visibleCols: vc, colOrder: co, density: dn }) => {
            setVisibleCols(vc); setColOrder(co); setDensity(dn);
          }}
          onSaveMyPreset={(preset) => setMyPreset(preset)}
          onClose={() => setShowTableSettings(false)}
        />
      )}
      {showBulkCreateParents && (
        <BulkCreateParentsModal
          filterParams={currentFilterParams}
          onClose={() => setShowBulkCreateParents(false)}
          onCreated={(res) => { setShowBulkCreateParents(false); load(); }}
        />
      )}
      {showUidGroups && (
        <UidGroupsModal
          masters={masters}
          onClose={() => setShowUidGroups(false)}
          onBound={() => load()}
        />
      )}
      {showNameConflicts && (
        <SameNameConflictsModal
          masters={masters}
          onClose={() => { setShowNameConflicts(false); load(); }}
          onRemapped={() => {
            getSameNameConflicts({ page: 1, page_size: 1 })
              .then(r => setConflictCountAll(r.conflict_count_all ?? 0))
              .catch(() => {});
          }}
        />
      )}
      {showSmartPreview && (
        <SmartAutoPreviewModal
          sourceId={filterSource ? Number(filterSource) : null}
          onConfirm={handleSmartAutoConfirm}
          onClose={() => setShowSmartPreview(false)}
        />
      )}
      {showSimilarModal && similarRow && (
        <SimilarDepartmentsModal
          row={similarRow}
          onBind={async (sid, sdid, mid) => {
            await handleBind(sid, sdid, mid);
            setShowSimilarModal(false); setSimilarRow(null);
          }}
          onClose={() => { setShowSimilarModal(false); setSimilarRow(null); }}
        />
      )}
      {bindRow && (
        <BindModal row={bindRow} masters={masters} onBind={handleBind}
          onClose={() => setBindRow(null)} onCreateInstead={handleCreateInsteadOfBind} />
      )}
      {createRow && (
        <CreateModal row={createRow} onCreate={handleCreateFromSource}
          onClose={() => setCreateRow(null)} />
      )}
      {showBulkFill && (
        <BulkFillModal filters={brandFilters} onClose={() => setShowBulkFill(false)}
          onSuccess={handleBulkFillSuccess} />
      )}
      {showBulkCreate && (
        <BulkCreateModal filters={brandFilters} onClose={() => setShowBulkCreate(false)}
          onSuccess={handleBulkCreateSuccess} />
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {setActivePage && (
            <button
              onClick={() => setActivePage("importSources", { tab: "sources" })}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280",
                       fontSize: 12, padding: "0 0 4px 0", display: "flex", alignItems: "center", gap: 4 }}>
              ← До відповідності полів
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Відповідність підрозділів</h2>
          <p style={{ margin: 0, color: "#9ca3af", fontSize: 11 }}>
            dim_department_source → department_source_mapping → dim_department
          </p>
          {filterSource && data?.sources && (() => {
            const src = data.sources.find(s => String(s.id) === String(filterSource));
            return src ? (
              <div style={{ marginTop: 2, fontSize: 11, color: "#1d4ed8", fontWeight: 600 }}>
                Джерело: {src.name}
              </div>
            ) : null;
          })()}
        </div>
        {/* Bulk actions */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleAutoBind} disabled={autoBinding}
            title="Авто-прив'язка за точним збігом department_id. Не зачіпає вже прив'язані рядки."
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#eff6ff", border: "1px solid #3b82f6",
                     borderRadius: 5, cursor: "pointer", color: "#1e40af" }}>
            {autoBinding ? "…" : "⚡ Авто (id)"}
          </button>
          <button onClick={handleBulkBindSuggested} disabled={bulkBindingSugg}
            title="Smart прив'язка AUTO_BIND рядків (score>=95, без ризикових дублікатів)"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#f5f3ff", border: "1px solid #a78bfa",
                     borderRadius: 5, cursor: "pointer", color: "#5b21b6" }}>
            {bulkBindingSugg ? "…" : "🎯 Smart AUTO"}
          </button>
          <button onClick={() => setShowBulkCreateParents(true)}
            title="Масово створити батьківські підрозділи для рядків із статусом 'Немає parent'"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#fff7ed", border: "1px solid #fb923c",
                     borderRadius: 5, cursor: "pointer", color: "#c2410c" }}>
            🌳 Parent масово
          </button>
          <button onClick={() => setShowUidGroups(true)}
            title="Знайти source-підрозділи з однаковим UID у різних джерелах і прив'язати їх до одного master"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#faf5ff", border: "1px solid #c084fc",
                     borderRadius: 5, cursor: "pointer", color: "#7e22ce" }}>
            🔗 Однаковий UID
          </button>
          <button
            onClick={async () => {
              setAutoMatchingUid(true);
              setAutoMatchUidResult(null);
              try {
                const res = await autoMatchByUid();
                setAutoMatchUidResult(res.auto_matched);
                loadData();
              } catch { setAutoMatchUidResult(-1); }
              finally { setAutoMatchingUid(false); }
            }}
            disabled={autoMatchingUid}
            title="Автоматично прив'язати pending-рядки (у т.ч. source_id=9) через normalized UID — якщо вже є mapped рядок з тим самим UID в іншому джерелі"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#f0f9ff", border: "1px solid #7dd3fc",
                     borderRadius: 5, cursor: autoMatchingUid ? "default" : "pointer",
                     color: "#0c4a6e", opacity: autoMatchingUid ? 0.6 : 1 }}>
            {autoMatchingUid ? "…" : "⚡ Auto-match UID"}
            {autoMatchUidResult !== null && autoMatchUidResult >= 0 &&
              <span style={{ marginLeft: 6, color: autoMatchUidResult > 0 ? "#16a34a" : "#64748b" }}>
                ({autoMatchUidResult})
              </span>}
            {autoMatchUidResult === -1 && <span style={{ marginLeft: 6, color: "#dc2626" }}>!</span>}
          </button>
          <button onClick={() => setShowBulkFill(true)}
            title="Масово заповнити поле для відфільтрованих pending-рядків"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#f0fdf4", border: "1px solid #6ee7b7",
                     borderRadius: 5, cursor: "pointer", color: "#065f46" }}>
            🔗 Заповнити
          </button>
          <button onClick={() => setShowBulkCreate(true)}
            title="Масово створити master-підрозділи для готових pending-рядків"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#fefce8", border: "1px solid #fde047",
                     borderRadius: 5, cursor: "pointer", color: "#713f12" }}>
            ➕ Створити master
          </button>
          <button onClick={() => setShowNameConflicts(true)}
            title="Знайти підрозділи з однаковою назвою але різними master — SAME_NAME_DIFFERENT_MASTER"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: conflictCountAll > 0 ? "#fef2f2" : "#f9fafb",
                     border: `1px solid ${conflictCountAll > 0 ? "#fca5a5" : "#d1d5db"}`,
                     borderRadius: 5, cursor: "pointer",
                     color: conflictCountAll > 0 ? "#991b1b" : "#374151" }}>
            ⚠ Конфлікт назв{conflictCountAll > 0 ? ` (${conflictCountAll})` : ""}
          </button>
          <button onClick={() => setShowHelp(true)}
            title="Довідка — як читати рекомендації"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#f9fafb", border: "1px solid #d1d5db",
                     borderRadius: 5, cursor: "pointer", color: "#374151" }}>
            ? Довідка
          </button>
          <button onClick={() => setShowTableSettings(true)}
            title="Налаштування видимості та порядку колонок"
            style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600,
                     background: "#f0f9ff", border: "1px solid #bae6fd",
                     borderRadius: 5, cursor: "pointer", color: "#0369a1" }}>
            ⚙ Таблиця
          </button>
          <button onClick={load} disabled={loading} title="Оновити таблицю"
            style={{ padding: "5px 10px", fontSize: 13, background: "#f9fafb",
                     border: "1px solid #d1d5db", borderRadius: 5, cursor: "pointer", color: "#6b7280" }}>
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between",
                                                marginBottom: 8, fontSize: 13 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#c33", fontSize: 16 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="success-message" style={{ display: "flex", justifyContent: "space-between",
                                                   marginBottom: 8, fontSize: 13 }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── Active mode description ── */}
      {filterMode !== "all" && (
        <div style={{ marginBottom: 8, padding: "6px 12px", borderRadius: 6, fontSize: 12,
                      background: filterMode === "fact_unmapped" ? "#fffbeb" : filterMode === "all_unmapped" ? "#fee2e2" : "#eff6ff",
                      border: filterMode === "fact_unmapped" ? "1px solid #fcd34d" : filterMode === "all_unmapped" ? "1px solid #fca5a5" : "1px solid #93c5fd",
                      color: filterMode === "fact_unmapped" ? "#92400e" : filterMode === "all_unmapped" ? "#991b1b" : "#1e40af" }}>
          {{
            fact_only:     "Підрозділи з fact_turnover — саме ці дані використовуються у Planning для розрахунку плану",
            fact_unmapped: "Підрозділи без маппінгу, які є у fact_turnover — вони блокують region/branch/org фільтри у правилах Planning",
            all_unmapped:  "Всі підрозділи без маппінгу, включно з тими, що не мають даних у fact_turnover — не всі впливають на Planning",
          }[filterMode]}
        </div>
      )}

      {/* ── KPI pills ── */}
      {data && (
        <div style={{ marginBottom: 10 }}>
          {/* Section: Lifecycle Status */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase",
                           letterSpacing: "0.05em", marginRight: 2, alignSelf: "center" }}>Lifecycle</span>
            <KpiPill label="Всього"     value={data.total}           color="#374151"
              active={!filterStatus && !filterComputedStatus}
              onClick={() => { setFilterStatus(""); setFilterComputedStatus(""); setPage(1); }}
              title="Показати всі записи" />
            <KpiPill label="Очікує"     value={data.pending}         color="#92400e"
              active={filterStatus === "pending"}
              onClick={() => setMappingStatus("pending")}
              title="Очікують маппінгу" />
            <KpiPill label="Прив'язано" value={data.mapped}          color="#065f46"
              active={filterStatus === "mapped"}
              onClick={() => setMappingStatus("mapped")}
              title="Вручну прив'язані" />
            <KpiPill label="Авто"       value={data.auto_bound ?? 0} color="#1e40af"
              active={filterStatus === "auto"}
              onClick={() => setMappingStatus("auto")}
              title="Авто-прив'язані за ID" />
            <KpiPill label="Відхилено"  value={data.rejected}        color="#991b1b"
              active={filterStatus === "rejected"}
              onClick={() => setMappingStatus("rejected")}
              title="Відхилені" />
            <span style={{ color: "#e5e7eb", margin: "0 2px" }}>·</span>
            <KpiPill label="→ Створити"     value={data.ready_to_create ?? 0}   color="#059669"
              active={filterComputedStatus === "ready_to_create"}
              onClick={() => setComputedStatus("ready_to_create")}
              title="Готові до створення master" />
            <KpiPill label="⚠ Немає parent" value={data.parent_missing ?? 0}    color="#d97706"
              active={filterComputedStatus === "parent_missing"}
              onClick={() => setComputedStatus("parent_missing")}
              title="Parent відсутній в dim_department" />
            <KpiPill label="⊘ Дублікат ID" value={data.duplicate_warning ?? 0} color="#c2410c"
              active={filterComputedStatus === "duplicate_warning"}
              onClick={() => setComputedStatus("duplicate_warning")}
              title="Dept ID вже існує в dim_department" />
            {(data.changed_source ?? 0) > 0 && (
              <KpiPill label="↻ Змінено" value={data.changed_source} color="#d97706"
                active={filterSourceChanged === "yes"}
                onClick={() => { setFilterSourceChanged(filterSourceChanged === "yes" ? "" : "yes"); setPage(1); }}
                title="Source-дані змінились в останньому імпорті" />
            )}
          </div>
          {/* Section: Recommendation Engine */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center",
                        padding: "5px 8px", background: "#f5f3ff", borderRadius: 6,
                        border: "1px solid #ede9fe" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#7c3aed", textTransform: "uppercase",
                           letterSpacing: "0.05em", marginRight: 2, alignSelf: "center" }}>Engine</span>
            {Object.entries(RECOMMENDATION_CFG).map(([key, cfg]) => {
              const count = (data.rows || []).filter(r => r.recommendation === key).length;
              if (count === 0 && filterRecommendation !== key) return null;
              return (
                <KpiPill key={key}
                  label={cfg.label} value={count} color={cfg.color}
                  active={filterRecommendation === key}
                  onClick={() => { setFilterRecommendation(filterRecommendation === key ? "" : key); setPage(1); }}
                  title={`${cfg.hint}\n(поточна сторінка)`}
                />
              );
            })}
            {data.total > 0 && (
              <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>
                {data.rows?.length ?? 0} на сторінці
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Main filters (always visible) ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={lblS}>Джерело</div>
          <select value={filterSource} onChange={e => { setFilterSource(e.target.value); setPage(1); }}
            style={{ ...selS, minWidth: 140 }}>
            <option value="">Всі джерела</option>
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <div style={lblS}>
            Організація
            {filterBranch || filterRegion ? <span style={{ color: "#6366f1", marginLeft: 3 }}>⇄</span> : null}
          </div>
          <select value={filterOrg} onChange={e => { setFilterOrg(e.target.value); setPage(1); }}
            style={{ ...selS, minWidth: 130 }}>
            <option value="">Всі орг.</option>
            {availableOrgs.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <div style={lblS}>
            Філія
            {filterOrg || filterRegion ? <span style={{ color: "#6366f1", marginLeft: 3 }}>⇄</span> : null}
          </div>
          <select value={filterBranch} onChange={e => { setFilterBranch(e.target.value); setPage(1); }}
            style={{ ...selS, minWidth: 110 }}>
            <option value="">Всі філії</option>
            {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <div style={lblS}>
            Регіон
            {filterOrg || filterBranch ? <span style={{ color: "#6366f1", marginLeft: 3 }}>⇄</span> : null}
          </div>
          <select value={filterRegion} onChange={e => { setFilterRegion(e.target.value); setPage(1); }}
            style={{ ...selS, minWidth: 110 }}>
            <option value="">Всі регіони</option>
            {availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
{/* Mapping mode selector */}
        {(() => {
          const modes = [
            { key: "all",          label: "Всі source підрозділи",                              count: data?.total_source_rows ?? data?.total, color: "#374151", bg: "#f9fafb", border: "#d1d5db" },
            { key: "fact_only",    label: "Використовуються у продажах",                        count: data?.fact_rows,                        color: "#1e40af", bg: "#eff6ff", border: "#3b82f6" },
            { key: "fact_unmapped",label: "Не замаплені та використовуються у продажах",        count: data?.fact_unmapped_rows,               color: "#92400e", bg: "#fffbeb", border: "#f59e0b" },
            { key: "all_unmapped", label: "Не замаплені взагалі (всі джерела)",                 count: data?.unmapped_rows,                    color: "#991b1b", bg: "#fee2e2", border: "#fca5a5" },
          ];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>Режим</div>
              <div style={{ display: "flex", gap: 3 }}>
                {modes.map(m => {
                  const act = filterMode === m.key;
                  return (
                    <button key={m.key} onClick={() => { setFilterMode(m.key); setPage(1); }}
                      style={{ padding: "4px 9px", fontSize: 11, fontWeight: act ? 700 : 500, cursor: "pointer",
                               border: `1px solid ${act ? m.border : "#d1d5db"}`, borderRadius: 5,
                               background: act ? m.bg : "#f9fafb", color: act ? m.color : "#6b7280",
                               whiteSpace: "nowrap" }}>
                      {m.label}{m.count != null ? ` (${m.count.toLocaleString("uk-UA")})` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {/* Search */}
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
          <div>
            <div style={lblS}>Пошук</div>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Назва або ID..."
              style={{ ...inpS, width: 180 }} />
          </div>
          <button onClick={handleSearch}
            style={{ ...selS, padding: "4px 9px", alignSelf: "flex-end" }}>🔍</button>
          {search && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              style={{ ...selS, padding: "4px 8px", color: "#6b7280", alignSelf: "flex-end" }}>✕</button>
          )}
        </div>
        {/* Advanced toggle */}
        <button onClick={() => setShowAdvanced(v => !v)}
          style={{
            padding: "4px 12px", fontSize: 12, cursor: "pointer", alignSelf: "flex-end",
            border: `1px solid ${showAdvanced || advancedActiveCount > 0 ? "#6366f1" : "#d1d5db"}`,
            borderRadius: 5,
            background: showAdvanced ? "#eef2ff" : advancedActiveCount > 0 ? "#f0f0ff" : "#f9fafb",
            color: showAdvanced || advancedActiveCount > 0 ? "#4338ca" : "#374151",
            fontWeight: advancedActiveCount > 0 ? 600 : 400,
          }}>
          {showAdvanced ? "▴ Менше фільтрів" : "▾ Розширені фільтри"}
          {advancedActiveCount > 0 && (
            <span style={{ marginLeft: 5, background: "#6366f1", color: "#fff",
                           borderRadius: 10, padding: "0 6px", fontSize: 10 }}>
              {advancedActiveCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Advanced filters (collapsible) ── */}
      {showAdvanced && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-end",
          padding: "10px 14px", background: "#f9fafb",
          border: "1px solid #e5e7eb", borderRadius: 6,
        }}>
          {/* Hierarchy */}
          <div>
            <div style={lblS}>Ієрархія структури</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {[
                { val: "",            label: "Всі",                  bg: "#fff",    color: "#374151" },
                { val: "root",        label: "Root підрозділ",       bg: "#f3f4f6", color: "#6b7280" },
                { val: "root_parent", label: "Батьківський вузол",   bg: "#dbeafe", color: "#1e40af" },
                { val: "leaf",        label: "Кінцевий підрозділ",   bg: "#d1fae5", color: "#065f46" },
                { val: "parent_child",label: "Має дочірні",          bg: "#ede9fe", color: "#7c3aed" },
              ].map(opt => (
                <button key={opt.val} onClick={() => { setFilterSourceType(opt.val); setPage(1); }}
                  style={{ padding: "3px 9px", fontSize: 11, borderRadius: 4, cursor: "pointer",
                           border: `1px solid ${filterSourceType === opt.val ? opt.color : "#d1d5db"}`,
                           background: filterSourceType === opt.val ? opt.bg : "#fff",
                           color: filterSourceType === opt.val ? opt.color : "#374151",
                           fontWeight: filterSourceType === opt.val ? 700 : 400 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Parent presence */}
          <div>
            <div style={{ ...lblS, display: "flex", alignItems: "center", gap: 4 }}>
              <span>Батьківський підрозділ</span>
              <span title="Батьківський підрозділ використовується для побудови ієрархії структури компанії."
                style={{ width: 14, height: 14, borderRadius: "50%", border: "1px solid #9ca3af",
                         fontSize: 9, cursor: "help", display: "inline-flex", alignItems: "center",
                         justifyContent: "center", color: "#9ca3af", fontWeight: 700, flexShrink: 0 }}>?</span>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {[
                { val: "",        label: "Всі",                          color: "#374151", bg: "#fff"    },
                { val: "with",    label: "Є батьківський підрозділ",     color: "#1e40af", bg: "#dbeafe" },
                { val: "without", label: "Немає батьківського підрозділу", color: "#92400e", bg: "#fef3c7" },
              ].map(opt => (
                <button key={opt.val} onClick={() => { setFilterHasParent(opt.val); setPage(1); }}
                  style={{ padding: "3px 9px", fontSize: 11, borderRadius: 4, cursor: "pointer",
                           border: `1px solid ${filterHasParent === opt.val ? opt.color : "#d1d5db"}`,
                           background: filterHasParent === opt.val ? opt.bg : "#fff",
                           color: filterHasParent === opt.val ? opt.color : "#374151",
                           fontWeight: filterHasParent === opt.val ? 700 : 400 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Parent status */}
          <div>
            <div style={lblS}>Статус parent</div>
            <select value={filterParentStatus} onChange={e => { setFilterParentStatus(e.target.value); setPage(1); }}
              style={{ ...selS, minWidth: 130 }}>
              <option value="">Всі</option>
              <option value="found">Знайдено</option>
              <option value="missing">Відсутній</option>
            </select>
          </div>

          {/* Parent ID — selectable from loaded rows */}
          <div>
            <div style={lblS}>Parent ID</div>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <select value={filterParentId}
                onChange={e => { setFilterParentId(e.target.value); setParentIdInput(e.target.value); setPage(1); }}
                style={{ ...selS, minWidth: 148 }}>
                <option value="">Всі parent ID</option>
                {availableParentIds.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
              {filterParentId && (
                <button onClick={() => { setFilterParentId(""); setParentIdInput(""); setPage(1); }}
                  style={{ ...selS, padding: "4px 7px", color: "#6b7280" }}>✕</button>
              )}
            </div>
          </div>

          {/* Parent назва — selectable from loaded rows */}
          <div>
            <div style={lblS}>Parent назва</div>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <select value={filterParentName}
                onChange={e => { setFilterParentName(e.target.value); setParentNameInput(e.target.value); setPage(1); }}
                style={{ ...selS, minWidth: 170 }}>
                <option value="">Всі parent назви</option>
                {availableParentNames.map(n => <option key={n} value={n} title={n}>{n.length > 28 ? n.slice(0, 28) + "…" : n}</option>)}
              </select>
              {filterParentName && (
                <button onClick={() => { setFilterParentName(""); setParentNameInput(""); setPage(1); }}
                  style={{ ...selS, padding: "4px 7px", color: "#6b7280" }}>✕</button>
              )}
            </div>
          </div>

          {/* Source рівень — chip buttons */}
          <div>
            <div style={lblS}>Source рівень</div>
            <div style={{ display: "flex", gap: 3 }}>
              {[{ val: "", label: "Всі" }, { val: "0", label: "L0 Root" }, { val: "1", label: "L1 Child" }].map(opt => (
                <button key={opt.val} onClick={() => { setFilterSourceLevel(opt.val); setPage(1); }}
                  style={{ padding: "3px 9px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                           border: "1px solid #d1d5db",
                           background: filterSourceLevel === opt.val ? "#374151" : "#fff",
                           color:      filterSourceLevel === opt.val ? "#fff"    : "#374151",
                           fontWeight: filterSourceLevel === opt.val ? 700       : 400 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source змінено */}
          <div>
            <div style={lblS}>Source змінено</div>
            <div style={{ display: "flex", gap: 3 }}>
              {[
                { val: "",    label: "Всі" },
                { val: "yes", label: "Змінено",    bg: "#fef3c7", color: "#92400e" },
                { val: "no",  label: "Без змін",   bg: "#f3f4f6", color: "#374151" },
              ].map(opt => (
                <button key={opt.val} onClick={() => { setFilterSourceChanged(opt.val); setPage(1); }}
                  style={{ padding: "3px 9px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                           border: `1px solid ${filterSourceChanged === opt.val ? (opt.color || "#374151") : "#d1d5db"}`,
                           background: filterSourceChanged === opt.val ? (opt.bg || "#374151") : "#fff",
                           color:      filterSourceChanged === opt.val ? (opt.color || "#fff")  : "#374151",
                           fontWeight: filterSourceChanged === opt.val ? 700 : 400 }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recommendation filter */}
          <div>
            <div style={lblS}>Рекомендація</div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              <button onClick={() => { setFilterRecommendation(""); setPage(1); }}
                style={{ padding: "3px 9px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                         border: "1px solid #d1d5db",
                         background: !filterRecommendation ? "#374151" : "#fff",
                         color:      !filterRecommendation ? "#fff"    : "#374151",
                         fontWeight: !filterRecommendation ? 700 : 400 }}>Всі</button>
              {Object.entries(RECOMMENDATION_CFG).map(([key, cfg]) => (
                <button key={key} onClick={() => { setFilterRecommendation(filterRecommendation === key ? "" : key); setPage(1); }}
                  style={{ padding: "3px 9px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                           border: `1px solid ${filterRecommendation === key ? cfg.color : "#d1d5db"}`,
                           background: filterRecommendation === key ? cfg.bg  : "#fff",
                           color:      filterRecommendation === key ? cfg.color : "#374151",
                           fontWeight: filterRecommendation === key ? 700 : 400 }}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear advanced */}
          {advancedActiveCount > 0 && (
            <button onClick={() => {
              setFilterSourceType(""); setFilterHasParent("");
              setFilterParentStatus(""); setFilterParentId(""); setParentIdInput("");
              setFilterParentName(""); setParentNameInput(""); setFilterSourceLevel("");
              setFilterSourceChanged(""); setFilterRecommendation(""); setPage(1);
            }} style={{ ...selS, alignSelf: "flex-end", color: "#6366f1", borderColor: "#a5b4fc" }}>
              Очистити розширені ({advancedActiveCount})
            </button>
          )}
        </div>
      )}

      {/* ── Filter summary bar ── */}
      {(() => {
        const chips = [];
        if (filterMode !== "all") chips.push({ label: "Dataset", value: filterMode === "fact_only" ? "У продажах" : filterMode === "fact_unmapped" ? "Незамаплені·продажі" : "Незамаплені·всі", onClear: () => { setFilterMode("all"); setPage(1); } });
        if (filterStatus)       chips.push({ label: "Статус",  value: { pending: "Очікує", mapped: "Прив'язано", auto: "Авто", rejected: "Відхилено" }[filterStatus] || filterStatus, onClear: () => { setFilterStatus(""); setPage(1); } });
        if (filterComputedStatus) chips.push({ label: "Статус", value: { ready_to_create: "Можна створити", parent_missing: "Немає parent", duplicate_warning: "Дублікат ID" }[filterComputedStatus] || filterComputedStatus, onClear: () => { setFilterComputedStatus(""); setPage(1); } });
        if (filterSourceType)   chips.push({ label: "Ієрархія", value: { root: "Root підрозділ", root_parent: "Батьківський вузол", leaf: "Кінцевий підрозділ", parent_child: "Має дочірні" }[filterSourceType] || filterSourceType, onClear: () => { setFilterSourceType(""); setPage(1); } });
        if (filterHasParent)    chips.push({ label: "Parent", value: filterHasParent === "with" ? "Є батьківський" : "Немає батьківського",  onClear: () => { setFilterHasParent(""); setPage(1); } });
        if (filterOrg)          chips.push({ label: "Орг",    value: filterOrg,    onClear: () => { setFilterOrg(""); setPage(1); } });
        if (filterBranch)       chips.push({ label: "Філія",  value: filterBranch, onClear: () => { setFilterBranch(""); setPage(1); } });
        if (filterRegion)       chips.push({ label: "Регіон", value: filterRegion, onClear: () => { setFilterRegion(""); setPage(1); } });
        if (search)             chips.push({ label: "Пошук",  value: search,       onClear: () => { setSearch(""); setSearchInput(""); setPage(1); } });
        if (filterSourceChanged) chips.push({ label: "Змінено", value: filterSourceChanged === "yes" ? "Так" : "Ні", onClear: () => { setFilterSourceChanged(""); setPage(1); } });
        if (filterRecommendation) chips.push({ label: "Рек-ція", value: RECOMMENDATION_CFG[filterRecommendation]?.label || filterRecommendation, onClear: () => { setFilterRecommendation(""); setPage(1); } });
        if (!chips.length) return null;
        return (
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>Фільтри:</span>
            {chips.map((chip, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3,
                                     padding: "2px 8px", background: "#eff6ff", border: "1px solid #93c5fd",
                                     borderRadius: 12, fontSize: 11, color: "#1e40af" }}>
                <span style={{ color: "#9ca3af", fontSize: 10 }}>{chip.label}:</span>
                <span>{chip.value}</span>
                <button onClick={chip.onClear}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280",
                           fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
            <button onClick={() => {
              setFilterStatus(""); setFilterComputedStatus(""); setFilterMode("all");
              setFilterHasParent(""); setFilterSourceType(""); setFilterOrg("");
              setFilterBranch(""); setFilterRegion(""); setSearch(""); setSearchInput("");
              setFilterParentStatus(""); setFilterParentId(""); setParentIdInput("");
              setFilterParentName(""); setParentNameInput(""); setFilterSourceLevel("");
              setFilterSourceChanged(""); setFilterRecommendation(""); setPage(1);
            }} style={{ fontSize: 10, color: "#dc2626", background: "none", border: "none",
                        cursor: "pointer", textDecoration: "underline" }}>
              Очистити всі
            </button>
          </div>
        );
      })()}

      {/* ── Table ── */}
      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
          <thead>
            <tr>
              {activeCols.map(col => {
                if (col.key === "actions")
                  return <th key={col.key} style={{ ...thAct, textAlign:"center", minWidth:120 }}>{col.label}</th>;
                if (col.key === "separated")
                  return <th key={col.key} style={{ ...thS, color:"#0369a1" }}>{col.label}</th>;
                if (col.key === "suggested")
                  return <th key={col.key} style={{ ...thS, color:"#7c3aed" }}>{col.label}</th>;
                if (col.key === "match")
                  return <th key={col.key} style={{ ...thS, color:"#059669" }}>{col.label}</th>;
                return <th key={col.key} style={thS}>{col.label}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {loading && [...Array(8)].map((_, i) => (
              <tr key={`skel-${i}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                {activeCols.map((col, j) => (
                  <td key={col.key} style={{ padding: "8px 8px" }}>
                    <div style={{
                      height: 12, borderRadius: 3, background: "#e5e7eb",
                      width: `${60 + (j * 17) % 40}%`,
                      opacity: 0.4 + (i % 3) * 0.15,
                    }} />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && (!data?.rows || data.rows.length === 0) && (
              <tr><td colSpan={activeCols.length} style={{ padding: "32px 20px" }}>
                {(() => {
                  const isSuccess = filterMode === "fact_unmapped" || filterMode === "all_unmapped";
                  const hasFilters = !!(filterStatus || filterComputedStatus || filterSourceType || filterHasParent || filterOrg || filterBranch || filterRegion || search);
                  if (isSuccess && !hasFilters) {
                    const msgs = { fact_unmapped: { icon: "✅", title: "Усі підрозділи у продажах вже замаплені" }, all_unmapped: { icon: "✅", title: "Всі підрозділи вже замаплені" } };
                    const m = msgs[filterMode];
                    return (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>{m.icon}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{m.title}</div>
                      </div>
                    );
                  }
                  const activeFilters = [
                    filterStatus && `Статус: ${{ pending: "Очікує", mapped: "Прив'язано", auto: "Авто", rejected: "Відхилено" }[filterStatus] || filterStatus}`,
                    filterComputedStatus && `Статус: ${{ ready_to_create: "Можна створити", parent_missing: "Немає parent", duplicate_warning: "Дублікат ID" }[filterComputedStatus]}`,
                    filterSourceType && `Ієрархія: ${{ root: "Root підрозділ", root_parent: "Батьківський вузол", leaf: "Кінцевий підрозділ", parent_child: "Має дочірні" }[filterSourceType]}`,
                    filterHasParent && `Parent: ${filterHasParent === "with" ? "Є батьківський" : "Немає батьківського"}`,
                    filterOrg && `Орг: ${filterOrg}`,
                    filterBranch && `Філія: ${filterBranch}`,
                    search && `Пошук: "${search}"`,
                  ].filter(Boolean);
                  return (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Немає записів за поточними фільтрами</div>
                      {activeFilters.length > 0 && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                          {activeFilters.join(" · ")}
                        </div>
                      )}
                      <button onClick={() => {
                        setFilterStatus(""); setFilterComputedStatus(""); setFilterMode("all");
                        setFilterHasParent(""); setFilterSourceType(""); setFilterOrg("");
                        setFilterBranch(""); setFilterRegion(""); setSearch(""); setSearchInput("");
                        setFilterParentStatus(""); setFilterParentId(""); setParentIdInput("");
                        setFilterParentName(""); setParentNameInput(""); setFilterSourceLevel("");
                        setFilterSourceChanged(""); setFilterRecommendation(""); setPage(1);
                      }} style={{ padding: "6px 16px", background: "#374151", color: "#fff",
                                  border: "none", borderRadius: 5, cursor: "pointer", fontSize: 12 }}>
                        Очистити всі фільтри
                      </button>
                    </div>
                  );
                })()}
              </td></tr>
            )}
            {!loading && data?.rows?.map(row => {
              const st  = row.mapping_status;
              const rbg = rowBg(st);

              const renderCell = (key) => {
                switch (key) {
                  case "source_id": return (
                    <td key={key} style={tdStyle}>
                      <span style={{ fontSize: 10, color: "#9ca3af", display: "block" }}>
                        {row.source_name || row.source_id}
                        {row.seen_count > 1 && (
                          <span title={`Зустрічалось у ${row.seen_count} батчах`}
                            style={{ marginLeft: 4, color: "#6b7280" }}>×{row.seen_count}</span>
                        )}
                      </span>
                      <code style={{ fontSize: 10, background: "#f3f4f6", padding: "1px 4px",
                                     borderRadius: 3, color: "#374151", whiteSpace: "nowrap" }}>
                        {row.source_department_id}
                      </code>
                      {row.last_batch_id && (
                        <span style={{ fontSize: 9, color: "#c4b5fd", display: "block" }}>
                          batch #{row.last_batch_id}
                        </span>
                      )}
                    </td>
                  );
                  case "name": {
                    const sepName  = row.source_separated_department_name;
                    const parName  = row.effective_parent_name;
                    const pathParts = [sepName, parName].filter(Boolean);
                    const pathTip   = pathParts.length > 0 ? pathParts.join(" › ") + " ›" : null;
                    const overrideTip = row.effective_department_name !== row.source_department_name
                      ? `Source: ${row.source_department_name}\nEff: ${row.effective_department_name}` : null;
                    return (
                      <td key={key} style={{ ...tdStyle, maxWidth: 200 }} title={overrideTip || pathTip || undefined}>
                        <span style={{ fontWeight: 500, display: "block", whiteSpace: "nowrap",
                                       overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.effective_department_name || row.source_department_name || "—"}
                        </span>
                        {pathTip && (
                          <span style={{ fontSize: 9, color: "#9ca3af", display: "block", whiteSpace: "nowrap",
                                         overflow: "hidden", textOverflow: "ellipsis" }}>{pathTip}</span>
                        )}
                        {row.effective_department_name && row.effective_department_name !== row.source_department_name && (
                          <span style={{ fontSize: 9, color: "#059669" }}>✎ override</span>
                        )}
                        {row.source_changed && (
                          <span title={Array.isArray(row.changed_fields) && row.changed_fields.length > 0
                              ? `Змінено поля: ${row.changed_fields.join(", ")}` : "Дані змінились в останньому імпорті"}
                            style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                                     background: "#fef3c7", color: "#92400e", display: "inline-block",
                                     cursor: "help", marginTop: 1 }}>↻ змінено</span>
                        )}
                      </td>
                    );
                  }
                  case "type_level": return (
                    <td key={key} style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <NodeTypeBadge nodeType={row.source_node_type} level={row.source_level} />
                    </td>
                  );
                  case "parent": return (
                    <td key={key} style={tdStyle}>
                      {row.effective_parent_id ? (
                        <span title={row.effective_parent_name ? `${row.effective_parent_id} — ${row.effective_parent_name}` : row.effective_parent_id}>
                          <code style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap",
                                         background: row.parent_missing ? "#fef3c7" : "#f3f4f6",
                                         color:      row.parent_missing ? "#92400e" : "#374151" }}>
                            {row.effective_parent_id}
                          </code>
                          {row.parent_missing && <span style={{ fontSize: 9, color: "#d97706", marginLeft: 3, fontWeight: 600 }}>⚠</span>}
                        </span>
                      ) : <span style={{ fontSize: 10, color: "#d1d5db" }}>—</span>}
                    </td>
                  );
                  case "separated": return (
                    <td key={key} style={tdStyle}>
                      {row.source_separated_department_id ? (
                        <span title={row.source_separated_department_name
                          ? `${row.source_separated_department_id} — ${row.source_separated_department_name}`
                          : row.source_separated_department_id}>
                          <code style={{ fontSize: 10, background: "#e0f2fe", padding: "1px 4px",
                                         borderRadius: 3, color: "#0369a1", whiteSpace: "nowrap" }}>
                            {row.source_separated_department_id}
                          </code>
                          {row.source_separated_department_name && (
                            <div style={{ fontSize: 10, color: "#0369a1", marginTop: 1, opacity: 0.75,
                                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
                              {row.source_separated_department_name}
                            </div>
                          )}
                        </span>
                      ) : <span style={{ fontSize: 10, color: "#d1d5db" }}>—</span>}
                    </td>
                  );
                  case "org": return (
                    <td key={key} style={{ ...tdStyle, maxWidth: 170 }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 11, color: "#374151" }}
                           title={[row.effective_organization_name, row.effective_branch, row.effective_region].filter(Boolean).join(" · ")}>
                        {row.effective_organization_name || row.organization_name || "—"}
                      </div>
                      {(() => {
                        const br = row.effective_branch || row.branch_name || "";
                        const rg = row.effective_region || row.region_name || "";
                        if (!br && !rg) return null;
                        return (
                          <div style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {br}{br && rg && <span style={{ color: "#d1d5db" }}> / </span>}{rg}
                          </div>
                        );
                      })()}
                    </td>
                  );
                  case "extra_fields": return (
                    <td key={key} style={{ ...tdStyle, maxWidth: 150 }}>
                      <ExtraFieldsChips fields={row.extra_fields} />
                    </td>
                  );
                  case "suggested": return (
                    <td key={key} style={{ ...tdStyle, maxWidth: 200 }}>
                      {row.suggested_master_department_id ? (
                        <div>
                          <span style={{ fontWeight: 600, color: "#7c3aed", display: "block",
                                         whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }}
                                title={row.suggested_master_department_name}>
                            {row.suggested_master_department_name || row.suggested_master_department_id}
                          </span>
                          <code style={{ fontSize: 10, color: "#9ca3af" }}>[{row.suggested_master_department_id}]</code>
                          {row.suggested_master_parent_id && (
                            <div style={{ fontSize: 9, color: "#c4b5fd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                 title={row.suggested_master_parent_id}>↳ {row.suggested_master_parent_id}</div>
                          )}
                          {(row.suggested_master_org || row.suggested_master_region) && (
                            <div style={{ fontSize: 9, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {[row.suggested_master_org, row.suggested_master_region].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                      ) : <span style={{ fontSize: 10, color: "#d1d5db" }}>Не знайдено</span>}
                    </td>
                  );
                  case "match": return (
                    <td key={key} style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <MatchBar score={row.match_score} confidence={row.confidence_level}
                                matchedFields={row.matched_fields} mismatchedFields={row.mismatched_fields} />
                    </td>
                  );
                  case "recommendation": return (
                    <td key={key} style={tdStyle}>
                      <RecommendationBadge recommendation={row.recommendation}
                        reason={row.recommendation_reason} risky={row.risky_duplicate} />
                    </td>
                  );
                  case "status": return (
                    <td key={key} style={tdStyle}>
                      <StatusBadge status={st} computedStatus={row.computed_status} reason={row.status_reason} />
                    </td>
                  );
                  case "master": return (
                    <td key={key} style={{ ...tdStyle, maxWidth: 200 }}>
                      {row.exists_in_master ? (
                        <span title={`${row.master_department_id}${row.master_org ? ` · ${row.master_org}` : ""}`}>
                          <span style={{ fontWeight: 600, color: "#1e40af", display: "block",
                                         whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {row.master_department_name || row.master_department_id}
                          </span>
                          <span style={{ fontSize: 10, color: "#9ca3af" }}>
                            [{row.master_department_id}]
                            {row.confidence < 100 && <span style={{ color: "#f59e0b", marginLeft: 4 }}>~{Math.round(row.confidence)}%</span>}
                          </span>
                        </span>
                      ) : row.ready_to_create ? (
                        <span style={{ fontSize: 11, color: "#059669" }} title={`Буде створено: ${row.effective_department_name}`}>
                          ✦ {row.effective_department_name}
                        </span>
                      ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>}
                    </td>
                  );
                  case "master_type": return (
                    <td key={key} style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {row.master_node_type
                        ? <NodeTypeBadge nodeType={row.master_node_type} level={row.master_level} />
                        : <span style={{ color: "#e5e7eb" }}>—</span>}
                    </td>
                  );
                  case "master_parent": return (
                    <td key={key} style={tdStyle}>
                      {row.master_parent_id ? (
                        <code style={{ fontSize: 10, background: "#ede9fe", color: "#7c3aed",
                                       padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap" }}
                              title={row.master_parent_name || undefined}>
                          {row.master_parent_id}
                        </code>
                      ) : <span style={{ color: "#e5e7eb", fontSize: 10 }}>—</span>}
                    </td>
                  );
                  case "actions": return (
                    <td key={key} style={{
                      ...tdStyle, textAlign: "center",
                      position: "sticky", right: 0, zIndex: 1,
                      background: rbg, boxShadow: "-2px 0 5px rgba(0,0,0,0.05)",
                    }}>
                      <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                        {row.recommendation === "AUTO_BIND" && !row.exists_in_master && row.suggested_master_department_id && (
                          <button onClick={() => handleBind(row.source_id, row.source_department_id, row.suggested_master_department_id)}
                            title={`⚡ Авто-прив'язка → ${row.suggested_master_department_id}`}
                            style={{ ...iconBtn("green"), width: "auto", padding: "0 6px", fontSize: 10, fontWeight: 700 }}>⚡</button>
                        )}
                        {row.recommendation === "REVIEW" && !row.exists_in_master && (
                          <button onClick={() => { setSimilarRow(row); setShowSimilarModal(true); }}
                            title="Схожі master-підрозділи"
                            style={{ ...iconBtn("amber"), width: "auto", padding: "0 6px", fontSize: 10 }}>🔍</button>
                        )}
                        {st !== "rejected" && (
                          <button onClick={() => setBindRow(row)}
                            title={row.exists_in_master ? "Змінити прив'язку" : "Прив'язати до master-підрозділу"}
                            style={iconBtn("blue")}>🔗</button>
                        )}
                        {(row.ready_to_create || (row.parent_missing && !row.exists_in_master)) && (
                          <button onClick={() => setCreateRow(row)}
                            title={row.parent_missing ? "⚠ Створити підрозділ (parent відсутній)" : "Створити master-підрозділ"}
                            style={iconBtn(row.parent_missing ? "amber" : "green")}>➕</button>
                        )}
                        {(st === "mapped" || st === "auto") && (
                          <button onClick={() => handleReset(row)} title="Скинути прив'язку → pending"
                            style={iconBtn("amber")}>↺</button>
                        )}
                        {st !== "rejected" && (
                          <button onClick={() => handleReject(row)} title="Відхилити підрозділ"
                            style={iconBtn("red")}>✕</button>
                        )}
                        {st === "rejected" && (
                          <button onClick={() => handleReset(row)} title="Повернути до pending"
                            style={iconBtn("blue")}>↩</button>
                        )}
                      </div>
                    </td>
                  );
                  default: return null;
                }
              };

              return (
                <tr key={`${row.source_id}-${row.source_department_id}`}
                  style={{ borderBottom: "1px solid #f3f4f6", background: rbg }}>
                  {activeCols.map(col => renderCell(col.key))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.total > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", fontSize: 12 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: 11 }}>
            ← Назад
          </button>
          <span style={{ color: "#6b7280" }}>
            Стор. {page} / {Math.ceil(data.total / PAGE_SIZE)} · показано {data.rows?.length} з {data.total}
          </span>
          <button onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
            className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: 11 }}>
            Далі →
          </button>
        </div>
      )}
    </div>
  );
}
