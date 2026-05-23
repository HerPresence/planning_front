import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/pnl-levels`;

export const getMasterL2List = (includeInactive = false) =>
  axios
    .get(`${BASE}/level2`, { params: includeInactive ? { include_inactive: true } : {} })
    .then((r) => r.data);

export const createMasterL2 = (name) =>
  axios.post(`${BASE}/level2`, { name }).then((r) => r.data);

export const updateMasterL2 = (id, name) =>
  axios.put(`${BASE}/level2/${id}`, { name }).then((r) => r.data);

export const toggleMasterL2 = (id) =>
  axios.patch(`${BASE}/level2/${id}/toggle`).then((r) => r.data);
