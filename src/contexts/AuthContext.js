import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { logoutUser } from "../api/authApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]                   = useState(null);
  const [permissions, setPermissions]                   = useState({});
  const [loading, setLoading]                           = useState(true);
  const [forceChangePassword, setForceChangePassword]   = useState(false);
  const [sessionExpired, setSessionExpired]             = useState(false);

  const setupAxiosToken = (token) => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  };

  const _clearSession = useCallback(() => {
    localStorage.removeItem("planning_token");
    setupAxiosToken(null);
    setCurrentUser(null);
    setPermissions({});
    setForceChangePassword(false);
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();  // revoke token server-side (silently ignores errors)
    _clearSession();
    setSessionExpired(false);
  }, [_clearSession]);

  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const clearSessionRef = useRef(_clearSession);
  clearSessionRef.current = _clearSession;

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await axios.get("/api/me/permissions");
      const map = {};
      res.data.forEach((p) => {
        map[p.menu_key] = { can_view: p.can_view, can_edit: p.can_edit, can_create: p.can_create };
      });
      setPermissions(map);
    } catch {
      setPermissions({});
    }
  }, []);

  const login = async (email, password) => {
    const res = await axios.post("/api/auth/login", { email, password });
    const { access_token, user, force_change_password } = res.data;
    localStorage.setItem("planning_token", access_token);
    setupAxiosToken(access_token);
    setCurrentUser(user);
    setForceChangePassword(!!force_change_password);
    setSessionExpired(false);
    await fetchPermissions();
    return res.data;
  };

  const refreshMe = useCallback(async () => {
    try {
      const res = await axios.get("/api/me");
      setCurrentUser((prev) => ({ ...prev, ...res.data }));
      setForceChangePassword(!!res.data.force_change_password);
    } catch {}
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem("planning_token");
    if (!token) {
      setLoading(false);
      return;
    }
    setupAxiosToken(token);
    axios
      .get("/api/me")
      .then((res) => {
        setCurrentUser(res.data);
        setForceChangePassword(!!res.data.force_change_password);
        return fetchPermissions();
      })
      .catch(() => {
        localStorage.removeItem("planning_token");
        setupAxiosToken(null);
      })
      .finally(() => setLoading(false));
  }, [fetchPermissions]);

  // Global 401/403 interceptor
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const url = err.config?.url || "";
        if (status === 401 && !url.includes("/api/auth/login") && !url.includes("/api/auth/logout")) {
          clearSessionRef.current();  // clear locally without calling logout API
          setSessionExpired(true);
        }
        // 403 — let each page handle it; just bubble the error
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, []);

  const canView = useCallback(
    (key) => {
      if (!currentUser) return false;
      if (currentUser.is_admin) return true;
      const p = permissions[key];
      return (p?.can_view || p?.can_edit) ?? false;
    },
    [currentUser, permissions]
  );

  const canEdit = useCallback(
    (key) => {
      if (!currentUser) return false;
      if (currentUser.is_admin) return true;
      return permissions[key]?.can_edit ?? false;
    },
    [currentUser, permissions]
  );

  const canCreate = useCallback(
    (key) => {
      if (!currentUser) return false;
      if (currentUser.is_admin) return true;
      const p = permissions[key];
      return (p?.can_create || p?.can_edit) ?? false;
    },
    [currentUser, permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser, permissions, loading,
        forceChangePassword, setForceChangePassword,
        sessionExpired,
        login, logout, refreshMe,
        canView, canEdit, canCreate, fetchPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
