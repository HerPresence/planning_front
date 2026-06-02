import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/user-preferences`;

export const getTablePreferences = (pageKey) =>
  axios.get(`${BASE}/table`, { params: { page_key: pageKey } }).then(r => r.data);

export const saveTablePreferences = (pageKey, data) =>
  axios.post(`${BASE}/table`, { page_key: pageKey, ...data }).then(r => r.data);
