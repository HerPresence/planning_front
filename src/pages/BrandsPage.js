import React, { useEffect, useState } from "react";
import { getBrands, createBrand, updateBrand, deactivateBrand, restoreBrand } from "../api/brandsApi";
import { useAuth } from "../contexts/AuthContext";

const EMPTY_FORM = { brand_uid: "", brand_name: "", brand_group: "", is_active: true };

function BrandModal({ brand, onSave, onClose }) {
  const [form, setForm] = useState(brand || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const isEdit = !!brand;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.brand_name.trim()) { setErr("Назва бренду обов'язкова"); return; }
    setSaving(true); setErr(null);
    try {
      if (isEdit) {
        await updateBrand(brand.id, form);
      } else {
        await createBrand(form);
      }
      onSave();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Помилка збереження");
    } finally { setSaving(false); }
  };

  const inp = { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, width: "100%", fontSize: 13 };
  const fieldRow = (label, key, required = false) => (
    <div className="form-field">
      <label>{label}{required && <span style={{ color: "#c33" }}> *</span>}</label>
      <input value={form[key] || ""} onChange={e => set(key, e.target.value)} style={inp} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 28, maxWidth: 480, width: "90%",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
           onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <strong style={{ fontSize: 16 }}>{isEdit ? "Редагувати бренд" : "Новий бренд"}</strong>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {fieldRow("Назва бренду", "brand_name", true)}
        {fieldRow("UID бренду", "brand_uid")}
        {fieldRow("Група", "brand_group")}
        {isEdit && (
          <div className="form-field">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={form.is_active}
                onChange={e => set("is_active", e.target.checked)} />
              Активний
            </label>
          </div>
        )}
        {err && (
          <div style={{ padding: "8px 12px", background: "#fee2e2", borderRadius: 6,
                        fontSize: 13, color: "#991b1b", marginBottom: 12 }}>{err}</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "..." : "Зберегти"}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}

export default function BrandsPage() {
  const { canEdit } = useAuth();
  const [brands,       setBrands]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [search,       setSearch]       = useState("");
  const [modal,        setModal]        = useState(null); // null | "new" | brand_obj
  const [error,        setError]        = useState(null);
  const [success,      setSuccess]      = useState(null);

  const load = async () => {
    setLoading(true);
    try { setBrands(await getBrands(showInactive)); }
    catch { setError("Помилка завантаження"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [showInactive]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeactivate = async (b) => {
    if (!window.confirm(`Деактивувати бренд "${b.brand_name}"?`)) return;
    try {
      await deactivateBrand(b.id);
      setSuccess(`Бренд "${b.brand_name}" деактивовано`);
      load();
    } catch (e) { setError(e?.response?.data?.detail || "Помилка"); }
  };

  const handleRestore = async (b) => {
    try {
      await restoreBrand(b.id);
      setSuccess(`Бренд "${b.brand_name}" відновлено`);
      load();
    } catch (e) { setError(e?.response?.data?.detail || "Помилка"); }
  };

  const filtered = brands.filter(b => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (b.brand_name || "").toLowerCase().includes(s)
        || (b.brand_uid  || "").toLowerCase().includes(s)
        || (b.brand_group || "").toLowerCase().includes(s);
  });

  const canEditBrands = canEdit("brands");

  return (
    <section className="content-card">
      {modal && (
        <BrandModal
          brand={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load(); setSuccess("Збережено"); }}
        />
      )}

      {error && (
        <div className="error-message" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c33" }}>✕</button>
        </div>
      )}
      {success && (
        <div className="success-message" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Пошук бренду..."
          style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 4,
                   minWidth: 220, fontSize: 13 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Показати неактивні
        </label>
        <div style={{ marginLeft: "auto" }}>
          {canEditBrands && (
            <button className="btn btn-primary" onClick={() => setModal("new")}>+ Додати бренд</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Завантаження...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>ID</th>
                <th>Назва бренду</th>
                <th>UID</th>
                <th>Група</th>
                <th style={{ width: 90, textAlign: "center" }}>Статус</th>
                {canEditBrands && <th style={{ width: 120 }}>Дії</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEditBrands ? 6 : 5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
                    {search ? "Нічого не знайдено" : "Брендів ще немає"}
                  </td>
                </tr>
              )}
              {filtered.map(b => (
                <tr key={b.id} style={{ opacity: b.is_active ? 1 : 0.55 }}>
                  <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{b.id}</td>
                  <td style={{ fontWeight: 500 }}>{b.brand_name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>
                    {b.brand_uid || <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {b.brand_group || <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {b.is_active
                      ? <span style={{ background: "#d1fae5", color: "#065f46", borderRadius: 4,
                                       padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>Активний</span>
                      : <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 4,
                                       padding: "2px 8px", fontSize: 11 }}>Неактивний</span>
                    }
                  </td>
                  {canEditBrands && (
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ fontSize: 12, color: "var(--primary)", background: "none",
                                         border: "none", cursor: "pointer", padding: 0 }}
                          onClick={() => setModal(b)}>
                          Редагувати
                        </button>
                        {b.is_active ? (
                          <button style={{ fontSize: 12, color: "#991b1b", background: "none",
                                           border: "none", cursor: "pointer", padding: 0 }}
                            onClick={() => handleDeactivate(b)}>
                            Деактивувати
                          </button>
                        ) : (
                          <button style={{ fontSize: 12, color: "#065f46", background: "none",
                                           border: "none", cursor: "pointer", padding: 0 }}
                            onClick={() => handleRestore(b)}>
                            Відновити
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Всього: {filtered.length} {filtered.length !== brands.length && `(з ${brands.length})`}
          </div>
        </div>
      )}
    </section>
  );
}
