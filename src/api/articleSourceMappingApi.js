import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/article-source-mapping`;

export async function getStagedArticles(params = {}) {
  const res = await axios.get(`${API_URL}/staged`, { params });
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

export async function deleteBind(sourceId, sourceArticleId) {
  const res = await axios.delete(
    `${API_URL}/bind/${sourceId}/${encodeURIComponent(sourceArticleId)}`
  );
  return res.data;
}
