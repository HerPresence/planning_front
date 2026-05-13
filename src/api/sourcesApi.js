import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/sources`;

export async function getSources() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createSource(form) {
  const data = new FormData();

  data.append("source_name", form.source_name);
  data.append("source_type", form.source_type);

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updateSource(oldSourceId, form) {
  const data = new FormData();

  data.append("source_name", form.source_name);
  data.append("source_type", form.source_type);
  data.append("is_active", form.is_active ? "true" : "false");

  const res = await axios.put(`${API_URL}/${oldSourceId}`, data);
  return res.data;
}

export async function deactivateSource(sourceId) {
  const res = await axios.delete(`${API_URL}/${sourceId}`);
  return res.data;
}