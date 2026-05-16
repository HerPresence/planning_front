import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/import-articles`;

export async function previewArticlesFromSource(sourceId) {
  const res = await axios.post(`${API_URL}/${sourceId}/preview`);
  return res.data;
}

export async function saveArticleMappingForSource(sourceId, mapping) {
  const res = await axios.post(`${API_URL}/${sourceId}/save-mapping`, mapping);
  return res.data;
}

export async function importArticlesFromSource(sourceId, mapping = {}) {
  const res = await axios.post(`${API_URL}/${sourceId}`, mapping);
  return res.data;
}
