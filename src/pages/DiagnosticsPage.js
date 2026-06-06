import React, { useEffect, useState, useCallback } from "react";
import { API_BASE_URL } from "../api/apiConfig";

const RUNTIME_URL = `${API_BASE_URL}/system/runtime-info`;

function Row({ label, value, mono = true, ok, warn, err }) {
  const color = err ? "#dc2626" : warn ? "#d97706" : ok ? "#16a34a" : "#374151";
  return (
    <tr>
      <td style={{ padding: "4px 12px 4px 0", color: "#6b7280", whiteSpace: "nowrap", verticalAlign: "top", fontSize: 13 }}>
        {label}
      </td>
      <td style={{
        padding: "4px 0", color, fontFamily: mono ? "monospace" : undefined,
        fontSize: 13, wordBreak: "break-all",
      }}>
        {value ?? <span style={{ color: "#9ca3af" }}>—</span>}
      </td>
    </tr>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontWeight: 600, fontSize: 13, textTransform: "uppercase",
        letterSpacing: "0.05em", color: "#6b7280", marginBottom: 8,
      }}>
        {title}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default function DiagnosticsPage() {
  const [info, setInfo]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [ts, setTs]           = useState(null);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      const res = await fetch(RUNTIME_URL, { credentials: "include" });
      const ms  = Math.round(performance.now() - t0);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInfo({ ...data, _http_ms: ms });
      setTs(new Date().toISOString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  const frontOrigin = window.location.origin;
  const frontPath   = window.location.pathname;
  const frontMode   = process.env.NODE_ENV || "unknown";
  const pkgVersion  = process.env.REACT_APP_VERSION || "(not set)";

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Діагностика середовища</h2>
        <button
          className="btn btn-secondary btn-sm"
          onClick={fetchInfo}
          disabled={loading}
          style={{ marginLeft: "auto" }}
        >
          {loading ? "Оновлення..." : "Оновити"}
        </button>
      </div>

      {ts && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>
          Дані отримано: {ts}
        </div>
      )}

      {/* ── FRONTEND ─────────────────────────────── */}
      <Section title="Frontend">
        <Row label="Origin"       value={frontOrigin} />
        <Row label="Route"        value={frontPath} />
        <Row label="Mode"         value={frontMode}
             ok={frontMode === "development"} warn={frontMode === "production"} />
        <Row label="API base URL" value={API_BASE_URL || "(empty — relative)"} />
        <Row label="Version"      value={pkgVersion} />
        <Row label="Runtime URL"  value={RUNTIME_URL} />
      </Section>

      {/* ── BACKEND ──────────────────────────────── */}
      <Section title="Backend — /api/system/runtime-info">
        {error && (
          <tr>
            <td colSpan={2}>
              <div style={{
                background: "#fef2f2", border: "1px solid #fca5a5",
                borderRadius: 6, padding: "8px 12px",
                color: "#dc2626", fontSize: 13, fontFamily: "monospace",
              }}>
                ПОМИЛКА: {error}
                <div style={{ marginTop: 4, color: "#6b7280" }}>
                  Перевірте: backend запущено? Proxy до правильного порту?
                </div>
              </div>
            </td>
          </tr>
        )}
        {info && <>
          <Row label="CWD"              value={info.backend_cwd}
               ok={info.backend_cwd?.toLowerCase().includes("metricore")}
               warn={!info.backend_cwd?.toLowerCase().includes("metricore")} />
          <Row label="File root"        value={info.backend_file_root} />
          <Row label="PID"              value={String(info.pid)} />
          <Row label="Port"             value={String(info.port)} />
          <Row label="Python"           value={info.python_executable} />
          <Row label="git branch"       value={info.git_branch}
               ok={info.git_branch === "main" || info.git_branch === "master"}
               warn={info.git_branch && info.git_branch !== "main" && info.git_branch !== "master"} />
          <Row label="git commit"       value={info.git_commit} />
          <Row label="git status"       value={info.git_status_short || "(clean)"}
               warn={!!info.git_status_short} />
          <Row label=".env path"        value={info.env_file_path} />
          <Row label="DB URL"           value={info.database_url_masked} />
          <Row label="Started at"       value={info.started_at} />
          <Row label="Server time"      value={info.server_time} />
          <Row label="Latency"          value={`${info._http_ms} ms`}
               ok={info._http_ms < 100} warn={info._http_ms >= 100} />
        </>}
      </Section>

      {/* ── PROXY CHECK ──────────────────────────── */}
      <Section title="Proxy / Routing Check">
        <Row label="package.json proxy"
             value="http://localhost:8000 (React dev)"
             mono />
        <Row label="Frontend → Backend"
             value={
               error
                 ? "❌ запит не дійшов"
                 : info
                   ? `✓ OK (pid=${info.pid}  cwd=${info.backend_cwd})`
                   : loading ? "перевіряю..." : "—"
             }
             ok={!!info && !error}
             err={!!error}
             mono={false}
        />
      </Section>

      {/* ── HOW TO CHECK ─────────────────────────── */}
      <Section title="Перевірка з консолі Windows">
        <Row label="curl backend" value={`curl http://127.0.0.1:8000/api/system/runtime-info`} />
        <Row label="curl proxy"   value={`curl http://localhost:8000/api/system/runtime-info`} />
        <Row label="curl fe-proxy" value={`curl http://localhost:3000/api/system/runtime-info`} />
      </Section>
    </div>
  );
}
