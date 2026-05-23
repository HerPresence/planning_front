import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { changePassword } from "../api/authApi";

const POLICY_RULES = [
  { id: "len",     label: "Мінімум 8 символів",              test: (p) => p.length >= 8 },
  { id: "upper",   label: "Мінімум 1 велика літера (A–Z)",   test: (p) => /[A-Z]/.test(p) },
  { id: "lower",   label: "Мінімум 1 мала літера (a–z)",     test: (p) => /[a-z]/.test(p) },
  { id: "digit",   label: "Мінімум 1 цифра (0–9)",           test: (p) => /\d/.test(p) },
  { id: "special", label: "Мінімум 1 спецсимвол (!@#$…)",    test: (p) => /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/.test(p) },
];

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ProfilePage({ forceMode = false }) {
  const { currentUser, setForceChangePassword, refreshMe } = useAuth();

  const [currentPw,  setCurrentPw]  = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);
  const [success,    setSuccess]    = useState(false);

  const policyPassed = POLICY_RULES.every((r) => r.test(newPw));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (newPw !== confirmPw) { setError("Паролі не співпадають"); return; }
    if (!policyPassed)       { setError("Пароль не відповідає вимогам безпеки"); return; }
    setSaving(true);
    try {
      await changePassword({ current_password: currentPw, new_password: newPw, confirm_password: confirmPw });
      setSuccess(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setForceChangePassword(false);
      await refreshMe();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Помилка зміни пароля");
    } finally {
      setSaving(false);
    }
  };

  const passwordForm = (
    <form onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
      <div className="form-field" style={{ marginBottom: 14 }}>
        <label>Поточний пароль *</label>
        <input
          type="password"
          value={currentPw}
          onChange={(e) => { setCurrentPw(e.target.value); setError(null); setSuccess(false); }}
          placeholder="••••••••"
          required
          autoFocus={forceMode}
        />
      </div>

      <div className="form-field" style={{ marginBottom: 14 }}>
        <label>Новий пароль *</label>
        <input
          type="password"
          value={newPw}
          onChange={(e) => { setNewPw(e.target.value); setError(null); setSuccess(false); }}
          placeholder="••••••••"
          required
        />
      </div>

      <div className="form-field" style={{ marginBottom: 16 }}>
        <label>Підтвердження нового пароля *</label>
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => { setConfirmPw(e.target.value); setError(null); setSuccess(false); }}
          placeholder="••••••••"
          required
        />
      </div>

      {/* Live policy checklist */}
      <div style={{
        background: "var(--gray-50)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: 16
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8 }}>
          Вимоги до пароля
        </div>
        {POLICY_RULES.map((r) => {
          const ok = newPw.length > 0 && r.test(newPw);
          const neutral = newPw.length === 0;
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 13, color: neutral ? "var(--text-muted)" : ok ? "var(--success)" : "var(--danger)" }}>
              <span style={{ fontSize: 15, lineHeight: 1, fontWeight: 700, width: 16, textAlign: "center" }}>
                {neutral ? "·" : ok ? "✓" : "✕"}
              </span>
              {r.label}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>
      )}
      {success && (
        <div className="success-message" style={{ marginBottom: 12 }}>
          Пароль успішно змінено
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={saving}
        style={{ width: "100%" }}
      >
        {saving ? "Збереження..." : "Змінити пароль"}
      </button>
    </form>
  );

  if (forceMode) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", background: "var(--bg)", padding: 24,
      }}>
        <div style={{
          background: "var(--surface)", borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-xl)", padding: 40, width: "100%", maxWidth: 480,
        }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              Зміна тимчасового пароля
            </div>
            <div style={{
              background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
              borderRadius: "var(--radius-md)", padding: "10px 14px",
              color: "var(--warning)", fontSize: 13,
            }}>
              Необхідно змінити тимчасовий пароль перед продовженням роботи.
            </div>
          </div>
          {passwordForm}
        </div>
      </div>
    );
  }

  return (
    <section className="content-card">
      <div style={{ maxWidth: 700 }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Мій профіль</h2>
        <p style={{ color: "var(--text-muted)", marginTop: 0, marginBottom: 28 }}>
          Особисті дані та безпека облікового запису
        </p>

        {/* User info */}
        <div style={{
          background: "var(--gray-50)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: "20px 24px", marginBottom: 28,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 14 }}>
            Облікові дані
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
            <ProfileField label="ПІБ"             value={currentUser?.full_name} />
            <ProfileField label="Email"            value={currentUser?.email} mono />
            <ProfileField label="Ролі"             value={(currentUser?.roles || (currentUser?.is_admin ? ["Admin"] : [])).join(", ") || "—"} />
            <ProfileField label="Останній вхід"   value={fmt(currentUser?.last_login_at)} />
            <ProfileField label="Пароль змінено"  value={fmt(currentUser?.password_changed_at)} />
          </div>
        </div>

        {/* Change password */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: "20px 24px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 18 }}>
            Змінити пароль
          </div>
          {passwordForm}
        </div>
      </div>
    </section>
  );
}

function ProfileField({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: "var(--text-primary)", fontFamily: mono ? "var(--font-mono)" : undefined }}>
        {value || "—"}
      </div>
    </div>
  );
}

export default ProfilePage;
