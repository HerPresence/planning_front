import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/admin/users`;

export const getUsers           = ()           => axios.get(BASE).then((r) => r.data);
export const createUser         = (data)       => axios.post(BASE, data).then((r) => r.data);
export const updateUser         = (id, data)   => axios.put(`${BASE}/${id}`, data).then((r) => r.data);
export const toggleUser         = (id)         => axios.patch(`${BASE}/${id}/toggle`).then((r) => r.data);
export const resetUserPassword  = (id, data)   => axios.post(`${BASE}/${id}/reset-password`, data).then((r) => r.data);
export const getUserScope       = (id)         => axios.get(`${BASE}/${id}/scope`).then((r) => r.data);
export const setUserScope       = (id, scopes) => axios.put(`${BASE}/${id}/scope`, { scopes }).then((r) => r.data);
