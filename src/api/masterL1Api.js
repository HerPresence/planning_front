import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/pnl-levels`;

export const getMasterL1List = (level2Id = null, includeInactive = false) => {
  const params = {};
  if (level2Id) params.level2_id = level2Id;
  if (includeInactive) params.include_inactive = true;
  return axios.get(`${BASE}/level1`, { params }).then((r) => r.data);
};

export const createMasterL1 = (level2Id, name) =>
  axios.post(`${BASE}/level1`, { name, level2_id: level2Id }).then((r) => r.data);

export const updateMasterL1 = (id, name, level2Id) =>
  axios.put(`${BASE}/level1/${id}`, { name, level2_id: level2Id }).then((r) => r.data);

export const toggleMasterL1 = (id) =>
  axios.patch(`${BASE}/level1/${id}/toggle`).then((r) => r.data);
