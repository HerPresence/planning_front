import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/pnl-import`;

// ─── article mapping ──────────────────────────────────────────────────────────

export async function getArticleMappings(sourceId = null) {
  const params = sourceId != null ? { source_id: sourceId } : {};
  const res = await axios.get(`${BASE}/article-mapping`, { params });
  return res.data;
}

export async function createArticleMapping(form) {
  const data = new FormData();
  data.append("source_id", Number(form.source_id));
  data.append("source_article_id", form.source_article_id || "");
  data.append("source_article_name", form.source_article_name || "");
  data.append("article_id", Number(form.article_id));
  data.append("comment", form.comment || "");
  const res = await axios.post(`${BASE}/article-mapping`, data);
  return res.data;
}

export async function updateArticleMapping(mappingId, form) {
  const data = new FormData();
  data.append("source_id", Number(form.source_id));
  data.append("source_article_id", form.source_article_id || "");
  data.append("source_article_name", form.source_article_name || "");
  data.append("article_id", Number(form.article_id));
  data.append("comment", form.comment || "");
  data.append("is_active", form.is_active ? "true" : "false");
  const res = await axios.put(`${BASE}/article-mapping/${mappingId}`, data);
  return res.data;
}

export async function deleteArticleMapping(mappingId) {
  const res = await axios.delete(`${BASE}/article-mapping/${mappingId}`);
  return res.data;
}

// ─── department mapping ───────────────────────────────────────────────────────

export async function getDepartmentMappings(sourceId = null) {
  const params = sourceId != null ? { source_id: sourceId } : {};
  const res = await axios.get(`${BASE}/department-mapping`, { params });
  return res.data;
}

export async function createDepartmentMapping(form) {
  const data = new FormData();
  data.append("source_id", Number(form.source_id));
  data.append("external_department_code", form.external_department_code || "");
  data.append("external_department_name", form.external_department_name || "");
  data.append("internal_department_id", form.internal_department_id);
  const res = await axios.post(`${BASE}/department-mapping`, data);
  return res.data;
}

export async function updateDepartmentMapping(id, form) {
  const data = new FormData();
  data.append("source_id", Number(form.source_id));
  data.append("external_department_code", form.external_department_code || "");
  data.append("external_department_name", form.external_department_name || "");
  data.append("internal_department_id", form.internal_department_id);
  data.append("is_active", form.is_active ? "true" : "false");
  const res = await axios.put(`${BASE}/department-mapping/${id}`, data);
  return res.data;
}

export async function deleteDepartmentMapping(id) {
  const res = await axios.delete(`${BASE}/department-mapping/${id}`);
  return res.data;
}

// ─── pnl column mapping ───────────────────────────────────────────────────────

export async function getPnlColumnMapping(sourceId) {
  const res = await axios.get(`${BASE}/column-mapping/${sourceId}`);
  return res.data;
}

export async function savePnlColumnMapping(sourceId, colMap) {
  const data = new FormData();
  data.append("source_id", sourceId);
  data.append("period_col", colMap.period_col || "");
  data.append("dept_code_col", colMap.dept_code_col || "");
  data.append("dept_name_col", colMap.dept_name_col || "");
  data.append("article_code_col", colMap.article_code_col || "");
  data.append("article_name_col", colMap.article_name_col || "");
  data.append("amount_col", colMap.amount_col || "");
  data.append("comment_col", colMap.comment_col || "");
  const res = await axios.post(`${BASE}/column-mapping`, data);
  return res.data;
}

// ─── import runner ────────────────────────────────────────────────────────────

export async function previewSource(formData) {
  const res = await axios.post(`${BASE}/preview`, formData);
  return res.data;
}

export async function validateImport(formData) {
  const res = await axios.post(`${BASE}/validate`, formData);
  return res.data;
}

export async function commitImport(formData) {
  const res = await axios.post(`${BASE}/commit`, formData);
  return res.data;
}
