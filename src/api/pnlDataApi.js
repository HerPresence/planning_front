import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/pnl`;

// ── GET (with filters) ─────────────────────────────────────────────────────────
// Both return { total_count, total_amount, page, page_size, items: [...] }

export async function getPlanPnL(filters = {}) {
  const params = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) params[k] = v;
  });
  const res = await axios.get(`${API_URL}/plan`, { params });
  return res.data;
}

export async function getFactPnL(filters = {}) {
  const params = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) params[k] = v;
  });
  const res = await axios.get(`${API_URL}/fact`, { params });
  return res.data;
}

// ── PLAN write ─────────────────────────────────────────────────────────────────

export async function createPlanPnL(form) {
  const data = new FormData();
  ["period","holding_name","organization_name","region_name","branch_name",
   "department_id","department_name","article_id","article_name","pnl_id",
   "scenario","version_name","amount","comment"].forEach(k => data.append(k, form[k] ?? ""));
  const res = await axios.post(`${API_URL}/plan`, data);
  return res.data;
}

export async function updatePlanPnL(planId, form) {
  const data = new FormData();
  ["period","holding_name","organization_name","region_name","branch_name",
   "department_id","department_name","article_id","article_name","pnl_id",
   "scenario","version_name","amount","comment"].forEach(k => data.append(k, form[k] ?? ""));
  const res = await axios.put(`${API_URL}/plan/${planId}`, data);
  return res.data;
}

export async function deletePlanPnL(planId) {
  const res = await axios.delete(`${API_URL}/plan/${planId}`);
  return res.data;
}

// ── EXPORT ────────────────────────────────────────────────────────────────────

export async function exportPlanPnL(filters = {}) {
  const params = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) params[k] = v;
  });
  return axios.get(`${API_URL}/export/plan`, { params, responseType: "blob" });
}

export async function exportFactPnL(filters = {}) {
  const params = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) params[k] = v;
  });
  return axios.get(`${API_URL}/export/fact`, { params, responseType: "blob" });
}

// ── FACT write ─────────────────────────────────────────────────────────────────

export async function createFactPnL(form) {
  const data = new FormData();
  ["period","holding_name","organization_name","region_name","branch_name",
   "department_id","department_name","article_id","article_name","pnl_id",
   "amount","registrar","source_name"].forEach(k => data.append(k, form[k] ?? ""));
  const res = await axios.post(`${API_URL}/fact`, data);
  return res.data;
}

export async function updateFactPnL(factId, form) {
  const data = new FormData();
  ["period","holding_name","organization_name","region_name","branch_name",
   "department_id","department_name","article_id","article_name","pnl_id",
   "amount","registrar","source_name"].forEach(k => data.append(k, form[k] ?? ""));
  const res = await axios.put(`${API_URL}/fact/${factId}`, data);
  return res.data;
}

export async function deleteFactPnL(factId) {
  const res = await axios.delete(`${API_URL}/fact/${factId}`);
  return res.data;
}
