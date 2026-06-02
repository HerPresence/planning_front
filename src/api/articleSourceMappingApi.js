import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/article-source-mapping`;

export async function getStagedArticles(params = {}) {
  const p = { ...params };
  if (!p.level1)            delete p.level1;
  if (!p.level2)            delete p.level2;
  if (!p.master_level1)     delete p.master_level1;
  if (!p.master_level2)     delete p.master_level2;
  if (!p.pnl_structure_id)  delete p.pnl_structure_id;
  const res = await axios.get(`${API_URL}/staged`, { params: p });
  return res.data;
}

export async function getMasterArticles() {
  const res = await axios.get(`${API_URL}/masters`);
  return res.data;
}

export async function getStagedCompanies(sourceId) {
  const params = sourceId ? { source_id: sourceId } : {};
  const res = await axios.get(`${API_URL}/companies`, { params });
  return res.data;
}

export async function bindStagedArticle(sourceId, sourceArticleId, masterArticleId) {
  const res = await axios.post(`${API_URL}/bind`, {
    source_id:         sourceId,
    source_article_id: sourceArticleId,
    master_article_id: masterArticleId || null,
    mapping_status:    masterArticleId ? "mapped" : "rejected",
  });
  return res.data;
}

export async function autoBindStagedArticles(sourceId) {
  const res = await axios.post(`${API_URL}/auto-bind`, {
    source_id: sourceId || null,
  });
  return res.data;
}

export async function previewAutoBindByUUID(sourceId) {
  const res = await axios.post(`${API_URL}/auto-bind-uuid-preview`, {
    source_id: sourceId || null,
  });
  return res.data;
}

export async function confirmUUIDBindings(bindings) {
  const res = await axios.post(`${API_URL}/confirm-uuid-bindings`, { bindings });
  return res.data;
}

export async function bulkFillPreview({ filters, field, value }) {
  const res = await axios.post(`${API_URL}/bulk-fill-preview`, { filters, field, value });
  return res.data;
}

export async function bulkFillApply({ filters, field, value, confirm }) {
  const res = await axios.post(`${API_URL}/bulk-fill`, { filters, field, value, confirm });
  return res.data;
}

export async function bulkCreatePreview({ filters }) {
  const res = await axios.post(`${API_URL}/bulk-create-preview`, { filters });
  return res.data;
}

export async function bulkCreateApply({ filters, confirm }) {
  const res = await axios.post(`${API_URL}/bulk-create`, { filters, confirm });
  return res.data;
}

export async function deleteBind(sourceId, sourceArticleId) {
  const res = await axios.delete(
    `${API_URL}/bind/${sourceId}/${encodeURIComponent(sourceArticleId)}`
  );
  return res.data;
}

export async function getArticleCoverage(sourceId) {
  const params = sourceId ? { source_id: sourceId } : {};
  const res = await axios.get(`${API_URL}/coverage`, { params });
  return res.data;
}
