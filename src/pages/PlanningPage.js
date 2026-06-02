import React, { useState, useEffect, useCallback, useRef } from "react";
import "../styles/planning.css";
import {
  getScenarios, createScenario,
  getVersions, createVersion, lockVersion,
  getRules, createRule, updateRule, deleteRule, copyRule,
  createEffect, updateEffect, deleteEffect,
  getFactPlan, generateFirstDraft, getGenerationLog,
  getPlanDeptOptions, getPlanPGOptions, getDimOptions,
  getDeptMappingCoverage, getPlanningReadiness, getPlansOverview, deleteVersion, quickMapDepartment,
} from "../api/planningApi";
import { getMasterDepartments, duplicateCheckDept, autoMatchByUid } from "../api/departmentSourceMappingApi";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt    = (n, dec=2) => n==null?"—":Number(n).toLocaleString("uk-UA",{minimumFractionDigits:dec,maximumFractionDigits:dec});
const fmtN   = (n, dec=3) => n==null?"—":Number(n).toLocaleString("uk-UA",{minimumFractionDigits:dec,maximumFractionDigits:dec});
const fmtPct = (n) => n==null?"—":`${n>0?"+":""}${Number(n).toFixed(1)}%`;
const fmtDt  = (s) => { if(!s)return"—"; try{return new Date(s).toLocaleString("uk-UA",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return s} };
const diffCls    = (v) => v==null?"":v>0?"diff-pos":v<0?"diff-neg":"diff-zero";
const diffKpiCls = (v) => v==null?"":v>0?"kpi-diff-pos":v<0?"kpi-diff-neg":"kpi-diff-zero";

// ── Constants ─────────────────────────────────────────────────────────────────
const RULE_TYPE_LABEL = { revenue_effect_pct:"Виручка", price_effect_pct:"Ціна", volume_effect_pct:"Об'єм" };
const RULE_TYPE_CLS   = { revenue_effect_pct:"rule-type-revenue", price_effect_pct:"rule-type-price", volume_effect_pct:"rule-type-volume" };
const DIM_TYPE_LABEL  = {
  all:"Всі рядки", holding:"Холдинг", organization:"Організація",
  region:"Регіон", branch:"Філія", parent_department:"Батьк. підр.",
  department:"Підрозділ", department_uid:"Підр. UID",
  product_group:"Товарна група", product_group_uid:"ТГ UID",
  brand:"Бренд", brand_uid:"Бренд UID", source_id:"Джерело ID",
};
const DIM_AUTOCOMPLETE = new Set(["holding","organization","region","branch","parent_department","department","product_group","brand"]);
const SCENARIO_TYPE_COLOR = {
  draft:{bg:"#f3f4f6",color:"#6b7280"}, budget:{bg:"#dbeafe",color:"#1e40af"},
  forecast:{bg:"#d1fae5",color:"#065f46"}, optimistic:{bg:"#dcfce7",color:"#166534"},
  conservative:{bg:"#fee2e2",color:"#991b1b"},
};
const STATUS_COLOR = { completed:{bg:"#d1fae5",color:"#065f46"}, failed:{bg:"#fee2e2",color:"#991b1b"}, running:{bg:"#dbeafe",color:"#1e40af"} };
const PAGE_SIZE = 100;
const EMPTY_EFFECT = { period_from:"", period_to:"", rule_type:"revenue_effect_pct", effect_percent:0, priority:100, is_active:true };

// ── Sub-components ────────────────────────────────────────────────────────────

function SearchableDropdown({ selected, onSelect, fetchOptions, renderOption, placeholder="Пошук..." }) {
  const [query,setQuery]=useState(""); const [options,setOptions]=useState([]); const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false);
  const debRef=useRef(null); const wrap=useRef(null);
  useEffect(()=>{ const h=(e)=>{if(wrap.current&&!wrap.current.contains(e.target))setOpen(false)}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);
  const doFetch=useCallback((q)=>{setBusy(true);fetchOptions(q).then(setOptions).catch(()=>setOptions([])).finally(()=>setBusy(false))},[fetchOptions]); // eslint-disable-line
  if(selected){return(<div className="ss-selected"><span className="ss-selected-label" title={selected.label}>{selected.label}</span>{selected.sub&&<span className="ss-selected-sub">{selected.sub}</span>}<button className="ss-clear-btn" onClick={e=>{e.stopPropagation();onSelect(null);setQuery("");setOptions([]);setOpen(false)}}>×</button></div>);}
  return(<div className="ss-wrap" ref={wrap}><input className="ss-input" value={query} onChange={e=>{const q=e.target.value;setQuery(q);setOpen(true);clearTimeout(debRef.current);debRef.current=setTimeout(()=>doFetch(q),400)}} onFocus={()=>{setOpen(true);if(!options.length)doFetch(query)}} placeholder={placeholder}/>{open&&(<div className="ss-dropdown">{busy?<div className="ss-empty">Завантаження…</div>:options.length===0?<div className="ss-empty">{query?"Не знайдено":"Почніть вводити"}</div>:options.map((opt,i)=>{const{label,sub,value}=renderOption(opt);return(<div key={value||i} className="ss-option" onClick={()=>{onSelect(opt);setQuery("");setOpen(false)}}><div className="ss-option-label">{label}</div>{sub&&<div className="ss-option-sub">{sub}</div>}</div>);})}</div>)}</div>);
}

function ScopeValueInput({ dimType, value, label, onValueChange }) {
  const fetchFn=useCallback((q)=>getDimOptions(dimType,q),[dimType]); // eslint-disable-line
  if(DIM_AUTOCOMPLETE.has(dimType)){return(<div style={{flex:1,minWidth:0}}><SearchableDropdown selected={value?{label:label||value}:null} onSelect={opt=>onValueChange(opt?opt.value:"",opt?opt.label:"")} fetchOptions={fetchFn} renderOption={opt=>({value:opt.value,label:opt.label})} placeholder="Пошук..."/></div>);}
  return(<input type="text" style={{flex:1,minWidth:0}} value={value} onChange={e=>onValueChange(e.target.value,e.target.value)} placeholder={dimType==="source_id"?"ID (число)...":"Введіть UID..."}/>);
}

function Pagination({ page, totalPages, total, pageRows, onPage }) {
  if(!totalPages||totalPages<=1)return null;
  const pages=[];
  for(let i=1;i<=totalPages;i++){if(i===1||i===totalPages||Math.abs(i-page)<=2)pages.push(i);else if(pages[pages.length-1]!=="…")pages.push("…");}
  return(<div className="pagination"><button className="pg-btn" onClick={()=>onPage(page-1)} disabled={page<=1}>←</button>{pages.map((p,i)=>p==="…"?<span key={`e${i}`} className="pg-ellipsis">…</span>:<button key={p} className={`pg-btn${page===p?" pg-active":""}`} onClick={()=>onPage(p)}>{p}</button>)}<button className="pg-btn" onClick={()=>onPage(page+1)} disabled={page>=totalPages}>→</button><span className="pg-info">{pageRows} з {(total??0).toLocaleString("uk-UA")} · Стор. {page}/{totalPages}</span></div>);
}

function RuleTypeBadge({type}){return<span className={`mapping-badge ${RULE_TYPE_CLS[type]||""}`}>{RULE_TYPE_LABEL[type]||type}</span>;}
function ScenarioTypeBadge({type}){const c=SCENARIO_TYPE_COLOR[type]||SCENARIO_TYPE_COLOR.draft;return<span style={{...c,fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:10,whiteSpace:"nowrap"}}>{type}</span>;}
function StatusBadge({status}){const c=STATUS_COLOR[status]||{bg:"#f3f4f6",color:"#6b7280"};return<span style={{...c,fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:10}}>{status}</span>;}

function ScopeChips({scopes}){
  if(!scopes||scopes.length===0)return<span className="scope-chip-all">всі рядки</span>;
  return(<div className="scope-chips">{scopes.map((s,i)=>(<span key={i} className="scope-chip" title={`${DIM_TYPE_LABEL[s.dimension_type]||s.dimension_type}: ${s.dimension_label||s.dimension_value}`}><span className="scope-chip-type">{DIM_TYPE_LABEL[s.dimension_type]||s.dimension_type}</span><span className="scope-chip-val">{s.dimension_label||s.dimension_value||"—"}</span></span>))}</div>);
}

function PeriodChip({from,to}){
  if(!from&&!to)return<span className="diff-zero">будь-який</span>;
  return<span className="period-chip">{from?.slice(0,7)} → {to?.slice(0,7)||"∞"}</span>;
}

function PlanKpiGroup({label,fact,plan,diff,diffPct,fmtFn=fmt}){
  return(<div className="plan-kpi-group"><div className="plan-kpi-group-title">{label}</div><div className="plan-kpi-row"><div className="plan-kpi-cell kpi-fact"><div className="plan-kpi-cell-label">Факт</div><div className="plan-kpi-cell-value">{fmtFn(fact)}</div></div><div className="plan-kpi-cell kpi-plan"><div className="plan-kpi-cell-label">План</div><div className="plan-kpi-cell-value">{fmtFn(plan)}</div></div><div className={`plan-kpi-cell ${diffKpiCls(diff)}`}><div className="plan-kpi-cell-label">Δ</div><div className="plan-kpi-cell-value">{diff!=null?(diff>0?"+":"")+fmtFn(diff):"—"}</div></div><div className={`plan-kpi-cell ${diffKpiCls(diffPct)}`}><div className="plan-kpi-cell-label">Δ%</div><div className="plan-kpi-cell-value">{fmtPct(diffPct)}</div></div></div></div>);
}

// ── EffectsTable — inline effects schedule for a rule ─────────────────────────
function EffectsTable({ effects, ruleId, locked, onEffectsChange }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm,  setEditForm]  = useState({});
  const [addForm,   setAddForm]   = useState({ ...EMPTY_EFFECT });
  const [showAdd,   setShowAdd]   = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState(null);

  const handleAddEffect = async () => {
    // Client-side validation before API call
    if (!addForm.rule_type)  { setErr("Оберіть тип ефекту"); return; }
    const ep = Number(addForm.effect_percent);
    if (addForm.effect_percent === "" || isNaN(ep)) { setErr("Вкажіть ефект %"); return; }
    if (!addForm.period_from) { setErr("Вкажіть дату 'Від'"); return; }
    if (!addForm.period_to)   { setErr("Вкажіть дату 'По'"); return; }
    if (addForm.period_from > addForm.period_to) { setErr("'Від' має бути ≤ 'По'"); return; }

    setBusy(true); setErr(null);
    try {
      const created = await createEffect(ruleId, {
        rule_type:      addForm.rule_type,
        effect_percent: ep,
        period_from:    addForm.period_from,
        period_to:      addForm.period_to,
        priority:       Number(addForm.priority) || 100,
        is_active:      addForm.is_active,
      });
      onEffectsChange([...effects, created]);
      setShowAdd(false); setAddForm({ ...EMPTY_EFFECT });
    } catch(e) { setErr(e?.response?.data?.detail||"Помилка"); }
    finally { setBusy(false); }
  };

  const handleSaveEffect = async (effectId) => {
    setBusy(true); setErr(null);
    try {
      const updated = await updateEffect(effectId, {
        ...editForm,
        period_from: editForm.period_from || null,
        period_to:   editForm.period_to   || null,
        clear_period: !editForm.period_from && !editForm.period_to,
        effect_percent: Number(editForm.effect_percent),
        priority: Number(editForm.priority),
      });
      onEffectsChange(effects.map(e => e.effect_id === effectId ? updated : e));
      setEditingId(null);
    } catch(e) { setErr(e?.response?.data?.detail||"Помилка збереження"); }
    finally { setBusy(false); }
  };

  const handleDeleteEffect = async (effectId) => {
    if (!window.confirm("Видалити ефект?")) return;
    try { await deleteEffect(effectId); onEffectsChange(effects.filter(e => e.effect_id !== effectId)); }
    catch { alert("Помилка видалення"); }
  };

  const handleToggleEffect = async (eff) => {
    try {
      const updated = await updateEffect(eff.effect_id, { is_active: !eff.is_active });
      onEffectsChange(effects.map(e => e.effect_id === eff.effect_id ? updated : e));
    } catch { alert("Помилка"); }
  };

  const startEdit = (eff) => {
    setEditingId(eff.effect_id);
    setEditForm({
      period_from: eff.period_from ? eff.period_from.slice(0,10) : "",
      period_to:   eff.period_to   ? eff.period_to.slice(0,10)   : "",
      rule_type: eff.rule_type, effect_percent: eff.effect_percent, priority: eff.priority,
    });
    setErr(null);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <table className="data-table compact" style={{ fontSize: 11 }}>
        <thead>
          <tr>
            <th>Тип ефекту</th><th>Ефект, %</th><th>Прит.</th>
            <th>Від</th><th>По</th>
            <th style={{textAlign:"center",width:56}}>Акт.</th>
            {!locked && <th style={{width:80}}></th>}
          </tr>
        </thead>
        <tbody>
          {effects.length === 0 && (
            <tr><td colSpan={locked?6:7} style={{color:"var(--text-muted)",fontStyle:"italic",textAlign:"center",padding:"8px 0"}}>Немає ефектів. Додайте хоча б один.</td></tr>
          )}
          {effects.map(eff => {
            if (editingId === eff.effect_id) {
              return (
                <tr key={eff.effect_id} style={{ background: "#fff8f0" }}>
                  <td><select value={editForm.rule_type} onChange={e=>setEditForm(f=>({...f,rule_type:e.target.value}))} style={{fontSize:11,padding:"1px 4px"}}>
                    {Object.entries(RULE_TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select></td>
                  <td><input type="number" step="0.1" value={editForm.effect_percent} onChange={e=>setEditForm(f=>({...f,effect_percent:e.target.value}))} style={{width:60,fontSize:11,padding:"1px 4px"}}/></td>
                  <td><input type="number" step="1" min="0" value={editForm.priority} onChange={e=>setEditForm(f=>({...f,priority:e.target.value}))} style={{width:50,fontSize:11,padding:"1px 4px"}}/></td>
                  <td><input type="date" value={editForm.period_from} onChange={e=>setEditForm(f=>({...f,period_from:e.target.value}))} style={{fontSize:11,padding:"1px 4px"}}/></td>
                  <td><input type="date" value={editForm.period_to}   onChange={e=>setEditForm(f=>({...f,period_to:e.target.value}))}   style={{fontSize:11,padding:"1px 4px"}}/></td>
                  <td style={{textAlign:"center"}}><input type="checkbox" checked={editForm.is_active!==false} onChange={e=>setEditForm(f=>({...f,is_active:e.target.checked}))}/></td>
                  <td style={{whiteSpace:"nowrap"}}>
                    <button className="btn btn-primary btn-sm" onClick={()=>handleSaveEffect(eff.effect_id)} disabled={busy} style={{padding:"1px 7px",fontSize:10,marginRight:3}}>✓</button>
                    <button className="btn btn-secondary btn-sm" onClick={()=>setEditingId(null)} style={{padding:"1px 7px",fontSize:10}}>✕</button>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={eff.effect_id} style={{opacity:eff.is_active?1:0.45}}>
                <td><RuleTypeBadge type={eff.rule_type}/></td>
                <td className={`amount-cell ${eff.effect_percent>0?"diff-pos":eff.effect_percent<0?"diff-neg":"diff-zero"}`} style={{fontWeight:600}}>
                  {eff.effect_percent>0?"+":""}{Number(eff.effect_percent).toFixed(1)}%
                </td>
                <td style={{color:"var(--text-muted)"}}>{eff.priority}</td>
                <td><PeriodChip from={eff.period_from} to={eff.period_to}/></td>
                <td></td>
                <td style={{textAlign:"center"}}><input type="checkbox" checked={eff.is_active} onChange={()=>handleToggleEffect(eff)} disabled={locked}/></td>
                {!locked && <td style={{whiteSpace:"nowrap"}}>
                  <button className="btn btn-secondary btn-sm" onClick={()=>startEdit(eff)} style={{padding:"1px 6px",fontSize:11,marginRight:3}} title="Редагувати">✏</button>
                  <button className="btn btn-secondary btn-sm" onClick={()=>handleDeleteEffect(eff.effect_id)} style={{padding:"1px 6px",fontSize:11}} title="Видалити">✕</button>
                </td>}
              </tr>
            );
          })}

          {/* Add-effect inline row */}
          {!locked && showAdd && (
            <tr style={{background:"var(--gray-50)"}}>
              <td><select value={addForm.rule_type} onChange={e=>setAddForm(f=>({...f,rule_type:e.target.value}))} style={{fontSize:11,padding:"1px 4px"}}>
                {Object.entries(RULE_TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select></td>
              <td><input type="number" step="0.1" value={addForm.effect_percent} onChange={e=>setAddForm(f=>({...f,effect_percent:e.target.value}))} style={{width:60,fontSize:11,padding:"1px 4px"}}/></td>
              <td><input type="number" step="1" min="0" value={addForm.priority} onChange={e=>setAddForm(f=>({...f,priority:e.target.value}))} style={{width:50,fontSize:11,padding:"1px 4px"}}/></td>
              <td><input type="date" value={addForm.period_from} onChange={e=>setAddForm(f=>({...f,period_from:e.target.value}))} style={{fontSize:11,padding:"1px 4px"}}/></td>
              <td><input type="date" value={addForm.period_to}   onChange={e=>setAddForm(f=>({...f,period_to:e.target.value}))}   style={{fontSize:11,padding:"1px 4px"}}/></td>
              <td style={{textAlign:"center"}}><input type="checkbox" checked={addForm.is_active} onChange={e=>setAddForm(f=>({...f,is_active:e.target.checked}))}/></td>
              <td style={{whiteSpace:"nowrap"}}>
                <button className="btn btn-primary btn-sm" onClick={handleAddEffect} disabled={busy} style={{padding:"1px 7px",fontSize:10,marginRight:3}}>✓ Зберегти</button>
                <button className="btn btn-secondary btn-sm" onClick={()=>{setShowAdd(false);setAddForm({...EMPTY_EFFECT})}} style={{padding:"1px 6px",fontSize:10}}>✕</button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {err && <div className="field-error" style={{marginTop:4,fontSize:11}}>{err}</div>}

      {!locked && !showAdd && (
        <button className="btn btn-secondary btn-sm" onClick={()=>setShowAdd(true)} style={{marginTop:6,fontSize:11}}>
          + Додати ефект / період
        </button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════



// ── QuickMapDeptModal — inline department mapping from Planning ───────────────
function QuickMapDeptModal({ row, beforeCoverage, onClose, onMapped }) {
  const [action,         setAction]         = React.useState("attach_existing");
  const [masters,        setMasters]        = React.useState([]);
  const [mastersLoading, setMastersLoading] = React.useState(true);
  const [search,         setSearch]         = React.useState("");
  const [selectedMaster, setSelectedMaster] = React.useState(null);
  const [createForm,     setCreateForm]     = React.useState({
    department_id:    row.department_uid || "",
    department_name:  row.department_name_from_fact || "",
    organization_name: "", branch_name: "", region_name: "", holding_name: "",
  });
  const [saving,       setSaving]       = React.useState(false);
  const [error,        setError]        = React.useState(null);
  const [result,       setResult]       = React.useState(null);  // {master_id, afterCoverage}
  // Duplicate detection
  const [dupCheck,     setDupCheck]     = React.useState(null);  // null | []
  const [dupLoading,   setDupLoading]   = React.useState(false);
  const [forceCreate,  setForceCreate]  = React.useState(false);
  // dept_id uniqueness
  const [idExists,     setIdExists]     = React.useState(false);
  const [idChecking,   setIdChecking]   = React.useState(false);

  React.useEffect(() => {
    getMasterDepartments().then(setMasters).catch(()=>{}).finally(()=>setMastersLoading(false));
  }, []);

  // Debounced duplicate + ID uniqueness check for create_new
  React.useEffect(() => {
    if (action !== "create_new") { setDupCheck(null); setIdExists(false); return; }
    const { department_id, department_name, organization_name, branch_name } = createForm;
    const timer = setTimeout(() => {
      if (department_name && organization_name) {
        setDupLoading(true);
        duplicateCheckDept({ department_id, department_name, organization_name, branch_name })
          .then(r => { setDupCheck(r.matches || []); setIdExists(r.id_exists || false); })
          .catch(()=>{})
          .finally(()=>setDupLoading(false));
      } else { setDupCheck(null); setIdExists(false); }
    }, 450);
    return () => clearTimeout(timer);
  }, [createForm.department_name, createForm.organization_name, createForm.branch_name, createForm.department_id, action]);

  // Suggestions
  const suggestions = React.useMemo(() => {
    if (!masters.length) return [];
    const q = (row.department_name_from_fact || "").toLowerCase();
    const words = q.split(/[\s\/\-]+/).filter(w => w.length > 2);
    return masters.map(m => {
      const nm = (m.department_name || "").toLowerCase();
      const score = words.reduce((s, w) => s + (nm.includes(w) ? w.length : 0), 0);
      return { ...m, _score: score };
    }).filter(m => m._score > 0).sort((a, b) => b._score - a._score).slice(0, 5);
  }, [masters, row.department_name_from_fact]);

  const filtered = React.useMemo(() => {
    if (search.trim().length < 2) return suggestions;
    const q = search.toLowerCase();
    return masters.filter(m =>
      (m.department_name||"").toLowerCase().includes(q) ||
      (m.department_id||"").toLowerCase().includes(q) ||
      (m.organization_name||"").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [masters, search, suggestions]);

  // Validation
  const canSave = React.useMemo(() => {
    if (saving) return false;
    if (action === "attach_existing") return !!selectedMaster;
    if (action === "create_new") {
      const f = createForm;
      if (!f.department_id.trim() || !f.department_name.trim() || !f.organization_name.trim()) return false;
      if (idExists) return false;  // dept_id collision
      if (dupCheck?.length > 0 && !forceCreate) return false;
      return true;
    }
    return false;
  }, [action, selectedMaster, createForm, saving, idExists, dupCheck, forceCreate]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const body = {
        source_id:              row.source_id,
        source_department_id:   row.department_uid,
        source_department_name: row.department_name_from_fact,
        action,
        master_department_id:   action === "attach_existing" ? selectedMaster?.department_id : null,
        create_payload: action === "create_new" ? { ...createForm, force_create: forceCreate } : null,
      };
      const res = await quickMapDepartment(body);
      if (!res.success && res.possible_duplicates) {
        setDupCheck(res.possible_duplicates);
        setSaving(false);
        return;
      }
      // Reload coverage to compute impact
      const afterCov = await import("../api/planningApi").then(m => m.getDeptMappingCoverage()).catch(()=>null);
      setResult({ master_id: res.master_department_id, afterCoverage: afterCov });
    } catch (e) { setError(e?.response?.data?.detail || "Помилка збереження"); }
    finally { setSaving(false); }
  };

  const handleClose = () => {
    if (result) onMapped(result);
    else onClose();
  };

  const setF = part => setCreateForm(f => ({ ...f, ...part }));
  const inS = { fontSize:12, padding:"4px 8px", border:"1px solid #d1d5db", borderRadius:5, width:"100%" };
  const lblS = { fontSize:11, fontWeight:600, color:"#374151", marginBottom:2, display:"block" };

  // Impact computation
  const impact = result?.afterCoverage && beforeCoverage ? {
    before: beforeCoverage.coverage_pct ?? 0,
    after:  result.afterCoverage.coverage_pct ?? 0,
    rowsUnlocked: (result.afterCoverage.mapped_rows ?? 0) - (beforeCoverage.mapped_rows ?? 0),
  } : null;

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={handleClose}>
      <div style={{background:"#fff",borderRadius:10,width:"100%",maxWidth:640,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{padding:"14px 20px",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontWeight:700,fontSize:15}}>{result?"✓ Прив'язано":"Прив'язати підрозділ"}</div>
          <button onClick={handleClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#6b7280"}}>✕</button>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"14px 20px"}}>

          {/* Result / impact screen */}
          {result && (
            <div>
              <div style={{padding:"14px 16px",background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:8,marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:15,color:"#065f46",marginBottom:6}}>✓ Підрозділ успішно прив'язано</div>
                <div style={{fontSize:12,color:"#065f46"}}>master_id: <code>{result.master_id}</code></div>
              </div>
              {impact && (
                <div style={{padding:"12px 16px",background:"#f0f9ff",border:"1px solid #7dd3fc",borderRadius:8}}>
                  <div style={{fontWeight:600,fontSize:13,color:"#0369a1",marginBottom:8}}>Вплив на Planning Coverage</div>
                  <div style={{display:"flex",gap:16,marginBottom:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,color:"#6b7280",fontWeight:600,textTransform:"uppercase"}}>До</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#dc2626"}}>{impact.before}%</div>
                    </div>
                    <div style={{alignSelf:"center",fontSize:20,color:"#0369a1"}}>→</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,color:"#6b7280",fontWeight:600,textTransform:"uppercase"}}>Після</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#065f46"}}>{impact.after}%</div>
                    </div>
                  </div>
                  {impact.rowsUnlocked > 0 && (
                    <div style={{fontSize:12,color:"#0369a1",background:"#e0f2fe",borderRadius:5,padding:"4px 10px"}}>
                      +{impact.rowsUnlocked.toLocaleString("uk-UA")} рядків факту тепер доступні для planning
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Main form — hidden after result */}
          {!result && (<>
            {/* Source dept info */}
            <div style={{padding:"10px 14px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>Source підрозділ</div>
              <div style={{fontWeight:600,fontSize:14,color:"#1e293b",marginBottom:2}}>{row.department_name_from_fact||"—"}</div>
              <div style={{fontSize:11,fontFamily:"monospace",color:"#64748b"}}>{row.department_uid}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>source_id: {row.source_id}</div>
            </div>

            {/* Action toggle */}
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              {[["attach_existing","Прив'язати до існуючого"],["create_new","Створити новий master"]].map(([v,l])=>(
                <button key={v} onClick={()=>{setAction(v);setError(null);setForceCreate(false);}}
                  style={{flex:1,padding:"8px 12px",fontSize:12,fontWeight:action===v?700:500,cursor:"pointer",
                    border:`2px solid ${action===v?"#2563eb":"#d1d5db"}`,borderRadius:7,
                    background:action===v?"#eff6ff":"#f9fafb",color:action===v?"#1d4ed8":"#374151"}}>
                  {l}
                </button>
              ))}
            </div>

            {/* Attach existing */}
            {action === "attach_existing" && (
              <div>
                {suggestions.length > 0 && !search && (
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#6366f1",marginBottom:6}}>✨ Можливо ви мали на увазі:</div>
                    {suggestions.map(m => (
                      <div key={m.department_id} onClick={()=>setSelectedMaster(m)}
                        style={{padding:"7px 12px",border:`1px solid ${selectedMaster?.department_id===m.department_id?"#2563eb":"#e2e8f0"}`,
                          borderRadius:6,marginBottom:4,cursor:"pointer",background:selectedMaster?.department_id===m.department_id?"#eff6ff":"#fff",
                          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:600}}>{m.department_name}</div>
                          <div style={{fontSize:10,color:"#6b7280"}}>{m.organization_name}{m.branch_name?` · ${m.branch_name}`:""}{m.region_name?` · ${m.region_name}`:""}</div>
                        </div>
                        {selectedMaster?.department_id===m.department_id&&<span style={{color:"#2563eb",fontWeight:700}}>✓</span>}
                      </div>
                    ))}
                    <div style={{fontSize:11,color:"#94a3b8",margin:"6px 0"}}>або знайдіть вручну:</div>
                  </div>
                )}
                {/* Quick-fill buttons */}
                {(row.department_name_from_fact || row.department_uid) && (
                  <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                    {row.department_name_from_fact && (
                      <button onClick={()=>setSearch(row.department_name_from_fact)}
                        title={`Підставити назву: ${row.department_name_from_fact}`}
                        style={{fontSize:11,padding:"2px 8px",border:"1px solid #93c5fd",
                                borderRadius:4,background:"#eff6ff",cursor:"pointer",color:"#1e40af",
                                maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        📋 {row.department_name_from_fact}
                      </button>
                    )}
                    {row.department_uid && (
                      <button onClick={()=>setSearch(
                          row.department_uid.match(/^\d+_(.+)$/)
                            ? row.department_uid.replace(/^\d+_/,"")
                            : row.department_uid
                        )}
                        title={`Підставити UID: ${row.department_uid}`}
                        style={{fontSize:11,padding:"2px 8px",border:"1px solid #a78bfa",
                                borderRadius:4,background:"#f5f3ff",cursor:"pointer",color:"#6d28d9",
                                fontFamily:"monospace",maxWidth:220,overflow:"hidden",
                                textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        🔑 {row.department_uid.match(/^\d+_(.+)$/) ? row.department_uid.replace(/^\d+_/,"") : row.department_uid}
                      </button>
                    )}
                  </div>
                )}
                <label style={lblS}>Пошук master підрозділу</label>
                <input style={{...inS,marginBottom:8}} value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Введіть назву, ID або організацію…"/>
                {mastersLoading && <div style={{fontSize:12,color:"#94a3b8"}}>Завантаження…</div>}
                <div style={{maxHeight:200,overflowY:"auto",border:"1px solid #e5e7eb",borderRadius:6}}>
                  {filtered.length===0 && !mastersLoading && <div style={{padding:"16px",textAlign:"center",color:"#94a3b8",fontSize:12}}>Нічого не знайдено</div>}
                  {filtered.map(m => (
                    <div key={m.department_id} onClick={()=>setSelectedMaster(m)}
                      style={{padding:"8px 12px",borderBottom:"1px solid #f1f5f9",cursor:"pointer",
                        background:selectedMaster?.department_id===m.department_id?"#eff6ff":"#fff",
                        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600}}>{m.department_name}</div>
                        <div style={{fontSize:10,color:"#6b7280"}}>{m.organization_name}{m.branch_name?` · ${m.branch_name}`:""} <span style={{fontFamily:"monospace",color:"#94a3b8"}}>[{m.department_id}]</span></div>
                      </div>
                      {selectedMaster?.department_id===m.department_id&&<span style={{color:"#2563eb",fontWeight:700}}>✓</span>}
                    </div>
                  ))}
                </div>
                {selectedMaster&&<div style={{marginTop:8,padding:"6px 12px",background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:6,fontSize:12,color:"#065f46"}}>✓ Вибрано: <strong>{selectedMaster.department_name}</strong></div>}
              </div>
            )}

            {/* Create new */}
            {action === "create_new" && (
              <div style={{display:"grid",gap:10}}>
                <div>
                  <label style={lblS}>Department ID <span style={{color:"#ef4444"}}>*</span></label>
                  <input style={{...inS,borderColor:idExists?"#ef4444":"#d1d5db"}}
                    value={createForm.department_id} onChange={e=>{setF({department_id:e.target.value});setForceCreate(false);}}
                    placeholder="наприклад: 000001234"/>
                  {idExists&&<div style={{fontSize:10,color:"#ef4444",marginTop:2}}>⛔ Цей ID вже існує в dim_department</div>}
                  {!idExists&&createForm.department_id&&<div style={{fontSize:10,color:"#6b7280",marginTop:2,fontFamily:"monospace"}}>Унікальний ідентифікатор. За замовчуванням = department_uid</div>}
                </div>
                <div>
                  <label style={lblS}>Назва підрозділу <span style={{color:"#ef4444"}}>*</span></label>
                  <input style={inS} value={createForm.department_name} onChange={e=>setF({department_name:e.target.value})} placeholder="Відділ продажу Соколь"/>
                </div>
                <div>
                  <label style={lblS}>Організація <span style={{color:"#ef4444"}}>*</span></label>
                  <input style={inS} value={createForm.organization_name} onChange={e=>setF({organization_name:e.target.value})} placeholder="ProTec"/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <div><label style={lblS}>Філія</label><input style={inS} value={createForm.branch_name} onChange={e=>setF({branch_name:e.target.value})} placeholder="Соколь"/></div>
                  <div><label style={lblS}>Регіон</label><input style={inS} value={createForm.region_name} onChange={e=>setF({region_name:e.target.value})} placeholder="Захід"/></div>
                  <div><label style={lblS}>Холдинг</label><input style={inS} value={createForm.holding_name} onChange={e=>setF({holding_name:e.target.value})} placeholder="HD"/></div>
                </div>

                {/* Duplicate warning */}
                {dupLoading&&<div style={{fontSize:11,color:"#94a3b8"}}>Перевірка дублікатів…</div>}
                {!dupLoading&&dupCheck&&dupCheck.length>0&&!forceCreate&&(
                  <div style={{padding:"10px 14px",background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8}}>
                    <div style={{fontWeight:600,fontSize:12,color:"#92400e",marginBottom:6}}>⚠ Знайдено схожі master підрозділи:</div>
                    {dupCheck.map(d=>(
                      <div key={d.department_id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",fontSize:12}}>
                        <span><strong>{d.department_name}</strong> · {d.organization_name} <span style={{fontFamily:"monospace",fontSize:10,color:"#6b7280"}}>[{d.department_id}]</span></span>
                        <button onClick={()=>setSelectedMaster(d)||setAction("attach_existing")}
                          style={{fontSize:11,padding:"2px 8px",background:"#eff6ff",border:"1px solid #3b82f6",color:"#1d4ed8",borderRadius:5,cursor:"pointer"}}>
                          Використати
                        </button>
                      </div>
                    ))}
                    <button onClick={()=>setForceCreate(true)}
                      style={{marginTop:8,fontSize:11,padding:"4px 12px",background:"#fef3c7",border:"1px solid #f59e0b",color:"#92400e",borderRadius:5,cursor:"pointer",fontWeight:600}}>
                      Все одно створити новий →
                    </button>
                  </div>
                )}
                {forceCreate&&<div style={{fontSize:11,padding:"4px 10px",background:"#fef3c7",borderRadius:5,color:"#92400e"}}>⚠ Буде створено новий підрозділ попри схожі записи</div>}
              </div>
            )}

            {error&&<div style={{marginTop:12,padding:"6px 12px",background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:6,fontSize:12,color:"#dc2626"}}>{error}</div>}
          </>)}
        </div>

        <div style={{padding:"12px 20px",borderTop:"1px solid #e5e7eb",display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
          {!result&&<span style={{fontSize:11,color:"#94a3b8",marginRight:"auto"}}>{action==="create_new"&&(!createForm.department_name||!createForm.organization_name)?"Заповніть обов'язкові поля":action==="attach_existing"&&!selectedMaster?"Оберіть master підрозділ":""}</span>}
          <button onClick={handleClose} style={{padding:"7px 18px",background:"#f9fafb",border:"1px solid #d1d5db",borderRadius:6,cursor:"pointer",fontSize:13}}>{result?"Закрити":"Скасувати"}</button>
          {!result&&<button onClick={handleSave} disabled={!canSave}
            style={{padding:"7px 20px",background:canSave?"#2563eb":"#d1d5db",color:"#fff",border:"none",borderRadius:6,fontWeight:700,fontSize:13,cursor:canSave?"pointer":"default"}}>
            {saving?"Збереження…":"Зберегти прив'язку"}
          </button>}
        </div>
      </div>
    </div>
  );
}

// ── PlanCard — overview card for a single scenario+version ───────────────────
function PlanCard({ plan, isSelected, onOpen, onDelete }) {
  const hasRows = plan.plan_rows_count > 0;
  const statusColor = plan.generation_status === "completed" ? "#065f46"
    : plan.generation_status === "failed"    ? "#991b1b" : "#1e40af";
  return (
    <div style={{border:`2px solid ${isSelected?"var(--brand)":"var(--border)"}`,borderRadius:"var(--radius-md)",padding:"14px 16px",background:isSelected?"var(--brand-faint)":"var(--surface)",display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",cursor:"pointer"}}
      onClick={onOpen}>
      <div style={{flex:1,minWidth:180}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <span style={{fontWeight:700,fontSize:14,color:isSelected?"var(--brand)":"var(--text-primary)"}}>{plan.scenario_name}</span>
          <ScenarioTypeBadge type={plan.scenario_type}/>
          {plan.is_locked&&<span style={{fontSize:12}}>🔒</span>}
        </div>
        <div style={{fontSize:11,color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>{plan.scenario_code}</div>
        <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:2}}>
          v{plan.version_number} · {plan.version_name}
        </div>
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        {hasRows ? (<>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase"}}>Рядків</div>
            <div style={{fontSize:14,fontWeight:700}}>{plan.plan_rows_count.toLocaleString("uk-UA")}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase"}}>Виручка план</div>
            <div style={{fontSize:13,fontWeight:700,color:"var(--brand)"}}>{plan.total_plan_sales_vat>0?Number(plan.total_plan_sales_vat).toLocaleString("uk-UA",{minimumFractionDigits:0,maximumFractionDigits:0}):"—"}</div>
          </div>
          {plan.target_period_from&&<div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase"}}>Період</div>
            <div style={{fontSize:12}}>{plan.target_period_from?.slice(0,7)} → {plan.target_period_to?.slice(0,7)||"∞"}</div>
          </div>}
        </>) : (
          <div style={{fontSize:12,color:"var(--text-muted)",fontStyle:"italic",alignSelf:"center"}}>
            {plan.last_generation_id ? "Генерація є, рядків немає" : "План ще не згенеровано"}
          </div>
        )}
      </div>
      <div style={{flexShrink:0,textAlign:"right"}}>
        {plan.last_generated_at&&<div style={{fontSize:10,color:"var(--text-muted)",marginBottom:4}}>
          Оновлено: {new Date(plan.last_generated_at).toLocaleDateString("uk-UA")}
          {plan.generation_status&&<span style={{marginLeft:4,color:statusColor}}>({plan.generation_status})</span>}
        </div>}
        <button className={`btn ${isSelected?"btn-primary":"btn-secondary"}`} style={{fontSize:12,whiteSpace:"nowrap"}}
          onClick={e=>{e.stopPropagation();onOpen();}}>
          {isSelected?"✓ Відкрито":"Відкрити план →"}
        </button>
        {onDelete&&<button className="btn btn-secondary btn-sm" style={{fontSize:11,marginTop:4,color:"var(--danger)",borderColor:"var(--danger)",background:"#fff",display:"block",width:"100%"}}
          onClick={e=>{e.stopPropagation();onDelete();}} title="Видалити план та всі дані">
          Видалити
        </button>}
      </div>
    </div>
  );
}

export default function PlanningPage({ setActivePage }) {
  const today=new Date(); const prevYear=today.getFullYear()-1; const thisYear=today.getFullYear();

  // ── Scenarios ─────────────────────────────────────────────────────────────
  const [scenarios,setScenarios]=useState([]); const [selectedScenario,setSelectedScenario]=useState(null);
  const [scenariosLoading,setScenariosLoading]=useState(false);
  const [showCreateScenario,setShowCreateScenario]=useState(false);
  const [newScenario,setNewScenario]=useState({scenario_code:"",scenario_name:"",scenario_type:"draft"});
  const [createScenarioErr,setCreateScenarioErr]=useState(null); const [createScenarioBusy,setCreateScenarioBusy]=useState(false);

  // ── Versions ──────────────────────────────────────────────────────────────
  const [versions,setVersions]=useState([]); const [selectedVersion,setSelectedVersion]=useState(null);
  const [showCreateVersion,setShowCreateVersion]=useState(false); const [newVersionName,setNewVersionName]=useState("");
  const [createVersionErr,setCreateVersionErr]=useState(null); const [createVersionBusy,setCreateVersionBusy]=useState(false);

  // ── Rules ──────────────────────────────────────────────────────────────────
  const [rules,setRules]=useState([]); const [rulesLoading,setRulesLoading]=useState(false);
  // Create new rule
  const [showCreateRule,setShowCreateRule]=useState(false);
  const [newRuleName,setNewRuleName]=useState(""); const [newRuleScopes,setNewRuleScopes]=useState([]);
  const [newRuleEffects,setNewRuleEffects]=useState([]); // effects to create together with rule
  const [createRuleErr,setCreateRuleErr]=useState(null); const [createRuleBusy,setCreateRuleBusy]=useState(false);
  // Edit rule header (name + scopes only; effects managed inline via EffectsTable)
  const [editingRuleId,setEditingRuleId]=useState(null);
  const [editRuleName,setEditRuleName]=useState(""); const [editRuleScopes,setEditRuleScopes]=useState([]);
  const [editRuleErr,setEditRuleErr]=useState(null); const [editRuleBusy,setEditRuleBusy]=useState(false);

  // ── Generate ───────────────────────────────────────────────────────────────
  const [genForm,setGenForm]=useState({
    base_period_from:`${prevYear}-01-01`, base_period_to:`${prevYear}-12-31`,
    target_period_from:`${thisYear}-01-01`, target_period_to:`${thisYear}-12-31`,
    global_revenue_pct:0, global_volume_pct:0, global_price_pct:0, replace_existing:true,
  });
  const [generating,setGenerating]=useState(false); const [genResult,setGenResult]=useState(null); const [genError,setGenError]=useState(null);

  // ── Plan Preview ───────────────────────────────────────────────────────────
  const [planData,setPlanData]=useState(null); const [planLoading,setPlanLoading]=useState(false); const [planPage,setPlanPage]=useState(1);
  const [deptSelected,setDeptSelected]=useState(null); const [pgSelected,setPgSelected]=useState(null);
  const [deptUidInput,setDeptUidInput]=useState(""); const [pgUidInput,setPgUidInput]=useState("");
  const [deptUidDebounced,setDeptUidDebounced]=useState(""); const [pgUidDebounced,setPgUidDebounced]=useState("");
  const [periodFrom,setPeriodFrom]=useState(""); const [periodTo,setPeriodTo]=useState("");
  const [regionFilter,setRegionFilter]=useState(""); const [regionDebounced,setRegionDebounced]=useState("");
  const [orgFilter,setOrgFilter]=useState(""); const [orgDebounced,setOrgDebounced]=useState("");
  const [branchFilter,setBranchFilter]=useState(""); const [branchDebounced,setBranchDebounced]=useState("");
  const deptTimer=useRef(null); const pgTimer=useRef(null); const regionTimer=useRef(null);
  const orgTimer=useRef(null); const branchTimer=useRef(null);

  // ── Planning Readiness ───────────────────────────────────────────────────────
  const [readiness,setReadiness]=useState(null); const [readinessLoading,setReadinessLoading]=useState(false);

  // ── Inline Dept Mapping ───────────────────────────────────────────────────────
  const [mapDeptRow,setMapDeptRow]=useState(null);
  const [mapToast,setMapToast]=useState(null);

  // ── Plans Overview ────────────────────────────────────────────────────────────
  const [plansOverview,setPlansOverview]=useState(null); const [plansLoading,setPlansLoading]=useState(true);
  const [plansError,setPlansError]=useState(null);
  const [showCreateForm,setShowCreateForm]=useState(false);
  const [planTypeFilter,setPlanTypeFilter]=useState("all");  // all | budget | draft | ...
  const [newPlan,setNewPlan]=useState({scenario_code:"",scenario_name:"",scenario_type:"budget"});
  const [createPlanBusy,setCreatePlanBusy]=useState(false); const [createPlanErr,setCreatePlanErr]=useState(null);

  // ── Dept Mapping Coverage ────────────────────────────────────────────────────
  const [deptCoverage,setDeptCoverage]=useState(null); const [deptCoverLoading,setDeptCoverLoading]=useState(false);
  const [uidAutoMatching,setUidAutoMatching]=useState(false); const [uidAutoMatchResult,setUidAutoMatchResult]=useState(null);

  // ── Gen Log ─────────────────────────────────────────────────────────────────
  const [genLog,setGenLog]=useState(null); const [genLogLoading,setGenLogLoading]=useState(false); const [expandedGen,setExpandedGen]=useState(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(()=>{setScenariosLoading(true);getScenarios({is_active:true,page_size:100}).then(d=>setScenarios(d.rows||[])).catch(()=>{}).finally(()=>setScenariosLoading(false));},[]);
  useEffect(()=>{
    setPlanData(null);setRules([]);setGenLog(null);
    if(!selectedScenario){setVersions([]);setSelectedVersion(null);return;}
    setVersions([]);
    getVersions(selectedScenario.scenario_id,{page_size:50})
      .then(d=>{
        const vers=d.rows||[]; setVersions(vers);
        // Preserve selectedVersion if it already belongs to this scenario
        setSelectedVersion(prev=>prev&&vers.some(v=>v.version_id===prev.version_id)?prev:null);
      }).catch(()=>{});
  },[selectedScenario]); // eslint-disable-line
  useEffect(()=>{setPlanData(null);setGenLog(null);setExpandedGen(null);if(!selectedScenario||!selectedVersion){setRules([]);return;}setRulesLoading(true);getRules(selectedScenario.scenario_id,selectedVersion.version_id).then(setRules).catch(()=>{}).finally(()=>setRulesLoading(false));},[selectedScenario,selectedVersion]); // eslint-disable-line
  const loadGenLog=useCallback(()=>{if(!selectedScenario||!selectedVersion)return;setGenLogLoading(true);getGenerationLog({scenario_id:selectedScenario.scenario_id,version_id:selectedVersion.version_id,page_size:10}).then(setGenLog).catch(()=>{}).finally(()=>setGenLogLoading(false));},[selectedScenario,selectedVersion]); // eslint-disable-line
  useEffect(()=>{loadGenLog();},[loadGenLog]); // eslint-disable-line
  const loadReadiness=useCallback(()=>{setReadinessLoading(true);getPlanningReadiness().then(setReadiness).catch(()=>{}).finally(()=>setReadinessLoading(false));},[]);
  useEffect(()=>{if(selectedScenario&&selectedVersion)loadReadiness();},[selectedScenario,selectedVersion]); // eslint-disable-line
  const loadDeptCoverage=useCallback(()=>{setDeptCoverLoading(true);getDeptMappingCoverage().then(setDeptCoverage).catch(()=>{}).finally(()=>setDeptCoverLoading(false));},[]);
  useEffect(()=>{if(selectedScenario&&selectedVersion)loadDeptCoverage();},[selectedScenario,selectedVersion]); // eslint-disable-line

  // Plans Overview — load on mount, auto-select if only one version
  const loadPlansOverview=useCallback(()=>{
    setPlansLoading(true);setPlansError(null);
    getPlansOverview().then(plans=>{
      setPlansOverview(plans);
      // Auto-select if exactly one version exists and nothing is selected
      if(plans.length===1&&!selectedScenario&&!selectedVersion){
        const p=plans[0];
        setSelectedScenario({scenario_id:p.scenario_id,scenario_name:p.scenario_name,scenario_code:p.scenario_code,scenario_type:p.scenario_type});
        setSelectedVersion({version_id:p.version_id,version_name:p.version_name,version_number:p.version_number,is_locked:p.is_locked});
      }
    }).catch(e=>setPlansError(e?.response?.data?.detail||"Помилка завантаження планів"))
    .finally(()=>setPlansLoading(false));
  },[selectedScenario,selectedVersion]); // eslint-disable-line
  useEffect(()=>{loadPlansOverview();},[]);  // eslint-disable-line

  const handleOpenPlan=(plan)=>{
    setSelectedScenario({scenario_id:plan.scenario_id,scenario_name:plan.scenario_name,scenario_code:plan.scenario_code,scenario_type:plan.scenario_type});
    setSelectedVersion({version_id:plan.version_id,version_name:plan.version_name,version_number:plan.version_number,is_locked:plan.is_locked});
    setGenResult(null);setGenError(null);setPlanData(null);setPlanPage(1);
  };
  const handleClosePlan=()=>{
    setSelectedScenario(null);setSelectedVersion(null);
    setRules([]);setPlanData(null);setGenResult(null);setGenLog(null);
  };
  const handleDeleteVersion=async(plan)=>{
    if(!window.confirm(`Видалити план "${plan.scenario_name} / ${plan.version_name}" та всі дані? Це незворотно.`))return;
    try{
      await deleteVersion(plan.version_id);
      if(selectedVersion?.version_id===plan.version_id)handleClosePlan();
      loadPlansOverview();
    }catch(e){alert(e?.response?.data?.detail||'Помилка видалення');}
  };
  const handleQuickCreatePlan=async()=>{
    if(!newPlan.scenario_name.trim()||!newPlan.scenario_code.trim()){setCreatePlanErr("Назва та код обов'язкові");return;}
    setCreatePlanBusy(true);setCreatePlanErr(null);
    try{
      const sc=await createScenario(newPlan);
      const v=await createVersion(sc.scenario_id,{version_name:"v1 — Чернетка"});
      setShowCreateForm(false);setNewPlan({scenario_code:"",scenario_name:"",scenario_type:"budget"});
      await loadPlansOverview();
      handleOpenPlan({scenario_id:sc.scenario_id,scenario_name:sc.scenario_name,scenario_code:sc.scenario_code,scenario_type:sc.scenario_type,version_id:v.version_id,version_name:v.version_name,version_number:v.version_number,is_locked:v.is_locked});
    }catch(e){setCreatePlanErr(e?.response?.data?.detail||"Помилка");}finally{setCreatePlanBusy(false);}
  };

  // ── Plan load ─────────────────────────────────────────────────────────────
  const fetchPlanDepts=useCallback(s=>getPlanDeptOptions(selectedScenario?.scenario_id,selectedVersion?.version_id,s),[selectedScenario,selectedVersion]);
  const fetchPlanPGs=useCallback(s=>getPlanPGOptions(selectedScenario?.scenario_id,selectedVersion?.version_id,s),[selectedScenario,selectedVersion]);
  const renderSimpleOpt=opt=>({value:opt.value,label:opt.label});
  const effectiveDeptName=deptSelected?.value||null; const effectiveDeptUid=deptUidDebounced||null;
  const effectivePgName=pgSelected?.value||null;   const effectivePgUid=pgUidDebounced||null;
  const loadPlan=useCallback((p=1)=>{
    if(!selectedScenario||!selectedVersion)return;
    setPlanLoading(true);
    const params={scenario_id:selectedScenario.scenario_id,version_id:selectedVersion.version_id,page:p,page_size:PAGE_SIZE};
    if(periodFrom)params.period_from=periodFrom; if(periodTo)params.period_to=periodTo;
    if(effectiveDeptName)params.department_name=effectiveDeptName; if(effectiveDeptUid)params.department_uid=effectiveDeptUid;
    if(effectivePgName)params.product_group_name=effectivePgName;   if(effectivePgUid)params.product_group_uid=effectivePgUid;
    if(regionDebounced)params.region=regionDebounced;
    if(orgDebounced)params.organization=orgDebounced;
    if(branchDebounced)params.branch=branchDebounced;
    getFactPlan(params).then(setPlanData).catch(()=>{}).finally(()=>setPlanLoading(false));
  },[selectedScenario,selectedVersion,periodFrom,periodTo,effectiveDeptName,effectiveDeptUid,effectivePgName,effectivePgUid,regionDebounced,orgDebounced,branchDebounced]); // eslint-disable-line
  useEffect(()=>{if(selectedScenario&&selectedVersion){setPlanPage(1);loadPlan(1);}},[selectedScenario,selectedVersion,periodFrom,periodTo,deptSelected,pgSelected,deptUidDebounced,pgUidDebounced,regionDebounced,orgDebounced,branchDebounced]); // eslint-disable-line
  useEffect(()=>{loadPlan(planPage);},[planPage]); // eslint-disable-line
  const onDeptUidChange=val=>{setDeptUidInput(val);if(deptSelected)setDeptSelected(null);clearTimeout(deptTimer.current);deptTimer.current=setTimeout(()=>{setDeptUidDebounced(val);setPlanPage(1)},400)};
  const onPgUidChange=val=>{setPgUidInput(val);if(pgSelected)setPgSelected(null);clearTimeout(pgTimer.current);pgTimer.current=setTimeout(()=>{setPgUidDebounced(val);setPlanPage(1)},400)};
  const onRegionChange=val=>{setRegionFilter(val);clearTimeout(regionTimer.current);regionTimer.current=setTimeout(()=>{setRegionDebounced(val);setPlanPage(1)},400)};
  const onOrgChange=val=>{setOrgFilter(val);clearTimeout(orgTimer.current);orgTimer.current=setTimeout(()=>{setOrgDebounced(val);setPlanPage(1)},400)};
  const onBranchChange=val=>{setBranchFilter(val);clearTimeout(branchTimer.current);branchTimer.current=setTimeout(()=>{setBranchDebounced(val);setPlanPage(1)},400)};

  // ── Handlers: Scenario/Version ────────────────────────────────────────────
  const handleCreateScenario=async()=>{
    if(!newScenario.scenario_code.trim()||!newScenario.scenario_name.trim()){setCreateScenarioErr("Код і назва обов'язкові");return;}
    setCreateScenarioBusy(true);setCreateScenarioErr(null);
    try{const c=await createScenario(newScenario);setScenarios(p=>[c,...p]);setSelectedScenario(c);setShowCreateScenario(false);setNewScenario({scenario_code:"",scenario_name:"",scenario_type:"draft"});}
    catch(e){setCreateScenarioErr(e?.response?.data?.detail||"Помилка")}finally{setCreateScenarioBusy(false)}
  };
  const handleCreateVersion=async()=>{
    if(!newVersionName.trim()){setCreateVersionErr("Введіть назву версії");return;}
    setCreateVersionBusy(true);setCreateVersionErr(null);
    try{const c=await createVersion(selectedScenario.scenario_id,{version_name:newVersionName});setVersions(p=>[c,...p]);setSelectedVersion(c);setShowCreateVersion(false);setNewVersionName("");}
    catch(e){setCreateVersionErr(e?.response?.data?.detail||"Помилка")}finally{setCreateVersionBusy(false)}
  };
  const handleLockVersion=async(v)=>{
    if(!window.confirm(`Заблокувати версію "${v.version_name}"? Це незворотна дія.`))return;
    try{const u=await lockVersion(v.version_id);setVersions(p=>p.map(x=>x.version_id===u.version_id?u:x));if(selectedVersion?.version_id===u.version_id)setSelectedVersion(u);}
    catch(e){alert(e?.response?.data?.detail||"Помилка блокування")}
  };

  // ── Handlers: Rules ────────────────────────────────────────────────────────
  const handleCreateRule=async()=>{
    if(!newRuleName.trim()){setCreateRuleErr("Назва правила обов'язкова");return;}
    setCreateRuleBusy(true);setCreateRuleErr(null);
    try{
      const created=await createRule(selectedScenario.scenario_id,selectedVersion.version_id,{
        rule_name:newRuleName.trim(),
        scopes:newRuleScopes.filter(s=>s.dimension_type!=="all").map(s=>({dimension_type:s.dimension_type,dimension_value:s.dimension_value||"",dimension_label:s.dimension_label||s.dimension_value||""})),
        effects:newRuleEffects.map(e=>({...e,period_from:e.period_from||null,period_to:e.period_to||null,effect_percent:Number(e.effect_percent),priority:Number(e.priority)})),
      });
      setRules(p=>[...p,created]);setShowCreateRule(false);setNewRuleName("");setNewRuleScopes([]);setNewRuleEffects([]);
    }catch(e){setCreateRuleErr(e?.response?.data?.detail||"Помилка")}finally{setCreateRuleBusy(false)}
  };

  const handleStartEdit=r=>{setEditingRuleId(r.rule_id);setEditRuleName(r.rule_name);setEditRuleScopes((r.scopes||[]).map(s=>({...s})));setEditRuleErr(null)};
  const handleCancelEdit=()=>{setEditingRuleId(null);setEditRuleErr(null)};
  const handleSaveEdit=async()=>{
    if(!editRuleName.trim()){setEditRuleErr("Назва обов'язкова");return;}
    setEditRuleBusy(true);setEditRuleErr(null);
    try{
      const updated=await updateRule(editingRuleId,{
        rule_name:editRuleName.trim(),
        scopes:editRuleScopes.filter(s=>s.dimension_type!=="all").map(s=>({dimension_type:s.dimension_type,dimension_value:s.dimension_value||"",dimension_label:s.dimension_label||s.dimension_value||""})),
      });
      setRules(p=>p.map(r=>r.rule_id===updated.rule_id?{...updated,effects:r.effects}:r));setEditingRuleId(null);
    }catch(e){setEditRuleErr(e?.response?.data?.detail||"Помилка")}finally{setEditRuleBusy(false)}
  };

  const handleToggleRule=async(rule)=>{
    try{const u=await updateRule(rule.rule_id,{is_active:!rule.is_active});setRules(p=>p.map(r=>r.rule_id===u.rule_id?{...u,effects:r.effects}:r));}catch{alert("Помилка")}
  };

  const handleDeleteRule=async(ruleId)=>{
    if(!window.confirm("Видалити правило разом з усіма ефектами?"))return;
    try{await deleteRule(ruleId);setRules(p=>p.filter(r=>r.rule_id!==ruleId));if(editingRuleId===ruleId)setEditingRuleId(null);}catch{alert("Помилка видалення")}
  };

  const handleCopyRule=async(ruleId)=>{
    try{const copied=await copyRule(ruleId);setRules(p=>[...p,copied]);alert(`Правило скопійовано: "${copied.rule_name}" (неактивне). Активуйте після налаштування.`);}catch(e){alert(e?.response?.data?.detail||"Помилка копіювання")}
  };

  const handleEffectsChange=(ruleId,newEffects)=>{
    setRules(p=>p.map(r=>r.rule_id===ruleId?{...r,effects:newEffects}:r));
  };

  // Scope helpers
  const addScope=(arr,setArr)=>setArr(p=>[...p,{dimension_type:"region",dimension_value:"",dimension_label:""}]);
  const removeScope=(arr,setArr,i)=>setArr(p=>p.filter((_,idx)=>idx!==i));
  const updateScope=(arr,setArr,i,part)=>setArr(p=>p.map((s,idx)=>idx===i?{...s,...part}:s));

  const handleGenerate=async()=>{
    if(!selectedScenario||!selectedVersion)return;
    if(selectedVersion.is_locked){setGenError("Версія заблокована");return;}
    setGenerating(true);setGenResult(null);setGenError(null);
    try{
      const result=await generateFirstDraft({
        scenario_id:selectedScenario.scenario_id,version_id:selectedVersion.version_id,
        base_period_from:genForm.base_period_from,base_period_to:genForm.base_period_to,
        target_period_from:genForm.target_period_from,target_period_to:genForm.target_period_to,
        global_revenue_pct:Number(genForm.global_revenue_pct),global_volume_pct:Number(genForm.global_volume_pct),global_price_pct:Number(genForm.global_price_pct),
        replace_existing:genForm.replace_existing,
      });
      setGenResult(result);setPlanPage(1);loadPlan(1);loadGenLog();
    }catch(e){setGenError(e?.response?.data?.detail||"Помилка генерації")}finally{setGenerating(false)}
  };

  const setGF=(k,v)=>setGenForm(f=>({...f,[k]:v}));
  const canGenerate=selectedScenario&&selectedVersion&&!selectedVersion.is_locked&&!generating;
  const activeEffectsCount=rules.reduce((s,r)=>s+(r.effects||[]).filter(e=>e.is_active).length,0);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const renderScopeBuilder=(scopes,setScopes)=>(
    <div>
      <div className="rule-form-scope-header">
        <span className="rule-form-scope-title">Умови (AND)</span>
        <button className="btn btn-secondary btn-sm" onClick={()=>addScope(scopes,setScopes)} style={{padding:"2px 10px",fontSize:11}}>+ Умова</button>
        {scopes.length===0&&<span className="rule-form-scope-hint">без умов = всі рядки</span>}
      </div>
      {scopes.map((scope,i)=>(
        <div key={i} className="scope-row">
          <select value={scope.dimension_type} onChange={e=>updateScope(scopes,setScopes,i,{dimension_type:e.target.value,dimension_value:"",dimension_label:""})} style={{minWidth:140,flexShrink:0}}>
            {Object.entries(DIM_TYPE_LABEL).filter(([v])=>v!=="all").map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <ScopeValueInput dimType={scope.dimension_type} value={scope.dimension_value} label={scope.dimension_label} onValueChange={(val,lbl)=>updateScope(scopes,setScopes,i,{dimension_value:val,dimension_label:lbl})}/>
          <button className="scope-row-remove" onClick={()=>removeScope(scopes,setScopes,i)}>✕</button>
        </div>
      ))}
    </div>
  );

  // ── Effects summary (short text for rule card) ─────────────────────────────
  const effectsSummary=(effects)=>{
    if(!effects||effects.length===0)return<span style={{fontSize:11,color:"var(--text-muted)",fontStyle:"italic"}}>немає ефектів</span>;
    const active=effects.filter(e=>e.is_active);
    return(
      <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
        {active.slice(0,3).map(e=>(
          <span key={e.effect_id} style={{fontSize:10,background:"var(--gray-100)",border:"1px solid var(--border)",borderRadius:6,padding:"1px 6px",display:"inline-flex",gap:4,alignItems:"center"}}>
            <RuleTypeBadge type={e.rule_type}/>
            <span style={{fontWeight:700,color:e.effect_percent>0?"var(--success)":e.effect_percent<0?"var(--danger)":undefined}}>{e.effect_percent>0?"+":""}{Number(e.effect_percent).toFixed(1)}%</span>
            {(e.period_from||e.period_to)&&<PeriodChip from={e.period_from} to={e.period_to}/>}
          </span>
        ))}
        {active.length>3&&<span style={{fontSize:10,color:"var(--text-muted)"}}>+{active.length-3} ще</span>}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* Toast notification */}
      {mapToast&&(<div style={{position:'fixed',bottom:24,right:24,zIndex:3000,padding:'10px 20px',background:'#065f46',color:'#fff',borderRadius:8,fontWeight:600,fontSize:13,boxShadow:'0 4px 20px rgba(0,0,0,0.25)',display:'flex',alignItems:'center',gap:10}}>
        ✓ {mapToast}
        <button onClick={()=>setMapToast(null)} style={{background:'none',border:'none',color:'rgba(255,255,255,0.7)',cursor:'pointer',fontSize:16}}>✕</button>
      </div>)}
      {/* Inline dept mapping modal */}
      {mapDeptRow&&(<QuickMapDeptModal
        row={mapDeptRow}
        beforeCoverage={deptCoverage}
        onClose={()=>setMapDeptRow(null)}
        onMapped={(res)=>{
          setMapDeptRow(null);
          // Optimistic update: remove this dept from unmapped list
          if(deptCoverage){
            setDeptCoverage(prev=>prev?({...prev,
              unmapped_depts:(prev.unmapped_depts||[]).filter(d=>d.department_uid!==mapDeptRow.department_uid),
              unmapped_departments:Math.max(0,(prev.unmapped_departments||0)-1),
              mapped_departments:(prev.mapped_departments||0)+1,
            }):prev);
          }
          setMapToast('✓ Підрозділ прив\'язано · Coverage оновлено');
          setTimeout(()=>setMapToast(null),5000);
          if(res.afterCoverage) setDeptCoverage(res.afterCoverage);
          else { loadDeptCoverage(); loadReadiness(); }
        }}
      />)}

      <div className="page-header">
        <div><h1>Планування продажів</h1><p>Факт → правила ефектів → план</p></div>

      </div>

      {/* ══ BLOCK 0 — Plans Overview ══════════════════════════════════════════ */}
      <div className="content-card">
        <div className="card-top">
          <div className="card-title-block">
            <h2>Мої плани</h2>
            <p style={{fontSize:12,color:"var(--text-muted)"}}>
              <strong>Сценарій</strong> = плановий бюджет або прогноз.&nbsp;
              <strong>Версія</strong> = варіант плану.&nbsp;
              <strong>Генерація</strong> = запуск розрахунку плану з правил.
            </p>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-secondary btn-sm" onClick={loadPlansOverview} disabled={plansLoading}>↻</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>{setShowCreateForm(v=>!v);setCreatePlanErr(null);}}>
              {showCreateForm?"Скасувати":"+ Новий план"}
            </button>
          </div>
        </div>

        {/* Quick-create form */}
        {showCreateForm&&(
          <div style={{padding:"14px 16px",background:"var(--gray-50)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--text-secondary)",marginBottom:10}}>Новий план</div>
            <div className="form-grid">
              <div className="form-field"><label>Назва плану</label><input type="text" value={newPlan.scenario_name} onChange={e=>setNewPlan(s=>({...s,scenario_name:e.target.value}))} placeholder="Бюджет 2027"/></div>
              <div className="form-field"><label>Код</label><input type="text" value={newPlan.scenario_code} onChange={e=>setNewPlan(s=>({...s,scenario_code:e.target.value.toUpperCase()}))} placeholder="BUDGET_2027"/></div>
              <div className="form-field"><label>Тип</label>
                <select value={newPlan.scenario_type} onChange={e=>setNewPlan(s=>({...s,scenario_type:e.target.value}))}>
                  {["budget","forecast","draft","optimistic","conservative"].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            {createPlanErr&&<div className="field-error" style={{marginTop:6}}>{createPlanErr}</div>}
            <button className="btn btn-primary btn-sm" onClick={handleQuickCreatePlan} disabled={createPlanBusy} style={{marginTop:10}}>
              {createPlanBusy?"Створення…":"Створити план →"}
            </button>
          </div>
        )}

        {/* Error state */}
        {plansError&&(
          <div className="error-message" style={{marginBottom:10}}>
            {plansError}
            <button className="btn btn-secondary btn-sm" onClick={loadPlansOverview} style={{marginLeft:12}}>Повторити</button>
          </div>
        )}

        {/* Loading state */}
        {plansLoading&&<div className="loading-state"><div className="loading-spinner"/><div className="loading-message">Завантаження планів…</div></div>}

        {/* Type filter */}
        {plansOverview&&plansOverview.length>0&&(()=>{
          const types=[...new Set(plansOverview.map(p=>p.scenario_type))];
          if(types.length<=1)return null;
          return(
            <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:10}}>
              {['all',...types].map(t=>(
                <button key={t} className={`btn btn-sm ${planTypeFilter===t?'btn-primary':'btn-secondary'}`}
                  style={{fontSize:11}} onClick={()=>setPlanTypeFilter(t)}>
                  {t==='all'?'Всі типи':t}
                  {t!=='all'&&<span style={{marginLeft:4,opacity:0.7}}>({plansOverview.filter(p=>p.scenario_type===t).length})</span>}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Plans list */}
        {!plansLoading&&!plansError&&plansOverview&&(
          plansOverview.length===0?(
            <div className="empty-state" style={{padding:"32px 0"}}>
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-message">Ще немає жодного плану. Натисніть «+ Новий план» щоб почати.</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(() => {
                // Apply type filter then group by scenario
                const filtered = planTypeFilter==='all' ? plansOverview : plansOverview.filter(p=>p.scenario_type===planTypeFilter);
                if(filtered.length===0)return<div style={{color:'var(--text-muted)',fontSize:12,padding:'12px 0',textAlign:'center'}}>Немає планів типу «{planTypeFilter}»</div>;
                const byScenario = {};
                filtered.forEach(p => {
                  if (!byScenario[p.scenario_id]) byScenario[p.scenario_id] = { name: p.scenario_name, code: p.scenario_code, type: p.scenario_type, versions: [] };
                  byScenario[p.scenario_id].versions.push(p);
                });
                return Object.entries(byScenario).map(([sid, sc]) => (
                  <div key={sid}>
                    {Object.keys(byScenario).length > 1 && (
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4,marginTop:4}}>
                        {sc.name} <ScenarioTypeBadge type={sc.type}/>
                      </div>
                    )}
                    {sc.versions.map(plan => (
                      <PlanCard
                        key={plan.version_id}
                        plan={plan}
                        isSelected={selectedVersion?.version_id===plan.version_id}
                        onOpen={()=>handleOpenPlan(plan)}
                        onDelete={()=>handleDeleteVersion(plan)}
                      />
                    ))}
                  </div>
                ));
              })()}
            </div>
          )
        )}
      </div>

      {/* Selected plan header */}
      {selectedScenario&&selectedVersion&&(
        <div style={{padding:"10px 20px",background:"var(--brand)",borderRadius:"var(--radius-md)",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:0}}>
          <div style={{color:"#fff"}}>
            <span style={{fontWeight:700,fontSize:14}}>{selectedScenario.scenario_name}</span>
            <span style={{fontSize:12,opacity:0.8,marginLeft:10}}>{selectedVersion.version_name}{selectedVersion.is_locked&&" 🔒"}</span>
            <span style={{fontSize:11,opacity:0.6,marginLeft:10}}>· Правила, генерація та фільтрація нижче</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleClosePlan} style={{fontSize:11,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",color:"#fff"}}>
            ✕ Закрити план
          </button>
        </div>
      )}

            {/* ══ BLOCK 2 — Planning Rules ═════════════════════════════════════════ */}
      {selectedScenario&&selectedVersion&&(
        <div className="content-card">
          <div className="card-top">
            <div className="card-title-block">
              <h2>Правила планування</h2>
              <p>Кожне правило має scope (до кого) і ефекти (що робимо). Один scope — багато ефектів/періодів.</p>
            </div>
            {!selectedVersion.is_locked&&(
              <button className="btn btn-secondary btn-sm" onClick={()=>{setShowCreateRule(s=>!s);setCreateRuleErr(null);setNewRuleName("");setNewRuleScopes([]);setNewRuleEffects([])}}>
                {showCreateRule?"Скасувати":"+ Нове правило"}
              </button>
            )}
          </div>

          {/* Create rule form */}
          {showCreateRule&&!selectedVersion.is_locked&&(
            <div className="rule-form rule-form-create" style={{marginBottom:16}}>
              <div className="rule-form-mode-label">Нове правило</div>
              <div className="form-field" style={{maxWidth:400,marginBottom:12}}>
                <label>Назва правила</label>
                <input type="text" value={newRuleName} onChange={e=>setNewRuleName(e.target.value)} placeholder="HD + Тернопіль: сезонний план"/>
              </div>
              {renderScopeBuilder(newRuleScopes,setNewRuleScopes)}
              <div style={{marginTop:12}}>
                <div className="rule-form-scope-title" style={{marginBottom:6}}>
                  Ефекти / Розклад
                  {newRuleEffects.length === 0 && <span style={{fontSize:10,color:"var(--danger)",marginLeft:8}}>— обов'язково додайте хоча б один</span>}
                </div>

                {/* Added effects list (read-only summary) */}
                {newRuleEffects.length > 0 && (
                  <table className="data-table compact" style={{fontSize:11,marginBottom:6}}>
                    <thead><tr><th>Тип</th><th>Ефект, %</th><th>Прит.</th><th>Від</th><th>По</th><th style={{textAlign:"center",width:48}}>Акт.</th><th style={{width:36}}></th></tr></thead>
                    <tbody>
                      {newRuleEffects.map((e,i)=>(
                        <tr key={i}>
                          <td><RuleTypeBadge type={e.rule_type}/></td>
                          <td className={`amount-cell ${e.effect_percent>0?"diff-pos":e.effect_percent<0?"diff-neg":"diff-zero"}`}>{e.effect_percent>0?"+":""}{Number(e.effect_percent).toFixed(1)}%</td>
                          <td style={{color:"var(--text-muted)"}}>{e.priority}</td>
                          <td><PeriodChip from={e.period_from} to={e.period_to}/></td>
                          <td></td>
                          <td style={{textAlign:"center"}}><input type="checkbox" checked={e.is_active} onChange={ev=>setNewRuleEffects(p=>p.map((x,j)=>j===i?{...x,is_active:ev.target.checked}:x))}/></td>
                          <td style={{textAlign:"center"}}><button className="btn btn-secondary btn-sm" onClick={()=>setNewRuleEffects(p=>p.filter((_,j)=>j!==i))} style={{padding:"1px 5px",fontSize:11}} title="Видалити">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Add effect form — separate div, NOT a table row */}
                <AddEffectForm onAdd={ef => setNewRuleEffects(p => [...p, ef])} />
              </div>
              {createRuleErr&&<div className="field-error" style={{marginTop:8}}>{createRuleErr}</div>}
              <div className="rule-form-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleCreateRule}
                  disabled={createRuleBusy || !newRuleName.trim() || newRuleEffects.length === 0}
                  title={newRuleEffects.length === 0 ? "Додайте хоча б один ефект" : undefined}
                >
                  {createRuleBusy ? "Створення…" : "Створити правило"}
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rulesLoading?<div className="loading-state"><div className="loading-spinner"/><div className="loading-message">Завантаження…</div></div>:rules.length===0?(
            <div className="note" style={{margin:0}}>Немає правил. Без правил план = факт × глобальні ефекти.</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {rules.map(rule=>{
                const isEditing=editingRuleId===rule.rule_id;
                const effectCount=(rule.effects||[]).length;
                const activeEffects=(rule.effects||[]).filter(e=>e.is_active).length;
                return(
                  <div key={rule.rule_id} style={{border:`1px solid ${isEditing?"#f59e0b":"var(--border)"}`,borderRadius:"var(--radius-md)",overflow:"hidden",opacity:rule.is_active?1:0.55}}>
                    {/* Rule header row */}
                    <div style={{padding:"10px 14px",background:isEditing?"#fff8f0":"var(--surface)",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <input type="checkbox" checked={rule.is_active} onChange={()=>handleToggleRule(rule)} disabled={selectedVersion.is_locked} title="Активне" style={{cursor:"pointer",flexShrink:0}}/>
                      {isEditing?(
                        <input type="text" value={editRuleName} onChange={e=>setEditRuleName(e.target.value)}
                          style={{fontWeight:600,fontSize:13,border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:"2px 8px",flex:1,minWidth:200}}/>
                      ):(
                        <span style={{fontWeight:600,fontSize:13,flex:1,minWidth:0}}>{rule.rule_name}</span>
                      )}
                      <span style={{fontSize:11,color:"var(--text-muted)",flexShrink:0}}>{effectCount} ефект{effectCount===1?"":"ів"} · {activeEffects} активних</span>
                      <ScopeChips scopes={rule.scopes}/>
                      {!selectedVersion.is_locked&&(
                        <div style={{display:"flex",gap:4,flexShrink:0}}>
                          {isEditing?(
                            <>
                              <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={editRuleBusy} style={{padding:"2px 8px",fontSize:11,background:"#d97706",borderColor:"#d97706"}}>{editRuleBusy?"…":"✓ Зберегти"}</button>
                              <button className="btn btn-secondary btn-sm" onClick={handleCancelEdit} style={{padding:"2px 8px",fontSize:11}}>Скасувати</button>
                            </>
                          ):(
                            <>
                              <button className="btn btn-secondary btn-sm" onClick={()=>handleStartEdit(rule)} style={{padding:"2px 8px",fontSize:11}} title="Редагувати назву/scope">✏</button>
                              <button className="btn btn-secondary btn-sm" onClick={()=>handleCopyRule(rule.rule_id)} style={{padding:"2px 8px",fontSize:11}} title="Копіювати правило">⎘</button>
                              <button className="btn btn-secondary btn-sm" onClick={()=>handleDeleteRule(rule.rule_id)} style={{padding:"2px 8px",fontSize:11}} title="Видалити">✕</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Scope builder for edit */}
                    {isEditing&&(
                      <div style={{padding:"8px 14px",borderTop:"1px solid #fde68a",background:"#fffbeb"}}>
                        {renderScopeBuilder(editRuleScopes,setEditRuleScopes)}
                        {editRuleErr&&<div className="field-error" style={{marginTop:4,fontSize:11}}>{editRuleErr}</div>}
                      </div>
                    )}

                    {/* Effects summary (collapsed) or table (expanded on edit) */}
                    <div style={{padding:"6px 14px 10px",borderTop:"1px solid var(--border)",background:"var(--gray-50)"}}>
                      {isEditing?(
                        <EffectsTable effects={rule.effects||[]} ruleId={rule.rule_id} locked={selectedVersion.is_locked} onEffectsChange={newEff=>handleEffectsChange(rule.rule_id,newEff)}/>
                      ):(
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:"var(--text-muted)",flexShrink:0}}>Ефекти:</span>
                          {effectsSummary(rule.effects)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ BLOCK 2.4 — Planning Readiness ══════════════════════════════════ */}
      {selectedScenario&&selectedVersion&&(
        <div className="content-card">
          <div className="card-top">
            <div className="card-title-block">
              <h2>Готовність даних до планування</h2>
              <p>Перевірка маппінгу та покриття вимірів у fact_turnover</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadReadiness} disabled={readinessLoading}>{readinessLoading?"…":"↻ Перевірити"}</button>
          </div>
          {readiness&&(
            <div>
              {/* Main KPI */}
              <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 20px",background:readiness.planning_ready_pct>=95?"#d1fae5":readiness.planning_ready_pct>=70?"#fef3c7":"#fee2e2",borderRadius:"var(--radius-md)",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:28,fontWeight:800,color:readiness.planning_ready_pct>=95?"#065f46":readiness.planning_ready_pct>=70?"#92400e":"#991b1b"}}>{readiness.planning_ready_pct??0}%</div>
                  <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600}}>Planning Ready</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,flex:1}}>
                  {[
                    {label:"Dept mapping",val:readiness.mapped_department_pct,warn:readiness.mapped_department_pct<100},
                    {label:"Brand mapping",val:readiness.mapped_brand_pct,warn:readiness.mapped_brand_pct<80},
                    {label:"Регіон",val:readiness.region_pct,warn:readiness.region_pct<90},
                    {label:"Філія",val:readiness.branch_pct,warn:readiness.branch_pct<90},
                    {label:"Організація",val:readiness.org_pct,warn:readiness.org_pct<90},
                    {label:"Холдинг",val:readiness.holding_pct,warn:readiness.holding_pct<90},
                  ].map(({label,val,warn})=>(
                    <div key={label} style={{padding:"6px 10px",background:"var(--gray-50)",border:`1px solid ${warn&&val<90?"#fca5a5":"var(--border)"}`,borderRadius:"var(--radius-md)"}}>
                      <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:600,marginBottom:1}}>{label}</div>
                      <div style={{fontSize:15,fontWeight:700,color:val>=95?"#065f46":val>=70?"#92400e":"#991b1b"}}>{val??0}%</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Warnings */}
              {readiness.warnings?.length>0&&(
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {readiness.warnings.map((w,i)=>(
                    <div key={i} style={{fontSize:12,color:"#92400e",background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:5,padding:"4px 10px",display:"flex",alignItems:"center",gap:6}}>
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}
              {readiness.warnings?.length===0&&(
                <div className="note" style={{margin:0}}>Всі виміри мають достатнє покриття. Правила планування зможуть використовувати region/branch/org фільтри.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ BLOCK 2.5 — Department Mapping Coverage ══════════════════════════ */}
      {selectedScenario&&selectedVersion&&(
        <div className="content-card">
          <div className="card-top">
            <div className="card-title-block">
              <h2>Покриття відповідності підрозділів</h2>
              <p>Перевірка наявності маппінгу для підрозділів із fact_turnover</p>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button className="btn btn-secondary btn-sm" onClick={loadDeptCoverage} disabled={deptCoverLoading}>
                {deptCoverLoading?"…":"↻ Оновити"}
              </button>
              {setActivePage&&(
                <button className="btn btn-secondary btn-sm" onClick={()=>setActivePage("departmentSourceMapping",{})}>
                  Відкрити відповідність підрозділів →
                </button>
              )}
            </div>
          </div>
          {deptCoverage&&(
            <div>
              {/* KPI row */}
              <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
                {[
                  {label:"Fact rows",value:(deptCoverage.total_fact_rows||0).toLocaleString("uk-UA"),color:"#374151"},
                  {label:"Mapped dept",value:(deptCoverage.mapped_departments||0).toLocaleString("uk-UA"),color:"#065f46"},
                  {label:"Unmapped dept",value:(deptCoverage.unmapped_departments||0).toLocaleString("uk-UA"),color:(deptCoverage.unmapped_departments||0)>0?"#b91c1c":"#374151"},
                  {label:"Coverage %",value:`${deptCoverage.coverage_pct??0}%`,color:(deptCoverage.coverage_pct??0)>=95?"#065f46":(deptCoverage.coverage_pct??0)>=70?"#92400e":"#b91c1c"},
                  {label:"Unique dept у fact",value:(deptCoverage.unique_fact_departments||0).toLocaleString("uk-UA"),color:"#374151"},
                  {label:"Sales VAT unmapped",value:fmt(deptCoverage.unmapped_sales_vat),color:(deptCoverage.unmapped_sales_vat||0)>0?"#b91c1c":"#374151"},
                ].map(({label,value,color})=>(
                  <div key={label} style={{padding:"8px 14px",background:"var(--gray-50)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",minWidth:120}}>
                    <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>{label}</div>
                    <div style={{fontSize:16,fontWeight:700,color}}>{value}</div>
                  </div>
                ))}
              </div>
              {/* Unmapped table */}
              {deptCoverage.unmapped_depts?.length>0&&(
                <div>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:6,color:"var(--danger)"}}>
                    Unmapped підрозділи у fact_turnover ({deptCoverage.unmapped_depts.length})
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{marginLeft:10,fontSize:11,background:"#f0f9ff",borderColor:"#7dd3fc",color:"#0c4a6e",opacity:uidAutoMatching?0.6:1}}
                      disabled={uidAutoMatching}
                      title="Автоматично прив'язати unmapped UID через normalized UID — якщо той самий UID вже прив'язаний в іншому джерелі"
                      onClick={async()=>{
                        setUidAutoMatching(true); setUidAutoMatchResult(null);
                        try{
                          const res=await autoMatchByUid();
                          setUidAutoMatchResult(res.auto_matched);
                          loadDeptCoverage();
                        }catch{setUidAutoMatchResult(-1);}
                        finally{setUidAutoMatching(false);}
                      }}>
                      {uidAutoMatching?"…":"⚡ Auto-match UID"}
                      {uidAutoMatchResult!==null&&uidAutoMatchResult>=0&&
                        <span style={{marginLeft:5,color:uidAutoMatchResult>0?"#16a34a":"#64748b"}}>({uidAutoMatchResult})</span>}
                      {uidAutoMatchResult===-1&&<span style={{marginLeft:5,color:"#dc2626"}}>!</span>}
                    </button>
                    {setActivePage&&(
                      <button className="btn btn-secondary btn-sm" style={{marginLeft:6,fontSize:11}}
                        onClick={()=>setActivePage("departmentSourceMapping",{})}>
                        Виправити у відповідності →
                      </button>
                    )}
                  </div>
                  <div style={{maxHeight:280,overflow:"auto"}}>
                    <table className="data-table compact" style={{fontSize:11}}>
                      <thead><tr><th>Dept UID</th><th>Назва (fact)</th><th style={{textAlign:"right"}}>Рядків</th><th style={{textAlign:"right"}}>Виручка з ПДВ</th><th>Impact</th><th>Planning</th><th>Джерело</th><th></th></tr></thead>
                      <tbody>
                        {deptCoverage.unmapped_depts.map(r=>(
                          <tr key={`${r.source_id}_${r.department_uid}`}>
                            <td style={{fontFamily:"var(--font-mono)",fontSize:10,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.department_uid}>{r.department_uid||"—"}</td>
                            <td>{r.department_name_from_fact||"—"}</td>
                            <td className="amount-cell">{(r.rows_count||0).toLocaleString("uk-UA")}</td>
                            <td className="amount-cell">{fmt(r.sales_vat_sum)}</td>
                            <td style={{fontSize:10,fontWeight:700,color:r.impact_level==="HIGH"?"#991b1b":r.impact_level==="MEDIUM"?"#92400e":"#374151",background:r.impact_level==="HIGH"?"#fee2e2":r.impact_level==="MEDIUM"?"#fef3c7":"#f9fafb",padding:"1px 6px",borderRadius:4,border:"1px solid currentColor"}}>{r.impact_level||"—"}</td>
                            <td style={{fontSize:10,color:r.planning_impact==="Used in Planning"?"#1e40af":"var(--text-muted)"}}>{r.planning_impact||"—"}</td>
                            <td style={{color:"var(--text-muted)"}}>{r.source_id}</td>
                            <td><button className="btn btn-secondary btn-sm" style={{fontSize:10,padding:"1px 8px",whiteSpace:"nowrap",background:"#eff6ff",borderColor:"#3b82f6",color:"#1e40af"}} onClick={()=>setMapDeptRow(r)}>+ Прив'язати</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {deptCoverage.unmapped_depts?.length===0&&(
                <div className="note" style={{margin:0}}>Усі підрозділи, які використовуються у продажах, вже замаплені. Planning coverage = 100%.</div>
              )}
            </div>
          )}
          {!deptCoverage&&!deptCoverLoading&&(
            <div className="note" style={{margin:0}}>Натисніть "Оновити" щоб перевірити покриття маппінгу.</div>
          )}
        </div>
      )}

      {/* ══ BLOCK 3 — Generate ══════════════════════════════════════════════ */}
      {selectedScenario&&selectedVersion&&(
        <div className="content-card">
          <div className="card-top">
            <div className="card-title-block">
              <h2>Генерація плану</h2>
              <p><strong>{selectedScenario.scenario_name}</strong> · <strong>{selectedVersion.version_name}</strong>
                {selectedVersion.is_locked&&<span style={{color:"var(--danger)",marginLeft:8}}>🔒 Заблоковано</span>}
                {activeEffectsCount>0&&<span style={{marginLeft:8,color:"var(--brand)"}}>· {activeEffectsCount} активних ефектів у {rules.filter(r=>r.is_active).length} правилах</span>}
              </p>
            </div>
          </div>
          {selectedVersion.is_locked?<div className="note">Версія заблокована. Для генерації створіть нову версію.</div>:(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:16}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Базовий період (факт)</div>
                  <div className="form-grid">
                    <div className="form-field"><label>Від</label><input type="date" value={genForm.base_period_from} onChange={e=>setGF("base_period_from",e.target.value)}/></div>
                    <div className="form-field"><label>До</label><input type="date" value={genForm.base_period_to} onChange={e=>setGF("base_period_to",e.target.value)}/></div>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Цільовий період (план)</div>
                  <div className="form-grid">
                    <div className="form-field"><label>Від</label><input type="date" value={genForm.target_period_from} onChange={e=>setGF("target_period_from",e.target.value)}/></div>
                    <div className="form-field"><label>До</label><input type="date" value={genForm.target_period_to} onChange={e=>setGF("target_period_to",e.target.value)}/></div>
                  </div>
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Глобальний ефект (рядки без специфічного правила)</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
                  <div className="form-field"><label>Виручка, %</label><input type="number" step="0.1" value={genForm.global_revenue_pct} onChange={e=>setGF("global_revenue_pct",e.target.value)}/></div>
                  <div className="form-field"><label>Об'єм, %</label><input type="number" step="0.1" value={genForm.global_volume_pct} onChange={e=>setGF("global_volume_pct",e.target.value)}/></div>
                  <div className="form-field"><label>Ціна, %</label><input type="number" step="0.1" value={genForm.global_price_pct} onChange={e=>setGF("global_price_pct",e.target.value)}/></div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <label className="checkbox-label"><input type="checkbox" checked={genForm.replace_existing} onChange={e=>setGF("replace_existing",e.target.checked)}/>Замінити існуючі рядки цільового періоду</label>
                <button className="btn btn-success" onClick={handleGenerate} disabled={!canGenerate} style={{marginLeft:"auto"}}>{generating?"Генерація…":"▶ Згенерувати план"}</button>
              </div>
              {genError&&<div className="error-message" style={{marginTop:12}}>{genError}</div>}
            </>
          )}

          {genResult&&(
            <div className="gen-result-block">
              <div className="gen-result-title">Генерація завершена</div>
              <div className="gen-stats-grid">
                {[
                  {label:"Запуск №",value:genResult.generation_id,warn:false},
                  {label:"Рядків",value:(genResult.generated_rows||0).toLocaleString("uk-UA"),warn:false},
                  {label:"Місяців",value:genResult.months_processed,warn:false},
                  {label:"Без правил",value:(genResult.rows_without_rules??0).toLocaleString("uk-UA"),warn:(genResult.rows_without_rules??0)>0},
                  {label:"Ефектів",value:genResult.rules_applied??0,warn:false},
                  {label:"Видалено",value:(genResult.deleted_rows||0).toLocaleString("uk-UA"),warn:false},
                ].map(({label,value,warn})=>(
                  <div key={label} className={`gen-stat-item${warn?" stat-warn":""}`}>
                    <div className="gen-stat-label">{label}</div>
                    <div className="gen-stat-value">{value??"—"}</div>
                  </div>
                ))}
              </div>
              <div className="gen-result-meta">
                <div className="gen-result-meta-item"><span className="gen-result-meta-label">Метод:</span><span className="gen-result-meta-value">{genResult.generation_method||"rule_engine"}</span></div>
                <div className="gen-result-meta-item"><span className="gen-result-meta-label">Замінити:</span><span className={`gen-result-meta-value ${genForm.replace_existing?"meta-yes":"meta-no"}`}>{genForm.replace_existing?"так":"ні"}</span></div>
              </div>
              {genResult.rules_coverage?.length>0&&(
                <div className="coverage-block">
                  <div className="coverage-title">Покриття ефектів</div>
                  <div style={{overflowX:"auto"}}>
                  <table className="data-table compact" style={{minWidth:900,fontSize:11}}>
                    <thead>
                      <tr>
                        <th style={{minWidth:120}}>Правило</th>
                        <th style={{minWidth:100}}>Умови</th>
                        <th>Тип</th><th>Ефект</th><th style={{minWidth:110}}>Від → По</th>
                        <th style={{textAlign:"right",minWidth:60}}>Рядків</th>
                        <th style={{textAlign:"right",minWidth:70}}>-Period</th>
                        <th style={{textAlign:"right",minWidth:70}}>-Scope</th>
                        <th style={{textAlign:"right",minWidth:70}}>-Mapping</th>
                        <th style={{minWidth:220}}>Пояснення</th>
                      </tr>
                    </thead>
                    <tbody>
                      {genResult.rules_coverage.map(rc=>(
                        <tr key={rc.effect_id} className={rc.affected_rows===0?"coverage-row-warn":""}>
                          <td style={{fontWeight:500,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={rc.rule_name}>{rc.rule_name}</td>
                          <td><ScopeChips scopes={rc.scopes||[]}/></td>
                          <td><RuleTypeBadge type={rc.rule_type}/></td>
                          <td className={`amount-cell ${rc.effect_percent>0?"diff-pos":rc.effect_percent<0?"diff-neg":"diff-zero"}`}>{rc.effect_percent>0?"+":""}{Number(rc.effect_percent||0).toFixed(1)}%</td>
                          <td><PeriodChip from={rc.period_from} to={rc.period_to}/></td>
                          <td className="amount-cell" style={{fontWeight:rc.affected_rows>0?600:400,color:rc.affected_rows===0?"var(--danger)":undefined}}>{(rc.affected_rows||0).toLocaleString("uk-UA")}</td>
                          <td className="amount-cell" style={{color:rc.rows_excluded_by_period>0?"var(--danger)":"var(--text-muted)"}}>{rc.rows_excluded_by_period>0?`-${rc.rows_excluded_by_period.toLocaleString("uk-UA")}`:"—"}</td>
                          <td className="amount-cell" style={{color:rc.rows_excluded_by_scope>0?"var(--danger)":"var(--text-muted)"}}>{rc.rows_excluded_by_scope>0?`-${rc.rows_excluded_by_scope.toLocaleString("uk-UA")}`:"—"}</td>
                          <td className="amount-cell" style={{color:rc.rows_excluded_by_missing_mapping>0?"#b45309":"var(--text-muted)"}}>{rc.rows_excluded_by_missing_mapping>0?`-${rc.rows_excluded_by_missing_mapping.toLocaleString("uk-UA")}`:"—"}</td>
                          <td style={{fontSize:10,color:rc.explanation?"var(--danger)":"var(--text-muted)",lineHeight:1.3}}>{rc.explanation||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ BLOCK 4 — Fact vs Plan ══════════════════════════════════════════ */}
      {selectedScenario&&selectedVersion&&(
        <div className="content-card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--border)",background:"var(--gray-50)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:13,fontWeight:700}}>Факт vs План · {selectedScenario.scenario_name} / {selectedVersion.version_name}</div>
            {planData&&<div style={{fontSize:11,color:"var(--text-muted)"}}>{planData.total_count.toLocaleString("uk-UA")} рядків</div>}
          </div>

          {planData&&planData.total_count>0&&(
            <div className="plan-kpi-section">
              <PlanKpiGroup label="з ПДВ" fact={planData.total_fact_sales_vat} plan={planData.total_plan_sales_vat} diff={planData.total_diff_vat} diffPct={planData.total_diff_vat_pct} fmtFn={fmt}/>
              <PlanKpiGroup label="кг" fmtFn={fmtN} fact={planData.total_fact_sales_kg} plan={planData.total_plan_sales_kg} diff={planData.total_diff_kg} diffPct={planData.total_diff_kg_pct}/>
              <PlanKpiGroup label="дал" fmtFn={fmtN} fact={planData.total_fact_sales_dal} plan={planData.total_plan_sales_dal} diff={planData.total_diff_dal} diffPct={planData.total_diff_dal_pct}/>
            </div>
          )}

          {/* Filter bar */}
          <div style={{padding:"10px 20px",borderBottom:"1px solid var(--border)"}}>
            <div className="filter-bar" style={{marginBottom:0}}>
              <div className="filter-group"><label>Від</label><input type="date" value={periodFrom} onChange={e=>{setPeriodFrom(e.target.value);setPlanPage(1)}}/></div>
              <div className="filter-group"><label>По</label><input type="date" value={periodTo} onChange={e=>{setPeriodTo(e.target.value);setPlanPage(1)}}/></div>
              <div className="filter-group" style={{minWidth:170}}><label>Підрозділ</label><SearchableDropdown selected={deptSelected} onSelect={opt=>{setDeptSelected(opt?{value:opt.value,label:opt.label}:null);setPlanPage(1)}} fetchOptions={fetchPlanDepts} renderOption={renderSimpleOpt} placeholder="Пошук підрозділу..."/></div>
              <div className="filter-group" style={{minWidth:110}}><label>Dept UID</label><div className="filter-input-wrap"><input type="text" value={deptUidInput} onChange={e=>onDeptUidChange(e.target.value)} placeholder="0xAEFA..." disabled={!!deptSelected} style={{opacity:deptSelected?0.4:1}}/>{deptUidInput&&<button className="filter-clear" onClick={()=>onDeptUidChange("")}>×</button>}</div></div>
              <div className="filter-group" style={{minWidth:170}}><label>Товарна група</label><SearchableDropdown selected={pgSelected} onSelect={opt=>{setPgSelected(opt?{value:opt.value,label:opt.label}:null);setPlanPage(1)}} fetchOptions={fetchPlanPGs} renderOption={renderSimpleOpt} placeholder="Пошук ТГ..."/></div>
              <div className="filter-group" style={{minWidth:100}}>
                <label>Регіон{readiness&&readiness.region_pct<90&&<span title={`Тільки ${readiness.region_pct}% рядків мають region mapping`} style={{marginLeft:4,cursor:"help",color:"#d97706"}}>⚠</span>}</label>
                <div className="filter-input-wrap"><input type="text" value={regionFilter} onChange={e=>onRegionChange(e.target.value)} placeholder="Захід..."/>{regionFilter&&<button className="filter-clear" onClick={()=>{setRegionFilter("");setRegionDebounced("");setPlanPage(1)}}>×</button>}</div>
              </div>
              <div className="filter-group" style={{minWidth:120}}>
                <label>Організація{readiness&&readiness.org_pct<90&&<span title={`Тільки ${readiness.org_pct}% рядків мають organization mapping`} style={{marginLeft:4,cursor:"help",color:"#d97706"}}>⚠</span>}</label>
                <div className="filter-input-wrap"><input type="text" value={orgFilter} onChange={e=>onOrgChange(e.target.value)} placeholder="Назва..."/>{orgFilter&&<button className="filter-clear" onClick={()=>{setOrgFilter("");setOrgDebounced("");setPlanPage(1)}}>×</button>}</div>
              </div>
              <div className="filter-group" style={{minWidth:100}}>
                <label>Філія{readiness&&readiness.branch_pct<90&&<span title={`Тільки ${readiness.branch_pct}% рядків мають branch mapping`} style={{marginLeft:4,cursor:"help",color:"#d97706"}}>⚠</span>}</label>
                <div className="filter-input-wrap"><input type="text" value={branchFilter} onChange={e=>onBranchChange(e.target.value)} placeholder="Філія..."/>{branchFilter&&<button className="filter-clear" onClick={()=>{setBranchFilter("");setBranchDebounced("");setPlanPage(1)}}>×</button>}</div>
              </div>
              {planLoading&&<span style={{fontSize:12,color:"var(--text-muted)",alignSelf:"flex-end"}}>…</span>}
            </div>
          </div>

          {planLoading&&!planData?<div className="loading-state"><div className="loading-spinner"/><div className="loading-message">Завантаження…</div></div>:!planData||planData.rows.length===0?(
            <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-message">{planData?.total_count===0?"Немає рядків. Спочатку згенеруйте план.":"Немає рядків за фільтром."}</div></div>
          ):(
            <div className="table-wrap-sticky">
              <table className="data-table compact" style={{minWidth:1980}}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{minWidth:68}}>Місяць</th><th rowSpan={2} style={{minWidth:110}}>Підрозділ</th><th rowSpan={2} style={{minWidth:110}}>Товарна група</th><th rowSpan={2} style={{minWidth:80}}>Холдинг</th><th rowSpan={2} style={{minWidth:90}}>Організація</th><th rowSpan={2} style={{minWidth:80}}>Філія</th><th rowSpan={2} style={{minWidth:68}}>Регіон</th>
                    <th colSpan={4} className="th-group-vat" style={{textAlign:"center"}}>з ПДВ</th>
                    <th colSpan={4} className="th-group-kg"  style={{textAlign:"center"}}>кг</th>
                    <th colSpan={4} className="th-group-dal" style={{textAlign:"center"}}>дал</th>
                    <th colSpan={2} className="th-group-price" style={{textAlign:"center"}}>Ціна/кг</th>
                    <th rowSpan={2} style={{minWidth:68,textAlign:"center"}}>Ефекти</th>
                    <th rowSpan={2} style={{minWidth:60,textAlign:"center"}}>Mapping</th>
                  </tr>
                  <tr>
                    {["Факт","План","Δ","Δ%"].map(h=><th key={`v${h}`} className="th-group-vat" style={{textAlign:"right"}}>{h}</th>)}
                    {["Факт","План","Δ","Δ%"].map(h=><th key={`k${h}`} className="th-group-kg"  style={{textAlign:"right"}}>{h}</th>)}
                    {["Факт","План","Δ","Δ%"].map(h=><th key={`d${h}`} className="th-group-dal" style={{textAlign:"right"}}>{h}</th>)}
                    {["Факт","План"].map(h=><th key={`p${h}`} className="th-group-price" style={{textAlign:"right"}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {planData.rows.map(r=>{
                    const appliedIds=Array.isArray(r.applied_rule_ids_json)?r.applied_rule_ids_json:[];
                    const hasNoRules=appliedIds.length===0;
                    return(
                      <tr key={r.id} className={hasNoRules?"row-no-rules":""}>
                        <td style={{whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{r.period_month?.slice(0,7)}</td>
                        <td style={{maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.department_name}>{r.department_name||"—"}</td>
                        <td style={{maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.product_group_name}>{r.product_group_name||"—"}</td>
                        <td style={{fontSize:11,maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text-muted)"}} title={r.holding_name}>{r.holding_name||"—"}</td>
                        <td style={{fontSize:11,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text-muted)"}} title={r.organization_name}>{r.organization_name||"—"}</td>
                        <td style={{fontSize:11,maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text-muted)"}} title={r.branch_name}>{r.branch_name||"—"}</td>
                        <td style={{fontSize:11,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--text-muted)"}}>{r.region_name||"—"}</td>
                        <td className="amount-cell">{fmt(r.fact_sales_vat)}</td>
                        <td className="amount-cell" style={{fontWeight:600}}>{fmt(r.plan_sales_vat)}</td>
                        <td className={`amount-cell ${diffCls(r.diff_sales_vat)}`}>{r.diff_sales_vat?fmt(r.diff_sales_vat):"—"}</td>
                        <td className={`amount-cell ${diffCls(r.diff_sales_vat_pct)}`}>{fmtPct(r.diff_sales_vat_pct)}</td>
                        <td className="amount-cell">{fmtN(r.fact_sales_kg)}</td>
                        <td className="amount-cell" style={{fontWeight:600}}>{fmtN(r.plan_sales_kg)}</td>
                        <td className={`amount-cell ${diffCls(r.diff_kg)}`}>{r.diff_kg?fmtN(r.diff_kg):"—"}</td>
                        <td className={`amount-cell ${diffCls(r.diff_kg_pct)}`}>{fmtPct(r.diff_kg_pct)}</td>
                        <td className="amount-cell">{fmtN(r.fact_sales_dal)}</td>
                        <td className="amount-cell" style={{fontWeight:600}}>{fmtN(r.plan_sales_dal)}</td>
                        <td className={`amount-cell ${diffCls(r.diff_dal)}`}>{r.diff_dal?fmtN(r.diff_dal):"—"}</td>
                        <td className={`amount-cell ${diffCls(r.diff_dal_pct)}`}>{fmtPct(r.diff_dal_pct)}</td>
                        <td className="amount-cell">{fmt(r.fact_price_per_kg,4)}</td>
                        <td className="amount-cell" style={{fontWeight:600}}>{fmt(r.plan_price_per_kg,4)}</td>
                        <td style={{textAlign:"center"}}><span title={`Ефектів: ${appliedIds.length}`} style={{fontSize:11,cursor:"default",color:appliedIds.length>0?"var(--brand)":"var(--text-muted)"}}>{appliedIds.length>0?`${appliedIds.length} еф.`:"—"}</span></td>
                        <td style={{textAlign:"center"}}>{r.mapping_status&&r.mapping_status!=="OK"&&(
                          <span title={r.mapping_status} style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:4,background:r.mapping_status==="NO_DEPARTMENT_MAPPING"?"#fee2e2":r.mapping_status==="NO_BRAND_MAPPING"?"#fef3c7":"#fff7ed",color:r.mapping_status==="NO_DEPARTMENT_MAPPING"?"#991b1b":r.mapping_status==="NO_BRAND_MAPPING"?"#92400e":"#c2410c",border:"1px solid currentColor"}}>
                            {r.mapping_status==="NO_DEPARTMENT_MAPPING"?"NO DEPT":r.mapping_status==="NO_BRAND_MAPPING"?"NO BRAND":"PARTIAL"}
                          </span>
                        )}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {planData&&planData.total_pages>1&&(
            <div style={{padding:"4px 20px 10px",borderTop:"1px solid var(--border)"}}><Pagination page={planPage} totalPages={planData.total_pages} total={planData.total_count} pageRows={planData.rows.length} onPage={setPlanPage}/></div>
          )}
        </div>
      )}

      {/* ══ BLOCK 5 — Generation History ════════════════════════════════════ */}
      {selectedScenario&&selectedVersion&&(
        <div className="content-card">
          <div className="card-top"><div className="card-title-block"><h2>Історія запусків</h2><p>Аудит генерацій для поточної версії</p></div><button className="btn btn-secondary btn-sm" onClick={loadGenLog} disabled={genLogLoading}>{genLogLoading?"…":"↻ Оновити"}</button></div>
          {genLogLoading&&!genLog?<div className="loading-state"><div className="loading-spinner"/><div className="loading-message">Завантаження…</div></div>:!genLog||genLog.rows.length===0?<div className="note" style={{margin:0}}>Немає запусків.</div>:(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {genLog.rows.map((g,idx)=>{
                const isLast=idx===0; const isOpen=expandedGen===g.generation_id;
                const runNum=genLog.total-(genLog.page-1)*genLog.page_size-idx;
                const appliedRules=Array.isArray(g.applied_rules_json)?g.applied_rules_json:[];
                return(
                  <div key={g.generation_id} style={{border:`1px solid ${isLast?"var(--brand)":"var(--border)"}`,borderRadius:"var(--radius-md)",overflow:"hidden"}}>
                    <div className={`gen-log-header ${isLast?"is-latest":""}`} onClick={()=>setExpandedGen(isOpen?null:g.generation_id)}>
                      <span className="gen-log-run-label">{isLast?"Останній":"Запуск"} №{runNum}</span>
                      <StatusBadge status={g.status}/>
                      <span style={{fontSize:12,color:"var(--text-muted)"}}>{fmtDt(g.started_at)}</span>
                      {g.created_by_name&&<span style={{fontSize:12,color:"var(--text-muted)"}}>· {g.created_by_name}</span>}
                      <span className="gen-log-meta">
                        {(g.generated_rows||0).toLocaleString("uk-UA")} рядків · {g.months_processed} міс. · {g.applied_rules_count||0} ефектів
                        {(g.rows_without_rules??0)>0&&<span className="coverage-warn-badge" style={{marginLeft:6}}>{g.rows_without_rules} без правил</span>}
                      </span>
                      <span style={{fontSize:12,color:"var(--text-muted)"}}>{isOpen?"▲":"▼"}</span>
                    </div>
                    {isOpen&&(
                      <div className="gen-log-detail">
                        <div className="gen-log-detail-grid">
                          {[
                            ["Базовий",`${g.base_period_from?.slice(0,7)} — ${g.base_period_to?.slice(0,7)}`],
                            ["Цільовий",`${g.target_period_from?.slice(0,7)} — ${g.target_period_to?.slice(0,7)}`],
                            ["Рядків",(g.generated_rows||0).toLocaleString("uk-UA")],
                            ["Без правил",(g.rows_without_rules??0).toLocaleString("uk-UA")],
                            ["Замінити",g.replace_existing?"так":"ні"],
                            ["Метод",g.generation_method||"rule_engine"],
                            ["Виручка global",`${g.global_revenue_pct??0}%`],
                            ["Об'єм global",`${g.global_volume_pct??0}%`],
                            ["Ціна global",`${g.global_price_pct??0}%`],
                            ["Завершено",fmtDt(g.finished_at)],
                          ].map(([k,v])=>(<div key={k} className="gen-log-detail-kv"><span className="gen-log-detail-key">{k}: </span><strong className="gen-log-detail-val">{v}</strong></div>))}
                        </div>
                        {g.error_message&&<div className="error-message" style={{marginBottom:10}}>{g.error_message}</div>}
                        {appliedRules.length>0&&(
                          <>
                            <div style={{fontWeight:600,marginBottom:6,fontSize:12}}>Правила на момент генерації ({appliedRules.length}):</div>
                            <table className="data-table compact" style={{fontSize:11}}>
                              <thead><tr><th>Правило</th><th>Умови</th><th>Ефекти (snapshot)</th></tr></thead>
                              <tbody>{appliedRules.map((rule,i)=>(
                                <tr key={i}>
                                  <td style={{fontWeight:500}}>{rule.rule_name}</td>
                                  <td><ScopeChips scopes={rule.scopes}/></td>
                                  <td>{(rule.effects||[]).map((e,j)=>(
                                    <span key={j} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,background:"var(--gray-100)",border:"1px solid var(--border)",borderRadius:6,padding:"1px 6px",marginRight:3}}>
                                      <RuleTypeBadge type={e.rule_type}/>
                                      <span className={e.effect_percent>0?"diff-pos":e.effect_percent<0?"diff-neg":"diff-zero"}>{e.effect_percent>0?"+":""}{Number(e.effect_percent||0).toFixed(1)}%</span>
                                      {(e.period_from||e.period_to)&&<PeriodChip from={e.period_from} to={e.period_to}/>}
                                    </span>
                                  ))}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AddEffectForm — form for adding a new effect (NOT a table row) ────────────
function AddEffectForm({ onAdd }) {
  const [form, setForm] = useState({ ...EMPTY_EFFECT });
  const [err,  setErr]  = useState(null);

  const handleAdd = () => {
    if (!form.rule_type)   { setErr("Оберіть тип ефекту"); return; }
    const ep = Number(form.effect_percent);
    if (form.effect_percent === "" || isNaN(ep)) { setErr("Вкажіть ефект % (число)"); return; }
    if (!form.period_from) { setErr("Вкажіть дату 'Від'"); return; }
    if (!form.period_to)   { setErr("Вкажіть дату 'По'"); return; }
    if (form.period_from > form.period_to) { setErr("'Від' має бути ≤ 'По'"); return; }
    const p = Number(form.priority);
    if (form.priority === "" || isNaN(p) || p < 0) { setErr("Пріоритет має бути числом ≥ 0"); return; }

    setErr(null);
    onAdd({
      rule_type:      form.rule_type,
      effect_percent: ep,
      period_from:    form.period_from,
      period_to:      form.period_to,
      priority:       p,
      is_active:      form.is_active,
    });
    setForm({ ...EMPTY_EFFECT }); // clear form, do NOT add another empty row
  };

  const setF = (part) => setForm(f => ({ ...f, ...part }));

  return (
    <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--gray-50)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Додати ефект</div>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.6fr 1fr 1fr", gap: 8, alignItems: "end" }}>
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: 10 }}>Тип ефекту</label>
          <select value={form.rule_type} onChange={e => setF({ rule_type: e.target.value })}>
            {Object.entries(RULE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: 10 }}>Ефект, %</label>
          <input type="number" step="0.1" value={form.effect_percent}
            onChange={e => setF({ effect_percent: e.target.value })} placeholder="5.0" />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: 10 }}>Прит.</label>
          <input type="number" step="1" min="0" value={form.priority}
            onChange={e => setF({ priority: e.target.value })} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: 10 }}>Від</label>
          <input type="date" value={form.period_from} onChange={e => setF({ period_from: e.target.value })} />
        </div>
        <div className="form-field" style={{ margin: 0 }}>
          <label style={{ fontSize: 10 }}>По</label>
          <input type="date" value={form.period_to} onChange={e => setF({ period_to: e.target.value })} />
        </div>
      </div>
      {err && <div className="field-error" style={{ marginTop: 6, fontSize: 11 }}>{err}</div>}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={handleAdd}>+ Додати ефект</button>
        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={form.is_active} onChange={e => setF({ is_active: e.target.checked })} />
          Активний
        </label>
      </div>
    </div>
  );
}
