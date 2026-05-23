import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Помилка входу. Перевірте дані.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-top"><span>Pro</span><span>Tec</span></div>
          <div className="logo-bottom">METRICORE</div>
        </div>

        <h2 className="login-title">Вхід до системи</h2>

        {sessionExpired && (
          <div className="error-message" style={{ marginBottom: 12, textAlign: "center" }}>
            Сесію завершено. Будь ласка, увійдіть повторно.
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              required
            />
          </div>
          <div className="form-field">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="error-message" style={{ marginBottom: 0 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: "100%", marginTop: 8 }}
          >
            {loading ? "Вхід..." : "Увійти"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
