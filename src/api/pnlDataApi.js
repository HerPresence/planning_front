import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/pnl`;

// PLAN PnL

export async function getPlanPnL() {
  const res = await axios.get(`${API_URL}/plan`);
  return res.data;
}

export async function createPlanPnL(form) {
  const data = new FormData();

  data.append("period", form.period);
  data.append("holding_name", form.holding_name);
  data.append("organization_name", form.organization_name);
  data.append("region_name", form.region_name);
  data.append("branch_name", form.branch_name);
  data.append("department_id", form.department_id);
  data.append("department_name", form.department_name);
  data.append("article_id", form.article_id);
  data.append("article_name", form.article_name);
  data.append("pnl_id", form.pnl_id);
  data.append("scenario", form.scenario);
  data.append("version_name", form.version_name);
  data.append("amount", form.amount);
  data.append("comment", form.comment);

  const res = await axios.post(`${API_URL}/plan`, data);
  return res.data;
}

export async function updatePlanPnL(planId, form) {
  const data = new FormData();

  data.append("period", form.period);
  data.append("holding_name", form.holding_name);
  data.append("organization_name", form.organization_name);
  data.append("region_name", form.region_name);
  data.append("branch_name", form.branch_name);
  data.append("department_id", form.department_id);
  data.append("department_name", form.department_name);
  data.append("article_id", form.article_id);
  data.append("article_name", form.article_name);
  data.append("pnl_id", form.pnl_id);
  data.append("scenario", form.scenario);
  data.append("version_name", form.version_name);
  data.append("amount", form.amount);
  data.append("comment", form.comment);

  const res = await axios.put(`${API_URL}/plan/${planId}`, data);
  return res.data;
}

export async function deletePlanPnL(planId) {
  const res = await axios.delete(`${API_URL}/plan/${planId}`);
  return res.data;
}

// FACT PnL

export async function getFactPnL() {
  const res = await axios.get(`${API_URL}/fact`);
  return res.data;
}

export async function createFactPnL(form) {
  const data = new FormData();

  data.append("period", form.period);
  data.append("holding_name", form.holding_name);
  data.append("organization_name", form.organization_name);
  data.append("region_name", form.region_name);
  data.append("branch_name", form.branch_name);
  data.append("department_id", form.department_id);
  data.append("department_name", form.department_name);
  data.append("article_id", form.article_id);
  data.append("article_name", form.article_name);
  data.append("pnl_id", form.pnl_id);
  data.append("amount", form.amount);
  data.append("registrar", form.registrar);
  data.append("source_name", form.source_name);

  const res = await axios.post(`${API_URL}/fact`, data);
  return res.data;
}

export async function updateFactPnL(factId, form) {
  const data = new FormData();

  data.append("period", form.period);
  data.append("holding_name", form.holding_name);
  data.append("organization_name", form.organization_name);
  data.append("region_name", form.region_name);
  data.append("branch_name", form.branch_name);
  data.append("department_id", form.department_id);
  data.append("department_name", form.department_name);
  data.append("article_id", form.article_id);
  data.append("article_name", form.article_name);
  data.append("pnl_id", form.pnl_id);
  data.append("amount", form.amount);
  data.append("registrar", form.registrar);
  data.append("source_name", form.source_name);

  const res = await axios.put(`${API_URL}/fact/${factId}`, data);
  return res.data;
}

export async function deleteFactPnL(factId) {
  const res = await axios.delete(`${API_URL}/fact/${factId}`);
  return res.data;
}
