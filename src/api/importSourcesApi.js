import axios from "axios";

import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/import-sources`;

export async function getImportSources() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createImportSource(form) {
  const res = await axios.post(API_URL, form);
  return res.data;
}

export async function updateImportSource(id, form) {
  const res = await axios.put(`${API_URL}/${id}`, form);
  return res.data;
}

export async function deleteImportSource(id) {
  const res = await axios.delete(`${API_URL}/${id}`);
  return res.data;
}