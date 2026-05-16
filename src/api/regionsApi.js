import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/regions`;

export async function getRegions() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createRegion(form) {
  const data = new FormData();

  data.append("region_name", form.region_name);

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updateRegion(oldRegionId, form) {
  const data = new FormData();

  data.append("region_name", form.region_name);
  data.append("is_active", form.is_active ? "true" : "false");

  const res = await axios.put(`${API_URL}/${oldRegionId}`, data);
  return res.data;
}

export async function deactivateRegion(regionId) {
  const res = await axios.delete(`${API_URL}/${regionId}`);
  return res.data;
}