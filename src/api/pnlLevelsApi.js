import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/pnl-levels`;

export const getLevel2 = () =>
  axios.get(`${BASE}/level2`).then((r) => r.data);

export const createLevel2 = (name) =>
  axios.post(`${BASE}/level2`, { name }).then((r) => r.data);

export const getLevel1 = (level2Id) =>
  axios.get(`${BASE}/level1`, { params: { level2_id: level2Id } }).then((r) => r.data);

export const createLevel1 = (level2Id, name) =>
  axios.post(`${BASE}/level1`, { name, level2_id: level2Id }).then((r) => r.data);
