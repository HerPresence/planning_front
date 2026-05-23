import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/brands`;

export const getBrands        = (includeInactive = false) =>
  axios.get(BASE, { params: { include_inactive: includeInactive } }).then(r => r.data);

export const createBrand      = (body) =>
  axios.post(BASE, body).then(r => r.data);

export const updateBrand      = (id, body) =>
  axios.put(`${BASE}/${id}`, body).then(r => r.data);

export const deactivateBrand  = (id) =>
  axios.delete(`${BASE}/${id}`).then(r => r.data);

export const restoreBrand     = (id) =>
  axios.patch(`${BASE}/${id}/restore`).then(r => r.data);
